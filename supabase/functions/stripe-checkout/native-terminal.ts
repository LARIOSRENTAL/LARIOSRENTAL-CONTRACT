import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const env = (name: string) => (Deno.env.get(name) || "").trim();
const cors = {"Access-Control-Allow-Origin":"https://lariosrental.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:cors});
async function stripe(path: string, body?: URLSearchParams, key?: string) {
 const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env('STRIPE_SECRET_KEY'),'Stripe-Version':env('STRIPE_API_VERSION')||'2026-08-26.dahlia',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body});
 const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Stripe no pudo completar la operación');return d;
}
// Keep background reconciliation subscribed even when the app closes during confirmation.
// The URL is server-owned; callers cannot change the endpoint or its existing events.
let webhookReady: Promise<void>|null=null;
export async function ensureNativeWebhook(){
 if(webhookReady)return webhookReady;
 webhookReady=(async()=>{
  const target=env('SUPABASE_URL').replace(/\/$/,'')+'/functions/v1/stripe-webhook';
  const endpoints=await stripe('webhook_endpoints?limit=100');
  const matches=(endpoints.data||[]).filter((e:any)=>String(e.url||'').replace(/\/$/,'')===target&&e.status==='enabled');
  if(!matches.length)throw Error('No se encontró el webhook activo de Larios Rental en Stripe. Revisa la configuración antes de cobrar.');
  const required=['payment_intent.succeeded','payment_intent.amount_capturable_updated','payment_intent.canceled','payment_intent.payment_failed'];
  for(const endpoint of matches){const events=endpoint.enabled_events||[];if(events.includes('*')||required.every(e=>events.includes(e)))continue;
   const params=new URLSearchParams();[...new Set([...events,...required])].forEach((event:string,index:number)=>params.set('enabled_events['+index+']',event));
   await stripe('webhook_endpoints/'+encodeURIComponent(endpoint.id),params);
  }
 })().catch(error=>{webhookReady=null;throw error});return webhookReady;
}
const objectId=(value: any)=>typeof value==='string'?value:value?.id;
export async function reconcileNativePayment(db: any, intentId: string) {
 const {data:payment,error}=await db.from('stripe_payments').select('*').eq('payment_intent_id',intentId).maybeSingle();
 if(error||!payment||payment.checkout_session_id!=='tap:'+intentId)throw new Error('No se encontró el cobro Tap to Pay de este contrato');
 const pi=await stripe('payment_intents/'+encodeURIComponent(intentId)+'?expand[]=latest_charge');
 if(pi.metadata?.contract_id!==payment.contract_id||pi.metadata?.channel!=='tap_to_pay'||pi.currency!=='eur'||pi.amount!==payment.amount_cents||pi.livemode!==payment.livemode)throw new Error('La referencia o el importe de Stripe no corresponde al contrato');
 if(pi.status!=='succeeded')return {paid:false,status:pi.status,payment_intent_id:pi.id,contract_id:payment.contract_id};
 const ch=pi.latest_charge;
 if(!ch?.paid||!ch.captured||ch.status!=='succeeded'||ch.amount_captured!==payment.amount_cents||pi.amount_received!==payment.amount_cents||ch.refunded||ch.amount_refunded>0||ch.disputed)throw new Error('El cobro no está confirmado o ha sido devuelto');
 const {error:completeError}=await db.rpc('complete_native_stripe_payment',{p_contract_id:payment.contract_id,p_payment_intent_id:pi.id,p_amount_cents:payment.amount_cents});
 if(completeError)throw new Error(completeError.message);
 let reusable=false,cardWarning=null;
 const present=ch.payment_method_details?.card_present;
 const card={brand:present?.brand||null,last4:present?.last4||null};
 // NFC wallet and card_present tokens themselves are not reusable. Only a generated
 // online card attached by Stripe, with off-session consent, can be stored here.
 const methodId=present?.generated_card,customer=objectId(pi.customer);
 if(pi.setup_future_usage==='off_session'&&/^pm_[A-Za-z0-9]+$/.test(methodId||'')&&/^cus_[A-Za-z0-9]+$/.test(customer||'')){
  try{const method=await stripe('payment_methods/'+methodId);if(method.type!=='card'||objectId(method.customer)!==customer)throw Error('Tarjeta no asociada al cliente');
   const {error:cardError}=await db.rpc('save_external_stripe_card',{p_contract_id:payment.contract_id,p_actor_id:payment.created_by,p_stripe_customer_id:customer,p_payment_method_id:method.id,p_brand:method.card.brand||'card',p_last4:method.card.last4,p_exp_month:method.card.exp_month,p_exp_year:method.card.exp_year});if(cardError)throw cardError;reusable=true;
  }catch{cardWarning='El cobro está confirmado. Falta completar el registro de la tarjeta; pulsa Comprobar cobro antes de intentar cobrar de nuevo.'}
 }
 return {paid:true,status:'paid',payment_intent_id:pi.id,contract_id:payment.contract_id,amount_cents:payment.amount_cents,reusable,card,card_warning:cardWarning};
}
export default async function nativeTerminal(req: Request) {
 try{
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!jwt)return json({error:'Inicia sesión para cobrar'},401);
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error}=await db.auth.getUser(jwt),role=auth.user?.app_metadata?.role;
  if(error||!auth.user||!['employee','admin'].includes(role))return json({error:'No autorizado'},403);
  const key=env('STRIPE_SECRET_KEY'),live=/^(sk|rk)_live_/.test(key),location=env('STRIPE_TERMINAL_LOCATION_ID');
  if(!/^(sk|rk)_(test|live)_/.test(key)||(live&&env('STRIPE_ENABLED').toLowerCase()!=='true')||!/^tml_[A-Za-z0-9_]+$/.test(location))return json({error:'Stripe Terminal no está configurado'},503);
  const body=await req.json(),action=String(body.action||'');
  if(!['native_config','native_connection_token','native_create','native_verify','native_cancel'].includes(action))return json({error:'Acción no válida'},400);
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.contract_id||''))return json({error:'Contrato no válido'},400);
  const {data:c,error:contractError}=await db.from('contracts').select('id,contract_number,total,app_payload').eq('id',body.contract_id).single();
  if(contractError||!c)return json({error:'Contrato no encontrado'},404);
  if(action==='native_config')return json({location_id:location,mode:live?'live':'test',configured:true});
  if(action==='native_connection_token'){const token=await stripe('terminal/connection_tokens',new URLSearchParams({location}));return json({secret:token.secret})}
  const {data:rows,error:rowsError}=await db.from('stripe_payments').select('*').eq('contract_id',c.id).like('checkout_session_id','tap:%').order('created_at',{ascending:false});
  if(rowsError)throw Error('No se pudieron comprobar los cobros anteriores');
  if(action==='native_verify'||action==='native_cancel'){
   const p=(rows||[]).find((x:any)=>x.payment_intent_id===body.payment_intent_id);
   if(!p)return json({error:'No se encontró este pago en el contrato'},404);
   if(role!=='admin'&&p.created_by!==auth.user.id)return json({error:'Este cobro lo inició otro empleado'},403);
   const verified=await reconcileNativePayment(db,p.payment_intent_id);
   if(action==='native_verify'||verified.paid)return json(verified);
   if(verified.status==='processing')return json({...verified,pending:true});
   if(verified.status!=='canceled')await stripe('payment_intents/'+p.payment_intent_id+'/cancel',new URLSearchParams());
   const {error:cancelError}=await db.from('stripe_payments').update({status:'failed',failure_message:'Cancelado por el usuario',updated_at:new Date().toISOString()}).eq('id',p.id);if(cancelError)throw cancelError;
   return json({canceled:true,paid:false});
  }
  if(body.consent_confirmed!==true)return json({error:'El cliente debe autorizar el cobro y el registro de la tarjeta'},400);
  const cents=Math.round(Number(c.total)*100);
  if(!Number.isSafeInteger(cents)||cents<50)return json({error:'El total debe ser al menos 0,50 €'},400);
  if(body.amount_cents!==cents)return json({error:'El total del contrato ha cambiado. Revisa el importe antes de cobrar'},409);
  for(const p of rows||[]){if(p.status==='open'){
   if(role!=='admin'&&p.created_by!==auth.user.id)return json({error:'Otro empleado tiene un cobro pendiente para este contrato'},409);
   const pi=await stripe('payment_intents/'+p.payment_intent_id);
   if(pi.status==='succeeded')return json(await reconcileNativePayment(db,pi.id));
   if(pi.status==='canceled'){await db.from('stripe_payments').update({status:'failed'}).eq('id',p.id);continue}
   if(p.amount_cents!==cents)return json({error:'Cancela el cobro anterior antes de cambiar el importe'},409);
   return json({payment_intent_id:pi.id,client_secret:pi.client_secret,amount_cents:cents,reused:true,mode:live?'live':'test'});
  }}
  if(c.app_payload?.payment_status==='paid')return json({error:'Este contrato ya figura pagado. Usa Cargo adicional si corresponde'},409);
  await ensureNativeWebhook();
  const ref='LR-'+String(c.contract_number).padStart(6,'0');
  const customer=await stripe('customers',new URLSearchParams({'metadata[contract_id]':c.id,description:'Larios Rental · '+ref}),'lr-native-customer-'+c.id);
  const params=new URLSearchParams({amount:String(cents),currency:'eur',customer:customer.id,capture_method:'automatic',setup_future_usage:'off_session',description:'Larios Rental · '+ref,'payment_method_types[0]':'card_present','metadata[contract_id]':c.id,'metadata[contract_number]':ref,'metadata[channel]':'tap_to_pay','metadata[purpose]':'rental','metadata[created_by]':auth.user.id,'metadata[card_consent]':'rental_off_session_v1'});
  // Stable per-contract attempt: simultaneous clicks/devices hit the same Stripe intent.
  const pi=await stripe('payment_intents',params,'lr-native-'+c.id+'-'+cents+'-'+(rows||[]).length);
  const {error:insertError}=await db.from('stripe_payments').insert({contract_id:c.id,checkout_session_id:'tap:'+pi.id,payment_intent_id:pi.id,amount_cents:cents,currency:'eur',status:'open',livemode:!!pi.livemode,created_by:auth.user.id});
  if(insertError){const {data:existing}=await db.from('stripe_payments').select('*').eq('payment_intent_id',pi.id).maybeSingle();if(!existing||existing.contract_id!==c.id||existing.created_by!==auth.user.id)throw Error('Ya existe otro intento de cobro. Compruébalo antes de reintentar');}
  return json({payment_intent_id:pi.id,client_secret:pi.client_secret,amount_cents:cents,mode:live?'live':'test'});
 }catch(error){return json({error:error instanceof Error?error.message:'No se pudo completar el cobro'},502)}
}

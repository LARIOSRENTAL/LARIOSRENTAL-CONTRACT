import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
// Production guarantees only. Independent from rental payments and TEST holds.
const env=n=>(Deno.env.get(n)||'').trim();
const key=()=>{const k=env('STRIPE_SECRET_KEY');return env('STRIPE_ENABLED').toLowerCase()==='true'&&/^(sk|rk)_live_/.test(k)?k:''};
const loc=()=>env('STRIPE_TERMINAL_LOCATION_ID');
const caps=()=>({environment:'production',stripe_configured:!!key(),terminal_configured:!!key()&&/^tml_[A-Za-z0-9_]+$/.test(loc()),tap_native_required:true,tap_supported:false});
const cors={'Access-Control-Allow-Origin':'https://lariosrental.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors});
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'');
const terminalStates=['captured','canceled','expired'];
function amount(n,max=99999999){if(!Number.isSafeInteger(n)||n<=0||n>max)throw Error('Importe no valido');return n}
async function stripe(path,p=null,idem=''){
 if(!key())throw Error('Falta la clave Stripe de produccion. Las claves de pruebas estan bloqueadas.');
 const r=await fetch('https://api.stripe.com/v1/'+path,{method:p?'POST':'GET',headers:{Authorization:'Bearer '+key(),'Stripe-Version':'2024-11-20.acacia',...(p?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idem?{'Idempotency-Key':idem}:{})},body:p||undefined,signal:AbortSignal.timeout(15000)});
 const d=await r.json();if(!r.ok)throw Error(d.error?.message||'Stripe no ha confirmado la operacion');if(d.livemode===false)throw Error('Respuesta de produccion bloqueada en produccion');return d;
}
function verify(pi,h){if(pi.livemode!==true||pi.capture_method!=='manual'||pi.currency!=='eur'||Number(pi.amount)!==Number(h.amount_cents)||pi.metadata?.hold_id!==h.id||pi.metadata?.contract_id!==h.contract_id||pi.metadata?.environment!=='larios_production'||pi.metadata?.purpose!=='rental_guarantee'||(h.payment_intent_id&&pi.id!==h.payment_intent_id))throw Error('La retencion no corresponde a esta garantia de pruebas');return pi}
function result(pi,h){verify(pi,h);const details=pi.latest_charge?.payment_method_details,deadline=details?.card?.capture_before||details?.card_present?.capture_before;const d={status:'pending',capture_before:deadline?new Date(deadline*1000).toISOString():null};if(pi.status==='requires_capture')Object.assign(d,{status:'authorized',authorized_cents:Number(pi.amount_capturable)});if(pi.status==='succeeded'){const c=amount(Number(pi.amount_received),Number(h.amount_cents));Object.assign(d,{status:'captured',authorized_cents:Number(h.amount_cents),captured_cents:c,released_cents:Number(h.amount_cents)-c})}if(pi.status==='canceled')Object.assign(d,{status:pi.cancellation_reason==='automatic'?'expired':'canceled',released_cents:Number(h.authorized_cents||0),captured_cents:0});return d}
function parameters(h){const p=new URLSearchParams(),meta={contract_id:h.contract_id,hold_id:h.id,environment:'larios_production',purpose:'rental_guarantee'};if(h.channel==='stripe_checkout'){
 p.set('mode','payment');p.set('locale','es');p.set('payment_method_types[0]','card');p.set('payment_intent_data[capture_method]','manual');p.set('client_reference_id',h.contract_id);
 for(const [k,v] of Object.entries(meta)){p.set(`metadata[${k}]`,v);p.set(`payment_intent_data[metadata][${k}]`,v)}
 p.set('line_items[0][quantity]','1');p.set('line_items[0][price_data][currency]','eur');p.set('line_items[0][price_data][unit_amount]',String(amount(Number(h.amount_cents))));p.set('line_items[0][price_data][product_data][name]','Garantia Larios Rental - solo retencion');
 p.set('custom_text[submit][message]','Preautorizacion de garantia. No se cobra el alquiler ni se captura esta retencion al confirmar.');
 const url='https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/?hold_return='+h.id+'&contract_id='+h.contract_id;p.set('success_url',url);p.set('cancel_url',url+'&hold_canceled=1');
 }else{p.set('amount',String(amount(Number(h.amount_cents))));p.set('currency','eur');p.set('payment_method_types[0]','card_present');p.set('capture_method','manual');p.set('description','Garantia - solo retencion');for(const [k,v] of Object.entries(meta))p.set(`metadata[${k}]`,v)}return p}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 // Public configuration only. Every data read or financial action below authenticates.
 if(req.method==='GET')return reply(caps());
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!jwt)return reply({error:'Inicia sesion'},401);
 const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:ae}=await db.auth.getUser(jwt);if(ae||!auth?.user)return reply({error:'Sesion no valida'},401);if(!['admin','employee'].includes(auth.user.app_metadata?.role))return reply({error:'No autorizado'},403);
 const b=await req.json().catch(()=>null);if(!b||b.environment!=='production')return reply({error:'Solo produccion'},400);
 const ref=h=>({hold_id:h.id,contract_id:h.contract_id});
 async function command(a,d){const {data,error}=await db.rpc('preauth_command',{p_action:a,p_data:{...d,actor_id:auth.user.id}});if(error)throw Error(error.message);return data}
 async function reader(id){if(!caps().terminal_configured||!/^tmr_[A-Za-z0-9_]+$/.test(id||''))throw Error('Falta lector o ubicacion de produccion');const r=await stripe('terminal/readers/'+id);if(r.location!==loc())throw Error('Lector fuera de la ubicacion de produccion');return r}
 async function refresh(h){
  if(h.channel==='bank'||terminalStates.includes(h.status))return h;
  if(h.session_id){const s=await stripe('checkout/sessions/'+h.session_id);if(s.livemode!==true||s.client_reference_id!==h.contract_id||s.metadata?.hold_id!==h.id)throw Error('Sesion incorrecta');if(s.payment_intent&&!h.payment_intent_id){const id=String(s.payment_intent);if(!/^pi_[A-Za-z0-9_]+$/.test(id))throw Error('Referencia Stripe no valida');h=await command('link',{...ref(h),payment_intent_id:id})}if(s.status==='expired'&&!s.payment_intent)return command('sync',{...ref(h),status:'expired',released_cents:0})}
  if(!h.payment_intent_id)return h;const pi=await stripe('payment_intents/'+h.payment_intent_id+'?expand[]=latest_charge');return command('sync',{...ref(h),...result(pi,h)});
 }
 try{
  if(b.action==='status'){
   if(!b.contract_id)return reply(caps());if(!validId(b.contract_id))throw Error('Reserva no valida');const {data:c,error}=await db.from('contracts').select('id,category').eq('id',b.contract_id).single();if(error||!c)throw Error('Reserva de produccion no encontrada');
   const {data:holds,error:e}=await db.from('preauthorizations').select('*').eq('contract_id',c.id).order('created_at',{ascending:false});if(e)throw Error(e.message);const {data:events,error:ee}=await db.from('preauthorization_events').select('event,detail,created_at').eq('contract_id',c.id).order('created_at',{ascending:false}).limit(40);if(ee)throw Error(ee.message);return reply({...caps(),category:c.category,holds,events});
  }
  if(b.action==='readers'){if(!caps().terminal_configured)throw Error('Falta la ubicacion de Terminal de produccion');const r=await stripe('terminal/readers?limit=100&location='+loc());return reply({readers:r.data.filter(x=>x.location===loc()).map(x=>({id:x.id,label:x.label,status:x.status}))})}
  if(b.action==='connection_token'){return reply({error:'Tap to Pay no habilitado en esta version'},409); /* reserved native integration */if(!caps().terminal_configured)throw Error('Falta configuracion Terminal');return reply(await stripe('terminal/connection_tokens',new URLSearchParams({location:loc()})))}
  if(b.action==='create'){
   if(b.channel==='stripe_tap')return reply({error:'Tap to Pay requiere integrar y validar la app nativa. Usa Terminal, Checkout o banco.'},409);
   if(!validId(b.contract_id)||!['stripe_checkout','stripe_terminal','stripe_tap','bank'].includes(b.channel)||b.confirmed!==true)throw Error('Confirma la preautorizacion');if(b.channel!=='bank'&&!key())throw Error('Stripe de produccion no configurado. No se ha retenido ni cobrado dinero.');
   if(b.channel==='stripe_terminal'){const r=await reader(b.reader_id);if(r.status!=='online')throw Error('Lector desconectado')}
   if(b.channel==='stripe_tap'&&!caps().terminal_configured)throw Error('Tap to Pay de produccion no configurado');
   let h=await command('begin',{contract_id:b.contract_id,category:b.category,channel:b.channel,bank_reference:b.bank_reference});if(h.channel==='bank'||h.status!=='creating')return reply({hold:await refresh(h),...caps()});
   if(h.status==='creating'&&Date.now()-Date.parse(h.created_at)>23*60*60*1000)throw Error('Preparacion antigua: verificar primero en Stripe para evitar duplicados');
   if(h.channel==='stripe_checkout'){const s=await stripe('checkout/sessions',parameters(h),'lr-prod-hold-'+h.id+'-create');if(s.livemode!==true)throw Error('Sesion no reconocida como TEST');h=await command('link',{...ref(h),session_id:s.id,checkout_url:s.url})}
   else{const pi=verify(await stripe('payment_intents',parameters(h),'lr-prod-hold-'+h.id+'-create'),h);h=await command('link',{...ref(h),payment_intent_id:pi.id,reader_id:b.reader_id||null});if(h.channel==='stripe_tap')return reply({hold:h,client_secret:pi.client_secret,...caps()})}
   return reply({hold:h,...caps()});
  }
  if(!validId(b.hold_id)||!validId(b.contract_id))throw Error('Referencia no valida');const {data:found,error}=await db.from('preauthorizations').select('*').eq('id',b.hold_id).eq('contract_id',b.contract_id).single();if(error||!found)throw Error('Preautorizacion de produccion no encontrada');let h=found;
  if(b.action==='refresh')return reply({hold:await refresh(h),...caps()});
  if(b.action==='process_terminal'){
   if(h.channel!=='stripe_terminal'||!h.payment_intent_id||b.confirmed!==true)throw Error('Retencion de Terminal no preparada');h=await refresh(h);if(h.status==='authorized')return reply({hold:h});if(h.status!=='pending')throw Error('Retencion no pendiente');const r=await reader(h.reader_id);if(r.status!=='online')throw Error('Lector desconectado');if(r.action?.status==='in_progress'&&r.action?.process_payment_intent?.payment_intent!==h.payment_intent_id)throw Error('Lector ocupado');
   if(r.action?.status!=='in_progress')await stripe('terminal/readers/'+h.reader_id+'/process_payment_intent',new URLSearchParams({payment_intent:h.payment_intent_id,'process_config[enable_customer_cancellation]':'true'}),'lr-prod-hold-'+h.id+'-process');return reply({hold:h});
  }
  if(b.action==='tap_secret'){if(h.channel!=='stripe_tap'||h.status!=='pending')throw Error('Tap to Pay no pendiente');const pi=verify(await stripe('payment_intents/'+h.payment_intent_id),h);return reply({hold:h,client_secret:pi.client_secret})}
  if(!['capture','cancel'].includes(b.action)||b.confirmed!==true)throw Error('Confirma la operacion');h=await refresh(h);if(terminalStates.includes(h.status))return reply({hold:h,already_final:true});
  if(h.status==='creating'&&!h.payment_intent_id&&!h.session_id)throw Error('Reanuda la preparacion por el mismo canal para recuperar la referencia');
  const n=b.action==='capture'?amount(b.amount_cents,Number(h.authorized_cents)):0;
  h=await command('claim',{...ref(h),command:b.action,amount_cents:n,reason:String(b.reason||'')});if(terminalStates.includes(h.status))return reply({hold:h,already_final:true});
  if(h.channel==='bank')return reply({hold:await command('sync',{...ref(h),status:b.action==='capture'?'captured':'canceled',captured_cents:n,released_cents:Number(h.amount_cents)-n}),manual_bank_confirmation:true});
  if(b.action==='capture'){
   const pi=verify(await stripe('payment_intents/'+h.payment_intent_id+'?expand[]=latest_charge'),h);if(pi.status!=='requires_capture')return reply({hold:await refresh(h),error:'Stripe no permite capturar esta retencion'},409);amount(n,Number(pi.amount_capturable));
   const done=await stripe('payment_intents/'+h.payment_intent_id+'/capture',new URLSearchParams({amount_to_capture:String(n),final_capture:'true'}),'lr-prod-hold-'+h.id+'-capture-'+n);h=await command('sync',{...ref(h),...result(done,h)});
  }else{
   if(h.session_id){let s=await stripe('checkout/sessions/'+h.session_id);if(s.livemode!==true||s.client_reference_id!==h.contract_id||s.metadata?.hold_id!==h.id)throw Error('Sesion incorrecta');if(s.status==='open')await stripe('checkout/sessions/'+h.session_id+'/expire',new URLSearchParams(),'lr-prod-hold-'+h.id+'-expire');s=await stripe('checkout/sessions/'+h.session_id);if(s.payment_intent&&!h.payment_intent_id){h=await command('link',{...ref(h),payment_intent_id:String(s.payment_intent)})}}
   if(h.reader_id){const r=await reader(h.reader_id);if(r.action?.status==='in_progress'&&r.action?.process_payment_intent?.payment_intent===h.payment_intent_id)await stripe('terminal/readers/'+h.reader_id+'/cancel_action',new URLSearchParams(),'lr-prod-hold-'+h.id+'-reader-cancel')}
   if(h.payment_intent_id){let pi=verify(await stripe('payment_intents/'+h.payment_intent_id+'?expand[]=latest_charge'),h);if(!['succeeded','canceled'].includes(pi.status))pi=await stripe('payment_intents/'+h.payment_intent_id+'/cancel',new URLSearchParams({cancellation_reason:'requested_by_customer'}),'lr-prod-hold-'+h.id+'-cancel');h=await command('sync',{...ref(h),...result(pi,h)})}
   else if(h.session_id)h=await command('sync',{...ref(h),status:'canceled',released_cents:0});else throw Error('Comprueba el estado antes de repetir');
  }
  return reply({hold:h,...caps()});
 }catch(e){return reply({error:e instanceof Error?e.message:String(e),environment:'production',confirmed:false},409)}
});

const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('supabase/functions/preauthorization/index.ts','utf8').replace(/^import[^\n]*\n/gm,'');
const bridge=fs.readFileSync('app-v84/native/tap-to-pay.js','utf8').replace(/^import[^\n]*\n/gm,'');
const id='11111111-1111-4111-8111-111111111111',hid='22222222-2222-4222-8222-222222222222';
async function backend({action='create',lost=false,wrongCustomer=false,generated=true}={}){
 let handler,hold={id:hid,contract_id:id,created_by:id,created_at:new Date().toISOString(),channel:'stripe_tap',amount_cents:60000,status:'creating'};
 let pi={id:'pi_hold',livemode:true,amount:60000,currency:'eur',capture_method:'manual',status:'requires_payment_method',setup_future_usage:'off_session',customer:'cus_hold',client_secret:'never_in_public_result',metadata:{hold_id:hid,contract_id:id,environment:'larios_production',purpose:'rental_guarantee',card_consent:'rental_off_session_v1'}};
 const requests=[],commands=[],saves=[];
 const db={auth:{getUser:async()=>({data:{user:{id,app_metadata:{role:'employee'}}}})},from(table){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:null}),single:async()=>({data:hold})}},rpc:async(name,args)=>{
  if(name==='save_external_stripe_card'){saves.push(args);return {error:null}}
  commands.push(args);if(args.p_action==='link')Object.assign(hold,args.p_data,{status:'pending'});if(args.p_action==='sync')Object.assign(hold,args.p_data);return {data:{...hold}};
 }};
 const env={SUPABASE_URL:'https://example.test',STRIPE_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_fake',STRIPE_TERMINAL_LOCATION_ID:'tml_es'};
 vm.runInNewContext(source,{Request,Response,URLSearchParams,AbortSignal,Date,console,createClient:()=>db,ensureNativeWebhook:async()=>{},Deno:{env:{get:k=>env[k]},serve:f=>handler=f},fetch:async(url,init)=>{
  requests.push({url,method:init.method,params:init.body?Object.fromEntries(init.body):{},key:init.headers['Idempotency-Key']});
  return new Response(JSON.stringify(url.endsWith('/customers')?{id:'cus_hold'}:url.includes('/payment_methods/')?{id:'pm_saved',type:'card',customer:wrongCustomer?'cus_other':'cus_hold',card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2030}}:pi));
 }});
 async function issue(action,extra={}){const r=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer staff',Origin:'https://localhost'},body:JSON.stringify({environment:'production',contract_id:id,hold_id:hid,action,channel:'stripe_tap',category:'C',confirmed:true,consent_confirmed:true,...extra})}));return{status:r.status,data:await r.json()}}
 const first=await issue('create');assert.equal(first.status,200);assert.equal(first.data.client_secret,undefined);
 const create=requests.find(x=>x.url.endsWith('/payment_intents'));assert.equal(create.params.capture_method,'manual');assert.equal(create.params.setup_future_usage,'off_session');assert.equal(create.params.customer,'cus_hold');assert.equal(create.params.amount,'60000');assert.equal(create.params['metadata[hold_id]'],hid);assert.ok(create.key);
 if(action==='create'){
  await issue('create');assert.equal(requests.filter(x=>x.url.endsWith('/payment_intents')).length,1,'Resume the same hold, never authorize twice');
  const secret=await issue('tap_secret');assert.equal(secret.data.client_secret,'never_in_public_result');assert.equal(secret.data.intent_status,'requires_payment_method');
 }
 pi={...pi,status:'requires_capture',amount_capturable:60000,latest_charge:{id:'ch_hold',payment_method_details:{card_present:{generated_card:generated?'pm_saved':null,capture_before:2000000000}}}};
 const refreshed=await issue('refresh');assert.equal(refreshed.status,200);assert.equal(refreshed.data.hold.status,'authorized');assert.equal(refreshed.data.hold.capture_before,new Date(2000000000000).toISOString());assert.equal(requests.some(x=>x.url.endsWith('/capture')),false,'NFC confirmation must not capture a guarantee');assert.equal(saves.length,generated&&!wrongCustomer?1:0);assert.equal(refreshed.data.hold.card_reusable,generated&&!wrongCustomer);
 return {pi,hold,requests,commands};
}
async function native({interrupted=false,alreadyAuthorized=false,pendingPayment=false}={}){
 const dom=new JSDOM('<body><input id="signature" value="unchanged"><input id="plate" value="1234ABC"></body>',{url:'https://localhost/',runScripts:'outside-only'}),w=dom.window,requests=[],sdk=[];let authorized=alreadyAuthorized;
 w.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true,getPlatform:()=>'android'};w.Device={getInfo:async()=>({platform:'android',osVersion:'14'})};w.registerPlugin=()=>({});w.TerminalEventsEnum={RequestedConnectionToken:'token',UnexpectedReaderDisconnect:'disconnect'};w.TerminalConnectTypes={TapToPay:'tap'};
 w.StripeTerminal={addListener:async()=>{},initialize:async()=>{},discoverReaders:async()=>({readers:[{id:'reader'}]}),connectReader:async()=>{},collectPaymentMethod:async()=>sdk.push('collect'),confirmPaymentIntent:async()=>{sdk.push('confirm');authorized=true;if(interrupted)throw Error('connection lost')},cancelCollectPaymentMethod:async()=>{}};
 w.LariosPayments={nativeContext:()=>({url:'https://example.test',key:'public',token:'staff'}),nativeStatus(){}};
 w.fetch=async(url,init)=>{const b=JSON.parse(init.body);requests.push(b);return {ok:true,json:async()=>b.action==='native_config'?{mode:'live',location_id:'tml_es'}:b.action==='tap_secret'?{hold:{contract_id:id,id:hid,payment_intent_id:'pi_hold',status:authorized?'authorized':'pending'},client_secret:authorized?undefined:'secret',intent_status:'requires_payment_method'}:b.action==='refresh'?{hold:{contract_id:id,id:hid,status:authorized?'authorized':'pending'}}:{paid:false,status:'processing'}}};
 if(pendingPayment)w.localStorage.setItem('lr_native_tap_pending',JSON.stringify({contract_id:id,payment_intent_id:'pi_payment'}));
 w.eval(bridge);
 try{const result=await w.LariosNativeStripeTerminal.authorize({contract_id:id,hold_id:hid});if(pendingPayment)assert.fail('Must not replace pending rental payment');assert.equal(result.authorized,true);assert.deepEqual(sdk,alreadyAuthorized?[]:['collect','confirm']);assert.equal(w.localStorage.getItem('lr_native_tap_pending'),null);assert.equal(requests.some(x=>x.action==='capture'||x.action==='native_create'),false);assert.equal(w.document.getElementById('signature').value,'unchanged');assert.equal(w.document.getElementById('plate').value,'1234ABC')}
  catch(e){if(!pendingPayment)throw e;assert.match(e.message,/otra operación pendiente/);assert.equal(requests.length,0)}finally{if(!pendingPayment){const none=await w.LariosNativeStripeTerminal.cancel();assert.equal(none.none,true);assert.equal(none.canceled,false,'Do not report a financial cancellation when no operation exists')}w.close()}
}
async function webhook(){
 const raw=fs.readFileSync('supabase/functions/stripe-checkout/native-hold.ts','utf8');const code=stripTypeScriptTypes(raw.replace('export async function','async function'),{mode:'transform'});const ctx={Date};vm.createContext(ctx);vm.runInContext(code,ctx);
 const hold={id:hid,contract_id:id,created_by:id,channel:'stripe_tap',payment_intent_id:'pi_hold',amount_cents:60000};const writes=[];
 const pi={id:'pi_hold',livemode:true,capture_method:'manual',currency:'eur',amount:60000,amount_capturable:60000,status:'requires_capture',metadata:{hold_id:hid,contract_id:id,purpose:'rental_guarantee',environment:'larios_production'}};
 const db={from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:hold})}},rpc:async(name,args)=>{writes.push({name,args});return{error:null}}};
 assert.equal((await ctx.reconcileNativeHold(db,'pi_hold',async()=>pi)).status,'authorized');assert.equal(writes[0].args.p_data.status,'authorized');writes.length=0;
 await assert.rejects(()=>ctx.reconcileNativeHold(db,'pi_hold',async()=>({...pi,amount:1})));assert.equal(writes.length,0);
}
(async()=>{await backend();await backend({wrongCustomer:true});await backend({generated:false});await native();await native({interrupted:true});await native({alreadyAuthorized:true});await native({pendingPayment:true});await webhook();console.log('Tap guarantees: manual capture, consent, exact amount, reusable card ownership, resume, lost connection, cross-operation lock and webhook validation: ok')})().catch(e=>{console.error(e);process.exit(1)});

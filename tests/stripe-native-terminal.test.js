const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const file=fs.readFileSync(require.resolve('../supabase/functions/stripe-checkout/native-terminal.ts'),'utf8');
const source=stripTypeScriptTypes(file.replace(/^import .*;\n/gm,'').replace('export async function','async function').replace('export default async function','async function')+'\nDeno.serve(nativeTerminal);',{mode:'transform'});
const id='11111111-1111-4111-8111-111111111111';
async function run(o={}){
 let handler;const calls=[],writes=[];
 const record={id:'row',contract_id:id,checkout_session_id:'tap:pi_native',payment_intent_id:'pi_native',amount_cents:7800,livemode:true,status:'open',created_by:'employee'};
 const pi={id:'pi_native',status:'succeeded',amount:7800,currency:'eur',amount_received:7800,livemode:true,client_secret:'never_log',metadata:{contract_id:id,channel:'tap_to_pay'},customer:'cus_native',setup_future_usage:'off_session',latest_charge:{paid:true,captured:true,status:'succeeded',amount_captured:7800,amount_refunded:0,payment_method_details:{card_present:{brand:'visa',last4:'4242',generated_card:'pm_native',...o.present}},...o.charge},...o.pi};
 const db={auth:{getUser:async()=>({data:{user:o.noUser?null:{id:o.actor||'employee',app_metadata:{role:o.role||'employee'}}}})},from(table){let data=null;return{select(){data=table==='contracts'?{id,contract_number:1,total:78,app_payload:o.payload||{}}:o.rows||[record];return this},eq(){return this},like(){return this},order(){return this},single:async()=>({data}),maybeSingle:async()=>({data:table==='stripe_payments'?record:data}),insert(value){writes.push({table,value});return Promise.resolve({error:null})},update(value){writes.push({table,value});return this},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject)}}},rpc:async(name,args)=>{writes.push({rpc:name,args});return{error:o.rpcError?{message:'database unavailable'}:null}}};
 const env={STRIPE_SECRET_KEY:'sk_live_secret',STRIPE_ENABLED:'true',STRIPE_TERMINAL_LOCATION_ID:'tml_native'};
 vm.runInNewContext(source,{Request,Response,URLSearchParams,Date,console,createClient:()=>db,Deno:{env:{get:n=>env[n]},serve:f=>handler=f},fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(url.includes('payment_methods/')?{id:'pm_native',customer:o.wrongCustomer?'cus_other':'cus_native',type:'card',card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2030}}:url.endsWith('/customers')?{id:'cus_native'}:url.endsWith('connection_tokens')?{secret:'scoped_token'}:pi))}});
 const response=await handler(new Request('https://example.test',{method:'POST',headers:o.noAuth?{}:{Authorization:'Bearer staff'},body:JSON.stringify({action:'native_verify',contract_id:id,payment_intent_id:'pi_native',...o.body})}));return{status:response.status,data:await response.json(),calls,writes};
}
(async()=>{
 assert.equal((await run({noAuth:true})).status,401);assert.equal((await run({role:'viewer'})).status,403);
 const stranger=await run({actor:'other'});assert.equal(stranger.status,403);assert.equal(stranger.calls.length,0);
 const paid=await run();assert.equal(paid.data.reusable,true);assert.equal(paid.writes[0].rpc,'complete_native_stripe_payment');assert.equal(paid.writes[1].rpc,'save_external_stripe_card');assert.ok(!JSON.stringify(paid.data).includes('never_log'));
 const wallet=await run({present:{generated_card:null}});assert.equal(wallet.data.paid,true);assert.equal(wallet.data.reusable,false);assert.equal(wallet.writes.length,1);
 const mismatch=await run({pi:{amount:7900}});assert.equal(mismatch.status,502);assert.equal(mismatch.writes.length,0);
 const refunded=await run({charge:{amount_refunded:50}});assert.equal(refunded.status,502);assert.equal(refunded.writes.length,0);
 const wrongCustomer=await run({wrongCustomer:true});assert.equal(wrongCustomer.data.paid,true);assert.equal(wrongCustomer.data.reusable,false);assert.ok(wrongCustomer.data.card_warning);
 const pending=await run({pi:{status:'processing'}});assert.equal(pending.data.paid,false);assert.equal(pending.writes.length,0);
 const cancelProcessing=await run({body:{action:'native_cancel'},pi:{status:'processing'}});assert.equal(cancelProcessing.data.pending,true);assert.equal(cancelProcessing.calls.length,1);
 const cancelPaid=await run({body:{action:'native_cancel'}});assert.equal(cancelPaid.data.paid,true);assert.equal(cancelPaid.calls.filter(c=>c.url.endsWith('/cancel')).length,0);
 const config=await run({body:{action:'native_config'}});assert.equal(config.data.location_id,'tml_native');assert.equal(config.calls.length,0);
 const consent=await run({body:{action:'native_create',amount_cents:7800}});assert.equal(consent.status,400);assert.equal(consent.calls.length,0);
 const changed=await run({body:{action:'native_create',amount_cents:7900,consent_confirmed:true}});assert.equal(changed.status,409);assert.equal(changed.calls.length,0);
 const create=await run({rows:[],body:{action:'native_create',amount_cents:7800,consent_confirmed:true}});assert.equal(create.status,200);const request=create.calls.find(c=>c.url.endsWith('/payment_intents'));assert.equal(request.init.body.get('setup_future_usage'),'off_session');assert.equal(request.init.body.get('metadata[contract_id]'),id);assert.equal(request.init.body.get('payment_method_types[0]'),'card_present');assert.match(request.init.headers['Idempotency-Key'],/^lr-native-/);assert.equal(create.writes[0].value.checkout_session_id,'tap:pi_native');
 const duplicate=await run({body:{action:'native_create',amount_cents:7800,consent_confirmed:true}});assert.equal(duplicate.data.paid,true);assert.equal(duplicate.calls.filter(c=>c.url.endsWith('/payment_intents')).length,0);
 const alreadyPaid=await run({rows:[],payload:{payment_status:'paid'},body:{action:'native_create',amount_cents:7800,consent_confirmed:true}});assert.equal(alreadyPaid.status,409);assert.equal(alreadyPaid.calls.length,0);
 console.log('Native Terminal: staff scope, amount, consent, refunds, wallet fallback, recovery and duplicate prevention: ok');
})().catch(e=>{console.error(e);process.exit(1)});

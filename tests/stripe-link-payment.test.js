const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require.resolve('../supabase/functions/stripe-checkout/external-payment.ts'),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handleExternalPayment','async function handleExternalPayment')+'\nDeno.serve(handleExternalPayment);',{mode:'transform'});
const contractId='11111111-1111-4111-8111-111111111111';
async function run(options={}){
 let handler;const calls=[],writes=[];
 const contract={id:contractId,contract_number:63200,total:78,customer_id:null,app_payload:{signature_data:'preserved'},...options.contract};
 const charge={id:'ch_test123',paid:true,captured:true,status:'succeeded',livemode:true,currency:'eur',amount_captured:7800,amount_refunded:0,created:1760000000,metadata:{},payment_method_details:{card_present:{last4:'4242',brand:'visa',...options.present}},...options.charge};
 const pi={id:'pi_test123',status:'succeeded',livemode:true,currency:'eur',amount:7800,amount_received:7800,latest_charge:charge,metadata:{},...options.pi};
 const method={id:'pm_saved123',type:'card',customer:'cus_test123',card:{last4:'4242',brand:'visa',exp_month:12,exp_year:2030},...options.method};
 const db={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'admin',app_metadata:{role:options.role||'admin'}}},error:null})},from(table){let result={data:null,error:null};return {select(){result.data=table==='contracts'?contract:table==='stripe_payments'?(options.records||[]):table==='stripe_card_setups'?(options.setup||null):options.saved||null;return this},eq(){return this},in(){return this},order(){return this},limit(){return this},single:async()=>result,maybeSingle:async()=>result,insert(value){writes.push({table,value});return Promise.resolve({error:null})},update(value){writes.push({table,value});return this},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}}},rpc:async(name,args)=>{writes.push({rpc:name,args});return {data:{already_linked:false},error:options.rpcError?{message:options.rpcError}:null}}};
 const context={Request,Response,URL,URLSearchParams,Date,console,createClient:()=>db,Deno:{env:{get:n=>({STRIPE_SECRET_KEY:'sk_live_secret',STRIPE_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'}[n])},serve:f=>handler=f},fetch:async(url,init)=>{calls.push({url,init});if(options.metadataFailure&&init.method==='POST'&&!url.endsWith('customers'))return new Response('{}',{status:500});let data=url.includes('payment_intents/')?pi:url.includes('payment_methods/')?method:url.endsWith('/customers')?{id:'cus_test123'}:url.includes('checkout/sessions/')?{mode:'setup',status:'complete',customer:'cus_test123',client_reference_id:contractId,metadata:{contract_id:contractId},setup_intent:{status:'succeeded',usage:'off_session',payment_method:method}}:url.endsWith('checkout/sessions')?{id:'cs_test123',url:'https://checkout.stripe.com/c/pay/test'}:charge;return new Response(JSON.stringify(data),{status:200})}};
 vm.runInNewContext(source,context);
 const response=await handler(new Request('https://example/stripe-link-payment',{method:'POST',headers:options.noAuth?{}:{Authorization:'Bearer user'},body:JSON.stringify({action:'link',contract_id:contractId,payment_reference:'pi_test123',confirmed:true,...options.body})}));
 return {status:response.status,data:await response.json(),calls,writes};
}
(async()=>{
 assert.equal((await run({noAuth:true})).status,401);
 const employee=await run({role:'employee'});assert.equal(employee.status,403);assert.equal(employee.calls.length,0);
 for(const input of ['https://evil.test/pi_test123','pi_test123_secret_secret','4242424242424242'])assert.equal((await run({body:{payment_reference:input}})).status,400);
 const preview=await run({body:{action:'preview',payment_reference:'https://dashboard.stripe.com/payments/pi_test123'}});assert.equal(preview.data.verified,true);assert.equal(preview.writes.length,0);
 for(const patch of [{pi:{amount_received:7700}},{pi:{status:'requires_capture'}},{charge:{amount_refunded:100}},{charge:{disputed:true}},{pi:{metadata:{contract_id:'other'}}}]){const r=await run(patch);assert.equal(r.status,409);assert.equal(r.writes.length,0)}
 assert.equal((await run({records:[{contract_id:'other'}]})).status,409);
 assert.equal((await run({rpcError:'Ese pago ya está vinculado a otro contrato'})).status,409);
 const linked=await run();assert.equal(linked.data.linked,true);assert.equal(linked.data.reusable,false);assert.equal(linked.writes[0].rpc,'link_external_stripe_payment');assert.equal(linked.calls.filter(c=>c.init.method==='POST').length,2);assert.equal(linked.calls.filter(c=>c.url.endsWith('/payment_intents')).length,0);
 const saved=await run({pi:{setup_future_usage:'off_session',customer:'cus_test123'},present:{generated_card:'pm_saved123'}});assert.equal(saved.data.reusable,true);assert.equal(saved.writes[1].rpc,'save_external_stripe_card');
 const wrongCustomer=await run({pi:{setup_future_usage:'off_session',customer:'cus_other'},present:{generated_card:'pm_saved123'}});assert.equal(wrongCustomer.data.linked,true);assert.equal(wrongCustomer.data.reusable,false);assert.ok(wrongCustomer.data.card_warning);
 const pendingMirror=await run({metadataFailure:true});assert.equal(pendingMirror.data.linked,true);assert.equal(pendingMirror.data.metadata_synced,false);
 const setup=await run({role:'employee',body:{action:'setup_create'}});assert.equal(setup.status,200);const create=setup.calls.find(c=>c.url.endsWith('checkout/sessions'));assert.equal(create.init.body.get('mode'),'setup');assert.equal(create.init.body.has('setup_intent_data[usage]'),false);assert.match(create.init.body.get('custom_text[submit][message]'),/ampliaciones, combustible/);assert.equal(create.init.body.has('line_items[0][price_data][unit_amount]'),false);
 const complete=await run({body:{action:'card_status'},setup:{id:'setup-id',checkout_session_id:'cs_test123',stripe_customer_id:'cus_test123',status:'open'}});assert.equal(complete.data.reusable,true);assert.equal(complete.writes[0].rpc,'save_external_stripe_card');
 console.log('External Stripe linking, authorization, refunds, saved-card and setup flow: ok');
})().catch(e=>{console.error(e);process.exit(1)});

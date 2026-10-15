const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app-v84/www/guarantee-panel-v1.js'),'utf8');
const target='11111111-1111-4111-8111-111111111111';
async function scenario(options={}){
 const calls=[],marked=[],alerts=[],questions=[];
 const nodes={};
 for(const id of ['lrHoldStyle','lrHoldDialog','lrHoldCaptureForm','lrHoldMessage','lrHoldSummary','lrHoldCancel','lrHoldCapture','lrHoldResume','lrHoldHistory'])nodes[id]={classList:{toggle(){}},replaceChildren(){},appendChild(){},open:false,showModal(){this.open=true}};
 const record={id:target,status:'confirmed',deposit_method:'preauthorization',deposit:400,...options.record};
 const holds=options.holds||[];
 const context=vm.createContext({console,Map,Set,URLSearchParams,URL,Date,location:{search:'',pathname:'/',hash:''},cfg:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'test'},token:'test',MutationObserver:class{observe(){}},setTimeout(){},clearTimeout(){},confirm:q=>{questions.push(q);return options.accept!==false},alert:e=>alerts.push(e),document:{getElementById:id=>nodes[id]||null,addEventListener(){},querySelectorAll:()=>[],body:{},head:{}},fetch:async(url,init={})=>{
  const body=JSON.parse(init.body||'{}');calls.push({url,body});
  if(options.failStatus&&url.includes('/preauthorization'))return{ok:false,status:503,json:async()=>({error:'No se pudo consultar la garantía'})};
  if(url.includes('/preauthorization')){assert.equal(body.action,'status','Return flow must never capture, cancel or create a hold');return{ok:true,json:async()=>({holds,stripe_configured:false})}}
  assert.ok(url.endsWith('/rpc/app_contract_record'));return{ok:true,json:async()=>record};
 }});
 context.window=context;context.addEventListener=()=>{};
 context.LariosLifecycle={confirmDeposit:async id=>marked.push(id)};
 vm.runInContext(source,context);
 const first=context.LariosGuarantees.completeReturn(target);
 if(options.double)await Promise.all([first,context.LariosGuarantees.completeReturn(target)]);else await first;
 return{calls,marked,alerts,questions,nodes};
}
(async()=>{
 for(const amount of [400,600]){
  const r=await scenario({record:{deposit:amount},double:true});assert.deepEqual(r.marked,[target]);assert.equal(r.questions.length,1);assert.match(r.questions[0],/no anula ni cobra/);assert.ok(r.questions[0].includes(amount+',00'));assert.equal(r.alerts.length,0);
 }
 assert.equal((await scenario({accept:false})).marked.length,0,'Manual confirmation is mandatory');
 for(const record of [{guarantee_flow_version:1},{guarantee_flow_version:'1'},{preauthorization_id:'known-hold'},{deposit:0},{deposit_method:'cash'},{status:'draft'},{id:'different-contract'}]){
  const r=await scenario({record});assert.equal(r.marked.length,0);assert.equal(r.questions.length,0);assert.ok(r.alerts.length);
 }
 for(const status of ['authorized','pending','creating','canceling','capturing','unknown']){
  const r=await scenario({holds:[{id:'hold',contract_id:target,status,channel:'bank',amount_cents:40000}]});assert.equal(r.marked.length,0,'Must block unsettled hold '+status);assert.equal(r.questions.length,0);
 }
 for(const status of ['canceled','captured','expired']){
  const r=await scenario({holds:[{id:'hold',contract_id:target,status,channel:'bank',amount_cents:40000}]});assert.deepEqual(r.marked,[target]);assert.equal(r.calls.filter(x=>x.url.includes('app_contract_record')).length,0);
 }
 const failed=await scenario({failStatus:true});assert.equal(failed.marked.length,0);assert.equal(failed.questions.length,0);assert.ok(failed.alerts.length);
 console.log('PASS legacy manual returns, cancellation, modern missing holds, active/settled guarantees, query failures and duplicate clicks; no financial calls');
})().catch(e=>{console.error(e);process.exitCode=1});

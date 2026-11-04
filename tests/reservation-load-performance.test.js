const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../app-v84/www',n),'utf8');
async function run(){
  for(const [file,fn,expected] of [
    ['fuel-default-v1.js','loadContracts','/rpc/app_contract_record'],
    ['generator-audit-v1.js','refreshContracts','/contracts?select=id,contract_number,status,delivered_by']
  ]){
    let request;
    const context={cfg:{supabaseUrl:'https://example.test',supabasePublishableKey:'public'},token:'session',window:{},console,
      document:{getElementById(){return null},readyState:'loading',addEventListener(){},body:{},querySelectorAll(){return[]}},
      MutationObserver:class{observe(){}},setInterval(){},setTimeout(){},
      fetch:async(url,init)=>{request={url,init};return{ok:true,json:async()=>file.startsWith('fuel')?{id:'chosen'}:[]}}};
    context.window.addEventListener=()=>{};
    let source=read(file).replace(/\}\)\(\);\s*$/,`window.testLoad=${fn};})();`);
    if(file.startsWith('fuel'))source=source.replace("currentKey=''","currentKey='chosen'");
    vm.runInNewContext(source,context);
    await context.window.testLoad();
    assert.ok(request.url.includes(expected),file+' must request only needed data');
    if(file.startsWith('fuel'))assert.equal(JSON.parse(request.init.body).p_contract_id,'chosen');
    assert.ok(!request.url.includes('app_list_contracts'));
  }
  let resolveRecords,calls=0;
  const context={currentAgendaDate:'',selectedAgendaDate:()=> '2026-11-04',cache:[],
    rpc:()=>{calls++;return new Promise(r=>resolveRecords=r)},loadCollaboratorPlaces:async()=>{},
    renderAgenda:()=>{},api:async()=>[],$:()=>null,console};
  const source=read('reservations.js');
  const start=source.indexOf('let agendaFlight=null;');
  const end=source.indexOf('\n',source.indexOf('async function refreshAgenda(date)',start));
  vm.runInNewContext(source.slice(start,end),context);
  const a=context.loadAgenda('2026-11-04'),b=context.loadAgenda('2026-11-05');
  assert.equal(calls,1,'concurrent agenda refreshes share one request');
  resolveRecords([]);await Promise.all([a,b]);
  assert.equal(context.currentAgendaDate,'2026-11-05','latest selected date wins');
  const c=context.loadAgenda('2026-11-04');assert.equal(calls,2,'subsequent refresh fetches fresh records');
  resolveRecords([]);await c;
  console.log('Reservation load performance checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});

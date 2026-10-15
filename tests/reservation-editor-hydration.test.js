const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const listeners=new Map(),frames=[],scrolls=[],fields={};
function element(id){
 const events=new Map(),classes=new Set();
 return{id,value:'',tagName:'INPUT',dataset:{},style:{},scrollTop:900,scrollLeft:0,parentElement:null,
  classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},
  addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn)},
  dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event)},
  querySelectorAll(){return[]},closest(){return null},removeAttribute(){},
  appendChild(option){this.options.push(option)}};
}
const html=element('html'),body=element('body');body.parentElement=html;
for(const id of ['reservation','home','list','reservationForm','reservationTitle','rental_price','insurance_total','franchise','contract_total','rental_days','vehicle_quantity','discount_percent','fuel_out','lrFuelOutControl','pickup_date','pickup_time','return_date','return_time'])fields[id]=element(id);
fields.reservation.parentElement=body;
fields.reservationForm.dataset.full='1';
fields.lrFuelOutControl.querySelector=()=>({querySelectorAll:()=>[]});
const options=['','A','B','50cc','125cc','BICICLETA','E-BIKE'].map(value=>({value,textContent:value}));
const select=fields.vehicle_group=element('vehicle_group');select.tagName='SELECT';select.options=options;
let selected='';Object.defineProperty(select,'value',{get:()=>selected,set:value=>{selected=select.options.some(o=>o.value===String(value))?String(value):''}});
const pricing=[{category:'125cc',day_1:35,day_2:60,franchise:400},{category:'50cc',day_1:25,day_2:45,franchise:400},{category:'BICICLETA',pricing_type:'daily_tiers',tier_1_3_daily:15,franchise:50},{category:'Grupo B',day_1:55,day_2:90,franchise:600}];
let record;
const context=vm.createContext({console,Intl,Date,Map,Set,Number,String,Event:class{constructor(type){this.type=type}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},cfg:{supabaseUrl:'https://test.invalid',supabasePublishableKey:'test-only'},token:'test-only',setTimeout:fn=>{queueMicrotask(fn);return 1},api:async()=>pricing,fetch:async(url)=>{assert.ok(url.endsWith('/rpc/app_contract_record'));return{ok:true,json:async()=>record}},alert:message=>{throw Error(message)},document:{readyState:'loading',scrollingElement:html,getElementById:id=>fields[id]||null,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){}},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)}}});
context.window=context;context.scrollTo=options=>scrolls.push(options);context.requestAnimationFrame=fn=>{frames.push(fn)};
for(const file of ['reservations.js','scanner.js'])vm.runInContext(fs.readFileSync(path.join(root,'app-v84/www',file),'utf8'),context);
async function flush(){await new Promise(resolve=>setImmediate(resolve));while(frames.length)frames.shift()()}
(async()=>{
 context.LariosContractUX.init();await flush();
 for(const raw of ['125CC','125cc','125','M2','Grupo 125cc','50CC','M1','B1','B']){
  const expected=/125|M2/i.test(raw)?'125cc':/50|M1/i.test(raw)?'50cc':raw==='B1'?'BICICLETA':'B';
  record={id:'test-'+raw,status:'draft',vehicle_group:raw,rental_days:1,vehicle_quantity:1,rental_price:42,total:42,pickup_at:'2026-10-16T07:30:00Z',return_at:'2026-10-17T07:30:00Z'};
  for(const el of [fields.reservation,body,html])el.scrollTop=900;
  await context.LariosReservations.edit(record.id);await flush();
  assert.equal(select.value,expected,raw+' must survive ALL hydration listeners');
  assert.equal(Number(fields.rental_price.value),42,'Saved price survives '+raw);
  assert.ok(Number(fields.contract_total.value)>0,'Opening must not zero total '+raw);
  for(const el of [fields.reservation,body,html])assert.equal(el.scrollTop,0);
 }
 // Some records only provide the group through category or app_payload.
 for(const fallback of [{category:'125CC'},{app_payload:{vehicle_group:'125CC'}}]){
  record={id:'fallback-'+JSON.stringify(fallback),status:'draft',...fallback,rental_days:1,vehicle_quantity:1,rental_price:35,total:35};
  await context.LariosReservations.edit(record.id);await flush();assert.equal(select.value,'125cc');
 }
 fields.rental_days.value='2';context.LariosContractUX.recalculate();assert.equal(Number(fields.rental_price.value),60,'Changing days still calculates 125cc tariff');
 const count=scrolls.length;fields.reservation.scrollTop=777;
 context.document.dispatchEvent(new context.CustomEvent('larios:reservation-opened',{detail:{id:record.id,record}}));await flush();
 assert.equal(scrolls.length,count,'Tablet/data refresh must not force scroll to top');assert.equal(fields.reservation.scrollTop,777);
 assert.ok(scrolls.length>0);
 console.log('PASS: real edit + scanner hydration preserves 125/50 aliases, saved price and top-of-form navigation');
})().catch(e=>{console.error(e);process.exitCode=1});

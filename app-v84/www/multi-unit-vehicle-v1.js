(function(){
'use strict';
if(window.LariosMultiUnitVehicles?.version==='20261022-mixed-cycle')return;
const $=id=>document.getElementById(id);
let installed=false,renderKey='',retryTimer=null,retries=0;
const asCount=v=>Math.max(0,Math.floor(Number(v)||0));
function group(){return String($('vehicle_group')?.value||'').trim().toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-')}
function normalize(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function total(c){return asCount(c?.bicycle)+asCount(c?.ebike)}
function stripCardPan(value){
 if(Array.isArray(value))return value.map(stripCardPan);
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [key,item] of Object.entries(value)){
  if(/^(?:card_number|pan|primary_account_number)$/i.test(key))continue;
  out[key]=stripCardPan(item);
 }
 return out;
}
function parseUnits(raw){
 let u=raw;
 if(typeof u==='string'){try{u=JSON.parse(u)}catch(_){u=null}}
 if(!u||typeof u!=='object')return null;
 const bicycle=asCount(u.bicycle??u.bici??u.bicycles),ebike=asCount(u.ebike??u.e_bike??u.ebikes);
 return total({bicycle,ebike})?{bicycle,ebike}:null;
}
function modelText(c){return c.bicycle&&c.ebike?'BICICLETA · E-BIKE':c.ebike?'E-BIKE':c.bicycle?'BICICLETA':''}
function recordUnits(record){
 const x=record||window.LariosCurrentContract||{};
 const saved=parseUnits(x.vehicle_units||x.app_payload?.vehicle_units||x.app_payload?.bike_units);
 if(saved)return saved;
 const model=String(x.vehicle_model||'').toUpperCase(),g=String(x.vehicle_group||'').toUpperCase().replace(/^GRUPO\s+/,'');
 const q=Math.max(1,asCount(x.vehicle_quantity)||asCount($('vehicle_quantity')?.value)||1);
 if(/BICICLETA/.test(model)&&/E[\s-]?BIKE/.test(model))return{bicycle:1,ebike:Math.max(1,q-1)};
 if(g==='E-BIKE'||/E[\s-]?BIKE/.test(model))return{bicycle:0,ebike:q};
 if(g==='BICICLETA'||/BICICLETA|BICI/.test(model))return{bicycle:q,ebike:0};
 return null;
}
function countsFromInputs(){
 const wrap=$('lrMultiVehicleUnits');if(!wrap)return null;
 const fields=[...wrap.querySelectorAll('input[data-unit-plate]')];
 if(!fields.length)return null;
 return{bicycle:fields.filter(x=>x.dataset.unitType==='bicycle').length,ebike:fields.filter(x=>x.dataset.unitType==='ebike').length};
}
function currentValues(){
 const wrap=$('lrMultiVehicleUnits');
 return wrap?[...wrap.querySelectorAll('input[data-unit-plate]')].map(x=>normalize(x.value)):null;
}
function valuesFromHidden(raw){
 return String(raw||'').split(/[,;|/]+/).map(normalize).filter(Boolean);
}
function hideLegacy(el){el.style.display='none';const l=el.closest('label');if(l)l.style.display='none'}
function showLegacy(el){el.style.display='';const l=el.closest('label');if(l)l.style.display=''}
function syncHidden(){
 const hidden=$('vehicle_plate'),wrap=$('lrMultiVehicleUnits');if(!hidden||!wrap)return;
 const vals=[...wrap.querySelectorAll('input[data-unit-plate]')].map(x=>normalize(x.value)).filter(Boolean);
 hidden.value=vals.join(', ');
}
function ensureModel(c){
 const model=$('vehicle_model'),text=modelText(c);if(!model||!text)return;
 const old=String(model.value||'').trim().toUpperCase();
 if(!old||/^(?:BICI(?:CLETA)?|E[\s-]?BIKE|BICICLETA\s*[·+&/]\s*E[\s-]?BIKE)$/.test(old)||c.bicycle&&c.ebike){
  model.value=text;
 }
}
function renderHtml(c,existing){
 let index=0,out='';
 const add=(type,label,n)=>{for(let i=0;i<n;i++){const value=existing[index++]||'',num=i+1;out+='<label>'+label+' '+num+'<input data-unit-plate="1" data-unit-type="'+type+'" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="Número '+label.toLowerCase()+' '+num+'" value="'+value+'"></label>'}};
 add('bicycle','Bicicleta',c.bicycle);add('ebike','E-bike',c.ebike);
 return '<div class="lrMultiTitle"><b>Unidades asignadas</b><span>Una identificación por cada unidad</span></div>'+out;
}
function build(force=false,record=null){
 const plate=$('vehicle_plate'),qtyEl=$('vehicle_quantity'),model=$('vehicle_model');if(!plate||!qtyEl)return false;
 const old=$('lrMultiVehicleUnits');
 let c=recordUnits(record);
 if(!c){
  const g=group(),q=Math.max(1,asCount(qtyEl.value)||1);
  c=g==='E-BIKE'?{bicycle:0,ebike:q}:g==='BICICLETA'?{bicycle:q,ebike:0}:null;
 }
 if(!c||!total(c)){
  renderKey='';if(old)old.remove();showLegacy(plate);return true;
 }
 ensureModel(c);
 const count=total(c),sum=String(count),key=[group(),c.bicycle,c.ebike].join('|');
 if(qtyEl.value!==sum)qtyEl.value=sum;
 const live=currentValues(),hidden=valuesFromHidden(plate.value);
 const existing=live?.length?live:hidden;
 if(old&&!force&&renderKey===key){hideLegacy(plate);syncHidden();return true}
 let wrap=old;
 if(!wrap){wrap=document.createElement('div');wrap.id='lrMultiVehicleUnits';wrap.className='lrMultiVehicleUnits';const anchor=plate.closest('label')||plate;anchor.insertAdjacentElement('afterend',wrap)}
 wrap.innerHTML=renderHtml(c,existing);
 wrap.querySelectorAll('input[data-unit-plate]').forEach(inp=>{
  inp.addEventListener('input',()=>{const v=normalize(inp.value);if(inp.value!==v)inp.value=v;syncHidden()});
  inp.addEventListener('change',syncHidden);
 });
 renderKey=key;hideLegacy(plate);wrap.style.gridColumn='1 / -1';syncHidden();return true;
}
function ensureStyle(){
 if($('lrMultiVehicleStyle'))return;
 const s=document.createElement('style');s.id='lrMultiVehicleStyle';
 s.textContent='.lrMultiVehicleUnits{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px}.lrMultiVehicleUnits label{display:grid;gap:4px}.lrMultiVehicleUnits input{margin:0;background:#fff}.lrMultiTitle{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;align-items:center}.lrMultiTitle span{font-size:12px;color:#64748b}@media(max-width:600px){.lrMultiVehicleUnits{grid-template-columns:1fr}}';document.head.appendChild(s)
}
function bind(){
 ensureStyle();const g=$('vehicle_group'),q=$('vehicle_quantity');
 if(!g||!q)return false;
 if(g.dataset.lrMultiBound!=='3'){g.dataset.lrMultiBound='3';g.addEventListener('change',()=>{const n=window.LariosCurrentContract||{};n.vehicle_units=null;build(true)})}
 if(q.dataset.lrMultiBound!=='3'){q.dataset.lrMultiBound='3';['input','change'].forEach(ev=>q.addEventListener(ev,()=>{const groupValue=group(),count=Math.max(1,asCount(q.value)||1),record=window.LariosCurrentContract||{};record.vehicle_units=groupValue==='BICICLETA'?{bicycle:count,ebike:0}:groupValue==='E-BIKE'?{bicycle:0,ebike:count}:null;build(true)}))}
 build();return true
}
function saveUnitsFromForm(payload){
 const units=countsFromInputs();
 if(!units)return parseUnits(payload.vehicle_units||payload.app_payload?.vehicle_units)||recordUnits(window.LariosCurrentContract);
 return total(units)?units:null;
}
const originalFetch=window.fetch?.bind(window);
if(originalFetch){
 window.fetch=function(input,init){
  try{
   const url=typeof input==='string'?input:input?.url||'';
   if(/\/rest\/v1\/rpc\/app_save_contract(?:\?|$)/.test(url)&&init&&typeof init.body==='string'){
    const body=JSON.parse(init.body);body.p_payload=stripCardPan(body?.p_payload);const p=body?.p_payload;
    if(p&&typeof p==='object'){
     const same=p.id&&String(p.id)===String(window.LariosCurrentContractId||'');
     const section=$('reservation'),formVisible=!!section&&!section.classList.contains('hidden')&&same;
     let units=formVisible?saveUnitsFromForm(p):parseUnits(p.vehicle_units||p.app_payload?.vehicle_units);
     if(!units&&formVisible)units=recordUnits(window.LariosCurrentContract);
     if(!units&&/^(?:BICICLETA|E-BIKE)$/.test(String(p.vehicle_group||'').toUpperCase())){
      const n=Math.max(1,asCount(p.vehicle_quantity)||1);units=p.vehicle_group==='E-BIKE'?{bicycle:0,ebike:n}:{bicycle:n,ebike:0};
     }
     if(units&&total(units)){
      p.vehicle_units=units;p.vehicle_quantity=String(total(units));
      p.vehicle_model=modelText(units)||p.vehicle_model||'';
      const hidden=$('vehicle_plate');if(formVisible&&hidden)p.vehicle_plate=hidden.value;
      body.p_payload=p;init={...init,body:JSON.stringify(body)};
     }
    }
   }
  }catch(e){console.warn('No se pudieron adjuntar las unidades de bicicleta',e)}
  return originalFetch(input,init)
 }
}
function onOpened(e){const record=e.detail?.record||window.LariosCurrentContract||null;renderKey='';setTimeout(()=>{bind();build(true,record)},0);setTimeout(()=>build(true,record),250)}
function boot(){
 if(installed)return;installed=true;ensureStyle();bind();document.addEventListener('larios:reservation-opened',onOpened);
 retries=0;retryTimer=setInterval(()=>{if(bind()||++retries>=24){clearInterval(retryTimer);retryTimer=null}},250);
 setTimeout(()=>{if(retryTimer){clearInterval(retryTimer);retryTimer=null}},6500)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosMultiUnitVehicles={build,syncHidden,parseUnits,recordUnits,countsFromInputs,version:'20261022-mixed-cycle'};
})();
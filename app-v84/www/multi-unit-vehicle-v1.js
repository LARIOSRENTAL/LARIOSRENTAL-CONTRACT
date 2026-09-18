(function(){
'use strict';
const $=id=>document.getElementById(id);
let installed=false,renderKey='',retryTimer=null,retries=0;
function group(){return String($('vehicle_group')?.value||'').trim().toUpperCase()}
function isCycle(){return ['BICICLETA','E-BIKE'].includes(group())}
function qty(){return Math.max(1,Number($('vehicle_quantity')?.value||1)||1)}
function normalize(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function parseExisting(raw){
  const s=String(raw||'').toUpperCase();
  if(!s)return[];
  const g=group();
  if(g==='E-BIKE'){
    const hits=s.match(/EBIKE\s*\d+/g)||[];
    if(hits.length)return hits.map(x=>normalize(x));
  }
  return s.split(/[\s,;|/]+/).map(normalize).filter(Boolean);
}
function currentInputs(){
  const wrap=$('lrMultiVehicleUnits');
  return wrap?[...wrap.querySelectorAll('input[data-unit-plate]')].map(x=>normalize(x.value)).filter(Boolean):[];
}
function syncHidden(){
  const hidden=$('vehicle_plate'),wrap=$('lrMultiVehicleUnits');
  if(!hidden||!wrap)return;
  const values=[...wrap.querySelectorAll('input[data-unit-plate]')].map(x=>normalize(x.value)).filter(Boolean);
  const next=values.join(', ');
  if(hidden.value!==next)hidden.value=next;
}
function hideLegacyPlate(hidden){
  hidden.style.display='none';
  const lab=hidden.closest('label');
  if(lab)lab.style.display='none';
}
function showLegacyPlate(hidden){
  hidden.style.display='';
  const lab=hidden.closest('label');
  if(lab)lab.style.display='';
}
function build(force=false){
  const plate=$('vehicle_plate'),q=$('vehicle_quantity');
  if(!plate||!q)return false;
  const old=$('lrMultiVehicleUnits');
  if(!isCycle()){
    renderKey='';
    if(old)old.remove();
    showLegacyPlate(plate);
    return true;
  }
  const count=qty(),g=group();
  const live=currentInputs();
  const fromHidden=parseExisting(plate.value);
  const existing=live.length?live:fromHidden;
  const nextKey=g+'|'+count;
  if(old&&!force&&renderKey===nextKey){
    hideLegacyPlate(plate);
    syncHidden();
    return true;
  }
  let wrap=old;
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='lrMultiVehicleUnits';
    wrap.className='lrMultiVehicleUnits';
    const anchor=plate.closest('label')||plate;
    anchor.insertAdjacentElement('afterend',wrap);
  }
  const kind=g==='E-BIKE'?'E-bike':'Bicicleta';
  wrap.innerHTML='<div class="lrMultiTitle"><b>Unidades asignadas</b><span>Una identificación por cada unidad</span></div>'+Array.from({length:count},(_,i)=>{
    const value=existing[i]||'';
    const placeholder=g==='E-BIKE'?'EBIKE'+(i+1):String(i+1);
    return '<label>'+kind+' '+(i+1)+'<input data-unit-plate="1" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="'+placeholder+'" value="'+value+'"></label>';
  }).join('');
  wrap.querySelectorAll('input[data-unit-plate]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const v=normalize(inp.value);
      if(inp.value!==v)inp.value=v;
      syncHidden();
    });
    inp.addEventListener('change',syncHidden);
  });
  renderKey=nextKey;
  hideLegacyPlate(plate);
  wrap.style.gridColumn='1 / -1';
  syncHidden();
  return true;
}
function ensureStyle(){
  if($('lrMultiVehicleStyle'))return;
  const s=document.createElement('style');
  s.id='lrMultiVehicleStyle';
  s.textContent='.lrMultiVehicleUnits{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px}.lrMultiVehicleUnits label{display:grid;gap:4px}.lrMultiVehicleUnits input{margin:0;background:#fff}.lrMultiTitle{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;align-items:center}.lrMultiTitle span{font-size:12px;color:#64748b}@media(max-width:600px){.lrMultiVehicleUnits{grid-template-columns:1fr}}';
  document.head.appendChild(s);
}
function bind(){
  ensureStyle();
  const g=$('vehicle_group'),q=$('vehicle_quantity');
  if(!g||!q)return false;
  if(g.dataset.lrMultiBound!=='2'){
    g.dataset.lrMultiBound='2';
    g.addEventListener('change',()=>{renderKey='';build(true)});
  }
  if(q.dataset.lrMultiBound!=='2'){
    q.dataset.lrMultiBound='2';
    q.addEventListener('input',()=>{renderKey='';build(true)});
    q.addEventListener('change',()=>{renderKey='';build(true)});
  }
  build();
  return true;
}
function boundedRetry(){
  if(bind()||retries>=20){if(retryTimer)clearInterval(retryTimer);retryTimer=null;return}
  retries++;
}
function boot(){
  if(installed)return;
  installed=true;
  boundedRetry();
  if(!$('vehicle_group')||!$('vehicle_quantity')){
    retryTimer=setInterval(boundedRetry,250);
    setTimeout(()=>{if(retryTimer)clearInterval(retryTimer);retryTimer=null},6000);
  }
  document.addEventListener('larios:reservation-opened',()=>setTimeout(()=>{renderKey='';bind();build(true)},0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosMultiUnitVehicles={build,syncHidden,parseExisting,normalize,version:'20260918-v2-no-observer'};
})();
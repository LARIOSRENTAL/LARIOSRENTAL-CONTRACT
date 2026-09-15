(function(){
'use strict';
const $=id=>document.getElementById(id);
let installed=false;
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
  if(g==='BICICLETA'){
    const parts=s.split(/[\s,;|/]+/).map(normalize).filter(Boolean);
    if(parts.length)return parts;
  }
  return s.split(/[\s,;|/]+/).map(normalize).filter(Boolean);
}
function syncHidden(){
  const hidden=$('vehicle_plate'),wrap=$('lrMultiVehicleUnits');
  if(!hidden||!wrap)return;
  const values=[...wrap.querySelectorAll('input[data-unit-plate]')].map(x=>normalize(x.value)).filter(Boolean);
  const next=values.join(', ');
  hidden.dataset.multiSync='1';
  hidden.value=next;
  hidden.dataset.multiSync='';
}
function build(){
  const plate=$('vehicle_plate'),q=$('vehicle_quantity');if(!plate||!q)return;
  const old=document.getElementById('lrMultiVehicleUnits');
  if(!isCycle()){
    if(old)old.remove();
    plate.style.display='';
    const lab=plate.closest('label');if(lab)lab.style.display='';
    return;
  }
  const count=qty(),existing=parseExisting(plate.value);
  let wrap=old;
  if(!wrap){
    wrap=document.createElement('div');wrap.id='lrMultiVehicleUnits';wrap.className='lrMultiVehicleUnits';
    const anchor=plate.closest('label')||plate;
    anchor.insertAdjacentElement('afterend',wrap);
  }
  const kind=group()==='E-BIKE'?'E-bike':'Bicicleta';
  wrap.innerHTML='<div class="lrMultiTitle"><b>Unidades asignadas</b><span>Una identificación por cada unidad</span></div>'+Array.from({length:count},(_,i)=>`<label>${kind} ${i+1}<input data-unit-plate="1" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="${group()==='E-BIKE'?'EBIKE'+(i+1):String(i+1)}" value="${existing[i]||''}"></label>`).join('');
  wrap.querySelectorAll('input[data-unit-plate]').forEach(inp=>{
    inp.addEventListener('input',()=>{const v=normalize(inp.value);if(inp.value!==v)inp.value=v;syncHidden()});
    inp.addEventListener('change',syncHidden);
  });
  plate.style.display='none';
  const lab=plate.closest('label');if(lab){lab.style.display='none';wrap.style.gridColumn='1 / -1'}
  syncHidden();
}
function ensureStyle(){if(document.getElementById('lrMultiVehicleStyle'))return;const s=document.createElement('style');s.id='lrMultiVehicleStyle';s.textContent='.lrMultiVehicleUnits{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px}.lrMultiVehicleUnits label{display:grid;gap:4px}.lrMultiVehicleUnits input{margin:0;background:#fff}.lrMultiTitle{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;align-items:center}.lrMultiTitle span{font-size:12px;color:#64748b}@media(max-width:600px){.lrMultiVehicleUnits{grid-template-columns:1fr}}';document.head.appendChild(s)}
function bind(){
  ensureStyle();
  const g=$('vehicle_group'),q=$('vehicle_quantity');
  if(g&&g.dataset.lrMultiBound!=='1'){g.dataset.lrMultiBound='1';g.addEventListener('change',()=>setTimeout(build,0))}
  if(q&&q.dataset.lrMultiBound!=='1'){q.dataset.lrMultiBound='1';q.addEventListener('input',()=>setTimeout(build,0));q.addEventListener('change',()=>setTimeout(build,0))}
  build();
}
function boot(){if(installed)return;installed=true;bind();new MutationObserver(bind).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosMultiUnitVehicles={build,syncHidden,parseExisting,normalize,version:'20260915-v1'};
})();
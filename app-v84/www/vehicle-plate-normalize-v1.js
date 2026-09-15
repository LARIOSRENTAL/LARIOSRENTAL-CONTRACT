(function(){
'use strict';
const normalize=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function isMulti(el){const g=String(document.getElementById('vehicle_group')?.value||'').toUpperCase();return el?.id==='vehicle_plate'&&['BICICLETA','E-BIKE'].includes(g)}
function normalizeMulti(v){return String(v||'').toUpperCase().split(/[\s,;|/]+/).map(normalize).filter(Boolean).join(', ')}
function bind(el){
  if(!el||el.dataset.lrPlateNormalize==='1')return;
  el.dataset.lrPlateNormalize='1';
  el.autocapitalize='characters';
  el.autocomplete='off';
  el.spellcheck=false;
  el.addEventListener('input',()=>{
    if(el.dataset.multiSync==='1')return;
    const next=isMulti(el)?normalizeMulti(el.value):normalize(el.value);
    if(el.value!==next)el.value=next;
  });
  el.addEventListener('paste',()=>setTimeout(()=>{el.value=isMulti(el)?normalizeMulti(el.value):normalize(el.value)},0));
  if(el.value)el.value=isMulti(el)?normalizeMulti(el.value):normalize(el.value);
}
function scan(){
  bind(document.getElementById('lrVmPlate'));
  bind(document.getElementById('vehicle_plate'));
}
function boot(){
  scan();
  new MutationObserver(scan).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('focusin',e=>{if(e.target?.id==='lrVmPlate'||e.target?.id==='vehicle_plate')bind(e.target)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosVehiclePlateNormalize={normalize,normalizeMulti,scan,version:'20260915-v2'};
})();
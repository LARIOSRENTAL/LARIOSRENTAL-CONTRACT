(function(){
'use strict';
const normalize=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function bind(el){
  if(!el||el.dataset.lrPlateNormalize==='1')return;
  el.dataset.lrPlateNormalize='1';
  el.autocapitalize='characters';
  el.autocomplete='off';
  el.spellcheck=false;
  el.addEventListener('input',()=>{
    const next=normalize(el.value);
    if(el.value!==next)el.value=next;
  });
  el.addEventListener('paste',()=>setTimeout(()=>{el.value=normalize(el.value)},0));
  if(el.value)el.value=normalize(el.value);
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
window.LariosVehiclePlateNormalize={normalize,scan,version:'20260914-v1'};
})();

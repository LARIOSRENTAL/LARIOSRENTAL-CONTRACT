(function(){
'use strict';
const $=id=>document.getElementById(id);
const bicycleGroup=()=>String($('vehicle_group')?.value||'').trim().toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-');
function sync(){
  const group=bicycleGroup(),model=$('vehicle_model');
  if(!model)return;
  if(group==='BICICLETA'||group==='E-BIKE'){
    if(model.value!==group){
      model.value=group;
      model.dispatchEvent(new Event('input',{bubbles:true}));
    }
    model.readOnly=true;
    model.dataset.lrBicycleDefault='1';
    return;
  }
  if(model.dataset.lrBicycleDefault==='1'){
    if(model.value==='BICICLETA'||model.value==='E-BIKE')model.value='';
    model.readOnly=false;
    delete model.dataset.lrBicycleDefault;
  }
}
function bind(){
  const group=$('vehicle_group');
  if(group&&group.dataset.lrBicycleModelBound!=='1'){
    group.dataset.lrBicycleModelBound='1';
    group.addEventListener('change',sync);
    group.addEventListener('input',sync);
  }
  sync();
}
function start(){
  const form=$('reservationForm'),section=$('reservation');
  if(form)new MutationObserver(()=>setTimeout(bind,0)).observe(form,{childList:true,subtree:true});
  if(section)new MutationObserver(bind).observe(section,{attributes:true,attributeFilter:['class']});
  document.addEventListener('larios:reservation-opened',()=>setTimeout(bind,0));
  bind();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
window.LariosBicycleModel={sync};
})();

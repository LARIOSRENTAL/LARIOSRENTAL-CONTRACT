(function(){
'use strict';
let fleetPromise=null,fleetCache=[];
const $=id=>document.getElementById(id);
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function set(id,value){const el=$(id);if(el)el.value=value??''}
function removeSelectors(){
  ['vehicle_select','vehicle_select_independent'].forEach(id=>{const el=$(id);if(el)el.remove()});
}
function loadFleet(){
  if(!fleetPromise){
    fleetPromise=(async()=>{
      try{
        const rows=await api('vehicles?select=id,registration,make,model,status,category,fuel_type&order=registration');
        fleetCache=Array.isArray(rows)?rows:[];
      }catch(e){console.warn('No se pudo precargar la flota',e);fleetCache=[]}
      return fleetCache;
    })();
  }
  return fleetPromise;
}
function exactVehicle(value){
  const key=norm(value);if(key.length<4)return null;
  return fleetCache.find(v=>norm(v.registration)===key)||null;
}
function applyVehicle(v){
  if(!v)return false;
  set('vehicle_plate',v.registration||'');
  set('vehicle_model',[v.make,v.model].filter(Boolean).join(' ')||v.model||'');
  if(v.fuel_type)set('fuel_type',String(v.fuel_type).toUpperCase().includes('DIESEL')?'DIESEL':'GASOLINA');
  // La matrícula identifica el vehículo físico. Nunca modifica grupo reservado,
  // grupo asignado, tarifa, franquicia ni ningún cálculo económico.
  return true;
}
function matchNow(){
  const plate=$('vehicle_plate');if(!plate)return false;
  return applyVehicle(exactVehicle(plate.value));
}
async function matchAfterLoad(){await loadFleet();return matchNow()}
function bindPlate(){
  removeSelectors();
  const plate=$('vehicle_plate');if(!plate)return false;
  plate.removeAttribute('list');
  plate.setAttribute('autocomplete','off');
  plate.setAttribute('autocapitalize','characters');
  plate.setAttribute('spellcheck','false');
  if(plate.dataset.lrFastPlate==='1')return true;
  plate.dataset.lrFastPlate='1';
  // Escritura 100% local: no hace ninguna petición de red por pulsación.
  plate.addEventListener('input',()=>{matchNow()},{passive:true});
  plate.addEventListener('change',()=>{if(!matchNow())void matchAfterLoad()});
  plate.addEventListener('blur',()=>{if(!matchNow())void matchAfterLoad()});
  plate.addEventListener('focus',removeSelectors,{passive:true});
  matchNow();
  return true;
}
function install(){removeSelectors();bindPlate()}
function wrapReservations(){
  const R=window.LariosReservations;
  if(!R||R.__vehicleIndependentV2)return;
  R.__vehicleIndependentV2=true;
  if(typeof R.edit==='function'){
    const old=R.edit.bind(R);
    R.edit=function(id){const result=old(id);setTimeout(install,70);setTimeout(install,250);return result};
  }
}
function boot(){
  wrapReservations();
  setTimeout(install,350);
  const preload=()=>void loadFleet();
  if('requestIdleCallback' in window)requestIdleCallback(preload,{timeout:1800});else setTimeout(preload,900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('focus',()=>setTimeout(install,80));
window.LariosVehicleIndependent={refresh(){fleetPromise=null;fleetCache=[];void loadFleet();return install()},install,match:matchAfterLoad};
})();

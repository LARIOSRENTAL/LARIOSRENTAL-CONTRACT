(function(){
'use strict';
let fleetPromise=null,fleetCache=[];
const $=id=>document.getElementById(id);
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function set(id,value){const el=$(id);if(el)el.value=value??''}
function removeSelectors(){['vehicle_select','vehicle_select_independent'].forEach(id=>{const el=$(id);if(el)el.remove()})}
function loadFleet(){if(!fleetPromise){fleetPromise=(async()=>{try{const rows=await api('vehicles?select=id,registration,make,model,status,category,fuel_type&order=registration');fleetCache=Array.isArray(rows)?rows:[]}catch(e){console.warn('No se pudo precargar la flota',e);fleetCache=[]}return fleetCache})()}return fleetPromise}
function exactVehicle(value){const key=norm(value);if(key.length<4)return null;return fleetCache.find(v=>norm(v.registration)===key)||null}
function applyVehicle(v){if(!v)return false;set('vehicle_plate',v.registration||'');set('vehicle_model',[v.make,v.model].filter(Boolean).join(' ')||v.model||'');if(v.fuel_type)set('fuel_type',String(v.fuel_type).toUpperCase().includes('DIESEL')?'DIESEL':String(v.fuel_type).toUpperCase().includes('ELECT')?'ELECTRICO':String(v.fuel_type).toUpperCase().includes('HIBR')?'HIBRIDO':'GASOLINA');return true}
function matchNow(){const plate=$('vehicle_plate');return plate?applyVehicle(exactVehicle(plate.value)):false}
async function matchAfterLoad(){await loadFleet();return matchNow()}
function hardenPlate(){
  removeSelectors();const plate=$('vehicle_plate');if(!plate)return false;
  // iOS was treating this field as a contact/autofill field and showing the large
  // system suggestion popover seen in Safari. Use an unrecognised semantic name
  // and explicitly disable every browser autofill hint.
  plate.name='lr_vehicle_registration_manual';
  plate.removeAttribute('list');plate.removeAttribute('data-list');
  plate.setAttribute('autocomplete','new-password');
  plate.setAttribute('autocorrect','off');plate.setAttribute('autocapitalize','characters');
  plate.setAttribute('spellcheck','false');plate.setAttribute('inputmode','text');
  plate.setAttribute('enterkeyhint','next');
  if(plate.dataset.lrFastPlate==='1')return true;plate.dataset.lrFastPlate='1';
  plate.addEventListener('input',matchNow,{passive:true});
  plate.addEventListener('change',()=>{if(!matchNow())void matchAfterLoad()});
  plate.addEventListener('blur',()=>{if(!matchNow())void matchAfterLoad()});
  plate.addEventListener('focus',removeSelectors,{passive:true});
  matchNow();return true
}
function install(){removeSelectors();hardenPlate()}
function wrapReservations(){const R=window.LariosReservations;if(!R||R.__vehicleIndependentV3)return;R.__vehicleIndependentV3=true;if(typeof R.edit==='function'){const old=R.edit.bind(R);R.edit=function(id){const result=old(id);setTimeout(install,50);setTimeout(install,180);return result}}}
function boot(){wrapReservations();setTimeout(install,250);const preload=()=>void loadFleet();if('requestIdleCallback' in window)requestIdleCallback(preload,{timeout:1600});else setTimeout(preload,700)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('focus',()=>setTimeout(install,50));
window.LariosVehicleIndependent={refresh(){fleetPromise=null;fleetCache=[];void loadFleet();return install()},install,match:matchAfterLoad,applyVehicle};
})();

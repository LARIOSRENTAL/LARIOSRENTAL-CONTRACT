(function(){
'use strict';
let fleetPromise=null;
let fleet=[];
const $=id=>document.getElementById(id);
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

function legacyBlocker(){
  let el=$('vehicle_select');
  if(el&&el.dataset.lrCoreBlocker==='1')return el;
  if(el)el.remove();
  const form=$('reservationForm');
  if(!form)return null;
  el=document.createElement('select');
  el.id='vehicle_select';
  el.dataset.lrCoreBlocker='1';
  el.hidden=true;
  el.tabIndex=-1;
  el.setAttribute('aria-hidden','true');
  form.appendChild(el);
  return el;
}

function purgeSuggestions(){
  const independent=$('vehicle_select_independent');
  if(independent)independent.remove();
  document.querySelectorAll('datalist').forEach(el=>{
    const id=(el.id||'').toLowerCase();
    if(id.includes('vehicle')||id.includes('plate')||id.includes('matric'))el.remove();
  });
  legacyBlocker();
}

function loadFleetOnce(){
  if(fleetPromise)return fleetPromise;
  fleetPromise=(async()=>{
    try{
      const rows=await api('vehicles?select=registration,make,model,fuel_type&order=registration');
      fleet=Array.isArray(rows)?rows:[];
    }catch(e){
      console.warn('No se pudo precargar la flota',e);
      fleet=[];
    }
    return fleet;
  })();
  return fleetPromise;
}

function setValue(id,value){
  const el=$(id);
  if(el)el.value=value??'';
}

function applyMatch(){
  const plate=$('vehicle_plate');
  if(!plate)return false;
  const key=norm(plate.value);
  if(key.length<4)return false;
  const vehicle=fleet.find(v=>norm(v.registration)===key);
  if(!vehicle)return false;
  setValue('vehicle_model',[vehicle.make,vehicle.model].filter(Boolean).join(' '));
  if(vehicle.fuel_type){
    const fuel=String(vehicle.fuel_type).toUpperCase();
    setValue('fuel_type',fuel.includes('DIESEL')?'DIESEL':fuel.includes('ELECT')?'ELECTRICO':fuel.includes('HIBR')?'HIBRIDO':'GASOLINA');
  }
  return true;
}

function bindPlate(){
  purgeSuggestions();
  const old=$('vehicle_plate');
  if(!old)return;
  if(old.dataset.lrVehicleCore==='1')return;
  const plate=old.cloneNode(true);
  plate.removeAttribute('list');
  plate.removeAttribute('data-list');
  plate.removeAttribute('aria-autocomplete');
  plate.name='lr_vehicle_registration';
  plate.autocomplete='off';
  plate.setAttribute('autocorrect','off');
  plate.setAttribute('autocapitalize','characters');
  plate.setAttribute('spellcheck','false');
  plate.setAttribute('inputmode','text');
  plate.dataset.lrVehicleCore='1';
  old.replaceWith(plate);
  plate.addEventListener('focus',purgeSuggestions,{passive:true});
  plate.addEventListener('input',applyMatch,{passive:true});
  plate.addEventListener('change',applyMatch,{passive:true});
  plate.addEventListener('blur',applyMatch,{passive:true});
  applyMatch();
}

function install(){
  legacyBlocker();
  bindPlate();
  legacyBlocker();
}

function wrapReservations(){
  const R=window.LariosReservations;
  if(!R||R.__lrVehicleCore)return;
  R.__lrVehicleCore=true;
  if(typeof R.edit==='function'){
    const oldEdit=R.edit.bind(R);
    R.edit=function(id){
      const result=oldEdit(id);
      setTimeout(install,0);
      setTimeout(install,60);
      return result;
    };
  }
  if(typeof R.openNew==='function'){
    const oldNew=R.openNew.bind(R);
    R.openNew=function(){
      const result=oldNew();
      setTimeout(install,0);
      setTimeout(install,60);
      return result;
    };
  }
}

function boot(){
  wrapReservations();
  install();
  const preload=()=>void loadFleetOnce();
  if('requestIdleCallback' in window)requestIdleCallback(preload,{timeout:1200});
  else setTimeout(preload,400);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
window.addEventListener('pageshow',()=>setTimeout(install,0));
window.LariosVehicleCore={install,match:applyMatch,load:loadFleetOnce};
})();

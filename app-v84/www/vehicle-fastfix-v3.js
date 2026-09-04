(function(){
'use strict';
const $=id=>document.getElementById(id);
let fleet=[];let loading=null;
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function purge(){
  ['vehicle_select','vehicle_select_independent'].forEach(id=>$(id)?.remove());
  document.querySelectorAll('datalist').forEach(d=>{if(d.id&&/vehicle|plate|matric/i.test(d.id))d.remove()});
}
function hardenPlate(){
  purge();const p=$('vehicle_plate');if(!p)return;
  p.removeAttribute('list');p.removeAttribute('aria-controls');p.removeAttribute('aria-autocomplete');
  p.setAttribute('autocomplete','new-password');p.setAttribute('autocorrect','off');p.setAttribute('autocapitalize','characters');p.setAttribute('spellcheck','false');p.setAttribute('name','lr_vehicle_registration');
  if(p.dataset.fastV3)return;p.dataset.fastV3='1';
  const match=()=>{const k=norm(p.value);if(k.length<5)return;const v=fleet.find(x=>norm(x.registration)===k);if(!v)return;const m=$('vehicle_model'),f=$('fuel_type');if(m)m.value=[v.make,v.model].filter(Boolean).join(' ');if(f&&v.fuel_type)f.value=/DIESEL/i.test(v.fuel_type)?'DIESEL':/ELECT|ELÉC/i.test(v.fuel_type)?'ELECTRICO':/HIBR/i.test(v.fuel_type)?'HIBRIDO':'GASOLINA'};
  p.addEventListener('input',match,{passive:true});p.addEventListener('change',match,{passive:true});
}
function loadFleet(){if(loading)return loading;loading=(async()=>{try{const r=await api('vehicles?select=registration,make,model,fuel_type&order=registration');fleet=Array.isArray(r)?r:[]}catch(e){console.warn('fleet preload',e);fleet=[]}return fleet})();return loading}
function scannerButton(){
  const plate=$('vehicle_plate');if(!plate)return;
  const step=plate.closest('.contractStep');if(!step)return;
  const btn=[...step.querySelectorAll('button')].find(b=>/veh[ií]culo|foto|escan/i.test(b.textContent||''));
  if(btn&&btn.dataset.ocrV3!=='1'){btn.dataset.ocrV3='1';btn.onclick=function(e){e.preventDefault();if(window.LariosScanner&&typeof LariosScanner.open==='function')return LariosScanner.open('keys');alert('El escáner todavía no está disponible. Recarga la aplicación.')};}
}
function install(){hardenPlate();scannerButton();purge()}
function wrap(){const R=window.LariosReservations;if(!R||R.__fastVehicleV3)return;R.__fastVehicleV3=1;const old=R.edit.bind(R);R.edit=function(id){const r=old(id);setTimeout(install,0);setTimeout(install,180);return r}}
function boot(){wrap();install();const go=()=>void loadFleet();if(window.requestIdleCallback)requestIdleCallback(go,{timeout:1200});else setTimeout(go,600)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('pageshow',()=>setTimeout(install,0));
})();

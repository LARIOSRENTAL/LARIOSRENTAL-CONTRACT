(function(){
'use strict';
const $=id=>document.getElementById(id);let fleet=[],loading=null;
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function blocker(){
  let b=$('vehicle_select');
  if(b&&b.dataset.lrBlocker==='1')return b;
  if(b)b.remove();
  const form=$('reservationForm');if(!form)return null;
  b=document.createElement('select');b.id='vehicle_select';b.dataset.lrBlocker='1';b.setAttribute('aria-hidden','true');b.tabIndex=-1;b.style.display='none';form.appendChild(b);return b;
}
function purge(){
  const independent=$('vehicle_select_independent');if(independent)independent.remove();
  const legacy=$('vehicle_select');if(legacy&&legacy.dataset.lrBlocker!=='1')legacy.remove();
  document.querySelectorAll('datalist').forEach(d=>{if(/vehicle|plate|matric/i.test(d.id||''))d.remove()});
  blocker();
}
function fill(v){if(!v)return;const m=$('vehicle_model'),f=$('fuel_type');if(m)m.value=[v.make,v.model].filter(Boolean).join(' ');if(f&&v.fuel_type)f.value=/DIESEL/i.test(v.fuel_type)?'DIESEL':/ELECT|ELÉC/i.test(v.fuel_type)?'ELECTRICO':/HIBR/i.test(v.fuel_type)?'HIBRIDO':'GASOLINA'}
function bindFreshPlate(){
  purge();let old=$('vehicle_plate');if(!old)return;
  if(old.dataset.freshPlate==='1')return;
  const p=document.createElement('input');p.id='vehicle_plate';p.type='text';p.value=old.value||'';p.placeholder='Matrícula';p.name='lr_reg_manual_'+Date.now();p.dataset.freshPlate='1';
  p.autocomplete='off';p.setAttribute('autocorrect','off');p.setAttribute('autocapitalize','characters');p.setAttribute('spellcheck','false');p.setAttribute('inputmode','text');p.setAttribute('enterkeyhint','next');
  old.replaceWith(p);
  const match=()=>{const k=norm(p.value);if(k.length<5)return;const v=fleet.find(x=>norm(x.registration)===k);if(v)fill(v)};
  p.addEventListener('input',match,{passive:true});p.addEventListener('change',match,{passive:true});p.addEventListener('blur',match,{passive:true});
}
function loadFleet(){if(loading)return loading;loading=(async()=>{try{const r=await api('vehicles?select=registration,make,model,fuel_type&order=registration');fleet=Array.isArray(r)?r:[]}catch(e){console.warn('fleet preload',e);fleet=[]}return fleet})();return loading}
function scannerButton(){const plate=$('vehicle_plate');if(!plate)return;const step=plate.closest('.contractStep');if(!step)return;const btn=[...step.querySelectorAll('button')].find(b=>/veh[ií]culo|foto|escan/i.test(b.textContent||''));if(btn){btn.onclick=function(e){e.preventDefault();e.stopPropagation();if(window.LariosScanner&&typeof window.LariosScanner.open==='function'){window.LariosScanner.open('keys');return false}alert('El escáner OCR no está disponible en esta carga.');return false}}}
function install(){blocker();bindFreshPlate();scannerButton();blocker()}
function wrap(){const R=window.LariosReservations;if(!R||R.__fastVehicleV5)return;R.__fastVehicleV5=1;const old=R.edit.bind(R);R.edit=function(id){const r=old(id);setTimeout(install,0);setTimeout(install,80);setTimeout(install,220);return r}}
function boot(){wrap();install();const go=()=>void loadFleet();if(window.requestIdleCallback)requestIdleCallback(go,{timeout:900});else setTimeout(go,400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();window.addEventListener('pageshow',()=>setTimeout(install,0));
})();

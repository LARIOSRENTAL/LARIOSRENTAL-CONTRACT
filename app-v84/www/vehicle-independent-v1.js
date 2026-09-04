(function(){
'use strict';
let fleetPromise=null;
const $=id=>document.getElementById(id);
function set(id,value){const el=$(id);if(el)el.value=value??''}
async function loadFleet(){
  if(!fleetPromise){
    fleetPromise=(async()=>{
      try{
        const rows=await api('vehicles?select=id,registration,make,model,status,category,fuel_type&order=registration');
        return Array.isArray(rows)?rows:[];
      }catch(e){console.warn('No se pudo cargar la flota independiente',e);return[]}
    })();
  }
  return fleetPromise;
}
function label(v){
  const main=[v.registration,v.make,v.model].filter(Boolean).join(' · ')||'Vehículo';
  return v.status&&v.status!=='available'?main+' · '+v.status:main;
}
async function install(){
  const model=$('vehicle_model');
  if(!model)return;
  const legacy=$('vehicle_select');
  if(legacy){legacy.style.display='none';legacy.setAttribute('aria-hidden','true')}
  let sel=$('vehicle_select_independent');
  if(!sel){
    sel=document.createElement('select');
    sel.id='vehicle_select_independent';
    sel.innerHTML='<option value="">Asignar vehículo de flota · todos los grupos</option>';
    sel.dataset.independent='1';
    model.parentNode.insertBefore(sel,legacy||model);
    sel.addEventListener('change',async()=>{
      const rows=await loadFleet(),v=rows.find(x=>x.id===sel.value);
      if(!v)return;
      set('vehicle_model',[v.make,v.model].filter(Boolean).join(' ')||v.model||'');
      set('vehicle_plate',v.registration||'');
      if(v.fuel_type)set('fuel_type',String(v.fuel_type).toUpperCase().includes('DIESEL')?'DIESEL':'GASOLINA');
      // Deliberadamente NO se modifica vehicle_group, assigned_vehicle_group ni ninguna tarifa.
    });
  }
  const rows=await loadFleet();
  const currentPlate=String($('vehicle_plate')?.value||'').trim().toUpperCase();
  const currentId=sel.value;
  sel.innerHTML='<option value="">Asignar vehículo de flota · todos los grupos</option>'+rows.map(v=>'<option value="'+String(v.id)+'">'+label(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</option>').join('');
  const byPlate=rows.find(v=>String(v.registration||'').trim().toUpperCase()===currentPlate);
  if(byPlate)sel.value=byPlate.id;else if(rows.some(v=>v.id===currentId))sel.value=currentId;
}
function wrapReservations(){
  const R=window.LariosReservations;
  if(!R||R.__vehicleIndependentV1)return;
  R.__vehicleIndependentV1=true;
  if(typeof R.edit==='function'){
    const old=R.edit.bind(R);
    R.edit=function(id){const result=old(id);setTimeout(install,120);setTimeout(install,450);return result};
  }
}
function boot(){wrapReservations();setTimeout(install,500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('focus',()=>setTimeout(install,120));
window.LariosVehicleIndependent={refresh(){fleetPromise=null;return install()},install};
})();

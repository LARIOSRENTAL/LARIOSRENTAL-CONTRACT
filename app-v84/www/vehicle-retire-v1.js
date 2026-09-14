(function(){
'use strict';
let installed=false;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=minimal'}}
async function retire(id){
  if(!window.LariosAccess?.isAdmin?.())return;
  if(!id)return;
  const ok=confirm('¿Eliminar este vehículo de la flota actual?\n\nDejará de aparecer en Vehículos aunque figure en reservas o contratos antiguos. El historial de esos contratos se conservará.');
  if(!ok)return;
  try{
    const r=await fetch(cfg.supabaseUrl+'/rest/v1/vehicles?id=eq.'+encodeURIComponent(id),{
      method:'PATCH',headers:headers(),body:JSON.stringify({status:'retired',updated_at:new Date().toISOString()})
    });
    if(!r.ok)throw new Error(await r.text());
    await window.LariosVehicleManager?.reload?.();
    await window.LariosVehicleCore?.refresh?.().catch?.(()=>{});
    alert('Vehículo eliminado de la flota actual. El historial anterior se conserva.');
  }catch(e){
    console.error('Vehicle retire failed',e);
    alert('No se pudo eliminar el vehículo de la flota. '+(e?.message||''));
  }
}
function install(){
  const api=window.LariosVehicleManager;
  if(!api||installed)return false;
  installed=true;
  api.remove=retire;
  console.log('Vehicle retire override installed');
  return true;
}
if(!install()){
  let n=0;const t=setInterval(()=>{if(install()||++n>120)clearInterval(t)},100);
}
window.LariosVehicleRetire={install,retire,version:'20260914-v1'};
})();

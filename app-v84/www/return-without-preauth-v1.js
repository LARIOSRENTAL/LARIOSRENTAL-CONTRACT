(function(){
'use strict';
let installed=false;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function rowsFor(contractId){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/preauthorizations?select=id,status,channel,created_at&contract_id=eq.'+encodeURIComponent(contractId)+'&order=created_at.desc',{headers:headers()});
  if(!r.ok)throw new Error(await r.text());
  const rows=await r.json();
  return Array.isArray(rows)?rows:[];
}
function install(){
  const g=window.LariosGuarantees,l=window.LariosLifecycle;
  if(!g||!l||installed)return false;
  const original=g.completeReturn?.bind(g);
  if(typeof original!=='function')return false;
  installed=true;
  g.completeReturn=async function(contractId){
    try{
      const rows=await rowsFor(contractId);
      if(rows.length===0){
        const ok=confirm('No consta ninguna preautorización registrada para este contrato.\n\nSi el vehículo ya ha sido devuelto y no queda ninguna garantía pendiente, puedes marcarlo como recogido igualmente.\n\n¿Marcar vehículo como recogido?');
        if(!ok)return;
        await l.confirmDeposit(contractId);
        return;
      }
    }catch(e){
      console.warn('Return without preauth check failed',e);
    }
    return original(contractId);
  };
  g.__allowReturnWithoutPreauth=true;
  console.log('Return without preauthorization override installed');
  return true;
}
if(!install()){
  let n=0;const t=setInterval(()=>{if(install()||++n>160)clearInterval(t)},100);
}
window.LariosReturnWithoutPreauth={install,version:'20260915-v1'};
})();

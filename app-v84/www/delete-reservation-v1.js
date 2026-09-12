(function(){
'use strict';
const $=id=>document.getElementById(id);
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function deleteRpc(id){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_delete_reservation',{method:'POST',headers:headers(),body:JSON.stringify({p_contract_id:id})});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok)throw new Error(data?.message||data?.error||raw||'No se pudo eliminar la reserva');
  return data;
}
async function refreshAll(){
  try{await window.LariosContractPanel?.reload?.()}catch{}
  try{const d=$('agendaDate')?.value;if(d)await window.LariosReservations?.loadAgenda?.(d)}catch{}
}
async function remove(id,label){
  if(!id)return;
  const name=label||'esta reserva';
  if(!confirm('¿Eliminar definitivamente '+name+' de Larios Rental?\n\nSi ya fue enviada a Renthub, se eliminará igualmente de Larios Rental. La cancelación automática en Renthub se hará cuando Renthub nos habilite ese endpoint.'))return;
  try{
    const result=await deleteRpc(id);
    alert(result?.renthub_was_linked?'Reserva eliminada de Larios Rental. Esta reserva tenía referencia de Renthub; por ahora debes cancelarla también en Renthub si sigue activa allí.':'Reserva eliminada correctamente.');
    await refreshAll();
  }catch(e){alert('No se eliminó la reserva. '+(e?.message||String(e)))}
}
function installOverride(){
  const current=window.LariosAdminReservations||{};
  current.remove=remove;
  current.__secureDeleteV1=true;
  window.LariosAdminReservations=current;
}
function extractId(article){
  for(const el of article.querySelectorAll('[onclick]')){
    const s=el.getAttribute('onclick')||'';
    const m=s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if(m)return m[0];
  }
  return '';
}
function patchDeleteButtons(){
  installOverride();
  const body=$('lrContractPanelBody');if(!body)return;
  body.querySelectorAll('.lrCpRow').forEach(article=>{
    const badge=article.querySelector('header em')?.textContent||'';
    if(!/Contrato sin generar/i.test(badge))return;
    const id=extractId(article);if(!id)return;
    const actions=article.querySelector('.lrCpActions');if(!actions)return;
    let btn=[...actions.querySelectorAll('button')].find(b=>/Eliminar reserva cancelada/i.test(b.textContent||''));
    if(!btn){
      btn=document.createElement('button');
      btn.className='danger';
      btn.dataset.adminOnly='true';
      btn.textContent='Eliminar reserva cancelada';
      actions.appendChild(btn);
    }
    btn.disabled=false;
    const number=article.querySelector('header b')?.textContent?.trim()||'esta reserva';
    btn.onclick=()=>remove(id,number);
  });
}
installOverride();
[0,500,1200,2500].forEach(ms=>setTimeout(patchDeleteButtons,ms));
document.addEventListener('click',e=>{
  const t=e.target;
  if(t&&((t.closest&&t.closest('[onclick*="LariosContractPanel.open"]'))||(t.closest&&t.closest('#lrContractPanel'))))setTimeout(patchDeleteButtons,250);
},{passive:true});
window.addEventListener('focus',()=>setTimeout(patchDeleteButtons,250));
})();
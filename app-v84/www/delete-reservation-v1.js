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
  try{await window.LariosContractPanel?.load?.()}catch{}
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
  if(current.__secureDeleteV1)return true;
  current.remove=remove;
  current.__secureDeleteV1=true;
  window.LariosAdminReservations=current;
  return true;
}
async function ensureDraftDeleteButtons(){
  const body=$('lrContractPanelBody');if(!body)return;
  let rows=[];try{
    const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_list_contracts',{method:'POST',headers:headers(),body:'{}'});
    if(!r.ok)return;rows=await r.json();if(!Array.isArray(rows))return;
  }catch{return}
  const byNumber=new Map(rows.filter(x=>x?.status==='draft').map(x=>[String(x.contract_number||''),x]));
  body.querySelectorAll('.lrCpRow').forEach(article=>{
    if(article.dataset.deletePatchedV1==='1')return;
    const number=article.querySelector('header b')?.textContent?.trim()||'';
    const c=byNumber.get(number);if(!c)return;
    const actions=article.querySelector('.lrCpActions');if(!actions)return;
    let btn=[...actions.querySelectorAll('button')].find(b=>/Eliminar reserva cancelada/i.test(b.textContent||''));
    if(!btn){btn=document.createElement('button');btn.className='danger';btn.dataset.adminOnly='true';btn.textContent='Eliminar reserva cancelada';actions.appendChild(btn)}
    btn.disabled=false;
    btn.onclick=()=>remove(c.id,number||'esta reserva');
    article.dataset.deletePatchedV1='1';
  })
}
installOverride();
let tries=0;const t=setInterval(()=>{installOverride();ensureDraftDeleteButtons();if(++tries>30)clearInterval(t)},500);
const rootObserver=new MutationObserver(()=>{setTimeout(()=>{installOverride();ensureDraftDeleteButtons()},50)});
rootObserver.observe(document.documentElement,{childList:true,subtree:true});
})();
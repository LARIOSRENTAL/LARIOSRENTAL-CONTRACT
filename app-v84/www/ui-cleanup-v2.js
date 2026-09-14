(function(){
'use strict';
const TERMINAL_HOLD=/Preautorizaci[oó]n anulada|Cobrado y resto liberado|Autorizaci[oó]n caducada/i;
const DEPOSIT_RETURNED=/DEP[ÓO]SITO DEVUELTO/i;
function cleanGuaranteeCard(card){
  const hold=card.querySelector('.lrHoldReturn');
  if(hold){
    const status=hold.querySelector('p')?.textContent||'';
    const actions=hold.querySelector('.lrHoldActions');
    if(actions)actions.style.display=TERMINAL_HOLD.test(status)?'none':'';
  }
  const deposit=card.querySelector('.lrDepositBadge');
  if(deposit&&DEPOSIT_RETURNED.test(deposit.textContent||'')){
    card.querySelectorAll('button').forEach(btn=>{
      const t=btn.textContent||'';
      if(/dep[oó]sito|garant[ií]a|anular preautorizaci[oó]n|cargar importe preautorizado/i.test(t))btn.style.display='none';
    });
  }
}
function cleanVehicles(){
  const models=document.getElementById('lrVmModels');
  if(models)models.style.display='none';
}
function clean(){
  document.querySelectorAll('.agendaItem.rich,.lrCpRow').forEach(cleanGuaranteeCard);
  cleanVehicles();
}
function installStyle(){
  if(document.getElementById('lrUiCleanupStyle'))return;
  const s=document.createElement('style');
  s.id='lrUiCleanupStyle';
  s.textContent='#lrVmModels{display:none!important}.lrHoldReturn.lrSettled .lrHoldActions{display:none!important}';
  document.head.appendChild(s);
}
function boot(){
  installStyle();clean();
  new MutationObserver(clean).observe(document.body,{subtree:true,childList:true,characterData:true});
  window.addEventListener('larios:agenda-controls-ready',()=>setTimeout(clean,50));
  window.addEventListener('focus',clean);
  setInterval(clean,1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosUiCleanup={refresh:clean,version:'20260914-v2'};
})();

(function(){
'use strict';
if(window.LariosSafeCardPersistence)return;
const originalFetch=window.fetch.bind(window);
const $=id=>document.getElementById(id);
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
function enrichSaveRequest(input,init){
  try{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(!/\/rest\/v1\/rpc\/app_save_contract(?:\?|$)/.test(url)||!init||typeof init.body!=='string')return init;
    const body=JSON.parse(init.body);
    if(!body||!body.p_payload||typeof body.p_payload!=='object')return init;
    const card=$('card_number'),expiry=$('card_expiry');
    if(card)body.p_payload.card_number=card.value||'';
    if(expiry)body.p_payload.card_expiry=expiry.value||'';
    return {...init,body:JSON.stringify(body)};
  }catch(_){return init}
}
window.fetch=function(input,init){return originalFetch(input,enrichSaveRequest(input,init))};
async function loadRecord(id){
  if(!id||!window.cfg||!window.token)return null;
  try{
    const r=await originalFetch(cfg.supabaseUrl+'/rest/v1/rpc/app_list_contracts',{method:'POST',headers:headers(),body:'{}'});
    if(!r.ok)return null;
    const rows=await r.json();
    return Array.isArray(rows)?rows.find(x=>String(x.id)===String(id))||null:null;
  }catch(_){return null}
}
async function hydrate(id){
  const record=await loadRecord(id);if(!record)return;
  const card=$('card_number'),expiry=$('card_expiry');
  if(card)card.value=record.card_number||'';
  if(expiry)expiry.value=record.card_expiry||'';
}
let hookedEdit=null;
function hookEdit(){
  const api=window.LariosReservations,fn=api&&api.edit;
  if(!api||typeof fn!=='function'||fn===hookedEdit||fn.__lrSafeCardHook)return;
  const original=fn.bind(api);
  const wrapped=function(id){const out=original(id);setTimeout(()=>hydrate(id),80);return out};
  wrapped.__lrSafeCardHook=true;hookedEdit=wrapped;api.edit=wrapped;
}
let lastVisibleId='';
function watchForm(){
  hookEdit();
  const panel=$('reservation'),id=window.LariosCurrentContractId||'';
  if(panel&&!panel.classList.contains('hidden')&&id&&id!==lastVisibleId){lastVisibleId=String(id);setTimeout(()=>hydrate(id),120)}
  if(panel&&panel.classList.contains('hidden'))lastVisibleId='';
}
setInterval(watchForm,700);watchForm();
window.LariosSafeCardPersistence={hydrate};
})();

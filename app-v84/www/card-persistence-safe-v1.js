(function(){
'use strict';
if(window.LariosSafeCardPersistence)return;
const originalFetch=window.fetch.bind(window);
const $=id=>document.getElementById(id);
const key=id=>'lr_contract_card_'+String(id||'');
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
function normalizeCard(v){return String(v||'').replace(/\D/g,'')}
function normalizeExpiry(v){return String(v||'').trim()}
function currentId(){return String(window.LariosCurrentContractId||'')}
function read(id=currentId()){
  if(!id)return null;
  try{const x=JSON.parse(sessionStorage.getItem(key(id))||'null');return x&&normalizeCard(x.card).length>=12?x:null}catch(_){return null}
}
function remember(id=currentId()){
  if(!id)return;
  const card=$('card_number'),expiry=$('card_expiry');if(!card||!expiry)return;
  const digits=normalizeCard(card.value);
  if(digits.length<12)return;
  sessionStorage.setItem(key(id),JSON.stringify({card:card.value,expiry:expiry.value||'',savedAt:Date.now()}));
}
function clear(id=currentId()){
  if(!id)return;
  sessionStorage.removeItem(key(id));
  const card=$('card_number'),expiry=$('card_expiry');
  if(card)card.value='';
  if(expiry)expiry.value='';
}
function applySaved(id=currentId()){
  const x=read(id);if(!x)return false;
  const card=$('card_number'),expiry=$('card_expiry');
  if(card)card.value=x.card||'';
  if(expiry)expiry.value=x.expiry||'';
  return true;
}
function enrichSaveRequest(input,init){
  try{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(!/\/rest\/v1\/rpc\/app_save_contract(?:\?|$)/.test(url)||!init||typeof init.body!=='string')return init;
    const body=JSON.parse(init.body);
    if(!body||!body.p_payload||typeof body.p_payload!=='object')return init;
    const id=String(body.p_payload.id||currentId());
    remember(id);
    const saved=read(id);
    if(saved){body.p_payload.card_number=saved.card;body.p_payload.card_expiry=saved.expiry}
    else {
      const digits=normalizeCard(body.p_payload.card_number);
      if(digits.length<12){delete body.p_payload.card_number;delete body.p_payload.card_expiry}
    }
    return {...init,body:JSON.stringify(body)};
  }catch(_){return init}
}
window.fetch=function(input,init){return originalFetch(input,enrichSaveRequest(input,init))};
async function loadRecord(id){
  if(!id||!window.cfg||!window.token)return null;
  try{
    const r=await originalFetch(cfg.supabaseUrl+'/rest/v1/rpc/app_contract_record',{method:'POST',headers:headers(),body:JSON.stringify({p_contract_id:id})});
    if(!r.ok)return null;return await r.json()
  }catch(_){return null}
}
async function hydrate(id){
  const record=await loadRecord(id);if(!record)return;
  if(record.pdf_path){sessionStorage.removeItem(key(id));return}
  if(applySaved(id))return;
  const card=$('card_number'),expiry=$('card_expiry');
  if(card)card.value=record.card_number||'';
  if(expiry)expiry.value=record.card_expiry||'';
}
function bindInputs(){
  for(const id of ['card_number','card_expiry']){
    const el=$(id);if(!el||el.dataset.lrCardRemember==='1')continue;
    el.dataset.lrCardRemember='1';
    el.addEventListener('input',()=>remember());
    el.addEventListener('change',()=>remember());
  }
}
let hookedEdit=null;
function hookEdit(){
  const api=window.LariosReservations,fn=api&&api.edit;
  if(!api||typeof fn!=='function'||fn===hookedEdit||fn.__lrSafeCardHook)return;
  const original=fn.bind(api);
  const wrapped=async function(id){const out=await original(id);setTimeout(()=>hydrate(id),80);return out};
  wrapped.__lrSafeCardHook=true;hookedEdit=wrapped;api.edit=wrapped;
}
let lastVisibleId='';
function watchForm(){
  hookEdit();bindInputs();
  const panel=$('reservation'),id=currentId();
  if(panel&&!panel.classList.contains('hidden')&&id&&id!==lastVisibleId){lastVisibleId=id;setTimeout(()=>hydrate(id),120)}
  if(panel&&panel.classList.contains('hidden'))lastVisibleId='';
}
setInterval(watchForm,500);watchForm();
window.LariosSafeCardPersistence={hydrate,remember,read,applySaved,clear};
})();
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
  try{const x=JSON.parse(sessionStorage.getItem(key(id))||'null');if(x?.masked===true&&/^\d{4}$/.test(String(x.last4||'')))return x;if(x?.card)sessionStorage.removeItem(key(id));return null}catch(_){return null}
}
function paintMasked(last4,expiry=''){
  const card=$('card_number'),exp=$('card_expiry');
  if(card){card.value='•••• '+last4;card.disabled=false;card.readOnly=false;card.dataset.stripeMasked='1';if(card.dataset.lrUnlockMaskedCard!=='1'){card.dataset.lrUnlockMaskedCard='1';card.addEventListener('focus',()=>{if(card.dataset.stripeMasked==='1'){card.value='';delete card.dataset.stripeMasked}})}}
  if(expiry&&exp)exp.value=expiry;
  if(exp){exp.disabled=false;exp.readOnly=false}
}
function setStripeCard(id,cardInfo={}){
  id=String(id||currentId());const last4=String(cardInfo.last4||cardInfo.card_last4||'').replace(/\D/g,'').slice(-4);
  if(!id||!/^\d{4}$/.test(last4))return false;
  const month=String(cardInfo.exp_month||cardInfo.card_expiry_month||'').padStart(2,'0');
  const year=String(cardInfo.exp_year||cardInfo.card_expiry_year||'');
  const expiry=month!=='00'&&/^\d{4}$/.test(year)?`${month}/${year}`:'';
  sessionStorage.setItem(key(id),JSON.stringify({masked:true,last4,expiry,savedAt:Date.now()}));paintMasked(last4,expiry);return true;
}
function remember(id=currentId()){
  if(!id)return;
  const card=$('card_number'),expiry=$('card_expiry');if(!card||!expiry)return;
  const saved=read(id);
  if(saved?.masked)sessionStorage.setItem(key(id),JSON.stringify({...saved,expiry:expiry.value||saved.expiry||'',savedAt:Date.now()}));
}
function clear(id=currentId()){
  if(!id)return;
  sessionStorage.removeItem(key(id));
  const card=$('card_number'),expiry=$('card_expiry');
  if(card){card.value='';card.readOnly=false;delete card.dataset.stripeMasked}
  if(expiry){expiry.value='';expiry.readOnly=false}
}
function applySaved(id=currentId()){
  const x=read(id);if(!x?.masked)return false;
  paintMasked(x.last4,x.expiry);return true;
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
    delete body.p_payload.card_number;
    const expiry=$('card_expiry')?.value||body.p_payload.card_expiry||saved?.expiry||'';
    if(expiry)body.p_payload.card_expiry=expiry;else delete body.p_payload.card_expiry;
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
  if(record.card_last4){setStripeCard(id,{last4:record.card_last4,exp_month:record.card_expiry_month,exp_year:record.card_expiry_year});return}
  const card=$('card_number'),expiry=$('card_expiry');
  if(card){card.value='';card.disabled=false;card.readOnly=false;delete card.dataset.stripeMasked}
  if(expiry){expiry.value=record.card_expiry||'';expiry.disabled=false;expiry.readOnly=false}
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
  const wrapped=async function(id){const out=await original(id);await hydrate(id);return out};
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
window.LariosSafeCardPersistence={hydrate,remember,read,applySaved,clear,setStripeCard};
})();

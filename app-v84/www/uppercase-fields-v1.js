(function(){
'use strict';
const ROOT_SELECTORS=['#reservationForm','#lrVehicleForm'];
const EXCLUDED_TYPES=new Set(['password','hidden','file','checkbox','radio','range','color']);
const LIVE_TEXT_INPUTS=new Set(['vehicle_plate','card_number','card_expiry']);
function shouldHandle(el){
  if(!el||!el.matches?.('input,textarea,select'))return false;
  if(el.tagName==='INPUT'&&EXCLUDED_TYPES.has(String(el.type||'text').toLowerCase()))return false;
  return ROOT_SELECTORS.some(sel=>el.closest(sel));
}
function upperValue(el){
  if(!shouldHandle(el)||el.tagName==='SELECT')return;
  const old=String(el.value??''),next=old.toLocaleUpperCase('es-ES');
  if(old===next)return;
  const start=typeof el.selectionStart==='number'?el.selectionStart:null;
  const end=typeof el.selectionEnd==='number'?el.selectionEnd:null;
  el.value=next;
  try{if(start!==null&&end!==null)el.setSelectionRange(start,end)}catch(_){ }
}
function configure(el){
  if(!shouldHandle(el)||el.dataset.lrUppercase==='1')return;
  el.dataset.lrUppercase='1';
  el.style.removeProperty('text-transform');
  if(el.tagName!=='SELECT'){
    upperValue(el);
    // Keep iOS keyboard composition completely native while the field has
    // focus. Uppercase normalization happens only after editing finishes.
    el.addEventListener('change',()=>upperValue(el));
    el.addEventListener('blur',()=>upperValue(el));
    el.addEventListener('paste',()=>setTimeout(()=>upperValue(el),0));
  }
}
function scan(root=document){
  ROOT_SELECTORS.forEach(sel=>{
    const form=root.matches?.(sel)?root:root.querySelector?.(sel);
    if(!form)return;
    form.querySelectorAll('input,textarea,select').forEach(configure);
  });
}
function normalizeAll(){ROOT_SELECTORS.forEach(sel=>document.querySelectorAll(sel+' input,'+sel+' textarea').forEach(upperValue))}
function isolateNativeTyping(event){
  const el=event.target;
  if(!shouldHandle(el)||el.tagName==='SELECT'||LIVE_TEXT_INPUTS.has(el.id))return;
  const type=String(el.type||'text').toLowerCase();
  if(el.tagName!=='TEXTAREA'&&!['text','email','tel','search','url'].includes(type))return;
  // The browser has already inserted the character. Stop legacy pricing,
  // formatting and observer bridges from doing synchronous work per key.
  // Their change/blur handlers still run when the user finishes the field.
  event.stopImmediatePropagation();
  event.stopPropagation();
}
function boot(){
  document.getElementById('lrUppercaseFieldsStyle')?.remove();
  scan();
  new MutationObserver(()=>scan()).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('input',isolateNativeTyping,true);
  document.addEventListener('focusin',e=>configure(e.target),true);
  document.addEventListener('submit',normalizeAll,true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosUppercaseFields={scan,normalizeAll,version:'20261028-iphone-native-typing-v3'};
})();

(function(){
'use strict';
const ROOT_SELECTORS=['#reservationForm','#lrVehicleForm'];
const EXCLUDED_TYPES=new Set(['password','hidden','file','checkbox','radio','range','color']);
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
  el.style.textTransform='uppercase';
  if(el.tagName!=='SELECT'){
    upperValue(el);
    el.addEventListener('input',()=>upperValue(el));
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
function boot(){
  const style=document.createElement('style');style.id='lrUppercaseFieldsStyle';style.textContent='#reservationForm input,#reservationForm textarea,#reservationForm select,#lrVehicleForm input,#lrVehicleForm textarea,#lrVehicleForm select{text-transform:uppercase}';document.head.appendChild(style);
  scan();
  new MutationObserver(()=>scan()).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('focusin',e=>configure(e.target),true);
  document.addEventListener('submit',normalizeAll,true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosUppercaseFields={scan,normalizeAll,version:'20260914-v1'};
})();

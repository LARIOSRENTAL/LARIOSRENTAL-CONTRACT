(function(){
'use strict';
if(window.LariosTypingPerformance?.version==='20261028-main-thread-shield-v5')return;

const NativeObserver=window.MutationObserver;
const ROOTS='#reservationForm,#lrVehicleForm';
const TEXT_TYPES=new Set(['text','email','tel','search','url','number']);
let activeField=null;
const pendingObservers=new Set();

function belongsToEditor(el){return !!el?.matches?.('input,textarea,select')&&!!el.closest?.(ROOTS)}
function isTextField(el){
  if(!belongsToEditor(el)||el.tagName==='SELECT')return false;
  if(el.tagName==='TEXTAREA')return true;
  return TEXT_TYPES.has(String(el.type||'text').toLowerCase());
}
function active(){return !!activeField&&document.activeElement===activeField}
function markActive(el){
  if(!belongsToEditor(el))return;
  activeField=el;
  document.documentElement.dataset.lrTypingActive='1';
}
function flushObservers(){
  if(active())return;
  for(const state of [...pendingObservers]){
    pendingObservers.delete(state);
    const records=state.records.splice(0);
    if(records.length)try{state.callback(records,state.observer)}catch(error){setTimeout(()=>{throw error},0)}
  }
}
function release(el){
  setTimeout(()=>{
    if(activeField!==el||document.activeElement===el)return;
    if(belongsToEditor(document.activeElement)){activeField=document.activeElement;return}
    activeField=null;
    delete document.documentElement.dataset.lrTypingActive;
    flushObservers();
    document.dispatchEvent(new CustomEvent('larios:typing-idle'));
  },40);
}
function keepNativeInput(event){
  const el=event.target;
  if(!isTextField(el))return;
  if(['vehicle_plate','card_number','card_expiry'].includes(String(el.id||'')))return;
  event.stopImmediatePropagation();
  event.stopPropagation();
}

if(NativeObserver){
  window.__lrTypingNativeMutationObserver=NativeObserver;
  window.MutationObserver=function(callback){
    const state={callback,observer:null,records:[]};
    const observer=new NativeObserver((records,current)=>{
      if(!active())return callback(records,current);
      state.records.push(...records);
      state.observer=current;
      pendingObservers.add(state);
    });
    state.observer=observer;
    return observer;
  };
  window.MutationObserver.prototype=NativeObserver.prototype;
  window.MutationObserver.toString=()=>NativeObserver.toString();
}

document.addEventListener('focusin',event=>markActive(event.target),true);
document.addEventListener('focusout',event=>release(event.target),true);
document.addEventListener('input',keepNativeInput,true);

window.LariosTypingPerformance={active,flush:flushObservers,version:'20261028-main-thread-shield-v5'};
})();

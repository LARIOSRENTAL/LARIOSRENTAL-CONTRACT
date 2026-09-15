(function(){
'use strict';
const DATE_IDS=['customer_birth_date','license_issue','license_expiry','additional_birth_date','additional_license_issue','additional_license_expiry'];
const BIRTH_IDS=new Set(['customer_birth_date','additional_birth_date']);
const EXPIRY_IDS=new Set(['license_expiry','additional_license_expiry']);
const $=id=>document.getElementById(id);
const pendingTimers=new WeakMap();
function clearPending(el){const t=pendingTimers.get(el);if(t){clearTimeout(t);pendingTimers.delete(el)}}
function expandYear(two,id=''){
  const yy=Number(two),now=new Date().getFullYear(),current=now%100;
  if(EXPIRY_IDS.has(id))return 2000+yy;
  return yy<=current?2000+yy:1900+yy;
}
function checkedIso(y,mo,d){
  y=Number(y);mo=Number(mo);d=Number(d);
  if(y<1900||y>2100||mo<1||mo>12||d<1||d>31)return'';
  const x=new Date(Date.UTC(y,mo-1,d));
  if(x.getUTCFullYear()!==y||x.getUTCMonth()!==mo-1||x.getUTCDate()!==d)return'';
  return `${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function iso(value,id=''){
  const s=String(value||'').trim();if(!s)return'';
  let m=s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if(m)return checkedIso(m[1],m[2],m[3]);
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if(m){let y=Number(m[3]);if(m[3].length===2)y=expandYear(m[3],id);return checkedIso(y,m[2],m[1]);}
  const digits=s.replace(/\D/g,'');
  if(digits.length===8){
    const first4=Number(digits.slice(0,4));
    if(first4>=1900&&first4<=2100){const ymd=checkedIso(first4,digits.slice(4,6),digits.slice(6,8));if(ymd)return ymd;}
    return checkedIso(digits.slice(4,8),digits.slice(2,4),digits.slice(0,2));
  }
  if(digits.length===6)return checkedIso(expandYear(digits.slice(4,6),id),digits.slice(2,4),digits.slice(0,2));
  return'';
}
function valid(value,id=''){
  const s=iso(value,id);if(!s)return false;
  const [y,mo,d]=s.split('-').map(Number),x=new Date(Date.UTC(y,mo-1,d));
  if(BIRTH_IDS.has(id)&&x>Date.now())return false;
  return true;
}
function fromIso(s){return s?s.split('-').reverse().join('/'):''}
function display(value,id=''){const s=iso(value,id);return s?fromIso(s):String(value||'')}
function clearError(el){el.classList.remove('field-error');el.removeAttribute('aria-invalid');el.closest('.field-error-wrap')?.querySelector(':scope > .field-error-text')?.remove()}
function normalizeField(el){if(!el||!el.value)return false;clearPending(el);const parsed=iso(el.value,el.id);if(!parsed||!valid(parsed,el.id))return false;el.value=fromIso(parsed);clearError(el);return true}
function normalizeAll(){DATE_IDS.forEach(id=>normalizeField($(id)))}
function partialFormat(digits){
  digits=String(digits||'').replace(/\D/g,'').slice(0,8);
  if(digits.length<=2)return digits;
  if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);
  return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4,8);
}
function isExternalInput(e,raw){
  const type=String(e?.inputType||'');
  return e?.isTrusted===false||type==='insertFromPaste'||type==='insertFromDrop'||/^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}$/.test(String(raw||'').trim());
}
function scheduleSixDigitExpansion(el,digits){
  clearPending(el);
  const snapshot=digits;
  const timer=setTimeout(()=>{
    pendingTimers.delete(el);
    const nowDigits=String(el.value||'').replace(/\D/g,'');
    if(nowDigits!==snapshot||nowDigits.length!==6)return;
    const parsed=iso(nowDigits,el.id);
    if(parsed&&valid(parsed,el.id)){el.value=fromIso(parsed);clearError(el)}
  },700);
  pendingTimers.set(el,timer);
}
function onDateInput(e){
  const el=e.target;if(!DATE_IDS.includes(el?.id))return;
  clearPending(el);
  const raw=String(el.value||'').trim();
  if(!raw)return;
  const rawDigits=raw.replace(/\D/g,'');
  const parsed=iso(raw,el.id);
  if(parsed&&(isExternalInput(e,raw)||rawDigits.length===8)){
    el.value=fromIso(parsed);clearError(el);return;
  }
  const digits=rawDigits.slice(0,8);
  el.value=partialFormat(digits);
  if(digits.length===8){normalizeField(el);return}
  if(digits.length===6){scheduleSixDigitExpansion(el,digits);return}
  if(valid(el.value,el.id))clearError(el);
}
function configureField(el){
  if(!el||el.dataset.lrSmartDateV2==='1')return;
  el.dataset.lrSmartDateV2='1';
  el.dataset.lrSmartDate='1';
  const current=el.value;
  try{el.type='text'}catch(_){ }
  el.inputMode='numeric';el.setAttribute('inputmode','numeric');el.setAttribute('autocomplete','off');el.setAttribute('maxlength','10');el.placeholder='dd/mm/aaaa';
  if(current){el.value=current;normalizeField(el)}
  el.addEventListener('input',onDateInput);
  el.addEventListener('blur',()=>normalizeField(el));
  el.addEventListener('change',()=>normalizeField(el));
  el.addEventListener('paste',()=>setTimeout(()=>normalizeField(el),0));
}
function configureAll(){DATE_IDS.forEach(id=>configureField($(id)))}
function patchValidation(){
  const api=window.LariosValidation;if(!api||api.__dateV2Robust)return false;
  const original=api.validate?.bind(api);if(original)api.validate=function(){normalizeAll();return original()};
  api.validDate=(value,id='')=>valid(value,id);api.normalizeDates=normalizeAll;api.__dateV2=true;api.__dateV2Smart=true;api.__dateV2Robust=true;return true;
}
function install(){configureAll();normalizeAll();patchValidation();const form=$('reservationForm');if(form&&!form.dataset.dateV2){form.dataset.dateV2='1';form.addEventListener('submit',normalizeAll,true)}console.log('Date validation V2 scanner-safe 6/8 digit installed')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
new MutationObserver(()=>configureAll()).observe(document.documentElement,{subtree:true,childList:true});
let n=0,t=setInterval(()=>{configureAll();patchValidation();if(++n>80)clearInterval(t)},100);
window.LariosDateValidationV2={iso,valid,display,normalizeAll,configureAll,expandYear,partialFormat};
})();

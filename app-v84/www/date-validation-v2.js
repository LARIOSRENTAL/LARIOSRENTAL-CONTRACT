(function(){
'use strict';
const DATE_IDS=['customer_birth_date','license_issue','license_expiry','additional_birth_date','additional_license_issue','additional_license_expiry'];
const BIRTH_IDS=new Set(['customer_birth_date','additional_birth_date']);
const EXPIRY_IDS=new Set(['license_expiry','additional_license_expiry']);
const $=id=>document.getElementById(id);
function expandYear(two,id=''){
  const yy=Number(two),now=new Date().getFullYear(),current=now%100;
  if(EXPIRY_IDS.has(id))return 2000+yy;
  return yy<=current?2000+yy:1900+yy;
}
function iso(value,id=''){
  const s=String(value||'').trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(!m)return'';
  let y=Number(m[3]);if(y<100)y=expandYear(m[3],id);
  return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function valid(value,id=''){
  const s=iso(value,id),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;
  const y=+m[1],mo=+m[2],d=+m[3],x=new Date(Date.UTC(y,mo-1,d));
  if(y<1900||y>2100||x.getUTCFullYear()!==y||x.getUTCMonth()!==mo-1||x.getUTCDate()!==d)return false;
  if(BIRTH_IDS.has(id)&&x>Date.now())return false;
  return true;
}
function display(value,id=''){const s=iso(value,id);return s?s.split('-').reverse().join('/'):String(value||'')}
function clearError(el){el.classList.remove('field-error');el.removeAttribute('aria-invalid');el.closest('.field-error-wrap')?.querySelector(':scope > .field-error-text')?.remove()}
function normalizeField(el){if(!el||!el.value||!valid(el.value,el.id))return false;el.value=display(el.value,el.id);clearError(el);return true}
function normalizeAll(){DATE_IDS.forEach(id=>normalizeField($(id)))}
function partialFormat(digits){
  if(digits.length<=2)return digits;
  if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);
  return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4,8);
}
function onDateInput(e){
  const el=e.target;if(!DATE_IDS.includes(el?.id))return;
  let digits=String(el.value||'').replace(/\D/g,'').slice(0,8);
  const inserting=String(e.inputType||'').startsWith('insert');
  if(inserting&&digits.length===6){
    const year=expandYear(digits.slice(4,6),el.id);
    digits=digits.slice(0,4)+String(year);
  }
  el.value=partialFormat(digits);
  if(valid(el.value,el.id))clearError(el);
}
function configureField(el){
  if(!el||el.dataset.lrSmartDate==='1')return;
  el.dataset.lrSmartDate='1';
  const current=el.value;
  try{el.type='text'}catch(_){ }
  el.inputMode='numeric';el.setAttribute('inputmode','numeric');el.setAttribute('autocomplete','off');el.setAttribute('maxlength','10');el.placeholder='dd/mm/aaaa';
  if(current){el.value=current;normalizeField(el)}
  el.addEventListener('input',onDateInput);
  el.addEventListener('blur',()=>normalizeField(el));
  el.addEventListener('change',()=>normalizeField(el));
}
function configureAll(){DATE_IDS.forEach(id=>configureField($(id)))}
function patchValidation(){
  const api=window.LariosValidation;if(!api||api.__dateV2Smart)return false;
  const original=api.validate?.bind(api);if(original)api.validate=function(){normalizeAll();return original()};
  api.validDate=(value,id='')=>valid(value,id);api.normalizeDates=normalizeAll;api.__dateV2=true;api.__dateV2Smart=true;return true;
}
function install(){configureAll();normalizeAll();patchValidation();const form=$('reservationForm');if(form&&!form.dataset.dateV2){form.dataset.dateV2='1';form.addEventListener('submit',normalizeAll,true)}console.log('Date validation V2 smart keypad installed')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
new MutationObserver(()=>configureAll()).observe(document.documentElement,{subtree:true,childList:true});
let n=0,t=setInterval(()=>{configureAll();patchValidation();if(++n>80)clearInterval(t)},100);
window.LariosDateValidationV2={iso,valid,display,normalizeAll,configureAll,expandYear};
})();

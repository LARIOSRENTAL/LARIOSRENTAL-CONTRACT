(function(){
'use strict';
const DATE_IDS=['customer_birth_date','license_issue','license_expiry','additional_birth_date','additional_license_issue','additional_license_expiry'];
const $=id=>document.getElementById(id);
function iso(value){const s=String(value||'').trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(!m)return'';let y=Number(m[3]);if(y<100)y+=(y<=40?2000:1900);return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
function valid(value){const s=iso(value),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const y=+m[1],mo=+m[2],d=+m[3],x=new Date(Date.UTC(y,mo-1,d));return y>=1900&&y<=2100&&x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d}
function display(value){const s=iso(value);return s?s.split('-').reverse().join('/'):String(value||'')}
function normalizeField(el){if(!el||!el.value||!valid(el.value))return false;el.value=display(el.value);el.classList.remove('field-error');el.removeAttribute('aria-invalid');el.closest('.field-error-wrap')?.querySelector(':scope > .field-error-text')?.remove();return true}
function normalizeAll(){DATE_IDS.forEach(id=>normalizeField($(id)))}
function patchValidation(){const api=window.LariosValidation;if(!api||api.__dateV2)return false;const original=api.validate?.bind(api);if(original)api.validate=function(){normalizeAll();return original()};api.validDate=valid;api.normalizeDates=normalizeAll;api.__dateV2=true;return true}
function install(){normalizeAll();patchValidation();document.addEventListener('change',e=>{if(DATE_IDS.includes(e.target?.id))normalizeField(e.target)},true);const form=$('reservationForm');if(form&&!form.dataset.dateV2){form.dataset.dateV2='1';form.addEventListener('submit',normalizeAll,true)}console.log('Date validation V2 installed')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();let n=0,t=setInterval(()=>{patchValidation();normalizeAll();if(++n>40)clearInterval(t)},100);
window.LariosDateValidationV2={iso,valid,display,normalizeAll};
})();
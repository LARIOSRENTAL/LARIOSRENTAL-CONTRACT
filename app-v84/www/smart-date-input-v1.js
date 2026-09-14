(function(){
'use strict';
const IDS=['customer_birth_date','license_issue','license_expiry','additional_birth_date','additional_license_issue','additional_license_expiry'];
const EXPIRY=new Set(['license_expiry','additional_license_expiry']);
function expandYear(two,id){const yy=Number(two),current=(new Date()).getFullYear()%100;return EXPIRY.has(id)?2000+yy:(yy<=current?2000+yy:1900+yy)}
function formatDigits(digits,id,inputType){digits=String(digits||'').replace(/\D/g,'').slice(0,8);if(String(inputType||'').startsWith('insert')&&digits.length===6)digits=digits.slice(0,4)+String(expandYear(digits.slice(4),id));if(digits.length<=2)return digits;if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4,8)}
function bind(el){if(!el||el.dataset.lrSmartDate==='1')return;el.dataset.lrSmartDate='1';const old=el.value;try{el.type='text'}catch(_){ }el.inputMode='numeric';el.setAttribute('inputmode','numeric');el.setAttribute('maxlength','10');el.setAttribute('autocomplete','off');el.placeholder='dd/mm/aaaa';if(old)el.value=old;el.addEventListener('input',e=>{const next=formatDigits(el.value,el.id,e.inputType);if(el.value!==next)el.value=next});}
function bindAll(){IDS.forEach(id=>bind(document.getElementById(id)))}
function boot(){bindAll();new MutationObserver(bindAll).observe(document.body,{subtree:true,childList:true});let n=0;const t=setInterval(()=>{bindAll();if(++n>100)clearInterval(t)},100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.LariosSmartDates={bindAll,formatDigits,expandYear};
})();

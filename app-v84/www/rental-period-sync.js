(function(){
'use strict';
const $=id=>document.getElementById(id);
const HOUR=3600000, DAY=24*HOUR, COURTESY=3*HOUR;
let syncing=false;
function parseDT(d,t){const dm=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/),tm=String(t||'00:00').match(/^(\d{1,2}):(\d{2})$/);if(!dm||!tm)return null;const x=new Date(+dm[1],+dm[2]-1,+dm[3],+tm[1],+tm[2]);return isNaN(x)?null:x}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function hm(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function days(){return Math.max(1,Math.floor(Number($('rental_days')?.value||1)||1))}
function info(){const a=$('rental_days');if(!a)return;let b=$('rentalCourtesyInfo');if(!b){b=document.createElement('div');b.id='rentalCourtesyInfo';b.className='rental-courtesy-info';a.parentElement?.appendChild(b)}const s=parseDT($('pickup_date')?.value,$('pickup_time')?.value);if(!s){b.textContent='Cada día equivale a 24 h, con 3 h de cortesía.';return}const lim=new Date(s.getTime()+days()*DAY+COURTESY);b.textContent=`${days()} día${days()===1?'':'s'} de tarifa · cortesía hasta ${iso(lim).split('-').reverse().join('/')} ${hm(lim)}.`}
function recalc(){try{window.LariosContractUX?.recalculate?.()}catch(e){console.warn('Recalculo omitido',e)}}
function fromDays(){if(syncing)return;const s=parseDT($('pickup_date')?.value,$('pickup_time')?.value);if(!s)return;syncing=true;try{const e=new Date(s.getTime()+days()*DAY);if($('return_date'))$('return_date').value=iso(e);if($('return_time'))$('return_time').value=hm(e)}finally{syncing=false}info();recalc()}
function fromReturn(){if(syncing)return;const s=parseDT($('pickup_date')?.value,$('pickup_time')?.value),e=parseDT($('return_date')?.value,$('return_time')?.value);if(!s||!e||e<s)return;const n=Math.max(1,Math.ceil(Math.max(0,e-s-COURTESY)/DAY));syncing=true;try{if($('rental_days'))$('rental_days').value=String(n)}finally{syncing=false}info();recalc()}
function bind(){const d=$('rental_days'),pd=$('pickup_date'),pt=$('pickup_time'),rd=$('return_date'),rt=$('return_time');if(!d||!pd||!pt||!rd||!rt||d.dataset.safePeriodSync==='1')return;d.dataset.safePeriodSync='1';d.addEventListener('change',fromDays);pd.addEventListener('change',fromDays);pt.addEventListener('change',fromDays);rd.addEventListener('change',fromReturn);rt.addEventListener('change',fromReturn);info()}
const css=document.createElement('style');css.textContent='.rental-courtesy-info{margin-top:6px;font-size:12px;color:#166534;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px}';document.head.appendChild(css);
// Deliberately avoid wrapping LariosReservations.edit/save and avoid a global MutationObserver.
// Those two mechanisms were competing with the existing V8.4 form patchers and could lock Safari/iPad when opening a reservation.
const timer=setInterval(()=>{bind();if($('rental_days'))clearInterval(timer)},250);setTimeout(()=>clearInterval(timer),10000);
})();
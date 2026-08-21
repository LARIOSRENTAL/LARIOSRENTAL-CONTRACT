(function(){
const $=id=>document.getElementById(id);
const HOUR=60*60*1000, DAY=24*HOUR, COURTESY=3*HOUR;
let syncing=false;

function parseDateTime(dateValue,timeValue){
  if(!dateValue)return null;
  const dm=String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!dm)return null;
  const tm=String(timeValue||'00:00').match(/^(\d{1,2}):(\d{2})$/);
  if(!tm)return null;
  const d=new Date(Number(dm[1]),Number(dm[2])-1,Number(dm[3]),Number(tm[1]),Number(tm[2]),0,0);
  return Number.isNaN(d.getTime())?null:d;
}
function isoDateLocal(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function hhmm(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function trigger(el){if(!el)return;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function currentDays(){const n=Math.floor(Number($('rental_days')?.value||1));return Number.isFinite(n)&&n>0?n:1}

function daysFromTimes(){
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  const end=parseDateTime($('return_date')?.value,$('return_time')?.value);
  if(!start||!end)return null;
  const elapsed=end.getTime()-start.getTime();
  if(elapsed<0)return 0;
  // Each tariff day is 24 h. The first 3 h after a completed 24 h period are courtesy.
  // Examples: 26 h => 1 day; 28 h => 2 days.
  return Math.max(1,Math.ceil(Math.max(0,elapsed-COURTESY)/DAY));
}

function setReturnFromDays(){
  if(syncing)return;
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  if(!start)return;
  syncing=true;
  try{
    const end=new Date(start.getTime()+currentDays()*DAY);
    const rd=$('return_date'),rt=$('return_time');
    if(rd)rd.value=isoDateLocal(end);
    if(rt)rt.value=hhmm(end);
    trigger(rd);trigger(rt);
  }finally{syncing=false}
  recalc();
}

function setDaysFromReturn(){
  if(syncing)return;
  const n=daysFromTimes();
  if(n===null)return;
  syncing=true;
  try{
    const days=$('rental_days');
    if(days){days.value=String(n);trigger(days)}
  }finally{syncing=false}
  showCourtesyInfo(n);
  recalc();
}

function recalc(){
  if(window.LariosContractUX?.recalculate)try{window.LariosContractUX.recalculate()}catch(_){ }
  const total=$('contract_total');
  if(total)total.dispatchEvent(new Event('input',{bubbles:true}));
}

function showCourtesyInfo(days){
  let box=$('rentalCourtesyInfo');
  const anchor=$('rental_days');
  if(!anchor)return;
  if(!box){
    box=document.createElement('div');box.id='rentalCourtesyInfo';box.className='rental-courtesy-info';
    const parent=anchor.parentElement||anchor;parent.appendChild(box);
  }
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  if(!start){box.textContent='Cada día de alquiler equivale a 24 h, con 3 h de cortesía.';return}
  const limit=new Date(start.getTime()+Math.max(1,days)*DAY+COURTESY);
  box.textContent=`${Math.max(1,days)} día${days===1?'':'s'} de tarifa · cortesía hasta ${isoDateLocal(limit).split('-').reverse().join('/')} ${hhmm(limit)}.`;
}

function attach(){
  const days=$('rental_days'),pd=$('pickup_date'),pt=$('pickup_time'),rd=$('return_date'),rt=$('return_time');
  if(!days||!pd||!pt||!rd||!rt)return false;
  if(days.dataset.periodSync==='1')return true;
  days.dataset.periodSync='1';
  days.min='1';days.step='1';
  days.addEventListener('change',setReturnFromDays);
  days.addEventListener('input',()=>{if(String(days.value).trim()&&Number(days.value)>0)setReturnFromDays()});
  // If pickup changes, preserve the selected number of tariff days and move return accordingly.
  [pd,pt].forEach(el=>{el.addEventListener('change',setReturnFromDays);el.addEventListener('input',()=>{if(el.value)setReturnFromDays()})});
  // If return changes, calculate tariff days using the 3 h courtesy rule.
  [rd,rt].forEach(el=>{el.addEventListener('change',setDaysFromReturn);el.addEventListener('input',()=>{if(el.value)setDaysFromReturn()})});
  showCourtesyInfo(currentDays());
  return true;
}

const style=document.createElement('style');style.textContent='.rental-courtesy-info{margin-top:6px;font-size:12px;color:#166534;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px}';document.head.appendChild(style);
function init(){if(attach())return;const ob=new MutationObserver(()=>{if(attach())ob.disconnect()});ob.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,400));else setTimeout(init,400);
})();
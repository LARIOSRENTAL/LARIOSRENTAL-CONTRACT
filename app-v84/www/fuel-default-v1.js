(function(){
'use strict';
const $=id=>document.getElementById(id);
let contracts=[],loading=false,currentKey='';
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function loadContracts(){if(loading||!token)return;loading=true;try{const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_list_contracts',{method:'POST',headers:headers(),body:'{}'});const d=await r.json().catch(()=>[]);if(r.ok&&Array.isArray(d))contracts=d}finally{loading=false}}
function ensureZeroOption(el){if(el.tagName!=='SELECT')return;if([...el.options].some(o=>o.value==='0/8'))return;const o=document.createElement('option');o.value='0/8';o.textContent='0/8';el.insertBefore(o,el.firstChild)}
function installTouchGuard(el){if(el.dataset.lrFuelTouchGuard==='1')return;el.dataset.lrFuelTouchGuard='1';const touched=()=>{el.dataset.lrFuelTouched='1'};el.addEventListener('input',touched);el.addEventListener('change',touched)}
async function apply(){const section=$('reservation'),el=$('fuel_out');if(!section||section.classList.contains('hidden')||!el)return;installTouchGuard(el);ensureZeroOption(el);const id=window.LariosCurrentContractId||'';if(!id)return;if(currentKey!==id){currentKey=id;el.dataset.lrFuelTouched='';await loadContracts()}const c=contracts.find(x=>x.id===id);if(!c||String(c.status||'draft').toLowerCase()!=='draft')return;const saved=String(c.fuel_out||'').trim();if(saved){if(el.dataset.lrFuelTouched!=='1'&&el.value!==saved)el.value=saved;return}if(el.dataset.lrFuelTouched==='1')return;if(el.value!=='0/8'){el.value='0/8';el.dispatchEvent(new Event('change',{bubbles:true}))}}
function schedule(){[0,80,250,600].forEach(ms=>setTimeout(()=>apply().catch(()=>{}),ms))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
window.addEventListener('larios:access-ready',()=>{contracts=[];currentKey='';schedule()});
setInterval(()=>apply().catch(()=>{}),1500);
})();

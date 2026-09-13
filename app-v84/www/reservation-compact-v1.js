(function(){
'use strict';
const $=id=>document.getElementById(id);
const money=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n.toFixed(2):'0.00'};
const groupCode=()=>String($('vehicle_group')?.value||'').toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-');
const isScooter=()=>['50CC','125CC'].includes(groupCode());
const recalc=()=>{try{const result=window.LariosAutoPricing?.recalculate?.();result?.catch?.(e=>console.warn('Compact pricing',e))}catch(e){console.warn('Compact pricing',e)}};
const setValue=(el,value)=>{if(el&&el.value!==value)el.value=value};
const setReadOnly=(el,value)=>{if(el&&el.readOnly!==value)el.readOnly=value};
const toggleClass=(el,name,on)=>{if(el&&el.classList.contains(name)!==on)el.classList.toggle(name,on)};

function installStyles(){if($('lrCompactStyle'))return;const s=document.createElement('style');s.id='lrCompactStyle';s.textContent=`
.lrCollapse{border:1px solid #e5e7eb;border-radius:12px;margin:10px 0;background:#fff;overflow:hidden}
.lrCollapse>summary{list-style:none;cursor:pointer;padding:13px 14px;font-weight:800;display:flex;justify-content:space-between;align-items:center}
.lrCollapse>summary::-webkit-details-marker{display:none}.lrCollapse>summary:after{content:'⌄';font-size:18px;color:#6b7280}.lrCollapse[open]>summary:after{content:'⌃'}
.lrCollapseBody{padding:2px 14px 14px}.lrDepositBox{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0;background:#f9fafb}.lrDepositTitle{font-weight:800;margin-bottom:8px}.lrDepositChoice{display:grid;grid-template-columns:auto 1fr 130px;gap:10px;align-items:center;margin:7px 0}.lrDepositChoice input[type=checkbox]{width:auto;margin:0}.lrDepositChoice input[type=text]{margin:0}.lrDepositHint{font-size:12px;color:#6b7280;margin-top:6px}.lrDepositRequired{color:#b91c1c;font-weight:700}
@media(max-width:600px){.lrDepositChoice{grid-template-columns:auto 1fr}.lrDepositChoice input[type=text]{grid-column:1/-1}}
`;document.head.appendChild(s)}

function protectManualPrices(){['rental_price','insurance_total'].forEach(id=>{const e=$(id);if(!e||e.dataset.compactPrice==='1')return;e.dataset.compactPrice='1';e.type='text';e.inputMode='decimal';e.addEventListener('focus',()=>{e.dataset.manualPrice='1';e.dataset.priceReady='1';e.dataset.editingPrice='1'});e.addEventListener('blur',()=>{if(e.value.trim()===''){e.value='0.00'}else e.value=money(e.value);e.dataset.manualPrice='1';e.dataset.priceReady='1';e.dataset.editingPrice='0';setTimeout(recalc,0)});});}

document.addEventListener('input',ev=>{const e=ev.target;if(!(e instanceof HTMLInputElement))return;if(!['rental_price','insurance_total'].includes(e.id))return;if(document.activeElement!==e)return;e.dataset.manualPrice='1';e.dataset.priceReady='1';ev.stopImmediatePropagation();},true);

document.addEventListener('change',ev=>{const e=ev.target;if(!(e instanceof HTMLInputElement))return;if(!['rental_price','insurance_total'].includes(e.id))return;if(document.activeElement===e)ev.stopImmediatePropagation();},true);

function commonParent(elements){if(!elements.length)return null;let p=elements[0].parentElement;while(p&&p.id!=='reservationForm'){if(elements.every(e=>p.contains(e)))return p;p=p.parentElement}return null}
function makeCollapse(summary,ids,key){if($('lrCollapse_'+key))return;const els=ids.map(id=>$(id)).filter(Boolean);if(!els.length)return;const labels=[...new Set(els.map(e=>e.closest('label')||e.parentElement).filter(Boolean))];if(!labels.length)return;const host=commonParent(labels)||labels[0].parentElement;if(!host)return;const d=document.createElement('details');d.id='lrCollapse_'+key;d.className='lrCollapse wide';const body=document.createElement('div');body.className='lrCollapseBody formGrid';d.innerHTML='<summary>'+summary+'</summary>';d.appendChild(body);host.insertBefore(d,labels[0]);labels.forEach(x=>body.appendChild(x));}
function compactOptionalSections(){makeCollapse('Conductor adicional',['additional_name','additional_driving_license','additional_birth_date','additional_license_issue','additional_license_expiry','additional_license_issued_by'],'driver');const table=document.querySelector('.extrasTable');if(table&&!$('lrCollapse_extras')){const d=document.createElement('details');d.id='lrCollapse_extras';d.className='lrCollapse wide';const body=document.createElement('div');body.className='lrCollapseBody';d.innerHTML='<summary>Extras</summary>';table.parentElement.insertBefore(d,table);d.appendChild(body);body.appendChild(table)}}

function setDepositSelection(kind,checked){const cash=$('deposit_cash_selected'),pre=$('preauth_selected');if(kind==='cash'&&checked&&pre)pre.checked=false;if(kind==='pre'&&checked&&cash)cash.checked=false;syncDepositState()}
function syncDepositState(){window.LariosGuarantees?.syncForm()} // guarantees1-sync
function installDeposit(){const old=$('deposit');if(!old||$('lrDepositBox'))return;const label=old.closest('label')||old.parentElement;if(label)label.style.display='none';const box=document.createElement('div');box.id='lrDepositBox';box.className='lrDepositBox';box.innerHTML='<div class="lrDepositTitle">Garantía / depósito</div><label class="lrDepositChoice"><input id="deposit_cash_selected" type="checkbox"><span>Depósito efectivo</span><input id="deposit_cash" type="text" inputmode="decimal" value="0.00"></label><label class="lrDepositChoice"><input id="preauth_selected" type="checkbox"><span>Preautorización</span><input id="preauthorization" type="text" inputmode="decimal" value="0.00"></label><div id="lrDepositHint" class="lrDepositHint"></div>';(label?.parentElement||old.parentElement)?.insertBefore(box,label?.nextSibling||old.nextSibling);$('deposit_cash_selected').addEventListener('change',e=>setDepositSelection('cash',e.target.checked));$('preauth_selected').addEventListener('change',e=>setDepositSelection('pre',e.target.checked));['deposit_cash','preauthorization'].forEach(id=>{$(id).addEventListener('input',syncDepositState);$(id).addEventListener('blur',()=>{$(id).value=money($(id).value);syncDepositState()})});$('vehicle_group')?.addEventListener('change',syncDepositState);$('franchise')?.addEventListener('input',syncDepositState);$('franchise')?.addEventListener('change',syncDepositState);syncDepositState();loadDepositForCurrentContract()}

function loadDepositForCurrentContract(){/* Hydration belongs to guarantee controller. */}

const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  try{
    const url=typeof input==='string'?input:String(input?.url||'');
    if(/\/rest\/v1\/rpc\/(?:test_)?app_save_contract(?:\?|$)/.test(url)&&init?.body){
      const parsed=JSON.parse(init.body);
      const p=parsed?.p_payload;
      if(p&&$('lrDepositBox')&&!$('reservation')?.classList.contains('hidden')&&p.id&&p.id===window.LariosCurrentContractId){
        syncDepositState();
        const cashSel=$('deposit_cash_selected')?.checked,preSel=$('preauth_selected')?.checked;
        p.rental_price_manual=$('rental_price')?.dataset.manualPrice==='1';
        p.insurance_total_manual=$('insurance_total')?.dataset.manualPrice==='1';
        p.deposit_cash=cashSel?money($('deposit_cash')?.value):'0.00';
        p.preauthorization=preSel?money($('preauthorization')?.value):'0.00';
        p.deposit_method=cashSel?'cash':preSel?'preauthorization':'';
        p.deposit=cashSel?p.deposit_cash:preSel?p.preauthorization:'0.00';
        init={...init,body:JSON.stringify(parsed)};
      }
    }
  }catch(e){}
  return originalFetch(input,init);
};

let patchTimer=0, applying=false, patchCount=0;
const form=$('reservationForm'),section=$('reservation');
const observer=form?new MutationObserver(records=>{
  if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(
    n.matches?.('input,select,.extrasTable,.contractStep,.formGrid')||
    n.querySelector?.('#rental_price,#deposit,#additional_name,.extrasTable')
  ))))schedulePatch();
}):null;
function observeForm(){if(form)observer?.observe(form,{childList:true,subtree:true})}
function patch(){
  patchTimer=0;
  if(applying||!section||section.classList.contains('hidden'))return;
  applying=true;observer?.disconnect();
  try{patchCount++;installStyles();protectManualPrices();compactOptionalSections();installDeposit();loadDepositForCurrentContract();syncDepositState()}
  catch(e){console.error('Compact reservation controls',e)}
  finally{applying=false;observeForm()}
}
function schedulePatch(){if(!patchTimer&&!applying)patchTimer=setTimeout(patch,0)}
observeForm();
if(section)new MutationObserver(()=>schedulePatch()).observe(section,{attributes:true,attributeFilter:['class']});
if(form)form.addEventListener('change',event=>{
  if(['vehicle_group','full_insurance','franchise','rental_days'].includes(event.target?.id))schedulePatch();
});
window.LariosCompact={version:'20260912-stable2',refresh:schedulePatch,diagnostics:()=>({patchCount})};
schedulePatch();
})();

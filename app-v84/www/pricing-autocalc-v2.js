(function(){
'use strict';
const $=id=>document.getElementById(id);
let pricing=null, loading=null, boundRental=null;
const nonCars=['50CC','125CC','BICICLETA','E-BIKE'];
const money=n=>Number(n||0).toFixed(2);
const n=id=>Number(String($(id)?.value||'0').replace(',','.'))||0;
const v=id=>String($(id)?.value||'').trim();
const checked=id=>!!$(id)?.checked;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function loadPricing(force=false){if(pricing&&!force)return pricing;if(loading)return loading;loading=(async()=>{const r=await fetch(cfg.supabaseUrl+'/rest/v1/pricing?select=*&active=eq.true&order=category',{headers:headers()});if(!r.ok)throw new Error(await r.text());pricing=await r.json();return pricing})().finally(()=>loading=null);return loading}
function groupCode(){return v('vehicle_group').toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-')}
function categoryKey(){const g=groupCode();if(g==='50CC')return'50cc';if(g==='125CC')return'125cc';return nonCars.includes(g)?g:(g?'Grupo '+g:'')}
function rowForGroup(){const k=categoryKey().toUpperCase();return (pricing||[]).find(x=>String(x.category||'').toUpperCase()===k)||null}
function baseRental(row,days){if(!row)return 0;if(row.pricing_type==='daily_tiers'){const daily=days<=3?row.tier_1_3_daily:days<=7?row.tier_4_7_daily:row.tier_8_plus_daily;return Number(daily||0)*days}if(days<=7)return Number(row['day_'+days]||0);return Number(row.day_7||0)+Number(row.extra_day||0)*(days-7)}
function extrasTotal(days){
  let total=0;
  const defs={child_seat:[6,40],carplay:[6,40],gps:[6,40],booster:[5,25],gloves:[5,25],bike_seat:[5,25],phone_holder:[5,25],helmet:[5,25]};
  Object.entries(defs).forEach(([k,[daily,max]])=>{
    const box=$('v2_'+k)||$('fx_'+k)||$('extra_'+k);
    if(!box?.checked){const output=$('v2_'+k+'_total')||$('fx_'+k+'_total');if(output&&output.textContent!=='0.00 €')output.textContent='0.00 €';return;}
    const qtyEl=$('v2_'+k+'_qty')||$('fx_'+k+'_qty')||$('extra_'+k+'_qty');
    const qty=Math.max(1,Number(qtyEl?.value||1)||1);
    const priceEl=$('v2_'+k+'_price')||$('fx_'+k+'_price')||$('extra_'+k+'_price');
    const automatic=Math.min(days*daily,max);
    if(priceEl&&priceEl.dataset.manualPrice!=='1'&&priceEl.dataset.editingPrice!=='1')priceEl.value=money(automatic);
    const unit=priceEl&&priceEl.dataset.manualPrice==='1'?(Number(String(priceEl.value||'0').replace(',','.'))||0):automatic;
    total+=qty*unit;
    const output=$('v2_'+k+'_total')||$('fx_'+k+'_total');if(output&&output.textContent!==money(qty*unit)+' €')output.textContent=money(qty*unit)+' €';
  });
  if(!checked('v2_additional_driver')&&$('v2_additional_driver_total')&&$('v2_additional_driver_total').textContent!=='0.00 €')$('v2_additional_driver_total').textContent='0.00 €';
  if(checked('v2_additional_driver')){
    const qty=Math.max(1,n('v2_additional_driver_qty')||1),p=$('v2_additional_driver_price');
    const unit=p&&p.dataset.manualPrice==='1'?(Number(String(p.value||'0').replace(',','.'))||0):days*5;
    if(p&&p.dataset.manualPrice!=='1'&&p.dataset.editingPrice!=='1')p.value=money(unit);
    total+=qty*unit;
    if($('v2_additional_driver_total')&&$('v2_additional_driver_total').textContent!==money(qty*unit)+' €')$('v2_additional_driver_total').textContent=money(qty*unit)+' €';
  }
  for(const i of [1,2]){
    if(v('v2_custom'+i+'_name'))total+=Math.max(1,n('v2_custom'+i+'_qty')||1)*n('v2_custom'+i+'_price');
  }
  return total;
}
function youngDriverTotal(days){
  window.LariosBusinessRules?.applyYoungRule?.(days);
  const box=$('young_driver'),amount=$('young_driver_amount');
  if(!box?.checked){
    if(amount&&amount.dataset.manualPrice!=='1'){amount.value='0.00';amount.dataset.autoYoung='0'}
    return 0;
  }
  const automatic=days===1?15:days*10;
  if(!amount)return automatic;
  const current=n('young_driver_amount');
  const autoControlled=amount.dataset.manualPrice!=='1'&&amount.dataset.editingPrice!=='1';
  if(autoControlled){
    amount.value=money(automatic);
    amount.dataset.autoYoung='1';
    amount.dataset.manualPrice='0';
    amount.dataset.priceReady='1';
    return automatic;
  }
  return current;
}
function syncAdditional(){
 const box=$('v2_additional_driver');if(!box)return;
 const filled=['additional_name','additional_driving_license','additional_birth_date','additional_license_issue','additional_license_expiry','additional_license_issued_by'].some(id=>v(id));
 if(filled){box.checked=true;box.dataset.autoAdditional='1'}
 else if(box.dataset.autoAdditional==='1'){box.checked=false;box.dataset.autoAdditional='0'}
}
function insuranceCards(row,days,qty){
 const checkbox=$('full_insurance');if(!checkbox)return;
 let panel=$('insuranceChoiceEditor');
 if(!panel){
  const style=document.createElement('style');style.textContent='.lrInsuranceChoice{grid-column:1/-1;margin:12px 0}.lrInsuranceCards{display:grid;grid-template-columns:1fr 1fr;gap:12px}.lrInsuranceCard{display:flex;flex-direction:column;gap:6px;text-align:left;padding:18px;border:2px solid #d1d5db;border-radius:16px;background:white;color:#17212b;font:inherit;cursor:pointer}.lrInsuranceCard strong{font-size:20px}.lrInsuranceCard small{font-size:14px;color:#536471}.lrInsuranceCard .lrExcess{font-size:30px;font-weight:800}.lrInsuranceCard[aria-pressed=true]{border-color:#158b98;background:#eefafb;box-shadow:0 0 0 1px #158b98}.lrInsuranceCard:disabled{opacity:.6;cursor:default}.lrInsuranceChoice p{font-size:14px;margin:10px 0}@media(max-width:540px){.lrInsuranceCards{grid-template-columns:1fr}}';document.head.appendChild(style);
  panel=document.createElement('div');panel.id='insuranceChoiceEditor';panel.className='lrInsuranceChoice';
  panel.innerHTML='<p>Seleccione el seguro para este contrato / Select insurance for this rental</p><div class="lrInsuranceCards"><button type="button" class="lrInsuranceCard" id="insuranceStandard"><strong>Seguro estándar</strong><small>Standard insurance</small><span>Franquicia / Excess</span><span class="lrExcess" id="insuranceStandardExcess"></span><small>Incluido / Included</small><small>Pulse para seleccionar / Tap to select</small></button><button type="button" class="lrInsuranceCard" id="insuranceFull"><strong>Seguro completo</strong><small>Full insurance</small><span>Franquicia / Excess</span><span class="lrExcess">0 €</span><span id="insuranceFullCost"></span><small>Pulse para seleccionar / Tap to select</small></button></div><p id="insuranceChoiceStatus" role="status"></p>';
  const label=checkbox.closest('.toggleLine')||checkbox.closest('label')||checkbox;const mount=$('insuranceChoiceMount');if(mount)mount.appendChild(panel);else label.parentNode.insertBefore(panel,label);label.style.display='none';
  for(const [id,full] of [['insuranceStandard',false],['insuranceFull',true]])$(id).onclick=()=>{if(checkbox.disabled)return;checkbox.checked=full;checkbox.dispatchEvent(new Event('change',{bubbles:true}));recalc(false)};
 }
 const euro=value=>Number(value||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
 const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value};
 text('insuranceStandardExcess',euro(Number(row.franchise||0)*qty));
 const cost=checked('full_insurance')?n('insurance_total'):(Number(row.insurance_first_day||0)+Math.max(0,days-1)*Number(row.insurance_extra_day||0))*qty;
 text('insuranceFullCost','Coste / Cost: '+euro(cost));
 for(const [id,full] of [['insuranceStandard',false],['insuranceFull',true]]){const selected=String(checkbox.checked===full);if($(id).getAttribute('aria-pressed')!==selected)$(id).setAttribute('aria-pressed',selected);$(id).disabled=checkbox.disabled}
 text('insuranceChoiceStatus',checkbox.checked?'Seleccionado: Seguro completo · franquicia 0 € / Selected: Full insurance · 0 € excess':'Seleccionado: Seguro estándar · franquicia '+euro(Number(row.franchise||0)*qty)+' / Selected: Standard insurance · '+euro(Number(row.franchise||0)*qty)+' excess');
}

function recalc(forceAuto=false){if(window.LariosWebBooking?.preservePrice())return;if(!pricing||!$('rental_price'))return;const row=rowForGroup();if(!row)return;const days=Math.max(1,Math.floor(n('rental_days')||1));const qty=['BICICLETA','E-BIKE'].includes(groupCode())?Math.max(1,n('vehicle_quantity')||1):1;let autoRental=baseRental(row,days)*qty;if(checked('tariff94'))autoRental*=1+Number($('tariff94')?.dataset.markup||row.season_94_markup||20)/100;let autoInsurance=0;if(!nonCars.includes(groupCode())&&checked('full_insurance'))autoInsurance=(Number(row.insurance_first_day||0)+Math.max(0,days-1)*Number(row.insurance_extra_day||0))*qty;const rp=$('rental_price'),ip=$('insurance_total');if(forceAuto||((rp.dataset.manualPrice!=='1')&&(rp.dataset.editingPrice!=='1')))rp.value=money(autoRental);if(ip&&(forceAuto||((ip.dataset.manualPrice!=='1')&&(ip.dataset.editingPrice!=='1'))))ip.value=money(autoInsurance);const rental=n('rental_price'),insurance=n('insurance_total');syncAdditional();const young=youngDriverTotal(days);const extras=extrasTotal(days);const parking=!nonCars.includes(groupCode())&&/(aeropuerto|airport|easy\s*parking)/i.test(v('return_location'))?15:0;const discount=rental*Math.max(0,n('discount_percent'))/100;const total=Math.max(0,rental-discount+insurance+young+extras+parking);if($('franchise'))$('franchise').value=money(checked('full_insurance')?0:Number(row.franchise||0)*qty);if($('contract_total'))$('contract_total').value=money(total);insuranceCards(row,days,qty);const box=$('priceBreakdown');if(box){const html=`<div class="priceLine"><span>Alquiler</span><b>${money(rental)} €</b></div><div class="priceLine"><span>Seguro</span><b>${money(insurance)} €</b></div><div class="priceLine"><span>Conductor &lt;25</span><b>${money(young)} €</b></div><div class="priceLine"><span>Extras</span><b>${money(extras)} €</b></div><div class="priceLine"><span>Easy Parking</span><b>${money(parking)} €</b></div><div class="priceLine"><span>Descuento</span><b>-${money(discount)} €</b></div><div class="priceLine priceTotal"><span>Total</span><b>${money(total)} €</b></div>`;if(box.innerHTML!==html)box.innerHTML=html}}
async function recalcReady(forceAuto=false){try{if(pricing){recalc(forceAuto);return}await loadPricing();recalc(forceAuto);if(!forceAuto)setTimeout(()=>recalc(false),120)}catch(e){console.warn('pricing-autocalc:',e)}}
function manualMoney(id){const e=$(id);if(!e||e.dataset.manualMoneyV2==='1')return;e.dataset.manualMoneyV2='1';e.inputMode='decimal';e.addEventListener('focus',()=>{e.dataset.editingPrice='1'});e.addEventListener('input',()=>{const typed=e.value;e.dataset.manualPrice='1';e.dataset.editingPrice='1';setTimeout(()=>{if(e.dataset.editingPrice==='1'){e.value=typed;recalcReady(false)}},0)},true);e.addEventListener('blur',()=>{e.dataset.editingPrice='0';const raw=String(e.value).trim();e.value=raw===''?'0.00':money(Number(raw.replace(',','.'))||0);e.dataset.manualPrice='1';recalcReady(false)})}
function bind(){
 const form=$('reservationForm'),rental=$('rental_price');if(!form||!rental)return;
 const fresh=rental!==boundRental;boundRental=rental;let added=false;
 ['rental_price','insurance_total','young_driver_amount'].forEach(manualMoney);
 form.querySelectorAll('[id^="v2_"][id$="_price"]').forEach(e=>manualMoney(e.id));
 const ids=['vehicle_group','vehicle_quantity','rental_days','pickup_date','pickup_time','return_date','return_time','tariff94','full_insurance','young_driver','young_driver_amount','customer_birth_date','discount_percent','return_location','additional_name','additional_driving_license','additional_birth_date','additional_license_issue','additional_license_expiry','additional_license_issued_by'];
 ids.forEach(id=>{const e=$(id);if(!e||e.dataset.autoPriceV2==='1')return;e.dataset.autoPriceV2='1';added=true;
 const fn=()=>{
  const resetRental=['vehicle_group','vehicle_quantity','rental_days','pickup_date','pickup_time','return_date','return_time','tariff94'].includes(id);
  const resetInsurance=resetRental||id==='full_insurance';
  if(resetRental&&$('rental_price'))Object.assign($('rental_price').dataset,{manualPrice:'0',editingPrice:'0'});
  if(resetInsurance&&$('insurance_total'))Object.assign($('insurance_total').dataset,{manualPrice:'0',editingPrice:'0'});
  if(['vehicle_group','rental_days','customer_birth_date','pickup_date'].includes(id)&&$('young_driver_amount'))Object.assign($('young_driver_amount').dataset,{manualPrice:'0',editingPrice:'0',priceReady:'1'});
  recalc(false);recalcReady(false);
 };e.addEventListener('change',fn);e.addEventListener('input',fn)});
 form.querySelectorAll('[id^="v2_"],[id^="fx_"]').forEach(e=>{if(!/^(INPUT|SELECT)$/.test(e.tagName)||e.dataset.autoPriceV2==='1')return;e.dataset.autoPriceV2='1';added=true;const fn=()=>{recalc(false);recalcReady(false)};e.addEventListener('change',fn);e.addEventListener('input',fn)});
 if(fresh||added)recalcReady(false);
}
function onReservationVisibility(){const s=$('reservation');if(s&&!s.classList.contains('hidden'))setTimeout(()=>{bind();recalcReady(false)},20)}
function start(){document.addEventListener('larios:reservation-opened',onReservationVisibility);const s=$('reservation'),form=$('reservationForm');if(s)new MutationObserver(onReservationVisibility).observe(s,{attributes:true,attributeFilter:['class']});if(form)new MutationObserver(()=>setTimeout(()=>{bind();recalcReady(false)},20)).observe(form,{childList:true,subtree:true});onReservationVisibility();setTimeout(()=>loadPricing().catch(()=>{}),100)}window.LariosAutoPricing={recalculate:recalcReady,sync:()=>recalc(false),reload:()=>loadPricing(true).then(()=>recalc(false))};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

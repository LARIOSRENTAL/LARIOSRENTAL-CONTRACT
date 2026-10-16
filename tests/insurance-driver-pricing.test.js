const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const root=__dirname+'/../app-v84/www/';
const dom=new JSDOM('<section id="reservation"><form id="reservationForm"><label class="toggleLine"><input id="full_insurance" type="checkbox">Seguro completo</label><div class="extrasTable"></div><div id="priceBreakdown"></div></form></section>',{runScripts:'outside-only',url:'https://example.test/'});
const w=dom.window,d=w.document,$=id=>d.getElementById(id);
for(const id of ['vehicle_group','rental_days','vehicle_quantity','pickup_date','customer_birth_date','additional_name','additional_driving_license','additional_birth_date','additional_license_issue','additional_license_expiry','additional_license_issued_by','rental_price','insurance_total','young_driver_amount','franchise','contract_total','discount_percent','return_location','billing_notes']){const e=d.createElement('input');e.id=id;$('reservationForm').appendChild(e)}
for(const id of ['young_driver','tariff94']){const e=d.createElement('input');e.id=id;e.type='checkbox';$('reservationForm').appendChild(e)}
const rows=[{category:'Grupo A',day_1:78,day_2:140,day_3:200,insurance_first_day:15,insurance_extra_day:10,franchise:600},{category:'125cc',day_1:41,insurance_first_day:0,franchise:200},{category:'Grupo Q',day_1:200,franchise:1000}];
w.cfg={supabaseUrl:'https://example.test',supabasePublishableKey:'test'};w.token='test';
w.fetch=async()=>({ok:true,json:async()=>rows});
// Expose the actual legacy patch functions without unrelated scanner/auth bootstrapping.
let legacy=fs.readFileSync(root+'larios-fixes.js','utf8');legacy=legacy.slice(0,legacy.lastIndexOf("if(document.readyState==='loading')"))+ 'window.testLegacy={patchExtras,applyYoungRule,patchForm,recalculate};})();';w.eval(legacy);
let v2=fs.readFileSync(root+'v84-corrections.js','utf8');v2=v2.slice(0,v2.lastIndexOf("if(document.readyState==='loading')"))+'window.testExtras={patchExtras,recalcV2};})();';w.eval(v2);
w.testLegacy.patchExtras();w.testExtras.patchExtras();w.testLegacy.patchExtras();
assert.ok($('v2_additional_driver'),'legacy patch must preserve additional driver');
$('vehicle_group').value='A';$('rental_days').value='1';$('vehicle_quantity').value='1';$('pickup_date').value='2026-10-16';$('customer_birth_date').value='1990-01-01';
let scanner=fs.readFileSync(root+'scanner.js','utf8');scanner=scanner.slice(0,scanner.lastIndexOf("if(document.readyState==='loading')"));w.eval(scanner);
for(const id of ['full_insurance','young_driver_amount','rental_days'])$(''+id).addEventListener('input',()=>w.LariosContractUX.recalculate());
w.LariosBusinessRules={applyYoungRule:w.testLegacy.applyYoungRule};
w.eval(fs.readFileSync(root+'pricing-autocalc-v2.js','utf8'));
const wait=()=>new Promise(r=>setTimeout(r,180));
function change(id,value,event='input'){const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new w.Event(event,{bubbles:true}))}
let pdf=fs.readFileSync(root+'pdf-authority-v3.js','utf8');pdf=pdf.slice(0,pdf.lastIndexOf('setTimeout(install,350)'))+'window.testPdf={captureFinancialSnapshot,payload};})();';w.eval(pdf);
const total=()=>Number($('contract_total').value);
(async()=>{
 await wait();assert.equal(total(),78);
 assert.equal($('insuranceStandard').getAttribute('aria-pressed'),'true');
 $('insuranceFull').click();assert.equal(total(),93);assert.equal(Number($('franchise').value),0);
 $('insuranceStandard').click();assert.equal(total(),78);assert.equal(Number($('franchise').value),600);
 change('additional_name','Second Driver');assert.equal($('v2_additional_driver').checked,true);assert.equal(total(),83);
 change('rental_days','2');assert.equal(total(),150);assert.equal(Number($('v2_additional_driver_price').value),10);
 change('additional_name','');assert.equal($('v2_additional_driver').checked,false);assert.equal(total(),140);
 change('customer_birth_date','2005-10-15');assert.equal($('young_driver').checked,true);assert.equal($('young_driver').disabled,true);assert.equal(total(),160);
 change('young_driver_amount','7');await wait();assert.equal(total(),147,'manual young driver price immediately applied');
 $('insuranceFull').click();await wait();assert.equal(total(),172,'insurance retains manual young driver price');
 change('young_driver_amount','0');await wait();assert.equal(total(),165,'manual zero remains valid');
 change('additional_name','Second Driver');assert.equal(total(),175);
 change('v2_additional_driver_price','3');await wait();assert.equal(total(),168,'manual extra price included');
 // Legacy calculators must defer to the same totals.
 w.testLegacy.recalculate();w.testExtras.recalcV2();await wait();assert.equal(total(),168);
 change('rental_days','1');await wait();assert.equal(total(),111,'day change updates young fee but preserves custom extra price');
 change('customer_birth_date','1990-01-01');assert.equal(total(),96,'adult removes young fee');
 change('vehicle_group','125CC','change');await wait();assert.equal($('young_driver').checked,false);
 w.LariosWebBooking={preservePrice:()=>true};$('contract_total').value='999';w.LariosAutoPricing.sync();assert.equal(total(),999,'locked web booking preserved');
 w.LariosWebBooking=null;
 // Dynamically rebuilt extras are rebound even with the same rental input.
 d.querySelector('.extrasTable').dataset.v2='0';w.testExtras.patchExtras();await wait();
 change('vehicle_group','A','change');change('rental_days','2');change('additional_name','New Driver');await wait();assert.equal($('v2_additional_driver').checked,true);assert.equal(total(),175);
 change('v2_additional_driver_price','4');await wait();assert.equal(total(),169);
 const snapshot=w.testPdf.captureFinancialSnapshot();assert.equal(snapshot.total,169);assert.equal(snapshot.selected.find(x=>x.key==='additional_driver').unit,4);assert.equal(snapshot.selected.find(x=>x.key==='additional_driver').manual,true);const payload=w.testPdf.payload('draft',snapshot);assert.equal(payload.extras_total,'4.00');assert.equal(payload.total,'169.00');assert.equal(payload.additional_name,'New Driver');
 change('rental_price','123');await wait();change('customer_birth_date','2005-10-15');change('young_driver_amount','8');await wait();assert.equal(total(),160,'base scanner must preserve manual rental and young fees');
 console.log('insurance/driver pricing: cards, dynamic extras, automatic age/additional fees and manual overrides OK');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});

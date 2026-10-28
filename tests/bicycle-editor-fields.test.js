const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..','app-v84','www');
const authority=fs.readFileSync(path.join(root,'pdf-authority-v3.js'),'utf8');
const start=authority.lastIndexOf('function vehicleStep(');
const end=authority.indexOf('function install(){',start);
assert.ok(start>0&&end>start,'vehicle-field filter implementation must be present');

const dom=new JSDOM(`<!doctype html><section id="reservation"><form id="reservationForm">
  <select id="vehicle_group"><option selected>BICICLETA</option><option>A</option></select>
  <div class="contractStep" id="renterStep"><h3>Arrendatario</h3><div class="scanBar">Escáner</div><div class="formGrid" id="renterGrid">
    <input id="customer_name"><input id="customer_document"><input id="customer_phone"><input id="customer_email">
    <input id="customer_address"><input id="driving_license"><label><input id="customer_birth_date"></label>
    <input id="customer_nationality"><label><input id="license_issue"></label><label><input id="license_expiry"></label><input id="license_issued_by">
    <fieldset id="lrCustomerAddress"></fieldset>
  </div></div>
  <div class="contractStep" id="additionalStep"><h3>Conductor adicional</h3><input id="additional_name"><input id="additional_driving_license"><input id="additional_birth_date"><input id="additional_license_issue"><input id="additional_license_expiry"><input id="additional_license_issued_by"></div>
  <details id="lrCollapse_driver"></details>
  <label><input id="full_insurance" type="checkbox" checked>Seguro completo</label>
  <label><input id="insurance_total" value="10.00"></label><label><input id="franchise"></label>
  <div id="insuranceChoiceEditor"><button id="insuranceStandard"></button><button id="insuranceFull"></button></div>
</form></section>`,{runScripts:'outside-only'});

dom.window.eval(authority.slice(start,end)+';window.applyVehicleFields=applyVehicleFields;');
dom.window.applyVehicleFields();
const $=id=>dom.window.document.getElementById(id);

assert.equal($('renterGrid').style.display,'','the shared renter grid must stay visible');
for(const id of ['customer_name','customer_document','customer_phone','customer_email','customer_nationality'])assert.equal($(id).style.display,'',id+' must remain visible');
for(const id of ['customer_address','driving_license','customer_birth_date','license_issue','license_expiry','license_issued_by'])assert.equal(($(id).closest('label')||$(id)).style.display,'none',id+' must be hidden for bicycles');
assert.equal($('lrCustomerAddress').style.display,'none');
assert.equal($('renterStep').querySelector('.scanBar').style.display,'none');
assert.equal($('additionalStep').style.display,'none');
assert.equal($('lrCollapse_driver').style.display,'none');
assert.equal($('insuranceStandard').style.display,'');
assert.equal($('insuranceFull').style.display,'none');
assert.equal($('full_insurance').checked,false);
assert.equal($('insurance_total').value,'0.00');

$('vehicle_group').value='A';dom.window.applyVehicleFields();
assert.equal($('additionalStep').style.display,'');
assert.equal($('insuranceFull').style.display,'');
assert.equal($('lrCustomerAddress').style.display,'');

const uppercase=fs.readFileSync(path.join(root,'uppercase-fields-v1.js'),'utf8');
assert.doesNotMatch(uppercase,/addEventListener\('input',\(\)=>upperValue/,'iOS typing must not rewrite input values per keystroke');
const pricing=fs.readFileSync(path.join(root,'pricing-manager-v1.js'),'utf8');
assert.doesNotMatch(pricing,/setInterval\(\(\)=>\{ensureCatalog\(\);bindAutomatic\(\)\},1400\)/,'pricing binding must not poll forever');

console.log('bicycle editor fields and typing performance: ok');

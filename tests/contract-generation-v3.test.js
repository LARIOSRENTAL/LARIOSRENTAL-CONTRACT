const assert = require('node:assert/strict');
const fs = require('node:fs');

const fields = {
  customer_document: { value: '', style: {}, dispatchEvent() {} },
  driving_license: { value: '31912176', style: {} },
  customer_phone: { value: '600123123', style: {} },
  payment_method: { value: 'Efectivo', style: {} },
  rental_price: { value: '137,00', style: {} },
  insurance_total: { value: '20,00', style: {} },
  young_driver_amount: { value: '0', style: {} },
  contract_total: { value: '', style: {} },
  franchise: { value: '0', style: {} },
  rental_days: { value: '2', style: {} },
  discount_percent: { value: '0', style: {} },
  vat_percent: { value: '21', style: {} },
  deposit: { value: '0', style: {} },
  vehicle_group: { value: 'A', style: {} },
  full_insurance: { checked: true, style: {} },
  young_driver: { checked: false, style: {} },
};

global.window = global;
global.LariosCurrentContractId = 'contract-argentina';
global.LariosReservations = { edit() {}, save() {}, close() {} };
global.document = {
  getElementById: id => fields[id] || null,
  querySelectorAll: () => [],
};
global.Event = function Event() {};
global.alert = () => { throw new Error('No debía mostrarse una alerta'); };
global.setTimeout = fn => { fn(); return 1; };

require('../app-v84/www/pdf-authority-v3.js');

const authority = global.LariosPdfAuthorityV3;
assert.equal(authority.currentContractId(), 'contract-argentina');
assert.equal(authority.prepareRequiredFields(), true);
assert.equal(fields.customer_document.value, '31912176');
const snapshot = authority.captureFinancialSnapshot();
assert.equal(snapshot.rent, 137);
assert.equal(snapshot.insurance, 20);
assert.equal(snapshot.total, 157);
assert.equal(snapshot.days, 2);
assert.equal(snapshot.paymentMethod, 'Efectivo');

const source = fs.readFileSync(require.resolve('../app-v84/www/pdf-authority-v3.js'), 'utf8');
assert.match(source, /buildPdf\(draft,snapshot\)/);
assert.match(source, /payload\('confirmed',snapshot\)/);
assert.match(source, /La liquidación está a 0/);
assert.match(source, /Falta el teléfono del cliente/);
assert.match(source, /Selecciona la forma de pago/);

console.log('contract generation v3: stable id, required fields and frozen totals ok');

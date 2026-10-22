const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app-v84/www/reservation-quick-v4.js'), 'utf8');
const window = {
  LariosQuickReservationV3: { parseQuick: () => ({ status: 'draft', vehicle_group: '', vehicle_quantity: '1' }) },
  LariosQuickReservationV2: { parseQuick: () => ({}) },
  LariosReservations: {}
};
vm.runInNewContext(source, { window, document: {}, setTimeout: () => 0, console });
const parse = window.LariosQuickReservationV3.parseQuick;
for (const raw of ['9:00 2bicis', '9:00 2 bicis']) {
  const result = parse(raw);
  assert.equal(result.vehicle_group, 'BICICLETA');
  assert.equal(result.vehicle_quantity, '2');
  assert.equal(result.vehicle_model, 'BICICLETA');
  assert.deepEqual(JSON.parse(JSON.stringify(result.vehicle_units)), { bicycle: 2, ebike: 0 });
}
for (const raw of ['9:00 2ebike', '9:00 2 e-bike']) {
  const result = parse(raw);
  assert.equal(result.vehicle_group, 'E-BIKE');
  assert.equal(result.vehicle_quantity, '2');
  assert.equal(result.vehicle_model, 'E-BIKE');
  assert.deepEqual(JSON.parse(JSON.stringify(result.vehicle_units)), { bicycle: 0, ebike: 2 });
}
for (const raw of ['9:00 bici + ebike', '9:00 2bicis y 3ebike', '9:00 2 bicis y 3 ebike', '9:00 bicis x2 y e-bike x3']) {
  const result = parse(raw);
  assert.equal(result.vehicle_group, 'E-BIKE');
  assert.equal(result.vehicle_model, 'BICICLETA · E-BIKE');
  assert.deepEqual(JSON.parse(JSON.stringify(result.vehicle_units)), {
    bicycle: raw.includes('2bicis') || raw.includes('2 bicis') || raw.includes('bicis x2') ? 2 : 1,
    ebike: raw.includes('3ebike') || raw.includes('3 ebike') || raw.includes('x3') ? 3 : 1
  });
  assert.equal(Number(result.vehicle_quantity), result.vehicle_units.bicycle + result.vehicle_units.ebike);
}
console.log('Bicycle/e-bike reservation parsing: ok');
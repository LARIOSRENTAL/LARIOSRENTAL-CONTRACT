const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const quickBooking = read('supabase/functions/renthub-booking/index.ts');
const contractTransfer = read('supabase/functions/renthub-transfer/index.ts');

for (const [name, source] of [['renthub-booking', quickBooking], ['renthub-transfer', contractTransfer]]) {
  assert.match(source, /form\.set\("resource",\s*"freesale"\)/, `${name} must request Free Sale`);
  assert.match(source, /form\.set\("pm_prev_mezzo_id",\s*""\)/, `${name} must leave the vehicle unassigned`);
  assert.match(source, /form\.set\("pm_current_model_id",\s*(?:map\.model|model)\)/, `${name} must send the selected model separately`);
  assert.match(source, /form\.set\("ritiro",\s*(?:map\.pickup|pickup)\)/, `${name} must send Renthub pickup location 132 mapping`);
  assert.match(source, /form\.set\("consegna",\s*(?:map\.dropoff|dropoff)\)/, `${name} must send Renthub dropoff location 132 mapping`);
  assert.match(source, /form\.set\("internal_move",\s*"0"\)/, `${name} must not create an internal movement`);
  assert.doesNotMatch(source, /form\.set\("(?:quantity|vehicle_quantity|resource_quantity)"/, `${name} must not assign bicycle inventory quantity`);
}

assert.match(quickBooking, /actor\.from\("contracts"\)\.update/, 'quick booking status writes must use the authenticated staff session');
assert.doesNotMatch(quickBooking, /service\.from\("contracts"\)\.update/, 'quick booking must not use the restricted service client for contract updates');

console.log('Renthub Free Sale payload: ok');

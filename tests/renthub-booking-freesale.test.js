const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const quickBooking = read('supabase/functions/renthub-booking/index.ts');
const contractTransfer = read('supabase/functions/renthub-transfer/index.ts');

for (const [name, source] of [['renthub-booking', quickBooking], ['renthub-transfer', contractTransfer]]) {
  if (name === 'renthub-booking') {
    assert.match(source, /form\.set\("resource",\s*"freesale"\)/, `${name} must request Free Sale from the Partner endpoint`);
    assert.match(source, /form\.set\("pm_prev_mezzo_id",\s*""\)/, `${name} must leave the concrete vehicle unassigned`);
    assert.match(source, /form\.set\("pm_current_model_id",\s*map\.model\)/, `${name} must send the selected model separately`);
    assert.match(source, /form\.set\("ritiro",\s*map\.pickup\)/, `${name} must send Renthub pickup location 132 mapping`);
    assert.match(source, /form\.set\("consegna",\s*map\.dropoff\)/, `${name} must send Renthub dropoff location 132 mapping`);
    assert.match(source, /form\.set\("internal_move",\s*"0"\)/, `${name} must not create an internal movement`);
  } else {
    assert.match(source, /form\.set\("resource",\s*"freesale"\)/, `${name} must request Free Sale from the Partner endpoint`);
    assert.match(source, /form\.set\("pm_prev_mezzo_id",\s*""\)/, `${name} must leave the Partner API legacy vehicle field empty`);
    assert.match(source, /form\.set\("pm_current_model_id",\s*model\)/, `${name} must send the selected model separately`);
    assert.match(source, /form\.set\("ritiro",\s*pickup\)/, `${name} must send Renthub pickup location 132 mapping`);
    assert.match(source, /form\.set\("consegna",\s*dropoff\)/, `${name} must send Renthub dropoff location 132 mapping`);
    assert.match(source, /form\.set\("internal_move",\s*"0"\)/, `${name} must not create an internal movement`);
  }
  assert.doesNotMatch(source, /form\.set\("(?:quantity|vehicle_quantity|resource_quantity)"/, `${name} must not assign bicycle inventory quantity`);
}

assert.match(quickBooking, /rh\("\/module\/rental\/api\/partner\/booking\/insert"/, 'quick booking must use the supported Renthub Partner insertion');
assert.doesNotMatch(quickBooking, /renthubWeb\(/, 'quick booking must not use Renthub internal web endpoints');
assert.match(quickBooking, /m2:"15"/, '125cc/M2 must use the real Renthub model id');
assert.match(quickBooking, /partner_api:true/, 'health check must verify the Partner API token');
assert.match(quickBooking, /if\(error&&retry\)return loadSecret\(s,false\)/, 'Partner secret loading must retry one transient Supabase failure');
assert.match(quickBooking, /Renthub no tiene Free Sale configurado/, 'availability rejection must explain the required Renthub configuration');
assert.match(quickBooking, /role!=="admin"/, 'only administrators may send a booking to Renthub');

assert.match(quickBooking, /actor\.from\("contracts"\)\.update/, 'quick booking status writes must use the authenticated staff session');
assert.doesNotMatch(quickBooking, /service\.from\("contracts"\)\.update/, 'quick booking must not use the restricted service client for contract updates');

console.log('Renthub Free Sale payload: ok');

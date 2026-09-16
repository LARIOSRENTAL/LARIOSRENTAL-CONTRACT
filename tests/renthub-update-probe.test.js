const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '..', 'supabase/functions/renthub-transfer/index.ts'), 'utf8');

assert.match(source, /fetch\(`\$\{installationUrl\(\)\}\/rental\/booking\/add`/, 'must call the captured Renthub update endpoint');
assert.match(source, /"X-PartnerToken": await partnerToken\(\)/, 'must authenticate with the Partner token');
assert.match(source, /"Content-Type": "application\/x-www-form-urlencoded; charset=UTF-8"/, 'must use the captured form encoding');
assert.match(source, /"X-Requested-With": "XMLHttpRequest"/, 'must identify the request as XHR');
assert.doesNotMatch(source, /(?:Cookie|X-CSRF-TOKEN)["']?\s*:/i, 'must not send browser cookies or CSRF tokens');
assert.match(source, /String\(data\?\.id \|\| ""\) !== payload\.bookingId/, 'must verify Renthub returned the same booking id');
assert.match(source, /pm_stato_prenotazione: "in_corso"/, 'must move the reservation to in progress');
assert.match(source, /pm_ms_id: renthubVehicleId/, 'must assign the physical Renthub vehicle');
assert.match(source, /contract\.app_payload\?\.vehicle_plate/, 'must fall back to the plate persisted in the contract payload');
assert.match(source, /const registration = String\(/, 'must resolve the plate before searching the Renthub fleet');
assert.match(source, /anag_id: registryId/, 'must associate the new real customer');
assert.match(source, /c24d0e33-b968-449d-b542-a0613d4220a8/, 'must limit the temporary test to LR-062831');
assert.match(source, /YASPX-IFENH/, 'must limit the temporary test to the selected Renthub reservation');

console.log('Renthub Partner update probe: ok');

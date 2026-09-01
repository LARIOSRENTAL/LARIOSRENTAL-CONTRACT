const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'scanner-v5.js'), 'utf8');
const context = {
  window: {},
  document: { getElementById: () => null, querySelector: () => null },
  console,
  Event: function Event() {},
};
vm.runInNewContext(source, context);
const parse = context.window.LariosScanner.__testParseIdentityText;

const spanish = parse(`PERMISO DE CONDUCCIÓN REINO DE ESPAÑA
1. GARCIA
MONTERO
2. JAVIER
3. 20-08-1983 ESPAÑA
4a. 01-12-2025 4c. 29-00
4b. 03-12-2035
5. 25728989-Q
9. AM A1 A2 A B`);
assert.equal(spanish.name, 'JAVIER GARCIA MONTERO');
assert.equal(spanish.birth, '1983-08-20');
assert.equal(spanish.issue, '2025-12-01');
assert.equal(spanish.expiry, '2035-12-03');
assert.equal(spanish.license, '25728989-Q');
assert.equal(spanish.country, 'ESPAÑA');

const uk = parse(`UK DRIVING LICENCE
1. GEAL
2. MR ROSS STUART
3. 10.06.1962 ENGLAND
4a. 16.06.2024 4c. DVLA
4b. 09.06.2032
5. GEAL9606102RS9XH67
8. 3A CHAPTER COTTAGE, WARREN PARK,
WARLINGHAM, CR6 9LD
9. AM/A/B1/B`);
assert.equal(uk.name, 'ROSS STUART GEAL');
assert.equal(uk.country, 'REINO UNIDO');
assert.equal(uk.address, '3A CHAPTER COTTAGE, WARREN PARK, WARLINGHAM, CR6 9LD');
assert.equal(uk.license, 'GEAL9606102RS9XH67');

const eu = parse(`FÜHRERSCHEIN MODELL DER EUROPÄISCHEN UNION
1. SALINGER
2. PAUL
3. 13.07.1994 MÖDLING
4a. 11.03.2021 4b. 10.03.2036
4c. BH Mödling
5. 21080013
9. AM A1 B C1 C F`);
assert.equal(eu.name, 'PAUL SALINGER');
assert.equal(eu.birth, '1994-07-13');
assert.equal(eu.issue, '2021-03-11');
assert.equal(eu.expiry, '2036-03-10');
assert.equal(eu.license, '21080013');
assert.equal(eu.country, 'AUSTRIA');

const fullScreen = parse(`El scanner web leerá los campos 1, 2, 3, 4a, 4b, 5 y 8.
1. SALINGER
2. PAUL
3. 13.07.1994 MÖDLING
4a. 11.03.2021
4c. BH Mödling
5. 21080013
4b. 10.03.2036`);
assert.equal(fullScreen.name, 'PAUL SALINGER');
assert.equal(fullScreen.license, '21080013');

console.log('OK parser V6: permisos español, británico y europeo.');

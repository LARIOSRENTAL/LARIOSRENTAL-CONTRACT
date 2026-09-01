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
const parseVehicle = context.window.LariosScanner.__testParseVehicleText;
const bestFleetVehicle = context.window.LariosScanner.__testBestFleetVehicle;

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
assert.equal(eu.document, undefined);

const fullScreen = parse(`El scanner web leerá los campos 1, 2, 3, 4a, 4b, 5 y 8.
Permiso de Conducción
FÜHRERSCHEIN
MODELL DER EUROPÄISCHEN UNION
1. SALINGER
2. PAUL
3. 13.07.1994 MÖDLING
4a. 11.03.2021
4c. BH Mödling
5. 21080013
4b. 10.03.2036`);
assert.equal(fullScreen.name, 'PAUL SALINGER');
assert.equal(fullScreen.license, '21080013');
assert.equal(fullScreen.country, 'AUSTRIA');
assert.equal(fullScreen.document, undefined);

const badgeCountry = parse(`A
FÜHRERSCHEIN
1. MUSTER
2. ANNA
3. 01.02.1990
4a. 02.03.2020
4b. 02.03.2035
5. 998877663`);
assert.equal(badgeCountry.country, 'AUSTRIA');
assert.equal(badgeCountry.license, '998877663');

const argentina = parse(`Licencia Nacional de Conducir
Ciudad Autónoma de Buenos Aires
5. N° Licencia/License N°
31912176
1. Apellido / Last name
QUEIROT
2. Nombre / First name
FERNANDO DANIEL
8. Domicilio / Address
NICARAGUA 5855
3. Fecha de Nac. / Date of birth
22 NOV 1985
4a. Otorgamiento / Date of issue
21 SEP 2023
46. Vencimiento / Expires
28 AGO 2025
República Argentina`);
assert.equal(argentina.name, 'FERNANDO DANIEL QUEIROT');
assert.equal(argentina.license, '31912176');
assert.equal(argentina.birth, '1985-11-22');
assert.equal(argentina.issue, '2023-09-21');
assert.equal(argentina.expiry, '2025-08-28');
assert.equal(argentina.address, 'NICARAGUA 5855');
assert.equal(argentina.country, 'ARGENTINA');

const keyLabel = parseVehicle(`MATRICULA: 8046 MPM.
P MARCA: SKODA : NI
|MODELO: SCALA ) \\
FUEL: GASOLINA-UNLEADED 95 RS`);
assert.deepEqual(JSON.parse(JSON.stringify(keyLabel)), {plate:'8046MPM',make:'SKODA',model:'SCALA',fuel:'GASOLINA'});

const keyTwoPasses = `MATRICULA: 4028« MRC. I
MARCA: FIAT |®.
/ MODELO: 500 71 \\
FUEL: GASOLINA-UNLEADED5 4
--- SEGUNDA LECTURA ---
MATRICULA: 4028 MIRC
MARCA: FIAT
MODELO: 500
FUEL: GASOLINA-UNLEADEDES`;
const keyFiat = parseVehicle(keyTwoPasses);
assert.equal(keyFiat.plate, '4028MRC');
assert.equal(keyFiat.make, 'FIAT');
assert.equal(keyFiat.model, '500');
assert.equal(keyFiat.fuel, 'GASOLINA');

const fleetMatch = bestFleetVehicle([
  {registration:'4028 MRC',make:'FIAT',model:'500',fuel_type:'GASOLINA'},
  {registration:'8046 MPM',make:'SKODA',model:'SCALA',fuel_type:'GASOLINA'},
], 'MATRICULA: 4028 MIRC', {});
assert.equal(fleetMatch.registration, '4028 MRC');

console.log('OK parser V6: permisos español, británico y europeo.');

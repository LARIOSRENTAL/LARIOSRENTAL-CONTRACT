const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const scanner = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'scanner-v5.js'), 'utf8');
const form = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'scanner.js'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'index.html'), 'utf8');

assert.match(scanner, /ESCÁNER NATIVO ML KIT/);
assert.doesNotMatch(scanner, /api\.ocr\.space/);
assert.match(scanner, /worker\.recognize\(file\)/);
assert.match(scanner, /SCANNER WEB DE PERMISOS ACTIVO/);
assert.match(scanner, /OCR DE LLAVEROS ACTIVO/);
assert.doesNotMatch(scanner, /assigned_vehicle_group|result\.group|v\.category/);
assert.match(scanner, /tesseract\.js@5/);

const identity=scanner.slice(scanner.indexOf('async function readIdentity('),scanner.indexOf('function normalizePlate('));
const vehicle=scanner.slice(scanner.indexOf('async function readVehicle('),scanner.indexOf('async function selected('));
assert.match(identity, /webOCR/);
assert.doesNotMatch(identity, /scan-driving-licence|OPENAI_API_KEY/);
assert.match(identity, /nativeText/);
assert.match(vehicle, /getEngine/);
assert.match(vehicle, /OCR/);
assert.match(vehicle, /vehicleCanvas/);
assert.match(vehicle, /parseVehicleText/);
assert.match(vehicle, /vehicles\?select=/);

for (const field of ["'1'", "'2'", "'3'", "'4a'", "'4b'", "'5'", "'8'"]) assert.ok(scanner.includes(field), `Falta el campo europeo ${field}`);
assert.match(scanner, /result\.name=`\$\{given\} \$\{sur\}`/);
assert.match(scanner, /findNumbered\(lines,'8'\)/);
assert.match(html, /scanner-v5\.js\?v=20261104-native-local/);
assert.match(html, /scanner-lock-v6\.js\?v=4/);
assert.match(form, /Precio alquiler \(editable\)<input id="rental_price"/);
assert.doesNotMatch(form, /id="rental_price"[^>]*readonly/);

console.log('OK scanner: permisos mediante Scanner V6 WEB gratuito, llaveros por OCR y grupos separados.');

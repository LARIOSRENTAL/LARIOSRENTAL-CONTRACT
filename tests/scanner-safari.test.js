const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const scanner = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'scanner-v5.js'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'index.html'), 'utf8');

assert.match(scanner, /Scanner V6 WEB · LLAVERO OCR/);
assert.match(scanner, /api\.ocr\.space\/parse\/image/);
assert.match(scanner, /SCANNER WEB DE PERMISOS ACTIVO/);
assert.match(scanner, /OCR DE LLAVEROS ACTIVO/);
assert.match(scanner, /assigned_vehicle_group/);
assert.match(scanner, /tesseract\.js@5/);

const identity = scanner.match(/async function readIdentity\(file\)\{([\s\S]*?)\n\}/)?.[1] || '';
const vehicle = scanner.match(/async function readVehicle\(file\)\{([\s\S]*?)\n\}/)?.[1] || '';
assert.match(identity, /webOCR/);
assert.doesNotMatch(identity, /scan-driving-licence|OPENAI_API_KEY/);
assert.doesNotMatch(identity, /getEngine|Tesseract|recognizePass/);
assert.match(vehicle, /getEngine/);
assert.match(vehicle, /OCR/);
assert.match(vehicle, /vehicleCanvas/);
assert.match(vehicle, /parseVehicleText/);
assert.match(vehicle, /vehicles\?select=/);

for (const field of ["'1'", "'2'", "'3'", "'4a'", "'4b'", "'5'", "'8'"]) assert.ok(scanner.includes(field), `Falta el campo europeo ${field}`);
assert.match(scanner, /result\.name=`\$\{given\} \$\{sur\}`/);
assert.match(scanner, /findNumbered\(lines,'8'\)/);
assert.match(html, /scanner-v5\.js\?v=v6web-free6-20260901/);
assert.match(html, /scanner-lock-v6\.js\?v=4/);

console.log('OK scanner: permisos mediante Scanner V6 WEB gratuito, llaveros por OCR y grupos separados.');

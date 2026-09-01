const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const scanner = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'scanner-v5.js'), 'utf8');
const edge = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'scan-driving-licence', 'index.ts'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'app-v84', 'www', 'index.html'), 'utf8');

assert.match(scanner, /PERMISOS VISIÓN WEB · LLAVEROS OCR/);
assert.match(scanner, /scan-driving-licence/);
assert.match(scanner, /SCANNER WEB DE PERMISOS ACTIVO/);
assert.match(scanner, /OCR DE LLAVEROS ACTIVO/);
assert.match(scanner, /assigned_vehicle_group/);
assert.match(scanner, /tesseract\.js@5/);

const identity = scanner.match(/async function readIdentity\(file\)\{([\s\S]*?)\n\}/)?.[1] || '';
const vehicle = scanner.match(/async function readVehicle\(file\)\{([\s\S]*?)\n\}/)?.[1] || '';
assert.match(identity, /scan-driving-licence/);
assert.doesNotMatch(identity, /getEngine|Tesseract|recognizePass/);
assert.match(vehicle, /getEngine/);
assert.match(vehicle, /OCR/);
assert.match(vehicle, /vehicles\?select=/);

for (const field of ['"1"', '"2"', '"3"', '"4a"', '"4b"', '"5"', '"8"']) {
  assert.ok(edge.includes(field), `Falta el campo europeo ${field}`);
}
assert.match(edge, /campo 2 \+ espacio \+ campo 1/);
assert.match(edge, /domicilio, solo cuando exista/);
assert.match(edge, /OPENAI_API_KEY/);
assert.match(edge, /authorization/);
assert.match(edge, /IMAGE_TOO_LARGE/);
assert.match(edge, /Cache-Control.*no-store/);

assert.match(html, /scanner-v5\.js\?v=vision3-20260901/);
assert.match(html, /scanner-lock-v6\.js\?v=3/);

console.log('OK scanner: permisos por visión web, llaveros por OCR y mapeo europeo protegido.');

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const path = join(__dirname, '..', 'app-v84', 'www', 'scanner-v5.js');
let source = readFileSync(path, 'utf8');

assert.doesNotMatch(source, /PaddleOCR|process\.binding|@paddleocr/);
assert.match(source, /tesseract\.js@5/);
assert.match(source, /tessedit_pageseg_mode/);
assert.match(source, /assigned_vehicle_group/);
assert.match(source, /coreCount\(parsed\)<4/);

source = source.replace(
  'window.LariosScanner={open,close,choose,selected,apply,upload};',
  'window.__parseIdentity=parseIdentity; window.__coreCount=coreCount; window.LariosScanner={open,close,choose,selected,apply,upload};'
);

const sandbox = {
  window: {},
  document: {
    querySelector() { return null; },
    getElementById() { return null; }
  },
  console,
  Date,
  RegExp,
  String,
  Number,
  Object,
  Array,
  Math
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const ocrText = `PERMISO DE CONDUCCION REINO DE ESPANA
1. GARCIA
MONTERO
6. 2. JAVIER
3. 20-08-1983 ESPANA
4a.01-12-2025 4c.29-00
4b.03-12-2035
5. 25728989-Q
9. AM A1 A2 A B`;

const parsed = sandbox.window.__parseIdentity(
  ocrText.split('\n').map(text => ({ text, score: 0.94 }))
);

assert.deepEqual(JSON.parse(JSON.stringify(parsed)), {
  country: 'ESPAÑA',
  name: 'JAVIER GARCIA MONTERO',
  birth: '1983-08-20',
  issue: '2025-12-01',
  expiry: '2035-12-03',
  license: '25728989-Q'
});
assert.equal(sandbox.window.__coreCount(parsed), 6);

console.log('OK scanner Safari: motor compatible, doble pasada y extracción validada.');

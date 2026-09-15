const assert=require('node:assert/strict');
const fs=require('node:fs');

const workflow=fs.readFileSync('app-v84/www/workflow-improvements-v1.js','utf8');
const signature=fs.readFileSync('app-v84/www/signature-persistence-v1.js','utf8');

assert.doesNotMatch(workflow,/formulario todavía no está preparado para guardarse/);
assert.match(workflow,/bridge\?\.payload\?bridge\.payload\(\):\{\.\.\.prior\}/);
assert.match(signature,/sessionStorage\.setItem/);
assert.match(signature,/signatureCanvas/);
assert.match(signature,/pointerup/);
assert.match(signature,/Aceptar firma/);
console.log('existing contract payment and temporary signature persistence: ok');

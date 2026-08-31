const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app-v84/www/auth-access-v1.js'),'utf8');
assert.match(source,/invite/);
assert.match(source,/recovery/);
assert.match(source,/auth\/v1\/user/);
assert.match(source,/Mínimo 10 caracteres/);
assert.doesNotMatch(source,/service_role/i);
console.log('invite and password recovery flow: ok');

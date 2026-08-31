const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app-v84/www/user-profile-v1.js'),'utf8');
assert.match(source,/Mi perfil y contraseña/);
assert.match(source,/current_password/);
assert.match(source,/auth\/v1\/user/);
assert.match(source,/Cambiar mi contraseña/);
assert.doesNotMatch(source,/service_role/i);
console.log('self-service password profile: ok');

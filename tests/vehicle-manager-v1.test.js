const assert=require('node:assert/strict');
global.window=global;
global.document={readyState:'loading',addEventListener(){}};
require('../app-v84/www/vehicle-manager-v1.js');
const t=global.LariosVehicleManager.__test;
assert.equal(t.plate(' 1234-abc '),'1234ABC');
assert.equal(t.categoryValue('Grupo A'),'A');
assert.equal(t.categoryValue('125cc'),'125CC');
console.log('vehicle manager helpers: ok');

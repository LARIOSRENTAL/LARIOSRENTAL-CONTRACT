const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window=global;
global.document={readyState:'loading',addEventListener(){}};
require('../app-v84/www/pricing-manager-v1.js');
const t=global.LariosPricingManager.__test;
t.setPeriods([
 {id:'base-special',active:true,start_date:'2026-08-01',end_date:'2026-08-31',priority:100,created_at:'2026-01-01'},
 {id:'priority',active:true,start_date:'2026-08-15',end_date:'2026-08-20',priority:200,created_at:'2026-01-01'},
 {id:'inactive',active:false,start_date:'2026-08-01',end_date:'2026-08-31',priority:999,created_at:'2026-01-01'}
]);
assert.equal(t.selectedFor('2026-08-10').id,'base-special');
assert.equal(t.selectedFor('2026-08-17').id,'priority');
assert.equal(t.selectedFor('2026-09-01'),null);
const source=fs.readFileSync(require.resolve('../app-v84/www/pricing-manager-v1.js'),'utf8');
assert.doesNotMatch(source,/box\.disabled\s*=\s*true/);
assert.match(source,/box\.disabled=false/);
assert.match(source,/tariffManual/);
assert.match(source,/puedes seleccionar Tarifa 94 manualmente/);
console.log('pricing period selection: ok');

const assert=require('node:assert/strict');
global.window={};
global.document={readyState:'loading',addEventListener(){}};
require('../app-v84/www/vehicle-typeahead-v1.js');
const t=global.window.LariosVehicleTypeahead.__test;
const rows=[
  {registration:'9504MZP',make:'Toyota',model:'Aygo'},
  {registration:'1234MZP',make:'Kia',model:'Picanto'},
  {registration:'5678ABC',make:'Seat',model:'Ibiza'},
];
assert.deepEqual(t.search(rows,'mzp').map(v=>v.registration),['1234MZP','9504MZP']);
assert.deepEqual(t.search(rows,'9504-').map(v=>v.registration),['9504MZP']);
assert.deepEqual(t.search(rows,''),[]);
assert.deepEqual(t.search(rows,'not-a-plate'),[]);
assert.equal(t.norm(' ab-12 3 '),'AB123');
console.log('vehicle plate typeahead filtering: ok');

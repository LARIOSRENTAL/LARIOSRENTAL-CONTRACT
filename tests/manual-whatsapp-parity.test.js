const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../app-v84/www/quick-reservation-authority-v1.js'),'utf8');
const window={
  LariosBookingParser:{extras:raw=>({text:raw,payload:{}})},
  LariosQuickFields:{clean:(raw,p)=>p},
  LariosQuickReservationV3:{parseQuick:text=>({normalized_text:text})},
  LariosQuickReservationV2:{parseQuick:text=>({normalized_text:text})},
  LariosReservations:{},
  addEventListener:()=>{}
};
const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
vm.runInNewContext(source,{window,document,setTimeout:()=>0,console,fetch:()=>{throw Error('unexpected fetch')}});

assert.equal(window.LariosQuickAuthority.normalize('Mañana 10 00 Grupo A un día Zenit 509'),'Mañana 10:00 Grupo A un día Zenit 509');
assert.equal(window.LariosQuickAuthority.normalize('11002 bicis un día bro 408'),'11:00 2 bicis un día bro 408');

const cars=window.LariosQuickAuthority.manualItems({vehicle_group:'A',vehicle_quantity:'2',total:'100',rental_price:'80',reservation_detail:'REF 1'});
assert.equal(cars.length,2);
assert.equal(cars[0].vehicle_quantity,'1');
assert.equal(cars[0].total,'50.00');
assert.match(cars[1].reservation_detail,/UNIDAD 2 DE 2/);

const bikes=window.LariosQuickAuthority.manualItems({vehicle_group:'BICICLETA',vehicle_quantity:'2'});
assert.equal(bikes.length,1);
assert.equal(bikes[0].vehicle_quantity,'2');

assert.match(source,/app_normalize_manual_reservation/);
assert.match(source,/await rpc\('app_save_contract'/);
console.log('Manual/WhatsApp parser parity: ok');

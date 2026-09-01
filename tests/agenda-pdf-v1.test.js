const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window=global;
global.document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null}};
require('../app-v84/www/agenda-pdf-v1.js');

(async()=>{
  const t=global.LariosAgendaPdf.__test;
  const delivery=t.entry({status:'confirmed',pickup_at:'2026-09-02T08:00:00Z',pickup_location:'Hotel Centro',customer_name:'Cliente',vehicle_plate:'1234 ABC',vehicle_model:'Seat Ibiza',rental_days:2,contract_number:'LR-1'},'delivery');
  const returned=t.entry({status:'returned',return_at:'2026-09-02T10:00:00Z',return_location:'Oficina',customer_name:'Cliente',vehicle_plate:'1234 ABC',contract_number:'LR-1'},'return');
  assert.equal(delivery.done,true);
  assert.equal(delivery.status,'CONTRATO REALIZADO');
  assert.match(delivery.meta,/2 días/);
  assert.equal(returned.done,true);
  assert.equal(returned.status,'VEHÍCULO RECOGIDO');
  const source=fs.readFileSync(require.resolve('../app-v84/www/agenda-pdf-v1.js'),'utf8');
  assert.match(source,/Descargar agenda PDF/);
  assert.match(source,/ROWS_PER_PAGE=4/);
  assert.match(source,/agenda-'\+snapshot\.date\+'\.pdf/);
  const lib=require('../static/vendor/pdf-lib.min.js');
  const result=await global.LariosAgendaPdf.buildPdf({date:'2026-09-02',deliveries:[{status:'draft',pickup_at:'2026-09-02T08:00:00Z'}],returns:[{status:'returned',return_at:'2026-09-02T10:00:00Z'}]},lib);
  assert.equal(result.pages,1);
  assert.equal(Buffer.from(result.bytes).subarray(0,4).toString(),'%PDF');
  console.log('daily agenda PDF states and layout: ok');
})().catch(error=>{console.error(error);process.exitCode=1});

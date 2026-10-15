// Real PDF-lib generation with a minimal DOM and intercepted network; no live writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const PDFLib=require('../static/vendor/pdf-lib.min.js');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app-v84/www/pdf-authority-v3.js'),'utf8');
const baseline=execFileSync('git',['show','cd5292c:app-v84/www/pdf-authority-v3.js'],{cwd:root,encoding:'utf8'});
const optimized=fs.readFileSync(path.join(root,'app-v84/www/assets/contrato-larios-optimizado.pdf'));
const original=fs.readFileSync(path.join(root,'static/assets/contrato-larios-normalizado.pdf'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const id='11111111-1111-4111-8111-111111111111';

async function scenario(options={}){
 const calls=[],alerts=[],downloads=[],notices=[];
 let mailDone=false;
 const fields={};
 function element(){return{style:{},children:[],setAttribute(k,v){this[k]=v},appendChild(child){this.children.push(child)},remove(){this.removed=true},click(){if(this.href)downloads.push(this.download)},dispatchEvent(){},focus(){}}}
 const values={customer_name:'PRUEBA PDF',customer_phone:'600123123',customer_email:options.noEmail?'':'test@example.invalid',customer_document:'PRUEBA',driving_license:'PRUEBA',vehicle_group:'BICICLETA',payment_method:'Efectivo',rental_price:'100',rental_days:'2',pickup_date:'2026-10-15',return_date:'2026-10-17',agency:'MALAGA CENTRO HOTEL'};
 for(const [key,value] of Object.entries(values))fields[key]={...element(),value};
 fields.cash_without_card={checked:true};
 const ink=new Uint8ClampedArray(8*4);for(let i=3;i<ink.length;i+=4)ink[i]=255;
 fields.signatureCanvas={...element(),width:8,height:1,getContext:()=>({getImageData:()=>{if(options.unreadableSignature)throw new Error('tainted');return{data:options.emptySignature?new Uint8ClampedArray(8*4):options.whiteSignature?new Uint8ClampedArray(8*4).fill(255):ink}}}),toDataURL:()=>options.invalidSignature?'data:image/png;base64,invalid':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='};
 if(options.noSignature)delete fields.signatureCanvas;
 if(options.extras){fields.v2_child_seat={checked:true};fields.v2_child_seat_qty={value:'2'}}
 const button={...element(),textContent:'Generar contrato'};
 const asset=options.legacy?original:optimized;
 let downloadedBlob;
 class TestURL extends URL{static createObjectURL(blob){downloadedBlob=blob;return'blob:test'}static revokeObjectURL(){}}
 const context=vm.createContext({console,PDFLib,Blob,URL:TestURL,Uint8Array,ArrayBuffer,performance,Event:class{},cfg:{supabaseUrl:'https://pdf-test.invalid',supabasePublishableKey:'test-only'},token:'test-only',location:{href:'https://pdf-test.invalid/'},alert:message=>alerts.push(message),setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);if(ms>3000)timer.unref();return timer},document:{scripts:[],getElementById:key=>fields[key]||null,querySelectorAll:()=>[button],createElement:element,addEventListener(){},body:{appendChild(node){if(node.role)notices.push(node)}}},fetch:async(url,init={})=>{
  if(url.includes('/assets/'))return{ok:true,arrayBuffer:async()=>asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength)};
  const call={url,method:init.method};calls.push(call);
  if(url.includes('/rpc/app_save_contract')){
   call.payload=JSON.parse(init.body).p_payload;await delay(options.network?75:0);
   return{ok:true,json:async()=>({id,contract_number:999999,status:call.payload.status})};
  }
  if(url.includes('/storage/')){await delay(options.network?Math.round(init.body.size*8/1000):0);return{ok:!options.uploadFail}}
  if(init.method==='PATCH'){await delay(options.network?75:0);return{ok:!options.linkFail}}
  if(url.includes('/send-contract')){await delay(options.network?1000:400);mailDone=true;return{ok:!options.mailFail,status:options.mailFail?502:200,json:async()=>options.mailFail?{ok:false,error:'Prueba correo'}:{ok:true,sent:true}}}
  throw new Error('Unexpected request: '+url);
 }});
 context.window=context;
 context.LariosCurrentContractId=id;
 context.LariosReservations={save(){},close(){context.closedContract=true}};
 vm.runInContext(options.legacy?baseline:source,context);
 await delay(370);
 const start=performance.now();
 const task=context.LariosPdfAuthorityV3.finalize();
 if(options.duplicate)await Promise.all([task,context.LariosPdfAuthorityV3.finalize()]);else await task;
 const elapsed=Math.round(performance.now()-start),finishedBeforeMail=!mailDone;
 if(options.noSignature||options.emptySignature||options.whiteSignature||options.unreadableSignature){
  assert.equal(calls.length,0,'No server writes without a verified signature');
  assert.equal(downloads.length,0);
  assert.ok(alerts.some(x=>/firma/.test(x)));
 }else if(options.uploadFail||options.linkFail||options.invalidSignature){
  assert.equal(downloads.length,0);
  assert.equal(calls.filter(c=>c.payload?.status==='confirmed').length,0);
  assert.equal(calls.filter(c=>c.url.includes('send-contract')).length,0);
  assert.ok(alerts.some(x=>/No se pudo generar/.test(x)));
 }else{
  assert.deepEqual(downloads,['LR-999999.pdf']);
  assert.equal(calls.filter(c=>c.payload?.status==='draft').length,1);
  assert.equal(calls.filter(c=>c.payload?.status==='confirmed').length,1);
  assert.equal(calls.find(c=>c.payload?.status==='confirmed').payload.total,options.extras?'124.00':'100.00');
  if(options.extras)assert.equal(calls.find(c=>c.payload?.status==='confirmed').payload.extras_detail[0].total,24);
  const doc=await PDFLib.PDFDocument.load(await downloadedBlob.arrayBuffer());
  assert.equal(doc.getPageCount(),2,'Both original contract pages must remain');
  const images=[...doc.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject')).asMap().values()];
  assert.ok(images.some(ref=>doc.context.lookup(ref).dict?.get(PDFLib.PDFName.of('Width'))?.asNumber()===1),'Synthetic signature must be embedded');
  if(!options.legacy&&!options.noEmail)assert.equal(finishedBeforeMail,true,'PDF must not wait for email');
  await delay(options.network?1100:450);
  assert.equal(calls.filter(c=>c.url.includes('send-contract')).length,options.noEmail?0:1);
  if(options.mailFail)assert.ok(notices.some(n=>n.role==='alert'&&/contrato guardado.*Correo sin confirmar/.test(n.textContent)));
  assert.equal(alerts.length,options.legacy?1:0);
  assert.equal(button.disabled,false);
 }
 return{elapsed,timings:context.LariosPdfAuthorityV3.lastTimings};
}

(async()=>{
 assert.ok(optimized.length<original.length*.15,'Template must be at least 85% smaller');
 for(const options of [{noSignature:true},{emptySignature:true},{whiteSignature:true},{unreadableSignature:true},{invalidSignature:true},{duplicate:true},{extras:true},{uploadFail:true},{linkFail:true},{mailFail:true},{noEmail:true}]){await scenario(options);console.log('PASS',options)}
 const before=await scenario({legacy:true,network:true});
 const after=await scenario({network:true});
 console.log('Simulated 1 Mbps upload, Node PDF-lib (not device measurements):',JSON.stringify({before,after}));
 assert.ok(after.elapsed<before.elapsed*.3,'At least 70% faster in controlled 1 Mbps case');
})().catch(error=>{console.error(error);process.exitCode=1});

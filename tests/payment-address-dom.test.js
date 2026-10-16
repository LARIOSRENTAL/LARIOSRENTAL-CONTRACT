const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<html><head><style>.hidden{display:none!important}</style></head><body><input id="customer_address" value="LEGACY ADDRESS"><label><select id="payment_method"><option value="Tarjeta">Tarjeta</option><option value="Tarjeta / Stripe">Tarjeta / Stripe</option><option value="Efectivo">Efectivo</option></select></label><input id="contract_total" value="123"></body></html>',{url:'https://example.invalid/',runScripts:'outside-only'});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id),tick=()=>new Promise(r=>setImmediate(r));
 const observers=[],OriginalObserver=w.MutationObserver;w.MutationObserver=class extends OriginalObserver{constructor(cb){super(cb);observers.push(this)}};
 const select=value=>{$('payment_method').value=value;$('payment_method').dispatchEvent(new w.Event('change',{bubbles:true}))};
 const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))};
 try{
  for(const f of ['customer-address-v1.js','payment-methods-v1.js'])w.eval(fs.readFileSync(path.join(__dirname,'../app-v84/www',f),'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
  assert.equal($('lrPaymentMethods').classList.contains('hidden'),true);
  assert.equal($('customer_address_street').value,'LEGACY ADDRESS');
  select('Stripe');assert.equal($('lrPaymentMethods').classList.contains('hidden'),false);
  assert.equal($('lrBankBtn').hidden,true);
  for(const id of ['lrTerminalBtn','lrTapBtn','lrCheckoutBtn'])assert.equal($(id).hidden,false);
  select('Tarjeta');assert.equal($('lrPaymentMethods').classList.contains('hidden'),true);
  input('customer_address_street','Calle Mayor');input('customer_address_number','12 B');input('customer_address_city_postal','Málaga 29001');
  assert.equal($('customer_address').value,'Calle Mayor 12 B, Málaga 29001');
  assert.deepEqual(JSON.parse(JSON.stringify(w.LariosAddress.payload())),{customer_address_parts:{street:'Calle Mayor',number:'12 B',city_postal:'Málaga 29001'}});
  d.dispatchEvent(new w.CustomEvent('larios:reservation-opened',{detail:{record:{id:'another',customer_address:'OTHER LEGACY'}}}));
  assert.equal($('customer_address_number').value,'');assert.equal($('customer_address_city_postal').value,'');assert.equal($('customer_address_street').value,'OTHER LEGACY');
  d.dispatchEvent(new w.CustomEvent('larios:reservation-opened',{detail:{record:{id:'saved',app_payload:{customer_address_parts:{street:'RUE TEST',number:'10',city_postal:'75001 Paris'}}}}}));
  assert.equal($('customer_address').value,'RUE TEST 10, 75001 Paris');
  assert.equal(d.querySelectorAll('#lrCustomerAddress').length,1);
  select('Tarjeta / Stripe');$('payment_method').appendChild(d.createElement('option'));await tick();
  assert.equal($('payment_method').value,'Stripe');
  assert.equal([...$('payment_method').options].filter(o=>o.value==='Stripe').length,1);
  console.log('PASS Tarjeta without sub-options, three Stripe channels, structured address, hydration and no cross-contract leaks');
 }finally{for(const observer of observers)observer.disconnect();w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

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
  assert.equal($('customer_address_line').value,'LEGACY ADDRESS');
  assert.equal(d.querySelectorAll('#lrCustomerAddress input').length,2);
  assert.match($('customer_address_line').parentElement.textContent,/Calle y número \/ Street and number/);
  assert.equal($('customer_address_city_postal').parentElement.firstChild.textContent,'Ciudad / código postal · City / postal code');
  select('Stripe');assert.equal($('lrPaymentMethods').classList.contains('hidden'),false);
  assert.equal($('lrBankBtn').hidden,true);
  for(const id of ['lrTerminalBtn','lrTapBtn','lrCheckoutBtn'])assert.equal($(id).hidden,false);
  select('Tarjeta');assert.equal($('lrPaymentMethods').classList.contains('hidden'),true);
  input('customer_address_line','Calle Mayor 12 B');input('customer_address_city_postal','Málaga 29001');
  assert.equal($('customer_address').value,'Calle Mayor 12 B, Málaga 29001');
  assert.deepEqual(JSON.parse(JSON.stringify(w.LariosAddress.payload())),{customer_address_parts:{street:'Calle Mayor',number:'12 B',city:'Málaga',postal_code:'29001',street_number:'Calle Mayor 12 B',city_postal:'Málaga 29001'}});
  for(const [line,street,number] of [['12 High Street','High Street','12'],['Calle Mayor,12','Calle Mayor','12'],['Calle Mayor nº 12','Calle Mayor','12'],['Rue Test 12-14','Rue Test','12-14'],['Calle Mayor s/n','Calle Mayor','s/n']])assert.deepEqual(JSON.parse(JSON.stringify(w.LariosAddress.splitStreet(line))),{street,number});
  for(const [line,city,postal_code] of [['29001 Málaga','Málaga','29001'],['Málaga/29001','Málaga','29001'],['London SW1A 1AA','London','SW1A 1AA'],['Amsterdam 1012 AB','Amsterdam','1012 AB'],['Toronto M5V 3A8','Toronto','M5V 3A8'],['New York 10001-1234','New York','10001-1234']])assert.deepEqual(JSON.parse(JSON.stringify(w.LariosAddress.splitCity(line))),{city,postal_code});
  d.dispatchEvent(new w.CustomEvent('larios:reservation-opened',{detail:{record:{id:'another',customer_address:'OTHER LEGACY'}}}));
  assert.equal($('customer_address_city_postal').value,'');assert.equal($('customer_address_line').value,'OTHER LEGACY');
  d.dispatchEvent(new w.CustomEvent('larios:reservation-opened',{detail:{record:{id:'saved',app_payload:{customer_address_parts:{street:'RUE TEST',number:'10',city:'Paris',postal_code:'75001'}}}}}));
  assert.equal($('customer_address').value,'RUE TEST 10, Paris 75001');
  assert.equal(d.querySelectorAll('#lrCustomerAddress').length,1);
  select('Tarjeta / Stripe');$('payment_method').appendChild(d.createElement('option'));await tick();
  assert.equal($('payment_method').value,'Stripe');
  assert.equal([...$('payment_method').options].filter(o=>o.value==='Stripe').length,1);
  console.log('PASS Tarjeta without sub-options, three Stripe channels, structured address, hydration and no cross-contract leaks');
 }finally{for(const observer of observers)observer.disconnect();w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

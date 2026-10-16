const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="reservation"><div class="toolbar"></div></div><form id="reservationForm"></form><input id="customer_phone"><input id="customer_email"><input id="customer_address">',{runScripts:'outside-only',url:'https://example.invalid/'}),w=dom.window,d=w.document;
 w.cfg={supabaseUrl:'https://test.invalid',supabasePublishableKey:'test-only'};w.token='test-only';w.LariosCurrentContractId='test-contract';w.setInterval=()=>1;w.clearInterval=()=>{};
 const observers=[],Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(cb){super(cb);observers.push(this)}};
 const response={customer_phone:'600123123',customer_email:'test@example.invalid',customer_address:'12 High Street, London SW1A 1AA',customer_address_parts:{street:'High Street',number:'12',city:'London',postal_code:'SW1A 1AA',street_number:'12 High Street',city_postal:'London SW1A 1AA'}};
 w.fetch=async url=>({ok:true,json:async()=>url.includes('/pricing')?[]:url.endsWith('app_tablet_list_devices')?[{id:'test-device',label:'Test tablet'}]:url.endsWith('app_tablet_assign')?'test-job':url.endsWith('app_tablet_job')?{status:'completed',response}:true});
 w.eval(fs.readFileSync('app-v84/www/customer-address-v1.js','utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.LariosAddress.setParts({street:'OLD STREET',number:'99',city:'Old city',postal_code:'99999'});
 w.eval(fs.readFileSync('app-v84/www/client-tablet-bridge-v1.js','utf8'));
 await w.LariosClientTablet.open();d.querySelector('.lrTabletDevice').click();
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.equal(d.getElementById('customer_phone').value,response.customer_phone);
 assert.equal(d.getElementById('customer_email').value,response.customer_email);
 assert.equal(d.getElementById('customer_address_line').value,'12 High Street');
 assert.equal(d.getElementById('customer_address_city_postal').value,'London SW1A 1AA');
 const parts=w.LariosAddress.payload().customer_address_parts;assert.equal(parts.street,'High Street');assert.equal(parts.number,'12');assert.equal(parts.city,'London');assert.equal(parts.postal_code,'SW1A 1AA');
 observers.forEach(o=>o.disconnect());w.close();console.log('PASS completed tablet job replaces old address parts in editor and save payload');
})().catch(e=>{console.error(e);process.exitCode=1});

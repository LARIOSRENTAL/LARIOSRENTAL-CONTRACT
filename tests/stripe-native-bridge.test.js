const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const bridge=fs.readFileSync(require.resolve('../app-v84/native/tap-to-pay.js'),'utf8').replace(/^import .*;\n/gm,'');
const chooser=fs.readFileSync(require.resolve('../app-v84/www/payment-methods-v1.js'),'utf8');
const interaction=fs.readFileSync(require.resolve('../app-v84/www/reservation-interaction-fix-v1.js'),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await wait()}throw Error('Timed out')}
async function run({wallet=false,lostConfirmation=false,oldAndroid=false}={}){
 const dom=new JSDOM('<body><section id="reservation"><form id="reservationForm"><select id="payment_method"><option>Stripe</option></select><input id="contract_total" value="78"><input id="signature" value="original-signature"><input id="fuel_out" value="1/2"></form></section></body>',{url:'https://localhost/',runScripts:'outside-only'}),w=dom.window;const calls=[],sdk=[];let paid=false;
 w.eval("var cfg={supabaseUrl:'https://example.test',supabasePublishableKey:'public'};var token='staff';");
 w.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true};w.Device={getInfo:async()=>({platform:'android',osVersion:oldAndroid?'12':'14'})};w.TerminalEventsEnum={RequestedConnectionToken:'token',UnexpectedReaderDisconnect:'disconnect'};w.TerminalConnectTypes={TapToPay:'tap-to-pay'};
 w.StripeTerminal={addListener:async()=>{},initialize:async()=>{},discoverReaders:async()=>{sdk.push('discover');return{readers:[{id:'native-reader'}]}},connectReader:async()=>{sdk.push('connect')},collectPaymentMethod:async()=>{sdk.push('collect')},confirmPaymentIntent:async()=>{sdk.push('confirm');paid=true;if(lostConfirmation)throw Error('connection interrupted')},cancelCollectPaymentMethod:async()=>{}};
 w.LariosCurrentContractId='contract-1';w.LariosWorkflow={saveOpenReservation:async()=>({id:'contract-1'})};w.LariosAccess={isAdmin:()=>false};w.LariosSignaturePersistence={save(){}};w.LariosReservations={edit(){throw Error('Payment must not reopen the editor')}};w.LariosSafeCardPersistence={hydrate:async()=>{},setStripeCard(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.alert=()=>{throw Error('Unexpected browser alert')};
 w.fetch=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return{ok:true,json:async()=>b.action==='native_config'?{mode:'live',location_id:'tml_native'}:b.action==='native_create'?{payment_intent_id:'pi_native',client_secret:'secret'}:b.action==='native_verify'?{paid,status:paid?'paid':'processing',contract_id:'contract-1',reusable:!wallet,card:{last4:'4242'}}:{}}};
 const observers=[];const Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(cb){super(cb);observers.push(this)}};
 w.eval(bridge);w.eval(chooser);w.eval(interaction);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await wait();
 w.document.getElementById('lrTerminalAmount').value='1';
 const task=w.LariosPayments.tap();
 if(oldAndroid){await task;assert.match(w.document.getElementById('lrPayStatus').textContent,/Android 13/);assert.equal(calls.some(c=>c.action==='native_create'),false)}
 else{
  await until(()=>w.document.querySelector('dialog[open]'));const d=w.document.querySelector('dialog');assert.equal(d.querySelector('.primary').disabled,true);w.dispatchEvent(new w.Event('focus'));assert.equal(d.open,true);
  const check=d.querySelector('input');check.checked=true;check.dispatchEvent(new w.Event('change'));d.querySelector('.primary').click();await task;
  assert.equal(calls.find(c=>c.action==='native_create').amount_cents,7800,'Use saved contract total, not physical-reader amount');assert.equal(calls.filter(c=>c.action==='native_create').length,1);assert.deepEqual(sdk,['discover','connect','collect','confirm']);assert.equal(w.localStorage.getItem('lr_native_tap_pending'),null);
  assert.match(w.document.getElementById('lrPayStatus').textContent,wallet?/registro/:/tarjeta registrada/);assert.equal(w.document.getElementById('signature').value,'original-signature');assert.equal(w.document.getElementById('fuel_out').value,'1/2');
 }
 for(const o of observers)o.disconnect();dom.window.close();
}
(async()=>{await run();await run({wallet:true});await run({lostConfirmation:true});await run({oldAndroid:true});console.log('Native bridge: consent survives focus, exact amount, staff flow, interrupted confirmation and preserved form: ok')})().catch(e=>{console.error(e);process.exit(1)});

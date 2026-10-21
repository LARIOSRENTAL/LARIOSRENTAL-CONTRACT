const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require.resolve('../app-v84/www/payment-methods-v1.js'),'utf8');
const interaction=fs.readFileSync(require.resolve('../app-v84/www/reservation-interaction-fix-v1.js'),'utf8');
const wait=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(admin,reusable=false){
 const dom=new JSDOM('<body><section id="reservation"><form id="reservationForm"><label><select id="payment_method"><option>Stripe</option></select></label><input id="contract_total" value="78"><input id="fuel_out" value="1/2"><input id="signature" value="signature-unchanged"></form></section></body>',{url:'https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];let saves=0;w.cfg={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public'};w.token='user';w.LariosCurrentContractId='contract-1';w.LariosCurrentContract={id:'contract-1'};w.LariosAccess={isAdmin:()=>admin};w.LariosWorkflow={saveOpenReservation:async()=>{saves++;await wait(60);return{id:w.LariosCurrentContractId}}};w.LariosSignaturePersistence={save(){}};w.alert=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.fetch=async(url,init)=>{const body=JSON.parse(init.body);body.action=body.action.replace(/^external_/, '');calls.push(body);const payment={contract_number:63200,amount_cents:7800,paid_at:new Date().toISOString(),brand:'visa',last4:'4242',payment_intent_id:'pi_test123',livemode:true};const data=body.action==='recent'?{candidates:[payment],contract_number:63200}:body.action==='link'?{...payment,linked:true,paid:true,reusable,metadata_synced:true}:body.action==='setup_create'?{setup_url:'https://checkout.stripe.com/c/pay/test'}:{reusable:false};return{ok:true,json:async()=>data}};
 const observers=[];const Observer=w.MutationObserver;w.MutationObserver=class extends Observer{constructor(cb){super(cb);observers.push(this)}};
 w.eval(source);w.eval(interaction);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await wait();
 const button=w.document.getElementById('lrLinkStripeBtn');assert.equal(button.hidden,!admin);assert.ok(w.document.getElementById('lrRegisterStripeCardBtn'));
 if(admin){
  w.LariosPayments.tap();assert.equal(w.document.getElementById('lrExternalPaymentDialog').open,true,'Dialog must open before slow draft save');assert.equal(w.document.getElementById('lrExternalReference'),null,'No payment code to copy');
  await wait(100);assert.match(w.document.getElementById('lrExternalResult').textContent,/78,00/);assert.equal(w.document.getElementById('lrExternalConfirm').hidden,false);
  w.dispatchEvent(new w.Event('focus'));w.document.dispatchEvent(new w.Event('visibilitychange'));await wait();assert.equal(w.document.getElementById('lrExternalPaymentDialog').open,true,'Switching applications must preserve the payment dialog');assert.equal(saves,1,'Resuming and searching must not save the whole contract again');
  w.document.getElementById('lrExternalConfirm').click();await wait(50);if(!reusable)assert.match(w.document.getElementById('lrExternalResult').textContent,/Cobro vinculado/);assert.equal(calls.filter(c=>c.action==='link').length,1);assert.equal(calls.filter(c=>c.action==='preview').length,0,'One confirmation without a separate preview step');
  if(!reusable){assert.equal(w.document.getElementById('lrExternalSetupLink').href,'https://checkout.stripe.com/c/pay/test','Missing reusable card prepares the necessary customer page without another dialog');assert.equal(w.document.querySelectorAll('dialog[open]').length,1);w.document.getElementById('lrExternalClose').click()}else{assert.equal(w.document.getElementById('lrExternalPaymentDialog'),null,'Reusable card completes and closes after the single confirmation');assert.equal(calls.filter(c=>c.action==='setup_create').length,0)}assert.equal(w.document.getElementById('signature').value,'signature-unchanged');assert.equal(w.document.getElementById('fuel_out').value,'1/2');assert.equal(w.sessionStorage.getItem('lr_pending_stripe_link'),null);
 }
 for(const observer of observers)observer.disconnect();dom.window.close();
}
(async()=>{await run(true);await run(true,true);await run(false);console.log('Immediate latest-payment dialog, single confirmation, app-switch persistence, admin restriction and preserved editor: ok')})().catch(e=>{console.error(e);process.exit(1)});

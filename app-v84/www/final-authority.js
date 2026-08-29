(function(){
'use strict';
function installAuthoritativeFlow(){
  if(!window.LariosReservations)return;
  const old=document.getElementById('lr-authority-reload');
  if(old)old.remove();
  const s=document.createElement('script');
  s.id='lr-authority-reload';
  s.src='pdf-authority-v3.js?authority=7&ts='+Date.now();
  s.onload=function(){console.log('Larios V8.4 PDF authority v3 loaded last');if(!document.querySelector('script[data-stripe-checkout]')){const stripe=document.createElement('script');stripe.src='stripe-checkout-v1.js?v=1';stripe.dataset.stripeCheckout='1';document.body.appendChild(stripe)}};
  s.onerror=function(){console.error('Could not reload PDF authority v3');};
  document.body.appendChild(s);
}
setTimeout(installAuthoritativeFlow,3000);
})();

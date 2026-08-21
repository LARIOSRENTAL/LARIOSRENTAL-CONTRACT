(function(){
'use strict';
function installAuthoritativeFlow(){
  if(!window.LariosReservations)return;
  try{window.LariosReservations.__finalFlowV2=false;}catch(_){ }
  const old=document.getElementById('lr-authority-reload');
  if(old)old.remove();
  const s=document.createElement('script');
  s.id='lr-authority-reload';
  s.src='contract-flow-final.js?authority=6&ts='+Date.now();
  s.onload=function(){console.log('Larios V8.4 authoritative contract flow reloaded');};
  s.onerror=function(){console.error('Could not reload authoritative contract flow');};
  document.body.appendChild(s);
}
// Legacy larios-fixes performs async startup (pricing + fleet) and can wrap save after the
// first contract-flow install. Reinstall the corrected final flow after that race settles.
setTimeout(installAuthoritativeFlow,3000);
})();
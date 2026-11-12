(function(){
'use strict';
const bridge=window.LariosAndroidKiosk;
if(!bridge)return;
const $=id=>document.getElementById(id);
function closePin(){
 const panel=$('lrKioskPinDialog');if(panel)panel.hidden=true;
 const input=$('lrKioskExitPin');if(input)input.value='';
 const error=$('lrKioskPinError');if(error)error.textContent='';
}
function submitPin(event){
 event.preventDefault();
 const input=$('lrKioskExitPin'),error=$('lrKioskPinError');
 if(input?.value!=='2018'){
  error.textContent='PIN incorrecto.';
  input.value='';input.focus();return;
 }
 closePin();
 bridge.disableToSettings();
}
function openPin(){
 const panel=$('lrKioskPinDialog');if(!panel)return;
 panel.hidden=false;
 $('lrKioskExitPin').value='';
 $('lrKioskPinError').textContent='';
 setTimeout(()=>$('lrKioskExitPin')?.focus(),50);
}
function install(){
 document.getElementById('lrAndroidKioskCard')?.remove();
 const head=document.querySelector('header.top');if(!head)return;
 if(!$('lrKioskPinDialog')){
  const panel=document.createElement('section');panel.id='lrKioskPinDialog';panel.hidden=true;
  panel.innerHTML='<form id="lrKioskPinForm" role="dialog" aria-modal="true" aria-labelledby="lrKioskPinTitle"><b id="lrKioskPinTitle">Salir del modo kiosco</b><label for="lrKioskExitPin">PIN de salida</label><input id="lrKioskExitPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required><p id="lrKioskPinError" aria-live="polite"></p><div><button type="button" id="lrKioskPinCancel">Cancelar</button><button type="submit">Aceptar</button></div></form>';
  document.body.appendChild(panel);
  const pinCss=document.createElement('style');
  pinCss.textContent='#lrKioskPinDialog[hidden]{display:none!important}#lrKioskPinDialog{position:fixed;inset:0;z-index:1000000;background:#0009;display:grid;place-items:center;padding:20px}#lrKioskPinForm{width:min(360px,100%);display:grid;gap:12px;padding:22px;background:#fff;border-radius:16px;box-shadow:0 18px 60px #0005;color:#111827}#lrKioskPinTitle{font-size:20px}#lrKioskPinForm label{font-size:14px;color:#374151}#lrKioskExitPin{width:100%;box-sizing:border-box;padding:13px;border:1px solid #9ca3af;border-radius:9px;font-size:22px;letter-spacing:.3em;text-align:center}#lrKioskPinError{min-height:18px;margin:0;color:#b91c1c;font-size:13px}#lrKioskPinForm>div{display:flex;justify-content:flex-end;gap:9px}#lrKioskPinForm button{padding:10px 14px;border:0;border-radius:9px;font-weight:700}#lrKioskPinCancel{background:#e5e7eb}#lrKioskPinForm button[type=submit]{background:#111827;color:#fff}';
  document.head.appendChild(pinCss);
  $('lrKioskPinForm').addEventListener('submit',submitPin);
  $('lrKioskPinCancel').addEventListener('click',closePin);
  panel.addEventListener('click',e=>{if(e.target===panel)closePin()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)closePin()});
 }
 if(!$('lrAndroidControls')){
  const wrap=document.createElement('div');wrap.id='lrAndroidControls';
  wrap.innerHTML='<button type="button" id="lrRestartApp">↻ Reiniciar</button><button type="button" id="lrExitKiosk">Salir del kiosco</button>';
  head.appendChild(wrap);
  const css=document.createElement('style');css.textContent='header.top{position:relative;padding-right:20px}#lrAndroidControls{position:absolute;right:16px;top:calc(14px + env(safe-area-inset-top));display:flex;gap:7px;z-index:5}#lrAndroidControls button{border:1px solid #64748b;border-radius:9px;padding:9px 11px;background:#243247;color:white;font-size:13px;font-weight:700}#lrAndroidControls button:active{opacity:.75}@media(max-width:600px){#lrAndroidControls{top:calc(12px + env(safe-area-inset-top));right:10px;flex-direction:column}#lrAndroidControls button{padding:7px 9px;font-size:11px}header.top h1{padding-right:115px}}';document.head.appendChild(css);
  $('lrRestartApp').onclick=()=>bridge.restart();
  $('lrExitKiosk').onclick=openPin;
 }
 try{bridge.enable()}catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
setTimeout(install,500);
})();
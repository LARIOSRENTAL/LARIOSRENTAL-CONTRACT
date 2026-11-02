(function(){
'use strict';
const bridge=window.LariosAndroidKiosk;
if(!bridge)return;
let card=null,holdTimer=null;
function status(){
  let enabled=false,owner=false;
  try{enabled=!!bridge.isEnabled();owner=!!bridge.isDeviceOwner()}catch(_){}
  return{enabled,owner};
}
function render(){
  if(!card)return;
  const state=status(),title=card.querySelector('b'),note=card.querySelector('span'),button=card.querySelector('button');
  if(state.enabled){
    title.textContent=state.owner?'Modo kiosco definitivo activo':'Modo kiosco fijado activo';
    note.textContent=state.owner?'La tablet está bloqueada para uso exclusivo de Larios Rental.':'Android mantendrá Larios Rental fijada. Confirma “Fijar aplicación” si aparece el aviso del sistema.';
    button.hidden=true;
    card.classList.add('active');
  }else{
    title.textContent='Modo kiosco de la tablet';
    note.textContent='Pulsa para fijar Larios Rental y evitar salir accidentalmente a otras aplicaciones.';
    button.hidden=false;
    card.classList.remove('active');
  }
}
function install(){
  // Kiosk startup is managed by Android natively. Do not display any banner,
  // activation button, or Android screen-pinning instructions inside the app.
  document.getElementById('lrAndroidKioskCard')?.remove();
  const release=document.getElementById('lrReleaseVersion');
  if(release&&release.dataset.lrKioskExitBound!=='1'){
    release.dataset.lrKioskExitBound='1';
    const start=()=>{clearTimeout(holdTimer);holdTimer=setTimeout(()=>{
      const code=prompt('Clave para salir del modo kiosco');
      if(code==='1')bridge.disableToSettings();
    },5000)};
    const cancel=()=>clearTimeout(holdTimer);
    release.addEventListener('pointerdown',start);
    release.addEventListener('pointerup',cancel);
    release.addEventListener('pointercancel',cancel);
    release.addEventListener('pointerleave',cancel);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
setTimeout(install,500);
})();

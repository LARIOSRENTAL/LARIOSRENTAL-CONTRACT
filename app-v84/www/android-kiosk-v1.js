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
  if(card||!document.getElementById('home'))return;
  card=document.createElement('div');card.id='lrAndroidKioskCard';card.innerHTML='<b></b><span></span><button type="button">Activar modo kiosco</button>';
  card.querySelector('button').onclick=()=>{try{bridge.enable();setTimeout(render,700)}catch(e){alert('No se pudo activar el modo kiosco: '+(e?.message||String(e)))}};
  const picker=document.querySelector('#home .agendaPicker');(picker?.parentNode||document.getElementById('home')).insertBefore(card,picker||document.getElementById('home').firstChild);
  const style=document.createElement('style');style.textContent='#lrAndroidKioskCard{margin:12px 0;padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc}#lrAndroidKioskCard b,#lrAndroidKioskCard span{display:block}#lrAndroidKioskCard span{margin:5px 0 10px;color:#64748b;font-size:13px}#lrAndroidKioskCard button{width:100%;padding:12px;border:0;border-radius:10px;background:#111827;color:#fff;font-weight:800}#lrAndroidKioskCard.active{border-color:#86efac;background:#f0fdf4}';document.head.appendChild(style);
  render();
  const release=document.getElementById('lrReleaseVersion');
  if(release){
    const start=()=>{clearTimeout(holdTimer);holdTimer=setTimeout(()=>{const code=prompt('Clave para salir del modo kiosco');if(code==='1')bridge.disableToSettings()},5000)};
    const cancel=()=>clearTimeout(holdTimer);
    release.addEventListener('pointerdown',start);release.addEventListener('pointerup',cancel);release.addEventListener('pointercancel',cancel);release.addEventListener('pointerleave',cancel);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
setTimeout(install,500);
})();

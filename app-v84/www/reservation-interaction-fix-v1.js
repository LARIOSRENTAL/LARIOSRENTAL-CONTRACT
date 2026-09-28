(function(){
'use strict';
const $=id=>document.getElementById(id);
function admin(){return !!window.LariosAccess?.isAdmin?.()}
function visibleReservation(){const s=$('reservation');return !!s&&!s.classList.contains('hidden')}
function clearStrayOverlays(){
  const permissions=$('lrPermissionsPanel');
  if(permissions?.classList.contains('open')){permissions.classList.remove('open');document.body.style.overflow=''}
  const quick=$('quickReservationModal');
  if(quick&&!quick.classList.contains('hidden'))quick.classList.add('hidden');
  const password=$('lrPasswordPanel');
  if(password&&location.hash.indexOf('access_token')<0&&!new URLSearchParams(location.search).get('auth_action'))password.remove();
  document.querySelectorAll('dialog[open]').forEach(d=>{
    if(!d.matches('#lrHoldDialog')){try{d.close()}catch(_){d.removeAttribute('open')}}
  });
}
function unlockAdminForm(){
  if(!admin()||!visibleReservation())return;
  const form=$('reservationForm');if(!form)return;
  form.style.pointerEvents='auto';
  form.removeAttribute('inert');
  form.querySelectorAll('[data-employee-locked]').forEach(control=>{
    if(control.dataset.employeeLocked==='enabled')control.disabled=false;
    delete control.dataset.employeeLocked;
  });
  form.querySelectorAll('input,select,textarea,button').forEach(control=>{
    control.style.pointerEvents='auto';
    if(control.closest('.lrGeneratedEmployeeLock'))return;
  });
  form.querySelector(':scope > .lrGeneratedEmployeeLock')?.remove();
  clearStrayOverlays();
  document.documentElement.dataset.lrAdminFormInteractive='1';
}
function schedule(){
  [0,80,250,700,1500].forEach(ms=>setTimeout(unlockAdminForm,ms));
}
document.addEventListener('larios:reservation-opened',schedule);
window.addEventListener('larios:access-ready',schedule);
window.addEventListener('focus',()=>setTimeout(unlockAdminForm,0));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(unlockAdminForm,0)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.LariosInteractionFix={run:unlockAdminForm,version:'20260928-admin-unlock1'};
})();
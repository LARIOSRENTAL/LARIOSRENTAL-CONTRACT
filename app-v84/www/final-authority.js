(function(){
'use strict';
function installRoleAccess(){
  if(document.querySelector('script[data-role-access],script[src*="role-access-v1.js"]'))return;
  const access=document.createElement('script');
  access.src='role-access-v1.js?v=4';
  access.dataset.roleAccess='1';
  document.body.appendChild(access);
}
function installAdminUsers(){
  if(document.querySelector('script[data-admin-users],script[src*="admin-users-v1.js"]'))return;
  const users=document.createElement('script');
  users.src='admin-users-v1.js?v=3';
  users.dataset.adminUsers='1';
  document.body.appendChild(users);
}
function installUserProfile(){
  if(document.querySelector('script[data-user-profile],script[src*="user-profile-v1.js"]'))return;
  const profile=document.createElement('script');
  profile.src='user-profile-v1.js?v=1';
  profile.dataset.userProfile='1';
  document.body.appendChild(profile);
}
function installPasswordAccess(){
  if(document.querySelector('script[data-password-access],script[src*="auth-access-v1.js"]'))return;
  const auth=document.createElement('script');
  auth.src='auth-access-v1.js?v=1';
  auth.dataset.passwordAccess='1';
  document.body.appendChild(auth);
}
function installReservationAdmin(){
  if(document.querySelector('script[data-reservation-admin],script[src*="reservation-admin-v1.js"]'))return;
  const reservations=document.createElement('script');
  reservations.src='reservation-admin-v1.js?v=1';
  reservations.dataset.reservationAdmin='1';
  document.body.appendChild(reservations);
}
function installOperationsPanels(){
  const modules=[['vehicle-manager-v1.js?v=2','vehicle-manager'],['pricing-manager-v1.js?v=2','pricing-manager'],['contract-download-v1.js?v=2','contract-download']];
  modules.forEach(([src,key])=>{if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=src;s.setAttribute('data-'+key,'1');document.body.appendChild(s)});
}
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
installRoleAccess();
installAdminUsers();
installUserProfile();
installPasswordAccess();
installReservationAdmin();
installOperationsPanels();
setTimeout(installAuthoritativeFlow,3000);
})();

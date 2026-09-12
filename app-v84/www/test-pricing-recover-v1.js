(function(){
'use strict';
const KEY='lr_test_pricing_reload_once';
function hasSession(){return !!localStorage.getItem('lr_test_token')}
function reloadOnceAfterLogin(){
 if(!hasSession())return;
 if(sessionStorage.getItem(KEY)==='1')return;
 sessionStorage.setItem(KEY,'1');
 location.reload();
}
const oldSignIn=window.signIn;
if(typeof oldSignIn==='function'){
 window.signIn=async function(){
  await oldSignIn.apply(this,arguments);
  if(hasSession())reloadOnceAfterLogin();
 };
}
window.addEventListener('storage',()=>{});
if(hasSession())sessionStorage.setItem(KEY,'1');
})();
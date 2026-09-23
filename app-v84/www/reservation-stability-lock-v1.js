(function(){
'use strict';
let installed=false;
function install(){
  if(installed)return true;
  const api=window.LariosReservations;
  if(!api||typeof api.edit!=='function'||typeof api.save!=='function')return false;
  if(!window.LariosPdfAuthorityV3?.finalize||api.save.__lrPdfAuthority!==true)return false;
  const canonicalEdit=api.__coreEdit||api.edit;
  const canonicalSave=api.save;
  try{
    Object.defineProperty(api,'edit',{value:canonicalEdit,writable:false,configurable:false,enumerable:true});
    Object.defineProperty(api,'save',{value:canonicalSave,writable:false,configurable:false,enumerable:true});
  }catch(e){
    console.error('Reservation stability lock could not be installed',e);
    return false;
  }
  installed=true;
  window.LariosReservationStabilityLock={
    version:'20260923-pdf-authority1',
    edit:canonicalEdit,
    save:canonicalSave,
    installed:true
  };
  document.documentElement.dataset.lrReservationLocked='1';
  console.log('Reservation edit/save handlers locked');
  return true;
}
if(!install()){
  let n=0;
  const timer=setInterval(()=>{
    if(install()||++n>=40)clearInterval(timer);
  },100);
}
})();
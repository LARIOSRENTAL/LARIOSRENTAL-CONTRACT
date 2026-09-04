(function(){
'use strict';
if(window.__lrNativeMutationObserver)return;
const Native=window.MutationObserver;
if(!Native)return;
window.__lrNativeMutationObserver=Native;
window.MutationObserver=function(callback){
  const source=String(callback||'');
  if(!/patchForm/.test(source)||!/reservation/.test(source))return new Native(callback);
  let timer=0,lastRecords=[],lastObserver=null;
  return new Native(function(records,observer){
    lastRecords=records;lastObserver=observer;
    if(timer)return;
    timer=setTimeout(function(){
      timer=0;
      const reservation=document.getElementById('reservation');
      if(!reservation||reservation.classList.contains('hidden'))return;
      try{callback(lastRecords,lastObserver)}catch(e){console.warn('Larios stability observer',e)}
    },120);
  });
};
window.MutationObserver.prototype=Native.prototype;
window.MutationObserver.toString=()=>Native.toString();
})();

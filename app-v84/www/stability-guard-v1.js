(function(){
'use strict';
if(window.__lrNativeMutationObserver)return;
const Native=window.MutationObserver;
if(!Native)return;
window.__lrNativeMutationObserver=Native;
window.MutationObserver=function(callback){
  const source=String(callback||'');
  // larios-fixes legacy observer re-runs patchForm whenever patchForm itself
  // changes classes. On Safari/iPad this can create a self-triggering UI loop.
  // patchForm already runs explicitly when a reservation is opened, so this
  // observer is unnecessary and is replaced by a no-op observer.
  if(/patchForm/.test(source)&&/reservation/.test(source)){
    return new Native(function(){});
  }
  return new Native(callback);
};
window.MutationObserver.prototype=Native.prototype;
window.MutationObserver.toString=()=>Native.toString();
})();

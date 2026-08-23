(function(){
'use strict';
if(!window.LariosScanner)return;
const active=window.LariosScanner;
try{
  Object.defineProperty(window,'LariosScanner',{
    configurable:false,
    enumerable:true,
    get:function(){return active;},
    set:function(next){console.warn('Ignored legacy LariosScanner overwrite',next);}
  });
}catch(e){
  console.warn('Could not hard-lock LariosScanner',e);
  window.LariosScanner=active;
}
const mark=function(){const f=document.querySelector('.foot');if(f)f.textContent='Larios Rental · V8.4 · Scanner V6 WEB · LOCKED';};
mark();
window.addEventListener('load',function(){setTimeout(mark,1500);});
console.log('Scanner V6 locked against legacy overrides');
})();
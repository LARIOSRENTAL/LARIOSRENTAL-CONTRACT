(function(){
'use strict';
function install(){
  if(!window.PDFLib||!window.PDFLib.PDFPage||window.PDFLib.PDFPage.prototype.__lariosTextStyle)return false;
  const proto=window.PDFLib.PDFPage.prototype;
  const original=proto.drawText;
  proto.drawText=function(text,options){
    const o={...(options||{})};
    let t=String(text??'').toLocaleUpperCase('es-ES');
    if(typeof o.size==='number'&&o.size<=10){o.size=Math.min(o.size*1.16,o.size+1.25)}
    return original.call(this,t,o);
  };
  proto.__lariosTextStyle=true;
  console.log('Larios PDF text style installed: uppercase + larger');
  return true;
}
if(!install()){
  let tries=0;
  const timer=setInterval(()=>{if(install()||++tries>240)clearInterval(timer)},250);
}
})();
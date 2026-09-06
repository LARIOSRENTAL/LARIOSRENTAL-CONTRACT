(function(){
'use strict';
function patch(){const P=window.PDFLib?.PDFPage?.prototype;if(!P||P.__lariosLayoutV2)return false;P.__lariosLayoutV2=true;const original=P.drawText;P.drawText=function(text,options){const o={...(options||{})},y=Number(o.y),x=Number(o.x);if(Math.abs(y-703)<.25&&x>=240&&x<340){try{const size=Number(o.size||7.2),tw=o.font?.widthOfTextAtSize?o.font.widthOfTextAtSize(String(text),size):0;o.x=303-(tw/2);o.y=703}catch(_){}}return original.call(this,text,o)};console.log('PDF layout V2 installed');return true}
function install(){if(patch())return;let n=0,t=setInterval(()=>{if(patch()||++n>50)clearInterval(t)},100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
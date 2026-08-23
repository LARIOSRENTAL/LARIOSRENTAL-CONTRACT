(function(){
'use strict';
function patch(){
  const P=window.PDFLib?.PDFPage?.prototype;
  if(!P||P.__lariosLayoutPatched)return false;
  P.__lariosLayoutPatched=true;
  const original=P.drawText;
  P.drawText=function(text,options){
    const o={...(options||{})};
    const y=Number(o.y),x=Number(o.x);

    // Additional driver: the six values were one printed row too low and slightly left.
    if([483,460,437].some(v=>Math.abs(y-v)<0.2) && x<330){
      o.y=y+8;
      o.x=x+10;
    }

    // Card expiry: center farther right and a touch lower inside CAD. box.
    if(Math.abs(y-703)<0.2 && x<330){
      o.x=x+10;
      o.y=y-3;
    }

    // Vehicle registration: move away from the printed label into the value area.
    if(Math.abs(y-683)<0.2 && x>330 && x<455){
      o.x=x+20;
    }

    // All liquidation amounts share the exact same horizontal center.
    const liquidationRows=[461,436,414,392,370,306,252,230];
    if(liquidationRows.some(v=>Math.abs(y-v)<0.2) && x>485){
      try{
        const size=Number(o.size||6);
        const tw=o.font?.widthOfTextAtSize?o.font.widthOfTextAtSize(String(text),size):0;
        o.x=525-(tw/2);
      }catch(_){ }
    }

    return original.call(this,text,o);
  };
  console.log('Larios PDF layout hotfix installed');
  return true;
}
function ensure(){
  if(patch())return;
  if(!document.querySelector('script[data-larios-pdflib-preload]')){
    const s=document.createElement('script');
    s.src='vendor/pdf-lib.min.js';
    s.dataset.lariosPdflibPreload='1';
    s.onload=patch;
    document.head.appendChild(s);
  }
  let n=0;const t=setInterval(()=>{if(patch()||++n>40)clearInterval(t)},100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);else ensure();
})();
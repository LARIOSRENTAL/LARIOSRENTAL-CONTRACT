(function(){
'use strict';
if(window.LariosSignaturePersistence)return;
const prefix='lr_signature_';
let canvas=null,lastKey='';
function key(){const id=window.LariosCurrentContractId||'';return id?prefix+id:''}
function hasInk(c){try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i])return true}catch(_){}return false}
function save(){const c=document.getElementById('signatureCanvas'),k=key();if(!c||!k||!hasInk(c))return;try{sessionStorage.setItem(k,c.toDataURL('image/png'));lastKey=k}catch(e){console.warn('No se pudo conservar temporalmente la firma',e)}}
function restore(){const c=document.getElementById('signatureCanvas'),k=key();if(!c||!k||hasInk(c))return;const data=sessionStorage.getItem(k);if(!data)return;const img=new Image();img.onload=()=>{if(!hasInk(c))c.getContext('2d').drawImage(img,0,0,c.width,c.height)};img.src=data;canvas=c;lastKey=k}
function clear(){const k=key()||lastKey;if(k)sessionStorage.removeItem(k)}
function bind(){const c=document.getElementById('signatureCanvas');if(c&&c!==canvas){canvas=c;['pointerup','mouseup','touchend'].forEach(event=>c.addEventListener(event,()=>setTimeout(save,0),{passive:true}));restore()}else if(c&&key()!==lastKey)restore()}
new MutationObserver(bind).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',event=>{const text=String(event.target?.textContent||'');if(/Aceptar firma/i.test(text))setTimeout(save,0);if(/Borrar firma/i.test(text))setTimeout(clear,0)},true);
window.addEventListener('pagehide',save);
window.LariosSignaturePersistence={save,restore,clear,version:'signature-session1-20260915'};
bind();
})();

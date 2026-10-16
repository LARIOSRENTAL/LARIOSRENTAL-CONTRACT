(function(){
'use strict';
const $=id=>document.getElementById(id);
async function check(){
 if(!window.LariosAccess?.isAdmin?.())return;
 const button=$('lrRenthubAuthCheck'),output=$('lrRenthubAuthResult');
 if(!button||!output)return;
 button.disabled=true;output.textContent='Comprobando acceso User API mediante una lectura…';
 try{
  const response=await fetch(cfg.supabaseUrl+'/functions/v1/renthub-transfer',{method:'POST',headers:hdr(),body:JSON.stringify({action:'check_user_api'})});
  const data=await response.json();
  output.textContent=JSON.stringify({http:response.status,...data},null,2);
 }catch(error){output.textContent='No se pudo completar la lectura: '+error.message}
 finally{button.disabled=false}
}
function install(){
 if($('lrRenthubAuthPanel')||!$('home'))return;
 const panel=document.createElement('section');panel.id='lrRenthubAuthPanel';panel.className='notice';panel.style.marginTop='16px';
 const button=document.createElement('button');button.id='lrRenthubAuthCheck';button.type='button';button.className='secondary';button.textContent='Comprobar acceso User API · solo lectura';button.onclick=check;
 const output=document.createElement('pre');output.id='lrRenthubAuthResult';output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
 panel.append(button,output);$('home').appendChild(panel);decorate();
}
function decorate(){const p=$('lrRenthubAuthPanel');if(p)p.hidden=!window.LariosAccess?.isAdmin?.()}
function boot(){install();document.addEventListener('larios:access-ready',()=>{install();decorate()});window.addEventListener('larios:access-ready',()=>{install();decorate()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(function(){
'use strict';
const bridge=window.LariosAndroidKiosk;
if(!bridge)return;
const $=id=>document.getElementById(id);
function currentEmail(){return window.LariosAccess?.current?.().email||''}
function jwtRole(token){try{const part=String(token||'').split('.')[1];const normalized=part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=');return JSON.parse(atob(normalized))?.app_metadata?.role||''}catch(_){return''}}
async function exitKiosk(){
 if(window.LariosAccess?.isAdmin?.()!==true){alert('Solo una cuenta administradora puede salir del modo kiosco.');return}
 const password=prompt('Contraseña de administrador para salir del modo kiosco');
 if(password===null||!password)return;
 try{
  const r=await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:currentEmail(),password})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.access_token||jwtRole(data.access_token)!=='admin')throw new Error('Contraseña incorrecta o cuenta sin permisos de administrador.');
  bridge.disableToSettings();
 }catch(e){alert(e.message||'No se pudo validar la cuenta administradora.')}
}
function install(){
 document.getElementById('lrAndroidKioskCard')?.remove();
 const head=document.querySelector('header.top');if(!head)return;
 if(!document.getElementById('lrAndroidControls')){
  const wrap=document.createElement('div');wrap.id='lrAndroidControls';
  wrap.innerHTML='<button type="button" id="lrRestartApp">↻ Reiniciar</button><button type="button" id="lrExitKiosk">Salir del kiosco</button>';
  head.appendChild(wrap);
  const css=document.createElement('style');css.textContent='header.top{position:relative;padding-right:20px}#lrAndroidControls{position:absolute;right:16px;top:calc(14px + env(safe-area-inset-top));display:flex;gap:7px;z-index:5}#lrAndroidControls button{border:1px solid #64748b;border-radius:9px;padding:9px 11px;background:#243247;color:white;font-size:13px;font-weight:700}#lrAndroidControls button:active{opacity:.75}@media(max-width:600px){#lrAndroidControls{top:calc(12px + env(safe-area-inset-top));right:10px;flex-direction:column}#lrAndroidControls button{padding:7px 9px;font-size:11px}header.top h1{padding-right:115px}}';document.head.appendChild(css);
  $('lrRestartApp').onclick=()=>bridge.restart();
  $('lrExitKiosk').onclick=exitKiosk;
 }
 try{bridge.enable()}catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
setTimeout(install,500);
})();
(function(){
'use strict';
const state={role:'loading',email:'',ready:false};
const staffRoles=new Set(['employee','admin']);
let installed=false,decorating=false;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function label(){return state.role==='admin'?'Administrador':state.role==='employee'?'Empleado':state.role==='loading'?'Comprobando permisos':'Sin permiso asignado'}
function isAdmin(){return state.role==='admin'}
function isEmployee(){return state.role==='employee'}
function isStaff(){return staffRoles.has(state.role)}
function requireAdmin(action='realizar esta acción'){
  if(isAdmin())return true;
  alert(`Solo una cuenta administradora puede ${action}. No se ha realizado ningún cambio.`);
  return false;
}
function jwtRole(){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return'';
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=');
    return String(JSON.parse(atob(normalized))?.app_metadata?.role||'');
  }catch(_){return''}
}
async function userRequest(retry=true){
  const response=await fetch(cfg.supabaseUrl+'/auth/v1/user',{headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token}});
  if(retry&&(response.status===401||response.status===403)&&typeof window.refreshSession==='function'&&await window.refreshSession())return userRequest(false);
  if(!response.ok)throw new Error('No se pudo comprobar el perfil de acceso');
  return response.json();
}
function permissionsMarkup(){
  return `<div class="lrPermissionsShell"><div class="lrPermissionsHead"><div><b>Permisos de la cuenta</b><span>${esc(state.email||'Usuario identificado')} · ${esc(label())}</span></div><button type="button" onclick="LariosAccess.closePermissions()">×</button></div><div class="lrPermissionIntro ${isAdmin()?'admin':'employee'}"><b>${isAdmin()?'Acceso administrativo completo':'Acceso operativo de empleado'}</b><span>${isAdmin()?'Puedes realizar también las acciones sensibles indicadas en morado.':'Los campos con borde azul son editables. Los controles con candado requieren un administrador.'}</span></div><div class="lrPermissionGrid"><section><h3>Empleado</h3><ul><li>Crear y editar reservas mientras sean borradores.</li><li>Modificar el precio particular, descuento, depósito, seguro y extras.</li><li>Generar el contrato y enviarlo al cliente.</li><li>Ampliar, cambiar el vehículo y completar la devolución.</li></ul></section><section class="admin"><h3>Solo administrador</h3><ul><li>Enviar uno o todos los contratos a Renthub.</li><li>Actualizar la caché técnica de Renthub.</li><li>Eliminar una copia local ya verificada.</li><li>Modificar tarifas oficiales, roles o registros bloqueados.</li></ul></section></div><p class="lrPermissionsFoot">El contrato generado queda bloqueado para todos. Los cambios posteriores deben quedar documentados mediante Ampliar reserva o Cambio de vehículo.</p></div>`;
}
function openPermissions(){let panel=$('lrPermissionsPanel');if(!panel){panel=document.createElement('section');panel.id='lrPermissionsPanel';panel.className='lrPermissionsPanel';document.body.appendChild(panel)}panel.innerHTML=permissionsMarkup();panel.classList.add('open');document.body.style.overflow='hidden'}
function closePermissions(){$('lrPermissionsPanel')?.classList.remove('open');document.body.style.overflow=''}
function identityBar(){
  const top=document.querySelector('.top');if(!top)return;
  let bar=$('lrIdentityBar');if(!bar){bar=document.createElement('div');bar.id='lrIdentityBar';bar.className='lrIdentityBar';($('status')||top.lastElementChild)?.insertAdjacentElement('afterend',bar)}
  bar.classList.toggle('hidden',!token);
  bar.innerHTML=`<button type="button" class="lrRoleChip ${esc(state.role)}" onclick="LariosAccess.openPermissions()"><span>${isAdmin()?'◆':isEmployee()?'●':'!'}</span>${esc(label())}</button><button type="button" class="lrPermissionLink" onclick="LariosAccess.openPermissions()">Ver permisos</button>`;
}
function reservationGuide(){
  const form=$('reservationForm');if(!form||form.querySelector(':scope > .lrEditableGuide'))return;
  const guide=document.createElement('div');guide.className='lrEditableGuide';guide.innerHTML=isAdmin()?'<b>Edición administrativa</b><span>Puedes completar este borrador. Una vez generado, utiliza siempre las operaciones documentadas de la agenda.</span>':'<b>Campos editables por empleados</b><span>Los campos azules pueden modificarse mientras la reserva sea borrador. El contrato se bloqueará al generarlo.</span>';
  form.insertBefore(guide,form.firstChild);
}
function lifecycleGuide(){
  const shell=document.querySelector('.lrLifecycleShell');if(!shell||shell.querySelector(':scope > .lrEditableGuide'))return;
  const head=shell.querySelector('.lrLifecycleHead'),guide=document.createElement('div');guide.className='lrEditableGuide';guide.innerHTML='<b>Operación permitida para empleados</b><span>Este cambio quedará registrado y se añadirá al PDF del contrato.</span>';head?.insertAdjacentElement('afterend',guide);
}
function pricingGuide(){
  const pricing=$('pricing');if(!pricing||$('lrPricingAccessNote'))return;
  const note=document.createElement('div');note.id='lrPricingAccessNote';note.className='lrPricingAccessNote';note.textContent=isAdmin()?'Consulta de tarifas · su modificación es administrativa.':'Consulta de tarifas · 🔒 modificar la tabla oficial requiere un administrador.';pricing.insertAdjacentElement('afterend',note);
}
function markVersion(){const footer=document.querySelector('.foot');if(footer&&!footer.textContent.includes('PERMISOS V1'))footer.textContent=footer.textContent.trim()+' · PERMISOS V1'}
function decorate(){
  if(decorating)return;decorating=true;
  requestAnimationFrame(()=>{
    document.body.classList.toggle('lrRoleAdmin',isAdmin());
    document.body.classList.toggle('lrRoleEmployee',isEmployee());
    document.body.classList.toggle('lrRoleMissing',state.ready&&!isStaff());
    identityBar();reservationGuide();lifecycleGuide();pricingGuide();markVersion();
    document.querySelectorAll('[data-admin-only="true"]').forEach(button=>{
      if(!isAdmin())button.disabled=true;
      button.setAttribute('aria-disabled',String(button.disabled));
      button.title=isAdmin()?'Acción administrativa':'Solo administrador';
    });
    decorating=false;
  });
}
async function load(){
  if(!window.__lariosRoleSessionHook&&typeof window.saveSession==='function'){
    const save=window.saveSession,clear=window.clearSession;
    window.saveSession=function(data){const result=save(data);setTimeout(load,0);return result};
    if(typeof clear==='function')window.clearSession=function(){const result=clear();state.role='none';state.email='';state.ready=true;decorate();return result};
    window.__lariosRoleSessionHook=true;
  }
  let role=jwtRole(),email='';
  try{
    const user=await userRequest(),serverRole=String(user?.app_metadata?.role||'');email=String(user?.email||'');
    if(serverRole&&serverRole!==role&&typeof window.refreshSession==='function'&&await window.refreshSession())role=jwtRole();
    else role=serverRole||role;
  }catch(error){console.warn('Larios access profile',error)}
  state.role=staffRoles.has(role)?role:'none';state.email=email;state.ready=true;decorate();
  window.dispatchEvent(new CustomEvent('larios:access-ready',{detail:{role:state.role,email:state.email,isAdmin:isAdmin()}}));
  return{...state};
}
function install(){if(installed)return;installed=true;const style=document.createElement('style');style.textContent='.lrIdentityBar{display:flex;gap:8px;align-items:center;margin-top:10px}.lrRoleChip,.lrPermissionLink{border:0;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:850}.lrRoleChip{background:#dbeafe;color:#1e40af}.lrRoleChip.admin{background:#ede9fe;color:#5b21b6}.lrRoleChip.none{background:#fee2e2;color:#991b1b}.lrRoleChip span{margin-right:6px}.lrPermissionLink{background:transparent;color:#e5e7eb;text-decoration:underline}.lrPermissionsPanel{display:none;position:fixed;inset:0;z-index:100500;background:rgba(15,23,42,.62);padding:calc(22px + env(safe-area-inset-top)) 16px 30px;overflow:auto}.lrPermissionsPanel.open{display:block}.lrPermissionsShell{max-width:760px;margin:20px auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 25px 70px rgba(0,0,0,.28)}.lrPermissionsHead{display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:14px}.lrPermissionsHead>div{display:grid;flex:1}.lrPermissionsHead b{font-size:22px}.lrPermissionsHead span{font-size:12px;color:#6b7280;margin-top:4px}.lrPermissionsHead button{border:0;background:#e5e7eb;border-radius:9px;width:40px;height:40px;font-size:24px}.lrPermissionIntro{display:grid;gap:3px;padding:13px;margin:14px 0;border-radius:12px;background:#eff6ff;color:#1e40af}.lrPermissionIntro.admin{background:#f5f3ff;color:#5b21b6}.lrPermissionIntro span{font-size:12px;line-height:1.4}.lrPermissionGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.lrPermissionGrid section{padding:14px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px}.lrPermissionGrid section.admin{border-color:#c4b5fd;background:#faf5ff}.lrPermissionGrid h3{margin:0 0 8px}.lrPermissionGrid ul{margin:0;padding-left:18px;font-size:13px;line-height:1.55}.lrPermissionsFoot{font-size:12px;color:#4b5563;margin:14px 0 0}.lrEditableGuide{display:grid;gap:3px;padding:11px 13px;margin:0 0 14px;border:1px solid #93c5fd;background:#eff6ff;color:#1e40af;border-radius:11px}.lrEditableGuide span{font-size:12px;line-height:1.4}.lrPricingAccessNote{font-size:11px;color:#6b7280;margin:7px 2px 0}.lrRoleEmployee #reservationForm input:not([readonly]):not(:disabled),.lrRoleEmployee #reservationForm select:not(:disabled),.lrRoleEmployee #reservationForm textarea:not([readonly]):not(:disabled),.lrRoleEmployee .lrLifecyclePage input:not([readonly]):not(:disabled),.lrRoleEmployee .lrLifecyclePage select:not(:disabled),.lrRoleEmployee .lrLifecyclePage textarea:not([readonly]):not(:disabled){border-color:#60a5fa;background:#f8fbff}.lrAdminOnlyLock{display:block;font-size:10px;color:#6d28d9;margin-top:4px;font-weight:800}[data-admin-only="true"]:disabled{cursor:not-allowed!important;opacity:.72}@media(max-width:600px){.lrPermissionGrid{grid-template-columns:1fr}.lrPermissionsShell{padding:15px}.lrIdentityBar{align-items:flex-start;flex-direction:column;gap:2px}.lrPermissionLink{padding-left:0}}';document.head.appendChild(style);decorate();const observer=new MutationObserver(decorate);observer.observe(document.body,{subtree:true,childList:true});load()}
window.LariosAccess={load,isAdmin,isEmployee,isStaff,requireAdmin,openPermissions,closePermissions,current:()=>({...state}),decorate,__test:{setRole:role=>{state.role=role;state.ready=true},label}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

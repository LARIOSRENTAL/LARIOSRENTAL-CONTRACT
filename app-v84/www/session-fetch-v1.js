(function(){
'use strict';
if(window.LARIOS_TEST_ENV||window.LariosSessionFetch)return;
const previousFetch=window.fetch.bind(window);
const previousRefresh=window.refreshSession.bind(window);
let refreshFlight=null;
let recoverySubject=null;

function requestKind(input){
  try{
    const url=new URL(input instanceof Request?input.url:input,location.href);
    if(url.origin!==new URL(cfg.supabaseUrl).origin)return'';
    if(/^\/(?:rest|storage|functions)\/v1\//.test(url.pathname))return'api';
    return url.pathname==='/auth/v1/user'?'user':'';
  }catch(_){return''}
}
function claims(value){
  try{
    const parts=String(value||'').split('.');
    if(parts.length!==3||parts.some(part=>!part))return null;
    const parsed=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    return typeof parsed.sub==='string'&&Number.isFinite(parsed.exp)?parsed:null;
  }catch(_){return null}
}
function retryInit(input,init){
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  new Headers(init?.headers||{}).forEach((v,k)=>headers.set(k,v));
  headers.set('apikey',cfg.supabasePublishableKey);
  headers.set('Authorization','Bearer '+token);
  return {...(init||{}),headers};
}
function unavailable(){
  const temporary=!!localStorage.getItem('lr_refresh_token')&&!recoverySubject;
  const message=temporary?'No se pudo renovar la sesión. Vuelve a intentarlo en unos segundos.':
    'La sesión ha caducado. Vuelve a iniciar sesión para continuar.';
  return new Response(message,{status:401,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
function offerSignIn(subject){
  if(!subject||reservationSection.classList.contains('hidden'))return;
  recoverySubject=subject;
  statusEl.textContent='Sesión caducada · identificación requerida';
  loginErrorEl.textContent='Identifícate con la misma cuenta para continuar con el contrato abierto.';
  loginSection.classList.remove('hidden');
}
function completeSignIn(session){
  if(!recoverySubject)return false;
  if(session.user?.id!==recoverySubject)throw new Error('Usa la misma cuenta con la que abriste este contrato.');
  saveSession(session);
  recoverySubject=null;
  loginSection.classList.add('hidden');
  statusEl.textContent='Supabase conectado · sesión autenticada';
  return true;
}
async function renew(failedToken=token){
  if(recoverySubject)return false;
  if(!refreshFlight){
    const subject=claims(failedToken)?.sub;
    const refresh=async()=>{
      if(token!==failedToken){
        return !!subject&&claims(token)?.sub===subject;
      }
      const saved=localStorage.getItem('lr_token');
      const latest=claims(saved);
      if(saved!==token&&latest&&latest.sub!==subject)return false;
      if(saved!==token&&latest&&latest.exp>Date.now()/1000+30){
        token=saved;
        return true;
      }
      if(await previousRefresh())return true;
      const updated=localStorage.getItem('lr_token');
      const updatedClaims=claims(updated);
      if(updated!==failedToken&&subject&&updatedClaims?.sub===subject&&updatedClaims.exp>Date.now()/1000+30){
        token=updated;
        return true;
      }
      if(!localStorage.getItem('lr_refresh_token'))offerSignIn(subject);
      return false;
    };
    refreshFlight=Promise.resolve()
      .then(()=>navigator.locks?.request?navigator.locks.request('larios-session:'+cfg.supabaseUrl,refresh):refresh())
      .finally(()=>{refreshFlight=null});
  }
  const renewed=await refreshFlight;
  const subject=claims(failedToken)?.sub;
  return !!renewed&&!!claims(token)&&(!subject||claims(token).sub===subject);
}
window.fetch=async function(input,init){
  const kind=requestKind(input);
  if(!kind)return previousFetch(input,init);
  const initial=token;
  const authorization=new Headers(init?.headers??(input instanceof Request?input.headers:undefined)).get('Authorization');
  if(!authorization||(authorization!=='Bearer '+initial&&authorization!=='Bearer null'&&authorization!=='Bearer undefined'))return previousFetch(input,init);
  const expiry=claims(initial)?.exp;
  if(!expiry||expiry<=Date.now()/1000){
    if(!await renew(initial))return unavailable();
    return previousFetch(input,retryInit(input,init));
  }
  const retryInput=input instanceof Request?input.clone():input;
  // A closure can supply an older header while another request renews the session.
  init=retryInit(input,init);
  const response=await previousFetch(input,init);
  if(response.status!==401&&!(response.status===403&&kind==='user'))return response;
  if(!await renew(initial))return unavailable();
  return previousFetch(retryInput,retryInit(retryInput,init));
};
window.refreshSession=renew;
window.LariosSessionFetch={renew,completeSignIn,cancelRecovery(){recoverySubject=null},version:'session-recovery-20261126'};
})();

(function(){
'use strict';
if(window.LARIOS_TEST_ENV||window.LariosSessionFetch)return;
const previousFetch=window.fetch.bind(window);
const previousRefresh=typeof window.refreshSession==='function'?window.refreshSession.bind(window):null;
let refreshFlight=null;

function requestKind(input){
  try{
    const raw=typeof input==='string'?input:String(input?.url||'');
    const url=new URL(raw,location.href);
    const configured=new URL(cfg.supabaseUrl);
    if(url.origin!==configured.origin)return'';
    if(/^\/(?:rest|storage|functions)\/v1\//.test(url.pathname))return'api';
    if(url.pathname==='/auth/v1/user')return'user';
    return'';
  }catch(_){return''}
}
function validJwt(value){
  const parts=String(value||'').replace(/^Bearer\s+/i,'').trim().split('.');
  return parts.length===3&&parts.every(Boolean);
}
function retryInit(input,init){
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  new Headers(init?.headers||{}).forEach((v,k)=>headers.set(k,v));
  headers.set('apikey',cfg.supabasePublishableKey);
  headers.set('Authorization','Bearer '+token);
  return {...(init||{}),headers};
}
function unavailable(){
  return new Response('La sesión no es válida. Vuelve a iniciar sesión; los datos ya guardados se mantienen.',{
    status:401,headers:{'Content-Type':'text/plain; charset=utf-8'}
  });
}
async function renew(){
  if(!refreshFlight){
    refreshFlight=Promise.resolve()
      .then(async()=>{
        if(!previousRefresh)return false;
        const refreshed=await previousRefresh();
        return !!refreshed&&validJwt(token);
      })
      .finally(()=>{refreshFlight=null});
  }
  return refreshFlight;
}
window.fetch=async function(input,init){
  const kind=requestKind(input);
  if(kind&&!validJwt(token)){
    const refreshed=await renew();
    if(!refreshed)return unavailable();
    init=retryInit(input,init);
  }
  const response=await previousFetch(input,init);
  if(!kind||(response.status!==401&&!(response.status===403&&kind==='user')))return response;
  const refreshed=await renew();
  if(!refreshed)return unavailable();
  return previousFetch(input,retryInit(input,init));
};
window.refreshSession=renew;
window.LariosSessionFetch={renew,version:'session-retry2-20261118'};
})();

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

function retryInit(init){
  const headers=new Headers(init?.headers||{});
  headers.set('apikey',cfg.supabasePublishableKey);
  headers.set('Authorization','Bearer '+token);
  return {...(init||{}),headers};
}

async function renew(){
  if(!refreshFlight){
    refreshFlight=Promise.resolve()
      .then(()=>previousRefresh&&previousRefresh())
      .finally(()=>{refreshFlight=null});
  }
  return refreshFlight;
}

window.fetch=async function(input,init){
  const response=await previousFetch(input,init);
  const kind=requestKind(input);
  if(!kind||(response.status!==401&&!(response.status===403&&kind==='user')))return response;
  const refreshed=await renew();
  if(!refreshed)return response;
  return previousFetch(input,retryInit(init));
};

window.refreshSession=renew;
window.LariosSessionFetch={renew,version:'session-retry1-20260915'};
})();

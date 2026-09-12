(function(){
'use strict';
window.LARIOS_TEST_ENV=true;
const realFetch=window.fetch.bind(window);
const rpcMap={app_save_contract:'test_app_save_contract',app_list_contracts:'test_app_list_contracts',app_delete_reservation:'test_app_delete_reservation',app_contract_record:'test_app_contract_record'};
window.fetch=function(input,init){
 let url=typeof input==='string'?input:(input&&input.url)||'';
 if(url.includes('/functions/v1/renthub-booking')) return Promise.resolve(new Response(JSON.stringify({ok:true,test_mode:true,message:'Renthub bloqueado en entorno de pruebas'}),{status:200,headers:{'Content-Type':'application/json'}}));
 if(url.includes('/functions/v1/stripe-checkout')) return Promise.resolve(new Response(JSON.stringify({ok:false,test_mode:true,message:'Stripe real bloqueado en entorno de pruebas'}),{status:409,headers:{'Content-Type':'application/json'}}));
 Object.entries(rpcMap).forEach(([a,b])=>{url=url.replace('/rest/v1/rpc/'+a,'/rest/v1/rpc/'+b)});
 url=url.replace('/rest/v1/pricing?','/rest/v1/test_pricing?').replace('/rest/v1/vehicles?','/rest/v1/test_vehicles?');
 if(typeof input==='string') input=url; else if(input instanceof Request) input=new Request(url,input);
 return realFetch(input,init);
};
function banner(){if(document.getElementById('lrTestBanner'))return;const b=document.createElement('div');b.id='lrTestBanner';b.textContent='⚠ ENTORNO DE PRUEBAS · DATOS AISLADOS · RENTHUB Y COBROS REALES BLOQUEADOS';b.style.cssText='position:sticky;top:0;z-index:999999;background:#b91c1c;color:white;text-align:center;font-weight:900;padding:10px;font:14px system-ui';document.body.prepend(b);document.title='PRUEBAS · Larios Rental Pro'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner);else banner();
})();
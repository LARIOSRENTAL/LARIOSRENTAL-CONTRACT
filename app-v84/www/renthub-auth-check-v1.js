(function(){
'use strict';
const $=id=>document.getElementById(id);
let paymentContract=null,paymentBusy=false;
async function paymentRequest(action){
 if(!window.LariosAccess?.isAdmin?.()||paymentBusy)return;
 const output=$('lrRenthubPaymentResult');paymentBusy=true;
 $('lrRenthubPaymentRetry').disabled=true;$('lrRenthubPaymentVerify').disabled=true;
 try{
  const id=$('lrRenthubPaymentId').value.trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Indica el ID del contrato.');
  if(action==='load'){
   const response=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_contract_record',{method:'POST',headers:hdr(),body:JSON.stringify({p_contract_id:id})});
   const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo leer el contrato');
   paymentContract=data;
   output.textContent=JSON.stringify({contract_number:data.contract_number,total:data.total,method:data.payment_method,reference:data.renthub_id||data.renthub_contract_id,status:data.renthub_sync_status},null,2);
  }else{
   if(!paymentContract||paymentContract.id!==id)throw new Error('Consulta primero el contrato.');
   output.textContent='Procesando '+action+'…';
   const response=await fetch(cfg.supabaseUrl+'/functions/v1/renthub-transfer',{method:'POST',headers:hdr(),body:JSON.stringify({action,contract_id:id})});
   const data=await response.json();output.textContent=JSON.stringify({http:response.status,contract_number:paymentContract.contract_number,...data},null,2);
   if(action==='retry_payment'&&response.ok&&!data.payment_pending)paymentContract.renthub_sync_status='verified';
  }
 }catch(error){output.textContent='Error: '+error.message}
 finally{paymentBusy=false;$('lrRenthubPaymentRetry').disabled=paymentContract?.renthub_sync_status!=='payment_pending';$('lrRenthubPaymentVerify').disabled=!paymentContract;}
}
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
 panel.append(button,output);
 const heading=document.createElement('h3');heading.textContent='Pago contable Renthub · solo administrador';
 const input=document.createElement('input');input.id='lrRenthubPaymentId';input.placeholder='ID del contrato (UUID)';input.setAttribute('aria-label','ID del contrato para pago Renthub');
 input.oninput=()=>{paymentContract=null;$('lrRenthubPaymentRetry').disabled=true;$('lrRenthubPaymentVerify').disabled=true};
 const read=document.createElement('button');read.type='button';read.textContent='Consultar contrato para pago';read.onclick=()=>paymentRequest('load');
 const retry=document.createElement('button');retry.id='lrRenthubPaymentRetry';retry.type='button';retry.disabled=true;retry.textContent='Confirmar registro del pago pendiente · sin cargo a tarjeta';retry.onclick=()=>paymentRequest('retry_payment');
 const verify=document.createElement('button');verify.id='lrRenthubPaymentVerify';verify.type='button';verify.disabled=true;verify.textContent='Verificar pago en Renthub · solo lectura';verify.onclick=()=>paymentRequest('verify_payment');
 const result=document.createElement('pre');result.id='lrRenthubPaymentResult';result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
 panel.append(heading,input,read,retry,verify,result);$('home').appendChild(panel);decorate();
}
function decorate(){const p=$('lrRenthubAuthPanel');if(p)p.hidden=!window.LariosAccess?.isAdmin?.()}
function boot(){install();document.addEventListener('larios:access-ready',()=>{install();decorate()});window.addEventListener('larios:access-ready',()=>{install();decorate()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

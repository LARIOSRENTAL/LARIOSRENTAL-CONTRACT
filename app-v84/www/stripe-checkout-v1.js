(function(){
'use strict';
const $=id=>document.getElementById(id);
let configured=false;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function stripe(action,extra={}){const r=await fetch(cfg.supabaseUrl+'/functions/v1/stripe-checkout',{method:'POST',headers:headers(),body:JSON.stringify({action,...extra})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'No se pudo conectar con Stripe');return data}
function preserveContractTextFields(){for(const id of ['card_number','card_expiry']){const el=$(id);if(!el)continue;el.disabled=false;el.type='text';el.inputMode='text';el.autocomplete='off';el.removeAttribute('pattern');el.removeAttribute('maxlength');el.closest('label')?.classList.remove('hidden')}}
async function status(){try{const data=await stripe('status');configured=!!data.configured;return data}catch(_){configured=false;return{configured:false}}}
async function begin(){preserveContractTextFields();if(window.LariosPayments?.checkout)return window.LariosPayments.checkout();throw new Error('El selector de métodos de pago todavía no está preparado.');}
function bind(){const select=$('payment_method');if(!select)return;preserveContractTextFields();if(select.dataset.legacyStripeNeutralized==='1')return;select.dataset.legacyStripeNeutralized='1';select.addEventListener('change',preserveContractTextFields)}
function install(){bind();const observer=new MutationObserver(bind);observer.observe(document.body,{subtree:true,childList:true});status()}
window.LariosStripe={begin,status,__test:{isCard:value=>value==='Tarjeta'},legacyAutoCheckout:false};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1000));else setTimeout(install,1000);
})();

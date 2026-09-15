(function(){
'use strict';
const $=id=>document.getElementById(id);
let installed=false,current=null,loading=false,signatureBusy=false;
function headers(extra={}){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,...extra}}
async function rpc(name,body={}){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:headers({'Content-Type':'application/json'}),body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());return r.json()}
async function loadRecord(id){const all=await rpc('app_list_contracts',{});return(Array.isArray(all)?all:[]).find(x=>x.id===id)||null}
function setValue(id,v){const el=$(id);if(!el||v===undefined||v===null)return;el.value=String(v)}
function money(v){const n=Number(String(v??'0').replace(',','.'));return Number.isFinite(n)?n.toFixed(2):String(v??'')}
function preservePrices(x){
  const values={rental_price:x.rental_price,insurance_total:x.insurance_total,young_driver_amount:x.young_driver_amount,contract_total:x.total,franchise:x.franchise,deposit:x.deposit,discount_percent:x.discount_percent,vat_percent:x.vat_percent};
  Object.entries(values).forEach(([id,v])=>{if(v===undefined||v===null)return;setValue(id,['discount_percent','vat_percent'].includes(id)?v:money(v));const el=$(id);if(el&&!['contract_total','discount_percent','vat_percent','deposit'].includes(id)){el.dataset.manualPrice='1';el.dataset.priceReady='1'}});
  if($('full_insurance'))$('full_insurance').checked=!!x.full_insurance;
  if($('young_driver'))$('young_driver').checked=!!x.young_driver;
  if(x.payment_method!=null)setValue('payment_method',x.payment_method);
}
function restoreExtras(x){
  const rows=Array.isArray(x.extras_detail)?x.extras_detail:[];if(!rows.length)return;
  rows.forEach(item=>{
    const key=String(item.key||'');
    if(key.startsWith('custom')){
      const n=key.replace(/\D/g,'')||'1';setValue('v2_custom'+n+'_name',item.label||'');setValue('v2_custom'+n+'_qty',item.qty||1);setValue('v2_custom'+n+'_price',money(item.unit||0));return;
    }
    const box=$('v2_'+key),qty=$('v2_'+key+'_qty'),price=$('v2_'+key+'_price');
    if(box)box.checked=true;if(qty)qty.value=String(item.qty||1);if(price){price.value=money(item.unit||0);price.dataset.manualPrice='1'}
  });
}
function restoreCard(x){
  if(x.card_number)setValue('card_number',x.card_number);
  if(x.card_expiry)setValue('card_expiry',x.card_expiry);
}
function hasInk(c){try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>20)return true}catch(_){}return false}
async function restoreSignature(x){
  const c=$('signatureCanvas');if(!c||hasInk(c)||!x?.customer_signature_path)return;
  try{
    const path=String(x.customer_signature_path).replace(/^\/+/,''),r=await fetch(cfg.supabaseUrl+'/storage/v1/object/authenticated/contracts/'+path,{headers:headers()});
    if(!r.ok)return;const blob=await r.blob(),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{try{if(!hasInk(c)){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height)}}finally{URL.revokeObjectURL(url)}};img.src=url;
  }catch(e){console.warn('No se pudo restaurar la firma',e)}
}
async function persistSignature(){
  if(signatureBusy)return;const id=window.LariosCurrentContractId||current?.id,c=$('signatureCanvas');if(!id||!c||!hasInk(c))return;
  signatureBusy=true;
  try{
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)return;
    const path=id+'/customer-signature.png';
    const up=await fetch(cfg.supabaseUrl+'/storage/v1/object/contracts/'+path,{method:'POST',headers:headers({'Content-Type':'image/png','x-upsert':'true'}),body:blob});if(!up.ok)throw new Error(await up.text());
    const patch=await fetch(cfg.supabaseUrl+'/rest/v1/contracts?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:headers({'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify({customer_signature_path:path,updated_at:new Date().toISOString()})});if(!patch.ok)throw new Error(await patch.text());
    if(current)current.customer_signature_path=path;
  }catch(e){console.warn('No se pudo guardar la firma del cliente',e)}finally{signatureBusy=false}
}
function parseExpiry(raw){const m=String(raw||'').trim().match(/^(0?[1-9]|1[0-2])\s*[\/-]\s*(\d{2}|\d{4})$/);if(!m)return null;let y=Number(m[2]);if(y<100)y+=2000;return{month:Number(m[1]),year:y}}
async function persistCard(){
  const id=window.LariosCurrentContractId||current?.id;if(!id)return;
  const digits=String($('card_number')?.value||'').replace(/\D/g,''),exp=parseExpiry($('card_expiry')?.value||'');
  const body={updated_at:new Date().toISOString()};
  if(digits.length>=4)body.card_last4=digits.slice(-4);
  if(exp){body.card_expiry_month=exp.month;body.card_expiry_year=exp.year}
  if(Object.keys(body).length===1)return;
  try{const r=await fetch(cfg.supabaseUrl+'/rest/v1/contracts?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:headers({'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text())}catch(e){console.warn('No se pudieron conservar los datos de tarjeta',e)}
}
function bindPersistence(){
  const cn=$('card_number'),ce=$('card_expiry');
  [cn,ce].forEach(el=>{if(el&&el.dataset.lrPersistCard!=='1'){el.dataset.lrPersistCard='1';el.addEventListener('change',persistCard);el.addEventListener('blur',persistCard)}});
  const c=$('signatureCanvas');if(c&&c.dataset.lrPersistSignature!=='1'){c.dataset.lrPersistSignature='1';['pointerup','mouseup','touchend'].forEach(ev=>c.addEventListener(ev,()=>setTimeout(persistSignature,80),{passive:true}))}
}
async function hydrate(id){
  if(!id||loading)return;loading=true;
  try{
    const x=await loadRecord(id);if(!x)return;current=x;
    if(x.status==='draft')return;
    const apply=()=>{preservePrices(x);restoreCard(x);restoreExtras(x);window.LariosMultiUnitVehicles?.build?.();restoreSignature(x);bindPersistence()};
    apply();setTimeout(apply,120);setTimeout(apply,450);setTimeout(apply,900);
  }catch(e){console.warn('No se pudo restaurar el contrato generado',e)}finally{loading=false}
}
function install(){
  if(installed||!window.LariosReservations)return false;installed=true;
  const oldEdit=LariosReservations.edit.bind(LariosReservations);
  LariosReservations.edit=function(id){const out=oldEdit(id);setTimeout(()=>hydrate(id),20);return out};
  document.addEventListener('click',e=>{if(/Aceptar firma/i.test(String(e.target?.textContent||'')))setTimeout(persistSignature,180)},true);
  new MutationObserver(bindPersistence).observe(document.body,{childList:true,subtree:true});bindPersistence();
  console.log('Generated contract edit persistence installed');return true;
}
if(!install()){let n=0,t=setInterval(()=>{if(install()||++n>100)clearInterval(t)},100)}
window.LariosGeneratedContractEdit={hydrate,persistCard,persistSignature,version:'20260915-v1'};
})();
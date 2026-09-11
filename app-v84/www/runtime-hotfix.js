(function(){
'use strict';
const nativeFetch=window.fetch.bind(window);
function cloneOptions(opt,body){const o={...(opt||{})};o.body=body;return o}
function toIsoDate(value){
  const s=String(value??'').trim();if(!s)return s;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(!m)return s;
  let y=Number(m[3]);if(y<100)y+=(y<=40?2000:1900);
  const mo=Number(m[2]),d=Number(m[1]),x=new Date(Date.UTC(y,mo-1,d));
  if(x.getUTCFullYear()!==y||x.getUTCMonth()!==mo-1||x.getUTCDate()!==d)return s;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function normalizeSaveBody(body){
  try{
    const parsed=JSON.parse(String(body||'{}')),p=parsed?.p_payload;
    if(!p||typeof p!=='object')return body;
    for(const key of ['customer_birth_date','license_issue','license_expiry','additional_birth_date','additional_license_issue','additional_license_expiry','pickup_date','return_date']){
      if(Object.prototype.hasOwnProperty.call(p,key)&&p[key])p[key]=toIsoDate(p[key]);
    }
    return JSON.stringify(parsed);
  }catch(_){return body}
}
async function fetchTemplateWithFallback(input,opt){
  let first=null;
  try{first=await nativeFetch(input,opt);if(first.ok)return first}catch(e){console.warn('Primary contract template load failed',e)}
  const fallbacks=[
    'https://raw.githubusercontent.com/LARIOSRENTAL/LARIOSRENTAL-CONTRACT/agent/mobile-v84/static/assets/contrato-larios-normalizado.pdf',
    'https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/static/assets/contrato-larios-normalizado.pdf'
  ];
  for(const url of fallbacks){try{const r=await nativeFetch(url,{cache:'no-store'});if(r.ok){console.warn('Recovered contract template from fallback',url);return r}}catch(e){console.warn('Template fallback failed',url,e)}}
  if(first)return first;
  throw new Error('No se pudo cargar la plantilla del contrato. Comprueba la conexión y vuelve a intentarlo.');
}
window.fetch=async function(input,opt){
  const url=typeof input==='string'?input:(input&&input.url)||'';
  const method=String(opt?.method||'GET').toUpperCase();

  if(method==='GET'&&/assets\/contrato-larios-normalizado\.pdf(?:\?|$)/i.test(url))return fetchTemplateWithFallback(input,opt);

  // The email Edge Function intentionally returns HTTP 200 for Gmail/OAuth
  // diagnostics so Safari cannot hide the response behind a generic
  // "Load failed". Convert {ok:false,...} back into an application error
  // that the existing contract flow can display to the user.
  const isSend=/\/functions\/v1\/send-contract(?:\?|$)/.test(url) && method==='POST';
  if(isSend){
    const response=await nativeFetch(input,opt);
    let data=null;
    try{data=await response.clone().json()}catch(_){return response}
    if(data && data.ok===false){
      const stage=String(data.stage||'email');
      const detail=String(data.error||'Error desconocido');
      return new Response(JSON.stringify({error:'['+stage+'] '+detail,stage,detail}),{
        status:502,
        statusText:'Email delivery failed',
        headers:{'Content-Type':'application/json; charset=utf-8'}
      });
    }
    return response;
  }

  const isSave=/\/rest\/v1\/rpc\/app_save_contract(?:\?|$)/.test(url) && method==='POST';
  if(!isSave)return nativeFetch(input,opt);
  const normalizedOpt=cloneOptions(opt,normalizeSaveBody(opt?.body));
  const response=await nativeFetch(input,normalizedOpt);
  if(response.ok)return response;
  let text='';try{text=await response.clone().text()}catch(_){return response}
  if(!/23505|vehicles_registration_key|duplicate key value/i.test(text))return response;
  try{
    const parsed=JSON.parse(String(normalizedOpt?.body||'{}'));
    if(!parsed?.p_payload?.vehicle_plate)return response;
    const retry=JSON.parse(JSON.stringify(parsed));
    retry.p_payload.vehicle_plate='';
    console.warn('Retrying contract save without vehicle insert after duplicate registration');
    return nativeFetch(input,cloneOptions(normalizedOpt,JSON.stringify(retry)));
  }catch(_){return response}
};

const $=id=>document.getElementById(id);
const num=id=>Number(String($(id)?.value||'0').replace(',','.'))||0;
const val=id=>String($(id)?.value||'').trim();
const checked=id=>!!$(id)?.checked;
const money=n=>Number(n||0).toFixed(2);
const extras=[
 ['additional_driver',5,null],['child_seat',6,40],['carplay',6,40],['gps',6,40],
 ['booster',5,25],['gloves',5,25],['bike_seat',5,25],['phone_holder',5,25]
];
function days(){return Math.max(1,Math.floor(num('rental_days')||1))}
function extrasTotal(){
  let total=0;
  for(const [k,daily,max] of extras){
    const on=checked('v2_'+k),qty=Math.max(1,num('v2_'+k+'_qty')||1),unit=Math.min(days()*daily,max==null?Infinity:max),t=on?qty*unit:0;
    const out=$('v2_'+k+'_total');if(out)out.textContent=money(t).replace('.',',')+' €';total+=t;
  }
  for(const n of [1,2]){
    const name=val('v2_custom'+n+'_name'),qty=Math.max(1,num('v2_custom'+n+'_qty')||1),price=num('v2_custom'+n+'_price'),t=name?qty*price:0;
    const out=$('v2_custom'+n+'_total');if(out)out.textContent=money(t).replace('.',',')+' €';total+=t;
  }
  return total;
}
function parking(){const g=val('vehicle_group').toUpperCase();if(['50CC','125CC','BICICLETA','E-BIKE'].includes(g))return 0;return /aeropuerto|airport|easy\s*parking/i.test(val('return_location'))?15:0}
function recalc(){
  const rent=num('rental_price'),insurance=num('insurance_total'),young=checked('young_driver')?num('young_driver_amount'):0,ext=extrasTotal(),park=parking(),disc=rent*Math.max(0,num('discount_percent'))/100;
  if(checked('full_insurance')&&$('franchise'))$('franchise').value='0.00';
  const total=Math.max(0,rent-disc+insurance+young+ext+park);
  if($('contract_total'))$('contract_total').value=money(total);
  const box=$('priceBreakdown');
  if(box){
    const rows=[...box.querySelectorAll('.priceLine')];
    const setRow=(label,value)=>{const r=rows.find(x=>(x.querySelector('span')?.textContent||'').trim().toLowerCase()===label.toLowerCase());if(r&&r.querySelector('b'))r.querySelector('b').textContent=value};
    setRow('Extras',money(ext)+' €');setRow('Easy Parking',money(park)+' €');setRow('Descuento','-'+money(disc)+' €');
    const tr=rows.find(r=>r.classList.contains('priceTotal'));if(tr?.querySelector('b'))tr.querySelector('b').textContent=money(total)+' €';
  }
}
function bind(){
  const form=$('reservationForm');if(!form||form.dataset.runtimeHotfix==='1')return;
  form.dataset.runtimeHotfix='1';
  form.addEventListener('input',()=>setTimeout(recalc,0),true);
  form.addEventListener('change',()=>setTimeout(recalc,0),true);
  setTimeout(recalc,50);
}
let tries=0;const timer=setInterval(()=>{bind();if(++tries>120)clearInterval(timer)},250);
window.addEventListener('focus',()=>setTimeout(recalc,50));
console.log('Runtime hotfix: date normalization + PDF template recovery active');
})();
(function(){
'use strict';
const nativeFetch=window.fetch.bind(window);
function cloneOptions(opt,body){const o={...(opt||{})};o.body=body;return o}
window.fetch=async function(input,opt){
  const url=typeof input==='string'?input:(input&&input.url)||'';
  const method=String(opt?.method||'GET').toUpperCase();

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
  const response=await nativeFetch(input,opt);
  if(response.ok)return response;
  let text='';try{text=await response.clone().text()}catch(_){return response}
  if(!/23505|vehicles_registration_key|duplicate key value/i.test(text))return response;
  try{
    const parsed=JSON.parse(String(opt?.body||'{}'));
    if(!parsed?.p_payload?.vehicle_plate)return response;
    const retry=JSON.parse(JSON.stringify(parsed));
    retry.p_payload.vehicle_plate='';
    console.warn('Retrying contract save without vehicle insert after duplicate registration');
    return nativeFetch(input,cloneOptions(opt,JSON.stringify(retry)));
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
})();
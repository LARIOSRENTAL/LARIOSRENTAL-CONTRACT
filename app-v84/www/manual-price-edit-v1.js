(function(){
'use strict';
const $=id=>document.getElementById(id);
const num=v=>{const x=parseFloat(String(v??'').replace(',','.'));return Number.isFinite(x)?x:0};
const money=n=>Number(n||0).toFixed(2);
let boundForm=null;
function extrasFromBreakdown(){
 const box=$('priceBreakdown'); if(!box)return {young:0,extras:0,parking:0};
 const lines=[...box.querySelectorAll('.priceLine')];
 const read=label=>{const line=lines.find(x=>(x.querySelector('span')?.textContent||'').toLowerCase().includes(label));return num((line?.querySelector('b')?.textContent||'').replace(/[^0-9,.-]/g,''))};
 return {young:read('conductor'),extras:read('extras'),parking:read('parking')};
}
function refreshTotal(){
 const rental=num($('rental_price')?.value), insurance=num($('insurance_total')?.value), discountPct=Math.max(0,num($('discount_percent')?.value));
 const {young,extras,parking}=extrasFromBreakdown();
 const discount=rental*discountPct/100;
 const total=Math.max(0,rental-discount+insurance+young+extras+parking);
 if($('contract_total'))$('contract_total').value=money(total);
 const box=$('priceBreakdown');
 if(box){
  const lines=[...box.querySelectorAll('.priceLine')];
  const set=(label,value,prefix='')=>{const line=lines.find(x=>(x.querySelector('span')?.textContent||'').toLowerCase().includes(label));const b=line?.querySelector('b');if(b)b.textContent=prefix+money(value)+' €'};
  set('alquiler',rental); set('seguro',insurance); set('descuento',discount,'-'); set('total',total);
 }
}
function prepareField(id){
 const old=$(id); if(!old||old.dataset.manualEditV1==='1')return;
 const el=old.cloneNode(true); old.replaceWith(el); el.dataset.manualEditV1='1';
 el.inputMode='decimal';
 el.addEventListener('focus',()=>{el.dataset.manualEditing='1';});
 el.addEventListener('input',()=>{refreshTotal();});
 el.addEventListener('blur',()=>{
  const raw=String(el.value||'').trim();
  if(raw===''){el.value='0.00';} else {el.value=money(num(raw));}
  el.dataset.manualEditing='0';
  refreshTotal();
 });
}
function bind(){
 const form=$('reservationForm'); if(!form||form===boundForm)return;
 boundForm=form;
 prepareField('rental_price'); prepareField('insurance_total');
 const d=$('discount_percent'); if(d&&d.dataset.manualTotalV1!=='1'){d.dataset.manualTotalV1='1';d.addEventListener('input',refreshTotal);d.addEventListener('change',refreshTotal)}
 setTimeout(refreshTotal,50);
}
function start(){
 const s=$('reservation'); if(s)new MutationObserver(()=>{if(!s.classList.contains('hidden'))setTimeout(bind,40)}).observe(s,{attributes:true,attributeFilter:['class']});
 setInterval(()=>{if(!$('reservation')?.classList.contains('hidden'))bind()},800);
 bind();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
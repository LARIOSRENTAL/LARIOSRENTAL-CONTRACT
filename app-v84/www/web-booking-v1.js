(function(root){
'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toFixed(2);
let current=null,keep=true,initialDates={},initialExtraKeys=new Set(),initialExtraLabels=new Set();
function isWeb(x){return x?.renthub_created_from_web===true||x?.source==='renthub_web_email'||x?.app_payload?.renthub_created_from_web===true}
function original(){return Number(current?.web_original_price??current?.app_payload?.web_original_price??current?.total??0)}
function normText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function dateKey(value){const s=String(value||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:s}
function extraKey(item){
 const raw=typeof item==='string'?item:(item?.key||item?.label||item?.name||'');
 const s=normText(raw).replace(/\s+/g,' ');
 if(/additional driver|conductor adicional|segundo conductor/.test(s))return 'additional_driver';
 if(/child seat|baby seat|sillita(?! bici)|silla nino|elevador|booster/.test(s))return 'child_seat';
 if(/bike seat|sillita bici|silla bici/.test(s))return 'bike_seat';
 if(/phone holder|soporte movil/.test(s))return 'phone_holder';
 if(/carplay/.test(s))return 'carplay';
 if(/gps/.test(s))return 'gps';
 if(/gloves|guantes/.test(s))return 'gloves';
 if(/helmet|casco|cascos/.test(s))return 'helmet';
 return '';
}
function initOriginal(record){
 const p=record?.app_payload||{};
 initialDates={
  pickup_date:dateKey(record?.pickup_date||record?.delivery_date||p.pickup_date||''),
  return_date:dateKey(record?.return_date||p.return_date||'')
 };
 initialExtraKeys=new Set();initialExtraLabels=new Set();
 const extras=record?.extras_detail||p.extras_detail||record?.web_extras||p.web_extras||[];
 const list=Array.isArray(extras)?extras:String(extras||'').split(/[;·,]/).filter(Boolean);
 for(const item of list){const k=extraKey(item);if(k)initialExtraKeys.add(k);const label=typeof item==='string'?item:(item?.label||item?.name||'');if(normText(label))initialExtraLabels.add(normText(label))}
 const notes=record?.accessories_notes||p.accessories_notes||'';
 for(const item of String(notes).split(/[;·,]/).filter(Boolean)){const k=extraKey(item);if(k)initialExtraKeys.add(k);if(normText(item))initialExtraLabels.add(normText(item))}
}
function restore(){if(!current||!keep)return false;for(const id of ['insurance_total','young_driver_amount']){const e=$(id);if(e){e.value='0.00';e.dataset.manualPrice='1'}}for(const e of document.querySelectorAll('.extrasTable input[id^="v2_"][id$="_price"]')){e.value='0.00';e.dataset.manualPrice='1'}const price=money(original());for(const id of ['rental_price','contract_total']){const e=$(id);if(!e)continue;e.value=price;if(id==='rental_price')e.readOnly=true;e.dataset.manualPrice='1';e.dataset.priceReady='1';if(id==='contract_total')e.dataset.v2base=price}return true}
function preservePrice(){if(!current||!keep)return false;restore();return true}
function open(record){current=isWeb(record)?record:null;keep=!!current&&record.web_price_recalculate!==true;initialDates={};initialExtraKeys=new Set();initialExtraLabels=new Set();if(current)initOriginal(current);const f=$('reservationForm');if(f)f.dataset.webBooking=current?'1':'0';const price=$('rental_price');if(price){price.readOnly=!!current&&keep;price.title=current&&keep?'Precio original de la reserva web':''}if(current){setTimeout(restore,0);setTimeout(restore,600);setTimeout(restore,1200)}}
function newExtra(id,el){
 const m=id.match(/^v2_(additional_driver|child_seat|carplay|gps|booster|gloves|bike_seat|phone_holder|helmet)(?:_|$)/);
 if(m)return el.type==='checkbox'&&el.checked&&!initialExtraKeys.has(m[1]);
 const c=id.match(/^v2_custom\d+_name$/);
 if(c){const label=normText(el.value);return !!label&&!initialExtraLabels.has(label)}
 return false;
}
function onChange(e){
 if(!current||!keep||!e.isTrusted)return;
 const el=e.target,id=el?.id||'';
 let reason='';
 if(id==='pickup_date'||id==='return_date'){
  if(dateKey(el.value)!==initialDates[id])reason='date';
 }else if(newExtra(id,el))reason='extra';
 if(!reason)return;
 if(root.confirm('Reserva web: el precio original es '+money(original())+' €. ¿Quieres actualizar el precio con este cambio?\nAceptar: recalcular. Cancelar: realizar el cambio y mantener el precio web.')){
  keep=false;current.web_price_recalculate=true;const price=$('rental_price');if(price){price.readOnly=false;price.dataset.manualPrice='0';price.dataset.editingPrice='0'}root.LariosAutoPricing?.recalculate?.(true)
 }else setTimeout(restore,0)
}
function preservePayload(payload){if(!current)return payload;const p={...payload,source:'renthub_web_email',renthub_created_from_web:true,source_booking_code:current.source_booking_code||current.app_payload?.source_booking_code,renthub_booking_code:current.renthub_booking_code||current.app_payload?.renthub_booking_code,web_original_price:money(original()),web_pending_payment:current.web_pending_payment??current.app_payload?.web_pending_payment,web_price_locked:keep,web_price_recalculate:!keep};if(keep){p.total=money(original());p.rental_price=money(original())}return p}
root.LariosWebBooking={isWeb,open,restore,preservePrice,preservePayload,get current(){return current}};
document.addEventListener('change',onChange,true);
document.addEventListener('input',e=>{if(current&&keep&&e.target?.id==='rental_price')setTimeout(restore,0)},true);
})(window);

(function(root){
'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toFixed(2);
let current=null,keep=true;
function isWeb(x){return x?.renthub_created_from_web===true||x?.source==='renthub_web_email'||x?.app_payload?.renthub_created_from_web===true}
function original(){return Number(current?.web_original_price??current?.total??0)}
function restore(){if(!current||!keep)return false;for(const id of ['insurance_total','young_driver_amount']){const e=$(id);if(e){e.value='0.00';e.dataset.manualPrice='1'}}for(const e of document.querySelectorAll('.extrasTable input[id^="v2_"][id$="_price"]')){e.value='0.00';e.dataset.manualPrice='1'}const price=money(original());for(const id of ['rental_price','contract_total']){const e=$(id);if(!e)continue;e.value=price;if(id==='rental_price')e.readOnly=true;e.dataset.manualPrice='1';e.dataset.priceReady='1';if(id==='contract_total')e.dataset.v2base=price}return true}
function preservePrice(){if(!current||!keep)return false;restore();return true}
function open(record){current=isWeb(record)?record:null;keep=!!current&&record.web_price_recalculate!==true;const f=$('reservationForm');if(f)f.dataset.webBooking=current?'1':'0';const price=$('rental_price');if(price){price.readOnly=!!current&&keep;price.title=current&&keep?'Precio original de la reserva web':''}if(current){setTimeout(restore,0);setTimeout(restore,600);setTimeout(restore,1200)}}
function onChange(e){if(!current||!keep)return;const id=e.target?.id;if(!id||!new Set(['vehicle_group','vehicle_quantity','rental_days','pickup_date','pickup_time','return_date','return_time','pickup_location','return_location','tariff94','full_insurance','young_driver','young_driver_amount','insurance_total','discount_percent','rental_price','v2_additional_driver','v2_phone_holder','v2_helmet']).has(id)&&!/^v2_(?:child_seat|booster|gloves|gps|carplay|bike_seat|custom)/.test(id))return;if(e.type==='input'&&e.target?.type==='text'&&id!=='rental_price')return;if(root.confirm('Reserva web: el precio original es '+money(original())+' €. ¿Quieres actualizar el precio con este cambio?\nAceptar: recalcular. Cancelar: realizar el cambio y mantener el precio web.')){keep=false;current.web_price_recalculate=true;const price=$('rental_price');if(price){price.readOnly=false;price.dataset.manualPrice='0';price.dataset.editingPrice='0'}root.LariosAutoPricing?.recalculate?.(true)}else setTimeout(restore,0)}
function preservePayload(payload){if(!current)return payload;const p={...payload,source:'renthub_web_email',renthub_created_from_web:true,source_booking_code:current.source_booking_code,renthub_booking_code:current.renthub_booking_code,web_original_price:money(original()),web_pending_payment:current.web_pending_payment,web_price_locked:keep,web_price_recalculate:!keep};if(keep){p.total=money(original());p.rental_price=money(original())}return p}
root.LariosWebBooking={isWeb,open,restore,preservePrice,preservePayload,get current(){return current}};
document.addEventListener('change',onChange,true);
document.addEventListener('input',e=>{if(current&&keep&&e.target?.id==='rental_price')setTimeout(restore,0)},true);
})(window);

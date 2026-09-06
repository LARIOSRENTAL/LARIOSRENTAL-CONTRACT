(function(){
'use strict';
const $=id=>document.getElementById(id);
const val=id=>String($(id)?.value||'').trim();
const num=id=>Number(String($(id)?.value||'0').replace(',','.'))||0;
const chk=id=>!!$(id)?.checked;
const money=n=>Number(n||0).toFixed(2);
function toIso(v){const s=String(v||'').trim();let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/);if(m){const yy=Number(m[3]),year=yy<=40?2000+yy:1900+yy;return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s;}
function selectedExtras(){const out=[];document.querySelectorAll('.extrasTable input[id^="v2_"]').forEach(el=>{if(el.type==='checkbox'&&!el.checked)return;});return out;}
function payload(){return{
  id:window.LariosCurrentContractId||'',status:'draft',
  customer_name:val('customer_name'),customer_document:val('customer_document'),customer_email:val('customer_email'),customer_phone:val('customer_phone'),customer_nationality:val('customer_nationality'),customer_address:val('customer_address'),customer_birth_date:toIso(val('customer_birth_date')),
  driving_license:val('driving_license'),license_issued_by:val('license_issued_by'),license_issue:toIso(val('license_issue')),license_expiry:toIso(val('license_expiry')),
  additional_name:val('additional_name'),additional_driving_license:val('additional_driving_license'),additional_license_issued_by:val('additional_license_issued_by'),additional_birth_date:toIso(val('additional_birth_date')),additional_license_issue:toIso(val('additional_license_issue')),additional_license_expiry:toIso(val('additional_license_expiry')),
  vehicle_group:val('vehicle_group'),assigned_vehicle_group:val('assigned_vehicle_group'),vehicle_quantity:String(['BICICLETA','E-BIKE'].includes(val('vehicle_group').toUpperCase())?Math.max(1,num('vehicle_quantity')):1),vehicle_plate:val('vehicle_plate'),vehicle_model:val('vehicle_model'),vehicle_color:val('vehicle_color'),fuel_type:val('fuel_type'),fuel_out:val('fuel_out'),fuel_in:val('fuel_in'),
  pickup_date:val('pickup_date'),pickup_time:val('pickup_time'),pickup_location:val('pickup_location'),return_date:val('return_date'),return_time:val('return_time'),return_location:val('return_location'),rental_days:String(Math.max(1,num('rental_days'))),
  tariff94:chk('tariff94'),tariff_name:$('tariff94')?.dataset.tariffName||'Tarifa Base',tariff_markup_percent:Number($('tariff94')?.dataset.markup||0),rental_price:money(num('rental_price')),full_insurance:chk('full_insurance'),insurance_total:money(num('insurance_total')),young_driver:chk('young_driver'),young_driver_amount:money(num('young_driver_amount')),discount_percent:money(num('discount_percent')),vat_percent:val('vat_percent')||'21',total:money(num('contract_total')),deposit:money(num('deposit')),payment_method:'Tarjeta',franchise:money(chk('full_insurance')?0:num('franchise')),billing_notes:val('billing_notes'),extras_detail:selectedExtras()
};}
async function saveDraft(){
  if(!window.LariosCurrentContractId)throw new Error('Abre primero una reserva desde la agenda.');
  if(!val('customer_name'))throw new Error('Falta el nombre del cliente.');
  if(num('contract_total')<=0)throw new Error('El importe total debe ser mayor que cero.');
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_save_contract',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_payload:payload()})});
  const data=await r.json().catch(async()=>({error:await r.text().catch(()=>'' )}));
  if(!r.ok)throw new Error(data?.message||data?.error||'No se pudo guardar la reserva antes del pago.');
  if(data?.id)window.LariosCurrentContractId=data.id;
  return data;
}
window.LariosStripeBridge={saveDraft,payload};
})();

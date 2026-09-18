(function(){
'use strict';
let returnInstalled=false,editInstalled=false;
const $=id=>document.getElementById(id);
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function rowsFor(contractId){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/preauthorizations?select=id,status,channel,created_at&contract_id=eq.'+encodeURIComponent(contractId)+'&order=created_at.desc',{headers:headers()});
  if(!r.ok)throw new Error(await r.text());
  const rows=await r.json();
  return Array.isArray(rows)?rows:[];
}
async function contractRecord(contractId){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_contract_record',{method:'POST',headers:headers(),body:JSON.stringify({p_contract_id:contractId})});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
function madridParts(value){
  if(!value)return null;
  const d=new Date(value);if(isNaN(d))return null;
  return{
    date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(d),
    time:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
  };
}
function displayDate(value){
  const s=String(value||'').slice(0,10),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?m[3]+'/'+m[2]+'/'+m[1]:String(value||'');
}
function setValue(id,value){const el=$(id);if(el&&value!==undefined&&value!==null)el.value=String(value)}
function setCheck(id,value){const el=$(id);if(el)el.checked=!!value}
function reservationVisible(){const section=$('reservation');return !!section&&!section.classList.contains('hidden')}
function fillRecovered(x){
  if(!x?.id)throw new Error('No se pudo recuperar la reserva.');
  window.LariosCurrentContractId=x.id;
  const form=$('reservationForm');if(form)form.dataset.contractStatus=x.status||'draft';
  const title=$('reservationTitle');if(title)title.textContent=x.status&&x.status!=='draft'?'Editar contrato '+(x.contract_number||''):'Editar reserva';
  const fields={
    customer_name:x.customer_name,customer_document:x.customer_document,customer_email:x.customer_email,customer_phone:x.customer_phone,
    customer_nationality:x.customer_nationality,customer_address:x.customer_address,driving_license:x.driving_license,license_issued_by:x.license_issued_by,
    additional_name:x.additional_name,additional_driving_license:x.additional_driving_license,additional_license_issued_by:x.additional_license_issued_by,
    vehicle_group:x.vehicle_group,assigned_vehicle_group:x.assigned_vehicle_group,vehicle_quantity:x.vehicle_quantity,vehicle_plate:x.vehicle_plate,
    vehicle_model:x.vehicle_model,vehicle_color:x.vehicle_color,fuel_type:x.fuel_type,fuel_out:x.fuel_out,pickup_location:x.pickup_location,
    return_location:x.return_location,rental_days:x.rental_days,rental_price:x.rental_price,insurance_total:x.insurance_total,
    young_driver_amount:x.young_driver_amount,discount_percent:x.discount_percent,vat_percent:x.vat_percent,contract_total:x.total,
    franchise:x.franchise,deposit:x.deposit,payment_method:x.payment_method,agency:x.agency,billing_notes:x.billing_notes,
    card_number:x.card_number,card_expiry:x.card_expiry
  };
  Object.entries(fields).forEach(([id,v])=>setValue(id,v));
  for(const [id,key] of [['customer_birth_date','customer_birth_date'],['license_issue','license_issue'],['license_expiry','license_expiry'],['additional_birth_date','additional_birth_date'],['additional_license_issue','additional_license_issue'],['additional_license_expiry','additional_license_expiry']]){
    if(x[key])setValue(id,displayDate(x[key]));
  }
  const p=madridParts(x.pickup_at),r=madridParts(x.return_at);
  if(p){setValue('pickup_date',p.date);setValue('pickup_time',p.time)}
  if(r){setValue('return_date',r.date);setValue('return_time',r.time)}
  setCheck('full_insurance',x.full_insurance);setCheck('young_driver',x.young_driver);setCheck('tariff94',x.tariff94);setCheck('cash_without_card',x.cash_without_card);
  if(x.status&&x.status!=='draft'){
    for(const id of ['rental_price','insurance_total','young_driver_amount','franchise']){const el=$(id);if(el){el.dataset.manualPrice='1';el.dataset.priceReady='1'}}
  }
  const actions=document.querySelectorAll('.finalActions button');
  if(actions[0])actions[0].textContent=x.status&&x.status!=='draft'?'Guardar cambios':'Guardar reserva';
  if(actions[1])actions[1].textContent=x.status&&x.status!=='draft'?'Regenerar contrato y enviar':'Generar contrato y enviar';
  $('reservation')?.classList.remove('hidden');$('home')?.classList.add('hidden');$('list')?.classList.add('hidden');
  setTimeout(()=>window.LariosMultiUnitVehicles?.build?.(),0);
  setTimeout(()=>window.LariosGeneratedContractEdit?.hydrate?.(x.id),40);
  setTimeout(()=>window.LariosAccess?.decorate?.(),60);
}
function installEditRecovery(){
  const api=window.LariosReservations;
  if(!api||typeof api.edit!=='function'||editInstalled)return false;
  const original=api.edit.bind(api);
  editInstalled=true;
  api.edit=async function(id){
    window.LariosCurrentContractId=id||window.LariosCurrentContractId||'';
    let originalError=null;
    try{await original(id)}catch(e){originalError=e;console.error('Editar reserva original falló',e)}
    await new Promise(resolve=>setTimeout(resolve,35));
    if(reservationVisible())return;
    try{
      const x=await contractRecord(id);
      fillRecovered(x);
    }catch(e){
      console.error('No se pudo recuperar Editar reserva',e);
      alert('No se pudo abrir la reserva. '+(e?.message||originalError?.message||''));
    }
  };
  api.edit.__lrEditRecovery=true;
  console.log('Reservation edit recovery installed');
  return true;
}
function installReturn(){
  const g=window.LariosGuarantees,l=window.LariosLifecycle;
  if(!g||!l||returnInstalled)return false;
  const original=g.completeReturn?.bind(g);
  if(typeof original!=='function')return false;
  returnInstalled=true;
  g.completeReturn=async function(contractId){
    try{
      const rows=await rowsFor(contractId);
      if(rows.length===0){
        const ok=confirm('No consta ninguna preautorización registrada para este contrato.\n\nSi el vehículo ya ha sido devuelto y no queda ninguna garantía pendiente, puedes marcarlo como recogido igualmente.\n\n¿Marcar vehículo como recogido?');
        if(!ok)return;
        await l.confirmDeposit(contractId);
        return;
      }
    }catch(e){console.warn('Return without preauth check failed',e)}
    return original(contractId);
  };
  g.__allowReturnWithoutPreauth=true;
  console.log('Return without preauthorization override installed');
  return true;
}
function install(){return installReturn()}
if(!install()){
  let n=0;const t=setInterval(()=>{install();if(returnInstalled||++n>80)clearInterval(t)},100);
}
window.LariosReturnWithoutPreauth={install,fillRecovered,version:'20260918-v3'};
})();

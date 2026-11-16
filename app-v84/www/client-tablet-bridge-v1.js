(function(){'use strict';
var currentJob=null,pollTimer=null,devices=[],activeContractId=null,sentSnapshot=null,latestClientResponse={},liveViewOpen=false,jobCompleted=false;
function $(id){return document.getElementById(id)}
function val(id){return String($(id)?.value||'').trim()}
function num(id){return Number(String($(id)?.value||'0').replace(',','.'))||0}
function checked(id){return!!$(id)?.checked}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
async function rpc(name,body){
  var r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body||{})
  });
  var d=null;try{d=await r.json()}catch(e){}
  if(!r.ok)throw new Error((d&&d.message)||'No se pudo conectar con la tablet');
  return d;
}
function extrasText(){var parts=[];document.querySelectorAll('.extrasTable input[type=checkbox]:checked').forEach(function(e){var label=e.closest('label')?.textContent||e.getAttribute('aria-label')||'';if(label.trim())parts.push(label.trim())});return parts.join(', ')}
function groupCode(){return val('vehicle_group').toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-')}
function categoryKey(){var g=groupCode();if(g==='50CC')return'50cc';if(g==='125CC')return'125cc';return g==='BICICLETA'||g==='E-BIKE'?g:(g?'Grupo '+g:'')}
async function insuranceQuote(){
  try{
    var r=await fetch(cfg.supabaseUrl+'/rest/v1/pricing?select=category,insurance_first_day,insurance_extra_day,franchise&active=eq.true',{headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token}});
    if(!r.ok)return{quote:num('insurance_total'),franchise:num('franchise')};
    var rows=await r.json(),key=categoryKey().toUpperCase(),row=rows.find(function(x){return String(x.category||'').toUpperCase()===key});
    if(!row)return{quote:num('insurance_total'),franchise:num('franchise')};
    var days=Math.max(1,Number(val('rental_days')||1)||1);
    return{quote:Number(row.insurance_first_day||0)+Math.max(0,days-1)*Number(row.insurance_extra_day||0),franchise:Number(row.franchise||0)};
  }catch(e){return{quote:num('insurance_total'),franchise:num('franchise')}}
}
async function snapshot(){
  var p=await insuranceQuote();
  return{
    contract_id:window.LariosCurrentContractId||'',
    contract_number:document.querySelector('#reservationTitle')?.textContent?.match(/\d{4,}/)?.[0]||'',
    customer_name:val('customer_name'),
    customer_document:val('customer_document'),
    customer_birth_date:val('customer_birth_date'),
    customer_phone:val('customer_phone'),
    customer_email:val('customer_email'),
    customer_address:val('customer_address'),...(window.LariosAddress?.payload?.()||{}),
    driving_license:val('driving_license'),
    license_issued_by:val('license_issued_by'),
    license_issue:val('license_issue'),
    license_expiry:val('license_expiry'),
    vehicle_group:val('vehicle_group'),
    vehicle_model:val('vehicle_model'),
    vehicle_plate:val('vehicle_plate'),
    pickup_date:val('pickup_date'),
    pickup_time:val('pickup_time'),
    pickup_location:val('pickup_location'),
    return_date:val('return_date'),
    return_time:val('return_time'),
    return_location:val('return_location'),
    rental_days:val('rental_days'),
    rental_price:num('rental_price'),
    full_insurance:checked('full_insurance'),
    insurance_total:num('insurance_total'),
    full_insurance_quote:p.quote,
    franchise:p.franchise,
    total:num('contract_total'),
    extras:extrasText(),
    conditions_url:'https://www.lariosrental.com/condiciones-generales/'
  };
}
function modal(){var m=$('lrTabletModal');if(m)return m;m=document.createElement('div');m.id='lrTabletModal';m.innerHTML='<div class="lrTabletShade"></div><div class="lrTabletBox"><button class="lrTabletX" type="button">×</button><h2>Tablets de oficina</h2><div id="lrTabletBody"></div></div>';document.body.appendChild(m);m.querySelector('.lrTabletX').onclick=closeModal;m.querySelector('.lrTabletShade').onclick=closeModal;return m}
function closeModal(){var m=$('lrTabletModal');if(m)m.classList.remove('show')}
function setBody(html){modal().classList.add('show');$('lrTabletBody').innerHTML=html}
function fresh(x){return!!x&&Date.now()-new Date(x).getTime()<20000}
function currentEditorMatches(){var section=$('reservation');return !!activeContractId&&String(window.LariosCurrentContractId||'')===String(activeContractId)&&section&&!section.classList.contains('hidden')}
function addressText(r){var p=r&&r.customer_address_parts||{},street=[p.street||'',p.number||''].filter(Boolean).join(' '),city=[p.city||'',p.postal_code||''].filter(Boolean).join(' ');return [street,city].filter(Boolean).join(', ')||r?.customer_address||''}
function liveRow(label,value){return '<div class="lrTabletLiveRow"><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b></div>'}
function liveMarkup(r){r=r||{};var insurance=typeof r.full_insurance==='boolean'?(r.full_insurance?'Seguro completo':'Seguro estándar'):'Aún sin elegir';var terms=r.accepted_terms?'Aceptadas':'Pendiente';var signature=r.has_signature?'Firma iniciada':'Pendiente';return '<div id="lrTabletLiveContent">'+liveRow('Teléfono',r.customer_phone)+liveRow('Email',r.customer_email)+liveRow('Domicilio',addressText(r))+liveRow('Seguro mostrado',insurance)+liveRow('Total mostrado',r.total==null?'':money(r.total))+liveRow('Condiciones',terms)+liveRow('Firma',signature)+'<div class="lrTabletLiveFoot">Actualizado en directo · la pantalla se refresca automáticamente</div></div>'}
function refreshLiveView(r){if(r)latestClientResponse=r;var slot=$('lrTabletLiveContent');if(slot)slot.outerHTML=liveMarkup(latestClientResponse)}
function showLiveView(){if(!activeContractId||!currentJob)return alert('Primero envía la reserva a una tablet.');liveViewOpen=true;setBody('<div class="lrTabletLiveTitle">Datos que está completando el cliente</div><div id="lrTabletLiveState" class="lrTabletState">'+(jobCompleted?'✓ Datos recibidos':'Esperando actividad de la tablet…')+'</div>'+liveMarkup(latestClientResponse));}
async function showTabletPicker(){
  try{
    setBody('<div class="lrTabletState">Buscando tablets…</div>');
    var d=await rpc('app_tablet_list_devices',{});
    devices=(Array.isArray(d)?d:[]).filter(function(x){return fresh(x.last_seen_at)});
    var html='<div class="lrTabletHint">Selecciona la tablet a la que quieres enviar este contrato:</div>';
    if(!devices.length){
      html+='<div class="lrTabletState">No hay ninguna tablet conectada ahora mismo.</div><div class="lrTabletHint">Abre <b>cliente.html</b> en el iPad y espera unos segundos.</div>';
    }else{
      devices.forEach(function(x){
        html+='<button type="button" class="lrTabletDevice" data-id="'+esc(x.id)+'"><b>'+esc((x.label||'Tablet')+' · '+(x.pair_code||''))+'</b><span>'+(fresh(x.last_seen_at)?'Disponible':'Conectada')+'</span></button>';
      });
    }
    setBody(html);
    document.querySelectorAll('.lrTabletDevice').forEach(function(b){b.onclick=function(){sendToTablet(b.dataset.id)}});
  }catch(e){setBody('<div class="lrTabletError">'+esc(e.message)+'</div>')}
}
async function sendToTablet(deviceId){
  var id=window.LariosCurrentContractId;
  if(!id)return alert('Abre primero una reserva.');
  try{
    setBody('<div class="lrTabletState">Enviando contrato…</div>');
    var snap=await snapshot();
    currentJob=await rpc('app_tablet_assign',{p_device_id:deviceId,p_contract_id:id,p_payload:snap});
    activeContractId=id;sentSnapshot=snap;latestClientResponse={customer_phone:snap.customer_phone,customer_email:snap.customer_email,customer_address:snap.customer_address,customer_address_parts:snap.customer_address_parts,full_insurance:snap.full_insurance,insurance_total:snap.insurance_total,franchise:snap.franchise,total:snap.total};jobCompleted=false;liveViewOpen=false;
    ensureViewButton();
    var device=devices.find(function(x){return x.id===deviceId})||{};
    setBody('<div class="lrTabletState lrTabletDone">✓ Enviado a '+esc(device.label||('Tablet '+(device.pair_code||'')))+'</div><div id="lrTabletLive" class="lrTabletState">Cliente completando datos…</div><button type="button" class="lrTabletLiveButton" onclick="LariosClientTablet.viewLive()">Ver lo que rellena el cliente</button>');
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(checkStatus,2500);
    checkStatus();
  }catch(e){setBody('<div class="lrTabletError">'+esc(e.message)+'</div>')}
}
async function checkStatus(){
  if(!currentJob)return;
  try{
    var d=await rpc('app_tablet_job',{p_job_id:currentJob});
    var s=Array.isArray(d)?d[0]:d;
    if(!s)return;
    var live=$('lrTabletLive');
    if(s.status==='pending'){
      if(live)live.textContent='Cliente completando datos…';
      if(s.response)refreshLiveView(s.response);
      var state=$('lrTabletLiveState');if(state)state.textContent='Cliente completando los datos…';
    }
    if(s.status==='completed'){
      if(pollTimer){clearInterval(pollTimer);pollTimer=null}
      latestClientResponse=Object.assign({},latestClientResponse,s.response||{},{has_signature:!!(s.response&&s.response.signature_data_url)});jobCompleted=true;refreshLiveView(latestClientResponse);
      if(currentEditorMatches())applyResponse(s.response||{});
      else document.dispatchEvent(new CustomEvent('larios:client-tablet-completed',{detail:Object.assign({contract_id:activeContractId},s.response||{})}));
      try{await rpc('app_tablet_ack',{p_job_id:currentJob})}catch(e){}
      if(live){live.className='lrTabletState lrTabletDone';live.textContent='✓ Datos y firma recibidos en el contrato'}
      var state=$('lrTabletLiveState');if(state)state.textContent='✓ Datos recibidos. La reserva sigue abierta en la oficina.';
    }
  }catch(e){console.warn('Tablet status',e)}
}
function setField(id,value){var e=$(id);if(!e||value==null)return;e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}
function drawSignature(dataUrl){
  var c=$('signatureCanvas')||$('signature_canvas')||document.querySelector('canvas[data-signature], .signature canvas');
  if(!c||!dataUrl)return false;
  var img=new Image();
  img.onload=function(){var x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);var scale=Math.min(c.width/img.width,c.height/img.height),w=img.width*scale,h=img.height*scale;x.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);c.dataset.clientSignature='1'};
  img.src=dataUrl;return true;
}
function sameValue(id,value){var e=$(id);return !!e&&String(e.value||'').trim()===String(value==null?'':value).trim()}
function applyResponse(r){
  var base=sentSnapshot||{};
  if(sameValue('customer_phone',base.customer_phone))setField('customer_phone',r.customer_phone);
  if(sameValue('customer_email',base.customer_email))setField('customer_email',r.customer_email);
  var addressUntouched=sameValue('customer_address',base.customer_address);
  if(addressUntouched)setField('customer_address',r.customer_address);
  if(addressUntouched&&r.customer_address_parts&&window.LariosAddress?.setParts)window.LariosAddress.setParts(r.customer_address_parts);
  if(typeof r.full_insurance!=='undefined'){
    var fi=$('full_insurance');
    if(fi&&fi.checked===!!base.full_insurance){fi.checked=!!r.full_insurance;fi.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  if(typeof r.insurance_total!=='undefined'&&num('insurance_total')===Number(base.insurance_total||0))setField('insurance_total',r.insurance_total);
  if(typeof r.franchise!=='undefined'&&num('franchise')===Number(base.franchise||0))setField('franchise',r.franchise);
  if(typeof r.total!=='undefined'&&num('contract_total')===Number(base.total||0))setField('contract_total',r.total);
  var drawn=drawSignature(r.signature_data_url);
  var form=$('reservationForm');
  if(form){
    form.dataset.clientDataChecked='1';
    form.dataset.clientTermsAccepted='1';
    form.dataset.clientTermsAcceptedAt=r.accepted_terms_at||'';
    form.dataset.clientSignatureDataUrl=r.signature_data_url||'';
    form.dataset.clientSignatureDrawn=drawn?'1':'0';
  }
  document.dispatchEvent(new CustomEvent('larios:client-tablet-completed',{detail:Object.assign({contract_id:activeContractId},r)}));
}
function ensureViewButton(){var b=$('lrViewTablet'),res=$('reservation'),tb=res&&res.querySelector('.toolbar');if(!tb)return;if(!b){b=document.createElement('button');b.type='button';b.id='lrViewTablet';b.className='lrViewTablet';b.textContent='Ver en directo';b.onclick=showLiveView;var send=$('lrSendTablet');if(send)send.insertAdjacentElement('afterend',b);else tb.appendChild(b)}b.disabled=!currentJob||String(window.LariosCurrentContractId||'')!==String(activeContractId);b.title=b.disabled?'Envía primero esta reserva a una tablet':'Ver los datos que está escribiendo el cliente';}
function ensureButton(){
  var res=$('reservation');
  if(!res||res.classList.contains('hidden'))return;
  var tb=res.querySelector('.toolbar');
  if(!tb)return;
  if(!$('lrSendTablet')){var b=document.createElement('button');b.type='button';b.id='lrSendTablet';b.className='lrSendTablet';b.textContent='Enviar a tablet';b.onclick=showTabletPicker;tb.appendChild(b)}
  ensureViewButton();
}
var style=document.createElement('style');
style.textContent='.lrSendTablet,.lrViewTablet{border:0;border-radius:9px;padding:9px 12px;font-weight:800;white-space:nowrap}.lrSendTablet{margin-left:auto;background:#2563eb;color:white}.lrViewTablet{background:#0f766e;color:white}.lrViewTablet:disabled{background:#cbd5e1;color:#475569}.lrTabletShade{position:fixed;inset:0;background:rgba(17,24,39,.55)}#lrTabletModal{display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;padding:20px}#lrTabletModal.show{display:flex}.lrTabletBox{position:relative;background:#fff;border-radius:18px;padding:24px;width:min(520px,100%);max-height:90dvh;overflow:auto;box-shadow:0 22px 55px rgba(0,0,0,.25)}.lrTabletX{position:absolute;right:12px;top:8px;border:0;background:none;font-size:30px}.lrTabletHint{color:#6b7280;font-size:13px;margin:8px 0}.lrTabletState{padding:12px;border-radius:10px;background:#f3f4f6;font-weight:700;margin-top:8px}.lrTabletDone{background:#ecfdf5;color:#065f46}.lrTabletError{background:#fef2f2;color:#991b1b;padding:12px;border-radius:10px}.lrTabletDevice{display:flex;justify-content:space-between;align-items:center;width:100%;padding:13px;margin:8px 0;border:1px solid #d1d5db;border-radius:10px;background:white;text-align:left}.lrTabletDevice span{font-size:12px;color:#6b7280}.lrTabletLiveTitle{font-size:20px;font-weight:900;margin:8px 38px 12px 0}.lrTabletLiveButton{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:900}.lrTabletLiveRow{display:grid;grid-template-columns:38% 62%;gap:8px;padding:11px 4px;border-bottom:1px solid #e5e7eb;font-size:14px}.lrTabletLiveRow span{color:#64748b}.lrTabletLiveRow b{overflow-wrap:anywhere;text-align:right;color:#111827}.lrTabletLiveFoot{padding-top:12px;color:#64748b;font-size:12px}@media(max-width:520px){.lrSendTablet,.lrViewTablet{font-size:11px;padding:8px 7px}.lrTabletBox{padding:18px}}';
document.head.appendChild(style);
document.addEventListener('larios:reservation-opened',function(){setTimeout(ensureButton,50)});
var ob=new MutationObserver(function(){ensureButton()});ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
setTimeout(ensureButton,700);
window.LariosClientTablet={open:showTabletPicker,status:checkStatus,viewLive:showLiveView};
})();

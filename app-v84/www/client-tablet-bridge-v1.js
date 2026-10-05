(function(){
'use strict';
var ENDPOINT='https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/renthub-once-62957-preview';
var currentSession=null,pollTimer=null;

function $(id){return document.getElementById(id)}
function val(id){return String($(id)?.value||'').trim()}
function num(id){return Number(String($(id)?.value||'0').replace(',','.'))||0}
function checked(id){return !!$(id)?.checked}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function endpoint(body){
  return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body)}).then(async function(r){var d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'No se pudo conectar con la tablet');return d})
}
function extrasText(){
  var parts=[];document.querySelectorAll('.extrasTable input[type=checkbox]:checked').forEach(function(e){var label=e.closest('label')?.textContent||e.getAttribute('aria-label')||'';if(label.trim())parts.push(label.trim())});return parts.join(', ')
}
function groupCode(){return val('vehicle_group').toUpperCase().replace(/^GRUPO\s+/,'').replace(/[_ ]/g,'-')}
function categoryKey(){var g=groupCode();if(g==='50CC')return'50cc';if(g==='125CC')return'125cc';return g==='BICICLETA'||g==='E-BIKE'?g:(g?'Grupo '+g:'')}
async function insuranceQuote(){
  try{
    var r=await fetch(cfg.supabaseUrl+'/rest/v1/pricing?select=category,insurance_first_day,insurance_extra_day,franchise&active=eq.true',{headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token}});
    if(!r.ok)return{quote:num('insurance_total'),franchise:num('franchise')};
    var rows=await r.json(),key=categoryKey().toUpperCase(),row=rows.find(function(x){return String(x.category||'').toUpperCase()===key});
    if(!row)return{quote:num('insurance_total'),franchise:num('franchise')};
    var days=Math.max(1,Number(val('rental_days')||1)||1);
    var quote=Number(row.insurance_first_day||0)+Math.max(0,days-1)*Number(row.insurance_extra_day||0);
    return{quote:quote,franchise:Number(row.franchise||0)}
  }catch(e){return{quote:num('insurance_total'),franchise:num('franchise')}}
}
async function snapshot(){
  var p=await insuranceQuote();
  return{
    contract_id:window.LariosCurrentContractId||'',
    contract_number:document.querySelector('#reservationTitle')?.textContent?.match(/\d{4,}/)?.[0]||'',
    customer_name:val('customer_name'),customer_document:val('customer_document'),customer_birth_date:val('customer_birth_date'),
    customer_phone:val('customer_phone'),customer_email:val('customer_email'),customer_address:val('customer_address'),
    driving_license:val('driving_license'),license_issued_by:val('license_issued_by'),license_issue:val('license_issue'),license_expiry:val('license_expiry'),
    vehicle_group:val('vehicle_group'),vehicle_model:val('vehicle_model'),vehicle_plate:val('vehicle_plate'),
    pickup_date:val('pickup_date'),pickup_time:val('pickup_time'),pickup_location:val('pickup_location'),
    return_date:val('return_date'),return_time:val('return_time'),return_location:val('return_location'),
    rental_days:val('rental_days'),rental_price:num('rental_price'),full_insurance:checked('full_insurance'),
    insurance_total:num('insurance_total'),full_insurance_quote:p.quote,franchise:p.franchise,total:num('contract_total'),extras:extrasText()
  }
}
function modal(){
  var m=$('lrTabletModal');if(m)return m;
  m=document.createElement('div');m.id='lrTabletModal';m.innerHTML='<div class="lrTabletShade"></div><div class="lrTabletBox"><button class="lrTabletX" type="button">×</button><h2>Tablet del cliente</h2><div id="lrTabletBody"></div></div>';
  document.body.appendChild(m);
  m.querySelector('.lrTabletX').onclick=closeModal;m.querySelector('.lrTabletShade').onclick=closeModal;return m
}
function closeModal(){var m=$('lrTabletModal');if(m)m.classList.remove('show')}
function setBody(html){modal().classList.add('show');$('lrTabletBody').innerHTML=html}
function formatCode(c){return String(c||'').match(/.{1,4}/g)?.join('-')||c}
async function sendToTablet(){
  var id=window.LariosCurrentContractId;if(!id)return alert('Abre primero una reserva.');
  try{
    setBody('<div class="lrTabletState">Preparando conexión…</div>');
    var snap=await snapshot();
    var d=await endpoint({action:'create',contract_id:id,snapshot:snap});
    currentSession=d.session_id;
    setBody('<div class="lrTabletHint">En el iPad abre:</div><div class="lrTabletUrl">lariosrental.github.io/larios-contract/cliente.html</div><div class="lrTabletHint">Código de conexión</div><div class="lrTabletCode">'+esc(formatCode(d.code))+'</div><div id="lrTabletLive" class="lrTabletState">Esperando al cliente…</div>');
    startPolling();
  }catch(e){setBody('<div class="lrTabletError">'+esc(e.message)+'</div>')}
}
function startPolling(){
  if(pollTimer)clearInterval(pollTimer);
  pollTimer=setInterval(checkStatus,2500);checkStatus()
}
async function checkStatus(){
  if(!currentSession)return;
  try{
    var d=await endpoint({action:'status',session_id:currentSession}),s=d.session;
    if(!s)return;
    var live=$('lrTabletLive');
    if(s.status==='active'&&live)live.textContent='Cliente conectado · completando datos…';
    if(s.status==='completed'){
      if(pollTimer){clearInterval(pollTimer);pollTimer=null}
      applyResponse(s.customer_response||{});
      if(live){live.className='lrTabletState lrTabletDone';live.textContent='✓ Datos y firma recibidos en el contrato'}
    }
  }catch(e){console.warn('Tablet status',e)}
}
function setField(id,value){var e=$(id);if(!e||value==null)return;e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}
function drawSignature(dataUrl){
  var c=$('signatureCanvas');if(!c||!dataUrl)return;
  var img=new Image();img.onload=function(){var x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);var scale=Math.min(c.width/img.width,c.height/img.height),w=img.width*scale,h=img.height*scale;x.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);try{c.dataset.clientSignature='1'}catch(e){}};img.src=dataUrl
}
function applyResponse(r){
  setField('customer_phone',r.customer_phone);setField('customer_email',r.customer_email);setField('customer_address',r.customer_address);drawSignature(r.signature_data_url);
  var form=$('reservationForm');if(form){form.dataset.clientDataChecked='1';form.dataset.clientTermsAccepted='1';form.dataset.clientTermsAcceptedAt=r.accepted_terms_at||''}
  document.dispatchEvent(new CustomEvent('larios:client-tablet-completed',{detail:r}))
}
function ensureButton(){
  var res=$('reservation');if(!res||res.classList.contains('hidden'))return;
  var tb=res.querySelector('.toolbar');if(!tb||$('lrSendTablet'))return;
  var b=document.createElement('button');b.type='button';b.id='lrSendTablet';b.className='lrSendTablet';b.textContent='Enviar a tablet';b.onclick=sendToTablet;tb.appendChild(b)
}
var style=document.createElement('style');style.textContent='.lrSendTablet{margin-left:auto;border:0;border-radius:9px;padding:9px 12px;background:#2563eb;color:white;font-weight:800}.lrTabletShade{position:fixed;inset:0;background:rgba(17,24,39,.55)}#lrTabletModal{display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;padding:20px}#lrTabletModal.show{display:flex}.lrTabletBox{position:relative;background:#fff;border-radius:18px;padding:24px;width:min(520px,100%);box-shadow:0 22px 55px rgba(0,0,0,.25)}.lrTabletX{position:absolute;right:12px;top:8px;border:0;background:none;font-size:30px}.lrTabletCode{font-size:32px;letter-spacing:.08em;font-weight:900;text-align:center;padding:18px;background:#f3f4f6;border-radius:12px;margin:8px 0 14px}.lrTabletUrl{font-weight:800;word-break:break-all;margin:6px 0 16px}.lrTabletHint{color:#6b7280;font-size:13px}.lrTabletState{padding:12px;border-radius:10px;background:#f3f4f6;font-weight:700}.lrTabletDone{background:#ecfdf5;color:#065f46}.lrTabletError{background:#fef2f2;color:#991b1b;padding:12px;border-radius:10px}';document.head.appendChild(style);
document.addEventListener('larios:reservation-opened',function(){setTimeout(ensureButton,50)});
var ob=new MutationObserver(function(){ensureButton()});ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});setTimeout(ensureButton,700);
window.LariosClientTablet={send:sendToTablet,status:checkStatus};
})();
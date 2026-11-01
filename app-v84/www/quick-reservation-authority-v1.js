(function(){
'use strict';
const $=id=>document.getElementById(id);
const VERSION='PARSER QA1';
let baseV3=null,baseV2=null;
function normalize(raw){
  return String(raw||'')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\u00A0/g,' ')
    .replace(/(^|\s)([01]\d|2[0-3])([0-5]\d)(\d{1,2})(?=\s+(?:bicis?|bicicletas?|e[\s-]?bikes?)\b)/ig,(_,lead,h,m,q)=>lead+h+':'+m+' '+q)
    .replace(/([0-9]{1,2})\s*[:：﹕∶꞉﹔]\s*([0-9]{2})/g,(_,h,m)=>String(h).padStart(2,'0')+':'+m)
    .replace(/(^|\s)([01]?\d|2[0-3])\s+([0-5]\d)(?=\s|$)/g,(_,lead,h,m)=>lead+String(h).padStart(2,'0')+':'+m)
    .replace(/\s+/g,' ')
    .trim();
}
function clock(raw){
  const s=normalize(raw);
  const m=s.match(/(?:^|[^0-9])([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?!\d)/);
  return m?String(m[1]).padStart(2,'0')+':'+m[2]:'';
}
function stripClock(raw){
  const s=normalize(raw);
  return s.replace(/(?:^|\s)([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?=\s|$)/,' ').replace(/\s+/g,' ').trim();
}
function captureBases(){
  const v3=window.LariosQuickReservationV3?.parseQuick;
  const v2=window.LariosQuickReservationV2?.parseQuick;
  if(v3&&!v3.__lrAuthority)baseV3=v3;
  if(v2&&!v2.__lrAuthority)baseV2=v2;
}
function callBase(text){
  const fn=baseV3||baseV2;
  if(!fn)throw new Error('Parser de reservas no disponible.');
  return fn(text);
}
function safeParse(raw){
  const extracted=window.LariosBookingParser?.extras(raw);
  const clean=normalize(extracted?.text??raw),hh=clock(clean);
  const apply=p=>window.LariosQuickFields?.clean(raw,Object.assign(p,extracted?.payload||{}))||Object.assign(p,extracted?.payload||{});
  if(!clean)throw new Error('Pega primero el mensaje de WhatsApp.');
  try{
    const p=callBase(clean);
    if(hh){p.pickup_time=hh;p.return_time=hh;}
    p.whatsapp_message=String(raw||'');
    return apply(p);
  }catch(first){
    if(!hh||!/hora/i.test(String(first?.message||first)))throw first;
    const retry='09:00 '+stripClock(clean);
    const p=callBase(retry);
    p.pickup_time=hh;
    p.return_time=hh;
    p.whatsapp_message=String(raw||'');
    return apply(p);
  }
}
safeParse.__lrAuthority=true;
async function edge(slug,body){
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/'+slug,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||d.message||'No se pudo completar la operación');
  return d;
}
async function rpc(name,args){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args)}),d=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(d?.message||d?.error||'No se pudo aplicar el criterio de WhatsApp');
  return d;
}
function manualItems(p){
  const group=String(p?.vehicle_group||'').toUpperCase(),quantity=Math.max(1,Number(p?.vehicle_quantity)||1);
  if(quantity===1||group==='BICICLETA'||group==='E-BIKE')return[p];
  const total=Number(String(p.total||0).replace(',','.'))||0,rental=Number(String(p.rental_price||0).replace(',','.'))||0;
  return Array.from({length:quantity},(_,index)=>({...p,
    vehicle_quantity:'1',
    total:total>0?(total/quantity).toFixed(2):p.total,
    rental_price:rental>0?(rental/quantity).toFixed(2):p.rental_price,
    manual_whatsapp_unit_index:index+1,
    manual_whatsapp_unit_count:quantity,
    reservation_detail:[p.reservation_detail,`UNIDAD ${index+1} DE ${quantity}`].filter(Boolean).join(' · ')
  }));
}
async function createQuick(){
  const btn=document.querySelector('.qrCreate'),err=$('quickError');
  if(err)err.textContent='';
  try{
    const raw=$('quickMessage')?.value||'',provisional=safeParse(raw);
    if(btn){btn.disabled=true;btn.textContent='Aplicando reglas de WhatsApp…';}
    const normalized=await rpc('app_normalize_manual_reservation',{p_raw:raw,p_payload:provisional}),items=manualItems(normalized),saved=[];
    if(btn)btn.textContent=items.length>1?'Creando '+items.length+' reservas…':'Creando…';
    for(const item of items)saved.push(await rpc('app_save_contract',{p_payload:item}));
    if($('quickRenthub')?.checked){
      const codes=[];
      for(const row of saved){const id=row?.id||row?.contract_id||row;try{const rh=await edge('renthub-booking',{action:'create',contract_id:id});codes.push(rh.external_reference)}catch(e){alert('La reserva se ha creado en Larios Rental, pero Renthub no pudo registrarla: '+e.message);}}
      if(codes.length)alert('Reserva'+(codes.length>1?'s':'')+' creada'+(codes.length>1?'s':'')+' en Larios Rental y Renthub. Código'+(codes.length>1?'s':'')+': '+codes.join(', '));
    }
    window.LariosReservations?.closeQuick?.();
    if($('agendaDate'))$('agendaDate').value=normalized.pickup_date;
    await window.LariosReservations?.loadAgenda?.(normalized.pickup_date);
    if(typeof window.changeAgendaDate==='function')window.changeAgendaDate();
  }catch(e){if(err)err.textContent=e.message||String(e);}
  finally{if(btn){btn.disabled=false;btn.textContent='✧ Crear reserva';}}
}
createQuick.__lrAuthority=true;
function validateVisible(){
  const input=$('quickMessage'),err=$('quickError');
  if(!input||!err)return;
  const raw=input.value||'';
  if(!raw.trim()){err.textContent='';return;}
  try{safeParse(raw);err.textContent='';}
  catch(e){if(/hora/i.test(String(e?.message||e)))err.textContent=e.message||String(e);}
}
function marker(){const el=$('lrReleaseVersion');if(el&&!el.textContent.includes(VERSION))el.textContent=el.textContent+' · '+VERSION;}
function install(){
  captureBases();
  if(window.LariosQuickReservationV3)window.LariosQuickReservationV3.parseQuick=safeParse;
  if(window.LariosQuickReservationV2)window.LariosQuickReservationV2.parseQuick=safeParse;
  if(window.LariosReservations)window.LariosReservations.createQuick=createQuick;
  marker();
  validateVisible();
}
document.addEventListener('input',e=>{if(e.target?.id==='quickMessage')setTimeout(()=>{install();validateVisible();},0);},true);
document.addEventListener('paste',e=>{if(e.target?.id==='quickMessage')setTimeout(()=>{install();validateVisible();},0);},true);
document.addEventListener('click',e=>{if(e.target?.closest?.('.qrCreate'))install();},true);
[0,100,300,700,1300,2500,5000,9000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('focus',()=>setTimeout(install,0));
window.LariosQuickAuthority={parseQuick:safeParse,version:VERSION,install,clock,normalize,manualItems};
console.log('Quick reservation authority QA1 installed');
})();

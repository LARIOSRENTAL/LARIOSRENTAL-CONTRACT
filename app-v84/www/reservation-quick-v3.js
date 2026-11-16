(function(){
'use strict';
const base=window.LariosQuickReservationV2?.parseQuick;
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
function localDate(d=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value+'-'+p.find(x=>x.type==='day').value}
function addDays(iso,n){const p=String(iso).split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10)}
function diffDays(a,b){if(!a||!b)return 1;return Math.max(1,Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000))}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
const months={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
function explicit(day,month,year){const y=year||Number(localDate().slice(0,4)),d=new Date(Date.UTC(y,month-1,day));return d.toISOString().slice(0,10)}
function dateFrom(s){const t=norm(s);let m=t.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);if(m){let y=m[3]?Number(m[3]):0;if(y&&y<100)y+=2000;return explicit(Number(m[1]),Number(m[2]),y||undefined)}m=t.match(/\b(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);return m?explicit(Number(m[1]),months[m[2]]):''}
function timeFrom(s){const t=norm(s);let m=t.match(/\b(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)?\b/);if(!m){m=t.match(/\b(\d{1,2})\s*h(?:\s*(\d{1,2}))?\b/);if(m){const h=Number(m[1]),mins=Number(m[2]||0);return h>=0&&h<=23&&mins>=0&&mins<=59?pad(h)+':'+pad(mins):''}return /manana temprano/.test(t)?'09:00':''}let h=Number(m[1]);if(m[3]==='pm'&&h<12)h+=12;if(m[3]==='am'&&h===12)h=0;return pad(h)+':'+pad(Number(m[2]))}
function groupInfo(s){
 const t=norm(s);let q=1,g='',m=t.match(/\bx\s*(\d+)\b/);if(m)q=Math.max(1,Number(m[1]));
 m=t.match(/\b(\d+)\s*x\s*(?:yamaha\s+neos\s*)?(50\s*cc|125\s*cc|e[\s-]?bikes?|bicicletas?|bicis?)\b/);if(m){q=Math.max(1,Number(m[1]));g=m[2]}
 if(!g){m=t.match(/\b(\d+)\s*(?:motos?\s*)?(50\s*cc|125\s*cc)\b/);if(m){q=Math.max(1,Number(m[1]));g=m[2]}}
 if(!g){m=t.match(/\b(\d+)\s*(e[\s-]?bikes?|bicicletas?|bicis?)\b/);if(m){q=Math.max(1,Number(m[1]));g=m[2]}}
 if(!g){m=t.match(/\b(?:yamaha\s+neos\s*)?(50\s*cc|125\s*cc|e[\s-]?bikes?|bicicletas?|bicis?)\b/);if(m)g=m[1]} if(!g){m=t.match(/\b(50|125)\b(?=\s+(?:l\s*)?apart(?:a?ment(?:os)?|ments?)\b)/);if(m)g=m[1]+'cc'}
 if(!g){m=t.match(/\b(?:coche|grupo|g)\s*:?\s*([a-z0-9-]+)\b/);if(m)g=m[1]}
 g=String(g||'').replace(/\s+/g,'');if(/^50cc$/i.test(g))g='50cc';else if(/^125cc$/i.test(g))g='125cc';else if(/e[\s-]?bikes?/i.test(g))g='E-BIKE';else if(/bici/i.test(g))g='BICICLETA';else g=g.toUpperCase();return{group:g,quantity:q}
}
function phoneFrom(s){const m=String(s||'').match(/\+\d[\d\s\u00a0-]{7,}\d/);return m?m[0].replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim():''}
function collaborator(s){const t=' '+norm(s)+' ';const defs=[['L APARTAMENTOS 636638887',/\b(?:ele\s*apart(?:a?ment(?:os)?|ments?)|l\s*apart(?:a?ment(?:os)?|ments?)|lapart(?:a?ment(?:os)?|ments?))\b/],['SOL MAESTRANZA',/\bsol\s+maestranza\b/],['CITY EXPERT',/\bcity\s+expert\b/],['DULCE HOGAR',/\bdulce\s+hogar\b/],['INMOSWISS',/\binmoswiss\b/],['PARQUE FLAT',/\bparque\s+flat\b/]];return defs.find(([,r])=>r.test(t))?.[0]||''}
function totalFrom(s){const t=String(s||''),eq=[...t.matchAll(/=\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*€/g)].pop();if(eq)return Number(eq[1].replace(',','.'));const all=[...t.matchAll(/([0-9]+(?:[.,][0-9]{1,2})?)\s*€/g)];return all.length?Number(all[all.length-1][1].replace(',','.')):0}
function field(raw,label){const m=raw.match(new RegExp('(?:^|\\n)\\s*\\*?'+label+'\\s*:?\\s*([^\\n]+)','i'));return m?m[1].trim():''}
function qtyForStoredReservation(gi){return ['BICICLETA','E-BIKE'].includes(String(gi.group||'').toUpperCase())?Math.max(1,gi.quantity||1):1}
function verbose(raw){const gi=groupInfo(raw),today=localDate();let pickupDate=dateFrom(field(raw,'Fecha de entrega')||field(raw,'Duraci[oó]n del alquiler')||raw),pickupTime=timeFrom(field(raw,'Hora de entrega')||field(raw,'Entrega')||raw),returnDate=dateFrom(field(raw,'Fecha de recogida')),returnTime=timeFrom(field(raw,'Hora de recogida')||field(raw,'Hora')||'');let pickupLocation=field(raw,'Direcci[oó]n de entrega')||field(raw,'Entrega en'),returnLocation=field(raw,'Direcci[oó]n de recogida');if(!returnLocation||/misma ubicacion/i.test(returnLocation)||/misma ubicacion/i.test(field(raw,'Fecha de recogida')))returnLocation=pickupLocation;if(!pickupDate)pickupDate=today;if(!pickupTime)pickupTime='09:00';let days=Math.max(1,Number((field(raw,'Dias de alquiler').match(/\d+/)||[])[0]||0)||diffDays(pickupDate,returnDate));if(!returnDate)returnDate=addDays(pickupDate,days);if(!returnTime)returnTime=pickupTime;const name=field(raw,'Nombre cliente')||field(raw,'Nombre'),phone=field(raw,'N[uú]mero de contacto')||field(raw,'Tel[eé]fono cliente')||field(raw,'Tel[eé]fono')||phoneFrom(raw),amount=totalFrom(raw);return{status:'draft',customer_name:name||'Pendiente',customer_document:'',customer_email:'',customer_phone:phone,customer_nationality:'',customer_address:'',driving_license:'',license_issued_by:'',license_expiry:'',vehicle_group:gi.group,vehicle_quantity:String(qtyForStoredReservation(gi)),vehicle_plate:'',vehicle_model:'',vehicle_color:'',fuel_type:'',pickup_date:pickupDate,pickup_time:pickupTime,pickup_location:pickupLocation,return_date:returnDate,return_time:returnTime,return_location:returnLocation||pickupLocation,rental_days:String(days),rental_price:amount?String(amount):'0',full_insurance:false,insurance_total:'0',discount_percent:'0',vat_percent:'21',total:amount?String(amount):'0',deposit:'0',payment_method:'',reservation_detail:'',whatsapp_message:raw,agency:collaborator(raw)}}
function compact(raw){
if(!base)throw Error('Parser base no disponible');let s=String(raw||'').trim(),day='';
const usesMessageTime=/\b(?:ahora|ha salido|han salido)\b/i.test(s);
if(/\b(?:hoy|ahora|ha salido|han salido)\b/i.test(s)){day='today';s=s.replace(/\b(?:hoy|ahora|ha salido|han salido)\b/ig,' ')}else if(/\bma[nñ]ana\b/i.test(s)){day='tomorrow';s=s.replace(/\bma[nñ]ana\b/ig,' ')}
const phone=phoneFrom(s);if(phone)s=s.replace(phone,' ');
if(usesMessageTime&&!timeFrom(s)){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),hh=parts.find(x=>x.type==='hour').value,mm=parts.find(x=>x.type==='minute').value;s=hh+':'+mm+' '+s}
const p=base(s.replace(/\s+/g,' ').trim()),gi=groupInfo(raw),literalDate=dateFrom(raw),agency=collaborator(raw);
if(gi.group){p.vehicle_group=gi.group;p.vehicle_quantity=String(qtyForStoredReservation(gi))}
if(literalDate&&!day)p.pickup_date=literalDate;if(day==='today')p.pickup_date=localDate();if(day==='tomorrow')p.pickup_date=addDays(localDate(),1);
if(day||literalDate)p.return_date=addDays(p.pickup_date,Math.max(1,Number(p.rental_days)||1));if(phone)p.customer_phone=phone;
const nm=String(raw).match(/\b\d+\s*(?:d[ií]a|d[ií]as|dia|dias|d)\b\s+([A-Za-zÀ-ÿ' -]{2,50}?)\s+(?=\+\d)/i);if(nm){p.customer_name=nm[1].trim();if(p.pickup_location?.endsWith(p.customer_name))p.pickup_location=p.pickup_location.slice(0,-p.customer_name.length).trim()}
p.agency=agency||p.agency||'';let place=String(p.pickup_location||'').trim();
if(/\b(?:ofi|oficina)\b/i.test(raw))place='OFICINA';else{place=place.replace(/\bcity\s+expert\b/ig,' ').replace(/\s+/g,' ').replace(/^[\s,;:+-]+|[\s,;:+-]+$/g,'');if(!place&&agency==='CITY EXPERT'){const t=norm(raw),places=[['BARCELO','barcelo'],['CISTER','cister'],['POSADA','posada'],['CALLE GRANADA','calle granada'],['MUELLE HEREDIA','muelle heredia'],['ESTACION AUTOBUSES','estacion autobuses']];place=places.find(([,needle])=>t.includes(needle))?.[0]||''}}
if(place){p.pickup_location=place;p.return_location=place}else if(p.return_location)p.return_location=p.pickup_location||p.return_location;return p
}
let pendingServiceContext=null;
const SERVICE_CONTEXT_MS=90000;
function isVerboseMessage(raw){return /(\*?servicio\*?|fecha\s*:|fecha de entrega|hora de entrega|direccion de entrega|direcci[oó]n de entrega|fecha de recogida|hora de recogida|direcci[oó]n de recogida|duraci[oó]n del alquiler|nombre cliente|n[uú]mero de contacto|total a pagar|coche\s*:)/i.test(String(raw||''))}
function followupInfo(raw){
 const t=String(raw||'').trim();
 if(!t||t.includes('\n')||t.length>80)return null;
 const gi=groupInfo(t),agency=collaborator(t);
 if(!gi.group&&!agency)return null;
 const stripped=norm(t).replace(/\b(?:50|125)(?:\s*cc)?\b/g,' ').replace(/\b(?:g|grupo)\s*:?[\s-]*[a-z0-9-]+\b/g,' ').replace(/\b(?:l\s*)?apart(?:a?ment(?:os)?|ments?)\b/g,' ').trim();
 return stripped?null:{group:gi.group,agency};
}
function parseQuick(raw){
 let source=String(raw||'').trim();
 const follow=followupInfo(source),now=Date.now();
 if(follow&&pendingServiceContext&&now-pendingServiceContext.at<=SERVICE_CONTEXT_MS)source=pendingServiceContext.raw+'\n'+source;
 const isVerbose=isVerboseMessage(source),p=isVerbose?verbose(source):compact(source);
 if(isVerbose&&/\bservicio\b/i.test(norm(source))&&!p.vehicle_group){
   pendingServiceContext={raw:source,at:now};
   throw Error('Reserva pendiente de mensaje de continuación con grupo y/o colaborador.');
 }
 if(p.vehicle_group)pendingServiceContext=null;
 return p
}
let collaboratorLookup=null;
async function resolveCollaborator(raw,p){
 try{
  if(!collaboratorLookup){
   collaboratorLookup=(async()=>{
    const headers={apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token};
    const [ar,cr]=await Promise.all([
     fetch(cfg.supabaseUrl+'/rest/v1/collaborator_aliases?select=alias,normalized_alias,collaborator_id',{headers}),
     fetch(cfg.supabaseUrl+'/rest/v1/collaborators?select=id,name,active&active=eq.true',{headers})
    ]);
    if(!ar.ok||!cr.ok)throw Error('No se pudieron leer los colaboradores activos');
    const [aliases,collabs]=await Promise.all([ar.json(),cr.json()]);
    const names=new Map(collabs.map(c=>[String(c.id),c.name]));
    return aliases.map(a=>({alias:a.alias,normalized:a.normalized_alias||norm(a.alias),name:names.get(String(a.collaborator_id))})).filter(a=>a.name&&a.normalized).sort((x,y)=>y.normalized.length-x.normalized.length)
   })()
  }
  const aliases=await collaboratorLookup,t=' '+norm(raw)+' ';
  const match=aliases.find(a=>t.includes(' '+a.normalized+' '))||aliases.find(a=>t.includes(a.normalized));
  if(!match)return p.agency||collaborator(raw)||'';
  p.agency=match.name;
  let place=String(p.pickup_location||'');
  const aliasText=String(match.alias||'').trim();
  if(aliasText)place=place.toLowerCase().split(aliasText.toLowerCase()).join(' ');
  place=place.replace(/city\s+expert/ig,' ').replace(/\s+/g,' ').trim();
  if(/\b(?:ofi|oficina)\b/i.test(raw)){p.pickup_location='OFICINA';p.return_location='OFICINA'}
  else if(place){p.pickup_location=place;p.return_location=place}
  return p.agency
 }catch(e){return p.agency||collaborator(raw)||''}
}
async function savePayload(p){');
  const place=String(p.pickup_location||'').replace(new RegExp('\\b'+escape(match.alias)+'\\b','ig'),' ').replace(/\\bcity\\s+expert\\b/ig,' ').replace(/\\s+/g,' ').replace(/^[\\s,;:+-]+|[\\s,;:+-]+$/g,'');
  if(/\\b(?:ofi|oficina)\\b/i.test(raw)){p.pickup_location='OFICINA';p.return_location='OFICINA'}
  else if(place){p.pickup_location=place;p.return_location=place}
  return p.agency
 }catch(e){return p.agency||collaborator(raw)||''}
}
async function savePayload(p){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_save_contract',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_payload:p})});if(!r.ok)throw Error(await r.text());return r.json()}
function splitScooterReservations(raw,p){
 const gi=groupInfo(raw),g=String(p.vehicle_group||gi.group||'').toUpperCase().replace(/\s+/g,'');
 if(!['50CC','125CC'].includes(g)||gi.quantity<=1)return[p];
 const count=Math.max(1,gi.quantity),total=Number(String(p.total||'0').replace(',','.'))||0,rental=Number(String(p.rental_price||'0').replace(',','.'))||0;
 return Array.from({length:count},()=>({...p,vehicle_quantity:'1',total:total>0?(total/count).toFixed(2):p.total,rental_price:rental>0?(rental/count).toFixed(2):p.rental_price}));
}
async function createQuick(){if(window.LariosAccess?.isEmployee?.())return alert('Solo los administradores pueden crear reservas manualmente.');const btn=document.querySelector('.qrCreate'),err=$('quickError');if(err)err.textContent='';try{const raw=$('quickMessage')?.value||'',p=parseQuick(raw);await resolveCollaborator(raw,p);const payloads=splitScooterReservations(raw,p);if(btn){btn.disabled=true;btn.textContent=payloads.length>1?'Creando '+payloads.length+' reservas…':'Creando…'}for(const item of payloads)await savePayload(item);window.LariosReservations?.closeQuick?.();if($('agendaDate'))$('agendaDate').value=p.pickup_date;await window.LariosReservations?.loadAgenda?.(p.pickup_date);if(typeof window.changeAgendaDate==='function')window.changeAgendaDate()}catch(e){if(err)err.textContent=e.message||String(e)}finally{if(btn){btn.disabled=false;btn.textContent='✧ Crear reserva'}}}
function install(){if(window.LariosReservations)window.LariosReservations.createQuick=createQuick;if(window.LariosQuickReservationV2)window.LariosQuickReservationV2.parseQuick=parseQuick}
window.LariosQuickReservationV3={parseQuick,collaborator,createQuick,groupInfo,followupInfo,splitScooterReservations,install,version:'flow2b-service-context-20261001'};install();setTimeout(install,250);setTimeout(install,1200);
})();

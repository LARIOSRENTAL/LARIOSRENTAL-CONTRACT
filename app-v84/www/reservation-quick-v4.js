(function(){
'use strict';
const $=id=>document.getElementById(id);
const baseParse=window.LariosQuickReservationV3?.parseQuick;
if(!baseParse)return;
function madridDate(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value+'-'+p.find(x=>x.type==='day').value}
function madridTime(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());return p.find(x=>x.type==='hour').value+':'+p.find(x=>x.type==='minute').value}
function addDays(iso,n){const a=String(iso).split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]));d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10)}
function scooterInfo(raw){const t=String(raw||'').toLowerCase().replace(/\s+/g,' ').trim();let m=t.match(/\b(\d+)\s*x\s*(50|125)(?:\s*cc)?\b/);if(!m)m=t.match(/\b(\d+)\s+(?:motos?\s+)?(50|125)(?:\s*cc)?\b/);if(!m)return null;return{quantity:Math.max(1,Number(m[1])||1),group:m[2]==='50'?'50cc':'125cc'} }
function normalizeScooter(raw){const info=scooterInfo(raw);if(!info)return raw;let text=String(raw);text=text.replace(/\b\d+\s*x\s*(?:50|125)(?:\s*cc)?\b/i,info.group);text=text.replace(/\b\d+\s+(?:motos?\s+)?(?:50|125)(?:\s*cc)?\b/i,info.group);return text}
function parseQuick(raw){
 let text=String(raw||'').trim();
 const isNow=/\bahora\b/i.test(text);
 if(isNow)text=text.replace(/\bahora\b/ig,madridTime());
 text=normalizeScooter(text);
 const p=baseParse(text);
 const s=scooterInfo(raw);
 if(s){p.vehicle_group=s.group;p.vehicle_quantity='1'}
 if(isNow){p.pickup_date=madridDate();p.pickup_time=madridTime();p.return_date=addDays(p.pickup_date,Math.max(1,Number(p.rental_days)||1));p.return_time=p.pickup_time}
 p.whatsapp_message=raw;
 return p;
}
async function savePayload(p){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_save_contract',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_payload:p})});if(!r.ok)throw Error(await r.text());return r.json()}
function split(raw,p){const s=scooterInfo(raw);if(!s||s.quantity<=1)return[p];const total=Number(String(p.total||0).replace(',','.'))||0,rental=Number(String(p.rental_price||0).replace(',','.'))||0;return Array.from({length:s.quantity},()=>({...p,vehicle_group:s.group,vehicle_quantity:'1',total:total>0?(total/s.quantity).toFixed(2):p.total,rental_price:rental>0?(rental/s.quantity).toFixed(2):p.rental_price}))}
async function createQuick(){const btn=document.querySelector('.qrCreate'),err=$('quickError');if(err)err.textContent='';try{const raw=$('quickMessage')?.value||'',p=parseQuick(raw),items=split(raw,p);if(btn){btn.disabled=true;btn.textContent=items.length>1?'Creando '+items.length+' reservas…':'Creando…'}for(const item of items)await savePayload(item);window.LariosReservations?.closeQuick?.();if($('agendaDate'))$('agendaDate').value=p.pickup_date;await window.LariosReservations?.loadAgenda?.(p.pickup_date);if(typeof window.changeAgendaDate==='function')window.changeAgendaDate()}catch(e){if(err)err.textContent=e.message||String(e)}finally{if(btn){btn.disabled=false;btn.textContent='✧ Crear reserva'}}}
function install(){window.LariosQuickReservationV3.parseQuick=parseQuick;window.LariosQuickReservationV3.createQuick=createQuick;window.LariosQuickReservationV3.scooterInfo=scooterInfo;window.LariosQuickReservationV3.version='flow2c-now-scooters-20260913c';if(window.LariosQuickReservationV2)window.LariosQuickReservationV2.parseQuick=parseQuick;if(window.LariosReservations)window.LariosReservations.createQuick=createQuick}
install();setTimeout(install,250);setTimeout(install,1200);
})();

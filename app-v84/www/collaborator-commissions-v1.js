(function(){
'use strict';
const $=id=>document.getElementById(id);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const money=n=>(Number(n)||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
let collaborators=[],aliases=[],currentRecord=null;

function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function rest(path,opt={}){const r=await fetch(cfg.supabaseUrl+'/rest/v1/'+path,{...opt,headers:{...headers(),...(opt.headers||{})}});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json()}
async function rpc(name,body){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:headers(),body:JSON.stringify(body||{})});if(!r.ok)throw new Error(await r.text());return r.json()}

async function loadCatalog(){
  if(collaborators.length)return;
  [collaborators,aliases]=await Promise.all([
    rest('collaborators?select=id,name,commission_percent&active=eq.true&order=name'),
    rest('collaborator_aliases?select=collaborator_id,alias,normalized_alias')
  ]);
}
function matchPartner(text){
  const n=norm(text); if(!n)return null;
  const exact=aliases.find(a=>a.normalized_alias===n);
  if(exact)return collaborators.find(c=>c.id===exact.collaborator_id)||null;
  return null;
}
function reservationExcluded(r){
  const txt=norm([r?.reservation_detail,r?.whatsapp_message,r?.billing_notes].filter(Boolean).join(' '));
  return Number(r?.discount_percent||0)>0 || txt.includes('SIN COMISION');
}
function installField(){
  const form=$('reservationForm'); if(!form)return;
  let el=$('agency');
  if(!el){
    const pickup=$('pickup_location'); if(!pickup)return;
    const wrap=document.createElement('label'); wrap.id='lrCollaboratorWrap';
    wrap.innerHTML='Colaborador<input id="agency" list="lrCollaboratorList" placeholder="Sin colaborador">';
    const host=pickup.closest('label')||pickup.parentElement;
    host.parentElement?.insertBefore(wrap,host.nextSibling);
    el=$('agency');
  }
  let dl=$('lrCollaboratorList');
  if(!dl){dl=document.createElement('datalist');dl.id='lrCollaboratorList';document.body.appendChild(dl)}
  dl.innerHTML=collaborators.map(c=>'<option value="'+String(c.name).replace(/"/g,'&quot;')+'"></option>').join('');
  if(!el.dataset.lrBound){
    el.dataset.lrBound='1';
    el.addEventListener('input',()=>{el.dataset.manual='1'});
  }
}
function autoFill(){
  const el=$('agency'),pickup=$('pickup_location'); if(!el||!pickup||reservationExcluded(currentRecord))return;
  if((el.value||'').trim())return;
  const p=matchPartner(pickup.value);
  if(p)el.value=p.name;
}
async function patchReservation(){
  try{await loadCatalog();installField();autoFill()}catch(e){console.warn('Colaboradores',e)}
}
document.addEventListener('larios:reservation-opened',e=>{
  currentRecord=e.detail?.record||null;
  setTimeout(async()=>{await patchReservation();const el=$('agency');if(el&&currentRecord?.agency)el.value=currentRecord.agency;else autoFill()},20);
});
document.addEventListener('change',e=>{if(e.target?.id==='pickup_location')autoFill()});
new MutationObserver(()=>{if(!$('reservation')?.classList.contains('hidden'))patchReservation()}).observe(document.body,{childList:true,subtree:true});

function ensureScreen(){
  if($('commissions'))return;
  const s=document.createElement('style');s.textContent=`
#commissions .commissionFilters{display:grid;grid-template-columns:180px 1fr auto;gap:10px;align-items:end;margin-bottom:14px}
.commissionSummary{padding:14px;border-radius:12px;background:#f3f4f6;margin:10px 0;font-weight:800}
.commissionTable{width:100%;border-collapse:collapse;font-size:13px}.commissionTable th,.commissionTable td{padding:9px 7px;border-bottom:1px solid #e5e7eb;text-align:left;white-space:nowrap}.commissionTable input,.commissionTable select{padding:7px;font-size:13px;margin:0}.commissionTable .excluded{opacity:.55}
@media(max-width:760px){#commissions .commissionFilters{grid-template-columns:1fr}.commissionScroll{overflow:auto}.commissionTable{min-width:850px}}`;document.head.appendChild(s);
  const sec=document.createElement('section');sec.id='commissions';sec.className='hidden';
  sec.innerHTML='<div class="toolbar"><button class="back" id="commissionBack">←</button><b>Comisiones colaboradores</b></div><div class="commissionFilters"><label>Mes<input id="commissionMonth" type="month"></label><label>Colaborador<select id="commissionPartner"><option value="">Todos</option></select></label><button class="secondary" id="commissionReload">Actualizar</button></div><div id="commissionSummary" class="commissionSummary">—</div><div class="commissionScroll"><table class="commissionTable"><thead><tr><th>Fecha</th><th>Colaborador</th><th>Días</th><th>Grupo</th><th>Alquiler</th><th>%</th><th>Comisión</th><th>Incluir</th><th>Motivo</th><th></th></tr></thead><tbody id="commissionRows"></tbody></table></div>';
  document.querySelector('main.content')?.appendChild(sec);
  $('commissionBack').onclick=()=>{sec.classList.add('hidden');$('home').classList.remove('hidden')};
  $('commissionReload').onclick=loadCommissions;
  $('commissionMonth').onchange=loadCommissions;$('commissionPartner').onchange=loadCommissions;
}
function ensureHomeButton(){
  if($('lrCommissionsBtn'))return;
  const grid=document.querySelector('#home .grid');if(!grid)return;
  const b=document.createElement('button');b.id='lrCommissionsBtn';b.className='card';b.innerHTML='<b>Comisiones</b><span>Colaboradores y liquidación mensual</span>';b.onclick=openCommissions;grid.appendChild(b);
  if(window.LariosAccess?.isEmployee?.())b.classList.add('hidden');
}
async function openCommissions(){
  if(window.LariosAccess?.isEmployee?.())return alert('Solo los administradores pueden consultar comisiones.');
  ensureScreen();await loadCatalog();
  $('home').classList.add('hidden');$('list')?.classList.add('hidden');$('reservation')?.classList.add('hidden');$('commissions').classList.remove('hidden');
  const now=new Date(),m=String(now.getMonth()+1).padStart(2,'0');if(!$('commissionMonth').value)$('commissionMonth').value=now.getFullYear()+'-'+m;
  $('commissionPartner').innerHTML='<option value="">Todos</option>'+collaborators.map(c=>'<option value="'+c.id+'">'+c.name+' ('+Number(c.commission_percent).toFixed(0)+'%)</option>').join('');
  await loadCommissions();
}
async function loadCommissions(){
  const month=$('commissionMonth')?.value;if(!month)return;
  const [y,m]=month.split('-').map(Number),start=month+'-01',end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10),partner=$('commissionPartner')?.value||'';
  let q='collaborator_commissions?select=id,collaborator_id,contract_id,rental_date,rental_days,vehicle_group,rental_base,commission_percent,commission_amount,included,exclusion_reason,manual_override,collaborators(name)&rental_date=gte.'+start+'&rental_date=lt.'+end+'&order=rental_date.asc';
  if(partner)q+='&collaborator_id=eq.'+encodeURIComponent(partner);
  const rows=await rest(q);
  const total=rows.filter(x=>x.included).reduce((s,x)=>s+Number(x.commission_amount||0),0);
  $('commissionSummary').textContent=rows.length+' registros · Total comisiones: '+money(total);
  $('commissionRows').innerHTML=rows.map(x=>'<tr class="'+(x.included?'':'excluded')+'" data-id="'+x.id+'"><td>'+x.rental_date+'</td><td>'+esc(x.collaborators?.name||'')+'</td><td>'+x.rental_days+'</td><td>'+esc(x.vehicle_group||'')+'</td><td><input data-f="base" type="number" step="0.01" value="'+Number(x.rental_base||0).toFixed(2)+'"></td><td><input data-f="pct" type="number" step="0.01" value="'+Number(x.commission_percent||0).toFixed(2)+'"></td><td>'+money(x.commission_amount)+'</td><td><select data-f="included"><option value="1" '+(x.included?'selected':'')+'>Sí</option><option value="0" '+(!x.included?'selected':'')+'>No</option></select></td><td><input data-f="reason" value="'+escAttr(x.exclusion_reason||'')+'" placeholder="Motivo"></td><td><button class="secondary" onclick="LariosCommissions.saveRow(\''+x.id+'\')">Guardar</button></td></tr>').join('')||'<tr><td colspan="10">No hay comisiones en este periodo.</td></tr>';
}
async function saveRow(id){
  const tr=document.querySelector('tr[data-id="'+CSS.escape(id)+'"]');if(!tr)return;
  const base=Number(tr.querySelector('[data-f=base]').value||0),pct=Number(tr.querySelector('[data-f=pct]').value||0),included=tr.querySelector('[data-f=included]').value==='1',reason=tr.querySelector('[data-f=reason]').value;
  await rpc('app_update_collaborator_commission',{p_id:id,p_rental_base:base,p_commission_percent:pct,p_included:included,p_exclusion_reason:reason});
  await loadCommissions();
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escAttr(s){return esc(s)}
function boot(){ensureScreen();ensureHomeButton();loadCatalog().catch(()=>{});setTimeout(()=>{ensureHomeButton();patchReservation()},700)}
window.LariosCommissions={open:openCommissions,load:loadCommissions,saveRow,patchReservation,version:'20260928-v1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
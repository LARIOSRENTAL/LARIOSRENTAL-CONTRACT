(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let vehicles=[],contracts=[],installed=false,editing=null,catalogLoading=false;
let statusFilter='',typeFilter='';
let occupancy={rented:new Set(),unassigned:{bike:0,ebike:0}};

const headers=()=>({apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'});
async function request(path,opt={}){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/'+path,{...opt,headers:{...headers(),...(opt.headers||{})}});
  if(!r.ok)throw new Error(await r.text());
  return r.status===204?null:r.json();
}
async function rpc(name,body={}){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:headers(),body:JSON.stringify(body)});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
const admin=()=>!!window.LariosAccess?.isAdmin?.();
const plate=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const upper=v=>String(v||'').trim().toUpperCase();
const activeContract=c=>!['draft','returned','collected','cancelled'].includes(String(c?.status||'draft').toLowerCase());

function vehicleType(v){
  const cat=upper(v.category),text=upper([v.make,v.model,v.registration].filter(Boolean).join(' '));
  if(cat==='E-BIKE'||/\bE[- ]?BIKE\b|\bEBIKE\b/.test(text))return'ebike';
  if(cat==='BICICLETA'||/\bBICI(?:CLETA)?S?\b|\bBIKES?\b/.test(text))return'bike';
  if(cat==='50CC'||/\b50\s*CC\b/.test(text))return'50cc';
  if(cat==='125CC'||/\b125\s*CC\b/.test(text))return'125cc';
  return'car';
}
function typeLabel(k){return({car:'Coche','50cc':'50cc','125cc':'125cc',bike:'Bicicleta',ebike:'E-bike'}[k]||'Vehículo')}
function contractType(c){
  const g=upper(c?.vehicle_group).replace(/^GRUPO\s+/,'');
  if(g==='BICICLETA')return'bike';
  if(g==='E-BIKE'||g==='EBIKE')return'ebike';
  if(g==='50CC')return'50cc';
  if(g==='125CC')return'125cc';
  return'car';
}
function bikeNumbers(raw,max){
  const out=[];
  for(const n of (String(raw||'').match(/\d+/g)||[]).map(Number))if(n>=1&&n<=max&&!out.includes(n))out.push(n);
  return out;
}
function rebuildOccupancy(){
  const rented=new Set(),unassigned={bike:0,ebike:0};
  for(const c of contracts.filter(activeContract)){
    const kind=contractType(c),raw=String(c.vehicle_plate||''),qty=Math.max(1,Number(c.vehicle_quantity||c.quantity||1)||1);
    if(kind==='bike'){
      const nums=bikeNumbers(raw,22);nums.forEach(n=>rented.add('bike:'+n));
      if(nums.length<qty)unassigned.bike+=qty-nums.length;
    }else if(kind==='ebike'){
      const nums=bikeNumbers(raw,10);nums.forEach(n=>rented.add('ebike:'+n));
      if(nums.length<qty)unassigned.ebike+=qty-nums.length;
    }else if(raw){
      rented.add('reg:'+plate(raw));
    }
  }
  occupancy={rented,unassigned};
}
function stateOf(v){
  if(String(v.status||'').toLowerCase()==='maintenance')return'maintenance';
  const kind=vehicleType(v),r=String(v.registration||'');
  if(kind==='bike')return occupancy.rented.has('bike:'+Number(r))?'rented':'available';
  if(kind==='ebike'){
    const n=Number((r.match(/\d+/)||[])[0]||0);
    return occupancy.rented.has('ebike:'+n)?'rented':'available';
  }
  return occupancy.rented.has('reg:'+plate(r))?'rented':'available';
}

async function load(){
  if(catalogLoading)return vehicles;
  catalogLoading=true;
  try{
    const [fleet,rows]=await Promise.all([
      request('vehicles?select=id,registration,make,model,fuel_type,category,status,notes&registration=not.is.null&status=neq.retired&order=registration'),
      rpc('app_list_contracts',{})
    ]);
    vehicles=(Array.isArray(fleet)?fleet:[]).filter(v=>String(v.registration||'').trim()).sort((a,b)=>String(a.registration).localeCompare(String(b.registration),'es',{numeric:true,sensitivity:'base'}));
    contracts=Array.isArray(rows)?rows:[];
    rebuildOccupancy();
    render();
    patchFuelDefault();
    return vehicles;
  }finally{catalogLoading=false;}
}

function vehicleForm(v={}){
  return `<form id="lrVehicleForm" class="lrVmForm">
    <input type="hidden" id="lrVmId" value="${esc(v.id||'')}">
    <div class="formGrid">
      <label>Matrícula *<input id="lrVmPlate" required autocomplete="off" autocapitalize="characters" value="${esc(v.registration||'')}"></label>
      <label>Marca *<input id="lrVmMake" required value="${esc(v.make||'')}"></label>
      <label>Modelo *<input id="lrVmModel" required value="${esc(v.model||'')}"></label>
      <label>Combustible<input id="lrVmFuel" value="${esc(v.fuel_type||'')}" placeholder="GASOLINA, DIESEL, HÍBRIDO, ELÉCTRICO…"></label>
    </div>
    <div class="lrVmActions">
      <button type="button" class="secondary" onclick="LariosVehicleManager.cancelEdit()">Cancelar</button>
      <button type="submit" class="primary">${v.id?'Guardar vehículo':'Añadir vehículo'}</button>
    </div>
  </form>`;
}

function row(v){
  const state=stateOf(v),kind=vehicleType(v),stateText=state==='rented'?'ALQUILADO':state==='maintenance'?'MANTENIMIENTO':'DISPONIBLE';
  return `<article class="lrVmRow" data-id="${esc(v.id)}"><div class="lrVmMain"><div class="lrVmTopline"><b>${esc(v.registration||'Sin matrícula')}</b><span class="lrVmBadge lrVmType">${esc(typeLabel(kind))}</span><span class="lrVmBadge ${state==='rented'?'lrVmRented':state==='maintenance'?'lrVmMaintenance':'lrVmAvailable'}">${stateText}</span></div><span>${esc([v.make,v.model].filter(Boolean).join(' ')||'Sin modelo')}${v.fuel_type?' · '+esc(v.fuel_type):''}</span></div>${admin()?`<div class="lrVmRowActions"><button onclick="LariosVehicleManager.edit('${v.id}')">Editar</button><button class="danger" onclick="LariosVehicleManager.remove('${v.id}')">Eliminar</button></div>`:''}</article>`;
}
function filterButton(label,key,value,active){return `<button type="button" class="lrVmFilter ${active?'active':''}" onclick="LariosVehicleManager.setFilter('${key}','${value}')">${label}</button>`}
function selectedUnassigned(){
  if(typeFilter==='bike')return occupancy.unassigned.bike;
  if(typeFilter==='ebike')return occupancy.unassigned.ebike;
  if(!typeFilter)return occupancy.unassigned.bike+occupancy.unassigned.ebike;
  return 0;
}
function baseFiltered(){
  const q=($('lrVmSearch')?.value||'').trim().toLowerCase();
  return vehicles.filter(v=>{
    if(typeFilter&&vehicleType(v)!==typeFilter)return false;
    if(q&&![v.registration,v.make,v.model,v.fuel_type,v.category].join(' ').toLowerCase().includes(q))return false;
    return true;
  });
}
function effectiveSummary(base){
  let rented=base.filter(v=>stateOf(v)==='rented').length,maintenance=base.filter(v=>stateOf(v)==='maintenance').length,available=base.filter(v=>stateOf(v)==='available').length;
  let extra=0;
  if(typeFilter==='bike')extra=occupancy.unassigned.bike;
  else if(typeFilter==='ebike')extra=occupancy.unassigned.ebike;
  else if(!typeFilter)extra=occupancy.unassigned.bike+occupancy.unassigned.ebike;
  extra=Math.min(extra,available);
  return{available:Math.max(0,available-extra),rented:rented+extra,maintenance,unassigned:extra,total:base.length};
}
function modelSummary(base){
  const groups=new Map();
  for(const v of base){
    const name=([v.make,v.model].filter(Boolean).join(' ')||typeLabel(vehicleType(v))).replace(/\s+/g,' ').trim();
    if(!groups.has(name))groups.set(name,{name,available:0,rented:0,maintenance:0,type:vehicleType(v)});
    const g=groups.get(name),s=stateOf(v);g[s]=(g[s]||0)+1;
  }
  for(const kind of ['bike','ebike']){
    const extra=kind==='bike'?occupancy.unassigned.bike:occupancy.unassigned.ebike;if(!extra)continue;
    const candidates=[...groups.values()].filter(g=>g.type===kind);if(candidates.length===1){const g=candidates[0],move=Math.min(extra,g.available);g.available-=move;g.rented+=move;g.unassigned=move}
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true})).map(g=>`<div class="lrVmModel"><b>${esc(g.name)}</b><span>${g.available} libres · ${g.rented} alquilados${g.maintenance?' · '+g.maintenance+' mantenimiento':''}${g.unassigned?' · '+g.unassigned+' sin unidad asignada':''}</span></div>`).join('');
}
function applyFilters(){
  const rows=$('lrVmRows');if(!rows)return;
  const base=baseFiltered(),summary=effectiveSummary(base);
  const list=base.filter(v=>!statusFilter||stateOf(v)===statusFilter);
  rows.innerHTML=list.map(row).join('')||'<div class="notice">No hay vehículos con estos filtros.</div>';
  const info=$('lrVmSummary');if(info)info.innerHTML=`<b>${summary.available} disponibles</b><span>${summary.rented} alquilados${summary.maintenance?' · '+summary.maintenance+' mantenimiento':''}</span>${summary.unassigned?`<small>Hay ${summary.unassigned} alquiler${summary.unassigned===1?'':'es'} de bicicleta/e-bike sin matrícula individual asignada. Se descuenta${summary.unassigned===1?'':'n'} del total libre, pero no se inventa qué unidad concreta está fuera.</small>`:''}`;
  const models=$('lrVmModels');if(models)models.innerHTML=modelSummary(base);
  document.querySelectorAll('.lrVmFilter').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll(`[data-lr-filter-status="${statusFilter}"],[data-lr-filter-type="${typeFilter}"]`).forEach(b=>b.classList.add('active'));
}
function setFilter(key,value){
  if(key==='status')statusFilter=statusFilter===value?'':value;
  if(key==='type')typeFilter=typeFilter===value?'':value;
  renderFilterStates();applyFilters();
}
function renderFilterStates(){
  document.querySelectorAll('[data-lr-filter-status]').forEach(b=>b.classList.toggle('active',!!statusFilter&&b.dataset.lrFilterStatus===statusFilter));
  document.querySelectorAll('[data-lr-filter-type]').forEach(b=>b.classList.toggle('active',!!typeFilter&&b.dataset.lrFilterType===typeFilter));
}
function render(){
  const body=$('lrVehicleBody');if(!body)return;
  body.innerHTML=`${admin()?'<button class="primary lrVmAdd" onclick="LariosVehicleManager.newVehicle()">+ Añadir vehículo</button>':'<div class="notice">Consulta de vehículos. Solo los administradores pueden añadir, modificar o eliminar.</div>'}
  <div id="lrVehicleEditor"></div>
  <div class="lrVmFilters"><div><span>Estado</span><button type="button" class="lrVmFilter" data-lr-filter-status="available" onclick="LariosVehicleManager.setFilter('status','available')">Disponibles</button><button type="button" class="lrVmFilter" data-lr-filter-status="rented" onclick="LariosVehicleManager.setFilter('status','rented')">Alquilados</button></div><div><span>Tipo</span><button type="button" class="lrVmFilter" data-lr-filter-type="car" onclick="LariosVehicleManager.setFilter('type','car')">Coches</button><button type="button" class="lrVmFilter" data-lr-filter-type="50cc" onclick="LariosVehicleManager.setFilter('type','50cc')">50cc</button><button type="button" class="lrVmFilter" data-lr-filter-type="125cc" onclick="LariosVehicleManager.setFilter('type','125cc')">125cc</button><button type="button" class="lrVmFilter" data-lr-filter-type="bike" onclick="LariosVehicleManager.setFilter('type','bike')">Bicicletas</button><button type="button" class="lrVmFilter" data-lr-filter-type="ebike" onclick="LariosVehicleManager.setFilter('type','ebike')">E-bike</button></div></div>
  <input id="lrVmSearch" placeholder="Buscar matrícula, marca o modelo" oninput="LariosVehicleManager.filter()">
  <div id="lrVmSummary" class="lrVmSummary"></div><div id="lrVmModels" class="lrVmModels"></div><div id="lrVmRows"></div>`;
  renderFilterStates();applyFilters();
}

function open(){$('lrVehiclePanel')?.classList.remove('hidden');document.body.style.overflow='hidden';load().catch(e=>alert('No se pudieron cargar los vehículos. '+e.message));}
function close(){$('lrVehiclePanel')?.classList.add('hidden');document.body.style.overflow='';}
function newVehicle(){if(!admin())return;editing=null;$('lrVehicleEditor').innerHTML=vehicleForm();bindForm();}
function edit(id){if(!admin())return;editing=vehicles.find(v=>v.id===id);$('lrVehicleEditor').innerHTML=vehicleForm(editing);bindForm();$('lrVehicleEditor').scrollIntoView({behavior:'smooth'});}
function cancelEdit(){editing=null;const e=$('lrVehicleEditor');if(e)e.innerHTML='';}
function bindForm(){$('lrVehicleForm')?.addEventListener('submit',save);}

async function save(e){
  e.preventDefault();if(!admin())return;
  const id=$('lrVmId').value;
  const p={registration:plate($('lrVmPlate').value),make:$('lrVmMake').value.trim().toUpperCase(),model:$('lrVmModel').value.trim().toUpperCase(),fuel_type:$('lrVmFuel').value.trim().toUpperCase()||null};
  if(!p.registration||!p.make||!p.model)return alert('Completa matrícula, marca y modelo.');
  try{
    if(id)await request('vehicles?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...p,updated_at:new Date().toISOString()})});
    else await request('vehicles',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(p)});
    cancelEdit();await load();window.LariosVehicleCore?.refresh?.().catch(()=>{});alert(id?'Vehículo actualizado.':'Vehículo añadido.');
  }catch(err){alert(/duplicate|unique/i.test(err.message)?'Ya existe un vehículo con esa matrícula.':'No se pudo guardar el vehículo. '+err.message);}
}
async function remove(id){
  if(!admin())return;const v=vehicles.find(x=>x.id===id);
  if(!confirm(`¿Eliminar ${v?.registration||'este vehículo'}? Solo será posible si no forma parte del historial de contratos.`))return;
  try{await request('vehicles?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});await load();window.LariosVehicleCore?.refresh?.().catch(()=>{});alert('Vehículo eliminado.');}catch(e){alert('No se puede eliminar porque está vinculado a un contrato o movimiento.');}
}
function filter(){applyFilters()}

function patchFuelDefault(){
  const el=$('fuel_out'),section=$('reservation');if(!el||section?.classList.contains('hidden'))return;
  const id=window.LariosCurrentContractId||'';if(el.dataset.lrFuelDefaultFor===id)return;
  if(id&&!contracts.length)return;
  const c=id?contracts.find(x=>x.id===id):null;if(id&&!c)return;
  el.dataset.lrFuelDefaultFor=id;
  const saved=String(c?.fuel_out||'').trim();if(saved){el.value=saved;return}
  if(c&&c.status!=='draft')return;
  if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value==='0/8')){const o=document.createElement('option');o.value='0/8';o.textContent='0/8';el.insertBefore(o,el.firstChild)}
  el.value='0/8';
}

function install(){
  if(installed)return;installed=true;
  const p=document.createElement('section');p.id='lrVehiclePanel';p.className='lrVehiclePanel hidden';p.innerHTML='<div class="lrVmShell"><header><button onclick="LariosVehicleManager.close()">←</button><div><b>Panel de vehículos</b><span>Disponibilidad en tiempo real según contratos</span></div><button onclick="LariosVehicleManager.reload()">Actualizar</button></header><div id="lrVehicleBody"></div></div>';document.body.appendChild(p);
  document.querySelectorAll("button.card[onclick=\"openScreen('vehicles')\"]").forEach(b=>b.setAttribute('onclick','LariosVehicleManager.open()'));
  const s=document.createElement('style');s.textContent='.lrVehiclePanel{position:fixed;inset:0;z-index:100012;background:#f4f6f8;overflow:auto;padding-top:env(safe-area-inset-top)}.lrVmShell{max-width:980px;min-height:100%;margin:auto;background:white;padding:16px}.lrVmShell>header{display:flex;gap:10px;align-items:center;border-bottom:1px solid #ddd;padding-bottom:12px}.lrVmShell>header div{display:grid;flex:1}.lrVmShell>header span,.lrVmRow span{font-size:12px;color:#6b7280}.lrVmShell button,.lrVmActions button,.lrVmRow button{padding:9px 11px;border:0;border-radius:9px;font-weight:800}.lrVmAdd{margin:14px 0}.lrVmForm{padding:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;margin-bottom:12px}.lrVmActions{display:flex;gap:8px;margin-top:8px}.lrVmFilters{display:grid;gap:10px;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;margin:12px 0}.lrVmFilters>div{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.lrVmFilters>div>span{font-size:11px;font-weight:900;text-transform:uppercase;color:#64748b;min-width:54px}.lrVmFilter{background:#fff;border:1px solid #cbd5e1!important;color:#334155}.lrVmFilter.active{background:#111827!important;color:#fff!important;border-color:#111827!important}.lrVmSummary{display:grid;gap:2px;padding:11px 12px;border-radius:10px;background:#eff6ff;color:#1e3a8a;margin:10px 0}.lrVmSummary span{font-size:12px}.lrVmSummary small{font-size:11px;line-height:1.35;color:#92400e;margin-top:4px}.lrVmModels{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin:10px 0}.lrVmModel{display:grid;padding:8px 10px;border:1px solid #e5e7eb;border-radius:9px;background:#fff}.lrVmModel b{font-size:12px}.lrVmModel span{font-size:11px;color:#64748b}.lrVmRow{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid #eee}.lrVmMain{display:grid;gap:3px;flex:1}.lrVmTopline{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.lrVmBadge{display:inline-block!important;padding:3px 6px;border-radius:999px;font-size:10px!important;font-weight:900}.lrVmType{background:#f1f5f9;color:#475569!important}.lrVmAvailable{background:#dcfce7;color:#166534!important}.lrVmRented{background:#fee2e2;color:#b91c1c!important}.lrVmMaintenance{background:#fef3c7;color:#92400e!important}.lrVmRow .danger{color:#b91c1c;background:#fee2e2}.lrVmRowActions{display:flex;gap:6px}@media(max-width:600px){.lrVmRow{align-items:stretch;flex-direction:column}.lrVmRowActions button{flex:1}.lrVmModels{grid-template-columns:1fr 1fr}.lrVmFilters>div>span{width:100%}}';document.head.appendChild(s);
  const observer=new MutationObserver(()=>patchFuelDefault());observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('larios:access-ready',()=>load().catch(()=>{}));
  setInterval(patchFuelDefault,1200);
  load().catch(()=>{});
}
window.LariosVehicleManager={open,close,reload:load,newVehicle,edit,cancelEdit,remove,filter,setFilter,__test:{plate,vehicleType,stateOf,setVehicles:v=>vehicles=v}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();

(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let vehicles=[],installed=false,editing=null,catalogLoading=false;

const headers=()=>({apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'});
async function request(path,opt={}){
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/'+path,{...opt,headers:{...headers(),...(opt.headers||{})}});
  if(!r.ok)throw new Error(await r.text());
  return r.status===204?null:r.json();
}
const admin=()=>!!window.LariosAccess?.isAdmin?.();
const plate=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

async function load(){
  if(catalogLoading)return vehicles;
  catalogLoading=true;
  try{
    vehicles=await request('vehicles?select=id,registration,make,model,fuel_type&order=registration');
    render();
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
      <label>Combustible *<input id="lrVmFuel" required value="${esc(v.fuel_type||'')}" placeholder="GASOLINA, DIESEL, HÍBRIDO…"></label>
    </div>
    <div class="lrVmActions">
      <button type="button" class="secondary" onclick="LariosVehicleManager.cancelEdit()">Cancelar</button>
      <button type="submit" class="primary">${v.id?'Guardar vehículo':'Añadir vehículo'}</button>
    </div>
  </form>`;
}

function row(v){
  return `<article class="lrVmRow"><div><b>${esc(v.registration||'Sin matrícula')}</b><span>${esc([v.make,v.model].filter(Boolean).join(' ')||'Sin modelo')} · ${esc(v.fuel_type||'Combustible sin indicar')}</span></div>${admin()?`<div><button onclick="LariosVehicleManager.edit('${v.id}')">Editar</button><button class="danger" onclick="LariosVehicleManager.remove('${v.id}')">Eliminar</button></div>`:''}</article>`;
}

function render(){
  const body=$('lrVehicleBody');
  if(!body)return;
  body.innerHTML=`${admin()?'<button class="primary lrVmAdd" onclick="LariosVehicleManager.newVehicle()">+ Añadir vehículo</button>':'<div class="notice">Consulta de vehículos. Solo los administradores pueden añadir, modificar o eliminar.</div>'}<div id="lrVehicleEditor"></div><input id="lrVmSearch" placeholder="Buscar matrícula, marca o modelo" oninput="LariosVehicleManager.filter()"><div id="lrVmRows">${vehicles.map(row).join('')||'<div class="notice">No hay vehículos.</div>'}</div>`;
}

function open(){$('lrVehiclePanel')?.classList.remove('hidden');document.body.style.overflow='hidden';load().catch(e=>alert('No se pudieron cargar los vehículos. '+e.message));}
function close(){$('lrVehiclePanel')?.classList.add('hidden');document.body.style.overflow='';}
function newVehicle(){if(!admin())return;editing=null;$('lrVehicleEditor').innerHTML=vehicleForm();bindForm();}
function edit(id){if(!admin())return;editing=vehicles.find(v=>v.id===id);$('lrVehicleEditor').innerHTML=vehicleForm(editing);bindForm();$('lrVehicleEditor').scrollIntoView({behavior:'smooth'});}
function cancelEdit(){editing=null;const e=$('lrVehicleEditor');if(e)e.innerHTML='';}
function bindForm(){$('lrVehicleForm')?.addEventListener('submit',save);}

async function save(e){
  e.preventDefault();
  if(!admin())return;
  const id=$('lrVmId').value;
  const p={
    registration:plate($('lrVmPlate').value),
    make:$('lrVmMake').value.trim().toUpperCase(),
    model:$('lrVmModel').value.trim().toUpperCase(),
    fuel_type:$('lrVmFuel').value.trim().toUpperCase()
  };
  if(!p.registration||!p.make||!p.model||!p.fuel_type)return alert('Completa matrícula, marca, modelo y combustible.');
  try{
    if(id)await request('vehicles?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...p,updated_at:new Date().toISOString()})});
    else await request('vehicles',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(p)});
    cancelEdit();
    await load();
    window.LariosVehicleCore?.refresh?.().catch(()=>{});
    alert(id?'Vehículo actualizado.':'Vehículo añadido.');
  }catch(err){
    alert(/duplicate|unique/i.test(err.message)?'Ya existe un vehículo con esa matrícula.':'No se pudo guardar el vehículo. '+err.message);
  }
}

async function remove(id){
  if(!admin())return;
  const v=vehicles.find(x=>x.id===id);
  if(!confirm(`¿Eliminar ${v?.registration||'este vehículo'}? Solo será posible si no forma parte del historial de contratos.`))return;
  try{
    await request('vehicles?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    await load();
    window.LariosVehicleCore?.refresh?.().catch(()=>{});
    alert('Vehículo eliminado.');
  }catch(e){alert('No se puede eliminar porque está vinculado a un contrato o movimiento.');}
}

function filter(){
  const q=($('lrVmSearch')?.value||'').toLowerCase();
  document.querySelectorAll('.lrVmRow').forEach((el,i)=>{
    const v=vehicles[i]||{};
    el.classList.toggle('hidden',![v.registration,v.make,v.model,v.fuel_type].join(' ').toLowerCase().includes(q));
  });
}

function install(){
  if(installed)return;
  installed=true;
  const p=document.createElement('section');
  p.id='lrVehiclePanel';
  p.className='lrVehiclePanel hidden';
  p.innerHTML='<div class="lrVmShell"><header><button onclick="LariosVehicleManager.close()">←</button><div><b>Panel de vehículos</b><span>Catálogo independiente por matrícula</span></div><button onclick="LariosVehicleManager.reload()">Actualizar</button></header><div id="lrVehicleBody"></div></div>';
  document.body.appendChild(p);
  document.querySelectorAll("button.card[onclick=\"openScreen('vehicles')\"]").forEach(b=>b.setAttribute('onclick','LariosVehicleManager.open()'));
  const s=document.createElement('style');
  s.textContent='.lrVehiclePanel{position:fixed;inset:0;z-index:100012;background:#f4f6f8;overflow:auto;padding-top:env(safe-area-inset-top)}.lrVmShell{max-width:980px;min-height:100%;margin:auto;background:white;padding:16px}.lrVmShell>header{display:flex;gap:10px;align-items:center;border-bottom:1px solid #ddd;padding-bottom:12px}.lrVmShell>header div{display:grid;flex:1}.lrVmShell>header span,.lrVmRow span{font-size:12px;color:#6b7280}.lrVmShell button,.lrVmActions button,.lrVmRow button{padding:9px 11px;border:0;border-radius:9px;font-weight:800}.lrVmAdd{margin:14px 0}.lrVmForm{padding:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;margin-bottom:12px}.lrVmActions{display:flex;gap:8px;margin-top:8px}.lrVmRow{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid #eee}.lrVmRow>div:first-child{display:grid;flex:1}.lrVmRow .danger{color:#b91c1c;background:#fee2e2}.lrVmRow>div:last-child{display:flex;gap:6px}@media(max-width:600px){.lrVmRow{align-items:stretch;flex-direction:column}.lrVmRow>div:last-child button{flex:1}}';
  document.head.appendChild(s);
  load().catch(()=>{});
}

window.LariosVehicleManager={open,close,reload:load,newVehicle,edit,cancelEdit,remove,filter,__test:{plate,setVehicles:v=>vehicles=v}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();

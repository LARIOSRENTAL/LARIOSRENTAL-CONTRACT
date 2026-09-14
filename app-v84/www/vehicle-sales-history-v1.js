(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let installed=false,contractsCache=null;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
function admin(){return !!window.LariosAccess?.isAdmin?.()}
async function rest(path,opt={}){const r=await fetch(cfg.supabaseUrl+'/rest/v1/'+path,{...opt,headers:{...headers(),...(opt.headers||{})}});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json()}
async function rpc(name,body={}){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:headers(),body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());return r.json()}
function fmtDate(v){if(!v)return'—';const s=String(v).slice(0,10),p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s}
function statusLabel(s){const x=String(s||'').toLowerCase();return({draft:'RESERVA',reserved:'RESERVA',confirmed:'CONTRATO',active:'CONTRATO',generated:'CONTRATO',returned:'DEVUELTO',collected:'DEVUELTO',cancelled:'CANCELADO'}[x]||String(s||'').toUpperCase()||'REGISTRO')}
async function getVehicle(id){const d=await rest('vehicles?select=id,registration,make,model,fuel_type,category,status,sold_at,retired_at&id=eq.'+encodeURIComponent(id)+'&limit=1');return d?.[0]||null}
async function allContracts(){if(Array.isArray(contractsCache))return contractsCache;contractsCache=await rpc('app_list_contracts',{});setTimeout(()=>{contractsCache=null},15000);return contractsCache||[]}
function samePlate(a,b){return String(a||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(b||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
async function historyFor(v){
  const all=await allContracts(),ids=new Set(),plate=String(v.registration||'');
  for(const c of all){if(c.vehicle_id===v.id||samePlate(c.vehicle_plate,plate))ids.add(c.id)}
  try{
    const changes=await rest(`contract_vehicle_changes?select=contract_id,old_vehicle_id,new_vehicle_id,old_vehicle_plate,new_vehicle_plate&or=(old_vehicle_id.eq.${encodeURIComponent(v.id)},new_vehicle_id.eq.${encodeURIComponent(v.id)},old_vehicle_plate.eq.${encodeURIComponent(plate)},new_vehicle_plate.eq.${encodeURIComponent(plate)})`);
    (changes||[]).forEach(x=>ids.add(x.contract_id));
  }catch(_){ }
  return all.filter(c=>ids.has(c.id)).sort((a,b)=>String(b.delivery_date||b.created_at||'').localeCompare(String(a.delivery_date||a.created_at||''))||String(b.delivery_time||'').localeCompare(String(a.delivery_time||'')));
}
function ensureModal(){
  if($('lrVehicleHistoryModal'))return;
  const el=document.createElement('section');el.id='lrVehicleHistoryModal';el.className='lrVhModal hidden';el.innerHTML='<div class="lrVhShell"><header><button type="button" id="lrVhBack">←</button><div><b id="lrVhTitle">Histórico vehículo</b><span id="lrVhSub"></span></div></header><div id="lrVhBody"></div></div>';document.body.appendChild(el);$('lrVhBack').onclick=()=>el.classList.add('hidden');
  const sold=document.createElement('section');sold.id='lrSoldVehiclesModal';sold.className='lrVhModal hidden';sold.innerHTML='<div class="lrVhShell"><header><button type="button" id="lrSoldBack">←</button><div><b>Vehículos vendidos</b><span>Registro histórico de vehículos vendidos</span></div></header><div id="lrSoldBody"></div></div>';document.body.appendChild(sold);$('lrSoldBack').onclick=()=>sold.classList.add('hidden');
}
async function showHistory(id){
  ensureModal();const modal=$('lrVehicleHistoryModal');modal.classList.remove('hidden');$('lrVhBody').innerHTML='<div class="notice">Cargando histórico…</div>';
  try{
    const v=await getVehicle(id);if(!v)throw new Error('Vehículo no encontrado');
    $('lrVhTitle').textContent='Histórico · '+(v.registration||'vehículo');$('lrVhSub').textContent=[v.make,v.model].filter(Boolean).join(' ');
    const rows=await historyFor(v);
    $('lrVhBody').innerHTML=rows.length?`<div class="lrVhCount">${rows.length} reserva${rows.length===1?'':'s'} / contrato${rows.length===1?'':'s'}</div>`+rows.map(c=>`<article class="lrVhItem"><div class="lrVhTop"><b>${esc(c.contract_number||'Sin número')}</b><span>${esc(statusLabel(c.status))}</span></div><div class="lrVhCustomer">${esc(c.customer_name||'Cliente pendiente')}</div><div>${fmtDate(c.pickup_at||c.delivery_date)}${c.return_at||c.return_date?' → '+fmtDate(c.return_at||c.return_date):''}</div>${c.pickup_location||c.return_location?`<small>${esc(c.pickup_location||'')}${c.return_location?' · '+esc(c.return_location):''}</small>`:''}</article>`).join(''):'<div class="notice">Este vehículo no tiene reservas o contratos registrados.</div>';
  }catch(e){$('lrVhBody').innerHTML='<div class="notice">No se pudo cargar el histórico. '+esc(e.message)+'</div>'}
}
async function sell(id){
  if(!admin())return;const v=await getVehicle(id);if(!v)return alert('Vehículo no encontrado.');
  const rented=document.querySelector(`.lrVmRow[data-id="${CSS.escape(id)}"] .lrVmRented`);
  const warning=rented?'\n\nATENCIÓN: ahora mismo figura como ALQUILADO.':'';
  if(!confirm(`¿Marcar ${v.registration||'este vehículo'} como VENDIDO?\n\nDesaparecerá de la flota activa y quedará guardado en Vehículos vendidos.${warning}`))return;
  try{
    const r=await fetch(cfg.supabaseUrl+'/rest/v1/vehicles?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},body:JSON.stringify({status:'sold',sold_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!r.ok)throw new Error(await r.text());
    await window.LariosVehicleManager?.reload?.();await window.LariosVehicleCore?.refresh?.().catch?.(()=>{});alert('Vehículo marcado como vendido y guardado en el registro de vendidos.');
  }catch(e){alert('No se pudo marcar como vendido. '+e.message)}
}
async function showSold(){
  ensureModal();const modal=$('lrSoldVehiclesModal');modal.classList.remove('hidden');$('lrSoldBody').innerHTML='<div class="notice">Cargando vehículos vendidos…</div>';
  try{
    const sold=await rest('vehicles?select=id,registration,make,model,category,sold_at,status&status=eq.sold&order=sold_at.desc.nullslast,updated_at.desc');
    $('lrSoldBody').innerHTML=sold?.length?sold.map(v=>`<article class="lrSoldItem"><div><b>${esc(v.registration||'Sin matrícula')}</b><span>${esc([v.make,v.model].filter(Boolean).join(' ')||'Sin modelo')}</span><small>Vendido: ${fmtDate(v.sold_at)}</small></div><button type="button" onclick="LariosVehicleSalesHistory.history('${v.id}')">Histórico</button></article>`).join(''):'<div class="notice">Todavía no hay vehículos vendidos registrados.</div>';
  }catch(e){$('lrSoldBody').innerHTML='<div class="notice">No se pudo cargar el registro. '+esc(e.message)+'</div>'}
}
function decorateRows(){
  document.querySelectorAll('.lrVmRow[data-id]').forEach(row=>{
    const id=row.dataset.id,actions=row.querySelector('.lrVmRowActions');if(!actions)return;
    if(!actions.querySelector('.lrVmHistoryBtn')){const b=document.createElement('button');b.type='button';b.className='lrVmHistoryBtn';b.textContent='Histórico';b.onclick=()=>showHistory(id);actions.prepend(b)}
    if(admin()&&!actions.querySelector('.lrVmSellBtn')){const b=document.createElement('button');b.type='button';b.className='lrVmSellBtn';b.textContent='Vender';b.onclick=()=>sell(id);const del=[...actions.querySelectorAll('button')].find(x=>/eliminar/i.test(x.textContent||''));if(del)actions.insertBefore(b,del);else actions.appendChild(b)}
  });
}
function decoratePanel(){
  const body=$('lrVehicleBody');if(!body)return;
  if(admin()&&!$('lrVmSoldRegistryBtn')){const b=document.createElement('button');b.id='lrVmSoldRegistryBtn';b.type='button';b.className='secondary lrVmSoldRegistryBtn';b.textContent='Vehículos vendidos';b.onclick=showSold;const add=body.querySelector('.lrVmAdd');if(add)add.insertAdjacentElement('afterend',b);else body.prepend(b)}
  decorateRows();
}
function install(){
  if(installed)return;installed=true;ensureModal();
  const s=document.createElement('style');s.textContent='.lrVmSoldRegistryBtn{margin:14px 0 14px 8px}.lrVmSellBtn{background:#fff7ed!important;color:#9a3412!important;border:1px solid #fdba74!important}.lrVmHistoryBtn{background:#eff6ff!important;color:#1d4ed8!important;border:1px solid #bfdbfe!important}.lrVhModal{position:fixed;inset:0;z-index:100020;background:#f4f6f8;overflow:auto;padding-top:env(safe-area-inset-top)}.lrVhShell{max-width:860px;min-height:100%;margin:auto;background:#fff;padding:16px}.lrVhShell>header{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:12px}.lrVhShell>header>div{display:grid;flex:1}.lrVhShell>header span{font-size:12px;color:#64748b}.lrVhShell button{padding:9px 11px;border:0;border-radius:9px;font-weight:800}.lrVhCount{font-size:12px;color:#64748b;margin-bottom:8px}.lrVhItem,.lrSoldItem{padding:12px;border:1px solid #e5e7eb;border-radius:11px;margin:8px 0;background:#fff}.lrVhTop{display:flex;justify-content:space-between;gap:10px}.lrVhTop span{font-size:11px;font-weight:900;color:#475569}.lrVhCustomer{font-weight:800;margin:4px 0}.lrVhItem small,.lrSoldItem small,.lrSoldItem span{display:block;color:#64748b;font-size:12px}.lrSoldItem{display:flex;gap:12px;align-items:center}.lrSoldItem>div{flex:1}.lrSoldItem button{background:#eff6ff;color:#1d4ed8}.lrVmRowActions{flex-wrap:wrap}';document.head.appendChild(s);
  new MutationObserver(decoratePanel).observe(document.body,{subtree:true,childList:true});decoratePanel();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.LariosVehicleSalesHistory={sell,history:showHistory,sold:showSold,decorate:decoratePanel,version:'20260914-v1'};
})();

(function(){
'use strict';
const $=id=>document.getElementById(id);
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const search=(rows,query,limit=12)=>{
  const key=norm(query);
  if(!key)return [];
  return (Array.isArray(rows)?rows:[])
    .filter(v=>norm(v.registration).includes(key))
    .sort((a,b)=>String(a.registration||'').localeCompare(String(b.registration||''),'es',{numeric:true,sensitivity:'base'}))
    .slice(0,limit);
};
let fleetPromise=null,fleet=[],observer=null;
const bound=new WeakSet();
function styles(){
  if(document.getElementById('lrPlateTypeaheadStyle'))return;
  const style=document.createElement('style');style.id='lrPlateTypeaheadStyle';
  style.textContent='.lrPlateTypeaheadWrap{position:relative;width:100%}.lrPlateSuggestions{position:absolute;left:0;right:0;top:calc(100% - 1px);z-index:10050;max-height:min(300px,45vh);overflow:auto;background:#fff;border:1px solid #94a3b8;border-radius:0 0 10px 10px;box-shadow:0 12px 28px rgba(15,23,42,.18)}.lrPlateSuggestions[hidden]{display:none}.lrPlateSuggestion{display:flex;width:100%;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;border:0;border-bottom:1px solid #e5e7eb;background:#fff;text-align:left;font:inherit;color:#111827;cursor:pointer}.lrPlateSuggestion:last-child{border-bottom:0}.lrPlateSuggestion:hover,.lrPlateSuggestion[aria-selected="true"]{background:#eff6ff}.lrPlateSuggestion strong{font-size:15px;letter-spacing:.02em}.lrPlateSuggestion span{font-size:12px;color:#64748b;text-align:right}.lrPlateEmpty{padding:12px;color:#64748b;font-size:13px}';document.head.appendChild(style);
}
async function loadFleet(){
  if(fleetPromise)return fleetPromise;
  fleetPromise=(async()=>{
    const core=window.LariosVehicleCore;
    let rows=core&&typeof core.load==='function'?await core.load():[];
    if(!rows?.length&&typeof core?.refresh==='function')rows=await core.refresh();
    fleet=Array.isArray(rows)?rows:[];
    return fleet;
  })().catch(error=>{console.warn('No se pudo cargar la flota para el desplegable',error);fleet=[];return fleet;});
  return fleetPromise;
}
function close(wrap){const box=wrap?.querySelector('.lrPlateSuggestions');if(box){box.hidden=true;box.innerHTML=''}const input=wrap?.querySelector('#vehicle_plate');if(input)input.setAttribute('aria-expanded','false');if(wrap)wrap.__lrActive=-1}
function select(wrap,vehicle){
  const input=wrap.querySelector('#vehicle_plate');if(!input)return;
  input.value=String(vehicle.registration||'').toUpperCase();
  input.dataset.lrSelectedRegistration=input.value;
  wrap.__lrChoosing=true;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  wrap.__lrChoosing=false;
  window.LariosVehicleCore?.match?.();
  close(wrap);input.focus();
}
function draw(wrap,query){
  const input=wrap.querySelector('#vehicle_plate'),box=wrap.querySelector('.lrPlateSuggestions');if(!input||!box)return;
  const matches=search(fleet,query);
  box.innerHTML='';wrap.__lrActive=-1;
  if(!String(query||'').trim()||!matches.length){close(wrap);return}
  for(const vehicle of matches){
    const button=document.createElement('button');button.type='button';button.className='lrPlateSuggestion';button.setAttribute('role','option');button.setAttribute('aria-selected','false');
    const reg=document.createElement('strong');reg.textContent=String(vehicle.registration||'').toUpperCase();
    const details=document.createElement('span');details.textContent=[vehicle.make,vehicle.model].filter(Boolean).join(' ');
    button.append(reg,details);
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.dataset.pointerSelected='1';select(wrap,vehicle)});
    button.addEventListener('click',event=>{event.preventDefault();if(button.dataset.pointerSelected==='1'){delete button.dataset.pointerSelected;return}select(wrap,vehicle)});
    box.appendChild(button);
  }
  box.hidden=false;input.setAttribute('aria-expanded','true');
}
function moveActive(wrap,delta){
  const box=wrap.querySelector('.lrPlateSuggestions'),items=Array.from(box?.querySelectorAll('.lrPlateSuggestion')||[]);if(!items.length)return false;
  let next=(Number(wrap.__lrActive??-1)+delta+items.length)%items.length;
  wrap.__lrActive=next;items.forEach((item,index)=>item.setAttribute('aria-selected',index===next?'true':'false'));items[next].scrollIntoView({block:'nearest'});return true;
}
function bind(input){
  if(!input||bound.has(input))return;
  let wrap=input.closest('.lrPlateTypeaheadWrap');
  if(!wrap){wrap=document.createElement('div');wrap.className='lrPlateTypeaheadWrap';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input)}
  let box=wrap.querySelector('.lrPlateSuggestions');
  if(!box){box=document.createElement('div');box.className='lrPlateSuggestions';box.id='lrPlateSuggestions';box.setAttribute('role','listbox');box.hidden=true;wrap.appendChild(box)}
  bound.add(input);
  input.dataset.lrPlateTypeahead='1';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  input.addEventListener('focus',()=>{void loadFleet().then(()=>{if(input.isConnected&&input.value.trim())draw(wrap,input.value)})});
  input.addEventListener('input',()=>{if(wrap.__lrChoosing)return;delete input.dataset.lrSelectedRegistration;void loadFleet().then(()=>draw(wrap,input.value))});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'&&moveActive(wrap,1)){event.preventDefault();return}
    if(event.key==='ArrowUp'&&moveActive(wrap,-1)){event.preventDefault();return}
    if(event.key==='Escape'){close(wrap);return}
    if(event.key==='Enter'&&!box.hidden){const items=Array.from(box.querySelectorAll('.lrPlateSuggestion'));const active=items[wrap.__lrActive]||items[0];if(active){event.preventDefault();active.click()}}
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement))close(wrap)},120));
  void loadFleet();
}
function install(root=document){
  styles();
  const input=root.querySelector?.('#vehicle_plate');if(input&&input.closest('#reservation'))bind(input);
}
function boot(){
  install();
  if(!observer&&document.body){observer=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.type==='attributes'))install()});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}
  const form=$('reservation');if(form)new MutationObserver(()=>install(form)).observe(form,{subtree:true,childList:true});
}
window.LariosVehicleTypeahead={install,load:loadFleet,__test:{norm,search}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

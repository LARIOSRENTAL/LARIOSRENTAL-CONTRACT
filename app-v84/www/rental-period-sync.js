(function(){
const $=id=>document.getElementById(id);
const HOUR=60*60*1000, DAY=24*HOUR, COURTESY=3*HOUR;
let syncing=false;

function parseDateTime(dateValue,timeValue){
  if(!dateValue)return null;
  const dm=String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!dm)return null;
  const tm=String(timeValue||'00:00').match(/^(\d{1,2}):(\d{2})$/);
  if(!tm)return null;
  const d=new Date(Number(dm[1]),Number(dm[2])-1,Number(dm[3]),Number(tm[1]),Number(tm[2]),0,0);
  return Number.isNaN(d.getTime())?null:d;
}
function isoDateLocal(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function hhmm(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function trigger(el){if(!el)return;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function currentDays(){const n=Math.floor(Number($('rental_days')?.value||1));return Number.isFinite(n)&&n>0?n:1}

function daysFromTimes(){
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  const end=parseDateTime($('return_date')?.value,$('return_time')?.value);
  if(!start||!end)return null;
  const elapsed=end.getTime()-start.getTime();
  if(elapsed<0)return 0;
  return Math.max(1,Math.ceil(Math.max(0,elapsed-COURTESY)/DAY));
}

function setReturnFromDays(){
  if(syncing)return;
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  if(!start)return;
  syncing=true;
  try{
    const end=new Date(start.getTime()+currentDays()*DAY);
    const rd=$('return_date'),rt=$('return_time');
    if(rd)rd.value=isoDateLocal(end);
    if(rt)rt.value=hhmm(end);
    trigger(rd);trigger(rt);
  }finally{syncing=false}
  recalc();
}

function setDaysFromReturn(){
  if(syncing)return;
  const n=daysFromTimes();
  if(n===null)return;
  syncing=true;
  try{
    const days=$('rental_days');
    if(days){days.value=String(n);trigger(days)}
  }finally{syncing=false}
  showCourtesyInfo(n);
  recalc();
}

function recalc(){
  if(window.LariosContractUX?.recalculate)try{window.LariosContractUX.recalculate()}catch(_){ }
  const total=$('contract_total');
  if(total)total.dispatchEvent(new Event('input',{bubbles:true}));
}

function showCourtesyInfo(days){
  let box=$('rentalCourtesyInfo');
  const anchor=$('rental_days');
  if(!anchor)return;
  if(!box){
    box=document.createElement('div');box.id='rentalCourtesyInfo';box.className='rental-courtesy-info';
    const parent=anchor.parentElement||anchor;parent.appendChild(box);
  }
  const start=parseDateTime($('pickup_date')?.value,$('pickup_time')?.value);
  if(!start){box.textContent='Cada día de alquiler equivale a 24 h, con 3 h de cortesía.';return}
  const limit=new Date(start.getTime()+Math.max(1,days)*DAY+COURTESY);
  box.textContent=`${Math.max(1,days)} día${days===1?'':'s'} de tarifa · cortesía hasta ${isoDateLocal(limit).split('-').reverse().join('/')} ${hhmm(limit)}.`;
}

function attach(){
  const days=$('rental_days'),pd=$('pickup_date'),pt=$('pickup_time'),rd=$('return_date'),rt=$('return_time');
  if(!days||!pd||!pt||!rd||!rt)return false;
  if(days.dataset.periodSync==='1')return true;
  days.dataset.periodSync='1';
  days.min='1';days.step='1';
  days.addEventListener('change',setReturnFromDays);
  days.addEventListener('input',()=>{if(String(days.value).trim()&&Number(days.value)>0)setReturnFromDays()});
  [pd,pt].forEach(el=>{el.addEventListener('change',setReturnFromDays);el.addEventListener('input',()=>{if(el.value)setReturnFromDays()})});
  [rd,rt].forEach(el=>{el.addEventListener('change',setDaysFromReturn);el.addEventListener('input',()=>{if(el.value)setDaysFromReturn()})});
  showCourtesyInfo(currentDays());
  return true;
}

const style=document.createElement('style');style.textContent='.rental-courtesy-info{margin-top:6px;font-size:12px;color:#166534;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px}';document.head.appendChild(style);
function init(){if(attach())return;const ob=new MutationObserver(()=>{if(attach())ob.disconnect()});ob.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,400));else setTimeout(init,400);
})();

(function(){
const $=id=>document.getElementById(id), val=id=>($(id)?.value||'').trim(), num=id=>Number($(id)?.value||0)||0, chk=id=>!!$(id)?.checked, money=n=>Number(n||0).toFixed(2);
let editingId=null;
function toIso(v){const s=String(v||'').trim();let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/);if(m){const yy=Number(m[3]);return `${yy<=40?2000+yy:1900+yy}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s}
function disp(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'')}
function loadScript(src){return new Promise((ok,no)=>{if([...document.scripts].some(s=>s.src.includes(src)))return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('No se pudo cargar PDF-lib'));document.head.appendChild(s)})}
function bytes(url){const b=atob(String(url).split(',')[1]||''),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function ink(c){if(!c)return false;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>25)return true;return false}
function rendered(id){return Number(String($(id)?.textContent||'0').replace(',','.').replace(/[^0-9.-]/g,''))||0}
const defs=[['additional_driver','Conductor adicional'],['child_seat','Sillita'],['carplay','CarPlay'],['gps','GPS'],['booster','Elevador'],['gloves','Guantes'],['bike_seat','Sillita bici'],['phone_holder','Soporte móvil']];
function extras(){const out=[];for(const [k,label] of defs){if(chk('v2_'+k)){const qty=Math.max(1,num('v2_'+k+'_qty')||1),total=rendered('v2_'+k+'_total');out.push({label,qty,total,unit:qty?total/qty:0})}}for(const n of [1,2]){const label=val('v2_custom'+n+'_name');if(label){const qty=Math.max(1,num('v2_custom'+n+'_qty')||1),unit=num('v2_custom'+n+'_price');out.push({label,qty,unit,total:qty*unit})}}return out}
function pdfRows(){const e=extras();if(!e.length)return[];const driver=e.find(x=>x.label==='Conductor adicional');const rest=e.filter(x=>x!==driver);const rows=[];if(driver)rows.push(driver);if(rest.length===1)rows.push(rest[0]);else if(rest.length>1)rows.push({label:rest.map(x=>x.label).join(' + '),qty:'',unit:'',total:rest.reduce((s,x)=>s+x.total,0)});if(!driver){rows.push(e[0]);if(e.length>1){const more=e.slice(1);rows.push(more.length===1?more[0]:{label:more.map(x=>x.label).join(' + '),qty:'',unit:'',total:more.reduce((s,x)=>s+x.total,0)})}}return rows.slice(0,2)}
function draw(page,font,x,y,w,size,text,center=false){if(text===undefined||text===null||String(text)==='')return;let t=String(text),s=size;while(font.widthOfTextAtSize(t,s)>w&&s>5)s-=.25;const tw=font.widthOfTextAtSize(t,s),xx=center?x+(w-tw)/2:x;page.drawRectangle({x:x-1,y:y-1,width:w+2,height:s+3,color:PDFLib.rgb(1,1,1)});page.drawText(t,{x:xx,y,size:s,font,color:PDFLib.rgb(.03,.03,.03)})}
function white(page,x,y,w,h){page.drawRectangle({x,y,width:w,height:h,color:PDFLib.rgb(1,1,1)})}
function payload(status){const excess=chk('full_insurance')?0:num('franchise');return{id:editingId||'',status,customer_name:val('customer_name'),customer_document:val('customer_document'),customer_email:val('customer_email'),customer_phone:val('customer_phone'),customer_nationality:val('customer_nationality'),customer_address:val('customer_address'),customer_birth_date:toIso(val('customer_birth_date')),driving_license:val('driving_license'),license_issued_by:val('license_issued_by'),license_issue:toIso(val('license_issue')),license_expiry:toIso(val('license_expiry')),additional_name:val('additional_name'),additional_driving_license:val('additional_driving_license'),additional_license_issued_by:val('additional_license_issued_by'),additional_birth_date:toIso(val('additional_birth_date')),additional_license_issue:toIso(val('additional_license_issue')),additional_license_expiry:toIso(val('additional_license_expiry')),vehicle_group:val('vehicle_group'),vehicle_quantity:String(['BICICLETA','E-BIKE'].includes(val('vehicle_group'))?Math.max(1,num('vehicle_quantity')):1),vehicle_plate:val('vehicle_plate'),vehicle_model:val('vehicle_model'),vehicle_color:val('vehicle_color'),fuel_type:val('fuel_type'),fuel_out:val('fuel_out'),pickup_date:val('pickup_date'),pickup_time:val('pickup_time'),pickup_location:val('pickup_location'),return_date:val('return_date'),return_time:val('return_time'),return_location:val('return_location'),rental_days:String(Math.max(1,num('rental_days'))),tariff94:chk('tariff94'),rental_price:money(num('rental_price')),full_insurance:chk('full_insurance'),insurance_total:money(num('insurance_total')),young_driver:chk('young_driver'),young_driver_amount:money(num('young_driver_amount')),discount_percent:money(num('discount_percent')),vat_percent:val('vat_percent')||'21',total:money(num('contract_total')),deposit:money(num('deposit')),payment_method:val('payment_method'),franchise:money(excess),billing_notes:val('billing_notes'),accessories_notes:extras().map(x=>`${x.label} x${x.qty}`).join(', ')}}
async function rpc(p){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_save_contract',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_payload:p})});if(!r.ok)throw new Error(await r.text());return r.json()}
async function makePdf(record){await loadScript('vendor/pdf-lib.min.js');const r=await fetch(new URL('assets/contrato-larios-normalizado.pdf',location.href).href,{cache:'no-store'});if(!r.ok)throw new Error('No se pudo cargar la plantilla oficial');const doc=await PDFLib.PDFDocument.load(await r.arrayBuffer()),page=doc.getPage(0),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),bold=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
const fields=[
[72,708,205,7.5,val('card_number')],[335,708,54,7.5,val('card_expiry')],[72,680,285,8.2,val('customer_name')],[92,660,95,7.7,val('driving_license')],[252,660,60,7.7,disp(val('license_issue'))],[92,638,95,7.7,val('license_issued_by')],[252,638,60,7.7,disp(val('license_expiry'))],[92,616,95,7.7,val('customer_nationality')],[252,616,60,7.7,disp(val('customer_birth_date'))],[92,596,95,7.7,val('customer_document')],[74,562,220,7.2,val('customer_address')],[94,544,92,7.2,val('customer_phone')],[74,522,160,7.2,val('customer_email')],[86,486,110,7.2,val('additional_name')],[252,486,60,7.2,disp(val('additional_birth_date'))],[86,464,95,7.2,val('additional_driving_license')],[252,464,60,7.2,disp(val('additional_license_issue'))],[86,442,95,7.2,val('additional_license_issued_by')],[252,442,60,7.2,disp(val('additional_license_expiry'))],[355,703,90,7.7,val('vehicle_model')],[355,683,72,7.7,val('vehicle_plate')],[481,678,44,7.7,val('vehicle_color')],[347,634,70,7.4,disp(val('pickup_date'))],[347,612,100,7.2,val('pickup_location')],[492,612,34,7.2,val('fuel_out')],[365,590,105,7,val('agency')],[347,548,70,7.4,disp(val('return_date'))],[347,531,100,7.2,val('return_location')],[360,500,105,6.8,extras().map(x=>x.label).join(', ')],[504,461,44,6.1,money(num('rental_price'))],[504,436,44,6.1,money(num('insurance_total'))],[504,414,44,6.1,money(num('young_driver_amount'))],[504,306,44,6.6,money(num('contract_total'))],[350,204,70,7,val('payment_method')],[382,190,70,7.8,money(num('deposit'))],[498,190,50,7.8,money(chk('full_insurance')?0:num('franchise'))]];
for(const f of fields)draw(page,font,...f,false);
// Center values that were previously colliding with printed labels/lines.
draw(page,font,498,634,46,7.4,val('pickup_time'),true);draw(page,font,498,548,46,7.4,val('return_time'),true);draw(page,font,400,461,29,6.1,val('rental_days'),true);draw(page,font,400,436,29,6.1,chk('full_insurance')?'SI':'NO',true);draw(page,font,400,414,29,6.1,chk('young_driver')?'SI':'NO',true);
const rows=pdfRows();const ys=[392,370];rows.forEach((x,i)=>{const y=ys[i];draw(page,font,336,y,61,5.8,x.label,false);draw(page,font,400,y,29,5.9,x.qty,true);draw(page,font,438,y,55,5.9,x.unit===''?'':money(x.unit),true);draw(page,font,504,y,44,5.9,money(x.total),true)});
const dp=Number(val('discount_percent')||0);draw(page,font,400,348,29,5.9,dp?money(dp)+'%':'',true);const vat=Number(val('vat_percent')||21);draw(page,font,400,326,29,5.9,money(vat)+'%',true);
// Remove the template placeholder number before writing the real contract number.
white(page,478,700,78,18);const nr='LR-'+String(record.contract_number||'').padStart(6,'0');draw(page,bold,480,704,74,9.5,nr,true);
if(val('fuel_type')==='GASOLINA')page.drawText('X',{x:323,y:667,size:12,font:bold});if(val('fuel_type')==='DIESEL')page.drawText('X',{x:482,y:667,size:12,font:bold});
const damage=$('damageCanvas');if(damage&&ink(damage)){const img=await doc.embedPng(bytes(damage.toDataURL('image/png')));page.drawImage(img,{x:55,y:279,width:247,height:128})}const sig=$('signatureCanvas');if(sig&&ink(sig)){const img=await doc.embedPng(bytes(sig.toDataURL('image/png')));page.drawImage(img,{x:462,y:41,width:84,height:51})}
const out=await doc.save();return{blob:new Blob([out],{type:'application/pdf'}),name:nr+'.pdf'}}
async function store(record,blob){const path=record.id+'/'+('LR-'+String(record.contract_number||'').padStart(6,'0'))+'.pdf';const r=await fetch(cfg.supabaseUrl+'/storage/v1/object/contracts/'+path,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/pdf','x-upsert':'true'},body:blob});if(!r.ok)throw new Error('No se pudo guardar el PDF');const p=await fetch(cfg.supabaseUrl+'/rest/v1/contracts?id=eq.'+encodeURIComponent(record.id),{method:'PATCH',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({pdf_path:path})});if(!p.ok)throw new Error('PDF guardado pero no enlazado')}
async function send(record){if(!val('customer_email'))return 'sin email';const r=await fetch(cfg.supabaseUrl+'/functions/v1/send-contract',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({contract_id:record.id})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'fallo de envío');return'enviado'}
function goAgenda(){try{window.LariosReservations?.close?.()}catch(_){}$('reservation')?.classList.add('hidden');$('scan')?.classList.add('hidden');$('list')?.classList.add('hidden');$('home')?.classList.remove('hidden');setTimeout(()=>{try{if(typeof changeAgendaDate==='function')changeAgendaDate()}catch(_){}},50)}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
async function finalize(){if(!editingId)return alert('Abre una reserva desde la agenda.');if(window.LariosValidation?.validate&&!LariosValidation.validate())return;const b=[...document.querySelectorAll('button')].find(x=>/Generar contrato/i.test(x.textContent||'')),old=b?.textContent;if(b){b.disabled=true;b.textContent='Generando contrato…'}try{if(chk('full_insurance')&&$('franchise'))$('franchise').value='0.00';window.LariosContractUX?.recalculate?.();if(chk('full_insurance')&&$('franchise'))$('franchise').value='0.00';const draft=await rpc(payload('draft')),pdf=await makePdf(draft);await store(draft,pdf.blob);await rpc(payload('confirmed'));goAgenda();setTimeout(()=>download(pdf.blob,pdf.name),120);let mailError='';try{await send(draft)}catch(e){mailError=e.message}setTimeout(()=>alert(mailError?'Contrato generado y guardado correctamente. El correo queda pendiente: '+mailError:'Contrato generado, guardado y enviado correctamente.'),350)}catch(e){window.LariosValidation?.markBackendError?.(e.message);alert('No se ha podido completar el contrato: '+e.message)}finally{if(b){b.disabled=false;b.textContent=old}}}
function bindInsurance(){const ins=$('full_insurance');if(!ins||ins.dataset.zeroBound)return;ins.dataset.zeroBound='1';ins.addEventListener('change',()=>{if(ins.checked&&$('franchise'))$('franchise').value='0.00';else window.LariosContractUX?.recalculate?.()});if(ins.checked&&$('franchise'))$('franchise').value='0.00'}
function install(){if(!window.LariosReservations)return;const oldEdit=LariosReservations.edit.bind(LariosReservations),oldSave=LariosReservations.save.bind(LariosReservations);LariosReservations.edit=function(id){editingId=id;const r=oldEdit(id);setTimeout(bindInsurance,80);return r};LariosReservations.save=function(status){if(status==='confirmed')return finalize();return oldSave(status)};const ob=new MutationObserver(bindInsurance);ob.observe(document.body,{childList:true,subtree:true})}
setTimeout(install,900);
})();
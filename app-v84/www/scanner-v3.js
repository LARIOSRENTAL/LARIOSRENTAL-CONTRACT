(function(){
'use strict';
if(!window.LariosScanner)return;
const base={...window.LariosScanner};
const $=id=>document.getElementById(id);
let kind='identity',who='main',lastFile=null,lastResult=null,paddle=null;

function setState(t){const e=$('scanState');if(e)e.textContent=t||'';}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function up(v){return clean(v).toUpperCase();}
function isoDate(v){
  const s=up(v).replace(/[,]/g,' ');
  let m=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if(m){let y=+m[3];if(y<100)y+=(y>35?1900:2000);return validDate(+m[1],+m[2],y);}
  const months={ENE:1,JAN:1,FEB:2,MAR:3,ABR:4,APR:4,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DIC:12,DEC:12};
  m=s.match(/\b(\d{1,2})\s+([A-Z]{3,5})\s+(\d{2,4})\b/);
  if(m&&months[m[2]]){let y=+m[3];if(y<100)y+=(y>35?1900:2000);return validDate(+m[1],months[m[2]],y);}
  return'';
}
function validDate(d,m,y){const x=new Date(Date.UTC(y,m-1,d));if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return'';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function safeName(v){const s=clean(v).replace(/\d+/g,' ').replace(/[^A-Za-zÀ-ÿ' -]/g,' ').replace(/\s+/g,' ').trim();if(s.length<3||s.length>70)return'';if(/PERMISO|CONDUC|LICEN[CS]|F[ÜU]HRER|EUROP|ESPAÑA|ARGENTINA|FECHA|DATE|NACIMIENTO|BIRTH|DOMICILIO|ADDRESS|SEGURIDAD|TRANSPORTE/i.test(s))return'';return s;}
function safeLicence(v){const s=up(v).replace(/[^A-Z0-9-]/g,'');return s.length>=5&&s.length<=18&&/\d{4,}/.test(s)?s:'';}
function summaryBox(){
  let box=$('scanDetectedV3');
  if(box)return box;
  box=document.createElement('div');box.id='scanDetectedV3';box.className='notice';box.style.marginTop='14px';
  const applyBtn=[...document.querySelectorAll('#scan button')].find(b=>/Aplicar al contrato/i.test(b.textContent||''));
  if(applyBtn)applyBtn.parentNode.insertBefore(box,applyBtn);else $('scan')?.appendChild(box);
  return box;
}
function renderResult(r){
  const b=summaryBox();
  if(!r){b.innerHTML='<b>Sin datos fiables</b><div class="muted">No se escribirá nada en el contrato. Repite la captura.</div>';return;}
  const rows=[];
  const map=kind==='keys'?[['Matrícula','plate'],['Modelo','model'],['Combustible','fuel'],['Grupo','group']]:[['Nombre','name'],['Documento','document'],['Permiso','license'],['Nacimiento','birth'],['Expedición','issue'],['Caducidad','expiry'],['País','country'],['Domicilio','address']];
  for(const [label,k] of map)if(r[k])rows.push(`<div style="display:grid;grid-template-columns:130px 1fr;gap:8px;padding:5px 0"><b>${label}</b><span>${String(r[k]).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span></div>`);
  b.innerHTML=rows.length?'<b>Datos detectados para revisar</b>'+rows.join(''):'<b>Sin datos fiables</b><div class="muted">No se escribirá nada en el contrato. Repite la captura.</div>';
}
function setField(id,v){if(!v)return false;const e=$(id);if(!e)return false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}

async function loadPaddle(){
  if(paddle)return paddle;
  setState('Cargando motor de lectura documental…');
  const mod=await import('https://esm.sh/@paddleocr/paddleocr-js?bundle');
  paddle=await mod.PaddleOCR.create({lang:'es',ocrVersion:'PP-OCRv5',worker:false,ortOptions:{backend:'wasm',wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',numThreads:2,simd:true}});
  return paddle;
}
function normalizeItems(items){return (items||[]).map(x=>({text:clean(x.text),score:Number(x.score||0),poly:x.poly||[]})).filter(x=>x.text&&x.score>=0.72);}
function allText(items){return items.map(x=>x.text).join('\n');}
function countryFrom(text){const t=up(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/REINO DE ESPANA|PERMISO DE CONDUCCION|\bESPANA\b/.test(t))return'ESPAÑA';if(/FUHRERSCHEIN|OSTERREICH|MODELL DER EUROPAISCHEN UNION/.test(t))return'AUSTRIA';if(/LICENCIA NACIONAL DE CONDUCIR|REPUBLICA ARGENTINA|BUENOS AIRES/.test(t))return'ARGENTINA';return'';}
function nextValue(lines,i){for(let j=i+1;j<Math.min(lines.length,i+3);j++){const s=clean(lines[j].text);if(s&&!/^\d(?:[abc])?\s*[.)]/i.test(s))return s;}return'';}
function numbered(lines,n){const re=new RegExp('^\\s*'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[.)]?\\s*[:;-]?\\s*(.*)$','i');for(let i=0;i<lines.length;i++){const m=lines[i].text.match(re);if(m){const tail=clean(m[1]);return tail||nextValue(lines,i);}}return'';}
function labelled(lines,labels){for(let i=0;i<lines.length;i++){const u=up(lines[i].text);for(const lab of labels){const L=up(lab);const p=u.indexOf(L);if(p>=0){let tail=clean(lines[i].text.slice(p+lab.length).replace(/^\s*[:#º°./-]+\s*/,''));return tail||nextValue(lines,i);}}}return'';}
function parseIdentity(items){
  const text=allText(items), c=countryFrom(text), r={country:c};
  if(c==='ARGENTINA'){
    const sur=safeName(labelled(items,['APELLIDO / LAST NAME','APELLIDO','LAST NAME']));
    const given=safeName(labelled(items,['NOMBRE / FIRST NAME','NOMBRE','FIRST NAME']));
    if(sur&&given)r.name=`${given} ${sur}`;
    r.license=safeLicence(labelled(items,['N° LICENCIA / LICENSE N°','Nº LICENCIA','LICENSE N','LICENCIA']));
    r.birth=isoDate(labelled(items,['FECHA DE NAC. / DATE OF BIRTH','FECHA DE NAC','DATE OF BIRTH']));
    r.issue=isoDate(labelled(items,['OTORGAMIENTO / DATE OF ISSUE','OTORGAMIENTO','DATE OF ISSUE']));
    r.expiry=isoDate(labelled(items,['VENCIMIENTO / EXPIRES','VENCIMIENTO','EXPIRES']));
    const ad=clean(labelled(items,['DOMICILIO / ADDRESS','DOMICILIO','ADDRESS']));if(ad.length>=5&&ad.length<90)r.address=ad;
  }else{
    let sur=safeName(numbered(items,'1')), given=safeName(numbered(items,'2'));
    if(sur&&given)r.name=`${given} ${sur}`;
    r.birth=isoDate(numbered(items,'3'));
    r.issue=isoDate(numbered(items,'4a'));
    r.expiry=isoDate(numbered(items,'4b'));
    r.license=safeLicence(numbered(items,'5'));
  }
  const doc=(up(text).replace(/\s+/g,'').match(/\b(?:[XYZ]\d{7}[A-Z]|\d{8}[A-Z])\b/)||[])[0];if(doc)r.document=doc;
  for(const k of Object.keys(r))if(!r[k])delete r[k];
  return r;
}

async function decodeQR(file){
  const bmp=await createImageBitmap(file);
  if('BarcodeDetector' in window){
    try{const det=new BarcodeDetector({formats:['qr_code']});const codes=await det.detect(bmp);if(codes?.[0]?.rawValue)return codes[0].rawValue;}catch(e){}
  }
  if(!window.jsQR){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;const x=c.getContext('2d');x.drawImage(bmp,0,0);const im=x.getImageData(0,0,c.width,c.height);const q=window.jsQR(im.data,im.width,im.height,{inversionAttempts:'attemptBoth'});return q?.data||'';
}
function registrationFromQR(raw){const s=clean(raw);let m=s.match(/^LRV:([A-Z0-9-]{4,12})$/i);if(m)return up(m[1]);try{const j=JSON.parse(s);if(j&&/vehicle/i.test(j.type||'')&&j.registration)return up(j.registration);}catch(e){}m=s.match(/(?:registration|matricula|plate)=([A-Z0-9-]{4,12})/i);return m?up(m[1]):'';}
async function vehicleFromRegistration(reg){
  const path='vehicles?select=registration,make,model,fuel_type,category,color&id=not.is.null&registration=eq.'+encodeURIComponent(reg)+'&limit=1';
  const rows=await window.api(path);const v=rows?.[0];if(!v)return null;
  return {plate:v.registration,model:clean([v.make,v.model].filter(Boolean).join(' ')),fuel:v.fuel_type||'',group:v.category||'',color:v.color||''};
}

async function recognizeIdentity(file){
  const ocr=await loadPaddle();setState('Leyendo documento con PaddleOCR…');
  const [res]=await ocr.predict(file,{textRecScoreThresh:0.72,textDetBoxThresh:0.55,textDetThresh:0.25,textDetMaxSideLimit:2600});
  const items=normalizeItems(res?.items);if($('scanText'))$('scanText').value=allText(items);
  const parsed=parseIdentity(items);
  if(Object.keys(parsed).length<3)throw new Error('No se han obtenido suficientes campos fiables');
  return parsed;
}
async function recognizeVehicle(file){
  setState('Buscando código QR del vehículo…');const raw=await decodeQR(file);if(!raw)throw new Error('No se ha encontrado ningún QR válido en el llavero');
  const reg=registrationFromQR(raw);if(!reg)throw new Error('El QR no corresponde al formato de vehículo de Larios');
  const v=await vehicleFromRegistration(reg);if(!v)throw new Error('El vehículo '+reg+' no existe en la flota');return v;
}

async function selected(input){const file=input?.files?.[0];if(!file)return;lastFile=file;lastResult=null;const p=$('scanPreview');if(p){p.src=URL.createObjectURL(file);p.classList.remove('hidden');}try{lastResult=kind==='keys'?await recognizeVehicle(file):await recognizeIdentity(file);renderResult(lastResult);setState('Lectura completada. Revisa los datos y pulsa “Aplicar al contrato”.');}catch(e){console.error('scanner-v3',e);lastResult=null;renderResult(null);setState(e.message+'. No se ha modificado ningún dato del contrato.');}}
function open(k,w){kind=k==='keys'?'keys':'identity';who=w==='additional'?'additional':'main';lastFile=null;lastResult=null;base.open(k,w);setTimeout(()=>{const h=$('scanHelp');if(h)h.textContent=kind==='keys'?'Escanea el QR del llavero. La app buscará ese vehículo en la flota y rellenará sus datos exactos; no se utiliza reconocimiento de texto del llavero.':'Haz una foto frontal del documento. La nueva versión usa PaddleOCR en el navegador y solo muestra campos que pasan filtros de confianza. Nada se copia al contrato hasta que tú pulses “Aplicar”.';const b=summaryBox();b.innerHTML='<b>Esperando captura</b><div class="muted">Los datos detectados aparecerán aquí para que los revises.</div>';setState('Escáner V3 preparado.');},0);}
function choose(){const i=$('scanFile');if(i){i.value='';i.click();}else return base.choose();}
function apply(){if(!lastResult){alert('No hay datos fiables para aplicar.');return;}let n=0;if(kind==='keys'){
  n+=setField('vehicle_plate',lastResult.plate)?1:0;n+=setField('vehicle_model',lastResult.model)?1:0;n+=setField('fuel_type',lastResult.fuel)?1:0;n+=setField('vehicle_group',lastResult.group)?1:0;n+=setField('vehicle_color',lastResult.color)?1:0;
}else if(who==='additional'){
  n+=setField('additional_name',lastResult.name)?1:0;n+=setField('additional_driving_license',lastResult.license||lastResult.document)?1:0;n+=setField('additional_birth_date',lastResult.birth)?1:0;n+=setField('additional_license_issue',lastResult.issue)?1:0;n+=setField('additional_license_expiry',lastResult.expiry)?1:0;n+=setField('additional_license_issued_by',lastResult.country)?1:0;
}else{
  n+=setField('customer_name',lastResult.name)?1:0;n+=setField('customer_document',lastResult.document)?1:0;n+=setField('driving_license',lastResult.license)?1:0;n+=setField('customer_birth_date',lastResult.birth)?1:0;n+=setField('license_issue',lastResult.issue)?1:0;n+=setField('license_expiry',lastResult.expiry)?1:0;n+=setField('license_issued_by',lastResult.country)?1:0;n+=setField('customer_address',lastResult.address)?1:0;
}
if(window.LariosContractUX?.recalculate)window.LariosContractUX.recalculate();setState(n+' campos aplicados al contrato.');base.close();}

window.LariosScanner={...base,open,choose,selected,apply};
console.log('Larios Scanner V3: PaddleOCR + QR vehicle lookup');
})();
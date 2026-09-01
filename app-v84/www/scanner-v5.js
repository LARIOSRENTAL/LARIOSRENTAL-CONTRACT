(function(){
'use strict';
const $=id=>document.getElementById(id);
let mode='identity',who='main',lastFile=null,lastResult=null,engine=null;

function setFooter(){const f=document.querySelector('.foot');if(f)f.textContent='Larios Rental · V8.4 · Scanner V6 WEB · LLAVERO OCR';}
function state(msg){const e=$('scanState');if(e)e.textContent=msg||'';}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function upper(v){return clean(v).toUpperCase();}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function emit(id,v){if(!v)return false;const e=$(id);if(!e)return false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}

function scanShell(){
  const s=$('scan');
  if(!s)return null;
  s.innerHTML=`<div class="toolbar"><button class="back" type="button" id="scanBack">←</button><b id="scanTitle">Scanner web</b></div>
  <div class="notice" style="border:2px solid #16a34a"><b id="scanEngine">SCANNER DE PERMISOS ACTIVO</b><div id="scanHelp" class="muted" style="margin-top:6px"></div></div>
  <input id="scanFile" class="hidden" type="file" accept="image/*" capture="environment">
  <button id="scanChoose" type="button" class="primary" style="width:100%;margin-top:12px">Abrir cámara</button>
  <img id="scanPreview" class="scanPreview hidden" alt="Vista previa">
  <p id="scanState" class="muted">Preparado.</p>
  <div id="scanResult" class="notice" style="margin-top:12px"><b>Esperando captura</b></div>
  <details id="scanDebug" style="margin-top:10px"><summary>Diagnóstico de lectura</summary><pre id="scanRaw" style="white-space:pre-wrap;font-size:11px"></pre></details>
  <button id="scanSave" type="button" class="secondary" style="width:100%;margin-top:12px">Guardar foto privada</button>
  <button id="scanApply" type="button" class="primary" style="width:100%;margin-top:12px">Aplicar al contrato</button>`;
  $('scanBack').onclick=close;
  $('scanChoose').onclick=choose;
  $('scanFile').onchange=function(){selected(this)};
  $('scanSave').onclick=upload;
  $('scanApply').onclick=apply;
  return s;
}

function open(kind,target){
  mode=kind==='keys'?'keys':'identity';who=target==='additional'?'additional':'main';lastFile=null;lastResult=null;
  scanShell();
  const s=$('scan'),r=$('reservation');if(s)s.classList.remove('hidden');if(r)r.classList.add('hidden');
  $('scanTitle').textContent=mode==='keys'?'Escanear llavero del vehículo':'Escanear permiso de conducir';
  $('scanEngine').textContent=mode==='keys'?'OCR DE LLAVEROS ACTIVO':'SCANNER WEB DE PERMISOS ACTIVO';
  $('scanHelp').textContent=mode==='keys'?'Haz una foto nítida del llavero. El OCR leerá la matrícula y la contrastará con la flota.':'Haz una foto frontal, cercana, recta y sin reflejos. El scanner web leerá los campos 1, 2, 3, 4a, 4b, 5 y, cuando exista, el 8. Ningún dato pasará al contrato hasta que lo revises y pulses Aplicar.';
  state(mode==='keys'?'OCR de llaveros preparado.':'Scanner web de permisos preparado.');
}
function close(){const s=$('scan'),r=$('reservation');if(s)s.classList.add('hidden');if(r)r.classList.remove('hidden');}
function choose(){const i=$('scanFile');if(i){i.value='';i.click();}}

function validDate(d,m,y){const x=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2100||x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return'';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function dateFrom(v){const s=upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(m){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),Number(m[2]),y);}const mm={ENE:1,JAN:1,FEB:2,MAR:3,ABR:4,APR:4,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DIC:12,DEC:12};m=s.match(/(\d{1,2})\s+([A-Z]{3,5})\s+(\d{2,4})/);if(m&&mm[m[2]]){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),mm[m[2]],y);}return'';}
function goodName(v){let s=clean(v).replace(/\d+/g,' ').replace(/[^A-Za-zÀ-ÿ' -]/g,' ').replace(/\s+/g,' ').trim();if(s.length<2||s.length>60)return'';if(/PERMISO|CONDUC|LICEN|FUHRER|FÜHRER|REINO|ESPANA|ESPAÑA|ARGENTINA|EUROP|FECHA|DATE|BIRTH|DOMICILIO|ADDRESS|SEGURIDAD|TRANSPORTE/i.test(s))return'';return s;}
function goodLicence(v){const s=upper(v).replace(/[^A-Z0-9-]/g,'');return s.length>=5&&s.length<=18&&/\d{4,}/.test(s)?s:'';}
function rawLines(items){return (items||[]).map(x=>({text:clean(x.text),score:Number(x.score||0)})).filter(x=>x.text);}
function trustedLines(items){return rawLines(items).filter(x=>x.score>=0);}
function joined(lines){return lines.map(x=>x.text).join('\n');}
function numberMarker(label){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/a/i,'\\s*a').replace(/b/i,'\\s*b').replace(/c/i,'\\s*c');return new RegExp('(?:^|\\s)'+escaped+'(?=\\s|[.):;-]|$)\\s*[.)]?\\s*[:;-]?\\s*','i');}
function findNumbered(lines,label){
  const marker=numberMarker(label),stops=['1','2','3','4a','4b','4c','5','7','8','9'].filter(x=>x!==label).map(numberMarker);
  for(let i=0;i<lines.length;i++){
    const hit=marker.exec(lines[i].text);if(!hit)continue;
    const parts=[clean(lines[i].text.slice(hit.index+hit[0].length))];
    for(let j=i+1;j<lines.length&&j<=i+2;j++){if(stops.some(re=>re.test(lines[j].text)))break;parts.push(clean(lines[j].text));}
    return clean(parts.filter(Boolean).join(' '));
  }
  return'';
}
function findLabel(lines,labels){for(let i=0;i<lines.length;i++){const line=upper(lines[i].text);for(const lab of labels){const L=upper(lab);const p=line.indexOf(L);if(p>=0){const tail=clean(lines[i].text.slice(p+lab.length).replace(/^\s*[:#º°./-]+\s*/,''));if(tail)return tail;if(lines[i+1])return lines[i+1].text;}}}return'';}
function countryFrom(text){const t=upper(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/REINO DE ESPANA|PERMISO DE CONDUCCION/.test(t))return'ESPAÑA';if(/UK DRIVING LICEN[CS]E|UNITED KINGDOM|ENGLAND|DVLA/.test(t))return'REINO UNIDO';if(/OSTERREICH|AUSTRIA|MODELL DER EUROPAISCHEN UNION/.test(t))return'AUSTRIA';if(/LICENCIA NACIONAL DE CONDUCIR|REPUBLICA ARGENTINA|BUENOS AIRES/.test(t))return'ARGENTINA';return'';}
function spanishLicence(v){const s=upper(v).replace(/[^A-Z0-9]/g,'');if(!/^\d{8}[A-Z0-9]$/.test(s))return goodLicence(v);const letters='TRWAGMYFPDXBNJZSQVHLCKE';return s.slice(0,8)+'-'+letters[Number(s.slice(0,8))%23];}
function parseIdentity(items){
  const lines=trustedLines(items),text=joined(lines),result={};const c=countryFrom(text);if(c)result.country=c;
  if(c==='ARGENTINA'){
    const sur=goodName(findLabel(lines,['APELLIDO / LAST NAME','APELLIDO','LAST NAME']));const given=goodName(findLabel(lines,['NOMBRE / FIRST NAME','NOMBRE','FIRST NAME']));if(sur&&given)result.name=`${given} ${sur}`;
    const lic=goodLicence(findLabel(lines,['N° LICENCIA / LICENSE N°','Nº LICENCIA','LICENSE N','LICENCIA']));if(lic)result.license=lic;
    result.birth=dateFrom(findLabel(lines,['FECHA DE NAC. / DATE OF BIRTH','FECHA DE NAC','DATE OF BIRTH']));result.issue=dateFrom(findLabel(lines,['OTORGAMIENTO / DATE OF ISSUE','OTORGAMIENTO','DATE OF ISSUE']));result.expiry=dateFrom(findLabel(lines,['VENCIMIENTO / EXPIRES','VENCIMIENTO','EXPIRES']));const ad=clean(findLabel(lines,['DOMICILIO / ADDRESS','DOMICILIO','ADDRESS']));if(ad.length>=5&&ad.length<=80)result.address=ad;
  }else{
    const sur=goodName(findNumbered(lines,'1'));const given=goodName(findNumbered(lines,'2')).replace(/^(?:MR|MRS|MS|MISS|DR)\s+/i,'');if(sur&&given)result.name=`${given} ${sur}`;
    result.birth=dateFrom(findNumbered(lines,'3'));result.issue=dateFrom(findNumbered(lines,'4a'));result.expiry=dateFrom(findNumbered(lines,'4b'));const lic=c==='ESPAÑA'?spanishLicence(findNumbered(lines,'5')):goodLicence(findNumbered(lines,'5'));if(lic)result.license=lic;
    const ad=clean(findNumbered(lines,'8'));if(ad.length>=5&&ad.length<=120)result.address=ad;
  }
  const compact=upper(text).replace(/\s+/g,'');const dni=(compact.match(/(?:[XYZ]\d{7}[A-Z]|\d{8}[A-Z])/i)||[])[0];if(dni)result.document=dni;
  for(const k of Object.keys(result))if(!result[k])delete result[k];return result;
}
function coreCount(r){return ['name','license','birth','issue','expiry','country'].filter(k=>r&&r[k]).length;}
function showResult(r){const b=$('scanResult');if(!b)return;if(!r||!Object.keys(r).length){b.innerHTML='<b>Sin datos fiables</b><div class="muted" style="margin-top:5px">No se copiará nada al contrato.</div>';return;}const map=[['Nombre','name'],['Documento','document'],['Permiso','license'],['Nacimiento','birth'],['Expedición','issue'],['Caducidad','expiry'],['País','country'],['Domicilio','address'],['Matrícula','plate'],['Modelo','model'],['Grupo','group'],['Combustible','fuel']];b.innerHTML='<b>Datos detectados para revisar</b>'+map.filter(([l,k])=>r[k]).map(([l,k])=>`<div style="display:grid;grid-template-columns:120px 1fr;gap:8px;padding:5px 0"><strong>${l}</strong><span>${esc(r[k])}</span></div>`).join('');}

function loadScript(src){return new Promise((ok,no)=>{const found=[...document.scripts].find(s=>s.src===src);if(found&&window.Tesseract)return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('No se pudo cargar el motor OCR'));document.head.appendChild(s);});}
async function getEngine(){
  if(engine)return engine;
  state('Cargando OCR de llaveros…');
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  if(!window.Tesseract)throw new Error('El motor OCR no se cargó');
  engine=await window.Tesseract.createWorker('spa+eng',1,{logger:m=>{if(m&&m.status==='recognizing text')state('Leyendo llavero… '+Math.round((m.progress||0)*100)+'%');}});
  return engine;
}
async function compressForWeb(file){
  const bmp=await createImageBitmap(file);let w=bmp.width,h=bmp.height;const maxSide=1800;
  if(Math.max(w,h)>maxSide){const scale=maxSide/Math.max(w,h);w=Math.round(w*scale);h=Math.round(h*scale);}
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,w,h);
  let quality=.84,blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  while(blob&&blob.size>950000&&quality>.44){quality-=.1;blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));}
  if(!blob)throw new Error('No se pudo preparar la fotografía');
  return new File([blob],'permiso.jpg',{type:'image/jpeg'});
}
async function webOCR(file){
  state('Comprimiendo la fotografía para el Scanner V6 WEB…');
  const small=await compressForWeb(file),form=new FormData();form.append('file',small);form.append('apikey','helloworld');form.append('OCREngine','3');form.append('scale','true');form.append('detectOrientation','true');form.append('isOverlayRequired','false');
  state('Leyendo el permiso con Scanner V6 WEB…');
  const response=await fetch('https://api.ocr.space/parse/image',{method:'POST',body:form});const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload)throw new Error('El servicio gratuito de lectura no respondió correctamente');
  if(payload.IsErroredOnProcessing){const detail=payload.ErrorMessage||payload.ErrorDetails||'Error de lectura';throw new Error(Array.isArray(detail)?detail.join(' '):String(detail));}
  const text=(payload.ParsedResults||[]).map(item=>item.ParsedText||'').join('\n').trim();if(!text)throw new Error('El Scanner V6 WEB no detectó texto');return text;
}
async function readIdentity(file){
  const text=await webOCR(file);$('scanRaw').textContent=text;
  const parsed=parseIdentity(text.split(/\r?\n/).map(line=>({text:line,score:1})));
  if(coreCount(parsed)<4)throw new Error('Lectura insuficiente: no se han reconocido al menos cuatro campos principales');
  return parsed;
}

function vehiclePlate(text){const normalized=upper(text).replace(/[·_]/g,' ');const labelled=normalized.match(/(?:MATR[IÍ]CULA|MATRICULA|PLATE|REGISTRATION)\s*[:#.-]*\s*([A-Z0-9 -]{5,12})/i);const candidate=(labelled&&labelled[1]||normalized).match(/\b(?:\d{4}\s*[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-Z]{1,3}\s*[- ]?\s*\d{3,5}\s*[- ]?\s*[A-Z]{0,3})\b/i);return candidate?upper(candidate[0]).replace(/[^A-Z0-9]/g,''):'';}
async function readVehicle(file){
  const ocr=await getEngine();state('Leyendo texto del llavero con OCR…');
  const r=await ocr.recognize(file),text=clean(r&&r.data&&r.data.text);$('scanRaw').textContent=text||'(sin texto)';
  if(!text)throw new Error('El OCR no detectó texto en el llavero');
  const reg=vehiclePlate(text);if(!reg)throw new Error('No se reconoció una matrícula válida en el llavero');
  const rows=await api('vehicles?select=registration,make,model,fuel_type,category,color&registration=ilike.'+encodeURIComponent(reg)+'&limit=1');const v=rows&&rows[0];
  if(!v)throw new Error('La matrícula '+reg+' no existe en la flota');
  return{plate:v.registration,model:clean([v.make,v.model].filter(Boolean).join(' ')),fuel:v.fuel_type||'',group:v.category||'',color:v.color||''};
}

async function selected(input){const file=input&&input.files&&input.files[0];if(!file)return;lastFile=file;lastResult=null;const p=$('scanPreview');if(p){p.src=URL.createObjectURL(file);p.classList.remove('hidden');}showResult(null);$('scanRaw').textContent='';try{lastResult=mode==='keys'?await readVehicle(file):await readIdentity(file);showResult(lastResult);state('Lectura válida. Revisa los datos antes de pulsar Aplicar.');}catch(e){console.error('Scanner V5',e);lastResult=null;showResult(null);state((e&&e.message?e.message:'No se pudo leer')+'. El contrato no se ha modificado.');}}
function apply(){if(!lastResult){alert('No hay una lectura fiable para aplicar.');return;}let n=0;if(mode==='keys'){n+=emit('vehicle_plate',lastResult.plate)?1:0;n+=emit('vehicle_model',lastResult.model)?1:0;n+=emit('fuel_type',lastResult.fuel)?1:0;n+=emit('assigned_vehicle_group',lastResult.group)?1:0;n+=emit('vehicle_color',lastResult.color)?1:0;}else if(who==='additional'){n+=emit('additional_name',lastResult.name)?1:0;n+=emit('additional_driving_license',lastResult.license||lastResult.document)?1:0;n+=emit('additional_birth_date',lastResult.birth)?1:0;n+=emit('additional_license_issue',lastResult.issue)?1:0;n+=emit('additional_license_expiry',lastResult.expiry)?1:0;n+=emit('additional_license_issued_by',lastResult.country)?1:0;}else{n+=emit('customer_name',lastResult.name)?1:0;n+=emit('customer_document',lastResult.document)?1:0;n+=emit('driving_license',lastResult.license)?1:0;n+=emit('customer_birth_date',lastResult.birth)?1:0;n+=emit('license_issue',lastResult.issue)?1:0;n+=emit('license_expiry',lastResult.expiry)?1:0;n+=emit('license_issued_by',lastResult.country)?1:0;n+=emit('customer_address',lastResult.address)?1:0;}if(window.LariosContractUX&&LariosContractUX.recalculate)LariosContractUX.recalculate();state(n+' campos aplicados al contrato.');close();}
async function upload(){if(!lastFile){alert('Primero haz una foto.');return null;}try{const ext=(lastFile.name&&lastFile.name.split('.').pop()||'jpg').toLowerCase();const uid=crypto.randomUUID?crypto.randomUUID():String(Date.now());const path='mobile/'+new Date().toISOString().slice(0,10)+'/'+uid+'.'+ext;const r=await fetch(cfg.supabaseUrl+'/storage/v1/object/documents/'+path,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':lastFile.type||'image/jpeg','x-upsert':'false'},body:lastFile});if(!r.ok)throw new Error(await r.text());state('Foto guardada de forma privada.');return path;}catch(e){alert('No se pudo guardar la imagen: '+e.message);return null;}}

window.LariosScanner={open,close,choose,selected,apply,upload,__testParseIdentityText:text=>parseIdentity(String(text||'').split(/\r?\n/).map(line=>({text:line,score:1})))};
setFooter();
console.log('Scanner V6 WEB gratuito para permisos y OCR local para llaveros loaded');
})();

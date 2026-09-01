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
  $('scanHelp').textContent=mode==='keys'?'Haz una foto nítida del llavero. El OCR leerá únicamente MATRÍCULA, MARCA, MODELO y FUEL/COMBUSTIBLE.':'Haz una foto frontal, cercana, recta y sin reflejos. El scanner web leerá los campos 1, 2, 3, 4a, 4b, 5 y, cuando exista, el 8. Ningún dato pasará al contrato hasta que lo revises y pulses Aplicar.';
  state(mode==='keys'?'OCR de llaveros preparado.':'Scanner web de permisos preparado.');
}
function close(){const s=$('scan'),r=$('reservation');if(s)s.classList.add('hidden');if(r)r.classList.remove('hidden');}
function choose(){const i=$('scanFile');if(i){i.value='';i.click();}}

function validDate(d,m,y){const x=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2100||x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return'';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function dateFrom(v){const s=upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(m){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),Number(m[2]),y);}const mm={ENE:1,JAN:1,FEB:2,MAR:3,ABR:4,APR:4,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DIC:12,DEC:12};m=s.match(/(\d{1,2})\s+([A-Z]{3,5})\s+(\d{2,4})/);if(m&&mm[m[2]]){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),mm[m[2]],y);}return'';}
function goodName(v){let s=clean(v).replace(/\d+/g,' ').replace(/[^A-Za-zÀ-ÿ' -]/g,' ').replace(/\s+/g,' ').trim();if(s.length<2||s.length>60)return'';if(/PERMISO|CONDUC|LICEN|FUHRER|FÜHRER|REINO|ESPANA|ESPAÑA|ARGENTINA|EUROP|FECHA|DATE|BIRTH|DOMICILIO|ADDRESS|SEGURIDAD|TRANSPORTE/i.test(s))return'';return s;}
function goodLicence(v){const raw=upper(v).replace(/[^A-Z0-9.\/-]/g,'');const compact=raw.replace(/[^A-Z0-9]/g,'');return compact.length>=5&&compact.length<=20&&/\d{4,}/.test(compact)?raw:'';}
function rawLines(items){return (items||[]).map(x=>({text:clean(x.text),score:Number(x.score||0)})).filter(x=>x.text);}
function trustedLines(items){return rawLines(items).filter(x=>x.score>=0);}
function joined(lines){return lines.map(x=>x.text).join('\n');}
function numberMarker(label,anchored=true){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/a/i,'\\s*a').replace(/b/i,'\\s*b').replace(/c/i,'\\s*c');return new RegExp((anchored?'^\\s*':'(?:^|\\s)')+escaped+'(?=\\s|[.):;-]|$)\\s*[.)]?\\s*[:;-]?\\s*','i');}
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
function findInlineNumbered(lines,label){const marker=numberMarker(label,false);for(const line of lines){const hit=marker.exec(line.text);if(hit)return clean(line.text.slice(hit.index+hit[0].length));}return'';}
function findLabel(lines,labels){for(let i=0;i<lines.length;i++){const line=upper(lines[i].text);for(const lab of labels){const L=upper(lab);const p=line.indexOf(L);if(p>=0){const tail=clean(lines[i].text.slice(p+lab.length).replace(/^\s*[:#º°./-]+\s*/,''));if(tail)return tail;if(lines[i+1])return lines[i+1].text;}}}return'';}
function licenceAfterLabel(lines){for(let i=0;i<lines.length;i++){if(!/LICEN[CS](?:IA|E)/i.test(lines[i].text))continue;for(let j=i;j<lines.length&&j<=i+3;j++){const candidates=String(lines[j].text||'').match(/[A-Z0-9][A-Z0-9.\/-]{4,24}/gi)||[];for(const candidate of candidates){if(/LICEN[CS]|NACIONAL|CONDUCIR/i.test(candidate))continue;const value=goodLicence(candidate);if(value)return value;}}}return'';}
function countryFrom(text){
  const normalize=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const all=normalize(text),rawLines=String(text||'').replace(/\r/g,'').split('\n').map(normalize).filter(Boolean);const firstField=rawLines.findIndex(line=>/^1\s*[.)]/.test(line));const header=(firstField>=0?rawLines.slice(0,firstField):rawLines.slice(0,20));
  const codes={A:'AUSTRIA',B:'BÉLGICA',BG:'BULGARIA',CH:'SUIZA',CY:'CHIPRE',CZ:'REPÚBLICA CHECA',D:'ALEMANIA',DK:'DINAMARCA',E:'ESPAÑA',EST:'ESTONIA',F:'FRANCIA',FIN:'FINLANDIA',GR:'GRECIA',H:'HUNGRÍA',HR:'CROACIA',I:'ITALIA',IRL:'IRLANDA',L:'LUXEMBURGO',LT:'LITUANIA',LV:'LETONIA',M:'MALTA',N:'NORUEGA',NL:'PAÍSES BAJOS',P:'PORTUGAL',PL:'POLONIA',RO:'RUMANÍA',S:'SUECIA',SK:'ESLOVAQUIA',SLO:'ESLOVENIA',UK:'REINO UNIDO'};
  for(const line of header){const code=line.replace(/[^A-Z]/g,'');if(codes[code]&&line.length<=5)return codes[code];}
  if(/UK DRIVING LICEN[CS]E|UNITED KINGDOM|\bDVLA\b/.test(all))return'REINO UNIDO';
  if(/REINO DE ESPANA/.test(all))return'ESPAÑA';
  if(/OSTERREICH|\bAUSTRIA\b|\bM[OÖ]DLING\b|\bBH MODLING\b/.test(all))return'AUSTRIA';
  if(/BUNDESREPUBLIK DEUTSCHLAND/.test(all))return'ALEMANIA';
  if(/REPUBLIQUE FRANCAISE/.test(all))return'FRANCIA';
  if(/REPUBBLICA ITALIANA/.test(all))return'ITALIA';
  if(/LICENCIA NACIONAL DE CONDUCIR|REPUBLICA ARGENTINA|BUENOS AIRES/.test(all))return'ARGENTINA';
  return'';
}
function parseIdentity(items){
  const lines=trustedLines(items),text=joined(lines),result={};const c=countryFrom(text);if(c)result.country=c;
  if(c==='ARGENTINA'){
    const sur=goodName(findLabel(lines,['APELLIDO / LAST NAME','APELLIDO','LAST NAME']));const given=goodName(findLabel(lines,['NOMBRE / FIRST NAME','NOMBRE','FIRST NAME']));if(sur&&given)result.name=`${given} ${sur}`;
    const lic=licenceAfterLabel(lines)||goodLicence(findLabel(lines,['N° LICENCIA / LICENSE N°','Nº LICENCIA','LICENSE N','LICENCIA']));if(lic)result.license=lic;
    result.birth=dateFrom(findLabel(lines,['FECHA DE NAC. / DATE OF BIRTH','FECHA DE NAC','DATE OF BIRTH']));result.issue=dateFrom(findLabel(lines,['OTORGAMIENTO / DATE OF ISSUE','OTORGAMIENTO','DATE OF ISSUE']));result.expiry=dateFrom(findLabel(lines,['VENCIMIENTO / EXPIRES','VENCIMIENTO','EXPIRES']));const ad=clean(findLabel(lines,['DOMICILIO / ADDRESS','DOMICILIO','ADDRESS']));if(ad.length>=5&&ad.length<=80)result.address=ad;
  }else{
    const sur=goodName(findNumbered(lines,'1'));const given=goodName(findNumbered(lines,'2')).replace(/^(?:MR|MRS|MS|MISS|DR)\s+/i,'');if(sur&&given)result.name=`${given} ${sur}`;
    result.birth=dateFrom(findNumbered(lines,'3'));result.issue=dateFrom(findNumbered(lines,'4a'));result.expiry=dateFrom(findNumbered(lines,'4b')||findInlineNumbered(lines,'4b'));const lic=goodLicence(findNumbered(lines,'5'));if(lic)result.license=lic;
    const ad=clean(findNumbered(lines,'8'));if(ad.length>=5&&ad.length<=120)result.address=ad;
  }
  for(const k of Object.keys(result))if(!result[k])delete result[k];return result;
}
function coreCount(r){return ['name','license','birth','issue','expiry','country'].filter(k=>r&&r[k]).length;}
function showResult(r){const b=$('scanResult');if(!b)return;if(!r||!Object.keys(r).length){b.innerHTML='<b>Sin datos fiables</b><div class="muted" style="margin-top:5px">No se copiará nada al contrato.</div>';return;}const map=[['Nombre','name'],['Documento','document'],['Permiso','license'],['Nacimiento','birth'],['Expedición','issue'],['Caducidad','expiry'],['País','country'],['Domicilio','address'],['Matrícula','plate'],['Marca','make'],['Modelo','model'],['Grupo asignado','group'],['Combustible','fuel']];b.innerHTML='<b>Datos detectados para revisar</b>'+map.filter(([l,k])=>r[k]).map(([l,k])=>`<div style="display:grid;grid-template-columns:120px 1fr;gap:8px;padding:5px 0"><strong>${l}</strong><span>${esc(r[k])}</span></div>`).join('');}

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
  if(!parsed.name||!parsed.license||coreCount(parsed)<4)throw new Error('Lectura insuficiente: deben reconocerse nombre, número de permiso y al menos dos campos principales más');
  return parsed;
}

function vehicleValues(text,labels){const values=[];const ls=String(text||'').replace(/\r/g,'').split('\n');for(const line of ls){for(const label of labels){const hit=line.match(new RegExp('(?:^|[^A-Z0-9])'+label+'\\s*[:;=._-]*\\s*(.+)$','i'));if(hit&&hit[1]){const value=clean(hit[1]).split(/\s+[|:;)\\\\]\s*/)[0].trim();if(value)values.push(value);}}}return values;}
function vehicleValue(text,labels){return vehicleValues(text,labels)[0]||'';}
function normalizePlate(v){const s=upper(v).replace(/[^A-Z0-9]/g,'');let m=s.match(/(\d{4})([BCDFGHJKLMNPRSTVWXYZ]{3})/);if(m)return m[1]+m[2];m=s.match(/([A-Z]{1,3})(\d{3,5})([A-Z]{0,3})/);return m?(m[1]+m[2]+m[3]):'';}
function normalizeFuel(v){const s=upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/DIESEL|GASOIL/.test(s))return'DIESEL';if(/GASOLINA|UNLEADED|PETROL|\b95\b|\b98\b/.test(s))return'GASOLINA';if(/ELECTR|\bEV\b/.test(s))return'ELECTRICO';if(/HIBRID|HYBRID/.test(s))return'HIBRIDO';return'';}
function shortestClean(values){return values.map(v=>upper(v).replace(/[^A-Z0-9ÁÉÍÓÚÜÑ .\/-]/g,'').replace(/[.]+$/,'').trim()).filter(Boolean).sort((a,b)=>a.length-b.length)[0]||'';}
function parseVehicleText(text){const plates=vehicleValues(text,['MATR[IÍ]CULA','PLATE','REGISTRATION']).map(normalizePlate).filter(Boolean);const make=shortestClean(vehicleValues(text,['MARCA','MAKE','BRAND']));const model=shortestClean(vehicleValues(text,['MODELO','MODEL']));const fuels=vehicleValues(text,['FUEL','COMBUSTIBLE','CARBURANTE']).map(normalizeFuel).filter(Boolean);const result={};if(plates[0])result.plate=plates[0];if(make)result.make=make;if(model)result.model=model;if(fuels[0])result.fuel=fuels[0];return result;}
function rawPlateCandidates(text){return vehicleValues(text,['MATR[IÍ]CULA','PLATE','REGISTRATION']).map(v=>upper(v).replace(/[^A-Z0-9]/g,'')).filter(v=>v.length>=6&&v.length<=10);}
function editDistance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=saved;}}return row[b.length];}
function bestFleetVehicle(rows,text,result){const candidates=[result.plate,...rawPlateCandidates(text)].filter(Boolean);let best=null,bestDistance=99,ties=0;for(const vehicle of rows||[]){const registered=upper(vehicle.registration).replace(/[^A-Z0-9]/g,'');if(!registered)continue;const distance=Math.min(...candidates.map(candidate=>editDistance(candidate,registered)));if(distance<bestDistance){best=vehicle;bestDistance=distance;ties=1;}else if(distance===bestDistance){ties++;}}return bestDistance<=1&&ties===1?best:null;}
async function vehicleCanvas(file){const bmp=await createImageBitmap(file);const sx=Math.round(bmp.width*.08),sy=Math.round(bmp.height*.16),sw=Math.round(bmp.width*.84),sh=Math.round(bmp.height*.68);const scale=Math.min(4,3000/Math.max(sw,sh));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;for(let i=0;i<data.length;i+=4){const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];const value=Math.max(0,Math.min(255,(gray-128)*1.25+128));data[i]=data[i+1]=data[i+2]=value;}ctx.putImageData(image,0,0);return canvas;}
async function readVehicle(file){
  const ocr=await getEngine(),image=await vehicleCanvas(file),reads=[];for(const pageMode of ['6','11']){state('Leyendo llavero… pasada '+(reads.length+1)+' de 2');await ocr.setParameters({tessedit_pageseg_mode:pageMode,preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await ocr.recognize(image);const value=String(r&&r.data&&r.data.text||'').trim();if(value)reads.push(value);}
  const text=reads.join('\n--- SEGUNDA LECTURA ---\n');$('scanRaw').textContent=text||'(sin texto)';if(!text)throw new Error('El OCR no detectó texto en el llavero');
  const result=parseVehicleText(text);
  try{const rows=await api('vehicles?select=registration,make,model,fuel_type,category,color&limit=500');const v=bestFleetVehicle(rows,text,result);if(v){result.plate=v.registration||result.plate;result.make=v.make||result.make;result.model=v.model||result.model;result.fuel=v.fuel_type||result.fuel;result.group=v.category||'';result.color=v.color||'';}}catch(e){console.warn('No se pudo contrastar el llavero con la flota',e);}
  if(!result.plate||!result.make||!result.model||!result.fuel)throw new Error('No se reconocieron las cuatro etiquetas MATRÍCULA, MARCA, MODELO y FUEL');
  return result;
}

async function selected(input){const file=input&&input.files&&input.files[0];if(!file)return;lastFile=file;lastResult=null;const p=$('scanPreview');if(p){p.src=URL.createObjectURL(file);p.classList.remove('hidden');}showResult(null);$('scanRaw').textContent='';try{lastResult=mode==='keys'?await readVehicle(file):await readIdentity(file);showResult(lastResult);state('Lectura válida. Revisa los datos antes de pulsar Aplicar.');}catch(e){console.error('Scanner V5',e);lastResult=null;showResult(null);state((e&&e.message?e.message:'No se pudo leer')+'. El contrato no se ha modificado.');}}
function apply(){if(!lastResult){alert('No hay una lectura fiable para aplicar.');return;}let n=0;if(mode==='keys'){n+=emit('vehicle_plate',lastResult.plate)?1:0;n+=emit('vehicle_model',clean([lastResult.make,lastResult.model].filter(Boolean).join(' ')))?1:0;n+=emit('fuel_type',lastResult.fuel)?1:0;n+=emit('assigned_vehicle_group',lastResult.group)?1:0;n+=emit('vehicle_color',lastResult.color)?1:0;}else if(who==='additional'){n+=emit('additional_name',lastResult.name)?1:0;n+=emit('additional_driving_license',lastResult.license||lastResult.document)?1:0;n+=emit('additional_birth_date',lastResult.birth)?1:0;n+=emit('additional_license_issue',lastResult.issue)?1:0;n+=emit('additional_license_expiry',lastResult.expiry)?1:0;n+=emit('additional_license_issued_by',lastResult.country)?1:0}else{n+=emit('customer_name',lastResult.name)?1:0;const documentValue=lastResult.document||(!$('customer_document')?.value?lastResult.license:'');n+=emit('customer_document',documentValue)?1:0;n+=emit('driving_license',lastResult.license)?1:0;n+=emit('customer_birth_date',lastResult.birth)?1:0;n+=emit('license_issue',lastResult.issue)?1:0;n+=emit('license_expiry',lastResult.expiry)?1:0;n+=emit('license_issued_by',lastResult.country)?1:0;n+=emit('customer_address',lastResult.address)?1:0}if(window.LariosContractUX&&LariosContractUX.recalculate)LariosContractUX.recalculate();state(n+' campos aplicados al contrato.');close();}
async function upload(){if(!lastFile){alert('Primero haz una foto.');return null;}try{const ext=(lastFile.name&&lastFile.name.split('.').pop()||'jpg').toLowerCase();const uid=crypto.randomUUID?crypto.randomUUID():String(Date.now());const path='mobile/'+new Date().toISOString().slice(0,10)+'/'+uid+'.'+ext;const r=await fetch(cfg.supabaseUrl+'/storage/v1/object/documents/'+path,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':lastFile.type||'image/jpeg','x-upsert':'false'},body:lastFile});if(!r.ok)throw new Error(await r.text());state('Foto guardada de forma privada.');return path;}catch(e){alert('No se pudo guardar la imagen: '+e.message);return null;}}

window.LariosScanner={open,close,choose,selected,apply,upload,__testParseIdentityText:text=>parseIdentity(String(text||'').split(/\r?\n/).map(line=>({text:line,score:1}))),__testParseVehicleText:parseVehicleText,__testBestFleetVehicle:bestFleetVehicle};
setFooter();
console.log('Scanner V6 WEB gratuito para permisos y OCR local para llaveros loaded');
})();

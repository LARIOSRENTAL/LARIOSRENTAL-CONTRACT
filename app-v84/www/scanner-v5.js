(function(){
'use strict';
const $=id=>document.getElementById(id);
let mode='identity',who='main',lastFile=null,lastResult=null,engines={};
let scanRun=0, previewUrl=null, lastWebRead=null, webReadQueue=Promise.resolve(), engineScript;
function native(){return window.Capacitor?.isNativePlatform?.()===true}
function setFooter(){const f=document.querySelector('.foot');if(f)f.textContent='Larios Rental · V8.4 · '+(native()?'ESCÁNER NATIVO ML KIT':'Scanner V6 WEB · LLAVERO OCR');}
function state(msg){const e=$('scanState');if(e)e.textContent=msg||'';}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function upper(v){return clean(v).toUpperCase();}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function emit(id,v){if(!v)return false;const e=$(id);if(!e)return false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}
function scanShell(){const s=$('scan');if(!s)return null;s.innerHTML=`<div class="toolbar"><button class="back" type="button" id="scanBack">←</button><b id="scanTitle">Scanner web</b></div><div class="notice" style="border:2px solid #16a34a"><b id="scanEngine">SCANNER DE PERMISOS ACTIVO</b><div id="scanHelp" class="muted" style="margin-top:6px"></div></div><input id="scanFile" class="hidden" type="file" accept="image/*" capture="environment"><button id="scanChoose" type="button" class="primary" style="width:100%;margin-top:12px">Abrir cámara</button><img id="scanPreview" class="scanPreview hidden" alt="Vista previa"><p id="scanState" class="muted">Preparado.</p><div id="scanResult" class="notice" style="margin-top:12px"><b>Esperando captura</b></div><details id="scanDebug" style="margin-top:10px"><summary>Diagnóstico de lectura</summary><pre id="scanRaw" style="white-space:pre-wrap;font-size:11px"></pre></details><button id="scanSave" type="button" class="secondary" style="width:100%;margin-top:12px">Guardar foto privada</button><button id="scanApply" type="button" class="primary" style="width:100%;margin-top:12px">Aplicar al contrato</button>`;$('scanBack').onclick=close;$('scanChoose').onclick=choose;$('scanFile').onchange=function(){selected(this)};$('scanSave').onclick=upload;$('scanApply').onclick=apply;$('scanApply').disabled=true;return s;}
function open(kind,target){mode=kind==='keys'?'keys':'identity';who=target==='additional'?'additional':'main';resetScan();scanShell();const s=$('scan'),r=$('reservation');if(s)s.classList.remove('hidden');if(r)r.classList.add('hidden');$('scanTitle').textContent=mode==='keys'?'Escanear llavero del vehículo':'Escanear permiso de conducir';$('scanEngine').textContent=mode==='keys'?'OCR DE LLAVEROS ACTIVO':'SCANNER WEB DE PERMISOS ACTIVO';$('scanHelp').textContent=mode==='keys'?'Haz una foto nítida del llavero. El OCR leerá MATRÍCULA, MARCA, MODELO y FUEL/COMBUSTIBLE y contrastará la matrícula con la flota.':'Haz una foto frontal, cercana, recta y sin reflejos. Revisa el nombre, número del permiso, fechas y domicilio cuando figure. Pulsa Aplicar para copiar los datos detectados al contrato.';if(native()){$('scanEngine').textContent='ESCÁNER NATIVO ACTIVO';$('scanHelp').textContent='Lectura local en la tablet. Fotografía el documento sin reflejos y revisa los datos antes de aplicar.'}state(native()?'Escáner nativo preparado.':(mode==='keys'?'OCR de llaveros preparado.':'Scanner web de permisos preparado.'));}
function resetScan(){
 scanRun++;
 if(previewUrl)URL.revokeObjectURL?.(previewUrl);
 previewUrl=null;lastFile=null;lastResult=null;lastWebRead=null;
}
function close(){resetScan();const s=$('scan'),r=$('reservation');if(s)s.classList.add('hidden');if(r)r.classList.remove('hidden');}
async function choose(){if(native()){try{if(!window.LariosNativeScanner)throw Error('La lectura nativa no está disponible en esta APK.');state('Abriendo cámara nativa…');const shot=await window.LariosNativeScanner.capture();const response=await fetch(shot.webPath);if(!response.ok)throw Error('No se pudo abrir la fotografía local.');const file=new File([await response.blob()],'documento.jpg',{type:'image/jpeg'});await selected({files:[file]},shot.text)}catch(e){lastResult=null;showResult(null);state((e?.message||'Error de cámara')+'. El contrato no se ha modificado.')}return}const i=$('scanFile');if(i){i.value='';i.click();}}
function validDate(d,m,y){const x=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2100||x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return'';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function dateFrom(v){const s=upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');const iso=s.match(/\b(\d{4})-([01]\d)-([0-3]\d)\b/);if(iso)return validDate(Number(iso[3]),Number(iso[2]),Number(iso[1]));let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(m){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),Number(m[2]),y);}const mm={ENE:1,JAN:1,FEB:2,MAR:3,ABR:4,APR:4,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DIC:12,DEC:12};m=s.match(/(\d{1,2})\s+([A-Z]{3,5})\s+(\d{2,4})/);if(m&&mm[m[2]]){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),mm[m[2]],y);}return'';}

function localISODate(date=new Date()){const x=new Date(date.getTime()-date.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function minimumAdultBirthDate(){const d=new Date();d.setFullYear(d.getFullYear()-18);return localISODate(d)}
function licenceDateCandidates(text){const out=new Set();for(const m of String(text||'').matchAll(/\b\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{2}|\d{4})\b/g)){const d=dateFrom(m[0]);if(d)out.add(d)}return [...out].sort()}
function goodName(v){let s=clean(v).replace(/\d+/g,' ').replace(/[^\p{L}' -]/gu,' ').replace(/\s+/g,' ').trim();if(s.length<2||s.length>60)return'';let words=s.split(/\s+/).filter(Boolean);if(words.length>4||words.some(w=>w.length>24)||!words.some(w=>w.length>=3)||words.every(w=>w===w.toLowerCase()))return'';if(/PERMISO|CONDUC|LICEN|FUHRER|FÜHRER|REINO|ESPANA|ESPAÑA|ARGENTINA|EUROP|FECHA|DATE|BIRTH|DOMICILIO|ADDRESS|SEGURIDAD|TRANSPORTE|RIJBEWIJS|BELGI|BELGIQUE|DRIVING|HEERLEN|GENK|MODEL|UNION|SUBJECT|CATEGOR|TITULAR|SIGNATURE|LICENCE|PERMIS|DOZVOLA|HRVATSKA/i.test(s))return'';const particles=/^(?:de|del|la|las|los|van|der|den|von|di|da|do|dos|ten|ter|te|le|du|st)$/i;while(words.length>1&&words[words.length-1]===words[words.length-1].toLowerCase()&&!particles.test(words[words.length-1]))words.pop();s=words.join(' ');return s.length>=2?s:'';}
function goodLicence(v){const raw=upper(v).replace(/[^A-Z0-9.\/-]/g,'');const compact=raw.replace(/[^A-Z0-9]/g,'');return compact.length>=5&&compact.length<=20&&/\d{4,}/.test(compact)?raw:'';}
function rawLines(items){return(items||[]).map(x=>({text:clean(x.text),score:Number(x.score||0)})).filter(x=>x.text)}function trustedLines(items){return rawLines(items).filter(x=>x.score>=0)}function joined(lines){return lines.map(x=>x.text).join('\n')}
function numberMarker(label,anchored=true){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/a/i,'\\s*a').replace(/b/i,'\\s*b').replace(/c/i,'\\s*c');return new RegExp((anchored?'^\\s*':'(?:^|\\s)')+escaped+'(?=\\s|[.):;-]|$)\\s*[.)]?\\s*[:;-]?\\s*','i')}
function findNumbered(lines,label){
 const labels=['1','2','3','4a','4b','4c','5','7','8','9'];
 const stops=labels.filter(field=>field!==label).map(field=>field.length===1
  ?new RegExp('(?:^|\\s)'+field+'[.):](?=\\s|$)')
  :numberMarker(field,false));
 const marker=numberMarker(label),inline=numberMarker(label,false),values=[];
 function cut(text,hit){let end=text.length;for(const re of stops){const m=re.exec(text);if(m&&m.index>hit.index&&m.index<end)end=m.index}return clean(text.slice(hit.index+hit[0].length,end))}
 function acceptable(value){if(label==='3'){const d=dateFrom(value);return Boolean(d&&d<=minimumAdultBirthDate())}if(label==='4a'){const d=dateFrom(value);return Boolean(d&&d<=localISODate())}if(label==='4b')return Boolean(dateFrom(value));if(label==='5')return Boolean(goodLicence(value));if(label==='1'||label==='2')return Boolean(goodName(value));return Boolean(value)}
 for(let i=0;i<lines.length;i++){
  const line=lines[i].text,anchored=marker.exec(line),hit=anchored||inline.exec(line);
  if(!hit)continue;
  let value=cut(line,hit);
  const next=lines[i+1]?.text||'';
  if(anchored&&acceptable(value)&&next&&!labels.some(field=>numberMarker(field).test(next))){
   if((label==='1'||label==='2')&&/^\p{Lu}[\p{Lu} '’-]+$/u.test(next)&&goodName(next))value+=' '+next;
   if(label==='8'&&/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(next))value+=' '+next;
  }
  if(value)values.push(value);
 }
 for(const value of values)if(acceptable(value))return value;
 return /^(?:3|4a|4b)$/i.test(label)?'':(values[0]||'')
}
function findInlineNumbered(lines,label){const marker=numberMarker(label,false);for(const line of lines){const hit=marker.exec(line.text);if(hit)return clean(line.text.slice(hit.index+hit[0].length))}return''}
function findLabel(lines,labels){for(let i=0;i<lines.length;i++){const line=upper(lines[i].text);for(const lab of labels){const L=upper(lab),p=line.indexOf(L);if(p>=0){const tail=clean(lines[i].text.slice(p+lab.length).replace(/^\s*[:#º°./-]+\s*/,''));if(tail)return tail;if(lines[i+1])return lines[i+1].text}}}return''}
function licenceAfterLabel(lines){for(let i=0;i<lines.length;i++){if(!/LICEN[CS](?:IA|E)/i.test(lines[i].text))continue;for(let j=i;j<lines.length&&j<=i+3;j++){const candidates=String(lines[j].text||'').match(/[A-Z0-9][A-Z0-9.\/-]{4,24}/gi)||[];for(const candidate of candidates){if(/LICEN[CS]|NACIONAL|CONDUCIR/i.test(candidate))continue;const value=goodLicence(candidate);if(value)return value}}}return''}
function countryFrom(text){const normalize=v=>String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),all=normalize(text),raw=String(text||'').replace(/\r/g,'').split('\n').map(normalize).filter(Boolean),first=raw.findIndex(line=>/^1\s*[.)]/.test(line)),header=(first>=0?raw.slice(0,first):raw.slice(0,20)),codes={A:'AUSTRIA',B:'BÉLGICA',BG:'BULGARIA',CH:'SUIZA',CY:'CHIPRE',CZ:'REPÚBLICA CHECA',D:'ALEMANIA',DK:'DINAMARCA',E:'ESPAÑA',EST:'ESTONIA',F:'FRANCIA',FIN:'FINLANDIA',GR:'GRECIA',H:'HUNGRÍA',HR:'CROACIA',I:'ITALIA',IRL:'IRLANDA',L:'LUXEMBURGO',LT:'LITUANIA',LV:'LETONIA',M:'MALTA',N:'NORUEGA',NL:'PAÍSES BAJOS',P:'PORTUGAL',PL:'POLONIA',RO:'RUMANÍA',S:'SUECIA',SK:'ESLOVAQUIA',SLO:'ESLOVENIA',UK:'REINO UNIDO'};if(/BUNDESREPUBLIK DEUTSCHLAND|GERMANY/.test(all))return'ALEMANIA';if(/HRVATSKA|CROATIA|HRVATSKI/.test(all))return'CROACIA';if(/BELGIE|BELGIEN|BELGIUM|BELGIQUE|RIJBEWIJS/.test(all))return'BÉLGICA';if(/RZECZPOSPOLITA POLSKA|PRAWO JAZDY|\bPOLSKA\b|\bPOLAND\b/.test(all))return'POLONIA';for(const line of header){const code=line.replace(/[^A-Z]/g,'');if(codes[code]&&line.length<=5)return codes[code]}if(/RIJBEWIJS|BELGIE|BELGIEN|BELGIUM|BELGIQUE/.test(all))return'BÉLGICA';if(/HRVATSKA|CROATIA|HRVATSKI/.test(all))return'CROACIA';if(/UK DRIVING LICEN[CS]E|UNITED KINGDOM|\bDVLA\b/.test(all))return'REINO UNIDO';if(/REINO DE ESPANA/.test(all))return'ESPAÑA';if(/OSTERREICH|\bAUSTRIA\b|\bM[OÖ]DLING\b|\bBH MODLING\b/.test(all))return'AUSTRIA';if(/BUNDESREPUBLIK DEUTSCHLAND/.test(all))return'ALEMANIA';if(/REPUBLIQUE FRANCAISE/.test(all))return'FRANCIA';if(/REPUBBLICA ITALIANA/.test(all))return'ITALIA';if(/LICENCIA NACIONAL DE CONDUCIR|REPUBLICA ARGENTINA|BUENOS AIRES/.test(all))return'ARGENTINA';return''}
function parseIdentity(items,inferDates=true){const lines=trustedLines(items),text=joined(lines),result={},c=countryFrom(text);if(c)result.country=c;if(c==='ARGENTINA'){const sur=goodName(findLabel(lines,['APELLIDO / LAST NAME','APELLIDO','LAST NAME'])),given=goodName(findLabel(lines,['NOMBRE / FIRST NAME','NOMBRE','FIRST NAME']));if(sur&&given)result.name=`${given} ${sur}`;const lic=licenceAfterLabel(lines)||goodLicence(findLabel(lines,['N° LICENCIA / LICENSE N°','Nº LICENCIA','LICENSE N','LICENCIA']));if(lic)result.license=lic;result.birth=dateFrom(findLabel(lines,['FECHA DE NAC. / DATE OF BIRTH','FECHA DE NAC','DATE OF BIRTH']));result.issue=dateFrom(findLabel(lines,['OTORGAMIENTO / DATE OF ISSUE','OTORGAMIENTO','DATE OF ISSUE']));result.expiry=dateFrom(findLabel(lines,['VENCIMIENTO / EXPIRES','VENCIMIENTO','EXPIRES']));const ad=clean(findLabel(lines,['DOMICILIO / ADDRESS','DOMICILIO','ADDRESS']));if(ad.length>=5&&ad.length<=80)result.address=ad}else{const sur=goodName(findNumbered(lines,'1')),given=goodName(findNumbered(lines,'2')).replace(/^(?:MR|MRS|MS|MISS|DR)\s+/i,'');if(sur&&given)result.name=`${given} ${sur}`;result.birth=dateFrom(findNumbered(lines,'3'));result.issue=dateFrom(findNumbered(lines,'4a'));result.expiry=dateFrom(findNumbered(lines,'4b')||findInlineNumbered(lines,'4b'));const dates=licenceDateCandidates(text),adultDates=dates.filter(d=>d<=minimumAdultBirthDate());if(result.birth&&result.birth>minimumAdultBirthDate())result.birth='';if(inferDates&&!result.birth&&adultDates.length)result.birth=adultDates[0];const afterBirth=dates.filter(d=>!result.birth||d>result.birth);if(inferDates&&!result.issue){const past=afterBirth.filter(d=>d<=localISODate());if(past.length)result.issue=past[0]}/* Caducidad solo se rellena si se reconoce explícitamente el campo 4b. */const polishLicense=(text.match(/\b\d{5}\/\d{2}\/\d{5,8}\b/)||[])[0];const lic=goodLicence(findNumbered(lines,'5'));if(c==='POLONIA'&&polishLicense)result.license=polishLicense;else if(lic)result.license=lic;const ad=clean(findNumbered(lines,'8'));if(ad.length>=8&&ad.length<=100&&/^[\p{L}\d\s,.'/#-]+$/u.test(ad)&&!/RIJBEWIJS|PERMIS|FÜHRER|FUHRER|DRIVING|LICEN[CS]|EUROP|MODEL|UNION|TITULAR|CATEGOR|SIGNATURE|FECHA|BIRTH|HEERLEN|GENK/i.test(ad))result.address=ad}if(!result.name&&/DRIVING LICEN[CS]E|PERMIS DE CONDUIRE|F[ÜU]HRERSCHEIN|RIJBEWIJS|PRAWO JAZDY|VOZA.CKA DOZVOLA/i.test(text)){const candidates=[],bad=/FÜHRER|FUHRER|DRIVING|LICEN[CS]|PERMIS|RIJBEWIJS|VOZA|DOZVOLA|BUNDESREPUBLIK|DEUTSCHLAND|HRVATSKA|EUROPE|EUROP|MODEL|UNION|SUBJECT|CATEGOR|SIGNATURE|REPUBLIKA|DATE|BIRTH|FECHA/i;for(const line of lines){if(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(line.text))break;if(bad.test(line.text))continue;const tokens=line.text.match(/\p{Lu}[\p{L}'-]{2,}/gu)||[];if(!tokens.length)continue;const token=tokens.sort((a,b)=>b.length-a.length)[0];if(token.length>=3)candidates.push(token)}if(candidates.length>=2)result.name=candidates[1]+' '+candidates[0]}if(!result.license&&/DRIVING LICEN[CS]E|PERMIS DE CONDUIRE|F[ÜU]HRERSCHEIN|RIJBEWIJS/i.test(text)){const polish=(text.match(/\b\d{5}\/\d{2}\/\d{5,8}\b/)||[])[0],german=(text.match(/\b[A-Z]\d[A-Z0-9]{7,12}\b/i)||[])[0],n=polish||german||(text.match(/(?:^|\s)(\d{8,12})(?=\s|$)/m)||[])[1];if(n)result.license=goodLicence(n)}for(const k of Object.keys(result))if(!result[k])delete result[k];return result}
function coreCount(r){return['name','license','birth','issue','expiry','country'].filter(k=>r&&r[k]).length}
function showResult(r){const b=$('scanResult');if(!b)return;if(!r||!Object.keys(r).length){b.innerHTML='<b>Sin datos fiables</b><div class="muted" style="margin-top:5px">No se copiará nada al contrato.</div>';return}const map=[['Nombre','name'],['Documento','document'],['Permiso','license'],['Nacimiento','birth'],['Expedición','issue'],['Caducidad','expiry'],['País','country'],['Domicilio','address'],['Matrícula','plate'],['Marca','make'],['Modelo','model'],['Combustible','fuel']];b.innerHTML='<b>Datos detectados para revisar</b>'+map.filter(([l,k])=>r[k]).map(([l,k])=>`<div style="display:grid;grid-template-columns:120px 1fr;gap:8px;padding:5px 0"><strong>${l}</strong><span>${esc(r[k])}</span></div>`).join('')}
function ocrAsset(file){
 return new URL('./vendor/tesseract-v5/'+file,window.location.href).href;
}
function loadScript(){
 if(window.Tesseract)return Promise.resolve();
 if(!engineScript){
  engineScript=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=ocrAsset('tesseract.min.js');
   const fail=()=>{
    clearTimeout(timer);
    script.remove();
    reject(new Error('No se pudo cargar el motor OCR local'));
   };
   const timer=setTimeout(fail,20000);
   script.onload=()=>{clearTimeout(timer);resolve()};
   script.onerror=fail;
   document.head.appendChild(script);
  }).catch(error=>{engineScript=null;throw error});
 }
 return engineScript;
}
function withOCRTimeout(promise,message){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(new Error(message)),20000);
 })]).finally(()=>clearTimeout(timer));
}
async function getEngine(language='spa+eng'){
 if(engines[language])return engines[language];
 await loadScript();
 if(!window.Tesseract)throw new Error('El motor OCR no se cargó');
 const starting=window.Tesseract.createWorker(language,1,{
  workerPath:ocrAsset('worker.min.js'),
  corePath:ocrAsset(''),
  langPath:ocrAsset(''),
  workerBlobURL:false,
  // Route worker failures through the bounded waits below, including on Safari.
  errorHandler:()=>{}
 });
 try{
  engines[language]=await withOCRTimeout(starting,'El motor OCR local tardó demasiado en iniciarse');
  return engines[language];
 }catch(error){
  starting.then(worker=>worker.terminate()).catch(()=>{});
  throw error;
 }
}
async function permitCanvas(file){
 let image;
 try{image=await createImageBitmap(file)}catch{
  const url=URL.createObjectURL(file);
  try{
   image=new Image();
   image.src=url;
   await image.decode();
  }finally{URL.revokeObjectURL(url)}
 }
 try{
  const scale=Math.min(1,1800/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));
  canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
 }finally{image.close?.()}
}
function parseIdentityText(text,inferDates=true){
 return parseIdentity(String(text||'').split(/\r?\n/).map(line=>({text:line,score:1})),inferDates);
}
function parseWebIdentity(text){
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(!/\bQUEBEC\b/i.test(normalized)||!/PERMIS\s+DE\s+CONDUIRE|[A-Z]\d{4}\s*-\s*\d{6}\s*-\s*\d{2}/i.test(normalized)){
  return parseIdentityText(text,false);
 }
 const result={country:'CANADÁ'};
 const licence=normalized.match(/\b([A-Z]\d{4})[ \t]*-[ \t]*(\d{6})[ \t]*-[ \t]*(\d{2})\b/i);
 if(licence)result.license=licence.slice(1).join('-').toUpperCase();
 const birthLabel=/\bDate de naissance\b/i;
 const birthIndex=text.search(birthLabel);
 const names=text.slice(0,birthIndex<0?0:birthIndex)
  .split(/\r?\n/).filter(line=>!/(?:Qu[eé]bec|Permis de conduire)/i.test(line))
  .slice(-7).map(line=>line.replace(/^\s*(?:[12][.):]?|[.,'’"“])\s*/,'').trim())
  .filter(line=>/^\p{Lu}{2}[\p{Lu} '’.-]*$/u.test(line)).map(goodName).filter(Boolean);
 if(names.length===2)result.name=names[1]+' '+names[0];
 function labelledDate(label){
  const hit=normalized.match(new RegExp('\\b(?:'+label+')\\b[^0-9\\n]{0,18}\\s*(\\d{4})\\s*[-./]\\s*(\\d{2})\\s*[-./]\\s*(\\d{2})','i'));
  return hit?validDate(Number(hit[3]),Number(hit[2]),Number(hit[1])):'';
 }
 const birth=labelledDate('date de naissance');
 const issue=labelledDate('[vy]alide le');
 const expiry=labelledDate('expire le');
 const [year,month,day]=birth.split('-');
 // The published Québec number format repeats the printed birth date as DDMMYY.
 const consistentBirth=!licence||!birth||licence[2]===day+month+year.slice(-2);
 if(birth&&consistentBirth&&birth<=minimumAdultBirthDate())result.birth=birth;
 if(issue&&issue<=localISODate()&&(!result.birth||issue>result.birth))result.issue=issue;
 if(expiry&&expiry>(result.issue||result.birth||''))result.expiry=expiry;
 const mailing=text.match(/\b\d{1,6}[ \t]+[\p{L}\d '’.,-]{4,70}\r?\n\s*(?:(?:APP\.?|APT\.?).+\r?\n\s*)?[\p{L} '’.,-]{2,60}\s*\(?QC\)?[ \t]+[A-Z]\d[A-Z][ \t]*\d[A-Z]\d\b/iu);
 if(mailing)result.address=clean(mailing[0]);
 return result;
}
const permitFields=['name','license','birth','issue','expiry'];
function hasPermitData(result){return [...permitFields,'address'].some(field=>result[field])}
function checkPermitDates(result){
 if(result.birth&&result.issue&&result.issue<=result.birth)delete result.issue;
 if(result.expiry&&result.expiry<=(result.issue||result.birth||''))delete result.expiry;
 return result;
}
function completePermit(result){
 return permitFields.every(key=>result[key])&&(result.country!=='CANADÁ'||Boolean(result.address));
}
async function webOCR(file,run){
 const progress=message=>{if(run===scanRun)state(message)};
 const digest=window.crypto?.subtle&&await window.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const key=digest&&Array.from(new Uint8Array(digest)).join(',');
 if(key&&key===lastWebRead?.key)return lastWebRead.result;
 if(run!==scanRun)return null;
 progress('Preparando lectura local del permiso…');
 const language='eng+spa';
 const [canvas,worker]=await Promise.all([permitCanvas(file),getEngine(language)]);
 async function recognize(pageMode){
  try{
   await withOCRTimeout(worker.setParameters({tessedit_pageseg_mode:pageMode,user_defined_dpi:'300'}),'El lector tardó demasiado en prepararse');
   const reading=await withOCRTimeout(worker.recognize(canvas),'La lectura del permiso tardó demasiado');
   return String(reading?.data?.text||'').trim();
  }catch(error){
   delete engines[language];
   worker.terminate().catch(()=>{});
   throw error;
  }
 }
 if(run!==scanRun)return null;
 progress('Leyendo permiso…');
 const first=await recognize('3');
 let parsed=checkPermitDates(parseWebIdentity(first)),text=first;
 if(run!==scanRun)return null;
 if(!completePermit(parsed)){
  progress('Buscando los campos que faltan…');
  let second='';
  try{
   second=await recognize('11');
  }catch(error){
   if(!hasPermitData(parsed))throw error;
   return {text,parsed};
  }
  const other=parseWebIdentity(second);
  // A positive identification of Québec takes precedence over the generic field map.
  if(parsed.country==='CANADÁ'||other.country==='CANADÁ'){
   if(parsed.country!=='CANADÁ')parsed=other;
   else if(other.country==='CANADÁ')parsed={...other,...parsed};
  }else{
   parsed={...other,...parsed};
  }
  checkPermitDates(parsed);
  text=[first,second].filter(Boolean).join('\n\n');
 }
 const result={text,parsed};
 if(run===scanRun&&key&&hasPermitData(parsed))lastWebRead={key,result};
 return result;
}
async function readIdentity(file,nativeText,run){
 let result;
 if(nativeText){
  const text=String(nativeText);
  result={text,parsed:parseIdentityText(text)};
 }else{
  const pending=webReadQueue.then(()=>webOCR(file,run));
  webReadQueue=pending.catch(()=>{});
  result=await pending;
 }
 if(run!==scanRun||!result)return null;
 $('scanRaw').textContent=result.text;
 if(!hasPermitData(result.parsed)){
  throw new Error('No se pudieron identificar campos del permiso. Prueba con una foto más cercana y sin reflejos');
 }
 return result.parsed;
}
function vehicleLines(text){return String(text||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean)}
function labelRegex(labels){return new RegExp('(?:'+labels.join('|')+')\\s*[:;=._-]*\\s*(.*)$','i')}
function vehicleValues(text,labels){const values=[],ls=vehicleLines(text),re=labelRegex(labels),any=/(?:MATR[IÍ1L]CULA|MATR.CULA|PLATE|REGISTRATION|MARCA|MAKE|BRAND|MODELO|MODEL|FUEL|FUE[L1I]|COMBUSTIBLE|CARBURANTE)/i;for(let i=0;i<ls.length;i++){const m=ls[i].match(re);if(!m)continue;let tail=clean(m[1]||'').replace(/^[:;=._-]+/,'').trim();if(tail)values.push(tail);else for(let j=i+1;j<ls.length&&j<=i+2;j++){const c=clean(ls[j]);if(c&&!any.test(c)&&c.length<=45){values.push(c);break}}}return[...new Set(values)]}
function normalizePlate(v){let s=upper(v).replace(/[^A-Z0-9]/g,'');s=s.replace(/^(?:MATRICULA|MATR1CULA|MATRLCULA)/,'');let m=s.match(/(\d{4})([A-Z0-9]{3})/);if(m)return m[1]+m[2].replace(/0/g,'O').replace(/1/g,'I');m=s.match(/([A-Z]{1,3})(\d{3,5})([A-Z]{0,3})/);return m?(m[1]+m[2]+m[3]):''}
function normalizeFuel(v){const s=upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/DIESEL|GASOIL/.test(s))return'DIESEL';if(/GASOLINA|UNLEADED|PETROL|\b95\b|\b98\b/.test(s))return'GASOLINA';if(/ELECTR|\bEV\b/.test(s))return'ELECTRICO';if(/HIBRID|HYBRID/.test(s))return'HIBRIDO';return''}
function cleanVehicleValue(v){return upper(v).replace(/^(?:MARCA|MAKE|BRAND|MODELO|MODEL)\s*[:;=._-]*/i,'').replace(/[:|].*$/,'').replace(/[^A-Z0-9ÁÉÍÓÚÜÑ .\/-]/g,'').replace(/[.]+$/,'').trim()}
function shortestClean(values){return values.map(cleanVehicleValue).filter(Boolean).sort((a,b)=>a.length-b.length)[0]||''}
function parseVehicleText(text){const plates=vehicleValues(text,['MATR[IÍ1L]CULA','MATR.CULA','PLATE','REGISTRATION']).map(normalizePlate).filter(Boolean),make=shortestClean(vehicleValues(text,['MARCA','MAKE','BRAND'])),model=shortestClean(vehicleValues(text,['MODELO','MODEL'])),fuels=vehicleValues(text,['FUEL','FUE[L1I]','COMBUSTIBLE','CARBURANTE']).map(normalizeFuel).filter(Boolean),result={};if(plates[0])result.plate=plates[0];if(make)result.make=make;if(model)result.model=model;if(fuels[0])result.fuel=fuels[0];return result}
function rawPlateCandidates(text){const labelled=vehicleValues(text,['MATR[IÍ1L]CULA','MATR.CULA','PLATE','REGISTRATION']),direct=upper(text).match(/\d{4}[\s._-]*[A-Z0-9]{3,4}/g)||[];return[...new Set([...labelled,...direct].map(v=>upper(v).replace(/[^A-Z0-9]/g,'')).filter(v=>v.length>=6&&v.length<=14))]}
function editDistance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const saved=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));previous=saved}}return row[b.length]}
function bestFleetVehicle(rows,text,result){const candidates=[result.plate,...rawPlateCandidates(text)].filter(Boolean).map(x=>upper(x).replace(/[^A-Z0-9]/g,''));if(!candidates.length)return null;let best=null,bestDistance=99,ties=0;for(const vehicle of rows||[]){const registered=upper(vehicle.registration).replace(/[^A-Z0-9]/g,'');if(!registered)continue;const distance=Math.min(...candidates.map(candidate=>editDistance(candidate.slice(-8),registered)));if(distance<bestDistance){best=vehicle;bestDistance=distance;ties=1}else if(distance===bestDistance)ties++}return bestDistance<=3&&ties===1?best:null}
async function vehicleCanvas(file){const bmp=await createImageBitmap(file),sx=Math.round(bmp.width*.04),sy=Math.round(bmp.height*.08),sw=Math.round(bmp.width*.92),sh=Math.round(bmp.height*.84),scale=Math.min(4,3200/Math.max(sw,sh)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;for(let i=0;i<data.length;i+=4){const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2],value=Math.max(0,Math.min(255,(gray-118)*1.45+128));data[i]=data[i+1]=data[i+2]=value}ctx.putImageData(image,0,0);return canvas}
async function readVehicle(file,nativeText){let text=nativeText||'';if(!text){const ocr=await getEngine(),image=await vehicleCanvas(file),reads=[];for(const pageMode of ['6','11','3']){state('Leyendo llavero… pasada '+(reads.length+1)+' de 3');await ocr.setParameters({tessedit_pageseg_mode:pageMode,preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await ocr.recognize(image),value=String(r?.data?.text||'').trim();if(value)reads.push(value)}text=reads.join('\n--- OTRA LECTURA ---\n');} $('scanRaw').textContent=text||'(sin texto)';if(!text)throw new Error('El OCR no detectó texto en el llavero');const result=parseVehicleText(text);try{const rows=await api('vehicles?select=registration,make,model,fuel_type&limit=500'),v=bestFleetVehicle(rows,text,result);if(v){result.plate=v.registration||result.plate;result.make=v.make||result.make;result.model=v.model||result.model;result.fuel=v.fuel_type||result.fuel}}catch(e){console.warn('No se pudo contrastar el llavero con la flota',e)}if(!result.plate||!result.make||!result.model||!result.fuel)throw new Error('No se reconocieron las cuatro etiquetas MATRÍCULA, MARCA, MODELO y FUEL');return result}
async function selected(input,nativeText){
 const file=input?.files?.[0];
 if(!file)return;
 const run=++scanRun;
 lastFile=file;
 lastResult=null;
 $('scanApply').disabled=true;
 if(previewUrl)URL.revokeObjectURL?.(previewUrl);
 previewUrl=URL.createObjectURL(file);
 const preview=$('scanPreview');
 preview.src=previewUrl;
 preview.classList.remove('hidden');
 $('scanResult').innerHTML='<b>Procesando fotografía…</b>';
 $('scanRaw').textContent='';
 state('Preparando fotografía…');
 try{
  if(native()&&!nativeText)throw Error('La cámara nativa debe aportar el texto leído localmente.');
  const result=mode==='keys'?await readVehicle(file,nativeText):await readIdentity(file,nativeText,run);
  if(run!==scanRun)return;
  lastResult=result;
  showResult(result);
  $('scanApply').disabled=false;
  state(mode==='identity'&&!native()&&!completePermit(result)
   ?'Lectura parcial. Revisa los datos detectados y completa los campos que falten.'
   :'Revisa los datos detectados antes de pulsar Aplicar.');
 }catch(error){
  if(run!==scanRun)return;
  showResult(null);
  state((error?.message||'No se pudo leer la fotografía').replace(/[.]+$/,'')+'. El contrato no se ha modificado.');
 }
}
function apply(){if(!lastResult){alert('No hay una lectura fiable para aplicar.');return}let n=0;if(mode==='keys'){n+=emit('vehicle_plate',lastResult.plate)?1:0;n+=emit('vehicle_model',clean([lastResult.make,lastResult.model].filter(Boolean).join(' ')))?1:0;n+=emit('fuel_type',lastResult.fuel)?1:0}else if(who==='additional'){n+=emit('additional_name',lastResult.name)?1:0;n+=emit('additional_driving_license',lastResult.license||lastResult.document)?1:0;n+=emit('additional_birth_date',lastResult.birth)?1:0;n+=emit('additional_license_issue',lastResult.issue)?1:0;n+=emit('additional_license_expiry',lastResult.expiry)?1:0;n+=emit('additional_license_issued_by',lastResult.country)?1:0}else{n+=emit('customer_name',lastResult.name)?1:0;const documentValue=lastResult.document||(lastResult.country!=='CANADÁ'&&!$('customer_document')?.value?lastResult.license:'');n+=emit('customer_document',documentValue)?1:0;n+=emit('driving_license',lastResult.license)?1:0;n+=emit('customer_birth_date',lastResult.birth)?1:0;n+=emit('license_issue',lastResult.issue)?1:0;n+=emit('license_expiry',lastResult.expiry)?1:0;n+=emit('license_issued_by',lastResult.country)?1:0;n+=emit('customer_address',lastResult.address)?1:0}window.LariosContractUX?.recalculate?.();state(n+' campos aplicados al contrato.');close()}
async function upload(){if(!lastFile){alert('Primero haz una foto.');return null}try{const ext=(lastFile.name?.split('.').pop()||'jpg').toLowerCase(),uid=crypto.randomUUID?crypto.randomUUID():String(Date.now()),path='mobile/'+new Date().toISOString().slice(0,10)+'/'+uid+'.'+ext,r=await fetch(cfg.supabaseUrl+'/storage/v1/object/documents/'+path,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':lastFile.type||'image/jpeg','x-upsert':'false'},body:lastFile});if(!r.ok)throw new Error(await r.text());state('Foto guardada de forma privada.');return path}catch(e){alert('No se pudo guardar la imagen: '+e.message);return null}}
window.LariosScanner={open,close,choose,selected,apply,upload,__testParseIdentityText:parseIdentityText,__testParseWebIdentity:parseWebIdentity,__testParseVehicleText:parseVehicleText,__testBestFleetVehicle:bestFleetVehicle};setFooter();console.log('Scanner V6 WEB + llavero OCR robusto loaded');
})();

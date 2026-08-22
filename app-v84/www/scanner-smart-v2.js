(function(){
'use strict';
if(!window.LariosScanner)return;

const previous={...window.LariosScanner};
const $=id=>document.getElementById(id);
let mode='identity',who='main',lastFile=null,lastDetected={};
let worker=null;

const MONTHS={
 ENE:1,JAN:1,ENERO:1,JANUARY:1,
 FEB:2,FEBRERO:2,FEBRUARY:2,
 MAR:3,MARZO:3,MARCH:3,
 ABR:4,APR:4,ABRIL:4,APRIL:4,
 MAY:5,MAYO:5,
 JUN:6,JUNIO:6,JUNE:6,
 JUL:7,JULIO:7,JULY:7,
 AGO:8,AUG:8,AGOSTO:8,AUGUST:8,
 SEP:9,SEPT:9,SEPTIEMBRE:9,SEPTEMBER:9,
 OCT:10,OCTUBRE:10,OCTOBER:10,
 NOV:11,NOVIEMBRE:11,NOVEMBER:11,
 DIC:12,DEC:12,DICIEMBRE:12,DECEMBER:12
};
const BAD_NAME=/PERMISO|CONDUC|LICEN[CS]|F[ÜU]HRER|MODELL|EUROP|REINO|ESPAÑA|ARGENTINA|SEGURIDAD|VIAL|MINISTERIO|TRANSPORTE|DOMICILIO|ADDRESS|FECHA|DATE|NACIMIENTO|BIRTH|OTORGAMIENTO|VENCIMIENTO|SIGNATURE|FIRMA|CLASS|CLASES/i;

function state(s){const e=$('scanState');if(e)e.textContent=s||'';}
function clean(s){return String(s||'').replace(/[|]/g,'I').replace(/\s+/g,' ').trim();}
function upper(s){return clean(s).toUpperCase();}
function stripAccents(s){return upper(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function emit(id,v){if(!v)return false;const e=$(id);if(!e)return false;e.value=String(v).trim();e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}

function parseDate(raw){
 const s=stripAccents(raw).replace(/[,]/g,' ');
 let m=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
 if(m){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),Number(m[2]),y);}
 m=s.match(/\b(\d{1,2})\s+([A-Z]{3,10})\s+(\d{2,4})\b/);
 if(m&&MONTHS[m[2]]){let y=Number(m[3]);if(y<100)y+=(y>35?1900:2000);return validDate(Number(m[1]),MONTHS[m[2]],y);}
 return'';
}
function validDate(d,m,y){if(y<1900||y>2100||m<1||m>12||d<1||d>31)return'';const x=new Date(Date.UTC(y,m-1,d));if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return'';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function validName(s){s=clean(s).replace(/\d+/g,' ').replace(/[^A-Za-zÀ-ÿ' -]/g,' ').replace(/\s+/g,' ').trim();if(s.length<4||s.length>60||BAD_NAME.test(s))return'';const w=s.split(' ').filter(Boolean);if(w.length<1||w.length>6)return'';if(w.some(x=>x.length<2))return'';return s;}
function validLicence(s){const x=upper(s).replace(/[^A-Z0-9-]/g,'');if(x.length<5||x.length>18)return'';if(!/\d{4,}/.test(x))return'';if(/^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$/.test(x))return'';return x;}
function lines(text){return String(text||'').replace(/\r/g,'').split(/\n+/).map(clean).filter(Boolean);}
function marker(line,label){const l=String(label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|\\s)${l}\\s*[.)]?\\s*[:;-]?\\s*`,'i').exec(line);}
function numbered(text,label,next){
 const a=lines(text);let found=false,parts=[];
 for(let i=0;i<a.length;i++){
   if(!found){const m=marker(a[i],label);if(!m)continue;found=true;const tail=clean(a[i].slice(m.index+m[0].length));if(tail)parts.push(tail);continue;}
   if(marker(a[i],next)||/^(?:[3-9]|4a|4b|4c)\s*[.)]/i.test(a[i]))break;
   if(parts.length<2)parts.push(a[i]);else break;
 }
 return clean(parts.join(' '));
}
function labelled(text,labels){
 const a=lines(text);
 for(let i=0;i<a.length;i++){
   const U=stripAccents(a[i]);
   for(const raw of labels){const L=stripAccents(raw);const p=U.indexOf(L);if(p<0)continue;let v=clean(a[i].slice(p+raw.length).replace(/^\s*[:#º°.-]+\s*/,''));if(v&&stripAccents(v)!==L)return v;if(a[i+1])return a[i+1];}
 }
 return'';
}
function country(text){const t=stripAccents(text);if(/REINO DE ESPANA|PERMISO DE CONDUCCION|\bESPANA\b/.test(t))return'ESPAÑA';if(/OSTERREICH|FUHRERSCHEIN/.test(t))return'AUSTRIA';if(/REPUBLICA ARGENTINA|LICENCIA NACIONAL DE CONDUCIR|CIUDAD AUTONOMA DE BUENOS AIRES/.test(t))return'ARGENTINA';if(/DEUTSCHLAND/.test(t))return'ALEMANIA';if(/FRANCE|PERMIS DE CONDUIRE/.test(t))return'FRANCIA';if(/ITALIA|PATENTE DI GUIDA/.test(t))return'ITALIA';if(/PORTUGAL/.test(t))return'PORTUGAL';return'';}
function explicitNationality(text){const v=labelled(text,['NACIONALIDAD','NATIONALITY']);return validName(v);}

function parseEU(text){
 const out={};
 const surname=validName(numbered(text,'1','2'));
 const given=validName(numbered(text,'2','3'));
 if(surname&&given)out.name=clean(`${given} ${surname}`);else if(given)out.name=given;else if(surname)out.name=surname;
 const b=parseDate(numbered(text,'3','4a'));if(b)out.birth=b;
 const i=parseDate(numbered(text,'4a','4b'));if(i)out.issue=i;
 const e=parseDate(numbered(text,'4b','4c'));if(e)out.expiry=e;
 const l=validLicence(numbered(text,'5','7'));if(l)out.license=l;
 out.country=country(text);
 return out;
}
function parseArgentina(text){
 const out={country:'ARGENTINA'};
 let surname=labelled(text,['APELLIDO / LAST NAME','APELLIDO','LAST NAME']);
 let given=labelled(text,['NOMBRE / FIRST NAME','NOMBRE','FIRST NAME']);
 surname=validName(surname);given=validName(given);
 if(surname&&given)out.name=clean(`${given} ${surname}`);
 const lic=validLicence(labelled(text,['N° LICENCIA / LICENSE N°','N LICENCIA / LICENSE N','Nº LICENCIA','LICENSE N','LICENCIA']));if(lic)out.license=lic;
 const birth=parseDate(labelled(text,['FECHA DE NAC. / DATE OF BIRTH','FECHA DE NAC','DATE OF BIRTH']));if(birth)out.birth=birth;
 const issue=parseDate(labelled(text,['OTORGAMIENTO / DATE OF ISSUE','OTORGAMIENTO','DATE OF ISSUE']));if(issue)out.issue=issue;
 const expiry=parseDate(labelled(text,['VENCIMIENTO / EXPIRES','VENCIMIENTO','EXPIRES','EXPIRY DATE']));if(expiry)out.expiry=expiry;
 const address=clean(labelled(text,['DOMICILIO / ADDRESS','DOMICILIO','ADDRESS'])).replace(/^(?:ADDRESS|DOMICILIO)\s*/i,'');if(address.length>=5&&address.length<=80)out.address=address;
 return out;
}
function documentNumber(text){const t=upper(text).replace(/\s+/g,'');let m=t.match(/\b[XYZ]\d{7}[A-Z]\b/);if(m)return m[0];m=t.match(/\b\d{8}[A-Z]\b/);if(m)return m[0];const v=labelled(text,['PASAPORTE','PASSPORT','DOCUMENTO','DOCUMENT NO']);m=upper(v).match(/[A-Z0-9]{6,12}/);return m?m[0]:'';}
function parseIdentity(text){
 const t=stripAccents(text);let out={};
 if(/LICENCIA NACIONAL DE CONDUCIR|CIUDAD AUTONOMA DE BUENOS AIRES/.test(t))out=parseArgentina(text);else out=parseEU(text);
 const doc=documentNumber(text);if(doc)out.document=doc;
 const nat=explicitNationality(text);if(nat)out.nationality=nat;
 return sanitizeIdentity(out);
}
function sanitizeIdentity(x){
 const o={};
 if(validName(x.name))o.name=validName(x.name);
 if(validLicence(x.license))o.license=validLicence(x.license);
 if(x.document&&/^[A-Z0-9-]{6,18}$/i.test(x.document))o.document=upper(x.document);
 for(const k of ['birth','issue','expiry'])if(/^\d{4}-\d{2}-\d{2}$/.test(x[k]||''))o[k]=x[k];
 if(['ESPAÑA','AUSTRIA','ARGENTINA','ALEMANIA','FRANCIA','ITALIA','PORTUGAL'].includes(x.country))o.country=x.country;
 if(x.nationality&&validName(x.nationality))o.nationality=validName(x.nationality);
 if(x.address&&x.address.length>=5&&x.address.length<=80&&!BAD_NAME.test(x.address))o.address=clean(x.address);
 return o;
}

function parseVehicle(text){
 const t=upper(text);const out={};
 let m=t.match(/\b\d{4}\s*[BCDFGHJKLMNPRSTVWXYZ]{3}\b/);if(m)out.plate=m[0].replace(/\s/g,'');
 if(!out.plate){const v=labelled(text,['MATRÍCULA','MATRICULA','REGISTRATION','PLATE']);m=upper(v).match(/\b[A-Z0-9-]{5,10}\b/);if(m)out.plate=m[0];}
 const make=validName(labelled(text,['MARCA','MAKE','BRAND']));const model=validName(labelled(text,['MODELO','MODEL']));if(make||model)out.model=clean([make,model].filter(Boolean).join(' '));
 const fuel=stripAccents(labelled(text,['COMBUSTIBLE','FUEL','CARBURANTE'])||text);if(/\bDIESEL\b|GASOLEO/.test(fuel))out.fuel='DIESEL';else if(/GASOLINA|PETROL|UNLEADED|\b95\b/.test(fuel))out.fuel='GASOLINA';
 const g=(t.match(/(?:GRUPO|GROUP|GRP)\s*[:#.-]?\s*(A|B|C|D|F|G|H|I|J|K|L|Q|50CC|125CC|BICICLETA|E-BIKE)\b/)||[])[1];if(g)out.group=g;
 return out;
}
function score(x){return Object.values(x||{}).filter(Boolean).length;}

function applyDetected(x,closeAfter){lastDetected=x||{};let n=0;
 if(mode==='keys'){
   n+=emit('vehicle_plate',x.plate)?1:0;n+=emit('vehicle_model',x.model)?1:0;n+=emit('fuel_type',x.fuel)?1:0;n+=emit('vehicle_group',x.group)?1:0;
 }else if(who==='additional'){
   n+=emit('additional_name',x.name)?1:0;n+=emit('additional_driving_license',x.license||x.document)?1:0;n+=emit('additional_birth_date',x.birth)?1:0;n+=emit('additional_license_issue',x.issue)?1:0;n+=emit('additional_license_expiry',x.expiry)?1:0;n+=emit('additional_license_issued_by',x.country)?1:0;
 }else{
   n+=emit('customer_name',x.name)?1:0;n+=emit('customer_document',x.document)?1:0;n+=emit('driving_license',x.license)?1:0;n+=emit('customer_birth_date',x.birth)?1:0;n+=emit('license_issue',x.issue)?1:0;n+=emit('license_expiry',x.expiry)?1:0;n+=emit('license_issued_by',x.country)?1:0;n+=emit('customer_nationality',x.nationality)?1:0;n+=emit('customer_address',x.address)?1:0;
 }
 if(window.LariosContractUX?.recalculate)window.LariosContractUX.recalculate();
 state(n?`${n} campos reconocidos con validación estricta. Revisa los datos antes de guardar.`:'No se han encontrado datos suficientemente fiables. No se ha escrito ningún texto dudoso en el contrato. Repite la foto más cerca y sin reflejos.');
 if(closeAfter&&n)previous.close();return n;
}

async function ensureWorker(){if(!window.Tesseract){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});}if(!worker)worker=await Tesseract.createWorker('spa+eng',1,{logger:m=>{if(m.status==='recognizing text')state(`Leyendo… ${Math.round((m.progress||0)*100)}%`);}});return worker;}
async function variant(file,type){const bmp=await createImageBitmap(file);const limit=2600,sc=Math.min(1,limit/Math.max(bmp.width,bmp.height));const w=Math.round(bmp.width*sc),h=Math.round(bmp.height*sc);const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(bmp,0,0,w,h);if(type==='original')return c;const im=cx.getImageData(0,0,w,h),d=im.data;let mean=0;for(let i=0;i<d.length;i+=4)mean+=d[i]*.299+d[i+1]*.587+d[i+2]*.114;mean/=d.length/4;for(let i=0;i<d.length;i+=4){let g=d[i]*.299+d[i+1]*.587+d[i+2]*.114;if(type==='contrast')g=(g-128)*1.7+128;if(type==='threshold')g=g>(mean*.92)?255:0;g=Math.max(0,Math.min(255,g));d[i]=d[i+1]=d[i+2]=g;}cx.putImageData(im,0,0);return c;}
async function recognize(file){const w=await ensureWorker();const all=[];const passes=[['original','6'],['contrast','6'],['threshold','11']];let best={};for(let i=0;i<passes.length;i++){state(`Analizando documento · pasada ${i+1} de ${passes.length}…`);await w.setParameters({tessedit_pageseg_mode:passes[i][1],preserve_interword_spaces:'1'});const r=await w.recognize(await variant(file,passes[i][0]));const text=r?.data?.text||'';if(text.trim())all.push(text);const merged=all.join('\n');const parsed=mode==='keys'?parseVehicle(merged):parseIdentity(merged);if(score(parsed)>score(best))best=parsed;if((mode==='keys'&&score(best)>=3)||(mode==='identity'&&score(best)>=6))break;}if($('scanText'))$('scanText').value=all.join('\n');return best;}

async function selected(input){const file=input?.files?.[0];if(!file)return;lastFile=file;lastDetected={};const p=$('scanPreview');if(p){p.src=URL.createObjectURL(file);p.classList.remove('hidden');}try{state('Preparando lectura estricta…');const x=await recognize(file);applyDetected(x,false);}catch(e){console.error(e);state('No se pudo leer automáticamente. No se ha rellenado ningún dato dudoso. Repite la fotografía.');}}
function choose(){const i=$('scanFile');if(i){i.value='';i.click();}else previous.choose();}
function open(kind,target){mode=kind==='keys'?'keys':'identity';who=target==='additional'?'additional':'main';lastFile=null;lastDetected={};previous.open(kind,target);setTimeout(()=>{if($('scanHelp'))$('scanHelp').textContent=mode==='keys'?'Fotografía el llavero de frente, cerca y con buena luz. Solo se aplicarán matrícula, modelo, combustible o grupo cuando pasen validaciones estrictas.':'Fotografía el permiso completo, recto y sin reflejos. El sistema compara varias lecturas y solo escribe campos que superan validaciones estrictas.';state('Escáner V2 preparado. No escribirá textos dudosos.');},0);}
function apply(){if(applyDetected(lastDetected,true))return;const text=$('scanText')?.value||'';const x=mode==='keys'?parseVehicle(text):parseIdentity(text);applyDetected(x,true);}

window.LariosScanner={...previous,open,choose,selected,apply};
console.log('Larios scanner smart v2 loaded');
})();
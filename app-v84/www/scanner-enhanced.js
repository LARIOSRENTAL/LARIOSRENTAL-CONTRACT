(function(){
'use strict';
if(!window.LariosScanner)return;

const original={...window.LariosScanner};
const $=id=>document.getElementById(id);
let scanKind='identity';
let scanWho='main';
let currentFile=null;
let detectedFields={};
let worker=null;

function state(msg){const el=$('scanState');if(el)el.textContent=msg||'';}
function field(id,value){
  if(value==null||value==='')return false;
  const el=$(id);if(!el)return false;
  el.value=String(value).trim();
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function upper(v){return clean(v).toUpperCase();}
function dateISO(v){
  const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if(!m)return'';
  let y=m[3];if(y.length===2)y=(Number(y)>35?'19':'20')+y;
  return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function documentNo(text){
  const t=upper(text).replace(/\s+/g,'');
  const nie=t.match(/\b[XYZ]\d{7}[A-Z]\b/);if(nie)return nie[0];
  const dni=t.match(/\b\d{8}[A-Z]\b/);if(dni)return dni[0];
  const passport=(upper(text).match(/(?:PASSPORT|PASAPORTE|DOCUMENT(?:O)?(?:\s+NO)?|ID)\s*[:#.-]?\s*([A-Z0-9]{6,12})/i)||[])[1];
  return passport||'';
}
function labelValue(text,label,nextLabels){
  const flat=String(text||'').replace(/\r/g,' ').replace(/\n/g,' ');
  const stop=(nextLabels||['1','2','3','4a','4b','4c','5','7','9']).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const lab=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp('(?:^|\\s)'+lab+'\\s*[.)]?\\s*[:;-]?\\s*(.*?)(?=\\s+(?:'+stop+')\\s*[.)]?\\s*[:;-]?|$)','i');
  return clean((flat.match(re)||[])[1]);
}
function cleanName(v){
  return clean(String(v||'').replace(/\b(?:3|4a|4b|4c|5|7|9)\s*[.)]?.*$/i,'').replace(/[^A-Za-zÀ-ÿ' -]/g,' '));
}
function detectCountry(text){
  const t=upper(text);
  const map=[
    ['ESPAÑA',/ESPAÑA|SPAIN|PERMISO DE CONDUCCI[ÓO]N|REINO DE ESPAÑA/],
    ['ALEMANIA',/DEUTSCHLAND|FÜHRERSCHEIN|FUHRERSCHEIN|FUEHRERSCHEIN/],
    ['AUSTRIA',/ÖSTERREICH|OSTERREICH/],['FRANCIA',/FRANCE|PERMIS DE CONDUIRE/],
    ['ITALIA',/ITALIA|PATENTE DI GUIDA/],['PORTUGAL',/PORTUGAL/],['BÉLGICA',/BELGIQUE|BELGIE|BELGIUM/],
    ['PAÍSES BAJOS',/NEDERLAND|NETHERLANDS/],['POLONIA',/POLSKA|PRAWO JAZDY/],['RUMANIA',/ROMANIA/],
    ['ARGENTINA',/ARGENTINA|LICENCIA NACIONAL DE CONDUCIR/]
  ];
  for(const [name,re] of map)if(re.test(t))return name;
  return'';
}
function euDriver(text){
  const out={};
  const one=cleanName(labelValue(text,'1'));
  const two=cleanName(labelValue(text,'2'));
  const three=labelValue(text,'3');
  const a=labelValue(text,'4a');
  const b=labelValue(text,'4b');
  const five=labelValue(text,'5');
  if(one||two)out.name=clean([two,one].filter(Boolean).join(' '));
  if(dateISO(three))out.birth=dateISO(three);
  if(dateISO(a))out.issue=dateISO(a);
  if(dateISO(b))out.expiry=dateISO(b);
  const lic=(upper(five).match(/[A-Z0-9-]{5,18}/)||[])[0];if(lic)out.license=lic;
  out.country=detectCountry(text);
  return out;
}
function labelled(text,labels){
  const lines=String(text||'').split(/\n+/).map(clean).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    const n=upper(lines[i]);
    for(const label of labels){
      const L=upper(label);
      const pos=n.indexOf(L);
      if(pos<0)continue;
      let v=clean(lines[i].slice(pos+label.length).replace(/^\s*[:#.-]\s*/,''));
      if(v&&upper(v)!==L)return v;
      if(lines[i+1])return lines[i+1];
    }
  }
  return'';
}
function parseIdentity(text){
  const t=upper(text);const out={};
  const isLicence=/DRIVING LICEN[CS]E|PERMISO DE CONDUC|F[ÜU]HRERSCHEIN|PATENTE DI GUIDA|PERMIS DE CONDUIRE|PRAWO JAZDY|LICENCIA.*CONDUCIR/i.test(t)||/\b4a\b.*\b4b\b/i.test(t);
  if(isLicence){Object.assign(out,euDriver(text));}
  const doc=documentNo(text);if(doc)out.document=doc;
  if(!out.name){
    const surname=cleanName(labelled(text,['APELLIDOS','SURNAME','LAST NAME','APELLIDO']));
    const given=cleanName(labelled(text,['NOMBRE','GIVEN NAMES','GIVEN NAME','FIRST NAME']));
    if(surname||given)out.name=clean([given,surname].filter(Boolean).join(' '));
  }
  if(!out.birth){const v=labelled(text,['FECHA DE NACIMIENTO','DATE OF BIRTH','BIRTH DATE','NACIMIENTO']);if(dateISO(v))out.birth=dateISO(v);}
  if(!out.issue){const v=labelled(text,['DATE OF ISSUE','FECHA DE EXPEDICIÓN','FECHA DE EXPEDICION','OTORGAMIENTO']);if(dateISO(v))out.issue=dateISO(v);}
  if(!out.expiry){const v=labelled(text,['EXPIRY DATE','DATE OF EXPIRY','FECHA DE CADUCIDAD','VENCIMIENTO']);if(dateISO(v))out.expiry=dateISO(v);}
  if(!out.license){const v=labelled(text,['LICENCE NO','LICENSE NO','Nº LICENCIA','N LICENCIA','PERMISO Nº','5.']);const x=(upper(v).match(/[A-Z0-9-]{5,18}/)||[])[0];if(x)out.license=x;}
  const nat=labelled(text,['NACIONALIDAD','NATIONALITY']);if(nat)out.nationality=clean(nat);
  const addr=labelled(text,['DOMICILIO','ADDRESS','HOME ADDRESS']);if(addr)out.address=clean(addr);
  if(!out.country)out.country=detectCountry(text);
  return out;
}
function parseVehicle(text){
  const out={};const t=upper(text);
  const plate=(t.match(/\b\d{4}\s*[BCDFGHJKLMNPRSTVWXYZ]{3}\b/)||[])[0]||(labelled(text,['MATRÍCULA','MATRICULA','REGISTRATION','PLATE']).match(/[A-Z0-9 -]{4,12}/)||[])[0];
  if(plate)out.plate=upper(plate).replace(/\s/g,'');
  const make=labelled(text,['MARCA','MAKE','BRAND']);
  const model=labelled(text,['MODELO','MODEL']);
  if(make||model)out.model=clean([make,model].filter(Boolean).join(' '));
  const fuel=labelled(text,['COMBUSTIBLE','FUEL','CARBURANTE']);
  if(/DIESEL|GAS[ÓO]LEO/i.test(fuel||t))out.fuel='DIESEL';
  else if(/GASOLINA|PETROL|UNLEADED|95\b/i.test(fuel||t))out.fuel='GASOLINA';
  const group=(t.match(/(?:GRUPO|GROUP|GRP)\s*[:#.-]?\s*([A-Z0-9-]{1,8})/)||[])[1];if(group)out.group=group;
  return out;
}
function score(f){return Object.values(f||{}).filter(v=>String(v||'').trim()).length;}
function applyFields(f,closeAfter){
  detectedFields=f||{};let n=0;
  if(scanKind==='keys'){
    n+=field('vehicle_plate',f.plate)?1:0;
    n+=field('vehicle_model',f.model)?1:0;
    n+=field('fuel_type',f.fuel)?1:0;
    n+=field('vehicle_group',f.group)?1:0;
  }else if(scanWho==='additional'){
    n+=field('additional_name',f.name)?1:0;
    n+=field('additional_driving_license',f.license||f.document)?1:0;
    n+=field('additional_birth_date',f.birth)?1:0;
    n+=field('additional_license_issue',f.issue)?1:0;
    n+=field('additional_license_expiry',f.expiry)?1:0;
    n+=field('additional_license_issued_by',f.country)?1:0;
  }else{
    n+=field('customer_name',f.name)?1:0;
    n+=field('customer_document',f.document)?1:0;
    n+=field('driving_license',f.license)?1:0;
    n+=field('customer_birth_date',f.birth)?1:0;
    n+=field('license_issue',f.issue)?1:0;
    n+=field('license_expiry',f.expiry)?1:0;
    n+=field('license_issued_by',f.country)?1:0;
    n+=field('customer_nationality',f.nationality||f.country)?1:0;
    n+=field('customer_address',f.address)?1:0;
  }
  if(window.LariosContractUX?.recalculate)window.LariosContractUX.recalculate();
  state(n?`${n} dato${n===1?'':'s'} detectado${n===1?'':'s'} y aplicado${n===1?'':'s'}. Revisa los campos antes de guardar.`:'No he podido identificar campos con suficiente seguridad. Repite la foto más cerca, recta y sin reflejos.');
  if(closeAfter&&n)original.close();
  return n;
}
async function ensureTesseract(){
  if(!window.Tesseract){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
  }
  if(!worker){
    worker=await window.Tesseract.createWorker('spa+eng',1,{logger:m=>{if(m.status==='recognizing text')state('Leyendo documento… '+Math.round((m.progress||0)*100)+'%');}});
  }
  return worker;
}
async function imageVariant(file,mode){
  const bmp=await createImageBitmap(file);
  const max=2400,scale=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,0,0,w,h);
  const im=ctx.getImageData(0,0,w,h),d=im.data;
  let mean=0;for(let i=0;i<d.length;i+=4)mean+=(d[i]*.299+d[i+1]*.587+d[i+2]*.114);mean/=Math.max(1,d.length/4);
  for(let i=0;i<d.length;i+=4){
    let g=d[i]*.299+d[i+1]*.587+d[i+2]*.114;
    g=Math.max(0,Math.min(255,(g-128)*1.55+128));
    if(mode==='threshold')g=g>(mean*.93)?255:0;
    d[i]=d[i+1]=d[i+2]=g;
  }
  ctx.putImageData(im,0,0);return c;
}
async function recognizeFile(file){
  const w=await ensureTesseract();
  const candidates=[];
  const passes=[['contrast','6'],['threshold','11']];
  for(let i=0;i<passes.length;i++){
    const [variant,psm]=passes[i];
    state(`Analizando documento · pasada ${i+1} de ${passes.length}…`);
    await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1'});
    const canvas=await imageVariant(file,variant);
    const r=await w.recognize(canvas);
    const text=r?.data?.text||'';
    if(text.trim())candidates.push(text);
    const merged=candidates.join('\n');
    const parsed=scanKind==='keys'?parseVehicle(merged):parseIdentity(merged);
    if(score(parsed)>=5||(scanKind==='keys'&&score(parsed)>=3))break;
  }
  const text=candidates.join('\n');
  if($('scanText'))$('scanText').value=text;
  return scanKind==='keys'?parseVehicle(text):parseIdentity(text);
}
async function selected(input){
  const file=input?.files?.[0];if(!file)return;
  currentFile=file;detectedFields={};
  const preview=$('scanPreview');if(preview){preview.src=URL.createObjectURL(file);preview.classList.remove('hidden');}
  try{
    state('Preparando imagen para lectura automática…');
    const f=await recognizeFile(file);
    applyFields(f,false);
  }catch(e){console.error('enhanced scanner',e);state('No se pudo completar la lectura automática: '+e.message+'. Repite la foto con el documento ocupando casi toda la imagen.');}
}
async function choose(){
  const input=$('scanFile');if(input){input.value='';input.click();return;}
  return original.choose();
}
async function upload(){
  if(!currentFile)return original.upload();
  try{
    const ext=(currentFile.name?.split('.').pop()||'jpg').toLowerCase();
    const uuid=crypto.randomUUID?crypto.randomUUID():String(Date.now());
    const path='mobile/'+new Date().toISOString().slice(0,10)+'/'+uuid+'.'+ext;
    const r=await fetch(cfg.supabaseUrl+'/storage/v1/object/documents/'+path,{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':currentFile.type||'image/jpeg','x-upsert':'false'},body:currentFile});
    if(!r.ok)throw Error(await r.text());state('Foto guardada de forma privada.');return path;
  }catch(e){alert('No se pudo guardar la imagen: '+e.message);return null;}
}
function open(kind,who){scanKind=kind==='keys'?'keys':'identity';scanWho=who==='additional'?'additional':'main';currentFile=null;detectedFields={};original.open(kind,who);setTimeout(()=>{if($('scanHelp'))$('scanHelp').textContent=scanKind==='keys'?'Haz una foto frontal y cercana del llavero. La app leerá automáticamente matrícula, modelo y combustible.':'Coloca el documento recto, sin reflejos y ocupando casi toda la foto. La app hará dos lecturas automáticas y rellenará los campos detectados.';state('Preparado para escanear automáticamente.');},0);}
function apply(){const n=applyFields(detectedFields,true);if(!n&&$('scanText')?.value){const f=scanKind==='keys'?parseVehicle($('scanText').value):parseIdentity($('scanText').value);applyFields(f,true);}}

window.LariosScanner={...original,open,choose,selected,upload,apply};
console.log('Larios enhanced scanner loaded');
})();
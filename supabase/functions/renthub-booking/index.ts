import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"https://lariosrental.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const env=(n:string)=>(Deno.env.get(n)||"").trim();
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:cors});
const norm=(v:unknown)=>String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const base=()=>(env("RENTHUB_INSTALLATION_URL")||"https://lariosrental.renthubsoftware.com").replace(/\/$/,"");
let secret=env("RENTHUB_SECRET_TOKEN"),tokenCache:any=null;

function parseMap(n:string){try{const v=JSON.parse(env(n)||"{}");return Object.fromEntries(Object.entries(v).map(([k,x])=>[norm(k),String(x)]));}catch{return{};}}
// Renthub's Partner catalogue returns category IDs, while booking/insert's
// `model` field expects an internal model ID.  These are the canonical models
// configured in Larios Rental; RENTHUB_MODEL_MAP can override them without a
// deployment if the catalogue changes.
const defaultModelMap:Record<string,string>={a:"20",b:"2",c:"3",d:"22",f:"11",g:"21",h:"19",i:"4",j:"6",k:"9",l:"7",q:"31",m1:"16",m2:"15",b1:"17",b2:"18"};
async function loadSecret(s:any,retry=true){if(secret)return secret;const{data,error}=await s.rpc("app_get_renthub_secret");if(error&&retry)return loadSecret(s,false);if(error)throw Error(`No se pudo leer la credencial Partner de Renthub: ${error.message}`);if(data)secret=String(data).trim();return secret;}
async function partnerToken(force=false){if(!force&&tokenCache&&tokenCache.expires>Date.now()+60000)return tokenCache.token;if(!secret)throw Error("Renthub secret no configurado");const r=await fetch(`${base()}/api/partner/token/${encodeURIComponent(secret)}`,{headers:{Accept:"application/json"}}),d=await r.json().catch(()=>({}));if(!r.ok||!d?.result?.token)throw Error(`Autenticación Renthub fallida (${r.status})`);tokenCache={token:d.result.token,expires:d.result.expires_at?Date.parse(d.result.expires_at):Date.now()+600000};return tokenCache.token;}
async function rh(path:string,init:RequestInit={},retry=true){const r=await fetch(`${base()}${path}`,{...init,headers:{Accept:"application/json","X-PartnerToken":await partnerToken(),...(init.headers||{})}});if(r.status===401&&retry){await partnerToken(true);return rh(path,init,false)}const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok||d?.status===false){const detail=String(d?.message||d?.error||raw||`Renthub ${r.status}`).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,500),normalized=norm(detail);if(normalized.includes("no hay vehiculos disponibles")||normalized.includes("no vehicles available"))throw Error("Renthub no tiene Free Sale configurado para este modelo, fechas y ubicación. Renthub debe activar esa disponibilidad antes de crear la reserva por API.");throw Error(detail);}return d;}
function groupName(c:unknown){const v=norm(c).replace(/^grupo\s+/,"");return({"50cc":"m1","125cc":"m2","bicicleta":"b1","e-bike":"b2","ebike":"b2"} as any)[v]||v;}
function pricelist(c:any){const m=parseMap("RENTHUB_PRICELIST_MAP"),t=c.season_94?"94":"78";return m[t]||m[`tarifa ${t}`]||(c.season_94?"2":"1");}
function splitName(full:unknown){const p=String(full||"").trim().split(/\s+/).filter(Boolean);return{name:p.shift()||"Pendiente",surname:p.join(" ")||"Larios Rental"};}
function splitPhone(value:unknown){
  let raw=String(value||"").trim();
  if(/^00\d+/.test(raw))raw="+"+raw.slice(2);
  let digits=raw.replace(/\D/g,"");
  if(!raw.startsWith("+")){
    if(digits.length===9)return{prefix:"34",mobile:digits};
    return{prefix:"34",mobile:"600000000"};
  }
  const callingCodes=["1","7","20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49","51","52","53","54","55","56","57","58","60","61","62","63","64","65","66","81","82","84","86","90","91","92","93","94","95","98","211","212","213","216","218","220","221","222","223","224","225","226","227","228","229","230","231","232","233","234","235","236","237","238","239","240","241","242","243","244","245","246","248","249","250","251","252","253","254","255","256","257","258","260","261","262","263","264","265","266","267","268","269","290","291","297","298","299","350","351","352","353","354","355","356","357","358","359","370","371","372","373","374","375","376","377","378","380","381","382","383","385","386","387","389","420","421","423","500","501","502","503","504","505","506","507","508","509","590","591","592","593","594","595","596","597","598","599","670","672","673","674","675","676","677","678","679","680","681","682","683","685","686","687","688","689","690","691","692","850","852","853","855","856","880","886","960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977","992","993","994","995","996","998"].sort((a,b)=>b.length-a.length);
  const code=callingCodes.find(x=>digits.startsWith(x));
  const mobile=code?digits.slice(code.length):"";
  if(!code||mobile.length<6||mobile.length>12)return{prefix:"34",mobile:"600000000"};
  return{prefix:code,mobile};
}
const amount=(v:unknown)=>Number(String(v??"0").trim().replace(/\s/g,"").replace(",","."));
function netFromGross(v:unknown,vatValue:unknown){const gross=amount(v),vat=Math.max(0,amount(vatValue));return Number.isFinite(gross)&&vat>0?gross/(1+vat/100):gross;}
function pricingCategoryForGroup(group:unknown){
  const g=groupName(group);
  if(g==="m1")return "50cc";
  if(g==="m2")return "125cc";
  if(g==="b1")return "BICICLETA";
  if(g==="b2")return "E-BIKE";
  return g?("Grupo "+String(g).toUpperCase()):"";
}
function tariffBaseGross(row:any,daysValue:unknown,quantityValue:unknown,season94:boolean){
  const days=Math.max(1,Math.floor(amount(daysValue)||1));
  const quantity=["bicicleta","e-bike"].includes(norm(row?.category))?Math.max(1,Math.floor(amount(quantityValue)||1)):1;
  let gross=0;
  if(String(row?.pricing_type||"")==="daily_tiers"){
    const daily=days<=3?amount(row?.tier_1_3_daily):days<=7?amount(row?.tier_4_7_daily):amount(row?.tier_8_plus_daily);
    gross=daily*days*quantity;
  }else{
    gross=days<=7?amount(row?.["day_"+days]):amount(row?.day_7)+amount(row?.extra_day)*(days-7);
    gross*=quantity;
  }
  if(season94)gross*=1+Math.max(0,amount(row?.season_94_markup||20))/100;
  return Math.round(gross*100)/100;
}
async function resolveBaseTariff(actor:any,c:any,payload:any){
  const category=pricingCategoryForGroup(c.category||payload.vehicle_group);
  const {data,error}=await actor.from("pricing").select("*").eq("active",true);
  if(error)throw Error("No se pudo consultar la tarifa base de Larios Rental: "+error.message);
  const row=(data||[]).find((x:any)=>norm(x?.category)===norm(category));
  if(!row)throw Error("No hay una tarifa activa configurada para "+(category||c.category||"este grupo")+". No se enviará un precio inventado a Renthub.");
  const season94=!!c.season_94||payload.tariff94===true||String(payload.tariff94||"").toLowerCase()==="true";
  const gross=tariffBaseGross(row,c.rental_days||payload.rental_days,c.quantity||payload.vehicle_quantity,season94);
  if(!Number.isFinite(gross)||gross<=0)throw Error("La tarifa base de "+category+" no devolvió un precio válido. No se enviará la reserva a Renthub sin precio.");
  return {gross,row,category,season94};
}
function partnerPaymentMethod(value: unknown) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "efectivo" || key === "cash") return "cash";
  if (key === "tarjeta" || key === "credit_card" || key === "credit card") return "credit_card";
  if (key === "transferencia" || key === "bank_transfer" || key === "bank transfer") return "bank_transfer";
  return "";
}
async function requireWrite(p:PromiseLike<any>,label:string){const r=await p;if(r?.error)throw Error(`${label}: ${r.error.message}`);return r;}
const internalLocationCatalog = [{"id":"124","name":"Larios Malaga"},{"id":"6","name":"ALCAZABA PREMIUM"},{"id":"102","name":"LA MUNDIAL APARTAMENTOS"},{"id":"45","name":"Oficentro Apartamentos Suites"},{"id":"120","name":"AUTOCARAVANAS LA CALA"},{"id":"8","name":"Atarazanas Málaga Boutique Hotel"},{"id":"146","name":"PALACIO DE LA TINTA"},{"id":"36","name":"Málaga Centro B&B HOTEL"},{"id":"11","name":"Barceló Málaga"},{"id":"82","name":"Benhostone"},{"id":"136","name":"EUROSTARS MÁLAGA"},{"id":"103","name":"Malaga Feeling Apartment"},{"id":"127","name":"Living Malaga Apart"},{"id":"125","name":"Ibis Hotel Málaga Centro"},{"id":"128","name":"Los flamencos Apart"},{"id":"96","name":"DOMUS HOSTAL"},{"id":"117","name":"Picasso Apartments"},{"id":"75","name":"CAMPER AREA MH EL RINCON (Málaga)"},{"id":"76","name":"CASA EL MORISCO"},{"id":"14","name":"Castillo Santa Catalina"},{"id":"15","name":"Casual del Mar Málaga"},{"id":"83","name":"Chinitas Boutique Bellavista"},{"id":"85","name":"City Expert CISTER"},{"id":"90","name":"City Expert Calle Granada"},{"id":"93","name":"City Expert CALLE GRANADA"},{"id":"88","name":"City Expert Málaga Estación Autobuses"},{"id":"94","name":"City Expert ESTACIÓN AUTOBUSES"},{"id":"89","name":"City Expert Muelle Heredia"},{"id":"92","name":"City Expert MUELLE HEREDIA"},{"id":"126","name":"El Museo Suites"},{"id":"112","name":"El Nogal Home"},{"id":"54","name":"El Riad Andaluz"},{"id":"7","name":"ASTORIA HOTEL"},{"id":"20","name":"DORMA"},{"id":"121","name":"Fay Hotels Victoria Beach (Elimar)"},{"id":"21","name":"Feel Hostels City Center"},{"id":"61","name":"Soho Feel Hostels Malaga"},{"id":"80","name":"Villa Buenavista Malaga"},{"id":"106","name":"Flat Málaga Centro"},{"id":"43","name":"Miramar Gran Hotel"},{"id":"68","name":"Trebol H-A Hotel"},{"id":"22","name":"H10 Croma Málaga"},{"id":"134","name":"HAMPTON BY HILTON"},{"id":"23","name":"Hilton Garden Inn Málaga"},{"id":"24","name":"Holiday Inn Express Malaga Airport"},{"id":"30","name":"Las Acacias Hostal"},{"id":"110","name":"Moscatel Hostal"},{"id":"113","name":"Nomadas Hotel Boutique"},{"id":"25","name":"HOTEL BRO"},{"id":"12","name":"California Hotel"},{"id":"13","name":"Carlos V Hotel"},{"id":"16","name":"Catalonia Hotel"},{"id":"139","name":"Hotel Catalonia Puerta del Mar"},{"id":"17","name":"del Pintor Hotel"},{"id":"18","name":"Hotel Don Curro"},{"id":"97","name":"Don Paco Hotel"},{"id":"98","name":"Elcano Hotel"},{"id":"19","name":"Eliseos Hotel"},{"id":"99","name":"Goartin Hotel"},{"id":"26","name":"Husa Guadalmedina Hotel"},{"id":"101","name":"ibis Budget VELAZQUEZ Hotel"},{"id":"27","name":"Ilunion hotel"},{"id":"70","name":"Larios Málaga Hotel"},{"id":"37","name":"Malaga Palacio AC Hotel by Marriott"},{"id":"116","name":"Picasso Hotel Málaga"},{"id":"39","name":"Málaga Premium Hotel"},{"id":"122","name":"Maria Cristina Hotel"},{"id":"44","name":"Hotel Molina Lario"},{"id":"109","name":"Hotel Monte Victoria"},{"id":"74","name":"Calabahía Hotel Moon Dreams"},{"id":"35","name":"Hotel MS Maestranza"},{"id":"48","name":"Palacete de Álamos Hotel"},{"id":"79","name":"Rincón Sol Hotel"},{"id":"9","name":"Málaga Centro HOTEL"},{"id":"10","name":"Bahía Hotel Soho Boutique"},{"id":"60","name":"Soho Boutique Equitativa Hotel"},{"id":"31","name":"Las Vegas Hotel Soho Boutique"},{"id":"33","name":"Los Naranjos Hotel Soho Boutique"},{"id":"57","name":"Soho Boutique Hotel"},{"id":"58","name":"Soho Boutique Urban Hotel"},{"id":"63","name":"Solymar Hotel"},{"id":"65","name":"Sur Hotel Malaga"},{"id":"29","name":"Vincci Larios Diez Hotel"},{"id":"72","name":"Zenit Hotel Malaga"},{"id":"73","name":"Zeus Hotel"},{"id":"100","name":"ibis budget Málaga Centro"},{"id":"34","name":"Malabar ICON"},{"id":"77","name":"Imo Swiss Golf Beach"},{"id":"28","name":"Imosur Estacion consigna"},{"id":"104","name":"La Casa Azul"},{"id":"5","name":"Oficina Principal [DESCUENTO - 5%] - Málaga Centro, Pasaje Noblejas 8, Málaga, España"},{"id":"32","name":"Lock And Relax -Luggage storage (Centro-Alameda -C1 line)"},{"id":"108","name":"Lodgingmalaga Plaza de la Constitucion"},{"id":"105","name":"Madeinterranea"},{"id":"130","name":"Madeinterranea Suites"},{"id":"95","name":"Club Hispánico"},{"id":"81","name":"Málaga Nostrum"},{"id":"38","name":"Málaga Planners"},{"id":"40","name":"Málaga Sun Apartments"},{"id":"107","name":"MálagaLodge"},{"id":"41","name":"Marbesol"},{"id":"42","name":"Mariposa Hotel 4 estrellas Málaga centro"},{"id":"143","name":"ME MALAGA"},{"id":"78","name":"Motos Cerezo"},{"id":"114","name":"NONO APARTAMENTOS"},{"id":"64","name":"Novotel Suites Málaga Centro"},{"id":"46","name":"Only YOU Hotel Málaga"},{"id":"47","name":"Pacifico Apartments"},{"id":"49","name":"Palacio Solecio"},{"id":"50","name":"Parador de Málaga Gibralfaro"},{"id":"51","name":"Parador de Málaga Golf Club"},{"id":"84","name":"Chinitas Hostal"},{"id":"119","name":"Villa Amalia Suites"},{"id":"52","name":"Petit Palace Plaza Málaga"},{"id":"53","name":"QQ Bikes"},{"id":"55","name":"Room Mate Valeria Hotel"},{"id":"56","name":"Sercotel Rosaleda Málaga"},{"id":"69","name":"Sercotel Tribuna Málaga"},{"id":"59","name":"Soho Boutique Colón Hotel"},{"id":"62","name":"Sol Maestranza"},{"id":"135","name":"Staybridge Suites Malaga"},{"id":"138","name":"Staybridge Suites Malaga"},{"id":"66","name":"Tandem Soho Suites"},{"id":"67","name":"TOC Hostel Málaga"},{"id":"118","name":"Villa Alicia Guest House"},{"id":"71","name":"Vincci Posada del Patio Hotel"},{"id":"86","name":"EASY PARKING MÁLAGA aeropuerto Costa del Sol, aparcamiento CUBIERTO 24h | iPark"},{"id":"2","name":"Oficina Málaga - Aeropuerto"},{"id":"91","name":"Cenacheros house"},{"id":"87","name":"City Expert Cister"},{"id":"140","name":"Cristine Bedfor Guest Houses Málaga"},{"id":"3","name":"Oficina Málaga - Estación de Tren"},{"id":"141","name":"Eurostars Málaga"},{"id":"137","name":"HAMPTON"},{"id":"129","name":"DOMUS HOTEL"},{"id":"145","name":"Hotel Serenay Málaga"},{"id":"131","name":"AUTOCARAVANA LA CALA"},{"id":"142","name":"SERENAY"},{"id":"4","name":"Oficina Málaga - Estación de Cruceros"},{"id":"132","name":"Otra Ubicación - [Indique dirección en -Observaciones-]"}];
const internalLocationAliases = {"ofi":"5","oficina":"5","oficina principal":"5","pasaje noblejas":"5","agp":"2","aeropuerto":"2","ave":"3","estacion":"3","estacion tren":"3","maria zambrano":"3","cruceros":"4","crucero":"4","puerto":"4","posada":"71","vincci posada":"71","vincci posada del patio":"71","miramar":"43","gran hotel miramar":"43","ilunion":"27","rinconsol":"79","rincon sol":"79","california":"12","croma":"22","h10 croma":"22","novotel":"64","only you":"46","palacio tinta":"146","solecio":"49","palacio solecio":"49","atarazanas":"8","guadalmedina":"26","hilton":"23","hilton garden":"23","maestranza":"35","ms maestranza":"35","vegas":"31","las vegas":"31","naranjos":"33","los naranjos":"33","malabar":"34","rosaleda":"56","mariposa":"42","larios 10":"29","larios diez":"29","b&b":"36","bb":"36","barcelo":"11","benhostone":"82","club hispanico":"95","dorma":"20","elimar":"121","hampton":"134","ibis budget":"100","me malaga":"143","bro":"25","hotel bro":"25","cister city":"85","city expert cister":"85","cister":"85","flamencos":"128","casa azul":"104","autocaravanas la cala":"120","camper cala":"75","camper la cala":"75"};
function cleanLocationText(value:unknown){
  return norm(String(value||"")).replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function locationAliasId(value:unknown){
  const key=cleanLocationText(value);
  if(!key)return "";
  if(internalLocationAliases[key])return String(internalLocationAliases[key]);
  for(const [alias,id] of Object.entries(internalLocationAliases)){
    if(key===alias||key.includes(alias))return String(id);
  }
  const custom=parseMap("RENTHUB_LOCATION_MAP");
  return String(custom[key]||"");
}
function bestLocation(value:unknown,locations:any[]){
  const raw=String(value||"").trim(),key=cleanLocationText(raw),alias=locationAliasId(raw);
  if(alias){
    const found=locations.find((x:any)=>String(x?.id)===alias);
    return {id:alias,address:"",matched:found?.name||raw,exact:true};
  }
  if(key){
    let best:any=null,bestScore=0;
    for(const x of locations||[]){
      const fields=[x?.name,x?.code,x?.address,x?.complete_address].map(cleanLocationText).filter(Boolean);
      for(const f of fields){
        let score=0;
        if(f===key)score=100;
        else if(f.includes(key)&&key.length>=4)score=80+Math.min(15,key.length/3);
        else if(key.includes(f)&&f.length>=5)score=65+Math.min(15,f.length/3);
        else {
          const words=key.split(" ").filter((w)=>w.length>=4);
          const hits=words.filter((w)=>f.includes(w)).length;
          if(words.length&&hits)score=(hits/words.length)*60;
        }
        if(score>bestScore){bestScore=score;best=x;}
      }
    }
    if(best&&bestScore>=58)return{id:String(best.id),address:"",matched:String(best.name||""),exact:bestScore>=80};
  }
  return{id:env("RENTHUB_OTHER_LOCATION_ID")||"132",address:raw,matched:"Otra Ubicacion",exact:false};
}
async function mappings(c:any){
  const[cats,params,locs]=await Promise.all([
    rh("/module/rental/api/partner/config/categories"),
    rh("/module/rental/api/partner/config/parameters"),
    rh("/module/rental/api/partner/locations"),
  ]);
  const items=Array.isArray(cats?.result)?cats.result:[],apiLocations=Array.isArray(locs?.result)?locs.result:[],locations=[...internalLocationCatalog,...apiLocations.filter((x:any)=>!internalLocationCatalog.some((y:any)=>String(y.id)===String(x?.id)))],target=groupName(c.category),cat=items.find((x:any)=>norm(x?.name)===target),models={...defaultModelMap,...parseMap("RENTHUB_MODEL_MAP")};
  const payload=c.app_payload||{};
  const pickupRaw=String(c.delivery_location||payload.pickup_location||"").trim();
  const dropoffRaw=String(c.return_location||payload.return_location||pickupRaw).trim();
  const pickup=bestLocation(pickupRaw,locations),dropoff=bestLocation(dropoffRaw,locations);
  return{model:String(models[target]||""),categoryId:String(cat?.id||""),group:target,pickup:pickup.id,dropoff:dropoff.id,pickupAddress:pickup.address,dropoffAddress:dropoff.address,pickupMatched:pickup.matched,dropoffMatched:dropoff.matched,minimum:String(params?.result?.opening?.min_date||"").slice(0,16),opening:params?.result?.opening||{}};
}
function addIsoDays(isoDate:string,days:number){
  const d=new Date(isoDate+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function weekdayKey(isoDate:string){
  const d=new Date(isoDate+"T12:00:00Z");
  const n=d.getUTCDay();
  return String(n===0?7:n);
}
function firstOpeningAtOrAfter(opening:any,fromDateTime:string,endDateTime:string){
  const timetable=opening?.timetable&&typeof opening.timetable==="object"?opening.timetable:{};
  const closed=new Set((Array.isArray(opening?.closed_at)?opening.closed_at:[]).map((x:any)=>String(x).slice(0,10)));
  const fromDate=String(fromDateTime).slice(0,10);
  for(let offset=0;offset<14;offset++){
    const date=addIsoDays(fromDate,offset);
    if(closed.has(date)) continue;
    const day=weekdayKey(date);
    const candidates:string[]=[];
    for(const item of Object.values(timetable) as any[]){
      const slots=Array.isArray(item?.weeklySchedule?.[day])?item.weeklySchedule[day]:[];
      for(const slot of slots){
        const from=String(slot?.from||"").slice(0,5);
        if(/^\d{2}:\d{2}$/.test(from)) candidates.push(date+" "+from);
      }
    }
    candidates.sort();
    for(const candidate of candidates){
      if(candidate>=fromDateTime && candidate<endDateTime) return candidate;
    }
  }
  return "";
}

function minuteKey(v:unknown){return String(v||"").replace("T"," ").slice(0,16);}
function digits(v:unknown){return String(v||"").replace(/\D/g,"");}
function bookingCode(v:any){return String(v?.code||v?.booking_code||v?.pm_code||v?.reservation_code||"").trim();}
function bookingStart(v:any){return String(v?.start_datetime||v?.start||v?.pm_start_datetime||v?.pickup_datetime||v?.date_start||"").trim();}
function collectBookings(v:any,out:any[]=[]):any[]{
  if(v==null)return out;
  if(Array.isArray(v)){for(const x of v)collectBookings(x,out);return out;}
  if(typeof v!=="object")return out;
  const code=bookingCode(v),start=bookingStart(v);
  if(code&&start)out.push(v);
  for(const x of Object.values(v))collectBookings(x,out);
  return out;
}
function candidateCustomerName(v:any){
  const direct=[
    v?.customer?.full_name,
    v?.customer?.name&&v?.customer?.surname?`${v.customer.name} ${v.customer.surname}`:"",
    v?.customer_name,
    v?.full_name,
    v?.name&&v?.surname?`${v.name} ${v.surname}`:"",
  ].filter(Boolean).map(norm);
  return direct.filter(Boolean);
}
function candidateCustomerPhones(v:any){
  return [
    v?.customer?.mobile,v?.customer?.phone,v?.customer?.telephone,
    v?.mobile,v?.phone,v?.telephone,v?.customer_mobile,v?.customer_phone
  ].map(digits).filter(Boolean);
}
function exactPhoneMatch(candidate:any,targetRaw:string){
  const target=digits(targetRaw);
  if(target.length<9)return false;
  return candidateCustomerPhones(candidate).some(x=>x.length>=9&&x.slice(-9)===target.slice(-9));
}
function exactNameMatch(candidate:any,targetRaw:string){
  const target=norm(targetRaw);
  if(!target||target==="pendiente larios rental"||target==="seguro"||target==="cliente pendiente larios rental")return false;
  return candidateCustomerName(candidate).includes(target);
}
function scalarIds(values:any[]){
  const out:string[]=[];
  const add=(v:any)=>{if(v===null||v===undefined||v==="")return;if(typeof v==="object"){if(v.id!==undefined)add(v.id);if(v.value!==undefined)add(v.value);return;}const s=String(v).trim();if(s)out.push(s);};
  for(const v of values)add(v);
  return [...new Set(out)];
}
function candidateModelIds(v:any){return scalarIds([
  v?.model,v?.model_id,v?.vehicle_model,v?.vehicle_model_id,v?.pm_model_id,v?.pm_vm_id,
  v?.category_model_id,v?.model?.id,v?.vehicle_model?.id,v?.vehicle?.model_id,v?.vehicle?.model?.id
]);}
function candidateCategoryIds(v:any){return scalarIds([
  v?.category,v?.category_id,v?.vehicle_category,v?.vehicle_category_id,v?.pm_category_id,
  v?.category?.id,v?.vehicle_category?.id,v?.vehicle?.category_id,v?.vehicle?.category?.id
]);}
function candidatePickupIds(v:any){return scalarIds([
  v?.pickup_location,v?.pickup_location_id,v?.pm_pickup_location_id,v?.ritiro,
  v?.pickup?.id,v?.pickup_location?.id,v?.start_location_id,v?.location_start
]);}
function candidatePrices(v:any){
  return [v?.total,v?.total_amount,v?.amount,v?.rental_total,v?.rental_amount,v?.price,v?.booking_total,v?.pm_total,v?.pm_amount]
    .map(amount).filter((x:number)=>Number.isFinite(x)&&x>0);
}
function exactPriceMatch(candidate:any,targetPrice:number){
  if(!Number.isFinite(targetPrice)||targetPrice<=0)return false;
  return candidatePrices(candidate).some((x:number)=>Math.abs(x-targetPrice)<=0.05);
}
function sameDateTime(v:any,targetStart:string){
  return minuteKey(bookingStart(v))===minuteKey(targetStart);
}
let userTokenCache="";
async function userToken(force=false){
  const configuredApiKey=env("RENTHUB_USER_API_KEY"),email=env("RENTHUB_USER_API_EMAIL"),password=env("RENTHUB_USER_API_PASSWORD");
  if(!force&&configuredApiKey)return configuredApiKey;
  if(!force&&userTokenCache)return userTokenCache;
  if(force&&(!email||!password)&&configuredApiKey)return configuredApiKey;
  if(!email||!password)throw Error("Renthub User API no configurada");
  const form=new FormData();form.set("email",email);form.set("password",password);
  const response=await fetch(`${base()}/api/auth/login`,{method:"POST",headers:{Accept:"application/json"},body:form});
  const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
  const headerToken=response.headers.get("X-UserAuthToken")||response.headers.get("X-Auth-Token")||response.headers.get("Authorization")||"";
  userTokenCache=String(data?.result?.token||data?.token||headerToken).replace(/^Bearer\s+/i,"");
  if(!response.ok||!userTokenCache)throw Error(`Renthub User API authentication failed (${response.status})`);
  return userTokenCache;
}
async function userApiFetch(path:string,init:RequestInit={},retry=true){
  const response=await fetch(`${base()}${path}`,{...init,headers:{Accept:"application/json","X-UserAuthToken":await userToken(),...(init.headers||{})}});
  if(response.status===401&&retry){userTokenCache="";await userToken(true);return userApiFetch(path,init,false);}
  const raw=await response.text();let data:any={};try{data=raw?JSON.parse(raw):{};}catch{data={};}
  if(!response.ok||data?.status===false)throw Error(`Renthub User API ${response.status} en ${path.split("?")[0]}`);
  return data;
}
async function findExistingBookings(target:{phone:string,name:string,start:string,price:number,date:string}){
  const byCode=new Map<string,any>();
  let complete=false,partnerChecked=false;
  const inspect=(rows:any[],source:string)=>{
    for(const v of rows){
      if(!sameDateTime(v,target.start))continue;
      const phoneMatch=exactPhoneMatch(v,target.phone),nameMatch=exactNameMatch(v,target.name),priceMatch=exactPriceMatch(v,target.price);
      if(!(phoneMatch||nameMatch||priceMatch))continue;
      const code=bookingCode(v);
      if(code)byCode.set(code,{...v,_lr_phone_match:phoneMatch,_lr_name_match:nameMatch,_lr_price_match:priceMatch,_lr_source:source});
    }
  };

  try{
    const q=new URLSearchParams({page:"1",per_page:"50",inserted_after:new Date(Date.now()-1000*60*60*24*30).toISOString().slice(0,16).replace("T"," ")});
    inspect(collectBookings(await rh("/module/rental/api/partner/booking/my-bookings?"+q.toString())),"partner_my");
    partnerChecked=true;
  }catch(e){console.warn("Renthub Partner duplicate precheck failed",e);}

  try{
    const q=new URLSearchParams({page:"1",per_page:"50",start_date_from:target.date,start_date_to:target.date});
    const data=await userApiFetch("/module/rental/api/v1/booking?"+q.toString());
    inspect(collectBookings(data),"user_api");
    complete=true;
  }catch(e){
    console.warn("Renthub User API duplicate precheck failed",e);
  }

  return {matches:[...byCode.values()],complete,partnerChecked};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method==="GET"){
    const healthJwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    const healthService=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:healthAuth,error:healthError}=await healthService.auth.getUser(healthJwt);
    if(!healthJwt||healthError||healthAuth.user?.app_metadata?.role!=="admin")return json({error:"Solo administrador"},403);
    try{const service=healthService;await loadSecret(service);await partnerToken(true);return json({ready:true,partner_api:true});}
    catch(e){console.error(JSON.stringify({event:"renthub_partner_health",error:String((e as Error)?.message||e)}));return json({ready:false,partner_api:false,error:"Renthub Partner API failed"},503);}
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>({})),action=String(body.action||"create"),id=String(body.contract_id||"");
  const bridge=action==="create_whatsapp"||action==="amend_whatsapp";
  if(!bridge&&!jwt)return json({error:"Authentication required"},401);
  if(bridge&&!body.import_token)return json({error:"Token del puente obligatorio"},403);
  let actor:any=service;
  if(!bridge){
    const {data:auth,error}=await service.auth.getUser(jwt);
    if(error||!auth.user||auth.user.app_metadata?.role!=="admin")return json({error:"Solo un administrador puede enviar reservas a Renthub"},403);
    actor=createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${jwt}`}}});
  }
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Contrato no válido"},400);
  await loadSecret(service);if(!secret)return json({error:"Renthub no está configurado"},503);
  const{data:c,error:ce}=await service.from("contracts").select("*").eq("id",id).single();
  if(ce||!c)return json({error:"Contrato no encontrado"},404);
  const bridgeAmend=bridge&&(action==="amend_whatsapp"||!!c.app_payload?.whatsapp_amendment_message_id);
  if(bridge){
    const p=c.app_payload||{};
    if(p.source!=="whatsapp_group"||!p.source_whatsapp_group||!p.source_whatsapp_message_id||
       !body.import_token||p.renthub_local_only===true||p.time_pending===true||p.time_inferred===true||
       c.status!=="draft"||c.pdf_path||p.renthub_created_from_web===true)
      return json({error:"Reserva WhatsApp no apta para creación automática"},409);
    const bridgeVerifier=createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:verified,error:verifyError}=await bridgeVerifier.rpc("larios_whatsapp_process",{
      p_chat:p.source_whatsapp_group,p_id:p.source_whatsapp_message_id,p_token:String(body.import_token)
    });
    if(verifyError||verified?.status!=="created"||
       String(verified?.contract_id)!==String(id) &&
       !(Number(p.source_whatsapp_unit_count)>1 && Number(p.source_whatsapp_unit_index)>1))
      return json({error:"Origen WhatsApp no autorizado"},403);
    // For multi-vehicle messages, the inbox stores the first contract ID. The
    // contract's own source fields and token-scoped inbox row bind each unit.
    const madrid=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    if(`${c.delivery_date} ${String(c.delivery_time||"").slice(0,5)}`<=madrid)
      return json({error:"La recogida ya no es futura"},409);
    if(c.renthub_sync_status==="creating"&&!bridgeAmend)return json({error:"Creación ya iniciada; verificar en Renthub antes de reintentar"},409);
    if(!bridgeAmend&&c.renthub_sync_status==="failed" &&
       !norm(c.renthub_sync_error).includes("codigo internacional es obligatorio"))
      return json({error:"Error anterior pendiente de verificación en Renthub"},409);
  }
  if(action==="update")return json({error:"La actualización queda pendiente del endpoint de Renthub.",pending_endpoint:true},409);
  if(action!=="create"&&!bridge)return json({error:"Unknown action"},400);
  if(c.renthub_contract_id&&!bridgeAmend)return json({created:true,already_created:true,external_reference:c.renthub_contract_id});
  if(bridge&&!bridgeAmend){
    let claimQuery=service.from("contracts").update({renthub_sync_status:"creating",renthub_sync_error:null})
      .eq("id",id).eq("renthub_sync_status",c.renthub_sync_status).is("renthub_contract_id",null);
    if(c.renthub_sync_status==="failed")claimQuery=claimQuery.eq("renthub_sync_error",c.renthub_sync_error);
    const claim=await claimQuery.select("id").maybeSingle();
    if(claim.error||!claim.data)return json({error:"La reserva requiere verificación antes de un nuevo intento"},409);
  }
  try{
    const map=await mappings(c),realStart=`${c.delivery_date} ${String(c.delivery_time||"").slice(0,5)}`,end=`${c.return_date} ${String(c.return_time||"").slice(0,5)}`;
    let start=realStart;
    if(map.minimum&&start<map.minimum)start=map.minimum;
    if(start>=end)throw Error(`Renthub no encuentra una hora de inicio válida anterior a la devolución ${end}`);
    if(!map.model)throw Error(`No hay mapeo Renthub para el grupo ${c.category||"sin grupo"}`);
    let customer:any=null;if(c.customer_id){const q=await service.from("customers").select("*").eq("id",c.customer_id).maybeSingle();customer=q.data||null;}
    const payload=c.app_payload||{},names=splitName(customer?.full_name||payload.customer_name||"Cliente pendiente Larios Rental"),phone=splitPhone(customer?.phone||payload.customer_phone),customerEmail=String(customer?.email||payload.customer_email||"").trim(),email=customerEmail||`sin-correo+lr-${String(c.contract_number).padStart(6,"0")}@example.invalid`;
    if(bridge && String(customer?.phone||payload.customer_phone||"").replace(/\D/g,"").length>=9 && phone.mobile==="600000000")
      throw Error("Teléfono no válido para Renthub; revisar sin sustituirlo por uno ficticio");
    const explicitGross=amount(c.rental_total)>0?amount(c.rental_total):(amount(c.total)>0?amount(c.total):0);
    const localPriceMissing=!(Number.isFinite(explicitGross)&&explicitGross>0);
    const baseTariff=localPriceMissing?await resolveBaseTariff(actor,c,payload):null;
    const rentalGross=localPriceMissing?Number(baseTariff?.gross||0):explicitGross;
    const priceSource=localPriceMissing?"base_tariff":"explicit";
    if(localPriceMissing){
      payload.rental_price=rentalGross.toFixed(2);
      payload.total=rentalGross.toFixed(2);
      payload.base_tariff_price=rentalGross.toFixed(2);
      payload.base_tariff_category=baseTariff?.category||"";
      payload.base_tariff_season_94=!!baseTariff?.season94;
      payload.price_source="base_tariff";
    }else{
      payload.price_source="explicit";
    }
    const pickupText=String(c.delivery_location||payload.pickup_location||"").trim(),dropoffText=String(c.return_location||payload.return_location||pickupText).trim();
    const pickupAddress=String(map.pickupAddress||"").trim(),dropoffAddress=String(map.dropoffAddress||"").trim();
    const form=new FormData();
    form.set("partner_reservation_code",`LR-${String(c.contract_number).padStart(6,"0")}`);
    form.set("name",names.name);form.set("surname",names.surname);
    // The app's quick reservation uses the pending customer's technical contact
    // when the real phone has not yet been supplied. Keep the local phone blank.
    if(!bridge||String(customer?.phone||payload.customer_phone||"").replace(/\D/g,"").length>=9||
       norm(customer?.full_name||payload.customer_name)==="pendiente larios rental"){
      form.set("mobile_prefix",`+${phone.prefix}`);form.set("mobile",phone.mobile);
    }
    form.set("email",email);
    form.set("model",map.model);form.set("start_datetime",start);form.set("end_datetime",end);
    form.set("pickup_location",map.pickup);form.set("dropoff_location",map.dropoff);
    const realStartParts=realStart.split(" ");
    const realDateParts=String(realStartParts[0]||"").split("-");
    const realStartLabel=realDateParts.length===3?`${realDateParts[2]}/${realDateParts[1]}/${realDateParts[0]} ${realStartParts[1]||""}`:realStart;
    const locationNotes=[
      start!==realStart?`HORA REAL DE ENTREGA A CAMBIAR: ${realStartLabel}`:"",
      pickupAddress?`RECOGIDA DEL VEHICULO EN: ${pickupText}`:"",
      dropoffAddress?`DEVOLUCION DEL VEHICULO EN: ${dropoffText}`:"",
    ].filter(Boolean).join("\n");
    if(locationNotes)form.set("notes",locationNotes);
    // Free Sale is selected by Renthub's availability rule for the Partner
    // origin. `resource`, `pm_*`, `ritiro` and `consegna` are fields from the
    // saved/internal booking form, not Partner booking/insert inputs. Sending
    // them here makes Renthub validate a concrete vehicle instead of leaving
    // the reservation unassigned.
    // Las reservas creadas por la integración no deben generar correos de confirmación.
    // Si el cliente aún no tiene email usamos un dominio reservado y no entregable,
    // nunca la cuenta info@lariosrental.com.
    form.set("booking_type","booking");form.set("send_confirmation_email","0");form.set("pricelist",pricelist(c));
    // Reserva inicial: solo grupo/modelo, fechas y lugares.
    // NO se envían matrícula/vehículo ni pago. Esos datos se envían después,
    // únicamente al pulsar "Mandar datos Renthub" desde el contrato.
    // Official Partner API field: keep the booking on the chosen model even
    // when no concrete vehicle is currently available. Renthub leaves the
    // vehicle unassigned and its Free Sale rule controls the virtual stock.
    form.set("ignore_availability","true");
    // Quick reservations always start with the real Larios Rental base tariff.
    // No zero-price or nominal/provisional amounts are sent to Renthub.
    form.set("overwrite_rental_rate",netFromGross(rentalGross,c.vat_percent).toFixed(4));
    form.set("overwrite_deposit",Math.max(0,amount(c.deposit)).toFixed(2));
    const tariffFranchise=Math.max(0,amount(baseTariff?.row?.franchise));
    const franchiseToSend=amount(c.franchise)>0?amount(c.franchise):tariffFranchise;
    if(franchiseToSend>0)form.set("overwrite_damage_franchise",franchiseToSend.toFixed(2));
    console.log(JSON.stringify({event:"renthub_booking_create",endpoint:"partner_booking_insert",availability:"renthub_freesale_rule",contract_number:c.contract_number,group:map.group,partner_category_id:map.categoryId,renthub_model_id:map.model,vehicle_assignment:"unassigned",pickup:map.pickup,dropoff:map.dropoff,pickup_match:map.pickupMatched,dropoff_match:map.dropoffMatched,fallback_pickup_text:!!pickupAddress,fallback_dropoff_text:!!dropoffAddress,price_override:true,price_source:priceSource,rental_gross:rentalGross,tariff_category:baseTariff?.category||null,tariff_season_94:baseTariff?.season94??null}));
    const currentPickup=String(map.pickup),currentDropoff=String(map.dropoff);
    const precheck=bridgeAmend?{matches:[],complete:true,partnerChecked:true}:await findExistingBookings({
      phone:String(customer?.phone||payload.customer_phone||""),
      name:String(customer?.full_name||payload.customer_name||""),
      start:realStart,
      price:Number(rentalGross||0),
      date:String(c.delivery_date||"")
    });

    // Mirror local de reservas web ya importadas: cubre las reservas que entraron
    // previamente desde la web de Renthub y ya tienen código Renthub en la app.
    try{
      const {data:localRows,error:localErr}=await service.from("contracts")
        .select("id,contract_number,delivery_date,delivery_time,total,renthub_contract_id,app_payload,customers(full_name,phone)")
        .eq("delivery_date",String(c.delivery_date||""))
        .neq("id",id)
        .not("renthub_contract_id","is",null);
      if(localErr)throw localErr;
      for(const row of (localRows||[])){
        const candidate={
          code:row.renthub_contract_id,
          start_datetime:String(row.delivery_date||"")+" "+String(row.delivery_time||"").slice(0,5),
          total:Number(row.total||0),
          customer_name:row.customers?.full_name||row.app_payload?.customer_name||"",
          customer_phone:row.customers?.phone||row.app_payload?.customer_phone||""
        };
        if(!sameDateTime(candidate,realStart))continue;
        const phoneMatch=exactPhoneMatch(candidate,String(customer?.phone||payload.customer_phone||""));
        const nameMatch=exactNameMatch(candidate,String(customer?.full_name||payload.customer_name||""));
        const priceMatch=exactPriceMatch(candidate,Number(rentalGross||0));
        if(phoneMatch||nameMatch||priceMatch){
          const code=bookingCode(candidate);
          if(code&&!precheck.matches.some((x:any)=>bookingCode(x)===code))precheck.matches.push({...candidate,_lr_phone_match:phoneMatch,_lr_name_match:nameMatch,_lr_price_match:priceMatch,_lr_source:"local_web_mirror"});
        }
      }
      if(precheck.partnerChecked)precheck.complete=true;
    }catch(e){
      console.warn("Local web mirror duplicate precheck failed",e);
    }

    const existing=precheck.matches;
    if(existing.length===1){
      const existingCode=bookingCode(existing[0]);
      if(existingCode){
        await requireWrite(actor.from("contracts").update({
          renthub_contract_id:existingCode,
          renthub_sync_status:"linked_existing",
          renthub_last_sync_at:new Date().toISOString(),
          renthub_sync_error:null,
          app_payload:{...payload,
            renthub_linked_existing_code:existingCode,
            renthub_linked_existing_at:new Date().toISOString(),
            renthub_existing_precheck:true,
            renthub_duplicate_precheck_complete:precheck.complete,
            renthub_duplicate_match_source:existing[0]?._lr_source||null,
            renthub_duplicate_match_phone:!!existing[0]?._lr_phone_match,
            renthub_duplicate_match_name:!!existing[0]?._lr_name_match,
            renthub_duplicate_match_price:!!existing[0]?._lr_price_match,
            renthub_model_id:map.model,
            renthub_pickup_location_id:map.pickup,
            renthub_dropoff_location_id:map.dropoff
          }
        }).eq("id",id),"No se pudo enlazar la reserva existente de Renthub");
        console.log(JSON.stringify({event:"renthub_booking_link_existing",contract_number:c.contract_number,code:existingCode,matches:1,match_phone:!!existing[0]?._lr_phone_match,match_name:!!existing[0]?._lr_name_match,match_price:!!existing[0]?._lr_price_match,source:existing[0]?._lr_source||null,matched_start:bookingStart(existing[0]),matched_prices:candidatePrices(existing[0])}));
        return json({created:false,linked_existing:true,external_reference:existingCode,resource:"existing_booking",group:map.group,pickup_location:map.pickup,dropoff_location:map.dropoff});
      }
    }
    if(existing.length>1){
      throw Error("Se han encontrado varias reservas de Renthub con la misma fecha y hora y coincidencia en precio, nombre o teléfono. No se crea una nueva para evitar duplicados; revisar cuál corresponde.");
    }
    if(!precheck.complete){
      throw Error("No se ha podido contrastar el listado completo de reservas actuales de Renthub. La reserva NO se crea para evitar un posible duplicado.");
    }
    let inserted:any;
    const doInsert=()=>rh("/module/rental/api/partner/booking/insert",{method:"POST",body:form});
    try{
      inserted=await doInsert();
    }catch(firstError){
      const firstMessage=firstError instanceof Error?firstError.message:String(firstError);
      const firstKey=norm(firstMessage);
      if(firstKey.includes("lista de precios no disponible en esta localidad")){
        // La ubicación real nunca se cambia por un problema de tarifa.
        // "Otra Ubicación" solo se usa en bestLocation() cuando no existe
        // coincidencia con ninguna ubicación real del catálogo de Renthub.
        form.delete("pricelist");
        console.log(JSON.stringify({
          event:"renthub_booking_pricelist_retry",
          contract_number:c.contract_number,
          pickup:currentPickup,
          dropoff:currentDropoff,
          reason:firstMessage,
          retry_without_explicit_pricelist:true
        }));
        try{
          inserted=await doInsert();
        }catch(secondError){
          const secondMessage=secondError instanceof Error?secondError.message:String(secondError);
          const secondKey=norm(secondMessage);
          if(secondKey.includes("lista de precios no disponible en esta localidad")){
            if(Number(c.contract_number)===62931){
              form.set("pickup_location","132");
              form.set("dropoff_location","132");
              const forcedNotes=[
                `RECOGIDA DEL VEHICULO EN: ${pickupText}`,
                `DEVOLUCION DEL VEHICULO EN: ${dropoffText}`,
                "UBICACION TECNICA RENTHUB: OTRA UBICACION (ID 132) SOLO PARA LR-062931"
              ].join("\n");
              form.set("notes",forcedNotes);
              console.log(JSON.stringify({event:"renthub_booking_62931_other_location_retry",contract_number:c.contract_number,pickup:"132",dropoff:"132",real_pickup:pickupText,real_dropoff:dropoffText}));
              inserted=await doInsert();
            }else{
              throw Error(`Renthub reconoce la ubicación ${map.pickupMatched||pickupText} (ID ${map.pickup}), pero no tiene una lista de precios disponible para la integración en esa ubicación. No se cambia por Otra Ubicación.`);
            }
          }
          if(secondKey.includes("no hay modelos disponibles")||secondKey.includes("no models available")){
            throw Error(`Renthub no tiene habilitado el modelo ${map.model} del grupo ${String(map.group).toUpperCase()} en la ubicación ${map.pickupMatched||pickupText} (ID ${map.pickup}). Se mantiene la ubicación real; no se sustituye por Otra Ubicación. La reserva queda guardada en Larios Rental.`);
          }
          throw secondError;
        }
      }else if(firstKey.includes("no hay modelos disponibles")||firstKey.includes("no models available")){
        throw Error(`Renthub no tiene habilitado el modelo ${map.model} del grupo ${String(map.group).toUpperCase()} en la ubicación ${map.pickupMatched||pickupText} (ID ${map.pickup}). Se mantiene la ubicación real; no se sustituye por Otra Ubicación. La reserva queda guardada en Larios Rental.`);
      }else if(firstKey.includes("oficina pudiera estar cerrada")||firstKey.includes("oficina puede estar cerrada")||firstKey.includes("office may be closed")){
        const fallbackStart=firstOpeningAtOrAfter(map.opening,start,end);
        if(!fallbackStart||fallbackStart===start)throw firstError;
        start=fallbackStart;
        form.set("start_datetime",start);
        const notes=[start!==realStart?`HORA REAL DE ENTREGA A CAMBIAR: ${realStartLabel}`:"",pickupAddress?`RECOGIDA DEL VEHICULO EN: ${pickupText}`:"",dropoffAddress?`DEVOLUCION DEL VEHICULO EN: ${dropoffText}`:""].filter(Boolean).join("\n");
        if(notes)form.set("notes",notes);
        console.log(JSON.stringify({event:"renthub_booking_time_fallback",contract_number:c.contract_number,real_start:realStart,minimum_start:map.minimum||null,retry_start:start,reason:firstMessage}));
        inserted=await doInsert();
      }else throw firstError;
    }
    const code=String(inserted?.result?.booking?.code||inserted?.booking?.code||inserted?.code||"");
    if(!code)throw Error("Renthub no devolvió código de reserva");
    const previousCode=bridgeAmend?String(c.renthub_contract_id||c.app_payload?.renthub_amend_old_code||"").trim():"";
    if(previousCode&&previousCode!==code){
      try{
        await rh("/module/rental/api/partner/booking/cancel/"+encodeURIComponent(previousCode),{method:"DELETE"});
      }catch(cancelError){
        const message=cancelError instanceof Error?cancelError.message:String(cancelError);
        const alreadyGone=/404/.test(message)&&/invalid booking code|already canceled|already cancelled/i.test(message);
        if(!alreadyGone){
          await rh("/module/rental/api/partner/booking/cancel/"+encodeURIComponent(code),{method:"DELETE"}).catch(()=>null);
          throw Error("No se pudo sustituir la reserva anterior de Renthub: "+message);
        }
      }
    }
    await requireWrite(actor.from("contracts").update({
      ...(localPriceMissing?{rental_total:rentalGross.toFixed(2),total:rentalGross.toFixed(2)}:{}),
      renthub_contract_id:code,
      renthub_sync_status:"reservation_created",
      renthub_last_sync_at:new Date().toISOString(),
      renthub_sync_error:null,
      app_payload:{...payload,renthub_created_from_quick_reservation:true,renthub_created_at:new Date().toISOString(),renthub_resource:"freesale",renthub_model_id:map.model,renthub_pickup_location_id:map.pickup,renthub_dropoff_location_id:map.dropoff,renthub_created_start:start,renthub_real_start:realStart,price_source:priceSource,...(bridgeAmend?{renthub_amend_old_code:null,renthub_amend_replaced_code:previousCode||null,renthub_amend_pending:false,renthub_amend_applied_at:new Date().toISOString()}:{ }),...(localPriceMissing?{base_tariff_price:rentalGross.toFixed(2),base_tariff_category:baseTariff?.category||"",base_tariff_season_94:!!baseTariff?.season94}:{})}
    }).eq("id",id),"No se pudo guardar el código de Renthub");
    return json({created:true,external_reference:code,resource:"freesale",group:map.group,pickup_location:map.pickup,dropoff_location:map.dropoff,location_fallback:false,start_datetime:start,real_start_datetime:realStart,time_adjusted:start!==realStart});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);console.error(JSON.stringify({event:"renthub_booking_error",contract_id:id,error:message}));
    const write=await actor.from("contracts").update({renthub_sync_status:"failed",renthub_sync_error:message}).eq("id",id);
    if(write.error)console.error(JSON.stringify({event:"renthub_booking_error_write_failed",contract_id:id,error:write.error.message}));
    return json({error:message},502);
  }
});

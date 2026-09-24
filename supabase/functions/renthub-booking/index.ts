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
function splitPhone(value:unknown){let raw=String(value||"").trim(),digits=raw.replace(/\D/g,"");if(digits.startsWith("0034"))digits=digits.slice(4);else if(digits.startsWith("34")&&digits.length===11)digits=digits.slice(2);if(digits.length>9)digits=digits.slice(-9);return{prefix:"34",mobile:digits.length===9?digits:"600000000"};}
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
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method==="GET"){
    try{const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});await loadSecret(service);await partnerToken(true);return json({ready:true,partner_api:true});}
    catch(e){console.error(JSON.stringify({event:"renthub_partner_health",error:String((e as Error)?.message||e)}));return json({ready:false,partner_api:false,error:"Renthub Partner API failed"},503);}
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return json({error:"Authentication required"},401);
  const service=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}}),actor=createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${jwt}`}}}),{data:auth,error}=await service.auth.getUser(jwt),role=auth.user?.app_metadata?.role;
  if(error||!auth.user||role!=="admin")return json({error:"Solo un administrador puede enviar reservas a Renthub"},403);
  const body=await req.json().catch(()=>({})),action=String(body.action||"create"),id=String(body.contract_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Contrato no válido"},400);
  await loadSecret(service);if(!secret)return json({error:"Renthub no está configurado"},503);
  const{data:c,error:ce}=await service.from("contracts").select("*").eq("id",id).single();
  if(ce||!c)return json({error:"Contrato no encontrado"},404);
  if(action==="update")return json({error:"La actualización queda pendiente del endpoint de Renthub.",pending_endpoint:true},409);
  if(action!=="create")return json({error:"Unknown action"},400);
  if(c.renthub_contract_id)return json({created:true,already_created:true,external_reference:c.renthub_contract_id});
  try{
    const map=await mappings(c),realStart=`${c.delivery_date} ${String(c.delivery_time||"").slice(0,5)}`,end=`${c.return_date} ${String(c.return_time||"").slice(0,5)}`;
    let start=realStart;
    if(map.minimum&&start<map.minimum)start=map.minimum;
    if(start>=end)throw Error(`Renthub no encuentra una hora de inicio válida anterior a la devolución ${end}`);
    if(!map.model)throw Error(`No hay mapeo Renthub para el grupo ${c.category||"sin grupo"}`);
    let customer:any=null;if(c.customer_id){const q=await service.from("customers").select("*").eq("id",c.customer_id).maybeSingle();customer=q.data||null;}
    const payload=c.app_payload||{},names=splitName(customer?.full_name||payload.customer_name||"Cliente pendiente Larios Rental"),phone=splitPhone(customer?.phone||payload.customer_phone),customerEmail=String(customer?.email||payload.customer_email||"").trim(),email=customerEmail||`sin-correo+lr-${String(c.contract_number).padStart(6,"0")}@example.invalid`;
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
    form.set("name",names.name);form.set("surname",names.surname);form.set("mobile_prefix",`+${phone.prefix}`);form.set("mobile",phone.mobile);form.set("email",email);
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
    let inserted:any;
    const currentPickup=String(map.pickup),currentDropoff=String(map.dropoff);
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
            throw Error(`Renthub reconoce la ubicación ${map.pickupMatched||pickupText} (ID ${map.pickup}), pero no tiene una lista de precios disponible para la integración en esa ubicación. No se cambia por Otra Ubicación.`);
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
    await requireWrite(actor.from("contracts").update({
      ...(localPriceMissing?{rental_total:rentalGross.toFixed(2),total:rentalGross.toFixed(2)}:{}),
      renthub_contract_id:code,
      renthub_sync_status:"reservation_created",
      renthub_last_sync_at:new Date().toISOString(),
      renthub_sync_error:null,
      app_payload:{...payload,renthub_created_from_quick_reservation:true,renthub_created_at:new Date().toISOString(),renthub_resource:"freesale",renthub_model_id:map.model,renthub_pickup_location_id:map.pickup,renthub_dropoff_location_id:map.dropoff,renthub_created_start:start,renthub_real_start:realStart,price_source:priceSource,...(localPriceMissing?{base_tariff_price:rentalGross.toFixed(2),base_tariff_category:baseTariff?.category||"",base_tariff_season_94:!!baseTariff?.season94}:{})}
    }).eq("id",id),"No se pudo guardar el código de Renthub");
    return json({created:true,external_reference:code,resource:"freesale",group:map.group,pickup_location:map.pickup,dropoff_location:map.dropoff,location_fallback:false,start_datetime:start,real_start_datetime:realStart,time_adjusted:start!==realStart});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);console.error(JSON.stringify({event:"renthub_booking_error",contract_id:id,error:message}));
    const write=await actor.from("contracts").update({renthub_sync_status:"failed",renthub_sync_error:message}).eq("id",id);
    if(write.error)console.error(JSON.stringify({event:"renthub_booking_error_write_failed",contract_id:id,error:write.error.message}));
    return json({error:message},502);
  }
});

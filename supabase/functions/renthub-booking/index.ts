import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"https://lariosrental.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const env=(n:string)=>(Deno.env.get(n)||"").trim();
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:cors});
const norm=(v:unknown)=>String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const base=()=>(env("RENTHUB_INSTALLATION_URL")||"https://lariosrental.renthubsoftware.com").replace(/\/$/,"");
let secret=env("RENTHUB_SECRET_TOKEN"),tokenCache:any=null;

function parseMap(n:string){try{const v=JSON.parse(env(n)||"{}");return Object.fromEntries(Object.entries(v).map(([k,x])=>[norm(k),String(x)]));}catch{return{};}}
async function loadSecret(s:any,retry=true){if(secret)return secret;const{data,error}=await s.rpc("app_get_renthub_secret");if(error&&retry)return loadSecret(s,false);if(error)throw Error(`No se pudo leer la credencial Partner de Renthub: ${error.message}`);if(data)secret=String(data).trim();return secret;}
async function partnerToken(force=false){if(!force&&tokenCache&&tokenCache.expires>Date.now()+60000)return tokenCache.token;if(!secret)throw Error("Renthub secret no configurado");const r=await fetch(`${base()}/api/partner/token/${encodeURIComponent(secret)}`,{headers:{Accept:"application/json"}}),d=await r.json().catch(()=>({}));if(!r.ok||!d?.result?.token)throw Error(`Autenticación Renthub fallida (${r.status})`);tokenCache={token:d.result.token,expires:d.result.expires_at?Date.parse(d.result.expires_at):Date.now()+600000};return tokenCache.token;}
async function rh(path:string,init:RequestInit={},retry=true){const r=await fetch(`${base()}${path}`,{...init,headers:{Accept:"application/json","X-PartnerToken":await partnerToken(),...(init.headers||{})}});if(r.status===401&&retry){await partnerToken(true);return rh(path,init,false)}const raw=await r.text();let d:any={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok||d?.status===false){const detail=String(d?.message||d?.error||raw||`Renthub ${r.status}`).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,500),normalized=norm(detail);if(normalized.includes("no hay vehiculos disponibles")||normalized.includes("no vehicles available"))throw Error("Renthub no tiene Free Sale configurado para este modelo, fechas y ubicación. Renthub debe activar esa disponibilidad antes de crear la reserva por API.");throw Error(detail);}return d;}
function groupName(c:unknown){const v=norm(c).replace(/^grupo\s+/,"");return({"50cc":"m1","125cc":"m2","bicicleta":"b1","e-bike":"b2","ebike":"b2"} as any)[v]||v;}
function pricelist(c:any){const m=parseMap("RENTHUB_PRICELIST_MAP"),t=c.season_94?"94":"78";return m[t]||m[`tarifa ${t}`]||(c.season_94?"2":"1");}
function splitName(full:unknown){const p=String(full||"").trim().split(/\s+/).filter(Boolean);return{name:p.shift()||"Pendiente",surname:p.join(" ")||"Larios Rental"};}
function splitPhone(value:unknown){let raw=String(value||"").trim(),digits=raw.replace(/\D/g,"");if(digits.startsWith("0034"))digits=digits.slice(4);else if(digits.startsWith("34")&&digits.length===11)digits=digits.slice(2);if(digits.length>9)digits=digits.slice(-9);return{prefix:"34",mobile:digits.length===9?digits:"600000000"};}
const amount=(v:unknown)=>Number(String(v??"0").trim().replace(/\s/g,"").replace(",","."));
function netFromGross(v:unknown,vatValue:unknown){const gross=amount(v),vat=Math.max(0,amount(vatValue));return Number.isFinite(gross)&&vat>0?gross/(1+vat/100):gross;}
async function requireWrite(p:PromiseLike<any>,label:string){const r=await p;if(r?.error)throw Error(`${label}: ${r.error.message}`);return r;}
async function mappings(c:any){const params=await rh("/module/rental/api/partner/config/parameters"),target=groupName(c.category),g=norm(c.category).replace(/^grupo\s+/,""),configured=parseMap("RENTHUB_FREESALE_MODEL_MAP"),defaults:any={a:"20",b:"2",c:"3",d:"22",f:"11",g:"21",h:"19",i:"4",j:"6",k:"8",l:"7",q:"31","50cc":"16","125cc":"15",bicicleta:"17","e-bike":"18",ebike:"18",m1:"16",m2:"15",b1:"17",b2:"18"};return{model:configured[g]||configured[target]||defaults[g]||defaults[target]||"",group:target,pickup:env("RENTHUB_OTHER_LOCATION_ID")||"132",dropoff:env("RENTHUB_OTHER_LOCATION_ID")||"132",minimum:String(params?.result?.opening?.min_date||"").slice(0,16)};}
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
    const map=await mappings(c),start=`${c.delivery_date} ${String(c.delivery_time||"").slice(0,5)}`,end=`${c.return_date} ${String(c.return_time||"").slice(0,5)}`;
    if(map.minimum&&start<map.minimum)throw Error(`Renthub no admite crear reservas con entrega anterior a ${map.minimum}`);
    if(!map.model)throw Error(`No hay mapeo Renthub para el grupo ${c.category||"sin grupo"}`);
    let customer:any=null;if(c.customer_id){const q=await service.from("customers").select("*").eq("id",c.customer_id).maybeSingle();customer=q.data||null;}
    const payload=c.app_payload||{},names=splitName(customer?.full_name||payload.customer_name||"Pendiente"),phone=splitPhone(customer?.phone||payload.customer_phone),email=String(customer?.email||payload.customer_email||"").trim()||"info@lariosrental.com";
    const pickupAddress=String(c.delivery_location||payload.pickup_location||"").trim(),dropoffAddress=String(c.return_location||payload.return_location||pickupAddress).trim();
    const form=new FormData();
    form.set("partner_reservation_code",`LR-${String(c.contract_number).padStart(6,"0")}`);
    form.set("name",names.name);form.set("surname",names.surname);form.set("mobile_prefix",`+${phone.prefix}`);form.set("mobile",phone.mobile);form.set("email",email);
    form.set("model",map.model);form.set("start_datetime",start);form.set("end_datetime",end);
    form.set("pickup_location",map.pickup);form.set("dropoff_location",map.dropoff);
    if(pickupAddress)form.set("pickup_at_location",pickupAddress);if(dropoffAddress)form.set("dropoff_at_location",dropoffAddress);
    form.set("resource","freesale");form.set("pm_prev_mezzo_id","");form.set("pm_current_model_id",map.model);form.set("ritiro",map.pickup);form.set("consegna",map.dropoff);form.set("internal_move","0");
    form.set("booking_type","booking");form.set("send_confirmation_email","0");form.set("pricelist",pricelist(c));
    // Never send bicycle quantity as a vehicle assignment. Renthub receives only
    // the group/model and, when present, the exact price calculated by this app.
    const rentalGross=amount(c.rental_total)>0?amount(c.rental_total):amount(c.total);
    if(Number.isFinite(rentalGross)&&rentalGross>0)form.set("overwrite_rental_rate",netFromGross(rentalGross,c.vat_percent).toFixed(4));
    form.set("overwrite_deposit",Math.max(0,amount(c.deposit)).toFixed(2));if(amount(c.franchise)>0)form.set("overwrite_damage_franchise",Math.max(0,amount(c.franchise)).toFixed(2));
    console.log(JSON.stringify({event:"renthub_booking_create",endpoint:"partner_freesale",contract_number:c.contract_number,group:map.group,model:map.model,resource:"freesale",pm_prev_mezzo_id:"",pm_current_model_id:map.model,pickup:map.pickup,dropoff:map.dropoff,has_pickup_address:!!pickupAddress,has_dropoff_address:!!dropoffAddress,price_override:rentalGross>0}));
    const inserted=await rh("/module/rental/api/partner/booking/insert",{method:"POST",body:form}),code=String(inserted?.result?.booking?.code||inserted?.booking?.code||inserted?.code||"");
    if(!code)throw Error("Renthub no devolvió código de reserva");
    await requireWrite(actor.from("contracts").update({renthub_contract_id:code,renthub_sync_status:"reservation_created",renthub_last_sync_at:new Date().toISOString(),renthub_sync_error:null,app_payload:{...payload,renthub_created_from_quick_reservation:true,renthub_created_at:new Date().toISOString(),renthub_resource:"freesale",renthub_model_id:map.model,renthub_pickup_location_id:map.pickup,renthub_dropoff_location_id:map.dropoff}}).eq("id",id),"No se pudo guardar el código de Renthub");
    return json({created:true,external_reference:code,resource:"freesale",group:map.group,pickup_location:map.pickup,dropoff_location:map.dropoff});
  }catch(e){
    const message=e instanceof Error?e.message:String(e);console.error(JSON.stringify({event:"renthub_booking_error",contract_id:id,error:message}));
    const write=await actor.from("contracts").update({renthub_sync_status:"failed",renthub_sync_error:message}).eq("id",id);
    if(write.error)console.error(JSON.stringify({event:"renthub_booking_error_write_failed",contract_id:id,error:write.error.message}));
    return json({error:message},502);
  }
});

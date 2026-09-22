import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://lariosrental.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const env = (name: string) => (Deno.env.get(name) || "").trim();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
const normalize = (value: unknown) => String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const installationUrl = () => (env("RENTHUB_INSTALLATION_URL") || "https://lariosrental.renthubsoftware.com").replace(/\/$/, "");
let partnerSecret = env("RENTHUB_SECRET_TOKEN");

function parseMap(name: string): Record<string, string> {
  try {
    const value = JSON.parse(env(name) || "{}");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [normalize(key), String(item)]));
  } catch { return {}; }
}
const defaultModelMap: Record<string, string> = {
  a: "20", b: "2", c: "3", d: "22", f: "11", g: "21", h: "19", i: "4",
  j: "6", k: "9", l: "7", q: "31", m1: "16", m2: "15", b1: "17", b2: "18",
};

async function loadPartnerSecret(service: any) {
  if (partnerSecret) return partnerSecret;
  const { data, error } = await service.rpc("app_get_renthub_secret");
  if (!error && data) partnerSecret = String(data).trim();
  return partnerSecret;
}
function configuration() {
  const missing = partnerSecret ? [] : ["RENTHUB_SECRET_TOKEN"];
  // La documentacion Partner no publica un endpoint para subir el PDF del contrato.
  // Se desactiva en este flujo para no mezclar Partner API con User API.
  const documentReady = false;
  const enabled = !!partnerSecret;
  return {
    enabled, ready: missing.length === 0, missing, documentReady,
    purgeReady: enabled && missing.length === 0 && documentReady && env("RENTHUB_PURGE_ENABLED").toLowerCase() === "true",
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;
async function partnerToken(force = false) {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  if (!partnerSecret) throw new Error("Renthub secret is not configured");
  const response = await fetch(`${installationUrl()}/api/partner/token/${encodeURIComponent(partnerSecret)}`, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.result?.token) throw new Error(`Renthub authentication failed (${response.status})`);
  tokenCache = { token: data.result.token, expiresAt: data.result.expires_at ? Date.parse(data.result.expires_at) : Date.now() + 600_000 };
  return tokenCache.token;
}
async function renthubFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const response = await fetch(`${installationUrl()}${path}`, { ...init, headers: { Accept: "application/json", "X-PartnerToken": await partnerToken(), ...(init.headers || {}) } });
  if (response.status === 401 && retry) { await partnerToken(true); return renthubFetch(path, init, false); }
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok || data?.status === false) {
    const endpoint = path.split("?")[0];
    const detail = String(data?.message || data?.error || raw || "sin detalle")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    console.error(JSON.stringify({ event: "renthub_api_error", endpoint, status: response.status, detail }));
    throw new Error(`Renthub ${response.status} en ${endpoint}: ${detail}`);
  }
  return data;
}

async function cacheStatus(service: any) {
  const { data, error } = await service.from("renthub_cache").select("resource_type,cached_at,expires_at").order("resource_type");
  if (error) throw new Error(`Renthub cache status failed: ${error.message}`);
  return { resources: data || [], contains_personal_data: false };
}

async function refreshCatalogueCache(service: any, userId: string) {
  const catalogues = [
    ["parameters", "/module/rental/api/partner/config/parameters"],
    ["categories", "/module/rental/api/partner/config/categories"],
  ] as const;
  const refreshed = [];
  for (const [resourceType, path] of catalogues) {
    const response = await renthubFetch(path);
    const payload = response?.result ?? response;
    const { error } = await service.from("renthub_cache").upsert({
      resource_type: resourceType, payload, source_hash: await digest(payload),
      cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), updated_by: userId,
    }, { onConflict: "resource_type" });
    if (error) throw new Error(`Renthub ${resourceType} cache failed: ${error.message}`);
    refreshed.push(resourceType);
  }
  return refreshed;
}

const plateKey = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const renthubFleetByPlate: Record<string,{vehicle:string,model:string,type:string}> = {"3487MSF":{"vehicle":"138","model":"33","type":"308"},"8601LXC":{"vehicle":"5","model":"4","type":"GRUPO I - RENAULT GRAND SCENIC"},"7099LZP":{"vehicle":"10","model":"7","type":"GRUPO L - MINI COOPER CABRIO"},"5283NMX":{"vehicle":"135","model":"7","type":"GRUPO L - MINI COOPER CABRIO"},"5536MKJ":{"vehicle":"22","model":"9","type":"GRUPO K - CITROEN C4"},"0000MNZ":{"vehicle":"23","model":"1","type":"Citroen C3"},"8487MVJ":{"vehicle":"39","model":"1","type":"Citroen C3"},"8486MVJ":{"vehicle":"40","model":"1","type":"Citroen C3"},"4160MTD":{"vehicle":"56","model":"1","type":"Citroen C3"},"4157MTD":{"vehicle":"59","model":"1","type":"Citroen C3"},"1797MMG":{"vehicle":"63","model":"1","type":"Citroen C3"},"7584MPP":{"vehicle":"26","model":"11","type":"GRUPO F - SKODA SCALA"},"8046MPM":{"vehicle":"27","model":"11","type":"GRUPO F - SKODA SCALA"},"5790MZH":{"vehicle":"125","model":"11","type":"GRUPO F - SKODA SCALA"},"3702MRG":{"vehicle":"28","model":"12","type":"OPEL CORSA"},"3703MRG":{"vehicle":"29","model":"12","type":"OPEL CORSA"},"3704MRG":{"vehicle":"30","model":"12","type":"OPEL CORSA"},"5013MVL":{"vehicle":"34","model":"12","type":"OPEL CORSA"},"5012MVL":{"vehicle":"35","model":"12","type":"OPEL CORSA"},"9356MZP":{"vehicle":"86","model":"12","type":"OPEL CORSA"},"9504MZP":{"vehicle":"87","model":"12","type":"OPEL CORSA"},"0320MRY":{"vehicle":"31","model":"3","type":"GRUPO C - SEAT IBIZA"},"0321MRY":{"vehicle":"32","model":"3","type":"GRUPO C - SEAT IBIZA"},"0322MRY":{"vehicle":"33","model":"3","type":"GRUPO C - SEAT IBIZA"},"3739LXV":{"vehicle":"48","model":"15","type":"GRUPO M2 - TWEET 125CC"},"3756LXV":{"vehicle":"49","model":"15","type":"GRUPO M2 - TWEET 125CC"},"9838LYL":{"vehicle":"50","model":"15","type":"GRUPO M2 - TWEET 125CC"},"3845MST":{"vehicle":"52","model":"15","type":"GRUPO M2 - TWEET 125CC"},"3848MST":{"vehicle":"53","model":"15","type":"GRUPO M2 - TWEET 125CC"},"7308MZH":{"vehicle":"76","model":"15","type":"GRUPO M2 - TWEET 125CC"},"7309MZH":{"vehicle":"77","model":"15","type":"GRUPO M2 - TWEET 125CC"},"7313MZH":{"vehicle":"78","model":"15","type":"GRUPO M2 - TWEET 125CC"},"7324MZH":{"vehicle":"79","model":"15","type":"GRUPO M2 - TWEET 125CC"},"8602MZH":{"vehicle":"80","model":"15","type":"GRUPO M2 - TWEET 125CC"},"0704MSZ":{"vehicle":"136","model":"15","type":"GRUPO M2 - TWEET 125CC"},"C8366BWT":{"vehicle":"55","model":"16","type":"GRUPO M1 - TWEET 50CC"},"4583MYZ":{"vehicle":"143","model":"19","type":"GRUPO H - CITROEN JUMPY"},"7557MXL":{"vehicle":"64","model":"2","type":"GRUPO B- KIA PICANTO"},"7855MXL":{"vehicle":"65","model":"2","type":"GRUPO B- KIA PICANTO"},"C1081BWW":{"vehicle":"81","model":"24","type":"PEUGEOT KISBEE 50CC"},"2591MZN":{"vehicle":"83","model":"25","type":"CITROEN C3 TURBO"},"2599MZN":{"vehicle":"84","model":"25","type":"CITROEN C3 TURBO"},"4133MZX":{"vehicle":"92","model":"25","type":"CITROEN C3 TURBO"},"3105NFL":{"vehicle":"105","model":"29","type":"GRUPO I - DACIA JOGGER"},"3923NFX":{"vehicle":"108","model":"26","type":"GRUPO G - NISSAN QASHQAI"},"4522MYF":{"vehicle":"110","model":"30","type":"NIRO"},"4028MRC":{"vehicle":"111","model":"5","type":"FIAT 500"},"2539MZL":{"vehicle":"113","model":"10","type":"VOLKSWAGEN TAIGO"},"8133MSB":{"vehicle":"114","model":"8","type":"SEAT ARONA"},"1572NBR":{"vehicle":"140","model":"8","type":"SEAT ARONA"},"8836NLF":{"vehicle":"128","model":"31","type":"GRUPO Q - MERCEDES-BENZ CLA 220"},"7343MYV":{"vehicle":"137","model":"32","type":"ATECA"},"2198MWH":{"vehicle":"139","model":"34","type":"I-10"},"2615MGL":{"vehicle":"151","model":"27","type":"Mercedes-Benz"},"2527MGL":{"vehicle":"152","model":"27","type":"Mercedes-Benz"},"9104LSD":{"vehicle":"46","model":"15","type":"GRUPO M2 - TWEET 125CC"}};

async function renthubVehicleByPlate(registration: string) {
  const wanted = plateKey(registration);
  const mapped = renthubFleetByPlate[wanted];
  if (mapped) return { id: mapped.vehicle, model_id: mapped.model, registration: wanted, model_name: mapped.type, source: "captured_renthub_select" };
  throw new Error(`No se encontró la matrícula ${registration} en el catálogo de flota capturado de Renthub.`);
}

function splitName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { name: parts.shift() || "Cliente", surname: parts.join(" ") || "Larios Rental" };
}
function splitPhone(value: string) {
  const original = String(value || "").trim();
  const digits = original.replace(/\D/g, "");
  if (!original.startsWith("+")) {
    if (digits.length !== 9) throw new Error("El teléfono del cliente debe tener 9 cifras españolas o incluir el prefijo internacional con + (por ejemplo, +34).");
    return { prefix: "+34", mobile: digits };
  }
  const callingCodes = [
    "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
    "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
    "211", "212", "213", "216", "218", "220", "221", "222", "223", "224", "225", "226", "227", "228", "229", "230", "231", "232", "233", "234", "235", "236", "237", "238", "239", "240", "241", "242", "243", "244", "245", "246", "248", "249", "250", "251", "252", "253", "254", "255", "256", "257", "258", "260", "261", "262", "263", "264", "265", "266", "267", "268", "269",
    "290", "291", "297", "298", "299", "350", "351", "352", "353", "354", "355", "356", "357", "358", "359", "370", "371", "372", "373", "374", "375", "376", "377", "378", "380", "381", "382", "383", "385", "386", "387", "389",
    "420", "421", "423", "500", "501", "502", "503", "504", "505", "506", "507", "508", "509", "590", "591", "592", "593", "594", "595", "596", "597", "598", "599",
    "670", "672", "673", "674", "675", "676", "677", "678", "679", "680", "681", "682", "683", "685", "686", "687", "688", "689", "690", "691", "692", "850", "852", "853", "855", "856", "880", "886", "960", "961", "962", "963", "964", "965", "966", "967", "968", "970", "971", "972", "973", "974", "975", "976", "977", "992", "993", "994", "995", "996", "998",
  ].sort((a, b) => b.length - a.length);
  const code = callingCodes.find((item) => digits.startsWith(item));
  const mobile = code ? digits.slice(code.length) : "";
  if (!code || mobile.length < 6 || mobile.length > 12) throw new Error("El teléfono del cliente no tiene un prefijo internacional válido.");
  return { prefix: `+${code}`, mobile };
}
function ageAt(birthDate: string | null, at: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`), date = new Date(`${at}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}
async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const minute = (value: unknown) => String(value || "").slice(0, 16);
const amount = (value: unknown) => Number(String(value ?? "0").trim().replace(/\s/g, "").replace(",", "."));
function sameAmount(actualValue: unknown, expectedValue: unknown, vatValue: unknown) {
  const actual = amount(actualValue), expected = amount(expectedValue), vat = Math.max(0, amount(vatValue));
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const factor = 1 + vat / 100;
  return Math.abs(actual - expected) <= 0.03 || (factor > 1 && Math.abs(actual * factor - expected) <= 0.04);
}
function partnerPaymentMethod(value: unknown) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "efectivo" || key === "cash") return "cash";
  if (key === "tarjeta" || key === "credit_card" || key === "credit card") return "credit_card";
  if (key === "transferencia" || key === "bank_transfer" || key === "bank transfer") return "bank_transfer";
  return "";
}
function renthubReplacementStart(contract: any) {
  const startDate = String(contract?.delivery_date || "").slice(0, 10);
  const endDate = String(contract?.return_date || "").slice(0, 10);
  const endTime = String(contract?.return_time || "").slice(0, 5);
  if (!startDate || !endDate || !/^\d{2}:\d{2}$/.test(endTime)) throw new Error("No se puede calcular la hora de inicio de la reserva de sustitución.");
  if (startDate !== endDate) return `${startDate} 23:59`;
  const [hh, mm] = endTime.split(":").map(Number);
  const endMinutes = hh * 60 + mm;
  if (!Number.isFinite(endMinutes) || endMinutes < 60) throw new Error("La devolución de una reserva del mismo día debe ser posterior a las 01:00 para poder fijar el inicio una hora antes.");
  const startMinutes = endMinutes - 60;
  const sh = String(Math.floor(startMinutes / 60)).padStart(2, "0");
  const sm = String(startMinutes % 60).padStart(2, "0");
  return `${startDate} ${sh}:${sm}`;
}
async function requireWrite(resultPromise: PromiseLike<any>, label: string) {
  const result = await resultPromise;
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}
const renthubCategoryName = (category: unknown) => {
  const value = normalize(category).replace(/^grupo\s+/, "");
  const aliases: Record<string, string> = {
    "50cc": "m1", "125cc": "m2", "bicicleta": "b1", "e-bike": "b2", "ebike": "b2",
  };
  return aliases[value] || value;
};
function renthubPricelist(contract: any) {
  const map = parseMap("RENTHUB_PRICELIST_MAP");
  const tariff = contract.season_94 ? "94" : "78";
  return map[tariff] || map[`tarifa ${tariff}`] || (contract.season_94 ? "2" : "1");
}
function contractServiceTotal(contract: any) {
  const rental = Number(contract.rental_total || 0);
  const discount = rental * Math.max(0, Number(contract.discount_percent || 0)) / 100;
  return Math.max(0, Number(contract.total || 0) - (rental - discount));
}
function netFromGross(value: unknown, vatValue: unknown) {
  const gross = amount(value), vat = Math.max(0, amount(vatValue));
  return vat > 0 ? gross / (1 + vat / 100) : gross;
}

async function syncPartnerCustomer(customerCode: string, contract: any, customer: any, driver: any) {
  if (!customerCode || !customer) return null;
  const payload = contract?.app_payload || {};
  const names = splitName(customer.full_name || payload.customer_name);
  const phone = splitPhone(customer.phone || payload.customer_phone);

  const licenceNumber = String(driver?.licence_number || payload.driving_license || "").trim();
  const licenceIssuedBy = String(driver?.licence_country || payload.license_issued_by || "").trim();
  const licenceIssueDate = String(driver?.issue_date || payload.license_issue || "").trim();
  const licenceExpiry = String(driver?.expiry_date || payload.license_expiry || "").trim();
  const birthDate = String(customer.birth_date || driver?.birth_date || payload.customer_birth_date || "").trim();

  const body: Record<string, unknown> = {
    contact_type: "private",
    name: names.name,
    surname: names.surname,
    email: String(customer.email || payload.customer_email || ""),
    mobile_prefix: phone.prefix,
    mobile: phone.mobile,
    contact_lang: "es",
  };

  const address = String(customer.address || payload.customer_address || "").trim();
  if (address) body.address = address;
  if (customer.city) body.city = String(customer.city);
  if (customer.postal_code) body.zip = String(customer.postal_code);
  if (/^[A-Za-z]{2}$/.test(String(customer.country || ""))) body.country = String(customer.country).toUpperCase();
  if (birthDate) body.birth_date = birthDate;

  // Campos oficiales de Customer Management Partner API.
  if (licenceNumber) body.driving_license_number = licenceNumber;
  if (licenceIssuedBy) body.driving_license_issued_by = licenceIssuedBy;
  if (licenceIssueDate) body.driving_license_issued_at = licenceIssueDate;
  if (licenceExpiry) body.driving_license_exp = licenceExpiry;

  const response = await renthubFetch(`/api/partner/customer/update/${encodeURIComponent(customerCode)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(JSON.stringify({
    event: "renthub_partner_customer_sync",
    customer_code: customerCode,
    has_driving_license: !!licenceNumber,
    has_license_issue_date: !!licenceIssueDate,
    has_license_expiry: !!licenceExpiry,
    has_address: !!address,
  }));
  return response;
}

const internalLocationCatalog = [{"id":"124","name":"Larios Malaga"},{"id":"6","name":"ALCAZABA PREMIUM"},{"id":"102","name":"LA MUNDIAL APARTAMENTOS"},{"id":"45","name":"Oficentro Apartamentos Suites"},{"id":"120","name":"AUTOCARAVANAS LA CALA"},{"id":"8","name":"Atarazanas Málaga Boutique Hotel"},{"id":"146","name":"PALACIO DE LA TINTA"},{"id":"36","name":"Málaga Centro B&B HOTEL"},{"id":"11","name":"Barceló Málaga"},{"id":"82","name":"Benhostone"},{"id":"136","name":"EUROSTARS MÁLAGA"},{"id":"103","name":"Malaga Feeling Apartment"},{"id":"127","name":"Living Malaga Apart"},{"id":"125","name":"Ibis Hotel Málaga Centro"},{"id":"128","name":"Los flamencos Apart"},{"id":"96","name":"DOMUS HOSTAL"},{"id":"117","name":"Picasso Apartments"},{"id":"75","name":"CAMPER AREA MH EL RINCON (Málaga)"},{"id":"76","name":"CASA EL MORISCO"},{"id":"14","name":"Castillo Santa Catalina"},{"id":"15","name":"Casual del Mar Málaga"},{"id":"83","name":"Chinitas Boutique Bellavista"},{"id":"85","name":"City Expert CISTER"},{"id":"90","name":"City Expert Calle Granada"},{"id":"93","name":"City Expert CALLE GRANADA"},{"id":"88","name":"City Expert Málaga Estación Autobuses"},{"id":"94","name":"City Expert ESTACIÓN AUTOBUSES"},{"id":"89","name":"City Expert Muelle Heredia"},{"id":"92","name":"City Expert MUELLE HEREDIA"},{"id":"126","name":"El Museo Suites"},{"id":"112","name":"El Nogal Home"},{"id":"54","name":"El Riad Andaluz"},{"id":"7","name":"ASTORIA HOTEL"},{"id":"20","name":"DORMA"},{"id":"121","name":"Fay Hotels Victoria Beach (Elimar)"},{"id":"21","name":"Feel Hostels City Center"},{"id":"61","name":"Soho Feel Hostels Malaga"},{"id":"80","name":"Villa Buenavista Malaga"},{"id":"106","name":"Flat Málaga Centro"},{"id":"43","name":"Miramar Gran Hotel"},{"id":"68","name":"Trebol H-A Hotel"},{"id":"22","name":"H10 Croma Málaga"},{"id":"134","name":"HAMPTON BY HILTON"},{"id":"23","name":"Hilton Garden Inn Málaga"},{"id":"24","name":"Holiday Inn Express Malaga Airport"},{"id":"30","name":"Las Acacias Hostal"},{"id":"110","name":"Moscatel Hostal"},{"id":"113","name":"Nomadas Hotel Boutique"},{"id":"25","name":"HOTEL BRO"},{"id":"12","name":"California Hotel"},{"id":"13","name":"Carlos V Hotel"},{"id":"16","name":"Catalonia Hotel"},{"id":"139","name":"Hotel Catalonia Puerta del Mar"},{"id":"17","name":"del Pintor Hotel"},{"id":"18","name":"Hotel Don Curro"},{"id":"97","name":"Don Paco Hotel"},{"id":"98","name":"Elcano Hotel"},{"id":"19","name":"Eliseos Hotel"},{"id":"99","name":"Goartin Hotel"},{"id":"26","name":"Husa Guadalmedina Hotel"},{"id":"101","name":"ibis Budget VELAZQUEZ Hotel"},{"id":"27","name":"Ilunion hotel"},{"id":"70","name":"Larios Málaga Hotel"},{"id":"37","name":"Malaga Palacio AC Hotel by Marriott"},{"id":"116","name":"Picasso Hotel Málaga"},{"id":"39","name":"Málaga Premium Hotel"},{"id":"122","name":"Maria Cristina Hotel"},{"id":"44","name":"Hotel Molina Lario"},{"id":"109","name":"Hotel Monte Victoria"},{"id":"74","name":"Calabahía Hotel Moon Dreams"},{"id":"35","name":"Hotel MS Maestranza"},{"id":"48","name":"Palacete de Álamos Hotel"},{"id":"79","name":"Rincón Sol Hotel"},{"id":"9","name":"Málaga Centro HOTEL"},{"id":"10","name":"Bahía Hotel Soho Boutique"},{"id":"60","name":"Soho Boutique Equitativa Hotel"},{"id":"31","name":"Las Vegas Hotel Soho Boutique"},{"id":"33","name":"Los Naranjos Hotel Soho Boutique"},{"id":"57","name":"Soho Boutique Hotel"},{"id":"58","name":"Soho Boutique Urban Hotel"},{"id":"63","name":"Solymar Hotel"},{"id":"65","name":"Sur Hotel Malaga"},{"id":"29","name":"Vincci Larios Diez Hotel"},{"id":"72","name":"Zenit Hotel Malaga"},{"id":"73","name":"Zeus Hotel"},{"id":"100","name":"ibis budget Málaga Centro"},{"id":"34","name":"Malabar ICON"},{"id":"77","name":"Imo Swiss Golf Beach"},{"id":"28","name":"Imosur Estacion consigna"},{"id":"104","name":"La Casa Azul"},{"id":"5","name":"Oficina Principal [DESCUENTO - 5%] - Málaga Centro, Pasaje Noblejas 8, Málaga, España"},{"id":"32","name":"Lock And Relax -Luggage storage (Centro-Alameda -C1 line)"},{"id":"108","name":"Lodgingmalaga Plaza de la Constitucion"},{"id":"105","name":"Madeinterranea"},{"id":"130","name":"Madeinterranea Suites"},{"id":"95","name":"Club Hispánico"},{"id":"81","name":"Málaga Nostrum"},{"id":"38","name":"Málaga Planners"},{"id":"40","name":"Málaga Sun Apartments"},{"id":"107","name":"MálagaLodge"},{"id":"41","name":"Marbesol"},{"id":"42","name":"Mariposa Hotel 4 estrellas Málaga centro"},{"id":"143","name":"ME MALAGA"},{"id":"78","name":"Motos Cerezo"},{"id":"114","name":"NONO APARTAMENTOS"},{"id":"64","name":"Novotel Suites Málaga Centro"},{"id":"46","name":"Only YOU Hotel Málaga"},{"id":"47","name":"Pacifico Apartments"},{"id":"49","name":"Palacio Solecio"},{"id":"50","name":"Parador de Málaga Gibralfaro"},{"id":"51","name":"Parador de Málaga Golf Club"},{"id":"84","name":"Chinitas Hostal"},{"id":"119","name":"Villa Amalia Suites"},{"id":"52","name":"Petit Palace Plaza Málaga"},{"id":"53","name":"QQ Bikes"},{"id":"55","name":"Room Mate Valeria Hotel"},{"id":"56","name":"Sercotel Rosaleda Málaga"},{"id":"69","name":"Sercotel Tribuna Málaga"},{"id":"59","name":"Soho Boutique Colón Hotel"},{"id":"62","name":"Sol Maestranza"},{"id":"135","name":"Staybridge Suites Malaga"},{"id":"138","name":"Staybridge Suites Malaga"},{"id":"66","name":"Tandem Soho Suites"},{"id":"67","name":"TOC Hostel Málaga"},{"id":"118","name":"Villa Alicia Guest House"},{"id":"71","name":"Vincci Posada del Patio Hotel"},{"id":"86","name":"EASY PARKING MÁLAGA aeropuerto Costa del Sol, aparcamiento CUBIERTO 24h | iPark"},{"id":"2","name":"Oficina Málaga - Aeropuerto"},{"id":"91","name":"Cenacheros house"},{"id":"87","name":"City Expert Cister"},{"id":"140","name":"Cristine Bedfor Guest Houses Málaga"},{"id":"3","name":"Oficina Málaga - Estación de Tren"},{"id":"141","name":"Eurostars Málaga"},{"id":"137","name":"HAMPTON"},{"id":"129","name":"DOMUS HOTEL"},{"id":"145","name":"Hotel Serenay Málaga"},{"id":"131","name":"AUTOCARAVANA LA CALA"},{"id":"142","name":"SERENAY"},{"id":"4","name":"Oficina Málaga - Estación de Cruceros"},{"id":"132","name":"Otra Ubicación - [Indique dirección en -Observaciones-]"}];
const internalLocationAliases = {"ofi":"5","oficina":"5","oficina principal":"5","pasaje noblejas":"5","agp":"2","aeropuerto":"2","ave":"3","estacion":"3","estacion tren":"3","maria zambrano":"3","cruceros":"4","crucero":"4","puerto":"4","posada":"71","vincci posada":"71","vincci posada del patio":"71","miramar":"43","gran hotel miramar":"43","ilunion":"27","rinconsol":"79","rincon sol":"79","california":"12","croma":"22","h10 croma":"22","novotel":"64","only you":"46","palacio tinta":"146","solecio":"49","palacio solecio":"49","atarazanas":"8","guadalmedina":"26","hilton":"23","hilton garden":"23","maestranza":"35","ms maestranza":"35","vegas":"31","las vegas":"31","naranjos":"33","los naranjos":"33","malabar":"34","rosaleda":"56","mariposa":"42","larios 10":"29","larios diez":"29","b&b":"36","bb":"36","barcelo":"11","benhostone":"82","club hispanico":"95","dorma":"20","elimar":"121","hampton":"134","ibis budget":"100","me malaga":"143","bro":"25","hotel bro":"25","cister city":"85","city expert cister":"85","cister":"85","flamencos":"128","casa azul":"104","autocaravanas la cala":"120","camper cala":"120","camper la cala":"120"};
function cleanLocationText(value: unknown) {
  return normalize(String(value || "")).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function locationAliasId(value: unknown) {
  const key = cleanLocationText(value);
  if (!key) return "";
  if (internalLocationAliases[key]) return String(internalLocationAliases[key]);
  for (const [alias, id] of Object.entries(internalLocationAliases)) {
    if (key === alias || key.includes(alias)) return String(id);
  }
  const custom = parseMap("RENTHUB_LOCATION_MAP");
  return String(custom[key] || "");
}
function resolveRenthubLocation(value: unknown, locations: any[], fallbackAddress = "") {
  const raw = String(value || "").trim(), key = cleanLocationText(raw), alias = locationAliasId(raw);
  if (alias) {
    const found = locations.find((x: any) => String(x?.id) === alias);
    return { id: alias, address: "", matched: String(found?.name || raw), exact: true };
  }
  if (key) {
    let best: any = null, bestScore = 0;
    for (const x of locations || []) {
      const fields = [x?.name, x?.code, x?.address, x?.complete_address].map(cleanLocationText).filter(Boolean);
      for (const f of fields) {
        let score = 0;
        if (f === key) score = 100;
        else if (f.includes(key) && key.length >= 4) score = 80 + Math.min(15, key.length / 3);
        else if (key.includes(f) && f.length >= 5) score = 65 + Math.min(15, f.length / 3);
        else {
          const words = key.split(" ").filter((w) => w.length >= 4);
          const hits = words.filter((w) => f.includes(w)).length;
          if (words.length && hits) score = (hits / words.length) * 60;
        }
        if (score > bestScore) { bestScore = score; best = x; }
      }
    }
    if (best && bestScore >= 58) return { id: String(best.id), address: "", matched: String(best.name || ""), exact: bestScore >= 80 };
  }
  return { id: env("RENTHUB_OTHER_LOCATION_ID") || "132", address: raw || String(fallbackAddress || "").trim(), matched: "Otra Ubicacion", exact: false };
}

async function automaticMappings(contract: any) {
  const [categoryResponse, parameterResponse, locationsResponse] = await Promise.all([
    renthubFetch("/module/rental/api/partner/config/categories"),
    renthubFetch("/module/rental/api/partner/config/parameters"),
    renthubFetch("/module/rental/api/partner/locations"),
  ]);
  const categories = Array.isArray(categoryResponse?.result) ? categoryResponse.result : [];
  const apiLocations = Array.isArray(locationsResponse?.result) ? locationsResponse.result : [];
  const locations = [...internalLocationCatalog, ...apiLocations.filter((x: any) => !internalLocationCatalog.some((y: any) => String(y.id) === String(x?.id)))];
  const target = renthubCategoryName(contract.category);
  const category = categories.find((item: any) => normalize(item?.name) === target);
  const modelMap = { ...defaultModelMap, ...parseMap("RENTHUB_MODEL_MAP") };
  const group = normalize(contract.category).replace(/^grupo\s+/, "");
  const payload = contract.app_payload || {};
  const pickupRaw = contract.delivery_location || payload.pickup_location || "";
  const dropoffRaw = contract.return_location || payload.return_location || pickupRaw;
  const pickupResolved = resolveRenthubLocation(pickupRaw, locations);
  const dropoffResolved = resolveRenthubLocation(dropoffRaw, locations, pickupResolved.address);
  const deliveryDate = String(contract.delivery_date || "").slice(0, 10);
  const dateObj = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? new Date(`${deliveryDate}T12:00:00Z`) : null;
  const isoDay = dateObj && !Number.isNaN(dateObj.getTime()) ? (dateObj.getUTCDay() === 0 ? 7 : dateObj.getUTCDay()) : null;
  const weekly = parameterResponse?.result?.opening?.timetable?.["1"]?.weeklySchedule || {};
  const dayWindows = isoDay ? (weekly?.[String(isoDay)] || weekly?.[isoDay] || []) : [];
  const validClosings = (Array.isArray(dayWindows) ? dayWindows : [])
    .map((w: any) => String(w?.to || "").slice(0, 5))
    .filter((v: string) => /^\d{2}:\d{2}$/.test(v))
    .sort();
  const latestClosing = validClosings.length ? validClosings[validClosings.length - 1] : "";
  let latestPartnerStart = "";
  if (latestClosing) {
    const [hh, mm] = latestClosing.split(":").map(Number);
    const total = hh * 60 + mm;
    if (Number.isFinite(total) && total > 0) {
      const safe = Math.max(0, total - 1);
      latestPartnerStart = `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
    }
  }
  return {
    model: modelMap[group] || modelMap[normalize(contract.category)] || "",
    pickup: pickupResolved.id,
    dropoff: dropoffResolved.id,
    pickupAddress: pickupResolved.address,
    dropoffAddress: dropoffResolved.address,
    pickupMatched: pickupResolved.matched,
    dropoffMatched: dropoffResolved.matched,
    minimumStart: String(parameterResponse?.result?.opening?.min_date || "").slice(0, 16),
    latestPartnerStart,
  };
}

async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required" }, 401);
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const actor = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userData, error: userError } = await service.auth.getUser(jwt);
  const role = userData.user?.app_metadata?.role;
  if (userError || !userData.user || !["employee", "admin"].includes(role)) return json({ error: "Not authorized" }, 403);

  const body = await req.json().catch(() => ({}));
  await loadPartnerSecret(service);
  const action = String(body.action || "status"), config = configuration();
  let apiConnected = false, apiError = "";
  if (config.ready) {
    try { await partnerToken(); apiConnected = true; }
    catch (error) { apiError = error instanceof Error ? error.message : String(error); }
  }
  if (action === "status") return json({
    configured: config.enabled && config.ready && apiConnected,
    api_connected: apiConnected,
    api_error: apiError || null,
    purge_configured: config.purgeReady,
    activation_pending: !(config.enabled && config.ready && apiConnected),
    document_upload_configured: config.documentReady,
    safe_delete_enabled: env("RENTHUB_PURGE_ENABLED").toLowerCase() === "true",
    missing: config.missing,
    cache: await cacheStatus(service), role, can_manage: role === "admin",
  });
  if (role !== "admin") return json({ error: "ADMIN_REQUIRED", message: "Solo una cuenta administradora puede realizar acciones de Renthub." }, 403);
  if (!config.enabled || !config.ready || !apiConnected) return json({ error: "RENTHUB_NOT_CONFIGURED", message: apiError || "Renthub no está configurado", activation_pending: true, missing: config.missing }, 503);

  if (action === "refresh_cache") return json({ refreshed: await refreshCatalogueCache(service, userData.user.id), cache: await cacheStatus(service) });
  const contractId = String(body.contract_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "Invalid contract" }, 400);
  const { data: contract, error: contractError } = await service.from("contracts").select("*").eq("id", contractId).single();
  if (contractError || !contract) return json({ error: "Contract not found" }, 404);
  if (contract.status === "draft") return json({ error: "Generate the contract before sending it to Renthub" }, 409);

  const [{ data: customer }, { data: driver }] = await Promise.all([
    contract.customer_id ? service.from("customers").select("*").eq("id", contract.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    contract.main_driver_id ? service.from("drivers").select("*").eq("id", contract.main_driver_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { model, pickup, dropoff, pickupAddress, dropoffAddress, minimumStart, latestPartnerStart } = await automaticMappings(contract);
  const contractPlate = String(contract.app_payload?.vehicle_plate || contract.app_payload?.registration || contract.vehicle_plate || "").trim();
  const fleetMatch = contractPlate ? renthubFleetByPlate[plateKey(contractPlate)] : null;
  // El modelo reservado y el vehículo concreto son independientes en Renthub.
  // Para una reserva existente nunca usamos el modelo de la matrícula para decidir el grupo/modelo reservado.
  const verificationModel = String(model);
  console.log(JSON.stringify({
    event: "renthub_desired_booking_state",
    contract_number: contract.contract_number,
    reserved_model_id: String(model),
    plate: contractPlate || null,
    vehicle_id: fleetMatch?.vehicle || null,
    vehicle_model_id: fleetMatch?.model || null,
    verification_model_id: verificationModel,
    vehicle_and_reserved_model_independent: true,
    pickup_location: pickup,
    dropoff_location: dropoff,
  }));
  const start = `${contract.delivery_date} ${String(contract.delivery_time || "").slice(0, 5)}`;
  const end = `${contract.return_date} ${String(contract.return_time || "").slice(0, 5)}`;
  const expectedTotal = Number(contract.total || 0);
  const expectedRental = Number(contract.rental_total || 0);
  const renthubRentalRate = netFromGross(expectedRental, contract.vat_percent);
  const expectedServices = contractServiceTotal(contract);
  const pricelist = renthubPricelist(contract);
  const verificationHash = await digest({ contract_id: contract.id, start, end, model: verificationModel, pickup, dropoff, pricelist, rental_gross: expectedRental, rental_net: renthubRentalRate, services: expectedServices, total: expectedTotal, deposit: Number(contract.deposit || 0), resource: "freesale" });

  const replacementStart = renthubReplacementStart(contract);
  const paymentMethod = partnerPaymentMethod(contract.payment_method || contract.app_payload?.payment_method);
  const paymentAmount = amount(contract.total || contract.app_payload?.total);
  const desiredFranchise = Math.max(0, amount(contract.app_payload?.franchise ?? contract.franchise ?? 0));
  const replacementHash = await digest({
    contract_id: contract.id,
    replacement_start: replacementStart,
    end,
    total: expectedTotal,
    rental: expectedRental,
    model,
    pickup,
    dropoff,
    plate: contractPlate || "",
    vehicle: fleetMatch?.vehicle || "",
    vehicle_model: fleetMatch?.model || "",
    payment_method: paymentMethod,
    payment_amount: paymentAmount,
    franchise: desiredFranchise,
  });

  async function verify(code: string, options: { expectedStart?: string; checkStart?: boolean; expectedModel?: string; checkPayment?: boolean } = {}) {
    const detail = await renthubFetch(`/module/rental/api/partner/booking/details/${encodeURIComponent(code)}`);
    const booking = detail?.result?.booking || {};
    const locationMatches = (actual: any, expected: string) => [actual?.id, actual?.code, actual?.name].map(String).includes(String(expected));
    const modelCandidates = [
      detail?.result?.vehicle?.id,
      detail?.result?.model?.id,
      detail?.result?.vehicle?.model?.id,
      detail?.result?.vehicle?.current_model_id,
      booking?.model?.id,
      booking?.model_id,
      booking?.pm_current_model_id,
    ].filter((value) => value !== undefined && value !== null && String(value) !== "").map(String);
    const expectedModel = String(options.expectedModel || verificationModel);
    const modelMatches = modelCandidates.length === 0 || modelCandidates.includes(expectedModel);
    const checks: Record<string, boolean> = {
      code: String(booking.code || "") === code,
      end: minute(booking.end_datetime) === minute(end),
      total: sameAmount(booking.total_amount, expectedTotal, contract.vat_percent),
      customer_email: normalize(detail?.result?.customer?.email) === normalize(customer?.email),
      model: modelMatches,
      pickup_location: locationMatches(booking.pickup_location, pickup),
      dropoff_location: locationMatches(booking.dropoff_location, dropoff),
      deposit: Math.abs(Number(booking?.franchises?.deposit || 0) - Number(contract.deposit || 0)) <= 0.02,
    };
    if (options.checkStart) checks.start = minute(booking.start_datetime) === minute(options.expectedStart || start);
    if (options.checkPayment && paymentMethod && paymentAmount > 0 && booking?.to_be_paid !== undefined && booking?.to_be_paid !== null) {
      checks.payment = Math.abs(amount(booking.to_be_paid)) <= 0.03;
    }
    console.log(JSON.stringify({
      event: "renthub_booking_verify",
      contract_number: contract.contract_number,
      code,
      expected_start: options.checkStart ? minute(options.expectedStart || start) : null,
      model_expected: expectedModel,
      model_candidates: modelCandidates,
      checks,
    }));
    return { detail, booking, checks, verified: Object.values(checks).every(Boolean) };
  }

  function buildPartnerBookingForm(startValue: string, customerCode = "", requestVehicle = false) {
    if (!model) throw new Error(`No hay mapeo Renthub para el grupo ${contract.category || "sin grupo"}`);
    const names = splitName(customer?.full_name || contract.app_payload?.customer_name || "Pendiente Larios Rental");
    const phone = splitPhone(customer?.phone || contract.app_payload?.customer_phone || "");
    const form = new FormData();
    form.set("partner_reservation_code", `LR-${String(contract.contract_number).padStart(6, "0")}`);
    const knownCustomerCode = String(customerCode || customer?.renthub_customer_id || "");
    if (knownCustomerCode) form.set("customer_code", knownCustomerCode);
    else {
      form.set("name", names.name);
      form.set("surname", names.surname);
      form.set("mobile_prefix", phone.prefix);
      form.set("mobile", phone.mobile);
      form.set("email", String(customer?.email || contract.app_payload?.customer_email || "").trim());
      if (customer?.address) form.set("address", customer.address);
      if (customer?.city) form.set("city", customer.city);
      if (customer?.postal_code) form.set("zip", customer.postal_code);
      if (/^[A-Za-z]{2}$/.test(customer?.country || "")) form.set("country", customer.country.toUpperCase());
    }
    form.set("model", String(model));
    form.set("start_datetime", startValue);
    form.set("end_datetime", end);
    form.set("pickup_location", pickup);
    form.set("dropoff_location", dropoff);
    const realStartDate = String(contract.delivery_date || "").slice(0, 10);
    const realStartTime = String(contract.delivery_time || contract.app_payload?.pickup_time || "").slice(0, 5);
    const [realY, realM, realD] = realStartDate.split("-");
    const realStartLabel = realY && realM && realD && realStartTime
      ? `${realD}/${realM}/${realY} ${realStartTime}`
      : `${realStartDate} ${realStartTime}`.trim();
    const isReplacementBooking = minute(startValue) !== minute(start);
    const locationNotes = [
      isReplacementBooking && realStartLabel ? `HORA REAL DE INICIO DE LA RESERVA: ${realStartLabel}` : "",
      pickupAddress ? `RECOGIDA DEL VEHICULO EN: ${pickupAddress}` : "",
      dropoffAddress ? `DEVOLUCION DEL VEHICULO EN: ${dropoffAddress}` : "",
    ].filter(Boolean).join("\n");
    if (locationNotes) form.set("notes", locationNotes);
    form.set("booking_type", "booking");
    form.set("send_confirmation_email", "0");
    form.set("ignore_availability", "true");
    form.set("pricelist", pricelist);
    form.set("overwrite_rental_rate", renthubRentalRate.toFixed(4));
    form.set("overwrite_deposit", Number(contract.deposit || 0).toFixed(2));
    if (desiredFranchise > 0) form.set("overwrite_damage_franchise", desiredFranchise.toFixed(2));
    if (paymentMethod && Number.isFinite(paymentAmount) && paymentAmount > 0) {
      form.set("payment_method", paymentMethod);
      form.set("payment_amount", paymentAmount.toFixed(2));
    }
    const age = ageAt(customer?.birth_date || driver?.birth_date, contract.delivery_date);
    if (age !== null) form.set("age", String(age));
    if (requestVehicle && fleetMatch?.vehicle) {
      form.set("vehicle", String(fleetMatch.vehicle));
    }
    return form;
  }

  async function insertPartnerBooking(startValue: string, customerCode = "") {
    const officeClosed = (error: unknown) => {
      const key = normalize(error instanceof Error ? error.message : String(error));
      return key.includes("oficina pudiera estar cerrada") || key.includes("oficina puede estar cerrada") || key.includes("office may be closed");
    };
    const vehicleUnavailable = (error: unknown) => {
      const key = normalize(error instanceof Error ? error.message : String(error));
      return key.includes("no hay vehiculos disponibles") || key.includes("no vehicles available") || key.includes("vehiculo no disponible");
    };
    const fallbackStart = (() => {
      const date = String(startValue || "").slice(0, 10);
      if (!date || !latestPartnerStart) return "";
      const candidate = `${date} ${latestPartnerStart}`;
      return candidate < end ? candidate : "";
    })();

    let actualStart = startValue;
    let vehicleRequested = !!fleetMatch?.vehicle;
    const doInsert = async (value: string, withVehicle: boolean) => renthubFetch("/module/rental/api/partner/booking/insert", {
      method: "POST",
      body: buildPartnerBookingForm(value, customerCode, withVehicle),
    });

    let insertedBooking: any;
    try {
      insertedBooking = await doInsert(actualStart, vehicleRequested);
    } catch (firstError) {
      if (officeClosed(firstError) && fallbackStart && fallbackStart !== actualStart) {
        console.log(JSON.stringify({
          event: "renthub_office_hours_fallback",
          contract_number: contract.contract_number,
          requested_start: actualStart,
          retry_start: fallbackStart,
          latest_partner_start: latestPartnerStart,
          reason: firstError instanceof Error ? firstError.message : String(firstError),
        }));
        actualStart = fallbackStart;
        try {
          insertedBooking = await doInsert(actualStart, vehicleRequested);
        } catch (secondError) {
          if (vehicleRequested && vehicleUnavailable(secondError)) {
            console.log(JSON.stringify({
              event: "renthub_vehicle_assignment_fallback",
              contract_number: contract.contract_number,
              plate: contractPlate || null,
              vehicle_id: fleetMatch?.vehicle || null,
              reason: secondError instanceof Error ? secondError.message : String(secondError),
            }));
            vehicleRequested = false;
            insertedBooking = await doInsert(actualStart, false);
          } else throw secondError;
        }
      } else if (vehicleRequested && vehicleUnavailable(firstError)) {
        console.log(JSON.stringify({
          event: "renthub_vehicle_assignment_fallback",
          contract_number: contract.contract_number,
          plate: contractPlate || null,
          vehicle_id: fleetMatch?.vehicle || null,
          reason: firstError instanceof Error ? firstError.message : String(firstError),
        }));
        vehicleRequested = false;
        try {
          insertedBooking = await doInsert(actualStart, false);
        } catch (secondError) {
          if (officeClosed(secondError) && fallbackStart && fallbackStart !== actualStart) {
            console.log(JSON.stringify({
              event: "renthub_office_hours_fallback",
              contract_number: contract.contract_number,
              requested_start: actualStart,
              retry_start: fallbackStart,
              latest_partner_start: latestPartnerStart,
              reason: secondError instanceof Error ? secondError.message : String(secondError),
            }));
            actualStart = fallbackStart;
            insertedBooking = await doInsert(actualStart, false);
          } else throw secondError;
        }
      } else throw firstError;
    }

    const newCode = String(insertedBooking?.result?.booking?.code || insertedBooking?.booking?.code || insertedBooking?.code || "");
    if (!newCode) throw new Error("Renthub did not return a booking code");
    return { code: newCode, inserted: insertedBooking, vehicleRequested, actualStart };
  }

  if (action === "send") {
    let code = String(contract.renthub_contract_id || ""), inserted: any = null, updated: any = null;
    try {
      if (!code) {
        if (minimumStart && start < minimumStart) throw new Error(`Renthub no admite crear reservas con una entrega anterior a ${minimumStart}. Este contrato histórico se conserva únicamente en Larios Rental.`);
        if (expectedServices > 0.009) throw new Error(`Este contrato incluye ${expectedServices.toFixed(2)} € en seguro, conductor joven o extras. Se ha detenido el envío para no crear una reserva incompleta en Renthub hasta activar el mapeo de Servicios.`);
        if (Number(contract.discount_percent || 0) > 0) throw new Error("Este contrato tiene descuento. Se ha detenido el envío hasta confirmar el campo de descuento de la API de Renthub.");
        const missing = [!model && "model", !pickup && "pickup_location", !dropoff && "dropoff_location", !customer?.email && "customer_email", !customer?.phone && "customer_phone"].filter(Boolean);
        if (missing.length) throw new Error(`Missing Renthub mapping/data: ${missing.join(", ")}`);
        const created = await insertPartnerBooking(start);
        inserted = created.inserted;
        code = created.code;
        await requireWrite(actor.from("contracts").update({
          renthub_contract_id: code,
          renthub_sync_status: "sent_pending_verification",
          renthub_sync_error: null,
          app_payload: {
            ...(contract.app_payload || {}),
            renthub_resource: "freesale",
            renthub_pickup_location_id: pickup,
            renthub_dropoff_location_id: dropoff,
            renthub_vehicle_requested: created.vehicleRequested,
          },
        }).eq("id", contract.id), "No se pudo guardar el código de Renthub");
        let createdChecked = await verify(code, { expectedStart: created.actualStart, checkStart: true, checkPayment: true });
        const newCustomerCode = String(createdChecked.detail?.result?.customer?.code || "");
        if (newCustomerCode && customer) {
          updated = await syncPartnerCustomer(newCustomerCode, contract, customer, driver);
          createdChecked = await verify(code, { expectedStart: created.actualStart, checkStart: true, checkPayment: true });
        }
        if (!createdChecked.verified) {
          const mismatchKeys = Object.entries(createdChecked.checks).filter(([, ok]) => !ok).map(([key]) => key);
          throw new Error(`Renthub verification mismatch: ${mismatchKeys.join(", ")}`);
        }
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: "verified",
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: null,
        }).eq("id", contract.id), "No se pudo guardar la verificación de Renthub");
        return json({ verified: true, external_reference: code, checks: createdChecked.checks, vehicle_requested: created.vehicleRequested, updated });
      }

      let checked = await verify(code, { checkStart: false, checkPayment: false });
      const customerCode = String(checked.detail?.result?.customer?.code || "");
      if (customerCode && customer) {
        updated = await syncPartnerCustomer(customerCode, contract, customer, driver);
        if (customer?.id && String(customer.renthub_customer_id || "") !== customerCode) {
          await requireWrite(actor.from("customers").update({ renthub_customer_id: customerCode }).eq("id", customer.id), "No se pudo guardar el cliente Partner de Renthub");
        }
        checked = await verify(code, { checkStart: false, checkPayment: false });
      }

      const alreadyReplaced = String(contract.app_payload?.renthub_replacement_hash || "") === replacementHash;
      if (checked.verified && alreadyReplaced) {
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: "verified",
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: null,
        }).eq("id", contract.id), "No se pudo guardar la verificación de Renthub");
        return json({ verified: true, external_reference: code, already_synced: true, checks: checked.checks, updated });
      }

      if (minimumStart && replacementStart < minimumStart) {
        throw new Error(`Renthub no admite crear la reserva de sustitución con inicio ${replacementStart}. La reserva actual ${code} se mantiene sin cambios.`);
      }
      if (replacementStart >= end) {
        throw new Error(`La hora calculada de inicio ${replacementStart} no es anterior a la devolución ${end}. La reserva actual se mantiene sin cambios.`);
      }
      if (expectedServices > 0.009) throw new Error(`Este contrato incluye ${expectedServices.toFixed(2)} € en seguro, conductor joven o extras. Se ha detenido la sustitución para no crear una reserva incompleta en Renthub.`);
      if (Number(contract.discount_percent || 0) > 0) throw new Error("Este contrato tiene descuento. Se ha detenido la sustitución hasta confirmar el campo de descuento de la API de Renthub.");

      const replacement = await insertPartnerBooking(replacementStart, customerCode);

      console.log(JSON.stringify({
        event: "renthub_partner_replacement_start",
        contract_number: contract.contract_number,
        old_code: code,
        requested_replacement_start: replacementStart,
        replacement_start: replacement.actualStart,
        end,
        plate: contractPlate || null,
        vehicle_id: fleetMatch?.vehicle || null,
        payment_method: paymentMethod || null,
        payment_amount: paymentAmount,
      }));
      let replacementChecked = await verify(replacement.code, {
        expectedStart: replacement.actualStart,
        checkStart: true,
        expectedModel: model,
        checkPayment: true,
      });
      const replacementCustomerCode = String(replacementChecked.detail?.result?.customer?.code || customerCode || "");
      if (replacementCustomerCode && customer) {
        updated = await syncPartnerCustomer(replacementCustomerCode, contract, customer, driver);
        replacementChecked = await verify(replacement.code, {
          expectedStart: replacement.actualStart,
          checkStart: true,
          expectedModel: model,
          checkPayment: true,
        });
      }

      if (!replacementChecked.verified) {
        await renthubFetch(`/module/rental/api/partner/booking/cancel/${encodeURIComponent(replacement.code)}`, { method: "DELETE" }).catch(() => null);
        const mismatchKeys = Object.entries(replacementChecked.checks).filter(([, ok]) => !ok).map(([key]) => key);
        throw new Error(`La reserva nueva no pasó la verificación y se ha cancelado. La reserva original se conserva. Campos distintos: ${mismatchKeys.join(", ")}`);
      }

      const oldCode = code;
      try {
        await renthubFetch(`/module/rental/api/partner/booking/cancel/${encodeURIComponent(oldCode)}`, { method: "DELETE" });
      } catch (cancelError) {
        await renthubFetch(`/module/rental/api/partner/booking/cancel/${encodeURIComponent(replacement.code)}`, { method: "DELETE" }).catch(() => null);
        throw new Error(`No se pudo cancelar la reserva anterior. La nueva se ha cancelado para evitar duplicados. ${cancelError instanceof Error ? cancelError.message : String(cancelError)}`);
      }

      code = replacement.code;
      const replacementHistory = Array.isArray(contract.app_payload?.renthub_replacement_history) ? contract.app_payload.renthub_replacement_history : [];
      await requireWrite(actor.from("contracts").update({
        renthub_contract_id: code,
        renthub_sync_status: "verified",
        renthub_last_sync_at: new Date().toISOString(),
        renthub_sync_error: null,
        app_payload: {
          ...(contract.app_payload || {}),
          renthub_replacement_hash: replacementHash,
          renthub_replacement_start: replacement.actualStart,
          renthub_replaced_booking_code: oldCode,
          renthub_replaced_at: new Date().toISOString(),
          renthub_vehicle_requested: replacement.vehicleRequested,
          renthub_pickup_location_id: pickup,
          renthub_dropoff_location_id: dropoff,
          renthub_replacement_history: [...replacementHistory, { old_code: oldCode, new_code: code, at: new Date().toISOString() }].slice(-10),
        },
      }).eq("id", contract.id), "No se pudo guardar la reserva de sustitución");

      return json({
        verified: true,
        replaced_existing_booking: true,
        previous_external_reference: oldCode,
        external_reference: code,
        replacement_start: replacement.actualStart,
        end_datetime: end,
        checks: replacementChecked.checks,
        vehicle_requested: replacement.vehicleRequested,
        payment_method: paymentMethod || null,
        payment_amount: paymentAmount,
        updated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: "renthub_transfer_error", contract_number: contract.contract_number, external_reference: code || null, detail: message }));
      await actor.from("contracts").update({
        ...(code ? { renthub_contract_id: code } : {}),
        renthub_sync_status: code ? "verification_failed" : "failed",
        renthub_sync_error: message,
      }).eq("id", contract.id);
      return json({ error: message, external_reference: code || null }, 502);
    }
  }

  if (action === "purge") {
    if (!config.purgeReady) return json({ error: "RENTHUB_PURGE_NOT_ENABLED" }, 503);
    if (contract.renthub_sync_status !== "verified" || !contract.renthub_contract_id) return json({ error: "Verified Renthub copy required" }, 409);
    if (contract.app_payload?.renthub_document_uploaded !== true) return json({ error: "The contract PDF has not been verified in Renthub" }, 409);
    const checked = await verify(contract.renthub_contract_id);
    if (!checked.verified) return json({ error: "Renthub re-verification failed; local data was not deleted", checks: checked.checks }, 409);
    const [{ data: files }, { data: documents }, { data: damagePhotos }] = await Promise.all([
      service.from("contract_files").select("file_path").eq("contract_id", contract.id),
      service.from("documents").select("file_path").eq("contract_id", contract.id),
      service.from("damage_photos").select("file_path,damages!inner(contract_id)").eq("damages.contract_id", contract.id),
    ]);
    const contractPaths = [...new Set([contract.pdf_path, contract.customer_signature_path, ...(files || []).map((item: any) => item.file_path)].filter(Boolean))];
    const documentPaths = [...new Set([...(documents || []).map((item: any) => item.file_path), ...(damagePhotos || []).map((item: any) => item.file_path)].filter(Boolean))];
    if (contractPaths.length) { const { error } = await service.storage.from("contracts").remove(contractPaths); if (error) return json({ error: `Contract files could not be deleted: ${error.message}` }, 502); }
    if (documentPaths.length) { const { error } = await service.storage.from("documents").remove(documentPaths); if (error) return json({ error: `Document files could not be deleted: ${error.message}` }, 502); }
    const { data: purged, error: purgeError } = await service.rpc("app_purge_verified_renthub_contract", { p_contract_id: contract.id, p_external_reference: contract.renthub_contract_id, p_verification_hash: verificationHash });
    if (purgeError) return json({ error: purgeError.message }, 500);
    return json({ ...purged, verified_before_deletion: true });
  }
  return json({ error: "Unknown action" }, 400);
}

Deno.serve((req) => handler(req).catch((error) => json({ error: error instanceof Error ? error.message : String(error) }, 500)));

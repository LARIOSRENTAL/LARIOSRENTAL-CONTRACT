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
  const paymentReady = !!env("RENTHUB_USER_API_KEY") || (!!env("RENTHUB_USER_API_EMAIL") && !!env("RENTHUB_USER_API_PASSWORD"));
  const enabled = !!partnerSecret;
  return {
    enabled, ready: missing.length === 0, missing, documentReady, paymentReady,
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


let userTokenCache = "";
async function userToken(force = false) {
  const configuredApiKey = env("RENTHUB_USER_API_KEY");
  const email = env("RENTHUB_USER_API_EMAIL");
  const password = env("RENTHUB_USER_API_PASSWORD");
  if (!force && configuredApiKey) return configuredApiKey;
  if (!force && userTokenCache) return userTokenCache;
  if (force && (!email || !password) && configuredApiKey) return configuredApiKey;

  if (!email || !password) {
    throw new Error("Renthub User API no está configurada. Falta RENHUB_USER_API_KEY o las credenciales User API.");
  }

  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const response = await fetch(`${installationUrl()}/api/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  const headerToken = response.headers.get("X-UserAuthToken") ||
    response.headers.get("X-Auth-Token") ||
    response.headers.get("Authorization") || "";
  userTokenCache = String(data?.result?.token || data?.token || headerToken).replace(/^Bearer\s+/i, "");
  if (!response.ok || !userTokenCache) {
    const detail = String(data?.message || data?.error || raw || "sin detalle")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 350);
    throw new Error(`Renthub User API authentication failed (${response.status}): ${detail}`);
  }
  return userTokenCache;
}

async function userApiFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const response = await fetch(`${installationUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-UserAuthToken": await userToken(),
      ...(init.headers || {}),
    },
  });
  if (response.status === 401 && retry) {
    userTokenCache = "";
    await userToken(true);
    return userApiFetch(path, init, false);
  }
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
  if (!response.ok || data?.status === false) {
    const detail = String(data?.message || data?.error || raw || "sin detalle")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 450);
    throw new Error(`Renthub User API ${response.status} en ${path.split("?")[0]}: ${detail}`);
  }
  return data;
}

function madridDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function renthubBookingNumericId(detail: any, contract?: any) {
  const booking = detail?.result?.booking || detail?.booking || {};
  const candidates = [
    booking?.id,
    booking?.pm_id,
    booking?.booking_id,
    detail?.result?.booking_id,
    contract?.app_payload?.renthub_booking_id,
  ];
  for (const value of candidates) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return 0;
}

function paymentIdFromResponse(data: any) {
  const candidates = [
    data?.id,
    data?.result?.id,
    data?.result?.payment?.id,
    data?.payment?.id,
    data?.data?.id,
  ];
  for (const value of candidates) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return 0;
}

function userApiRows(data: any): any[] {
  const candidates = [data?.result?.data, data?.result?.items, data?.result, data?.data, data];
  for (const value of candidates) if (Array.isArray(value)) return value;
  return [];
}

function paymentInvoiceId(detail: any) {
  const root = detail?.result ?? detail;
  const direct = [
    root?.invoice_id,
    root?.rp_invoice_id,
    root?.invoice?.id,
    root?.payment?.invoice_id,
    root?.payment?.invoice?.id,
  ];
  for (const value of direct) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return 0;
}

async function findCreatedPaymentId(bookingId: number, method: string, paymentAmount: number, date: string) {
  const query = new URLSearchParams({
    created_from: `${date} 00:00`,
    created_to: `${date} 23:59`,
    method,
    payment_date_from: date,
    payment_date_to: date,
    direction: "inflow",
    type: "final_payment",
    payment_status: "all",
  });
  const data = await userApiFetch(`/module/payment/api/v1/payment?${query.toString()}`);
  const matches = userApiRows(data).filter((row: any) => {
    const rowAmount = amount(row?.amount ?? row?.rp_importo);
    const rowMethod = String(row?.method ?? row?.rp_method ?? "");
    const refId = Number(row?.refers_to_id ?? row?.reference_id ?? row?.rp_pm_id ?? row?.reservation_id ?? 0);
    return Math.abs(rowAmount - paymentAmount) <= 0.02 &&
      (!rowMethod || rowMethod === method) &&
      (!refId || refId === bookingId);
  });
  matches.sort((a: any, b: any) => Number(b?.id ?? b?.rp_id ?? 0) - Number(a?.id ?? a?.rp_id ?? 0));
  return Number(matches[0]?.id ?? matches[0]?.rp_id ?? 0) || 0;
}

async function syncRenthubAccountingPayment(contract: any, bookingDetail: any, method: string, paymentAmount: number) {
  try {
  if (!method || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { skipped: true, reason: "payment_not_configured" };
  }

  const bookingId = renthubBookingNumericId(bookingDetail, contract);
  if (!bookingId) throw new Error("Renthub no devolvió el ID numérico interno de la reserva necesario para registrar el pago.");

  const existingPaymentId = Number(contract?.app_payload?.renthub_payment_id || 0);
  if (Number.isInteger(existingPaymentId) && existingPaymentId > 0) {
    const detail = await userApiFetch(`/module/payment/api/v1/payment/${existingPaymentId}?payment_expand=all`);
    return {
      payment_id: existingPaymentId,
      booking_id: bookingId,
      existing: true,
      method,
      amount: paymentAmount,
      invoice_requested: method === "credit_card",
      invoice_id: paymentInvoiceId(detail) || null,
      detail,
    };
  }

  const date = madridDate();
  const form = new FormData();
  form.set("revenue_center", env("RENTHUB_REVENUE_CENTER_ID") || "1");
  form.set("payment_date", date);
  form.set("method", method);
  form.set("type", "final_payment");
  form.set("amount", paymentAmount.toFixed(2));
  form.set("direction", "inflow");
  form.set("inserted_from", "object");
  form.set("prepaid", "0");
  form.set("refers_to_model", "rental_reservation");
  form.set("refers_to_id", String(bookingId));
  form.set("date", date);

  // Tarjeta: cobrar y generar factura automáticamente.
  // Efectivo: registrar únicamente el cobro y dejarlo pendiente de factura.
  if (method === "credit_card") form.set("action", "take_payment_gen_invoice");

  const response = await userApiFetch("/module/payment/api/v1/payment/upsert", {
    method: "POST",
    body: form,
  });

  let paymentId = paymentIdFromResponse(response);
  if (!paymentId) paymentId = await findCreatedPaymentId(bookingId, method, paymentAmount, date);
  if (!paymentId) throw new Error("Renthub aceptó el pago pero no devolvió un ID verificable.");

  const detail = await userApiFetch(`/module/payment/api/v1/payment/${paymentId}?payment_expand=all`);
  console.log(JSON.stringify({
    event: "renthub_user_api_payment_synced",
    contract_number: contract?.contract_number,
    booking_id: bookingId,
    payment_id: paymentId,
    method,
    amount: paymentAmount,
    prepaid: 0,
    invoice_requested: method === "credit_card",
    invoice_id: paymentInvoiceId(detail) || null,
  }));

  return {
    payment_id: paymentId,
    booking_id: bookingId,
    existing: false,
    method,
    amount: paymentAmount,
    invoice_requested: method === "credit_card",
    invoice_id: paymentInvoiceId(detail) || null,
    detail,
  };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authFailure = /Renthub User API 401|token_not_valid|authentication failed|Datos de acceso no válido/i.test(message);
    if (!authFailure) throw error;
    const bookingId = renthubBookingNumericId(bookingDetail, contract) || null;
    console.error(JSON.stringify({
      event: "renthub_user_api_payment_pending_auth",
      contract_number: contract?.contract_number,
      booking_id: bookingId,
      method,
      amount: paymentAmount,
      detail: message,
    }));
    return {
      skipped: true,
      pending: true,
      reason: "user_api_auth_invalid",
      booking_id: bookingId,
      method,
      amount: paymentAmount,
      error: message,
    };
  }
}

function paymentSyncStatus(payment: any) {
  return payment?.pending ? "payment_pending" : "verified";
}

function paymentSyncError(payment: any) {
  return payment?.pending
    ? "Reserva verificada en Renthub. Pago pendiente: la autenticación User API de pagos no es válida."
    : null;
}

function paymentSyncPayload(base: any, payment: any) {
  if (payment?.payment_id) {
    return {
      ...(base || {}),
      renthub_booking_id: payment.booking_id,
      renthub_payment_id: payment.payment_id,
      renthub_payment_method: payment.method,
      renthub_payment_amount: payment.amount,
      renthub_payment_invoice_requested: payment.invoice_requested,
      renthub_payment_invoice_id: payment.invoice_id,
      renthub_payment_pending: false,
      renthub_payment_error: null,
    };
  }
  if (payment?.pending) {
    return {
      ...(base || {}),
      renthub_booking_id: payment.booking_id || base?.renthub_booking_id || null,
      renthub_payment_method: payment.method || base?.renthub_payment_method || null,
      renthub_payment_amount: payment.amount ?? base?.renthub_payment_amount ?? null,
      renthub_payment_pending: true,
      renthub_payment_error: payment.error || "user_api_auth_invalid",
    };
  }
  return base || {};
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
  if (key === "transferencia" || key === "bank_transfer" || key === "bank transfer" || key === "bonifico") return "bonifico";
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
function renthubCountryCode(value: unknown) {
  const key = normalize(String(value || "")).replace(/[^a-z]/g, "");
  const map: Record<string,string> = {
    espana:"ES",spain:"ES",argentina:"AR",hungria:"HU",hungary:"HU",francia:"FR",france:"FR",
    italia:"IT",italy:"IT",alemania:"DE",germany:"DE",deutschland:"DE",portugal:"PT",
    reino_unido:"GB",reinounido:"GB",unitedkingdom:"GB",uk:"GB",irlanda:"IE",ireland:"IE",
    belgica:"BE",belgium:"BE",paisesbajos:"NL",netherlands:"NL",holanda:"NL",suiza:"CH",switzerland:"CH",
    austria:"AT",austriaa:"AT",polonia:"PL",poland:"PL",rumania:"RO",romania:"RO",bulgaria:"BG",
    croacia:"HR",croatia:"HR",eslovaquia:"SK",slovakia:"SK",eslovenia:"SI",slovenia:"SI",
    republicacheca:"CZ",czechrepublic:"CZ",chequia:"CZ",dinamarca:"DK",denmark:"DK",suecia:"SE",sweden:"SE",
    noruega:"NO",norway:"NO",finlandia:"FI",finland:"FI",islandia:"IS",iceland:"IS",
    estadosunidos:"US",usa:"US",unitedstates:"US",canada:"CA",mexico:"MX",brasil:"BR",brazil:"BR",
    chile:"CL",uruguay:"UY",paraguay:"PY",peru:"PE",colombia:"CO",venezuela:"VE",ecuador:"EC",
    marruecos:"MA",morocco:"MA",turquia:"TR",turkey:"TR",grecia:"GR",greece:"GR"
  };
  if (/^[a-z]{2}$/i.test(String(value || "").trim())) return String(value).trim().toUpperCase();
  return map[key] || "";
}
function canonicalDate(value: unknown) {
  const raw=String(value||"").trim();
  if(!raw)return "";
  let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return raw;
}
function canonicalRenthubCountry(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const mapped = renthubCountryCode(raw);
  if (mapped && mapped !== raw.toUpperCase()) return mapped;
  const prefixed = raw.match(/^([A-Za-z]{2})\s*-/);
  if (prefixed) return prefixed[1].toUpperCase();
  return mapped || raw.toUpperCase();
}
function splitCustomerAddress(rawValue: unknown) {
  const raw = String(rawValue || "").trim().replace(/\s+/g," ").replace(/,+$/,"");
  let address=raw, city="", zip="";
  let m=raw.match(/^(\d{4,6})\s+([^,]+),\s*(.+)$/);
  if(m){ zip=m[1]; city=m[2].trim(); address=m[3].trim(); return {address,city,zip}; }
  m=raw.match(/^(.+?\b(?:NRO\.?|NO\.?|Nº|NUM\.?|NUMBER)\s*:?\s*\d+[A-Za-z]?)\s+([^,]+)$/i);
  if(m){ address=m[1].trim(); city=m[2].trim(); return {address,city,zip}; }
  m=raw.match(/^(.+?),\s*(\d{4,6})\s+([^,]+)$/);
  if(m){ address=m[1].trim(); zip=m[2]; city=m[3].trim(); return {address,city,zip}; }
  return {address,city,zip};
}

function detailHasContactValue(detail: any, kind: "email" | "phone", wanted: string) {
  const wantedEmail = String(wanted || "").trim().toLowerCase();
  const wantedPhone = String(wanted || "").replace(/\D/g, "");
  if (kind === "email" && !wantedEmail) return false;
  if (kind === "phone" && !wantedPhone) return false;

  const matchesPrimitive = (value: any, path: string[]) => {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    if (kind === "email") {
      const isEmailField = path.some((part) => part.includes("email"));
      return isEmailField && raw.toLowerCase() === wantedEmail;
    }
    const isPhoneField = path.some((part) =>
      part.includes("phone") || part.includes("mobile") || part.includes("telephone") ||
      part.includes("telefono") || part.includes("cell")
    );
    const digits = raw.replace(/\D/g, "");
    return isPhoneField && !!digits &&
      (digits === wantedPhone || wantedPhone.endsWith(digits) || digits.endsWith(wantedPhone));
  };

  const visit = (value: any, path: string[], depth: number): boolean => {
    if (depth > 8 || value == null) return false;
    if (typeof value !== "object") return matchesPrimitive(value, path);
    if (Array.isArray(value)) return value.some((item) => visit(item, path, depth + 1));

    return Object.entries(value).some(([key, item]) =>
      visit(item, [...path, key.toLowerCase()], depth + 1)
    );
  };

  return visit(detail, [], 0);
}

async function syncPartnerCustomer(customerCode: string, contract: any, customer: any, driver: any) {
  if (!customerCode || !customer) return null;
  const payload = contract?.app_payload || {};
  const names = splitName(customer.full_name || payload.customer_name);
  const phone = splitPhone(customer.phone || payload.customer_phone);

  const identityDocument = String(customer?.document_number || payload.customer_document || "").trim();
  const licenceNumber = String(driver?.licence_number || payload.driving_license || "").trim();
  const licenceIssuedBy = String(driver?.licence_country || payload.license_issued_by || "").trim();
  const licenceCountryCode = renthubCountryCode(licenceIssuedBy);
  const licenceIssueDate = String(driver?.issue_date || payload.license_issue || "").trim();
  const licenceExpiry = String(driver?.expiry_date || payload.license_expiry || "").trim();
  const birthDate = String(customer.birth_date || driver?.birth_date || payload.customer_birth_date || "").trim();
  const email = String(customer.email || payload.customer_email || "").trim();

  // Renthub crea una nueva fila de contacto si reenviamos email/teléfono en cada actualización.
  // Consultamos primero la ficha y solo enviamos el contacto si todavía no existe.
  const beforeResponse = await renthubFetch(`/api/partner/customer/details/${encodeURIComponent(customerCode)}`);
  const before = beforeResponse?.result || {};
  const fullPhone = `${phone.prefix}${phone.mobile}`;
  const emailAlreadyPresent = detailHasContactValue(before, "email", email);
  const phoneAlreadyPresent = detailHasContactValue(before, "phone", fullPhone);

  const body: Record<string, unknown> = {
    contact_type: "private",
    name: names.name,
    surname: names.surname,
    contact_lang: "es",
  };
  if (email && !emailAlreadyPresent) body.email = email;
  if (phone.mobile && !phoneAlreadyPresent) {
    body.mobile_prefix = phone.prefix;
    body.mobile = phone.mobile;
  }

  const parsedAddress = splitCustomerAddress(customer.address || payload.customer_address || "");
  const customerCountry = renthubCountryCode(customer.country || payload.customer_nationality || licenceIssuedBy);
  const address = String(parsedAddress.address || "").trim();
  const city = String(customer.city || parsedAddress.city || "").trim();
  const zip = String(customer.postal_code || parsedAddress.zip || "").trim();
  if (address) body.address = address;
  if (city) body.city = city;
  if (zip) body.zip = zip;
  if (customerCountry) body.country = customerCountry;
  if (birthDate) body.birth_date = birthDate;

  // Ficha anagráfica de Renthub:
  // - tax_code -> DNI/NIE
  // - id_number -> Número de documento de identidad
  if (identityDocument) {
    body.tax_code = identityDocument;
    body.id_number = identityDocument;
  }

  // Datos del permiso. "driving_license_issued_by" mantiene el texto visible
  // y "license_issue_country" alimenta el desplegable Estado de emisión.
  if (licenceNumber) body.driving_license_number = licenceNumber;
  if (licenceIssuedBy) body.driving_license_issued_by = licenceIssuedBy;
  if (licenceCountryCode) body.license_issue_country = licenceCountryCode;
  if (licenceIssueDate) body.driving_license_issued_at = licenceIssueDate;
  if (licenceExpiry) body.driving_license_exp = licenceExpiry;

  const response = await renthubFetch(`/api/partner/customer/update/${encodeURIComponent(customerCode)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const detailResponse = await renthubFetch(`/api/partner/customer/details/${encodeURIComponent(customerCode)}`);
  const detail = detailResponse?.result || {};

  const detailValue = (...keys: string[]) => {
    for (const key of keys) {
      const value = detail?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    }
    return "";
  };
  const returnedTaxCode = detailValue("tax_code", "fiscal_code");
  const returnedIdentity = detailValue("id_number", "document_number", "identity_document_number");
  const returnedLicenceCountry = detailValue("license_issue_country", "driving_license_issue_country", "driving_license_country");

  const customerChecks: Record<string, boolean> = {
    birth_date: !birthDate || canonicalDate(detail.birth_date) === canonicalDate(birthDate),
    license_number: !licenceNumber || normalize(detail.license_number) === normalize(licenceNumber),
    license_issued_by: !licenceIssuedBy || normalize(detail.license_issued_by) === normalize(licenceIssuedBy),
    license_issue_date: !licenceIssueDate || canonicalDate(detail.license_issue_date) === canonicalDate(licenceIssueDate),
    license_expiration: !licenceExpiry || canonicalDate(detail.license_expiration) === canonicalDate(licenceExpiry),
    address: !address || normalize(detail.address) === normalize(address),
    city: !city || normalize(detail?.city?.name ?? detail.city) === normalize(city),
    email_present: !email || detailHasContactValue(detail, "email", email),
    phone_present: !phone.mobile || detailHasContactValue(detail, "phone", fullPhone),
    tax_code: !identityDocument || !returnedTaxCode || normalize(returnedTaxCode) === normalize(identityDocument),
    id_number: !identityDocument || !returnedIdentity || normalize(returnedIdentity) === normalize(identityDocument),
    license_issue_country: !licenceCountryCode || !returnedLicenceCountry ||
      canonicalRenthubCountry(returnedLicenceCountry) === canonicalRenthubCountry(licenceCountryCode),
  };

  if (!Object.values(customerChecks).every(Boolean)) {
    const failed = Object.entries(customerChecks).filter(([, ok]) => !ok).map(([key]) => key);
    throw new Error(`Renthub no conservó correctamente estos datos del cliente: ${failed.join(", ")}`);
  }

  console.log(JSON.stringify({
    event: "renthub_partner_customer_sync",
    customer_code: customerCode,
    customer_checks: customerChecks,
    has_zip: !!zip,
    country_sent: customerCountry || null,
    identity_document_sent: !!identityDocument,
    licence_country_code_sent: licenceCountryCode || null,
    skipped_existing_email: emailAlreadyPresent,
    skipped_existing_phone: phoneAlreadyPresent,
  }));

  return { update: response, detail: detailResponse, checks: customerChecks };
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
    // Los grupos visibles de la app deben traducirse a las claves internas de Renthub:
    // 50cc -> M1, 125cc -> M2, BICICLETA -> B1, E-BIKE -> B2.
    model: modelMap[target] || modelMap[group] || modelMap[normalize(contract.category)] || "",
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
    payment_api_configured: config.paymentReady,
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
  // Renthub must receive the final contract total as a single rental amount.
  // Insurance, young driver, extras and discounts remain internal breakdowns in Larios Rental.
  const renthubRentalRate = netFromGross(expectedTotal, contract.vat_percent);
  const pricelist = renthubPricelist(contract);
  const verificationHash = await digest({ contract_id: contract.id, start, end, model: verificationModel, pickup, dropoff, pricelist, total_gross: expectedTotal, total_net: renthubRentalRate, deposit: Number(contract.deposit || 0), resource: "freesale" });

  const replacementStart = renthubReplacementStart(contract);
  const paymentMethod = partnerPaymentMethod(contract.payment_method || contract.app_payload?.payment_method);
  const paymentAmount = amount(contract.total || contract.app_payload?.total);
  const desiredFranchise = Math.max(0, amount(contract.app_payload?.franchise ?? contract.franchise ?? 0));
  const replacementHash = await digest({
    contract_id: contract.id,
    replacement_start: replacementStart,
    end,
    total: expectedTotal,
    model,
    pickup,
    dropoff,
    pickup_at_location: pickupAddress || "",
    dropoff_at_location: dropoffAddress || "",
    plate: contractPlate || "",
    vehicle: fleetMatch?.vehicle || "",
    vehicle_model: fleetMatch?.model || "",
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
      const parsedAddress = splitCustomerAddress(customer?.address || contract.app_payload?.customer_address || "");
      const customerCountry = renthubCountryCode(customer?.country || contract.app_payload?.customer_nationality || driver?.licence_country || contract.app_payload?.license_issued_by);
      if (parsedAddress.address) form.set("address", parsedAddress.address);
      if (customer?.city || parsedAddress.city) form.set("city", String(customer?.city || parsedAddress.city));
      if (customer?.postal_code || parsedAddress.zip) form.set("zip", String(customer?.postal_code || parsedAddress.zip));
      if (customerCountry) form.set("country", customerCountry);
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
    if (pickupAddress) form.set("pickup_at_location", pickupAddress);
    if (dropoffAddress) form.set("dropoff_at_location", dropoffAddress);
    const locationNotes = [
      isReplacementBooking && realStartLabel ? `HORA REAL DE INICIO DE LA RESERVA: ${realStartLabel}` : "",
      contractPlate ? `MATRICULA DEL VEHICULO: ${contractPlate}` : "",
    ].filter(Boolean).join("\n");
    if (locationNotes) form.set("notes", locationNotes);
    form.set("booking_type", "booking");
    form.set("send_confirmation_email", "0");
    form.set("ignore_availability", "true");
    form.set("pricelist", pricelist);
    form.set("overwrite_rental_rate", renthubRentalRate.toFixed(4));
    form.set("overwrite_deposit", Number(contract.deposit || 0).toFixed(2));
    if (desiredFranchise > 0) form.set("overwrite_damage_franchise", desiredFranchise.toFixed(2));
    // El pago ya no se envía con la reserva Partner: Renthub lo trataría como prepaid.
    // Se registra después mediante la User API de Payment para que sea un cobro contable real.
    const age = ageAt(customer?.birth_date || driver?.birth_date, contract.delivery_date);
    if (age !== null) form.set("age", String(age));
    if (requestVehicle && fleetMatch?.vehicle) {
      form.set("vehicle", String(fleetMatch.vehicle));
    }
    return form;
  }


  const renthubPanelDate = (value: unknown) => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || "");
  };

  async function updateExistingRenthubBooking(detail: any) {
    const booking = detail?.result?.booking || {};
    const bookingId = String(booking?.id || "");
    const registryId = String(detail?.result?.customer?.id || "");
    if (!bookingId) throw new Error("Renthub no devolvió el ID interno de la reserva existente.");
    if (!registryId) throw new Error("Renthub no devolvió el ID interno del cliente de la reserva existente.");
    if (!fleetMatch?.vehicle) throw new Error("No se encontró el vehículo asignado en la flota de Renthub.");

    const form = new URLSearchParams();
    const values: Record<string,string> = {
      dr_group: crypto.randomUUID(),
      dr_to_delete: "",
      booking_id: bookingId,
      pm_internal_move: "0",
      pm_cancel_reason_id: "",
      calc_auto_tar: "non_attivo",
      pm_imr_id: "",
      pm_stato_prenotazione: "in_corso",
      pm_list_id: String(booking?.pricelist?.id || pricelist || "1"),
      pm_tariffa_manuale: "0",
      pm_monthly_fee: "0",
      pm_monthly_duration: "0",
      tariffa_tot: renthubRentalRate.toFixed(4),
      pm_advance: "0",
      costo_servizi_with_vat: "0",
      costo_servizi: "0",
      pm_costo_km_extra: "0",
      pm_pickup_delivery_price: "0",
      pm_discount: "0",
      pm_addebito_fuori_orario: "0",
      pm_addebito_benzina: "0",
      pm_addebito_franchigia: "0",
      pm_addebito_consegna_altro_luogo: "0",
      pm_vat_key: String(contract.vat_percent || 21),
      pm_cauzione: Number(contract.deposit || 0).toFixed(2),
      pm_franchigia: "0",
      pm_franchigia_danni: desiredFranchise.toFixed(2),
      pm_franchigia_rca: "0",
      pm_prev_mezzo_id: String(model),
      pm_ms_id: String(fleetMatch.vehicle),
      pm_operatore_apertura: env("RENTHUB_OPERATOR_ID") || "4",
      pm_operatore_chiusura: "",
      pm_payment_method: "",
      pm_deposit_payment_method: "",
      pm_ritiro_l_id: String(pickup),
      pm_consegna_l_id: String(dropoff),
      pickup_at_location: String(pickupAddress || ""),
      dropoff_at_location: String(dropoffAddress || ""),
      pm_consegna_effettiva_l_id: "",
      pm_data_inizio: renthubPanelDate(String(contract.delivery_date || "").slice(0,10)),
      pm_ora_inizio: String(contract.delivery_time || "").slice(0,5),
      pm_actual_end_date: "",
      pm_actual_end_time: "",
      pm_data_fine: renthubPanelDate(String(contract.return_date || "").slice(0,10)),
      pm_ora_fine: String(contract.return_time || "").slice(0,5),
      pm_benzina_ritiro: "4",
      pm_benzina_consegna: "",
      pm_km_included: String(booking?.kms?.included || 0),
      pm_extra_km_price: String(booking?.kms?.extra_km_price?.without_tax || 0),
      pm_km_iniziali: String(contract.current_km || 0),
      pm_km_finali: "0",
      pm_flight_number: "",
      pm_flight_time: "",
      pm_pre_auth_code: "",
      pm_lang_key: "es_ES",
      pm_fattura_necessaria: "1",
      pm_sectional_id: "",
      pm_auto_charge_dispute: "1",
      pm_automatic_send_cargos: "1",
      pm_note: String(booking?.note || booking?.notes || ""),
      pm_dettagli_contr_prev: "",
      anag_id: registryId,
      anag_disabled: "1",
      com_id: "",
      "type_anag_telefono[0]": "cell",
      "card-cardgroup": crypto.randomUUID(),
      pm_out_notes: "",
      pm_in_notes: "",
      sharedDamageDatatable_length: "10",
      payment_reference_group: "",
      payment_reference_id: bookingId,
      payment_reference_type: "pm",
      substitutionDatatable_length: "10",
      checklist_out_active: "0",
      checklist_in_active: "0",
      pm_contract_model: "",
      pm_preventivo: "rental_prev_std",
      refresh_reference_coverage_on_save: "0",
      pm_id: bookingId,
      booking_opened_at: String(booking?.created_at || ""),
      print_contract: "0",
      test_contract: "0",
      out_img: "",
      in_img: "",
      print_preventivo: "0",
      pm_voucher_model: "rental_voucher",
      operator_code: "false",
    };
    Object.entries(values).forEach(([key,value]) => form.append(key,value));
    for (const serviceItem of Array.isArray(booking?.services) ? booking.services : []) {
      const serviceId = String(serviceItem?.id || "");
      if (!serviceId) continue;
      form.append(`sa[${serviceId}]`, String(serviceItem?.quantity || 1));
      form.append(`sa_price[${serviceId}]`, String(serviceItem?.rate?.without_tax || 0));
      form.append(`sa_tariffazione[${serviceId}]`, ["fix","fixed"].includes(String(serviceItem?.rate_type || "").toLowerCase()) ? "fissa" : "giornaliera");
      form.append(`sa_max_days[${serviceId}]`, String(serviceItem?.max_days || 0));
    }

    const response = await fetch(`${installationUrl()}/rental/booking/add`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-PartnerToken": await partnerToken(),
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = raw.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,500); }

    console.log(JSON.stringify({
      event: "renthub_existing_booking_updated",
      contract_number: contract.contract_number,
      booking_code: String(booking?.code || contract.renthub_contract_id || ""),
      booking_id: bookingId,
      status: response.status,
      model_id: String(model),
      vehicle_id: String(fleetMatch.vehicle),
      pickup_location: String(pickup),
      dropoff_location: String(dropoff),
      start,
      end,
      deposit: Number(contract.deposit || 0),
      damage_franchise: desiredFranchise,
    }));

    if (!response.ok || String(data?.id || "") !== bookingId) {
      throw new Error(`Renthub rechazó la actualización de la reserva existente (${response.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
    }
    return { booking_id: bookingId, vehicle_id: String(fleetMatch.vehicle), response: data };
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
    if (!contract.renthub_contract_id) {
      return json({
        error: "Esta reserva no está enlazada con una reserva de Renthub. Marca «Registrar reserva en Renthub» al crearla si quieres vincularla.",
        linked_renthub_booking_required: true,
      }, 409);
    }
    let code = String(contract.renthub_contract_id || ""), inserted: any = null, updated: any = null, payment: any = null;
    try {
      if (!code) {
        if (minimumStart && start < minimumStart) throw new Error(`Renthub no admite crear reservas con una entrega anterior a ${minimumStart}. Este contrato histórico se conserva únicamente en Larios Rental.`);
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
        let createdChecked = await verify(code, { expectedStart: created.actualStart, checkStart: true, checkPayment: false });
        const newCustomerCode = String(createdChecked.detail?.result?.customer?.code || "");
        if (newCustomerCode && customer) {
          updated = await syncPartnerCustomer(newCustomerCode, contract, customer, driver);
          createdChecked = await verify(code, { expectedStart: created.actualStart, checkStart: true, checkPayment: false });
        }
        if (!createdChecked.verified) {
          const mismatchKeys = Object.entries(createdChecked.checks).filter(([, ok]) => !ok).map(([key]) => key);
          throw new Error(`Renthub verification mismatch: ${mismatchKeys.join(", ")}`);
        }
        payment = await syncRenthubAccountingPayment(contract, createdChecked.detail, paymentMethod, paymentAmount);
        const createdPaymentPayload = paymentSyncPayload(contract.app_payload || {}, payment);
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: paymentSyncStatus(payment),
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: paymentSyncError(payment),
          app_payload: createdPaymentPayload,
        }).eq("id", contract.id), "No se pudo guardar la verificación de Renthub");
        return json({
          verified: true,
          payment_pending: !!payment?.pending,
          external_reference: code,
          checks: createdChecked.checks,
          vehicle_requested: created.vehicleRequested,
          updated,
          payment,
        });
      }

      let checked = await verify(code, { checkStart: false, checkPayment: false });

      // Si Renthub ya tiene la reserva en curso, se considera gestionada manualmente allí.
      // No enviamos más cambios por API, no creamos pagos y no intentamos cancelar/sustituir la reserva.
      const currentRenthubStatus = normalize(
        checked.booking?.status ||
        checked.booking?.state ||
        checked.booking?.booking_status ||
        checked.booking?.pm_stato_prenotazione ||
        ""
      );
      if (["in_progress", "in corso", "in_corso"].includes(currentRenthubStatus)) {
        const managedPayload = {
          ...(contract.app_payload || {}),
          renthub_managed_in_renthub: true,
          renthub_detected_status: currentRenthubStatus,
          renthub_booking_id: renthubBookingNumericId(checked.detail, contract) || null,
          renthub_managed_in_renthub_at: new Date().toISOString(),
        };
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: "managed_in_renthub",
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: null,
          app_payload: managedPayload,
        }).eq("id", contract.id), "No se pudo guardar el estado de reserva gestionada en Renthub");
        console.log(JSON.stringify({
          event: "renthub_booking_already_in_progress",
          contract_number: contract.contract_number,
          booking_code: code,
          booking_id: renthubBookingNumericId(checked.detail, contract) || null,
          status: currentRenthubStatus,
          api_write_skipped: true,
        }));
        return json({
          verified: true,
          managed_in_renthub: true,
          skipped: true,
          reason: "booking_in_progress",
          external_reference: code,
          renthub_status: currentRenthubStatus,
          message: "La reserva ya está en curso en Renthub y se gestiona allí. No se ha enviado ni modificado nada por API.",
        });
      }

      const customerCode = String(checked.detail?.result?.customer?.code || "");
      if (customerCode && customer) {
        updated = await syncPartnerCustomer(customerCode, contract, customer, driver);
        if (customer?.id && String(customer.renthub_customer_id || "") !== customerCode) {
          await requireWrite(actor.from("customers").update({ renthub_customer_id: customerCode }).eq("id", customer.id), "No se pudo guardar el cliente Partner de Renthub");
        }
        checked = await verify(code, { checkStart: false, checkPayment: false });
      }

      if (checked.verified && contract.renthub_sync_status === "payment_pending") {
        payment = await syncRenthubAccountingPayment(contract, checked.detail, paymentMethod, paymentAmount);
        const retryPayload = paymentSyncPayload(contract.app_payload || {}, payment);
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: paymentSyncStatus(payment),
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: paymentSyncError(payment),
          app_payload: retryPayload,
        }).eq("id", contract.id), "No se pudo guardar el reintento del pago de Renthub");
        return json({
          verified: true,
          payment_pending: !!payment?.pending,
          payment_retry_only: true,
          external_reference: code,
          checks: checked.checks,
          updated,
          payment,
        });
      }

      const alreadyReplaced = String(contract.app_payload?.renthub_replacement_hash || "") === replacementHash;
      if (checked.verified && alreadyReplaced) {
        payment = await syncRenthubAccountingPayment(contract, checked.detail, paymentMethod, paymentAmount);
        const paymentPayload = paymentSyncPayload(contract.app_payload || {}, payment);
        await requireWrite(actor.from("contracts").update({
          renthub_sync_status: paymentSyncStatus(payment),
          renthub_last_sync_at: new Date().toISOString(),
          renthub_sync_error: paymentSyncError(payment),
          app_payload: paymentPayload,
        }).eq("id", contract.id), "No se pudo guardar la verificación de Renthub");
        return json({
          verified: true,
          payment_pending: !!payment?.pending,
          external_reference: code,
          already_synced: true,
          checks: checked.checks,
          updated,
          payment,
        });
      }

      // Una reserva confirmada/en curso no debe sustituirse intentando cancelarla.
      // Primero actualizamos la misma reserva mediante el endpoint interno ya capturado.
      if (!checked.verified) {
        const currentStatus = normalize(checked.booking?.status || checked.booking?.state || checked.booking?.booking_status || checked.booking?.pm_stato_prenotazione || "");
        const lockedExisting = ["in_progress","confirmed","in corso","in_corso"].includes(currentStatus);
        try {
          updated = await updateExistingRenthubBooking(checked.detail);
          checked = await verify(code, { checkStart: false, checkPayment: false });
          const refreshedCustomerCode = String(checked.detail?.result?.customer?.code || customerCode || "");
          if (refreshedCustomerCode && customer) {
            await syncPartnerCustomer(refreshedCustomerCode, contract, customer, driver);
            checked = await verify(code, { checkStart: false, checkPayment: false });
          }
          if (checked.verified) {
            payment = await syncRenthubAccountingPayment(contract, checked.detail, paymentMethod, paymentAmount);
            const updatedPayload = paymentSyncPayload({
              ...(contract.app_payload || {}),
              renthub_updated_existing_booking_at: new Date().toISOString(),
            }, payment);
            await requireWrite(actor.from("contracts").update({
              renthub_sync_status: paymentSyncStatus(payment),
              renthub_last_sync_at: new Date().toISOString(),
              renthub_sync_error: paymentSyncError(payment),
              app_payload: updatedPayload,
            }).eq("id", contract.id), "No se pudo guardar la actualización de Renthub");
            return json({
              verified: true,
              payment_pending: !!payment?.pending,
              external_reference: code,
              updated_existing_booking: true,
              checks: checked.checks,
              updated,
              payment,
            });
          }
          if (lockedExisting) {
            const mismatchKeys = Object.entries(checked.checks).filter(([,ok]) => !ok).map(([key]) => key);
            throw new Error(`Renthub actualizó la reserva existente, pero la verificación todavía difiere en: ${mismatchKeys.join(", ")}. No se ha creado ninguna reserva duplicada.`);
          }
        } catch (updateError) {
          if (lockedExisting) {
            throw new Error(`Renthub no permite cancelar esta reserva confirmada/en curso y la actualización directa no pudo completarse. La reserva original se conserva sin duplicados. ${updateError instanceof Error ? updateError.message : String(updateError)}`);
          }
          console.warn(JSON.stringify({
            event: "renthub_existing_booking_update_fallback",
            contract_number: contract.contract_number,
            booking_code: code,
            reason: updateError instanceof Error ? updateError.message : String(updateError),
          }));
        }
      }

      if (minimumStart && replacementStart < minimumStart) {
        throw new Error(`Renthub no admite crear la reserva de sustitución con inicio ${replacementStart}. La reserva actual ${code} se mantiene sin cambios.`);
      }
      if (replacementStart >= end) {
        throw new Error(`La hora calculada de inicio ${replacementStart} no es anterior a la devolución ${end}. La reserva actual se mantiene sin cambios.`);
      }
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
        checkPayment: false,
      });
      const replacementCustomerCode = String(replacementChecked.detail?.result?.customer?.code || customerCode || "");
      if (replacementCustomerCode && customer) {
        updated = await syncPartnerCustomer(replacementCustomerCode, contract, customer, driver);
        replacementChecked = await verify(replacement.code, {
          expectedStart: replacement.actualStart,
          checkStart: true,
          expectedModel: model,
          checkPayment: false,
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
      payment = await syncRenthubAccountingPayment(contract, replacementChecked.detail, paymentMethod, paymentAmount);
      const replacementHistory = Array.isArray(contract.app_payload?.renthub_replacement_history) ? contract.app_payload.renthub_replacement_history : [];
      const replacementPayload = paymentSyncPayload({
        ...(contract.app_payload || {}),
        renthub_replacement_hash: replacementHash,
        renthub_replacement_start: replacement.actualStart,
        renthub_replaced_booking_code: oldCode,
        renthub_replaced_at: new Date().toISOString(),
        renthub_vehicle_requested: replacement.vehicleRequested,
        renthub_pickup_location_id: pickup,
        renthub_dropoff_location_id: dropoff,
        renthub_replacement_history: [...replacementHistory, { old_code: oldCode, new_code: code, at: new Date().toISOString() }].slice(-10),
      }, payment);
      await requireWrite(actor.from("contracts").update({
        renthub_contract_id: code,
        renthub_sync_status: paymentSyncStatus(payment),
        renthub_last_sync_at: new Date().toISOString(),
        renthub_sync_error: paymentSyncError(payment),
        app_payload: replacementPayload,
      }).eq("id", contract.id), "No se pudo guardar la reserva de sustitución");

      return json({
        verified: true,
        payment_pending: !!payment?.pending,
        replaced_existing_booking: true,
        previous_external_reference: oldCode,
        external_reference: code,
        replacement_start: replacement.actualStart,
        end_datetime: end,
        checks: replacementChecked.checks,
        vehicle_requested: replacement.vehicleRequested,
        payment_method: paymentMethod || null,
        payment_amount: paymentAmount,
        payment,
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

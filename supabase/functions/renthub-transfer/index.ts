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
async function loadPartnerSecret(service: any) {
  if (partnerSecret) return partnerSecret;
  const { data, error } = await service.rpc("app_get_renthub_secret");
  if (!error && data) partnerSecret = String(data).trim();
  return partnerSecret;
}
function configuration() {
  const missing = partnerSecret ? [] : ["RENTHUB_SECRET_TOKEN"];
  const documentReady = !!env("RENTHUB_USER_API_KEY") || (!!env("RENTHUB_USER_API_EMAIL") && !!env("RENTHUB_USER_API_PASSWORD"));
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

let userTokenCache = "";
async function userToken(force = false) {
  const configuredApiKey = env("RENTHUB_USER_API_KEY");
  if (configuredApiKey) return configuredApiKey;
  if (!force && userTokenCache) return userTokenCache;
  const base = installationUrl(), form = new FormData();
  form.set("email", env("RENTHUB_USER_API_EMAIL")); form.set("password", env("RENTHUB_USER_API_PASSWORD"));
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Accept: "application/json" }, body: form });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  const headerToken = response.headers.get("X-UserAuthToken") || response.headers.get("X-Auth-Token") || response.headers.get("Authorization") || "";
  userTokenCache = String(data?.result?.token || data?.token || headerToken).replace(/^Bearer\s+/i, "");
  if (!response.ok || !userTokenCache) {
    const validation = data?.errors && typeof data.errors === "object"
      ? Object.values(data.errors).flat().map(String).join(" ")
      : "";
    const detail = String(validation || data?.message || data?.error || raw || "sin detalle")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    console.error(JSON.stringify({ event: "renthub_user_auth_error", status: response.status, email_present: !!env("RENTHUB_USER_API_EMAIL"), password_present: !!env("RENTHUB_USER_API_PASSWORD"), detail }));
    throw new Error(`Renthub user API authentication failed (${response.status}): ${detail}`);
  }
  return userTokenCache;
}

async function userApiFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const response = await fetch(`${installationUrl()}${path}`, {
    ...init,
    headers: { Accept: "application/json", "X-UserAuthToken": await userToken(), ...(init.headers || {}) },
  });
  if (response.status === 401 && retry) { await userToken(true); return userApiFetch(path, init, false); }
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
  if (!response.ok || data?.status === false) {
    const detail = String(data?.message || data?.error || raw || "sin detalle").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    throw new Error(`Renthub User API ${response.status} en ${path.split("?")[0]}: ${detail}`);
  }
  return data;
}

function arrayResult(data: any): any[] {
  const value = data?.result?.data ?? data?.result?.items ?? data?.result ?? data?.data ?? data;
  return Array.isArray(value) ? value : [];
}
const plateKey = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function renthubVehicleByPlate(registration: string) {
  const data = await userApiFetch("/en_GB/module/vehicle/api/v1/vehicle?vehicle_expand=model&vehicle_model_expand=type,category&per_page=1000");
  const wanted = plateKey(registration);
  const row = arrayResult(data).find((item: any) => plateKey(item?.registration || item?.plate || item?.license_plate || item?.number_plate || item?.targa || item?.ms_targa) === wanted);
  if (!row?.id) throw new Error(`No se encontró la matrícula ${registration} en la flota de Renthub.`);
  return row;
}

async function createRenthubRegistry(customer: any, driver: any) {
  const names = splitName(customer?.full_name), phone = splitPhone(customer?.phone), form = new FormData();
  form.set("type", "private"); form.set("name", names.name); form.set("surname", names.surname);
  form.set("tax_code", String(customer?.document_number || driver?.licence_number || ""));
  form.set("favorite", "0"); form.set("marketing_consent", "0");
  form.set("telephones[0][prefix]", phone.prefix); form.set("telephones[0][number]", phone.mobile);
  form.set("telephones[0][is_cell]", "1"); form.set("telephones[0][preferred]", "1");
  form.set("emails[0][email]", String(customer?.email || "")); form.set("emails[0][preferred]", "1");
  if (customer?.address) form.set("address", String(customer.address));
  if (customer?.birth_date || driver?.birth_date) form.set("birth_date", String(customer?.birth_date || driver?.birth_date));
  if (customer?.nationality) form.set("citizenship", String(customer.nationality));
  if (customer?.document_number) form.set("id_number", String(customer.document_number));
  if (driver?.licence_number) form.set("license_number", String(driver.licence_number));
  if (driver?.licence_country) form.set("license_issue_country", String(driver.licence_country));
  if (driver?.issue_date) form.set("license_issue_date", String(driver.issue_date));
  if (driver?.expiry_date) form.set("license_expiration", String(driver.expiry_date));
  const data = await userApiFetch("/module/registry/api/v1/registry", { method: "POST", body: form });
  const registry = data?.result?.registry ?? data?.result ?? data?.data ?? data;
  const id = typeof registry === "string" || typeof registry === "number" ? registry : registry?.id ?? registry?.anag_id;
  if (!id) throw new Error("Renthub creó el cliente pero no devolvió su identificador.");
  return { id: String(id), code: String(registry?.code || "") };
}

const renthubDate = (value: unknown) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
};
function bookingUpdatePayload(contract: any, detail: any, registryId: string, renthubVehicleId: string) {
  const booking = detail?.result?.booking || {}, model = detail?.result?.vehicle || detail?.result?.model || {};
  const bookingId = String(booking.id || ""), modelId = String(model.id || booking.pm_current_model_id || "");
  if (!bookingId || !modelId) throw new Error("Renthub no devolvió el ID de reserva o modelo necesario para actualizar.");
  const pickup = String(booking.pickup_location?.id || "132"), dropoff = String(booking.dropoff_location?.id || pickup);
  const fallbackAddress = String(contract.contract_number) === "62831" ? "PRUEBA LARIOS RENTAL" : "";
  const pickupAddress = String(contract.delivery_location || contract.app_payload?.pickup_location || fallbackAddress).trim();
  const dropoffAddress = String(contract.return_location || contract.app_payload?.return_location || pickupAddress).trim();
  const form = new URLSearchParams(), values: Record<string, string> = {
    dr_group: crypto.randomUUID(), dr_to_delete: "", booking_id: bookingId, pm_internal_move: "0",
    pm_cancel_reason_id: "", calc_auto_tar: "non_attivo", pm_imr_id: "", pm_stato_prenotazione: "in_corso",
    pm_list_id: String(booking.pricelist?.id || "1"), pm_tariffa_manuale: "0", pm_monthly_fee: "0", pm_monthly_duration: "0",
    tariffa_tot: netFromGross(contract.total, contract.vat_percent).toFixed(4), pm_advance: "0",
    costo_servizi_with_vat: "0", costo_servizi: "0", pm_costo_km_extra: "0", pm_pickup_delivery_price: "0", pm_discount: "0",
    pm_addebito_fuori_orario: "0", pm_addebito_benzina: "0", pm_addebito_franchigia: "0", pm_addebito_consegna_altro_luogo: "0",
    pm_vat_key: String(contract.vat_percent || 21), pm_cauzione: String(contract.deposit || 0), pm_franchigia: "0",
    pm_franchigia_danni: String(contract.app_payload?.franchise ?? contract.franchise ?? booking.franchises?.damage ?? 0), pm_franchigia_rca: "0",
    pm_prev_mezzo_id: modelId, pm_ms_id: renthubVehicleId, pm_operatore_apertura: env("RENTHUB_OPERATOR_ID") || "4", pm_operatore_chiusura: "",
    pm_payment_method: "", pm_deposit_payment_method: "", pm_ritiro_l_id: pickup, pm_consegna_l_id: dropoff,
    pickup_at_location: pickupAddress, dropoff_at_location: dropoffAddress, pm_consegna_effettiva_l_id: "",
    pm_data_inizio: renthubDate(contract.delivery_date), pm_ora_inizio: String(contract.delivery_time || "").slice(0, 5),
    pm_actual_end_date: "", pm_actual_end_time: "", pm_data_fine: renthubDate(contract.return_date), pm_ora_fine: String(contract.return_time || "").slice(0, 5),
    pm_benzina_ritiro: "4", pm_benzina_consegna: "", pm_km_included: String(booking.kms?.included || 0),
    pm_extra_km_price: String(booking.kms?.extra_km_price?.without_tax || 0), pm_km_iniziali: String(contract.current_km || 0), pm_km_finali: "0",
    pm_flight_number: "", pm_flight_time: "", pm_pre_auth_code: "", pm_lang_key: "es_ES", pm_fattura_necessaria: "1",
    pm_sectional_id: "", pm_auto_charge_dispute: "1", pm_automatic_send_cargos: "1", pm_note: "", pm_dettagli_contr_prev: "",
    anag_id: registryId, anag_disabled: "1", com_id: "", "type_anag_telefono[0]": "cell", "card-cardgroup": crypto.randomUUID(),
    pm_out_notes: "", pm_in_notes: "", sharedDamageDatatable_length: "10", payment_reference_group: "",
    payment_reference_id: bookingId, payment_reference_type: "pm", substitutionDatatable_length: "10", checklist_out_active: "0", checklist_in_active: "0",
    pm_contract_model: "", pm_preventivo: "rental_prev_std", refresh_reference_coverage_on_save: "0", pm_id: bookingId,
    booking_opened_at: String(booking.created_at || ""), print_contract: "0", test_contract: "0", out_img: "", in_img: "",
    print_preventivo: "0", pm_voucher_model: "rental_voucher", operator_code: "false",
  };
  Object.entries(values).forEach(([key, value]) => form.append(key, value));
  for (const service of Array.isArray(booking.services) ? booking.services : []) {
    const id = String(service.id || ""); if (!id) continue;
    form.append(`sa[${id}]`, String(service.quantity || 1));
    form.append(`sa_price[${id}]`, String(service.rate?.without_tax || 0));
    form.append(`sa_tariffazione[${id}]`, service.rate_type === "fixed" ? "fissa" : "giornaliera");
    form.append(`sa_max_days[${id}]`, String(service.max_days || 0));
  }
  return { form, bookingId, modelId, pickupAddress, dropoffAddress };
}

async function updateRenthubTestBooking(contract: any, customer: any, driver: any, vehicle: any, detail: any) {
  if (String(contract.id) !== "c24d0e33-b968-449d-b542-a0613d4220a8" || String(contract.renthub_contract_id) !== "YASPX-IFENH") throw new Error("La prueba de actualización está limitada a LR-062831.");
  const registration = String(
    vehicle?.registration ||
    contract.app_payload?.vehicle_plate ||
    contract.app_payload?.registration ||
    contract.vehicle_plate ||
    "",
  ).trim();
  if (!registration) throw new Error("El contrato no tiene matrícula asignada.");
  const renthubVehicle = await renthubVehicleByPlate(registration);
  const registry = await createRenthubRegistry(customer, driver);
  const payload = bookingUpdatePayload(contract, detail, registry.id, String(renthubVehicle.id));
  const response = await fetch(`${installationUrl()}/rental/booking/add`, {
    method: "POST", redirect: "manual",
    headers: { Accept: "application/json, text/javascript, */*; q=0.01", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-PartnerToken": await partnerToken(), "X-Requested-With": "XMLHttpRequest" },
    body: payload.form,
  });
  const raw = await response.text(); let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500); }
  console.log(JSON.stringify({ event: "renthub_contract_update", contract_number: contract.contract_number, booking_id: payload.bookingId, status: response.status, vehicle_id: String(renthubVehicle.id), registry_id: registry.id, has_pickup_address: !!payload.pickupAddress, has_dropoff_address: !!payload.dropoffAddress }));
  if (!response.ok || String(data?.id || "") !== payload.bookingId) throw new Error(`Renthub rechazó la actualización (${response.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return { booking_id: payload.bookingId, vehicle_id: String(renthubVehicle.id), registry_id: registry.id, pickup_at_location: payload.pickupAddress, dropoff_at_location: payload.dropoffAddress, response: data };
}

async function uploadContractPdf(service: any, contract: any, bookingId: unknown) {
  if (!contract.pdf_path) throw new Error("The contract PDF is not available for Renthub");
  const { data: pdf, error } = await service.storage.from("contracts").download(contract.pdf_path);
  if (error || !pdf) throw new Error(`Contract PDF could not be read: ${error?.message || "unknown error"}`);
  const form = new FormData(); form.append("file[]", pdf, `contrato-LR-${String(contract.contract_number).padStart(6, "0")}.pdf`);
  const base = installationUrl();
  let response = await fetch(`${base}/api/v1/upload/rental_reservation/${encodeURIComponent(String(bookingId))}/nsc_booking`, { method: "POST", headers: { "X-UserAuthToken": await userToken() }, body: form });
  if (response.status === 401) response = await fetch(`${base}/api/v1/upload/rental_reservation/${encodeURIComponent(String(bookingId))}/nsc_booking`, { method: "POST", headers: { "X-UserAuthToken": await userToken(true) }, body: form });
  if (!response.ok) throw new Error(`Renthub PDF upload failed (${response.status})`);
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

async function automaticMappings(contract: any) {
  const [categoryResponse, parameterResponse] = await Promise.all([
    renthubFetch("/module/rental/api/partner/config/categories"),
    renthubFetch("/module/rental/api/partner/config/parameters"),
  ]);
  const categories = Array.isArray(categoryResponse?.result) ? categoryResponse.result : [];
  const target = renthubCategoryName(contract.category);
  const category = categories.find((item: any) => normalize(item?.name) === target);
  const otherLocation = env("RENTHUB_OTHER_LOCATION_ID") || "132";
  const modelMap = parseMap("RENTHUB_MODEL_MAP");
  const group = normalize(contract.category).replace(/^grupo\s+/, "");
  const pickupAddress = String(contract.delivery_location || "").trim();
  const dropoffAddress = String(contract.return_location || pickupAddress).trim();
  return {
    model: modelMap[group] || modelMap[normalize(contract.category)] || String(category?.id || ""),
    pickup: otherLocation,
    dropoff: otherLocation,
    pickupAddress,
    dropoffAddress,
    minimumStart: String(parameterResponse?.result?.opening?.min_date || "").slice(0, 16),
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

  const [{ data: customer }, { data: vehicle, error: vehicleError }, { data: driver }] = await Promise.all([
    contract.customer_id ? service.from("customers").select("*").eq("id", contract.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    contract.vehicle_id ? service.from("vehicles").select("*").eq("id", contract.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    contract.main_driver_id ? service.from("drivers").select("*").eq("id", contract.main_driver_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (vehicleError) console.error(JSON.stringify({ event: "contract_vehicle_lookup_error", contract_number: contract.contract_number, vehicle_id: contract.vehicle_id, detail: vehicleError.message }));
  const { model, pickup, dropoff, pickupAddress, dropoffAddress, minimumStart } = await automaticMappings(contract);
  const start = `${contract.delivery_date} ${String(contract.delivery_time || "").slice(0, 5)}`;
  const end = `${contract.return_date} ${String(contract.return_time || "").slice(0, 5)}`;
  const expectedTotal = Number(contract.total || 0);
  const expectedRental = Number(contract.rental_total || 0);
  const renthubRentalRate = netFromGross(expectedRental, contract.vat_percent);
  const expectedServices = contractServiceTotal(contract);
  const pricelist = renthubPricelist(contract);
  const verificationHash = await digest({ contract_id: contract.id, start, end, model, pickup, dropoff, pricelist, rental_gross: expectedRental, rental_net: renthubRentalRate, services: expectedServices, total: expectedTotal, deposit: Number(contract.deposit || 0), resource: "freesale" });

  async function verify(code: string) {
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
    const modelMatches = modelCandidates.length === 0 || modelCandidates.includes(String(model));
    const checks = {
      code: String(booking.code || "") === code,
      start: minute(booking.start_datetime) === minute(start), end: minute(booking.end_datetime) === minute(end),
      total: sameAmount(booking.total_amount, expectedTotal, contract.vat_percent),
      customer_email: normalize(detail?.result?.customer?.email) === normalize(customer?.email),
      model: modelMatches,
      pickup_location: locationMatches(booking.pickup_location, pickup),
      dropoff_location: locationMatches(booking.dropoff_location, dropoff),
      deposit: Math.abs(Number(booking?.franchises?.deposit || 0) - Number(contract.deposit || 0)) <= 0.02,
    };
    console.log(JSON.stringify({ event: "renthub_booking_verify", contract_number: contract.contract_number, code, model_expected: String(model), model_candidates: modelCandidates, checks }));
    return { detail, booking, checks, verified: Object.values(checks).every(Boolean) };
  }

  if (action === "send") {
    if (contract.renthub_sync_status === "verified" && contract.renthub_contract_id) return json({ verified: true, external_reference: contract.renthub_contract_id, already_sent: true });
    let code = String(contract.renthub_contract_id || ""), inserted: any = null, updated: any = null;
    try {
      if (!code) {
        if (minimumStart && start < minimumStart) throw new Error(`Renthub no admite crear reservas con una entrega anterior a ${minimumStart}. Este contrato histórico se conserva únicamente en Larios Rental.`);
        if (expectedServices > 0.009) throw new Error(`Este contrato incluye ${expectedServices.toFixed(2)} € en seguro, conductor joven o extras. Se ha detenido el envío para no crear una reserva incompleta en Renthub hasta activar el mapeo de Servicios.`);
        if (Number(contract.discount_percent || 0) > 0) throw new Error("Este contrato tiene descuento. Se ha detenido el envío hasta confirmar el campo de descuento de la API de Renthub.");
        const missing = [!model && "model", !pickup && "pickup_location", !dropoff && "dropoff_location", !customer?.email && "customer_email", !customer?.phone && "customer_phone"].filter(Boolean);
        if (missing.length) throw new Error(`Missing Renthub mapping/data: ${missing.join(", ")}`);
        const names = splitName(customer.full_name), phone = splitPhone(customer.phone), form = new FormData();
        form.set("partner_reservation_code", `LR-${String(contract.contract_number).padStart(6, "0")}`);
        if (customer.renthub_customer_id) form.set("customer_code", customer.renthub_customer_id);
        else {
          form.set("name", names.name); form.set("surname", names.surname); form.set("mobile_prefix", phone.prefix); form.set("mobile", phone.mobile); form.set("email", customer.email);
          if (customer.address) form.set("address", customer.address); if (customer.city) form.set("city", customer.city); if (customer.postal_code) form.set("zip", customer.postal_code);
          if (/^[A-Za-z]{2}$/.test(customer.country || "")) form.set("country", customer.country.toUpperCase());
        }
        form.set("model", model); form.set("start_datetime", start); form.set("end_datetime", end);
        form.set("pickup_location", pickup); form.set("dropoff_location", dropoff);
        if (pickupAddress) form.set("pickup_at_location", pickupAddress);
        if (dropoffAddress) form.set("dropoff_at_location", dropoffAddress);
        form.set("resource", "freesale");
        form.set("pm_prev_mezzo_id", "");
        form.set("pm_current_model_id", model);
        form.set("ritiro", pickup);
        form.set("consegna", dropoff);
        form.set("internal_move", "0");
        form.set("booking_type", "booking"); form.set("send_confirmation_email", "0");
        form.set("pricelist", pricelist);
        form.set("overwrite_rental_rate", renthubRentalRate.toFixed(4));
        form.set("overwrite_deposit", Number(contract.deposit || 0).toFixed(2));
        if (Number(contract.franchise || 0) > 0) form.set("overwrite_damage_franchise", Number(contract.franchise).toFixed(2));
        const age = ageAt(customer.birth_date || driver?.birth_date, contract.delivery_date); if (age !== null) form.set("age", String(age));
        console.log(JSON.stringify({ event: "renthub_transfer_create", contract_number: contract.contract_number, category: contract.category, model, resource: "freesale", pm_prev_mezzo_id: "", pm_current_model_id: model, pickup_location: pickup, dropoff_location: dropoff, has_pickup_address: !!pickupAddress, has_dropoff_address: !!dropoffAddress, rental_rate_net: renthubRentalRate.toFixed(4) }));
        inserted = await renthubFetch("/module/rental/api/partner/booking/insert", { method: "POST", body: form });
        code = String(inserted?.result?.booking?.code || "");
        if (!code) throw new Error("Renthub did not return a booking code");
        await requireWrite(actor.from("contracts").update({ renthub_contract_id: code, renthub_sync_status: "sent_pending_verification", renthub_sync_error: null, app_payload: { ...(contract.app_payload || {}), renthub_resource: "freesale", renthub_pickup_location_id: pickup, renthub_dropoff_location_id: dropoff } }).eq("id", contract.id), "No se pudo guardar el código de Renthub");
      }
      let checked = await verify(code);
      if (String(contract.id) === "c24d0e33-b968-449d-b542-a0613d4220a8" && code === "YASPX-IFENH") {
        updated = await updateRenthubTestBooking(contract, customer, driver, vehicle, checked.detail);
        checked = await verify(code);
      }
      let documentUploaded = contract.app_payload?.renthub_document_uploaded === true;
      if (config.documentReady && !documentUploaded) {
        await uploadContractPdf(service, contract, checked.booking.id);
        documentUploaded = true;
        await requireWrite(actor.from("contracts").update({ app_payload: { ...(contract.app_payload || {}), renthub_resource: "freesale", renthub_pickup_location_id: pickup, renthub_dropoff_location_id: dropoff, renthub_document_uploaded: true, renthub_document_uploaded_at: new Date().toISOString() } }).eq("id", contract.id), "No se pudo guardar el estado del documento de Renthub");
      }
      if (!checked.verified) {
        const message = `Renthub verification mismatch: ${Object.entries(checked.checks).filter(([, ok]) => !ok).map(([key]) => key).join(", ")}`;
        await requireWrite(actor.from("contracts").update({ renthub_contract_id: code, renthub_sync_status: "verification_failed", renthub_sync_error: message }).eq("id", contract.id), "No se pudo guardar el error de verificación");
        return json({ error: message, verified: false, external_reference: code, checks: checked.checks }, 409);
      }
      await requireWrite(actor.from("contracts").update({ renthub_contract_id: code, renthub_sync_status: "verified", renthub_last_sync_at: new Date().toISOString(), renthub_sync_error: null }).eq("id", contract.id), "No se pudo guardar la verificación de Renthub");
      if (customer?.id && inserted?.result?.customer?.code) await requireWrite(actor.from("customers").update({ renthub_customer_id: String(inserted.result.customer.code) }).eq("id", customer.id), "No se pudo guardar el cliente de Renthub");
      return json({ verified: true, external_reference: code, checks: checked.checks, updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: "renthub_transfer_error", contract_number: contract.contract_number, external_reference: code || null, detail: message }));
      await actor.from("contracts").update({ ...(code ? { renthub_contract_id: code } : {}), renthub_sync_status: code ? "verification_failed" : "failed", renthub_sync_error: message }).eq("id", contract.id);
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

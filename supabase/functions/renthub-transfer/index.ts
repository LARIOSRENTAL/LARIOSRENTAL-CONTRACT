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

function parseMap(name: string): Record<string, string> {
  try {
    const value = JSON.parse(env(name) || "{}");
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [normalize(key), String(item)]));
  } catch { return {}; }
}
function configuration() {
  const required = ["RENTHUB_INSTALLATION_URL", "RENTHUB_SECRET_TOKEN", "RENTHUB_PRICELIST_ID", "RENTHUB_MODEL_MAP", "RENTHUB_LOCATION_MAP"];
  const missing = required.filter((key) => !env(key));
  const documentReady = !!env("RENTHUB_USER_API_EMAIL") && !!env("RENTHUB_USER_API_PASSWORD");
  const enabled = env("RENTHUB_ENABLED").toLowerCase() === "true";
  return {
    enabled, ready: missing.length === 0, missing, documentReady,
    purgeReady: enabled && missing.length === 0 && documentReady && env("RENTHUB_PURGE_ENABLED").toLowerCase() === "true",
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;
async function partnerToken(force = false) {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const base = env("RENTHUB_INSTALLATION_URL").replace(/\/$/, "");
  const response = await fetch(`${base}/api/partner/token/${encodeURIComponent(env("RENTHUB_SECRET_TOKEN"))}`, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.result?.token) throw new Error(`Renthub authentication failed (${response.status})`);
  tokenCache = { token: data.result.token, expiresAt: data.result.expires_at ? Date.parse(data.result.expires_at) : Date.now() + 600_000 };
  return tokenCache.token;
}
async function renthubFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const base = env("RENTHUB_INSTALLATION_URL").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, { ...init, headers: { Accept: "application/json", "X-PartnerToken": await partnerToken(), ...(init.headers || {}) } });
  if (response.status === 401 && retry) { await partnerToken(true); return renthubFetch(path, init, false); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === false) throw new Error(data?.message || `Renthub returned ${response.status}`);
  return data;
}

let userTokenCache = "";
async function userToken(force = false) {
  if (!force && userTokenCache) return userTokenCache;
  const base = env("RENTHUB_INSTALLATION_URL").replace(/\/$/, ""), form = new FormData();
  form.set("email", env("RENTHUB_USER_API_EMAIL")); form.set("password", env("RENTHUB_USER_API_PASSWORD"));
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Accept: "application/json" }, body: form });
  const data = await response.clone().json().catch(() => ({}));
  const headerToken = response.headers.get("X-UserAuthToken") || response.headers.get("X-Auth-Token") || response.headers.get("Authorization") || "";
  userTokenCache = String(data?.result?.token || data?.token || headerToken).replace(/^Bearer\s+/i, "");
  if (!response.ok || !userTokenCache) throw new Error(`Renthub user API authentication failed (${response.status})`);
  return userTokenCache;
}

async function uploadContractPdf(service: any, contract: any, bookingId: unknown) {
  if (!contract.pdf_path) throw new Error("The contract PDF is not available for Renthub");
  const { data: pdf, error } = await service.storage.from("contracts").download(contract.pdf_path);
  if (error || !pdf) throw new Error(`Contract PDF could not be read: ${error?.message || "unknown error"}`);
  const form = new FormData(); form.append("file[]", pdf, `contrato-LR-${String(contract.contract_number).padStart(6, "0")}.pdf`);
  const base = env("RENTHUB_INSTALLATION_URL").replace(/\/$/, "");
  let response = await fetch(`${base}/api/v1/upload/rental_reservation/${encodeURIComponent(String(bookingId))}/nsc_booking`, { method: "POST", headers: { "X-UserAuthToken": await userToken() }, body: form });
  if (response.status === 401) response = await fetch(`${base}/api/v1/upload/rental_reservation/${encodeURIComponent(String(bookingId))}/nsc_booking`, { method: "POST", headers: { "X-UserAuthToken": await userToken(true) }, body: form });
  if (!response.ok) throw new Error(`Renthub PDF upload failed (${response.status})`);
}

function splitName(fullName: string) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { name: parts.shift() || "Cliente", surname: parts.join(" ") || "Larios Rental" };
}
function splitPhone(value: string) {
  const clean = String(value || "").replace(/[^\d+]/g, "");
  const match = clean.match(/^\+(\d{1,3})(.*)$/);
  return match ? { prefix: `+${match[1]}`, mobile: match[2] } : { prefix: "+34", mobile: clean.replace(/\D/g, "") };
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

async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required" }, 401);
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await service.auth.getUser(jwt);
  const role = userData.user?.app_metadata?.role;
  if (userError || !userData.user || !["employee", "admin"].includes(role)) return json({ error: "Not authorized" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status"), config = configuration();
  if (action === "status") return json({ configured: config.enabled && config.ready, purge_configured: config.purgeReady, activation_pending: !config.enabled, missing: config.missing });
  if (!config.enabled || !config.ready) return json({ error: "RENTHUB_NOT_CONFIGURED", activation_pending: true, missing: config.missing }, 503);

  const contractId = String(body.contract_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "Invalid contract" }, 400);
  const { data: contract, error: contractError } = await service.from("contracts").select("*").eq("id", contractId).single();
  if (contractError || !contract) return json({ error: "Contract not found" }, 404);
  if (contract.status === "draft") return json({ error: "Generate the contract before sending it to Renthub" }, 409);

  const [{ data: customer }, { data: vehicle }, { data: driver }] = await Promise.all([
    contract.customer_id ? service.from("customers").select("*").eq("id", contract.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    contract.vehicle_id ? service.from("vehicles").select("*").eq("id", contract.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    contract.main_driver_id ? service.from("drivers").select("*").eq("id", contract.main_driver_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  void vehicle;
  const modelMap = parseMap("RENTHUB_MODEL_MAP"), locationMap = parseMap("RENTHUB_LOCATION_MAP"), pricelistMap = parseMap("RENTHUB_PRICELIST_MAP");
  const group = normalize(contract.category).replace(/^grupo\s+/, "");
  const model = modelMap[group] || modelMap[normalize(contract.category)];
  const pickup = locationMap[normalize(contract.delivery_location)], dropoff = locationMap[normalize(contract.return_location)];
  const pricelist = pricelistMap[group] || env("RENTHUB_PRICELIST_ID");
  const start = `${contract.delivery_date} ${String(contract.delivery_time || "").slice(0, 5)}`;
  const end = `${contract.return_date} ${String(contract.return_time || "").slice(0, 5)}`;
  const expectedTotal = Number(contract.total || 0);
  const verificationHash = await digest({ contract_id: contract.id, start, end, model, pickup, dropoff, total: expectedTotal, deposit: Number(contract.deposit || 0) });

  async function verify(code: string) {
    const detail = await renthubFetch(`/module/rental/api/partner/booking/details/${encodeURIComponent(code)}`);
    const booking = detail?.result?.booking || {};
    const locationMatches = (actual: any, expected: string) => [actual?.id, actual?.code, actual?.name].map(String).includes(String(expected));
    const checks = {
      code: String(booking.code || "") === code,
      start: minute(booking.start_datetime) === minute(start), end: minute(booking.end_datetime) === minute(end),
      total: Math.abs(Number(booking.total_amount) - expectedTotal) <= 0.02,
      customer_email: normalize(detail?.result?.customer?.email) === normalize(customer?.email),
      model: String(detail?.result?.vehicle?.id || "") === String(model),
      pickup_location: locationMatches(booking.pickup_location, pickup),
      dropoff_location: locationMatches(booking.dropoff_location, dropoff),
      deposit: Math.abs(Number(booking?.franchises?.deposit || 0) - Number(contract.deposit || 0)) <= 0.02,
    };
    return { detail, booking, checks, verified: Object.values(checks).every(Boolean) };
  }

  if (action === "send") {
    if (contract.renthub_sync_status === "verified" && contract.renthub_contract_id) return json({ verified: true, external_reference: contract.renthub_contract_id, already_sent: true });
    let code = String(contract.renthub_contract_id || ""), inserted: any = null;
    try {
      if (!code) {
        const missing = [!model && "model", !pricelist && "pricelist", !pickup && "pickup_location", !dropoff && "dropoff_location", !customer?.email && "customer_email", !customer?.phone && "customer_phone"].filter(Boolean);
        if (missing.length) throw new Error(`Missing Renthub mapping/data: ${missing.join(", ")}`);
        const names = splitName(customer.full_name), phone = splitPhone(customer.phone), form = new FormData();
        form.set("partner_reservation_code", `LR-${String(contract.contract_number).padStart(6, "0")}`);
        if (customer.renthub_customer_id) form.set("customer_code", customer.renthub_customer_id);
        else {
          form.set("name", names.name); form.set("surname", names.surname); form.set("mobile_prefix", phone.prefix); form.set("mobile", phone.mobile); form.set("email", customer.email);
          if (customer.address) form.set("address", customer.address); if (customer.city) form.set("city", customer.city); if (customer.postal_code) form.set("zip", customer.postal_code);
          if (/^[A-Za-z]{2}$/.test(customer.country || "")) form.set("country", customer.country.toUpperCase());
        }
        form.set("model", model); form.set("pricelist", pricelist); form.set("start_datetime", start); form.set("end_datetime", end);
        form.set("pickup_location", pickup); form.set("dropoff_location", dropoff); form.set("booking_type", "booking"); form.set("send_confirmation_email", "0");
        form.set("overwrite_rental_rate", expectedTotal.toFixed(2));
        form.set("overwrite_deposit", Number(contract.deposit || 0).toFixed(2));
        if (Number(contract.franchise || 0) > 0) form.set("overwrite_damage_franchise", Number(contract.franchise).toFixed(2));
        const age = ageAt(customer.birth_date || driver?.birth_date, contract.delivery_date); if (age !== null) form.set("age", String(age));
        inserted = await renthubFetch("/module/rental/api/partner/booking/insert", { method: "POST", body: form });
        code = String(inserted?.result?.booking?.code || "");
        if (!code) throw new Error("Renthub did not return a booking code");
        await service.from("contracts").update({ renthub_contract_id: code, renthub_sync_status: "sent_pending_verification", renthub_sync_error: null }).eq("id", contract.id);
      }
      let checked = await verify(code);
      let documentUploaded = contract.app_payload?.renthub_document_uploaded === true;
      if (config.documentReady && !documentUploaded) {
        await uploadContractPdf(service, contract, checked.booking.id);
        documentUploaded = true;
        await service.from("contracts").update({ app_payload: { ...(contract.app_payload || {}), renthub_document_uploaded: true, renthub_document_uploaded_at: new Date().toISOString() } }).eq("id", contract.id);
      }
      if (!checked.verified) {
        const message = `Renthub verification mismatch: ${Object.entries(checked.checks).filter(([, ok]) => !ok).map(([key]) => key).join(", ")}`;
        await service.from("contracts").update({ renthub_sync_status: "verification_failed", renthub_sync_error: message }).eq("id", contract.id);
        await service.from("renthub_sync_log").insert({ contract_id: contract.id, operation: "verify_booking", direction: "outbound", request_data: {}, response_data: { code, checks: checked.checks }, success: false, error_message: message, external_reference: code, verification_hash: verificationHash });
        return json({ error: message, verified: false, external_reference: code, checks: checked.checks }, 409);
      }
      await Promise.all([
        service.from("contracts").update({ renthub_contract_id: code, renthub_sync_status: "verified", renthub_last_sync_at: new Date().toISOString(), renthub_sync_error: null }).eq("id", contract.id),
        customer?.id && inserted?.result?.customer?.code ? service.from("customers").update({ renthub_customer_id: String(inserted.result.customer.code) }).eq("id", customer.id) : Promise.resolve(),
        service.from("renthub_sync_log").insert({ contract_id: contract.id, operation: "insert_and_verify_booking", direction: "outbound", request_data: {}, response_data: { code, booking_id: checked.booking.id, start_datetime: checked.booking.start_datetime, end_datetime: checked.booking.end_datetime, total_amount: checked.booking.total_amount, document_uploaded: documentUploaded }, success: true, external_reference: code, verification_hash: verificationHash, verified_at: new Date().toISOString() }),
      ]);
      return json({ verified: true, external_reference: code, checks: checked.checks });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await service.from("contracts").update({ renthub_sync_status: code ? "verification_failed" : "failed", renthub_sync_error: message }).eq("id", contract.id);
      await service.from("renthub_sync_log").insert({ contract_id: contract.id, operation: "send_booking", direction: "outbound", request_data: {}, response_data: code ? { code } : {}, success: false, error_message: message, external_reference: code || null, verification_hash: verificationHash });
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

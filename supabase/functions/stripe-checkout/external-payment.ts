import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const env = (name: string) => (Deno.env.get(name) || "").trim();
const cors = { "Access-Control-Allow-Origin": "https://lariosrental.github.io", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
class LinkError extends Error { constructor(message: string, public status = 409) { super(message); } }

function paymentId(input: unknown) {
  let value = String(input || "").trim();
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.hostname !== "dashboard.stripe.com" || url.username || url.password) throw new LinkError("Pega el enlace del pago de dashboard.stripe.com o su identificador pi_… / ch_…", 400);
    value = url.pathname.split("/").filter(Boolean).at(-1) || "";
  }
  if (!/^(pi|ch)_[A-Za-z0-9]+$/.test(value) || value.length > 100) throw new LinkError("Identificador no válido. Debe empezar por pi_ o ch_.", 400);
  return value;
}

async function stripe(path: string, body?: URLSearchParams) {
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + env("STRIPE_SECRET_KEY"), "Stripe-Version": env("STRIPE_API_VERSION") || "2026-08-26.dahlia", ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body
  });
  const data = await response.json();
  if (!response.ok) throw new LinkError(response.status === 404 ? "No se encontró ese pago en la cuenta Stripe de Larios Rental." : "Stripe no pudo comprobar o actualizar ese pago. Inténtalo de nuevo.", 502);
  return data;
}

async function savedCard(db: any, contractId: string) {
  const { data, error } = await db.from("stripe_payment_methods").select("card_brand,card_last4,reusable").eq("contract_id", contractId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la tarjeta registrada.");
  return { setup_pending: false, reusable: !!data?.reusable, brand: data?.card_brand || null, last4: data?.card_last4 || null };
}
async function storeCard(db: any, contract: any, customerId: string, method: any, actorId: string) {
  const attached = typeof method.customer === "string" ? method.customer : method.customer?.id;
  if (method.type !== "card" || attached !== customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId) || !/^pm_[A-Za-z0-9]+$/.test(method.id || "") || !/^\d{4}$/.test(method.card?.last4 || "")) throw new LinkError("Stripe no ha devuelto una tarjeta reutilizable asociada al cliente.");
  const { error } = await db.rpc("save_external_stripe_card", { p_contract_id: contract.id, p_actor_id: actorId, p_stripe_customer_id: customerId, p_payment_method_id: method.id, p_brand: method.card.brand || "card", p_last4: method.card.last4, p_exp_month: method.card.exp_month, p_exp_year: method.card.exp_year });
  if (error) throw new Error("No se pudo guardar la tarjeta en el contrato. Vuelve a comprobarla.");
  return { setup_pending: false, reusable: true, brand: method.card.brand, last4: method.card.last4 };
}
async function reusableFromPayment(db: any, contract: any, pi: any, actorId: string) {
  const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
  // A contactless card_present identifier cannot be charged off-session. Use only an
  // attached generated_card (or a saved online card) explicitly set up for off_session.
  if (pi.setup_future_usage !== "off_session" || !customerId) return savedCard(db, contract.id);
  const details = pi.latest_charge?.payment_method_details;
  const methodId = details?.card_present ? details.card_present.generated_card : (typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id);
  if (!/^pm_[A-Za-z0-9]+$/.test(methodId || "")) return savedCard(db, contract.id);
  const method = await stripe("payment_methods/" + methodId);
  return storeCard(db, contract, customerId, method, actorId);
}
async function completeSetup(db: any, contract: any, actorId: string) {
  const { data: pending, error } = await db.from("stripe_card_setups").select("*").eq("contract_id", contract.id).in("status", ["open", "complete"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("No se pudo comprobar el registro de tarjeta.");
  if (!pending) return savedCard(db, contract.id);
  if (pending.status === "complete") return savedCard(db, contract.id);
  const session = await stripe("checkout/sessions/" + pending.checkout_session_id + "?expand[]=setup_intent.payment_method");
  if (session.mode !== "setup" || session.client_reference_id !== contract.id || session.metadata?.contract_id !== contract.id || session.customer !== pending.stripe_customer_id) throw new LinkError("La sesión de registro no corresponde a este contrato.");
  if (session.status === "expired") { await db.from("stripe_card_setups").update({ status: "expired" }).eq("id", pending.id); return savedCard(db, contract.id); }
  if (session.status !== "complete" || session.setup_intent?.status !== "succeeded") return { ...(await savedCard(db, contract.id)), setup_pending: true };
  if (session.setup_intent.usage !== "off_session") throw new LinkError("La tarjeta no se autorizó para cargos posteriores.");
  const card = await storeCard(db, contract, pending.stripe_customer_id, session.setup_intent.payment_method, actorId);
  const { error: updateError } = await db.from("stripe_card_setups").update({ status: "complete", completed_at: new Date().toISOString() }).eq("id", pending.id);
  if (updateError) throw new Error("Tarjeta guardada; vuelve a comprobarla para completar el registro.");
  return card;
}

export default async function handleExternalPayment(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Inicia sesión para vincular un pago." }, 401);
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(jwt);
    if (authError || !auth.user) return json({ error: "Sesión no válida. Vuelve a iniciar sesión." }, 401);
    if (!["admin", "employee"].includes(auth.user.app_metadata?.role)) return json({ error: "Solo los administradores pueden vincular pagos externos de Stripe." }, 403);
    const key = env("STRIPE_SECRET_KEY"), live = /^(sk|rk)_live_/.test(key);
    if (!/^(sk|rk)_(live|test)_/.test(key) || (live && env("STRIPE_ENABLED").toLowerCase() !== "true")) return json({ error: "Stripe no está activado." }, 503);
    const body = await req.json();
    body.action = String(body.action || "").replace(/^external_/, "");
    if (!["preview", "link", "setup_create", "card_status"].includes(body.action) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(body.contract_id || ""))) throw new LinkError("Solicitud no válida", 400);
    if (["preview", "link"].includes(body.action) && auth.user.app_metadata?.role !== "admin") return json({ error: "Solo los administradores pueden vincular pagos externos de Stripe." }, 403);
    const { data: contract, error: contractError } = await db.from("contracts").select("id,contract_number,total,app_payload,customer_id").eq("id", body.contract_id).single();
    if (contractError || !contract) throw new LinkError("No se encontró el contrato.", 404);
    if (body.action === "card_status") return json(await completeSetup(db, contract, auth.user.id));
    if (body.action === "setup_create") {
      const existing = await completeSetup(db, contract, auth.user.id);
      if (existing.reusable) return json({ ...existing, already_saved: true });
      if (existing.setup_pending) {
        const { data: pending } = await db.from("stripe_card_setups").select("checkout_url").eq("contract_id", contract.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).single();
        if (pending?.checkout_url) return json({ setup_url: pending.checkout_url, reused: true });
      }
      const ref = "LR-" + String(contract.contract_number).padStart(6, "0");
      const customerParams = new URLSearchParams({ "metadata[contract_id]": contract.id, description: "Larios Rental · " + ref });
      const customer = await stripe("customers", customerParams);
      const base = (env("STRIPE_APP_URL") || "https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/").replace(/\?.*$/, "");
      const params = new URLSearchParams({ mode: "setup", currency: "eur", customer: customer.id, client_reference_id: contract.id, "metadata[contract_id]": contract.id,
        "setup_intent_data[metadata][contract_id]": contract.id, locale: "es",
        "custom_text[submit][message]": "Al guardar tu tarjeta, autorizas a Larios Rental a conservarla en Stripe y efectuar cargos posteriores justificados del contrato " + ref + ": ampliaciones, combustible y gastos de aparcamiento, conforme a las condiciones de alquiler aceptadas. No se cobra ningún importe ahora.",
        success_url: base + "?stripe_card=success&contract_id=" + encodeURIComponent(contract.id), cancel_url: base + "?stripe_card=cancel&contract_id=" + encodeURIComponent(contract.id) });
      // Explicit card-only setup is necessary: the later rental charges require a reusable card.
      params.set("payment_method_types[0]", "card");
      const session = await stripe("checkout/sessions", params);
      const { error } = await db.from("stripe_card_setups").insert({ contract_id: contract.id, checkout_session_id: session.id, checkout_url: session.url, stripe_customer_id: customer.id, created_by: auth.user.id });
      if (error) throw new Error("No se pudo preparar el registro de tarjeta. Inténtalo de nuevo.");
      return json({ setup_url: session.url });
    }
    const id = paymentId(body.payment_reference);
    let intentId = id;
    if (id.startsWith("ch_")) {
      const charge = await stripe("charges/" + id);
      intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!/^pi_[A-Za-z0-9]+$/.test(intentId || "")) throw new LinkError("Ese cobro no tiene un identificador de pago compatible.");
    }
    const pi = await stripe("payment_intents/" + intentId + "?expand[]=latest_charge");
    const charge = pi.latest_charge;
    if (pi.status !== "succeeded" || !charge?.paid || !charge?.captured || charge.status !== "succeeded") throw new LinkError("El pago no está cobrado. Una autorización o un pago pendiente no sirve.");
    if (pi.livemode !== live || charge.livemode !== live) throw new LinkError("El pago pertenece a un modo de Stripe diferente.");
    if (id.startsWith("ch_") && charge.id !== id) throw new LinkError("Ese cargo no corresponde al cobro final del pago.");
    const cents = Math.round(Number(contract.total) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || pi.currency !== "eur" || charge.currency !== "eur" || pi.amount !== cents || pi.amount_received !== cents || charge.amount_captured !== cents) throw new LinkError("El importe cobrado debe coincidir exactamente con el total del contrato en euros.");
    if (charge.refunded || Number(charge.amount_refunded || 0) > 0 || charge.disputed) throw new LinkError("No se puede vincular un cobro devuelto o en disputa.");
    for (const object of [pi, charge]) {
      if (object.metadata?.contract_id && object.metadata.contract_id !== contract.id) throw new LinkError("Ese pago ya tiene asignado otro contrato en Stripe.");
      if (object.metadata?.purpose && object.metadata.purpose !== "rental") throw new LinkError("Ese pago está destinado a otra operación y no al alquiler.");
    }
    const { data: records, error: recordsError } = await db.from("stripe_payments").select("contract_id,payment_intent_id,status,checkout_session_id").eq("payment_intent_id", pi.id);
    if (recordsError) throw new Error("No se pudo comprobar la vinculación del pago.");
    if ((records || []).some((p: any) => p.contract_id !== contract.id)) throw new LinkError("Ese pago ya está vinculado a otro contrato.");
    const existing = (records || []).find((p: any) => p.contract_id === contract.id);
    if (existing && existing.checkout_session_id !== "external:" + pi.id) throw new LinkError("Ese pago ya se gestiona desde el contrato mediante Checkout o Terminal.");
    if (contract.app_payload?.payment_status === "paid" && !existing) throw new LinkError("Este contrato ya figura pagado. Revisa el cobro registrado antes de vincular otro.");
    const card = charge.payment_method_details?.card_present || charge.payment_method_details?.card || {};
    const summary = { payment_intent_id: pi.id, charge_id: charge.id, amount_cents: cents, currency: "eur", paid_at: new Date(charge.created * 1000).toISOString(), brand: card.brand || null, last4: /^\d{4}$/.test(card.last4 || "") ? card.last4 : null, contract_number: contract.contract_number, livemode: live };
    if (body.action === "preview") return json({ verified: true, already_linked: !!existing, ...summary });
    if (body.confirmed !== true) throw new LinkError("Confirma el pago antes de vincularlo.", 400);
    const { data: linked, error: linkError } = await db.rpc("link_external_stripe_payment", { p_contract_id: contract.id, p_payment_intent_id: pi.id, p_amount_cents: cents, p_actor_id: auth.user.id, p_livemode: live, p_paid_at: summary.paid_at, p_last4: summary.last4 });
    if (linkError) throw new LinkError(linkError.message || "No se pudo guardar la vinculación.");
    // The database association is authoritative. A retry repairs metadata without adding another payment.
    let metadataSynced = true;
    try {
      for (const [path, object] of [["payment_intents/" + pi.id, pi], ["charges/" + charge.id, charge]] as const) {
        const params = new URLSearchParams({ "metadata[contract_id]": contract.id, "metadata[contract_number]": "LR-" + String(contract.contract_number).padStart(6, "0"), "metadata[larios_payment_link]": "external" });
        const ref = "LR-" + String(contract.contract_number).padStart(6, "0");
        const previous = String(object.description || "");
        params.set("description", previous.includes(ref) ? previous : (previous.slice(0, 900) + (previous ? " · " : "Larios Rental · ") + ref));
        await stripe(path, params);
      }
    } catch { metadataSynced = false; }
    let reusable = await savedCard(db, contract.id), cardWarning = null;
    try { reusable = await reusableFromPayment(db, contract, pi, auth.user.id); }
    catch { cardWarning = "El pago está vinculado. No se pudo comprobar la tarjeta; usa Registrar tarjeta o vuelve a comprobarla."; }
    return json({ ...summary, ...reusable, card_warning: cardWarning, paid: true, linked: true, already_linked: !!linked?.already_linked, metadata_synced: metadataSynced, warning: metadataSynced ? null : "El pago está vinculado en Larios Rental. Repite la vinculación para actualizar también la referencia en Stripe." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo vincular el pago." }, error instanceof LinkError ? error.status : 500);
  }
}

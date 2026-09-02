import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "https://lariosrental.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const env = (name: string) => (Deno.env.get(name) || "").trim();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
const stripeEnabled = () => env("STRIPE_ENABLED").toLowerCase() === "true" && env("STRIPE_SECRET_KEY").startsWith("sk_");
const stripeApiVersion = () => env("STRIPE_API_VERSION") || "2026-08-26.dahlia";
const appUrl = () => (env("STRIPE_APP_URL") || "https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/").replace(/\?.*$/, "");

async function stripe(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      "Stripe-Version": stripeApiVersion(),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Stripe returned ${response.status}`);
  return data;
}

async function saveReusablePaymentMethod(service: any, payment: any, session: any, actorId: string | null) {
  if (session.payment_status !== "paid" || !session.payment_intent) return null;
  const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(String(session.payment_intent))}?expand[]=payment_method`);
  const method = intent.payment_method;
  const methodId = typeof method === "string" ? method : String(method?.id || "");
  const customerId = typeof intent.customer === "string" ? intent.customer : String(intent.customer?.id || session.customer || "");
  const card = typeof method === "object" ? method?.card : null;
  if (!/^pm_[A-Za-z0-9_]+$/.test(methodId) || !/^cus_[A-Za-z0-9_]+$/.test(customerId) || method?.type !== "card" || !/^\d{4}$/.test(String(card?.last4 || ""))) {
    throw new Error("Stripe did not return a reusable card token");
  }
  const expMonth = Number(card.exp_month), expYear = Number(card.exp_year);
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) throw new Error("Stripe returned invalid card metadata");
  const { data: contract, error: contractError } = await service.from("contracts").select("customer_id").eq("id", payment.contract_id).single();
  if (contractError) throw new Error(contractError.message);
  const now = new Date().toISOString();
  const { error } = await service.from("stripe_payment_methods").upsert({
    contract_id: payment.contract_id,
    customer_id: contract.customer_id || null,
    stripe_customer_id: customerId,
    stripe_payment_method_id: methodId,
    card_brand: String(card.brand || "card").slice(0, 40),
    card_last4: String(card.last4),
    exp_month: expMonth,
    exp_year: expYear,
    reusable: true,
    consented_at: now,
    created_by: actorId,
    updated_at: now,
  }, { onConflict: "contract_id" });
  if (error) throw new Error(error.message);
  await service.from("contracts").update({ card_last4: String(card.last4), updated_at: now }).eq("id", payment.contract_id);
  return { brand: String(card.brand || "card"), last4: String(card.last4), exp_month: expMonth, exp_year: expYear, reusable: true };
}

async function markFromSession(service: any, payment: any, session: any, eventId = "", actorId: string | null = null) {
  if (String(session.client_reference_id || "") !== String(payment.contract_id) || String(session.metadata?.contract_id || "") !== String(payment.contract_id)) throw new Error("Stripe contract reference mismatch");
  if (Number(session.amount_total || 0) !== Number(payment.amount_cents)) throw new Error("Stripe amount mismatch");
  const paid = session.payment_status === "paid";
  const status = paid ? "paid" : session.status === "expired" ? "expired" : "open";
  const now = new Date().toISOString();
  const { error: paymentError } = await service.from("stripe_payments").update({
    status, payment_intent_id: session.payment_intent ? String(session.payment_intent) : null,
    livemode: !!session.livemode, paid_at: paid ? now : null, last_event_id: eventId || payment.last_event_id || null,
    failure_message: null, updated_at: now,
  }).eq("id", payment.id);
  if (paymentError) throw new Error(paymentError.message);
  if (paid) {
    const { data: contract, error } = await service.from("contracts").select("app_payload").eq("id", payment.contract_id).single();
    if (error) throw new Error(error.message);
    const { error: contractError } = await service.from("contracts").update({
      payment_method: "Tarjeta",
      app_payload: { ...(contract.app_payload || {}), payment_status: "paid", stripe_checkout_session_id: session.id, stripe_payment_intent_id: session.payment_intent || null, stripe_amount_cents: payment.amount_cents, stripe_paid_at: now },
      updated_at: now,
    }).eq("id", payment.contract_id);
    if (contractError) throw new Error(contractError.message);
  }
  const card = paid ? await saveReusablePaymentMethod(service, payment, session, actorId || payment.created_by || null) : null;
  return { paid, status, amount_cents: payment.amount_cents, contract_id: payment.contract_id, card };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required" }, 401);
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await service.auth.getUser(jwt);
  const role = authData.user?.app_metadata?.role;
  if (authError || !authData.user || !["employee", "admin"].includes(role)) return json({ error: "Not authorized" }, 403);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  if (action === "status") return json({ configured: stripeEnabled(), activation_pending: !stripeEnabled(), mode: env("STRIPE_SECRET_KEY").startsWith("sk_live_") ? "live" : "test" });
  if (action === "card_summary") {
    if (role !== "admin") return json({ error: "Administrator access required" }, 403);
    const contractId = String(body.contract_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "Invalid contract" }, 400);
    const { data: method, error } = await service.from("stripe_payment_methods").select("card_brand,card_last4,exp_month,exp_year,reusable").eq("contract_id", contractId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    const { data: contract } = method ? { data: null } : await service.from("contracts").select("card_last4,payment_method").eq("id", contractId).maybeSingle();
    const { error: auditError } = await service.from("card_access_audit").insert({ contract_id: contractId, accessed_by: authData.user.id, action: "view_masked" });
    if (auditError) return json({ error: auditError.message }, 500);
    if (method) return json({ available: true, source: "stripe", brand: method.card_brand, last4: method.card_last4, exp_month: method.exp_month, exp_year: method.exp_year, reusable: !!method.reusable });
    if (/^\d{4}$/.test(String(contract?.card_last4 || ""))) return json({ available: true, source: "legacy", brand: null, last4: contract.card_last4, exp_month: null, exp_year: null, reusable: false });
    return json({ available: false, source: "none", reusable: false });
  }
  if (!stripeEnabled()) return json({ error: "STRIPE_NOT_CONFIGURED", activation_pending: true }, 503);

  try {
    if (action === "create") {
      const contractId = String(body.contract_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "Invalid contract" }, 400);
      const { data: contract, error } = await service.from("contracts").select("id,contract_number,total,payment_method,app_payload,customer_id,updated_at").eq("id", contractId).single();
      if (error || !contract) return json({ error: "Contract not found" }, 404);
      if (contract.payment_method !== "Tarjeta") return json({ error: "Select card payment first" }, 409);
      const amountCents = Math.round(Number(contract.total || 0) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return json({ error: "The contract total must be greater than zero" }, 409);
      const { data: existing } = await service.from("stripe_payments").select("*").eq("contract_id", contractId).eq("amount_cents", amountCents).eq("status", "open").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing?.checkout_url) return json({ checkout_url: existing.checkout_url, session_id: existing.checkout_session_id, reused: true, mode: existing.livemode ? "live" : "test" });
      const { data: customer } = contract.customer_id ? await service.from("customers").select("email,full_name").eq("id", contract.customer_id).maybeSingle() : { data: null };
      const { data: savedMethod } = contract.customer_id ? await service.from("stripe_payment_methods").select("stripe_customer_id").eq("customer_id", contract.customer_id).eq("reusable", true).order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
      const params = new URLSearchParams();
      params.set("mode", "payment"); params.set("ui_mode", "hosted_page"); params.set("locale", "es"); params.set("payment_method_types[0]", "card");
      params.set("client_reference_id", contract.id); params.set("metadata[contract_id]", contract.id); params.set("metadata[contract_number]", `LR-${String(contract.contract_number).padStart(6, "0")}`);
      params.set("line_items[0][quantity]", "1"); params.set("line_items[0][price_data][currency]", "eur"); params.set("line_items[0][price_data][unit_amount]", String(amountCents));
      params.set("line_items[0][price_data][product_data][name]", `Alquiler Larios Rental · LR-${String(contract.contract_number).padStart(6, "0")}`);
      params.set("line_items[0][price_data][product_data][description]", "Importe total del contrato de alquiler");
      params.set("payment_intent_data[setup_future_usage]", "off_session");
      params.set("custom_text[submit][message]", "Al pagar, autorizas a Larios Rental a guardar de forma segura este método en Stripe para cargos posteriores justificados relacionados con el contrato.");
      if (/^cus_[A-Za-z0-9_]+$/.test(String(savedMethod?.stripe_customer_id || ""))) params.set("customer", savedMethod.stripe_customer_id);
      else {
        params.set("customer_creation", "always");
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer?.email || "")) params.set("customer_email", customer.email);
      }
      params.set("success_url", `${appUrl()}?stripe=success&session_id={CHECKOUT_SESSION_ID}&contract_id=${encodeURIComponent(contract.id)}`);
      params.set("cancel_url", `${appUrl()}?stripe=cancel&contract_id=${encodeURIComponent(contract.id)}`);
      const session = await stripe("/v1/checkout/sessions", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `lr-${contract.id}-${amountCents}` }, body: params });
      const { error: insertError } = await service.from("stripe_payments").insert({ contract_id: contract.id, checkout_session_id: session.id, amount_cents: amountCents, currency: "eur", status: "open", checkout_url: session.url, livemode: !!session.livemode, expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null, created_by: authData.user.id });
      if (insertError) throw new Error(insertError.message);
      await service.from("contracts").update({ app_payload: { ...(contract.app_payload || {}), payment_status: "pending", stripe_checkout_session_id: session.id, stripe_amount_cents: amountCents }, updated_at: new Date().toISOString() }).eq("id", contract.id);
      return json({ checkout_url: session.url, session_id: session.id, reused: false, mode: session.livemode ? "live" : "test" });
    }
    if (action === "verify") {
      const sessionId = String(body.session_id || ""), contractId = String(body.contract_id || "");
      if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "Invalid payment reference" }, 400);
      const { data: payment, error } = await service.from("stripe_payments").select("*").eq("checkout_session_id", sessionId).eq("contract_id", contractId).single();
      if (error || !payment) return json({ error: "Payment not found" }, 404);
      const session = await stripe(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
      return json(await markFromSession(service, payment, session, "", authData.user.id));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

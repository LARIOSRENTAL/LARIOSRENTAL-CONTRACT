import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const env = (name: string) => (Deno.env.get(name) || "").trim();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const stripeApiVersion = () => env("STRIPE_API_VERSION") || "2026-08-26.dahlia";
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let value = 0; for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i); return value === 0; }
async function verifySignature(raw: string, header: string) {
  const parts = header.split(",").map((part) => part.split("=")), timestamp = parts.find(([key]) => key === "t")?.[1] || "", signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("STRIPE_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)));
  return signatures.some((signature) => safeEqual(expected, signature));
}

async function stripe(path: string) {
  const response = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Stripe-Version": stripeApiVersion() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Stripe returned ${response.status}`);
  return data;
}

async function saveReusablePaymentMethod(service: any, payment: any, session: any) {
  if (!session.payment_intent) throw new Error("Paid Stripe session has no PaymentIntent");
  const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(String(session.payment_intent))}?expand[]=payment_method`);
  const method = intent.payment_method, methodId = typeof method === "string" ? method : String(method?.id || "");
  const customerId = typeof intent.customer === "string" ? intent.customer : String(intent.customer?.id || session.customer || "");
  const card = typeof method === "object" ? method?.card : null;
  if (!/^pm_[A-Za-z0-9_]+$/.test(methodId) || !/^cus_[A-Za-z0-9_]+$/.test(customerId) || method?.type !== "card" || !/^\d{4}$/.test(String(card?.last4 || ""))) throw new Error("Stripe did not return a reusable card token");
  const expMonth = Number(card.exp_month), expYear = Number(card.exp_year);
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) throw new Error("Stripe returned invalid card metadata");
  const { data: contract, error: contractError } = await service.from("contracts").select("customer_id").eq("id", payment.contract_id).single();
  if (contractError) throw new Error(contractError.message);
  const now = new Date().toISOString();
  const { error } = await service.from("stripe_payment_methods").upsert({ contract_id: payment.contract_id, customer_id: contract.customer_id || null, stripe_customer_id: customerId, stripe_payment_method_id: methodId, card_brand: String(card.brand || "card").slice(0, 40), card_last4: String(card.last4), exp_month: expMonth, exp_year: expYear, reusable: true, consented_at: now, created_by: payment.created_by || null, updated_at: now }, { onConflict: "contract_id" });
  if (error) throw new Error(error.message);
  const { error: cardError } = await service.from("contracts").update({ card_last4: String(card.last4), updated_at: now }).eq("id", payment.contract_id);
  if (cardError) throw new Error(cardError.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env("STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) return json({ error: "Webhook not configured" }, 503);
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("Stripe-Signature") || ""))) return json({ error: "Invalid signature" }, 400);
  const event = JSON.parse(raw), session = event?.data?.object || {}, relevant = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event?.type);
  if (!relevant) return json({ received: true, ignored: true });
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment, error } = await service.from("stripe_payments").select("*").eq("checkout_session_id", String(session.id || "")).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!payment) return json({ received: true, unmatched: true });
  const now = new Date().toISOString(), amountMatches = Number(session.amount_total || 0) === Number(payment.amount_cents), referenceMatches = String(session.client_reference_id || "") === String(payment.contract_id) && String(session.metadata?.contract_id || "") === String(payment.contract_id);
  if (!amountMatches || !referenceMatches) {
    await service.from("stripe_payments").update({ status: "failed", failure_message: !amountMatches ? "Stripe amount mismatch" : "Stripe contract reference mismatch", last_event_id: event.id, updated_at: now }).eq("id", payment.id);
    return json({ error: "Payment reconciliation mismatch" }, 409);
  }
  const paid = session.payment_status === "paid" && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type), status = paid ? "paid" : event.type === "checkout.session.expired" ? "expired" : event.type === "checkout.session.async_payment_failed" ? "failed" : "open";
  await service.from("stripe_payments").update({ status, payment_intent_id: session.payment_intent ? String(session.payment_intent) : null, livemode: !!session.livemode, paid_at: paid ? now : payment.paid_at, last_event_id: event.id, failure_message: status === "failed" ? "Stripe reported an asynchronous payment failure" : null, updated_at: now }).eq("id", payment.id);
  if (paid) {
    const { data: contract } = await service.from("contracts").select("app_payload").eq("id", payment.contract_id).single();
    await service.from("contracts").update({ payment_method: "Tarjeta", app_payload: { ...(contract?.app_payload || {}), payment_status: "paid", stripe_checkout_session_id: session.id, stripe_payment_intent_id: session.payment_intent || null, stripe_amount_cents: payment.amount_cents, stripe_paid_at: now }, updated_at: now }).eq("id", payment.contract_id);
    await saveReusablePaymentMethod(service, payment, session);
  }
  return json({ received: true, status });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { reconcileNativePayment } from "../stripe-checkout/native-terminal.ts";
import { reconcileNativeHold } from "../stripe-checkout/native-hold.ts";
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
  const nativeEvent=JSON.parse(raw);
  if(['payment_intent.amount_capturable_updated','payment_intent.succeeded','payment_intent.canceled','payment_intent.payment_failed'].includes(nativeEvent.type)&&nativeEvent.data?.object?.metadata?.purpose==='rental_guarantee'){
    const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
    try{return json({received:true,...await reconcileNativeHold(db,nativeEvent.data.object.id,stripe)})}catch{return json({error:'Could not reconcile native guarantee'},500)}
  }
  if(nativeEvent.type==='payment_intent.succeeded'&&nativeEvent.data?.object?.metadata?.channel==='tap_to_pay'){
    const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
    try{const d=await reconcileNativePayment(db,nativeEvent.data.object.id);return d.card_warning?json({error:d.card_warning},500):json({received:true,paid:d.paid});}catch{return json({error:'Could not reconcile native payment'},500)}
  }
  const event = nativeEvent, session = event?.data?.object || {}, relevant = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event?.type);
  if (!relevant) return json({ received: true, ignored: true });
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment, error } = await service.from("stripe_payments").select("*").eq("checkout_session_id", String(session.id || "")).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!payment && session.mode === "setup") {
    const { data: setup, error: setupError } = await service.from("stripe_card_setups").select("*").eq("checkout_session_id", String(session.id || "")).maybeSingle();
    if (setupError) return json({ error: "Could not load card setup" }, 500);
    if (!setup) return json({ received: true, unmatched: true });
    if (setup.status === "complete") return json({ received: true, card_registered: true });
    if (event.type === "checkout.session.expired") {
      const { error } = await service.from("stripe_card_setups").update({ status: "expired" }).eq("id", setup.id);
      return error ? json({ error: "Could not expire card setup" }, 500) : json({ received: true });
    }
    try {
      const checked = await stripe(`/v1/checkout/sessions/${encodeURIComponent(session.id)}?expand[]=setup_intent.payment_method`);
      const intent = checked.setup_intent, method = intent?.payment_method;
      if (checked.mode !== "setup" || checked.status !== "complete" || checked.client_reference_id !== setup.contract_id || checked.metadata?.contract_id !== setup.contract_id || checked.customer !== setup.stripe_customer_id || intent?.status !== "succeeded" || intent?.usage !== "off_session" || method?.type !== "card" || method.customer !== setup.stripe_customer_id || !/^pm_[A-Za-z0-9]+$/.test(method.id || "") || !/^\d{4}$/.test(method.card?.last4 || "")) return json({ error: "Card setup reconciliation mismatch" }, 409);
      const { error: saveError } = await service.rpc("save_external_stripe_card", { p_contract_id: setup.contract_id, p_actor_id: setup.created_by, p_stripe_customer_id: setup.stripe_customer_id, p_payment_method_id: method.id, p_brand: method.card.brand || "card", p_last4: method.card.last4, p_exp_month: method.card.exp_month, p_exp_year: method.card.exp_year });
      if (saveError) return json({ error: "Could not save reusable card" }, 500);
      const { error: finishError } = await service.from("stripe_card_setups").update({ status: "complete", completed_at: new Date().toISOString() }).eq("id", setup.id);
      return finishError ? json({ error: "Could not finish card setup" }, 500) : json({ received: true, card_registered: true });
    } catch { return json({ error: "Could not verify card setup" }, 500); }
  }
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

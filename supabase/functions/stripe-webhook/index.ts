import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const env = (name: string) => (Deno.env.get(name) || "").trim();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let value = 0; for (let i = 0; i < a.length; i++) value |= a.charCodeAt(i) ^ b.charCodeAt(i); return value === 0; }
async function verifySignature(raw: string, header: string) {
  const parts = header.split(",").map((part) => part.split("=")), timestamp = parts.find(([key]) => key === "t")?.[1] || "", signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("STRIPE_WEBHOOK_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`)));
  return signatures.some((signature) => safeEqual(expected, signature));
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
  }
  return json({ received: true, status });
});


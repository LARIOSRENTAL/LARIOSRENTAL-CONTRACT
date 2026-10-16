import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const source = fs.readFileSync(new URL('../supabase/functions/renthub-transfer/index.ts', import.meta.url), 'utf8');
const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), { mode: 'strip' });
let paymentPosts = 0;
let claimHeld = false;
let failReads = false;
const payment = {id: 42, amount: 1, method: 'credit_card', refers_to_model: 'rental_reservation', refers_to_id: 10502, direction: 'inflow', type: 'final_payment', prepaid: 0, payment_date: '2026-10-14'};
const context = vm.createContext({
  console: {log() {}, warn() {}, error() {}}, URLSearchParams, FormData, Date,
  Response, Request, TextEncoder, crypto: globalThis.crypto,
  Deno: {env: {get: (name) => name === 'RENTHUB_USER_API_KEY' ? 'test-token' : 'test'}, serve() {}},
  fetch: async (url, init = {}) => {
    if (url.includes('/payment/upsert')) {
      paymentPosts++;
      assert.equal(init.body.get('refers_to_id'), '10502');
      assert.equal(init.body.get('amount'), '1.00');
      assert.equal(init.body.get('prepaid'), '0');
      assert.equal(init.body.get('inserted_from'), 'object');
      assert.equal(init.body.get('action'), null);
      return Response.json({result: {id: 42}});
    }
    if (failReads) throw new Error('read unavailable');
    if (url.includes('/payment/42')) return Response.json({result: payment});
    assert(!url.includes('created_from') && !url.includes('payment_date_from'));
    return Response.json({result: {data: [], meta: {total: 0}}});
  },
  createClient: () => ({from: () => {
    const chain = {update() {return chain;}, eq() {return chain;}, is() {return chain;}, select() {return chain;}, async maybeSingle() {
      if (claimHeld) return {data: null};
      claimHeld = true;
      return {data: {id: 'trial'}};
    }};
    return chain;
  }}),
});
vm.runInContext(js, context);
const contract = () => ({id: 'trial', contract_number: 63290, renthub_contract_id: 'FBFOD-LHWY0', app_payload: {}});
const detail = {result: {booking: {id: 10502}}};
assert.equal(context.paymentTrialTarget(contract(), 10502, 'credit_card', 1), true);
for (const [c, id, method, amount] of [
  [{...contract(), contract_number: 63026}, 10502, 'credit_card', 1],
  [{...contract(), renthub_contract_id: 'OTHER'}, 10502, 'credit_card', 1],
  [contract(), 10013, 'credit_card', 1],
  [contract(), 10502, 'cash', 1],
  [contract(), 10502, 'credit_card', 2],
]) assert.equal(context.paymentTrialTarget(c, id, method, amount), false);

const lookup = (rows, total = rows.length) => ({result: {data: rows, meta: {total}}});
assert.equal(context.paymentLookupId(lookup([payment]), 10502, 'credit_card', 1), 42);
assert.equal(context.paymentLookupId(lookup([{...payment, refers_to_id: 10013}]), 10502, 'credit_card', 1), 0);
assert.throws(() => context.paymentLookupId(lookup([{...payment, refers_to_id: undefined}]), 10502, 'credit_card', 1));
assert.throws(() => context.paymentLookupId(lookup([payment, {...payment, id: 43}]), 10502, 'credit_card', 1));
assert.throws(() => context.paymentLookupId(lookup([], 10), 10502, 'credit_card', 1));
assert.throws(() => context.paymentLookupId({result: []}, 10502, 'credit_card', 1));
context.assertAccountingPaymentReceipt({result: payment}, 42, 10502, 'credit_card', 1);
assert.throws(() => context.assertAccountingPaymentReceipt({result: {...payment, prepaid: 1}}, 42, 10502, 'credit_card', 1));
assert.throws(() => context.assertAccountingPaymentReceipt({result: {...payment, payment_date: null}}, 42, 10502, 'credit_card', 1));

failReads = true;
const blocked = await context.syncRenthubAccountingPayment(contract(), detail, 'credit_card', 1);
assert.equal(blocked.pending, true);
assert.equal(paymentPosts, 0);
assert.equal(claimHeld, false);
failReads = false;
const concurrent = await Promise.all([
  context.syncRenthubAccountingPayment(contract(), detail, 'credit_card', 1),
  context.syncRenthubAccountingPayment(contract(), detail, 'credit_card', 1),
]);
assert.equal(paymentPosts, 1);
assert.equal(concurrent.filter(r => r.verified === true).length, 1);
assert.equal(concurrent.filter(r => r.pending === true).length, 1);
const retry = await context.syncRenthubAccountingPayment({...contract(), app_payload: {renthub_payment_attempted_at: '2026-10-14T09:00:00Z'}}, detail, 'credit_card', 1);
assert.equal(retry.pending, true);
assert.equal(paymentPosts, 1);
const outside = await context.syncRenthubAccountingPayment({...contract(), contract_number: 63026}, detail, 'credit_card', 1);
assert.equal(outside.skipped, true);
assert.equal(paymentPosts, 1);
console.log('Payment safety checks passed: exact binding, incomplete reads, PREPAID, concurrency, and uncertain retries.');

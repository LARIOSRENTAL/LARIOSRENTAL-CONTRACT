const assert = require('node:assert/strict');
const fs = require('node:fs');

const backend = fs.readFileSync(require.resolve('../supabase/functions/stripe-checkout/index.ts'), 'utf8');
assert.match(backend, /terminal_readers/);
assert.match(backend, /terminal_create/);
assert.match(backend, /terminal_verify/);
assert.match(backend, /terminal_cancel/);
assert.match(backend, /payment_method_types\[0\][\s\S]*card_present/);
assert.match(backend, /process_payment_intent/);
assert.match(backend, /STRIPE_TERMINAL_LOCATION_ID/);
assert.match(backend, /enable_customer_cancellation/);
assert.match(backend, /lr-terminal-/);

const frontend = fs.readFileSync(require.resolve('../app-v84/www/payment-methods-v1.js'), 'utf8');
assert.match(frontend, /lrTerminalAmount/);
assert.match(frontend, /amount_cents/);
assert.match(frontend, /cobro REAL/);
assert.match(frontend, /terminal_cancel/);
assert.match(frontend, /Esperando la tarjeta en el lector/);

console.log('Stripe Terminal flow: ok');

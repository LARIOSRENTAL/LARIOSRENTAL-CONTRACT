const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const booking = read('supabase/functions/renthub-booking/index.ts');
const transfer = read('supabase/functions/renthub-transfer/index.ts');
const migration = read('supabase/migrations/20261031173000_distinct_named_paid_bookings.sql');

assert.match(booking, /RENTHUB_USER_API_KEY"\)\|\|env\("RENTHUB_USER_API_PASSWORD/, 'User API key must be exchanged through login');
assert.match(booking, /module\/rental\/api\/v1\/reservation\?/, 'existing reservations must use the verified reservation collection endpoint');
assert.match(booking, /name\.endsWith\(" "\+target\)/, 'surname-only WhatsApp names must match full Renthub customer names');
assert.match(booking, /selectExistingBookings/, 'multiple same-time bookings must be reduced by exact customer name');
assert.match(booking, /paidExistingHint/, 'paid/existing messages must never create a second Renthub booking');
assert.match(booking, /No se crea otra; queda pendiente de enlazar la original por nombre/, 'paid booking guard must fail closed');

assert.match(transfer, /const linkedExisting =/, 'linked existing reservations need a dedicated update-only path');
assert.match(transfer, /renthub_existing_booking_preserved: true/, 'the original booking must be marked as preserved');
assert.match(transfer, /replacement_skipped: true/, 'linked existing reservations must skip replacement');
assert.match(transfer, /cancellation_skipped: true/, 'linked existing reservations must skip cancellation');

assert.match(migration, /a_specific and b_specific and a_name<>b_name/, 'different explicit customer names must not collapse on a shared agency phone');

console.log('Renthub existing booking safety: ok');

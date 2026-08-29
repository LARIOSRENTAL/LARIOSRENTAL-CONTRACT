-- Stripe Checkout audit state. Card details never enter this database.
create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  checkout_session_id text not null unique,
  payment_intent_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = lower(currency) and length(currency) = 3),
  status text not null default 'open' check (status in ('open','paid','failed','expired')),
  checkout_url text,
  livemode boolean not null default false,
  expires_at timestamptz,
  paid_at timestamptz,
  last_event_id text,
  failure_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_payments_contract_created_idx
  on public.stripe_payments(contract_id, created_at desc);
create index if not exists stripe_payments_created_by_idx
  on public.stripe_payments(created_by);

alter table public.stripe_payments enable row level security;

drop policy if exists "employees read stripe payments" on public.stripe_payments;
create policy "employees read stripe payments"
on public.stripe_payments for select to authenticated
using ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee','admin']));

revoke all on table public.stripe_payments from public, anon, authenticated;
grant select on table public.stripe_payments to authenticated;
grant all on table public.stripe_payments to service_role;

comment on table public.stripe_payments is
  'Stripe Checkout reconciliation state. Contains identifiers and amounts, never card data.';


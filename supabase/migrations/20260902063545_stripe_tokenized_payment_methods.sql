-- Reusable Stripe payment methods. Full PAN and CVC must never enter this database.
create table if not exists public.stripe_payment_methods (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.contracts(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  stripe_payment_method_id text not null check (stripe_payment_method_id ~ '^pm_[A-Za-z0-9_]+$'),
  card_brand text,
  card_last4 text not null check (card_last4 ~ '^[0-9]{4}$'),
  exp_month smallint not null check (exp_month between 1 and 12),
  exp_year smallint not null check (exp_year between 2020 and 9999),
  reusable boolean not null default true,
  consented_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_payment_methods_customer_idx
  on public.stripe_payment_methods(customer_id, created_at desc);
create index if not exists stripe_payment_methods_created_by_idx
  on public.stripe_payment_methods(created_by);

alter table public.stripe_payment_methods enable row level security;
revoke all on table public.stripe_payment_methods from public, anon, authenticated;
grant all on table public.stripe_payment_methods to service_role;

comment on table public.stripe_payment_methods is
  'Stripe tokens and masked card metadata only. Never stores full PAN, security code, PIN or track data.';

create table if not exists public.card_access_audit (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  accessed_by uuid references auth.users(id) on delete set null,
  action text not null default 'view_masked' check (action = 'view_masked'),
  created_at timestamptz not null default now()
);

create index if not exists card_access_audit_contract_created_idx
  on public.card_access_audit(contract_id, created_at desc);
create index if not exists card_access_audit_accessed_by_idx
  on public.card_access_audit(accessed_by);

alter table public.card_access_audit enable row level security;
revoke all on table public.card_access_audit from public, anon, authenticated;
grant all on table public.card_access_audit to service_role;

comment on table public.card_access_audit is
  'Server-only audit log for administrator requests to view masked payment-method details.';

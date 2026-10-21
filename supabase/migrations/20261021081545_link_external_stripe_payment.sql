-- One Stripe payment can only settle one rental, even under simultaneous requests.
create unique index if not exists stripe_payments_intent_unique
  on public.stripe_payments(payment_intent_id) where payment_intent_id is not null;

create or replace function public.link_external_stripe_payment(
  p_contract_id uuid, p_payment_intent_id text, p_amount_cents integer,
  p_actor_id uuid, p_livemode boolean, p_paid_at timestamptz, p_last4 text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.contracts%rowtype;
  payment public.stripe_payments%rowtype;
  payload jsonb;
begin
  -- Only the authenticated Edge Function's service client can execute this RPC.
  if p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' or p_amount_cents <= 0 then
    raise exception 'Referencia o importe no válido';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_payment_intent_id, 0));
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado'; end if;
  if round(c.total * 100) is distinct from p_amount_cents::numeric then
    raise exception 'El total del contrato ha cambiado. Comprueba de nuevo el pago';
  end if;
  select * into payment from public.stripe_payments where payment_intent_id = p_payment_intent_id for update;
  if found then
    if payment.contract_id <> p_contract_id then raise exception 'Ese pago ya está vinculado a otro contrato'; end if;
    if payment.checkout_session_id <> 'external:' || p_payment_intent_id then
      raise exception 'Ese pago ya se gestiona mediante Checkout o Terminal';
    end if;
    return jsonb_build_object('already_linked', true);
  end if;
  payload := coalesce(c.app_payload, '{}'::jsonb);
  if payload->>'payment_status' = 'paid' then raise exception 'El contrato ya figura pagado'; end if;
  insert into public.stripe_payments(contract_id, checkout_session_id, payment_intent_id, amount_cents,
    currency, status, livemode, paid_at, created_by)
  values(p_contract_id, 'external:' || p_payment_intent_id, p_payment_intent_id, p_amount_cents,
    'eur', 'paid', p_livemode, p_paid_at, p_actor_id);
  payload := payload || jsonb_build_object('payment_status','paid','payment_channel','stripe_external',
    'payment_reference',p_payment_intent_id,'stripe_payment_intent_id',p_payment_intent_id,
    'payment_amount_cents',p_amount_cents,'stripe_amount_cents',p_amount_cents,
    'payment_paid_at',p_paid_at,'stripe_paid_at',p_paid_at);
  payload := jsonb_set(payload, '{payment_events}',
    (case when jsonb_typeof(payload->'payment_events') = 'array' then payload->'payment_events' else '[]'::jsonb end)
      || jsonb_build_array(jsonb_build_object('type','payment','channel','stripe_external',
      'reference',p_payment_intent_id,'amount_cents',p_amount_cents,'status','paid',
      'created_by',p_actor_id,'at',now())));
  update public.contracts set payment_method = 'Tarjeta / Stripe', app_payload = payload,
    card_last4 = case when p_last4 ~ '^\d{4}$' then p_last4 else card_last4 end, updated_at = now()
    where id = p_contract_id;
  return jsonb_build_object('already_linked', false);
end;
$$;
revoke all on function public.link_external_stripe_payment(uuid,text,integer,uuid,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.link_external_stripe_payment(uuid,text,integer,uuid,boolean,timestamptz,text) to service_role;

-- Setup sessions only collect a reusable card. They never create an additional rental charge.
create table if not exists public.stripe_card_setups (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  checkout_session_id text not null unique,
  checkout_url text not null,
  stripe_customer_id text not null,
  status text not null default 'open' check (status in ('open','complete','expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists stripe_card_setups_contract_idx on public.stripe_card_setups(contract_id, created_at desc);
create index if not exists stripe_card_setups_actor_idx on public.stripe_card_setups(created_by);
alter table public.stripe_card_setups enable row level security;
revoke all on public.stripe_card_setups from public, anon, authenticated;
grant all on public.stripe_card_setups to service_role;

create or replace function public.save_external_stripe_card(
  p_contract_id uuid, p_actor_id uuid, p_stripe_customer_id text, p_payment_method_id text,
  p_brand text, p_last4 text, p_exp_month integer, p_exp_year integer
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' or p_payment_method_id !~ '^pm_[A-Za-z0-9]+$'
    or p_last4 !~ '^[0-9]{4}$' or p_exp_month not between 1 and 12 or p_exp_year not between 2020 and 9999 then
    raise exception 'Datos de tarjeta no válidos';
  end if;
  perform 1 from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contrato no encontrado'; end if;
  insert into public.stripe_payment_methods(contract_id, customer_id, stripe_customer_id, stripe_payment_method_id,
    card_brand, card_last4, exp_month, exp_year, reusable, consented_at, created_by, updated_at)
  select id, customer_id, p_stripe_customer_id, p_payment_method_id, left(p_brand,40), p_last4,
    p_exp_month, p_exp_year, true, now(), p_actor_id, now() from public.contracts where id=p_contract_id
  on conflict(contract_id) do update set stripe_customer_id=excluded.stripe_customer_id,
    stripe_payment_method_id=excluded.stripe_payment_method_id,card_brand=excluded.card_brand,
    card_last4=excluded.card_last4,exp_month=excluded.exp_month,exp_year=excluded.exp_year,
    reusable=true,consented_at=excluded.consented_at,created_by=excluded.created_by,updated_at=now();
  update public.contracts set card_last4=p_last4,card_expiry_month=p_exp_month,card_expiry_year=p_exp_year,
    app_payload=coalesce(app_payload,'{}'::jsonb)||jsonb_build_object('stripe_card_registered',true),updated_at=now()
    where id=p_contract_id;
end;
$$;
revoke all on function public.save_external_stripe_card(uuid,uuid,text,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.save_external_stripe_card(uuid,uuid,text,text,text,text,integer,integer) to service_role;

-- Normal editor saves send form fields only. Preserve settlement and setup evidence.
create or replace function public.preserve_external_stripe_link() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text;
begin
  if old.app_payload->>'payment_channel'='stripe_external' and old.app_payload->>'payment_status'='paid' then
    foreach k in array array['payment_status','payment_channel','payment_reference','stripe_payment_intent_id',
      'payment_amount_cents','stripe_amount_cents','payment_paid_at','stripe_paid_at','payment_events'] loop
      if not coalesce(new.app_payload,'{}'::jsonb) ? k then
        new.app_payload:=coalesce(new.app_payload,'{}'::jsonb)||jsonb_build_object(k,old.app_payload->k);
      end if;
    end loop;
  end if;
  if old.app_payload->>'stripe_card_registered'='true' then
    new.app_payload:=coalesce(new.app_payload,'{}'::jsonb)||jsonb_build_object('stripe_card_registered',true);
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_external_stripe_link() from public,anon,authenticated;
drop trigger if exists preserve_external_stripe_link on public.contracts;
create trigger preserve_external_stripe_link before update of app_payload on public.contracts
  for each row execute function public.preserve_external_stripe_link();

-- One active native attempt per contract, including concurrent devices and amount changes.
create unique index if not exists stripe_native_one_open_per_contract on public.stripe_payments(contract_id) where status='open' and checkout_session_id like 'tap:%';

-- Called only after the server has independently verified Stripe, never from a client.
create or replace function public.complete_native_stripe_payment(p_contract_id uuid,p_payment_intent_id text,p_amount_cents integer)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.contracts%rowtype; p public.stripe_payments%rowtype; payload jsonb;
begin
 select * into c from public.contracts where id=p_contract_id for update;
 if not found then raise exception 'Contrato no encontrado'; end if;
 select * into p from public.stripe_payments where contract_id=p_contract_id and payment_intent_id=p_payment_intent_id for update;
 if not found or p.checkout_session_id <> 'tap:'||p_payment_intent_id or p.amount_cents<>p_amount_cents then raise exception 'El cobro no corresponde al contrato'; end if;
 if p.status='paid' then return; end if;
 if c.app_payload->>'payment_status'='paid' and coalesce(c.app_payload->>'payment_reference','')<>p_payment_intent_id then raise exception 'El contrato ya tiene otro cobro confirmado'; end if;
 payload:=coalesce(c.app_payload,'{}'::jsonb)||jsonb_build_object('payment_status','paid','payment_channel','tap_to_pay','payment_reference',p_payment_intent_id,'stripe_payment_intent_id',p_payment_intent_id,'payment_amount_cents',p_amount_cents,'stripe_amount_cents',p_amount_cents,'payment_paid_at',now(),'stripe_paid_at',now());
 payload:=jsonb_set(payload,'{payment_events}',(case when jsonb_typeof(payload->'payment_events')='array' then payload->'payment_events' else '[]'::jsonb end)||jsonb_build_array(jsonb_build_object('type','payment','channel','tap_to_pay','reference',p_payment_intent_id,'amount_cents',p_amount_cents,'status','paid','created_by',p.created_by,'at',now())));
 update public.contracts set payment_method='Tarjeta / Stripe',app_payload=payload,updated_at=now() where id=p_contract_id;
 update public.stripe_payments set status='paid',paid_at=now(),failure_message=null,updated_at=now() where id=p.id;
end;
$$;
revoke all on function public.complete_native_stripe_payment(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.complete_native_stripe_payment(uuid,text,integer) to service_role;

-- Preserve payment evidence when the ordinary contract editor sends only form fields.
create or replace function public.preserve_external_stripe_link() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if old.app_payload->>'payment_channel' in ('stripe_external','tap_to_pay') and old.app_payload->>'payment_status'='paid' then
  foreach k in array array['payment_status','payment_channel','payment_reference','stripe_payment_intent_id','payment_amount_cents','stripe_amount_cents','payment_paid_at','stripe_paid_at','payment_events'] loop
   if not coalesce(new.app_payload,'{}'::jsonb) ? k then new.app_payload:=coalesce(new.app_payload,'{}'::jsonb)||jsonb_build_object(k,old.app_payload->k); end if;
  end loop;
 end if;
 if old.app_payload->>'stripe_card_registered'='true' then new.app_payload:=coalesce(new.app_payload,'{}'::jsonb)||jsonb_build_object('stripe_card_registered',true); end if;
 return new;
end;
$$;

-- Signing secrets stay encrypted; only backend service_role may read or provision.
create or replace function public.app_stripe_webhook_secret_get() returns text
language sql security definer set search_path=''
as $$ select decrypted_secret from vault.decrypted_secrets where name='larios_stripe_webhook' limit 1 $$;
revoke all on function public.app_stripe_webhook_secret_get() from public,anon,authenticated;
grant execute on function public.app_stripe_webhook_secret_get() to service_role;

create or replace function public.app_stripe_webhook_secret_set(p_secret text) returns void
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if p_secret !~ '^whsec_[A-Za-z0-9]+$' then raise exception 'Invalid webhook secret'; end if;
 perform pg_advisory_xact_lock(hashtext('larios_stripe_webhook'));
 select id into v_id from vault.secrets where name='larios_stripe_webhook';
 if v_id is null then perform vault.create_secret(p_secret,'larios_stripe_webhook','Stripe webhook signature for native and Checkout payments');
 else perform vault.update_secret(v_id,p_secret);end if;
end;
$$;
revoke all on function public.app_stripe_webhook_secret_set(text) from public,anon,authenticated;
grant execute on function public.app_stripe_webhook_secret_set(text) to service_role;

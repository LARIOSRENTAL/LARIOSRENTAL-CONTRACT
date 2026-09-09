-- Renthub Partner API credentials remain encrypted in Supabase Vault.
-- This accessor is callable only by the server-side service role.

create or replace function public.app_get_renthub_secret()
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret_value text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select decrypted_secret
    into secret_value
  from vault.decrypted_secrets
  where name = 'renthub_partner_secret'
  order by created_at desc
  limit 1;

  return secret_value;
end;
$$;

revoke all on function public.app_get_renthub_secret() from public, anon, authenticated;
grant execute on function public.app_get_renthub_secret() to service_role;


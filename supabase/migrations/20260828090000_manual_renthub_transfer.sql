-- Manual, verified Renthub handoff. No automatic synchronization is enabled.

alter table public.renthub_sync_log
  add column if not exists external_reference text,
  add column if not exists verification_hash text,
  add column if not exists verified_at timestamptz,
  add column if not exists purged_at timestamptz;

do $$
declare fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'renthub_sync_log'
    and con.contype = 'f' and pg_get_constraintdef(con.oid) like '%(contract_id)%';
  if fk_name is not null then
    execute format('alter table public.renthub_sync_log drop constraint %I', fk_name);
  end if;
end $$;

alter table public.renthub_sync_log
  add constraint renthub_sync_log_contract_id_fkey
  foreign key (contract_id) references public.contracts(id) on delete set null;

create or replace function public.app_purge_verified_renthub_contract(
  p_contract_id uuid, p_external_reference text, p_verification_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.contracts%rowtype;
  v_customer_id uuid;
  v_driver_ids uuid[] := array[]::uuid[];
  v_driver_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if c.renthub_sync_status <> 'verified' then raise exception 'Renthub verification required'; end if;
  if coalesce(c.renthub_contract_id, '') = '' or c.renthub_contract_id <> coalesce(p_external_reference, '') then
    raise exception 'Renthub reference mismatch';
  end if;
  if coalesce(p_verification_hash, '') = '' then raise exception 'Verification hash required'; end if;

  v_customer_id := c.customer_id;
  select coalesce(array_agg(distinct driver_id) filter (where driver_id is not null), array[]::uuid[])
  into v_driver_ids
  from (
    select c.main_driver_id as driver_id
    union all
    select cd.driver_id from public.contract_drivers cd where cd.contract_id = c.id
  ) d;

  update public.renthub_sync_log set contract_id = null where contract_id = c.id;
  insert into public.renthub_sync_log(
    contract_id, operation, direction, request_data, response_data, success,
    external_reference, verification_hash, verified_at, purged_at
  ) values (
    null, 'purge_local_copy', 'local', '{}'::jsonb,
    jsonb_build_object('contract_number', 'LR-' || lpad(c.contract_number::text, 6, '0')),
    true, c.renthub_contract_id, p_verification_hash, c.renthub_last_sync_at, now()
  );

  delete from public.contracts where id = c.id;
  foreach v_driver_id in array v_driver_ids loop
    if not exists (select 1 from public.contracts where main_driver_id = v_driver_id)
       and not exists (select 1 from public.contract_drivers where driver_id = v_driver_id) then
      delete from public.documents where driver_id = v_driver_id and contract_id is null;
      delete from public.drivers where id = v_driver_id;
    end if;
  end loop;
  if v_customer_id is not null
     and not exists (select 1 from public.contracts where customer_id = v_customer_id)
     and not exists (select 1 from public.drivers where customer_id = v_customer_id) then
    delete from public.documents where customer_id = v_customer_id and contract_id is null;
    delete from public.customers where id = v_customer_id;
  end if;
  return jsonb_build_object('purged', true, 'external_reference', p_external_reference,
    'contract_number', 'LR-' || lpad(c.contract_number::text, 6, '0'));
end;
$$;

revoke all on function public.app_purge_verified_renthub_contract(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_purge_verified_renthub_contract(uuid, text, text) to service_role;

-- Clear employee/admin responsibilities for the mobile app.
-- Employees keep day-to-day contract operations; administrative and destructive
-- operations are enforced in Postgres and not only hidden in the browser.

create or replace function public.app_current_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

revoke all on function public.app_current_role() from public, anon;
grant execute on function public.app_current_role() to authenticated, service_role;

-- Contracts: employees create and edit drafts and may finalize a draft only
-- after its PDF has been attached. Administrators may repair any record.
drop policy if exists "employees contracts" on public.contracts;
drop policy if exists "staff read contracts" on public.contracts;
drop policy if exists "employees create draft contracts" on public.contracts;
drop policy if exists "employees update draft contracts" on public.contracts;
drop policy if exists "admins create contracts" on public.contracts;
drop policy if exists "admins update contracts" on public.contracts;
drop policy if exists "admins delete contracts" on public.contracts;

create policy "staff read contracts" on public.contracts
for select to authenticated
using (public.app_current_role() in ('employee', 'admin'));

create policy "employees create draft contracts" on public.contracts
for insert to authenticated
with check (public.app_current_role() = 'employee' and status = 'draft');

create policy "employees update draft contracts" on public.contracts
for update to authenticated
using (public.app_current_role() = 'employee' and status = 'draft')
with check (
  public.app_current_role() = 'employee'
  and status in ('draft', 'confirmed')
  and (status = 'draft' or pdf_path is not null)
);

create policy "admins create contracts" on public.contracts
for insert to authenticated
with check (public.app_current_role() = 'admin');

create policy "admins update contracts" on public.contracts
for update to authenticated
using (public.app_current_role() = 'admin')
with check (public.app_current_role() = 'admin');

create policy "admins delete contracts" on public.contracts
for delete to authenticated
using (public.app_current_role() = 'admin');

revoke all on table public.contracts from public, anon, authenticated;
grant select, insert, update, delete on table public.contracts to authenticated;

-- The controlled post-contract operations need to update a locked contract.
-- They retain their existing validation and always preserve a separate event row.
alter function public.app_extend_contract(uuid, jsonb, text) security definer;
alter function public.app_change_contract_vehicle(uuid, jsonb, text) security definer;
alter function public.app_mark_contract_returned(uuid, boolean) security definer;

revoke all on function public.app_extend_contract(uuid, jsonb, text) from public, anon;
revoke all on function public.app_change_contract_vehicle(uuid, jsonb, text) from public, anon;
revoke all on function public.app_mark_contract_returned(uuid, boolean) from public, anon;
grant execute on function public.app_extend_contract(uuid, jsonb, text) to authenticated;
grant execute on function public.app_change_contract_vehicle(uuid, jsonb, text) to authenticated;
grant execute on function public.app_mark_contract_returned(uuid, boolean) to authenticated;

create or replace function public.app_enforce_contract_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text := public.app_current_role();
begin
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if current_user = 'service_role' or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_role not in ('employee', 'admin') then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and v_role <> 'admin' then
    raise exception 'ADMIN_REQUIRED_DELETE' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and v_role = 'employee'
     and old.status <> 'draft' and current_user = 'authenticated' then
    raise exception 'ADMIN_REQUIRED_FINALIZED_CONTRACT' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists app_contract_role_guard on public.contracts;
create trigger app_contract_role_guard
before insert or update or delete on public.contracts
for each row execute function public.app_enforce_contract_role();

revoke all on function public.app_enforce_contract_role() from public, anon, authenticated;

-- Operational records: staff may read/create/update. Deletion is administrative.
drop policy if exists "employees vehicle changes" on public.contract_vehicle_changes;

do $policy$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'drivers', 'vehicles', 'contract_drivers',
    'documents', 'damages', 'damage_photos'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'employees ' || replace(table_name, '_', ' '), table_name);
    execute format('drop policy if exists %I on public.%I', 'staff read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'staff create ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'staff update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admins delete ' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_current_role() in (''employee'', ''admin''))', 'staff read ' || table_name, table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.app_current_role() in (''employee'', ''admin''))', 'staff create ' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.app_current_role() in (''employee'', ''admin'')) with check (public.app_current_role() in (''employee'', ''admin''))', 'staff update ' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.app_current_role() = ''admin'')', 'admins delete ' || table_name, table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$policy$;

-- Contract history is append-only for employees.
do $policy$
declare
  table_name text;
begin
  foreach table_name in array array[
    'contract_files', 'contract_extensions', 'contract_vehicle_changes'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'employees ' || replace(table_name, '_', ' '), table_name);
    execute format('drop policy if exists %I on public.%I', 'staff read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'staff append ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admins update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admins delete ' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_current_role() in (''employee'', ''admin''))', 'staff read ' || table_name, table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.app_current_role() in (''employee'', ''admin''))', 'staff append ' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.app_current_role() = ''admin'') with check (public.app_current_role() = ''admin'')', 'admins update ' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.app_current_role() = ''admin'')', 'admins delete ' || table_name, table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end;
$policy$;

-- Official tariff tables are readable by staff and writable only by admins.
drop policy if exists "employees pricing" on public.pricing;
drop policy if exists "staff read pricing" on public.pricing;
drop policy if exists "admins create pricing" on public.pricing;
drop policy if exists "admins update pricing" on public.pricing;
drop policy if exists "admins delete pricing" on public.pricing;
create policy "staff read pricing" on public.pricing for select to authenticated
using (public.app_current_role() in ('employee', 'admin'));
create policy "admins create pricing" on public.pricing for insert to authenticated
with check (public.app_current_role() = 'admin');
create policy "admins update pricing" on public.pricing for update to authenticated
using (public.app_current_role() = 'admin') with check (public.app_current_role() = 'admin');
create policy "admins delete pricing" on public.pricing for delete to authenticated
using (public.app_current_role() = 'admin');
revoke all on table public.pricing from public, anon, authenticated;
grant select, insert, update, delete on table public.pricing to authenticated;

-- Sync logs are an audit trail written only by trusted server functions.
drop policy if exists "employees renthub sync log" on public.renthub_sync_log;
drop policy if exists "staff read renthub sync log" on public.renthub_sync_log;
create policy "staff read renthub sync log" on public.renthub_sync_log
for select to authenticated using (public.app_current_role() in ('employee', 'admin'));
revoke all on table public.renthub_sync_log from public, anon, authenticated;
grant select on table public.renthub_sync_log to authenticated;

-- Storage: staff can read/upload/update operational files; only an admin may
-- delete a file directly. The verified Renthub purge still uses service_role.
drop policy if exists "employees contracts storage" on storage.objects;
drop policy if exists "employees documents storage" on storage.objects;
drop policy if exists "employees damage photos storage" on storage.objects;

do $storage_policy$
declare
  bucket text;
begin
  foreach bucket in array array['contracts', 'documents', 'damage-photos'] loop
    execute format('drop policy if exists %I on storage.objects', 'staff read ' || bucket);
    execute format('drop policy if exists %I on storage.objects', 'staff upload ' || bucket);
    execute format('drop policy if exists %I on storage.objects', 'staff update ' || bucket);
    execute format('drop policy if exists %I on storage.objects', 'admins delete ' || bucket);
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.app_current_role() in (''employee'', ''admin''))', 'staff read ' || bucket, bucket);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.app_current_role() in (''employee'', ''admin''))', 'staff upload ' || bucket, bucket);
    execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and public.app_current_role() in (''employee'', ''admin'')) with check (bucket_id = %L and public.app_current_role() in (''employee'', ''admin''))', 'staff update ' || bucket, bucket, bucket);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and public.app_current_role() = ''admin'')', 'admins delete ' || bucket, bucket);
  end loop;
end;
$storage_policy$;

comment on function public.app_current_role() is
  'Returns employee/admin from immutable Auth app_metadata for RLS decisions.';

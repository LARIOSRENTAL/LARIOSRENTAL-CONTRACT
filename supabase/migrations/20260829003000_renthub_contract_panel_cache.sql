-- Persistent Renthub catalogue cache for the manual contract handoff.
-- It intentionally contains no customers, drivers, bookings or contract PDFs.

create table if not exists public.renthub_cache (
  resource_type text primary key check (resource_type in ('parameters', 'locations', 'categories')),
  payload jsonb not null default '{}'::jsonb,
  source_hash text,
  cached_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.renthub_cache enable row level security;

drop policy if exists "employees read renthub cache" on public.renthub_cache;
create policy "employees read renthub cache"
on public.renthub_cache for select to authenticated
using ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee', 'admin']));

revoke all on table public.renthub_cache from public, anon, authenticated;
grant select on table public.renthub_cache to authenticated;
grant all on table public.renthub_cache to service_role;

comment on table public.renthub_cache is
  'Manual cache of non-personal Renthub catalogues. Never stores customers, bookings or documents.';


-- Follow-up hardening after the Supabase database advisor review.

-- A trigger function is invoked by Postgres itself and must not be exposed as
-- an RPC to anonymous or signed-in clients.
revoke all on function public.notify_contract_email() from public, anon, authenticated;

-- Keep one permissive policy per operation. This has the same authorization
-- semantics as the split employee/admin policies without evaluating two RLS
-- policies for every write.
drop policy if exists "employees create draft contracts" on public.contracts;
drop policy if exists "admins create contracts" on public.contracts;
drop policy if exists "employees update draft contracts" on public.contracts;
drop policy if exists "admins update contracts" on public.contracts;

create policy "staff create contracts" on public.contracts
for insert to authenticated
with check (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'employee' and status = 'draft')
);

create policy "staff update contracts" on public.contracts
for update to authenticated
using (
  public.app_current_role() = 'admin'
  or (public.app_current_role() = 'employee' and status = 'draft')
)
with check (
  public.app_current_role() = 'admin'
  or (
    public.app_current_role() = 'employee'
    and status in ('draft', 'confirmed')
    and (status = 'draft' or pdf_path is not null)
  )
);

comment on policy "staff create contracts" on public.contracts is
  'Admins may create any contract; employees may create drafts only.';
comment on policy "staff update contracts" on public.contracts is
  'Admins may repair any contract; employees may edit drafts and confirm them after attaching a PDF.';

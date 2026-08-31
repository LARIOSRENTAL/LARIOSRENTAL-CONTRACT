create table if not exists public.tariff_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null default '94',
  start_date date not null,
  end_date date not null,
  markup_percent numeric(7,2) not null default 20,
  priority integer not null default 100,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tariff_periods_dates_check check (end_date >= start_date),
  constraint tariff_periods_markup_check check (markup_percent >= -100 and markup_percent <= 500)
);

alter table public.tariff_periods enable row level security;

drop policy if exists "staff read tariff periods" on public.tariff_periods;
create policy "staff read tariff periods" on public.tariff_periods
for select to authenticated
using (public.app_current_role() = any (array['employee'::text, 'admin'::text]));

drop policy if exists "admins create tariff periods" on public.tariff_periods;
create policy "admins create tariff periods" on public.tariff_periods
for insert to authenticated
with check (public.app_current_role() = 'admin'::text);

drop policy if exists "admins update tariff periods" on public.tariff_periods;
create policy "admins update tariff periods" on public.tariff_periods
for update to authenticated
using (public.app_current_role() = 'admin'::text)
with check (public.app_current_role() = 'admin'::text);

drop policy if exists "admins delete tariff periods" on public.tariff_periods;
create policy "admins delete tariff periods" on public.tariff_periods
for delete to authenticated
using (public.app_current_role() = 'admin'::text);

grant select, insert, update, delete on public.tariff_periods to authenticated;

create index if not exists tariff_periods_active_dates_idx
on public.tariff_periods (start_date, end_date, priority desc)
where active;

create or replace function public.app_extend_contract(p_contract_id uuid, p_data jsonb, p_pdf_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c public.contracts%rowtype;
  v_days integer;
  v_new_days integer;
  v_amount numeric:=greatest(0,coalesce(nullif(p_data->>'extension_total','')::numeric,0));
  v_pending numeric;
  v_previous_return timestamp;
  v_new_return timestamp;
begin
  if auth.uid() is null or public.app_current_role() <> all (array['employee'::text,'admin'::text]) then raise exception 'Staff authorization required' using errcode='42501'; end if;
  if coalesce(p_pdf_path,'')='' then raise exception 'PDF path required'; end if;
  if coalesce(p_data->>'payment_method','')='' then raise exception 'Payment method required'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.status='draft' then raise exception 'Generate the initial contract first'; end if;
  v_previous_return := c.return_date + c.return_time;
  v_new_return := nullif(p_data->>'new_return_date','')::date + nullif(p_data->>'new_return_time','')::time;
  if v_new_return <= v_previous_return then raise exception 'Extended return must be later than current return'; end if;
  v_days := greatest(1, ceil(greatest(0, extract(epoch from (v_new_return-v_previous_return)) - 10800) / 86400.0)::integer);
  v_new_days := c.rental_days + v_days;
  v_pending:=coalesce(nullif(c.app_payload->>'pending_payment_amount','')::numeric,0)+case when coalesce((p_data->>'payment_pending')::boolean,false) then v_amount else 0 end;
  insert into public.contract_extensions(contract_id,extension_days,previous_return_date,previous_return_time,previous_return_location,new_return_date,new_return_time,new_return_location,base_delta,discount_delta,insurance_delta,young_driver_delta,extras_delta,extension_total,new_total,payment_method,payment_pending,pdf_path)
  values(c.id,v_days,c.return_date,c.return_time,c.return_location,(p_data->>'new_return_date')::date,(p_data->>'new_return_time')::time,p_data->>'new_return_location',coalesce(nullif(p_data->>'base_delta','')::numeric,0),coalesce(nullif(p_data->>'discount_delta','')::numeric,0),coalesce(nullif(p_data->>'insurance_delta','')::numeric,0),coalesce(nullif(p_data->>'young_driver_delta','')::numeric,0),coalesce(nullif(p_data->>'extras_delta','')::numeric,0),v_amount,coalesce(nullif(p_data->>'new_total','')::numeric,c.total+v_amount),p_data->>'payment_method',coalesce((p_data->>'payment_pending')::boolean,false),p_pdf_path);
  update public.contracts set
    return_date=(p_data->>'new_return_date')::date,
    return_time=(p_data->>'new_return_time')::time,
    return_location=p_data->>'new_return_location',
    rental_days=v_new_days,
    rental_total=rental_total+coalesce(nullif(p_data->>'base_delta','')::numeric,0),
    insurance_total=insurance_total+coalesce(nullif(p_data->>'insurance_delta','')::numeric,0),
    young_driver_total=young_driver_total+coalesce(nullif(p_data->>'young_driver_delta','')::numeric,0),
    discount_total=discount_total+coalesce(nullif(p_data->>'discount_delta','')::numeric,0),
    total=total+v_amount,
    pdf_path=p_pdf_path,
    app_payload=app_payload||jsonb_build_object('latest_extension',p_data||jsonb_build_object('extension_days',v_days,'new_rental_days',v_new_days),'pending_payment_amount',v_pending),
    updated_at=now()
  where id=c.id;
  insert into public.contract_files(contract_id,file_type,file_path,include_in_final_pdf) values(c.id,'extension',p_pdf_path,true);
  return public.app_contract_record(c.id);
end;
$function$;

revoke all on function public.app_extend_contract(uuid,jsonb,text) from public;
grant execute on function public.app_extend_contract(uuid,jsonb,text) to authenticated;

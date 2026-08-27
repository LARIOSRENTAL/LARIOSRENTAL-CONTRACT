create table if not exists public.contract_extensions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  extension_days integer not null check (extension_days > 0),
  previous_return_date date not null,
  previous_return_time time not null,
  previous_return_location text,
  new_return_date date not null,
  new_return_time time not null,
  new_return_location text not null,
  base_delta numeric not null default 0,
  discount_delta numeric not null default 0,
  insurance_delta numeric not null default 0,
  young_driver_delta numeric not null default 0,
  extras_delta numeric not null default 0,
  extension_total numeric not null check (extension_total >= 0),
  new_total numeric not null check (new_total >= 0),
  payment_method text not null,
  payment_pending boolean not null default false,
  pdf_path text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.contract_vehicle_changes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  old_vehicle_id uuid references public.vehicles(id),
  new_vehicle_id uuid not null references public.vehicles(id),
  old_vehicle_model text,
  old_vehicle_plate text,
  old_vehicle_fuel text not null,
  new_vehicle_make text not null,
  new_vehicle_model text not null,
  new_vehicle_plate text not null,
  new_vehicle_fuel_type text not null,
  new_vehicle_fuel_level text not null,
  change_date date not null,
  change_time time not null,
  reason text not null,
  pdf_path text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contract_extensions_contract_created_idx on public.contract_extensions(contract_id,created_at desc);
create index if not exists contract_vehicle_changes_contract_created_idx on public.contract_vehicle_changes(contract_id,created_at desc);
create index if not exists contract_vehicle_changes_old_vehicle_idx on public.contract_vehicle_changes(old_vehicle_id);
create index if not exists contract_vehicle_changes_new_vehicle_idx on public.contract_vehicle_changes(new_vehicle_id);

alter table public.contract_extensions enable row level security;
alter table public.contract_vehicle_changes enable row level security;

create policy "employees contract extensions" on public.contract_extensions for all to authenticated
using ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee','admin']))
with check ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee','admin']));

create policy "employees vehicle changes" on public.contract_vehicle_changes for all to authenticated
using ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee','admin']))
with check ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = any (array['employee','admin']));

grant select,insert,update,delete on public.contract_extensions to authenticated;
grant select,insert,update,delete on public.contract_vehicle_changes to authenticated;

create or replace function public.app_extend_contract(p_contract_id uuid,p_data jsonb,p_pdf_path text)
returns jsonb language plpgsql set search_path='public','pg_temp' as $function$
declare
  c public.contracts%rowtype;
  v_days integer:=greatest(1,coalesce(nullif(p_data->>'extension_days','')::integer,1));
  v_new_days integer:=greatest(1,coalesce(nullif(p_data->>'new_rental_days','')::integer,1));
  v_amount numeric:=greatest(0,coalesce(nullif(p_data->>'extension_total','')::numeric,0));
  v_pending numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if coalesce(p_pdf_path,'')='' then raise exception 'PDF path required'; end if;
  if coalesce(p_data->>'payment_method','')='' then raise exception 'Payment method required'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.status='draft' then raise exception 'Generate the initial contract first'; end if;
  if (nullif(p_data->>'new_return_date','')::date + nullif(p_data->>'new_return_time','')::time) <= (c.return_date+c.return_time) then raise exception 'Extended return must be later than current return'; end if;
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
    app_payload=app_payload||jsonb_build_object('latest_extension',p_data,'pending_payment_amount',v_pending),
    updated_at=now()
  where id=c.id;
  insert into public.contract_files(contract_id,file_type,file_path,include_in_final_pdf) values(c.id,'extension',p_pdf_path,true);
  return public.app_contract_record(c.id);
end;
$function$;

create or replace function public.app_change_contract_vehicle(p_contract_id uuid,p_data jsonb,p_pdf_path text)
returns jsonb language plpgsql set search_path='public','pg_temp' as $function$
declare
  c public.contracts%rowtype;
  v_new_vehicle_id uuid;
  v_plate text:=upper(regexp_replace(coalesce(p_data->>'new_vehicle_plate',''),'[[:space:]]','','g'));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_plate='' or coalesce(p_data->>'new_vehicle_model','')='' or coalesce(p_data->>'reason','')='' then raise exception 'Missing vehicle change data'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.status='draft' then raise exception 'Generate the initial contract first'; end if;
  select id into v_new_vehicle_id from public.vehicles where upper(regexp_replace(coalesce(registration,''),'[[:space:]]','','g'))=v_plate limit 1;
  if v_new_vehicle_id is null then
    insert into public.vehicles(registration,make,model,fuel_type,category,status) values(v_plate,nullif(p_data->>'new_vehicle_make',''),nullif(p_data->>'new_vehicle_model',''),nullif(p_data->>'new_vehicle_fuel_type',''),c.category,'available') returning id into v_new_vehicle_id;
  else
    update public.vehicles set make=nullif(p_data->>'new_vehicle_make',''),model=nullif(p_data->>'new_vehicle_model',''),fuel_type=nullif(p_data->>'new_vehicle_fuel_type',''),updated_at=now() where id=v_new_vehicle_id;
  end if;
  insert into public.contract_vehicle_changes(contract_id,old_vehicle_id,new_vehicle_id,old_vehicle_model,old_vehicle_plate,old_vehicle_fuel,new_vehicle_make,new_vehicle_model,new_vehicle_plate,new_vehicle_fuel_type,new_vehicle_fuel_level,change_date,change_time,reason,pdf_path)
  values(c.id,c.vehicle_id,v_new_vehicle_id,p_data->>'old_vehicle_model',p_data->>'old_vehicle_plate',p_data->>'old_vehicle_fuel',p_data->>'new_vehicle_make',p_data->>'new_vehicle_model',v_plate,p_data->>'new_vehicle_fuel_type',p_data->>'new_vehicle_fuel_level',(p_data->>'change_date')::date,(p_data->>'change_time')::time,p_data->>'reason',p_pdf_path);
  update public.contracts set vehicle_id=v_new_vehicle_id,delivery_fuel=p_data->>'new_vehicle_fuel_level',pdf_path=p_pdf_path,app_payload=app_payload||jsonb_build_object('latest_vehicle_change',p_data),updated_at=now() where id=c.id;
  insert into public.contract_files(contract_id,file_type,file_path,include_in_final_pdf) values(c.id,'vehicle_change',p_pdf_path,true);
  return public.app_contract_record(c.id);
end;
$function$;

create or replace function public.app_mark_contract_returned(p_contract_id uuid,p_deposit_confirmed boolean default false)
returns jsonb language plpgsql set search_path='public','pg_temp' as $function$
declare c public.contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.deposit>0 and not p_deposit_confirmed then raise exception 'Deposit confirmation required'; end if;
  update public.contracts set status='returned',app_payload=app_payload||case when c.deposit>0 then jsonb_build_object('deposit_return_confirmed_at',now()) else '{}'::jsonb end,updated_at=now() where id=c.id;
  return public.app_contract_record(c.id);
end;
$function$;

revoke all on function public.app_extend_contract(uuid,jsonb,text) from public;
revoke all on function public.app_change_contract_vehicle(uuid,jsonb,text) from public;
revoke all on function public.app_mark_contract_returned(uuid,boolean) from public;
grant execute on function public.app_extend_contract(uuid,jsonb,text) to authenticated;
grant execute on function public.app_change_contract_vehicle(uuid,jsonb,text) to authenticated;
grant execute on function public.app_mark_contract_returned(uuid,boolean) to authenticated;

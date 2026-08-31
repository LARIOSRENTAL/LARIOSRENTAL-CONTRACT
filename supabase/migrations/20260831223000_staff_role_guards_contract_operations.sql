-- Require an explicit staff role for state-changing contract operations.
-- Authentication alone is not sufficient.

create or replace function public.app_change_contract_vehicle(p_contract_id uuid, p_data jsonb, p_pdf_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c public.contracts%rowtype;
  v_new_vehicle_id uuid;
  v_plate text:=upper(regexp_replace(coalesce(p_data->>'new_vehicle_plate',''),'[[:space:]]','','g'));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if public.app_current_role() not in ('employee','admin') then raise exception 'Staff role required' using errcode='42501'; end if;
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

create or replace function public.app_mark_contract_returned(p_contract_id uuid, p_deposit_confirmed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare c public.contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if public.app_current_role() not in ('employee','admin') then raise exception 'Staff role required' using errcode='42501'; end if;
  select * into c from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  if c.deposit>0 and not p_deposit_confirmed then raise exception 'Deposit confirmation required'; end if;
  update public.contracts set status='returned',app_payload=app_payload||case when c.deposit>0 then jsonb_build_object('deposit_return_confirmed_at',now()) else '{}'::jsonb end,updated_at=now() where id=c.id;
  return public.app_contract_record(c.id);
end;
$function$;

revoke all on function public.app_change_contract_vehicle(uuid,jsonb,text) from public, anon;
grant execute on function public.app_change_contract_vehicle(uuid,jsonb,text) to authenticated;
revoke all on function public.app_mark_contract_returned(uuid,boolean) from public, anon;
grant execute on function public.app_mark_contract_returned(uuid,boolean) to authenticated;

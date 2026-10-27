create or replace function public.app_add_manual_collaborator_commission(
  p_contract_id uuid,
  p_collaborator_id uuid,
  p_rental_date date default null,
  p_rental_days integer default null,
  p_vehicle_group text default null,
  p_rental_base numeric default null,
  p_commission_percent numeric default null
)
returns public.collaborator_commissions
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_contract public.contracts;
  v_collaborator public.collaborators;
  v_row public.collaborator_commissions;
  v_percent numeric;
  v_days integer;
begin
  if auth.uid() is null or public.app_current_role() <> 'admin' then
    raise exception 'Solo los administradores pueden crear comisiones manuales'
      using errcode = '42501';
  end if;

  if p_contract_id is null or p_collaborator_id is null then
    raise exception 'Selecciona un contrato y un colaborador' using errcode = '22023';
  end if;
  if p_rental_base is null or p_rental_base < 0 then
    raise exception 'La base de alquiler debe ser un importe igual o superior a cero' using errcode = '22023';
  end if;
  if p_commission_percent is not null and (p_commission_percent < 0 or p_commission_percent > 100) then
    raise exception 'El porcentaje debe estar entre 0 y 100' using errcode = '22023';
  end if;
  if p_rental_days is not null and p_rental_days < 1 then
    raise exception 'Los días de alquiler deben ser mayores que cero' using errcode = '22023';
  end if;

  select * into v_contract
  from public.contracts
  where id = p_contract_id and status not in ('draft', 'cancelled')
  for update;
  if v_contract.id is null then
    raise exception 'El contrato no existe o todavía no está finalizado' using errcode = 'P0002';
  end if;

  select * into v_collaborator
  from public.collaborators
  where id = p_collaborator_id and active
  for share;
  if v_collaborator.id is null then
    raise exception 'El colaborador no existe o está inactivo' using errcode = 'P0002';
  end if;

  v_percent := coalesce(p_commission_percent, v_collaborator.commission_percent);
  v_days := greatest(1, coalesce(p_rental_days, v_contract.rental_days, 1));

  insert into public.collaborator_commissions (
    collaborator_id, contract_id, rental_date, rental_days, vehicle_group,
    rental_base, commission_percent, commission_amount, included,
    manual_override, source, payment_status, updated_at
  ) values (
    p_collaborator_id, p_contract_id,
    coalesce(p_rental_date, v_contract.delivery_date, current_date),
    v_days,
    nullif(trim(coalesce(p_vehicle_group, v_contract.category, '')), ''),
    p_rental_base, v_percent, round(p_rental_base * v_percent / 100, 2),
    true, true, 'manual', 'pending', now()
  )
  on conflict (contract_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Ya existe una comisión para este contrato; edítala desde el listado para evitar duplicados'
      using errcode = '23505';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.app_add_manual_collaborator_commission(uuid, uuid, date, integer, text, numeric, numeric) from public, anon;
grant execute on function public.app_add_manual_collaborator_commission(uuid, uuid, date, integer, text, numeric, numeric) to authenticated;

alter table public.collaborator_commissions alter column contract_id drop not null;
alter table public.collaborator_commissions add column if not exists manual_reference text;

create or replace function public.app_add_manual_commission_v2(
  p_collaborator_id uuid,
  p_manual_reference text,
  p_rental_date date,
  p_rental_days integer,
  p_vehicle_group text,
  p_rental_base numeric,
  p_commission_amount numeric
) returns public.collaborator_commissions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_collaborator public.collaborators;
  v_row public.collaborator_commissions;
  v_base numeric := coalesce(p_rental_base, 0);
begin
  if auth.uid() is null or public.app_current_role() <> 'admin' then
    raise exception 'Solo los administradores pueden crear comisiones manuales' using errcode = '42501';
  end if;
  if p_collaborator_id is null then
    raise exception 'Selecciona un colaborador' using errcode = '22023';
  end if;
  if p_rental_date is null then
    raise exception 'Indica la fecha' using errcode = '22023';
  end if;
  if p_rental_days is null or p_rental_days < 1 then
    raise exception 'Los días deben ser mayores que cero' using errcode = '22023';
  end if;
  if v_base < 0 then
    raise exception 'La base no puede ser negativa' using errcode = '22023';
  end if;
  if p_commission_amount is null or p_commission_amount < 0 then
    raise exception 'Introduce un importe de comisión igual o superior a cero' using errcode = '22023';
  end if;
  select * into v_collaborator from public.collaborators
   where id = p_collaborator_id and active for share;
  if v_collaborator.id is null then
    raise exception 'El colaborador no existe o está inactivo' using errcode = 'P0002';
  end if;
  insert into public.collaborator_commissions (
    collaborator_id, contract_id, manual_reference, rental_date, rental_days,
    vehicle_group, rental_base, commission_percent, commission_amount,
    included, manual_override, source, payment_status, updated_at
  ) values (
    p_collaborator_id, null, nullif(trim(coalesce(p_manual_reference,'')), ''),
    p_rental_date, p_rental_days, nullif(trim(coalesce(p_vehicle_group,'')), ''),
    v_base,
    case when v_base > 0 then round(p_commission_amount * 100 / v_base, 2) else 0 end,
    round(p_commission_amount, 2), true, true, 'manual', 'pending', now()
  ) returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.app_add_manual_commission_v2(uuid,text,date,integer,text,numeric,numeric) to authenticated;
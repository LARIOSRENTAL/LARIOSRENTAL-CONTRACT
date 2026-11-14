-- Keep the minimum-driver-age database guard aligned with contract generation:
-- bicycles and e-bikes do not collect a birth date and must not be blocked.
create or replace function public.guard_contract_minimum_driver_age()
returns trigger
language plpgsql
as $function$
declare
  dob date;
  age_on_pickup integer;
begin
  if new.status in ('confirmed','active','rented')
     and old.status is distinct from new.status
     and upper(trim(coalesce(new.category, ''))) not in ('BICICLETA', 'E-BIKE', 'EBIKE', 'B1', 'B2') then
    select coalesce(d.birth_date, c.birth_date) into dob
    from public.customers c
    left join public.drivers d on d.id = new.main_driver_id
    where c.id = new.customer_id;

    if dob is null then
      raise exception using
        errcode = '23514',
        message = 'FECHA_NACIMIENTO_REQUERIDA: Introduce la fecha de nacimiento para generar el contrato.';
    end if;

    age_on_pickup := extract(year from age(coalesce(new.delivery_date, current_date), dob))::int;
    if age_on_pickup < 18 then
      raise exception using
        errcode = '23514',
        message = 'FECHA_NACIMIENTO_MENOR_18: El conductor debe tener al menos 18 años en la fecha de entrega.';
    end if;
  end if;
  return new;
end
$function$;

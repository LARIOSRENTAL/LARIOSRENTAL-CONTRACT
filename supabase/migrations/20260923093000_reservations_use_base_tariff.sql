-- Ensure every newly created reservation starts with the real active Larios Rental base tariff.
-- The final contract can later override this price.

create or replace function public.app_base_rental_price(
  p_group text,
  p_days integer,
  p_quantity integer default 1,
  p_season_94 boolean default false
)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_group text := upper(trim(coalesce(p_group,'')));
  v_category text;
  v_days integer := greatest(1,coalesce(p_days,1));
  v_quantity integer := greatest(1,coalesce(p_quantity,1));
  v_row public.pricing%rowtype;
  v_price numeric := 0;
begin
  v_category := case v_group
    when '50CC' then '50cc'
    when '125CC' then '125cc'
    when 'BICICLETA' then 'BICICLETA'
    when 'E-BIKE' then 'E-BIKE'
    else 'Grupo ' || v_group
  end;

  select * into v_row
  from public.pricing
  where active = true and upper(category) = upper(v_category)
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'No hay una tarifa activa configurada para %', v_category;
  end if;

  if v_row.pricing_type = 'daily_tiers' then
    v_price := (case
      when v_days <= 3 then coalesce(v_row.tier_1_3_daily,0)
      when v_days <= 7 then coalesce(v_row.tier_4_7_daily,0)
      else coalesce(v_row.tier_8_plus_daily,0)
    end) * v_days;
  else
    if v_days <= 7 then
      v_price := case v_days
        when 1 then coalesce(v_row.day_1,0)
        when 2 then coalesce(v_row.day_2,0)
        when 3 then coalesce(v_row.day_3,0)
        when 4 then coalesce(v_row.day_4,0)
        when 5 then coalesce(v_row.day_5,0)
        when 6 then coalesce(v_row.day_6,0)
        else coalesce(v_row.day_7,0)
      end;
    else
      v_price := coalesce(v_row.day_7,0) + coalesce(v_row.extra_day,0) * (v_days - 7);
    end if;
  end if;

  if v_group in ('BICICLETA','E-BIKE') then
    v_price := v_price * v_quantity;
  end if;

  if coalesce(p_season_94,false) then
    v_price := v_price * (1 + coalesce(v_row.season_94_markup,20) / 100);
  end if;

  if v_price <= 0 then
    raise exception 'La tarifa activa de % no devuelve un precio válido', v_category;
  end if;

  return round(v_price,2);
end;
$$;

create or replace function public.app_prepare_reservation_price(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_price numeric;
  v_days integer := greatest(1,coalesce(nullif(v_payload->>'rental_days','')::integer,1));
  v_quantity integer := greatest(1,coalesce(nullif(v_payload->>'vehicle_quantity','')::integer,1));
  v_season_94 boolean := coalesce(nullif(v_payload->>'tariff94','')::boolean,false);
begin
  if coalesce(nullif(v_payload->>'rental_price','')::numeric,0) > 0 then
    return v_payload;
  end if;

  if nullif(trim(v_payload->>'vehicle_group'),'') is null then
    return v_payload;
  end if;

  v_price := public.app_base_rental_price(v_payload->>'vehicle_group',v_days,v_quantity,v_season_94);
  v_payload := jsonb_set(v_payload,'{rental_price}',to_jsonb(to_char(v_price,'FM999999990.00')),true);
  if coalesce(nullif(v_payload->>'total','')::numeric,0) <= 0 then
    v_payload := jsonb_set(v_payload,'{total}',to_jsonb(to_char(v_price,'FM999999990.00')),true);
  end if;
  v_payload := jsonb_set(v_payload,'{base_tariff_price}',to_jsonb(to_char(v_price,'FM999999990.00')),true);
  return v_payload;
end;
$$;

do $$
declare
  v_def text;
  v_old text := '  v_contract_id:=nullif(p_payload->>''id'','''')::uuid;';
  v_new text := '  v_contract_id:=nullif(p_payload->>''id'','''')::uuid;' || E'\n' ||
                '  if v_contract_id is null then' || E'\n' ||
                '    p_payload:=public.app_prepare_reservation_price(p_payload);' || E'\n' ||
                '  end if;';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_save_contract'
  limit 1;

  if v_def is null then
    raise exception 'app_save_contract not found';
  end if;

  if position('app_prepare_reservation_price(p_payload)' in v_def)=0 then
    if position(v_old in v_def)=0 then
      raise exception 'app_save_contract anchor not found';
    end if;
    v_def := replace(v_def,v_old,v_new);
    execute v_def;
  end if;
end $$;

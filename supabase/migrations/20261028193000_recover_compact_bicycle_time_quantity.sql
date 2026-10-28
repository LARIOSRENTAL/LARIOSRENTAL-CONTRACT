create or replace function larios_import.recover_compact_bicycle_time_quantity(
  p_raw text,
  p_candidate jsonb
)
returns jsonb
language plpgsql
stable
set search_path = 'public', 'larios_import', 'pg_temp'
as $function$
declare
  v jsonb := coalesce(p_candidate, '{}'::jsonb);
  v_match text[];
  v_reasons jsonb;
begin
  if jsonb_typeof(v) <> 'object'
     or coalesce(v->>'kind', '') <> 'booking_candidate'
  then
    return v;
  end if;

  -- Compact WhatsApp format: HHMMQ + bicycle word.
  -- Examples: 11002 bicis = 11:00, 2 bicycles;
  --           9002 bicis  = 09:00, 2 bicycles.
  v_match := regexp_match(
    upper(coalesce(p_raw, '')),
    '(^|[^0-9])([01]?[0-9]|2[0-3])([0-5][0-9])(10|[1-9])[[:space:]]*(BICIS?|BICICLETAS?)([^A-Z]|$)'
  );

  if v_match is null then
    return v;
  end if;

  v := jsonb_set(
    v,
    '{pickup_time}',
    to_jsonb(lpad(v_match[2], 2, '0') || ':' || v_match[3]),
    true
  );
  v := jsonb_set(v, '{vehicle_group}', to_jsonb('BICICLETA'::text), true);
  v := jsonb_set(v, '{vehicle_quantity}', to_jsonb(v_match[4]::integer), true);

  select coalesce(jsonb_agg(to_jsonb(reason)), '[]'::jsonb)
    into v_reasons
  from jsonb_array_elements_text(coalesce(v->'review_reasons', '[]'::jsonb)) item(reason)
  where lower(reason) not like '%hora%'
    and lower(reason) not like '%grupo%'
    and lower(reason) not like '%cantidad%';

  return jsonb_set(v, '{review_reasons}', v_reasons, true);
end;
$function$;

create or replace function larios_import.recover_compact_bicycle_time_quantity_trigger()
returns trigger
language plpgsql
set search_path = 'public', 'larios_import', 'pg_temp'
as $function$
begin
  new.candidate := larios_import.recover_compact_bicycle_time_quantity(
    new.raw_text,
    new.candidate
  );
  return new;
end;
$function$;

drop trigger if exists zzzzzz_recover_compact_bicycle_time_quantity
  on larios_import.whatsapp_inbox;

create trigger zzzzzz_recover_compact_bicycle_time_quantity
before insert or update of raw_text, candidate
on larios_import.whatsapp_inbox
for each row execute function larios_import.recover_compact_bicycle_time_quantity_trigger();

-- Repair already staged messages so they can be reviewed or processed with
-- the corrected time and quantity.
update larios_import.whatsapp_inbox
set candidate = larios_import.recover_compact_bicycle_time_quantity(raw_text, candidate)
where raw_text ~* '(^|[^0-9])([01]?[0-9]|2[0-3])([0-5][0-9])(10|[1-9])[[:space:]]*(bicis?|bicicletas?)([^a-z]|$)';

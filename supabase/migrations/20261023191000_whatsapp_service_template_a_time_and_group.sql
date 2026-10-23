-- Keep full service-template WhatsApp bookings from being silently held for review.
-- The parser already extracts dates, addresses, customer, and collaborator from this format,
-- but older messages can omit vehicle_group for the explicit label "COCHE TIPO A".
-- Also accept whole-hour expressions such as "Delivery Time: 10h".

create or replace function larios_import.whatsapp_infer_explicit_car_group()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_raw text;
  v_match text[];
  v_group text;
  v_reasons jsonb;
begin
  if jsonb_typeof(new.candidate) <> 'object' then
    return new;
  end if;

  v_group := upper(trim(coalesce(new.candidate->>'vehicle_group','')));
  if v_group <> '' then
    return new;
  end if;

  v_raw := upper(translate(coalesce(new.raw_text,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_match := regexp_match(
    v_raw,
    '(^|[^A-Z0-9])COCHE[[:space:]]+TIPO[[:space:]]+(A|B|C|D|F|G|H|I|J|K|L|Q)([^A-Z0-9]|$)'
  );
  if v_match is null then
    return new;
  end if;

  v_group := v_match[2];
  new.candidate := jsonb_set(new.candidate,'{vehicle_group}',to_jsonb(v_group),true);

  if jsonb_typeof(new.candidate->'review_reasons') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(r.value) order by r.ordinality),'[]'::jsonb)
      into v_reasons
    from jsonb_array_elements_text(new.candidate->'review_reasons') with ordinality as r(value,ordinality)
    where translate(lower(r.value),'áéíóúüñ','aeiouun') not like '%falta grupo explicito%';
    new.candidate := jsonb_set(new.candidate,'{review_reasons}',coalesce(v_reasons,'[]'::jsonb),true);
  end if;

  return new;
end
$function$;

drop trigger if exists whatsapp_inbox_infer_explicit_car_group on larios_import.whatsapp_inbox;
create trigger whatsapp_inbox_infer_explicit_car_group
before insert or update on larios_import.whatsapp_inbox
for each row execute function larios_import.whatsapp_infer_explicit_car_group();

create or replace function larios_import.whatsapp_has_valid_time_expression(p_raw text)
returns boolean
language plpgsql
immutable
set search_path = 'pg_catalog'
as $function$
declare v text := lower(trim(coalesce(p_raw,'')));
begin
  if v = '' then return false; end if;
  if larios_import.whatsapp_relative_minutes(v) is not null then return true; end if;
  if v ~ '(^|[^0-9])([01]?[0-9]|2[0-3])[:.;h][0-5][0-9]([^0-9]|$)' then return true; end if;
  if v ~ '(^|[^0-9])([01]?[0-9]|2[0-3])[[:space:]]*h([^a-z0-9]|$)' then return true; end if;
  if v ~ '^([01]?[0-9]|2[0-3])[[:space:]]+[0-5][0-9]([^0-9]|$)' then return true; end if;
  if v ~ '^[0-3]?[0-9][/.-][01]?[0-9]([/.-][0-9]{2,4})?[[:space:]]+([01]?[0-9]|2[0-3])[[:space:]]+[0-5][0-9]([^0-9]|$)' then return true; end if;
  return false;
end
$function$;

update larios_import.whatsapp_inbox
set candidate = candidate
where status in ('pending','review')
  and candidate->>'vehicle_group' is null
  and raw_text ~* '(^|[^a-z0-9])coche[[:space:]]+tipo[[:space:]]+(a|b|c|d|f|g|h|i|j|k|l|q)([^a-z0-9]|$)';

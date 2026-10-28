create or replace function larios_import.recover_whatsapp_trailing_reference(
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
  v_agency text := trim(coalesce(p_candidate->>'agency_hint', ''));
  v_location text := trim(coalesce(p_candidate->>'pickup_location_hint', ''));
begin
  if jsonb_typeof(v) <> 'object'
     or coalesce(v->>'kind', '') <> 'booking_candidate'
     or v_agency = ''
     or upper(v_agency) = 'PARTICULAR'
     or v_location !~ '^[A-Za-z]$'
  then
    return v;
  end if;

  v_match := regexp_match(
    coalesce(p_raw, ''),
    '(?i)([0-9]{2,4})[[:space:]]+[a-z][[:space:]]*$'
  );
  if v_match is null then
    return v;
  end if;

  v := jsonb_set(v, '{customer_reference_hint}', to_jsonb(v_match[1]), true);
  v := jsonb_set(v, '{pickup_location_hint}', to_jsonb(v_agency), true);
  v := jsonb_set(v, '{return_location_hint}', to_jsonb(v_agency), true);
  return v;
end;
$function$;

create or replace function larios_import.recover_whatsapp_trailing_reference_trigger()
returns trigger
language plpgsql
set search_path = 'public', 'larios_import', 'pg_temp'
as $function$
begin
  new.candidate := larios_import.recover_whatsapp_trailing_reference(
    new.raw_text,
    new.candidate
  );
  return new;
end;
$function$;

drop trigger if exists zzzzzz_recover_whatsapp_trailing_reference
  on larios_import.whatsapp_inbox;

create trigger zzzzzz_recover_whatsapp_trailing_reference
before insert or update on larios_import.whatsapp_inbox
for each row execute function larios_import.recover_whatsapp_trailing_reference_trigger();

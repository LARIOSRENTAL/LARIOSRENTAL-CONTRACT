alter function public.lr_whatsapp_normalize_location_candidate(text,jsonb)
  rename to _lr_whatsapp_normalize_location_candidate_legacy_20261024;

create function public.lr_whatsapp_normalize_location_candidate(p_raw text, p_candidate jsonb)
returns jsonb
language plpgsql
set search_path to public, pg_temp
as $function$
declare
  v jsonb := public._lr_whatsapp_normalize_location_candidate_legacy_20261024(p_raw,p_candidate);
  v_raw_norm text := upper(translate(coalesce(p_raw,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_name text := trim(coalesce(v->>'customer_name_hint',''));
  v_agency text := trim(coalesce(v->>'agency_hint',''));
  v_loc text := trim(coalesce(v->>'pickup_location_hint',''));
begin
  -- CITY EXPERT is always a collaborator, never the customer or a pickup location.
  if upper(v_name)='CITY EXPERT' then
    v := v - 'customer_name_hint';
  end if;
  if v_raw_norm ~ '(^|[^A-Z0-9])CITY[[:space:]]+EXPERT([^A-Z0-9]|$)'
     or upper(v_agency)='CITY EXPERT'
     or upper(v_name)='CITY EXPERT' then
    v := jsonb_set(v,'{agency_hint}',to_jsonb('CITY EXPERT'::text),true);
  end if;
  if upper(v_loc)='CITY EXPERT' then
    v_loc := '';
  end if;
  -- "ibis budget" is a physical hotel place; "city expert" remains collaborator.
  if v_loc='' and v_raw_norm ~ '(^|[^A-Z])IBIS[[:space:]]+BUDGET([^A-Z]|$)' then
    v_loc := 'HOTEL IBIS BUDGET';
  end if;
  v := jsonb_set(v,'{pickup_location_hint}',to_jsonb(v_loc),true);
  return v;
end
$function$;
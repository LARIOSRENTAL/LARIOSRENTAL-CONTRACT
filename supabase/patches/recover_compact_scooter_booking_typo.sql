-- Recover a compact scooter booking without changing the original message.
CREATE OR REPLACE FUNCTION larios_import.recover_compact_scooter_booking(p_raw text, p_candidate jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO pg_catalog AS $fn$
DECLARE
 v jsonb := coalesce(p_candidate,'{}'::jsonb);
 m text[]; r text[]; reasons jsonb; location text; reference text;
BEGIN
 IF v->>'kind' IS DISTINCT FROM 'booking_candidate' THEN RETURN v; END IF;
 m := regexp_match(coalesce(p_raw,''),
  '^[[:space:]]*(?:(?:hoy|mañana|manana)[[:space:]]+)?([01]?[0-9]|2[0-3])[[:space:]:.h;]+([0-5][0-9])[[:space:]]+(?:([0-5][0-9])[[:space:]]+)?(50|125)[[:space:]]*cc[[:space:]]*([0-9]{1,2})[[:space:]]*d[ií]as?[[:space:]]+(.+)$','i');
 IF m IS NULL OR (m[3] IS NOT NULL AND m[3]<>m[2]) OR m[5]::int NOT BETWEEN 1 AND 60 THEN RETURN v; END IF;
 location := btrim(m[6]);
 IF location ~* '(^|[^[:alpha:]])(devoluci[oó]n|recogida|return|hasta|cuenta|desde)([^[:alpha:]]|$)' THEN RETURN v; END IF;
 r := regexp_match(location,'^(.*),[[:space:]]*([A-Za-z]{0,6}[0-9][A-Za-z0-9-]*)[[:space:]]*$');
 IF r IS NOT NULL THEN location:=btrim(r[1]); reference:=r[2]; END IF;
 IF location='' THEN RETURN v; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO reasons
 FROM jsonb_array_elements_text(coalesce(v->'review_reasons','[]'::jsonb)) t(x)
 WHERE lower(x) NOT LIKE '%falta grupo%' AND lower(x) NOT LIKE '%falta hora%';
 v := v || jsonb_build_object('pickup_time',lpad(m[1],2,'0')||':'||m[2],
  'vehicle_group',m[4]||'CC','vehicle_quantity',1,'rental_days',m[5]::int,
  'pickup_location_hint',location,'review_reasons',reasons,
  'compact_scooter_recovered',true,'duplicated_minutes_corrected',m[3] IS NOT NULL);
 IF reference IS NOT NULL THEN v:=v||jsonb_build_object('customer_reference_hint',reference); END IF;
 -- Recalculate only derived return fields. Explicit return instructions are outside this grammar.
 v:=v-'return_date'-'return_time'-'return_location_hint';
 RETURN v;
END;
$fn$;
REVOKE ALL ON FUNCTION larios_import.recover_compact_scooter_booking(text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION larios_import.normalize_booking_candidate_before_process()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'larios_import', 'pg_temp'
AS $function$
declare
  v_reasons jsonb;
  v_raw text := coalesce(new.raw_text,'');
  v_norm text := public.lr_normalize_partner_name(coalesce(new.raw_text,''));
  v_name text;
begin
  if jsonb_typeof(new.candidate) <> 'object'
     or coalesce(new.candidate->>'kind','') <> 'booking_candidate' then
    return new;
  end if;

  new.candidate := larios_import.recover_compact_scooter_booking(v_raw,new.candidate);

  -- A forwarded-message warning must not block a booking when the message
  -- itself explicitly says today/tomorrow, a weekday, or a calendar date.
  if jsonb_typeof(new.candidate->'review_reasons')='array'
     and (
       lower(v_raw) ~ '(^|[^a-záéíóúüñ])(hoy|mañana|manana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)([^a-záéíóúüñ]|$)'
       or v_raw ~ '(^|[^0-9])[0-3]?[0-9][/-][01]?[0-9]([/-][0-9]{2,4})?([^0-9]|$)'
     )
     and nullif(new.candidate->>'pickup_date','') is not null
  then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
      into v_reasons
    from jsonb_array_elements_text(coalesce(new.candidate->'review_reasons','[]'::jsonb)) t(x)
    where lower(x) not like '%mensaje reenviado sin fecha explícita%'
      and lower(x) not like '%mensaje reenviado sin fecha explicita%';

    new.candidate := jsonb_set(new.candidate,'{review_reasons}',v_reasons,true);
  end if;

  -- Common free-form format: NAME, PHONE, VEHICLE..., DATE/TIME...
  -- Preserve the customer name instead of leaving "Pendiente Larios Rental".
  if nullif(trim(coalesce(new.candidate->>'customer_name_hint','')),'') is null
     and nullif(trim(coalesce(new.candidate->>'customer_phone_hint','')),'') is not null
     and position(',' in v_raw)>1
  then
    v_name := trim(split_part(v_raw,',',1));
    if length(v_name) between 2 and 80
       and v_name !~* '^(coche|moto|bici|bicicleta|grupo|hoy|mañana|manana)$'
    then
      new.candidate := jsonb_set(new.candidate,'{customer_name_hint}',to_jsonb(v_name),true);
    end if;
  end if;

  -- POSADA is a physical place. Handle the frequent "POASADA" typo too.
  -- This does not assign CITY EXPERT as a place; CITY EXPERT remains collaborator only.
  if v_norm ~ '(^| )hotel (poasada|posada)( |$)'
     or v_norm ~ '(^| )(poasada|posada)( |$)'
  then
    new.candidate := jsonb_set(
      new.candidate,
      '{pickup_location_hint}',
      to_jsonb('VINCCI POSADA DEL PATIO'::text),
      true
    );
  end if;

  return new;
end;
$function$

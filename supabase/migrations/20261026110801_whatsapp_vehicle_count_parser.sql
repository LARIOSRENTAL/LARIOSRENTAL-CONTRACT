-- Extract explicit vehicle counts from the original WhatsApp text. The
-- accepted forms are deliberately tied to a vehicle noun/group marker so
-- rental duration, dates, phone numbers, and prices cannot become quantities.
CREATE OR REPLACE FUNCTION larios_import.whatsapp_explicit_vehicle_count(p_raw text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_text text := lower(translate(coalesce(p_raw,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_match text[];
  v_word text;
  v_count integer;
BEGIN
  v_match := regexp_match(v_text,
    '(^|[^[:alnum:]])([0-9]{1,2})[[:space:]]*(x[[:space:]]*(g[[:space:]]*)?[a-lq]|(unidades?|vehiculos?|coches?|autos?|motos?|bicis?|bicicletas?|e-?bikes?))([^[:alnum:]]|$)', 'i');
  IF v_match IS NOT NULL THEN
    v_count := v_match[2]::integer;
  ELSE
    FOREACH v_word IN ARRAY ARRAY['dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez'] LOOP
      IF v_text ~ ('(^|[^[:alnum:]])'||v_word||'[[:space:]]*(x[[:space:]]*(g[[:space:]]*)?[a-lq]|(unidades?|vehiculos?|coches?|autos?|motos?|bicis?|bicicletas?|e-?bikes?))([^[:alnum:]]|$)') THEN
        v_count := CASE v_word WHEN 'dos' THEN 2 WHEN 'tres' THEN 3 WHEN 'cuatro' THEN 4
          WHEN 'cinco' THEN 5 WHEN 'seis' THEN 6 WHEN 'siete' THEN 7 WHEN 'ocho' THEN 8
          WHEN 'nueve' THEN 9 ELSE 10 END;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_count IS NULL OR v_count < 1 OR v_count > 10 THEN RETURN NULL; END IF;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION larios_import.apply_whatsapp_vehicle_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF coalesce(new.candidate->>'kind','') <> 'booking_candidate' THEN RETURN new; END IF;
  v_count := larios_import.whatsapp_explicit_vehicle_count(new.raw_text);
  IF v_count IS NOT NULL THEN
    new.candidate := jsonb_set(coalesce(new.candidate,'{}'::jsonb),'{vehicle_quantity}',to_jsonb(v_count),true);
  END IF;
  RETURN new;
END
$function$;

DROP TRIGGER IF EXISTS zzzzz_apply_whatsapp_vehicle_count ON larios_import.whatsapp_inbox;
CREATE TRIGGER zzzzz_apply_whatsapp_vehicle_count
BEFORE INSERT OR UPDATE OF raw_text, candidate ON larios_import.whatsapp_inbox
FOR EACH ROW EXECUTE FUNCTION larios_import.apply_whatsapp_vehicle_count();




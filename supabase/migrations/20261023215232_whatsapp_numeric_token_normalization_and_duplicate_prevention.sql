DO $migration$
DECLARE d text; old text; new text;
BEGIN
  d:=pg_get_functiondef('public.larios_whatsapp_stage(jsonb,text)'::regprocedure);
  old:='  v_candidate jsonb;';
  new:='  v_candidate jsonb;'||chr(10)||'  v_normalized text;'||chr(10)||'  v_match text[];';
  IF position(old in d)=0 THEN RAISE EXCEPTION 'stage declaration anchor missing'; END IF;
  d:=replace(d,old,new);
  old:=$old$  v_candidate := p->'candidate';$old$;
  new:=$new$  v_candidate := p->'candidate';

  -- Normalize digits attached to words before interpreting days and item quantities.
  v_normalized:=upper(translate(
    regexp_replace(coalesce(p->>'raw_text',''),'([0-9])([[:alpha:]])',$replacement$\1 \2$replacement$,'g'),
    'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));

  v_match:=regexp_match(v_normalized,'(^|[^0-9])([0-9]{1,2})[[:space:]]*DIAS?([^A-Z]|$)');
  if v_match is not null then
    v_candidate:=jsonb_set(v_candidate,'{rental_days}',to_jsonb(v_match[2]::integer),true);
  end if;

  v_match:=regexp_match(v_normalized,'(^|[^A-Z0-9])([1-9][0-9]*)[[:space:]]*(BICIS?|BICICLETAS?)([^A-Z]|$)');
  if v_match is not null then
    v_candidate:=jsonb_set(v_candidate,'{vehicle_group}',to_jsonb('BICICLETA'::text),true);
    v_candidate:=jsonb_set(v_candidate,'{vehicle_quantity}',to_jsonb(v_match[2]::integer),true);
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'stage normalization anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;

  d:=pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure);
  old:=$old$  v:=jsonb_set(v,'{pickup_location_hint}',to_jsonb(v_loc),true);$old$;
  new:=$new$  v_loc:=regexp_replace(v_loc,'[[:space:]]*[0-9]+[[:space:]]*d[ií]as?.*','','i');
  v_loc:=trim(v_loc);
  if v_raw_norm ~ 'HOTEL[[:space:]]+IBIS[[:space:]]+BUDGET' then
    v_loc:='HOTEL IBIS BUDGET';
  end if;
  v:=jsonb_set(v,'{pickup_location_hint}',to_jsonb(v_loc),true);$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'location normalization anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;

  d:=pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);
  old:=$old$        and larios_import.booking_duplicate_match(
          v->>'customer_phone_hint',v->>'customer_name_hint',
          v->>'pickup_location_hint',v->>'customer_reference_hint',
          cu.phone,cu.full_name,c.delivery_location,c.app_payload->>'reservation_detail');$old$;
  new:=$new$        and (
          larios_import.booking_duplicate_match(
            v->>'customer_phone_hint',v->>'customer_name_hint',
            v->>'pickup_location_hint',v->>'customer_reference_hint',
            cu.phone,cu.full_name,c.delivery_location,c.app_payload->>'reservation_detail')
          or (
            c.rental_days=v_days and c.quantity=v_unit_qty
            and nullif(c.app_payload->>'renthub_linked_existing_code','') is not null
            and (
              coalesce(v->>'customer_name_hint','') ~* '^(CITY EXPERT|PENDIENTE LARIOS RENTAL|PARTICULAR)$'
              or coalesce(cu.full_name,'') ~* '^(CITY EXPERT|PENDIENTE LARIOS RENTAL|PARTICULAR)$'
            )
            and upper(regexp_replace(regexp_replace(translate(coalesce(v->>'pickup_location_hint',''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),'^HOTEL[[:space:]]+','','i'),'[^A-Z0-9]','','g'))
                = upper(regexp_replace(regexp_replace(translate(coalesce(c.delivery_location,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),'^HOTEL[[:space:]]+','','i'),'[^A-Z0-9]','','g'))
          )
        );$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'duplicate detection anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;
END
$migration$;

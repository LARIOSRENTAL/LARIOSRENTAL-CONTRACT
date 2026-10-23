DO $m$
DECLARE d text; old text; new text;
BEGIN
  d:=pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure);
  old:=$old$  if v_ref<>'' then
    v:=jsonb_set(v,'{customer_reference_hint}',to_jsonb(v_ref),true);
  end if;$old$;
  new:=$new$  if v_ref<>'' then
    v:=jsonb_set(v,'{customer_reference_hint}',to_jsonb(v_ref),true);
  else
    v:=v-'customer_reference_hint';
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'reference finalization anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;
END
$m$;

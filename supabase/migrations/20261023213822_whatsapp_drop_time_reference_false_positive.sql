DO $m$
DECLARE d text; old text; new text;
BEGIN
  d:=pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure);
  old:=$old$v_ref:=trim(regexp_replace(v_ref,'(^|[[:space:]·])REFERENCIA[[:space:]]+30($|[[:space:]·])',' ','gi'));$old$;
  new:=$new$v_ref:='';$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'reference cleanup anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;
END
$m$;

DO $m$
DECLARE d text; old text; new text;
BEGIN
  d:=pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure);
  old:='  v_loc_norm:=upper(translate(v_loc,';
  new:=$block$  if v_raw_norm ~ 'NO[[:space:]]+COMISION' then
    v_loc:=regexp_replace(v_loc,'[[:space:]]*no[[:space:]]+comisi[oó]n.*','','i');
    v_loc:=trim(v_loc);
    v_ref:=trim(v_ref);
  end if;
  if v_raw_norm ~ 'PASA[N]?[[:space:]]+A[[:space:]]+(LAS[[:space:]]+)?NUEVE[[:space:]]+30' then
    v_loc:='LAS VEGAS HOTEL';
    v_ref:=trim(regexp_replace(v_ref,'(^|[[:space:]·])REFERENCIA[[:space:]]+30($|[[:space:]·])',' ','gi'));
  elsif v_raw_norm ~ 'PASA[N]?[[:space:]]+A[[:space:]]+(LAS[[:space:]]+)?[0-2]?[0-9][:.]([0-5][0-9])' then
    v_loc:=coalesce(nullif(v_agency,''),'LAS VEGAS HOTEL');
  end if;

$block$ || old;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'normalizer location anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;
END
$m$;

DO $m$
DECLARE d text; old text; new text;
BEGIN
  d:=pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);
  old:='      where c.delivery_date=v_date and c.delivery_time=v_time';
  new:='      where c.status not in (''cancelled'',''canceled'') and c.delivery_date=v_date and c.delivery_time=v_time';
  IF position(old in d)=0 THEN RAISE EXCEPTION 'duplicate active status anchor missing'; END IF;
  d:=replace(d,old,new);
  EXECUTE d;
END
$m$;

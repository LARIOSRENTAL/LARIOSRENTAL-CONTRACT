do $$
declare
  v_def text;
  v_old_gate text := $old$if r.raw_text !~* '[0-9]{4}' or (r.raw_text !~* '(-?full|lleno|[+-]?[1-3][[:space:]]*/[[:space:]]*[24]|[1-8][[:space:]]*p)' and r.raw_text !~* '(pinchad[oa]s?|pinchazos?)') then return null; end if;$old$;
  v_new_gate text := $new$if r.raw_text !~* '[0-9]{4}' or (r.raw_text !~* '(^|[^[:alpha:]])(-full|-lleno|full|lleno)([^[:alpha:]]|$)' and r.raw_text !~* '(^|[^0-9])[+-]?[1-3][[:space:]]*/[[:space:]]*[24]([^0-9]|$)' and r.raw_text !~* '(^|[^0-9])[1-8][[:space:]]*p(untos?)?([^[:alpha:]]|$)' and r.raw_text !~* '(pinchad[oa]s?|pinchazos?)') then return null; end if;$new$;
  v_old_extract text := $old$v_fuel_text:=substring(lower(r.raw_text) from '(-?full|lleno|[+-]?[1-3][[:space:]]*/[[:space:]]*[24]|[1-8][[:space:]]*p)');$old$;
  v_new_extract text := $new$v_fuel_text:=null;
  v_fuel_match:=regexp_match(lower(r.raw_text),'(^|[^0-9])([+-]?[1-3][[:space:]]*/[[:space:]]*[24])([^0-9]|$)');
  if v_fuel_match is not null then v_fuel_text:=v_fuel_match[2]; end if;
  if v_fuel_text is null then
    v_fuel_match:=regexp_match(lower(r.raw_text),'(^|[^[:alpha:]])(-full|-lleno|full|lleno)([^[:alpha:]]|$)');
    if v_fuel_match is not null then v_fuel_text:=v_fuel_match[2]; end if;
  end if;
  if v_fuel_text is null then
    v_fuel_match:=regexp_match(lower(r.raw_text),'(^|[^0-9])([1-8][[:space:]]*p(untos?)?)([^[:alpha:]]|$)');
    if v_fuel_match is not null then v_fuel_text:=v_fuel_match[2]; end if;
  end if;$new$;
begin
  v_def:=pg_get_functiondef('public.larios_whatsapp_apply_return_internal(text,text)'::regprocedure);
  if position(v_old_gate in v_def)=0 or position(v_old_extract in v_def)=0 then
    raise exception 'Expected parser clauses were not found; migration aborted';
  end if;
  v_def:=replace(v_def,v_old_gate,v_new_gate);
  v_def:=replace(v_def,'v_plate text; v_fuel_text text; v_fuel integer; v_parking numeric:=0;','v_plate text; v_fuel_text text; v_fuel integer; v_fuel_match text[]; v_parking numeric:=0;');
  v_def:=replace(v_def,v_old_extract,v_new_extract);
  execute v_def;
end $$;

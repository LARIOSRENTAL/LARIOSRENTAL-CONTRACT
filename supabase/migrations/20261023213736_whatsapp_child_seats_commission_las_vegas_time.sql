DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure);
  v_old := '  v_loc_norm:=upper(translate(v_loc,';
  v_new := $block$  if v_raw_norm ~ 'NO[[:space:]]+COMISION' then
    v_ref:=concat_ws(' · ',nullif(trim(v_ref),''),'NO COMISIÓN');
    v:=jsonb_set(v,'{agency_hint}',to_jsonb('PARTICULAR'::text),true);
    v:=jsonb_set(v,'{commission_excluded}','true'::jsonb,true);
    if coalesce(v->>'customer_name_hint','') ~* '^NO$' then
      v:=jsonb_set(v,'{customer_name_hint}',to_jsonb('Pendiente Larios Rental'::text),true);
    end if;
    v_loc:=regexp_replace(v_loc,'[[:space:]]*no[[:space:]]+comision.*','','i');
  end if;

  v_loc:=regexp_replace(v_loc,'[[:space:]]*[+]?[[:space:]]*[0-9]+[[:space:]]*(sillas?|sillitas?|baby[[:space:]]*seats?).*','','i');
  v_loc:=trim(v_loc);

  if v_raw_norm ~ 'PASA[N]?[[:space:]]+A[[:space:]]+(LAS[[:space:]]+)?NUEVE[[:space:]]+30' then
    v:=jsonb_set(v,'{pickup_time}',to_jsonb('09:30'::text),true);
    v_ref:=regexp_replace(v_ref,'(^|[[:space:]·])REFERENCIA[[:space:]]+30($|[[:space:]·])',' ','gi');
    v:=jsonb_set(v,'{pickup_location_hint}',to_jsonb('LAS VEGAS HOTEL'::text),true);
    v:=jsonb_set(v,'{agency_hint}',to_jsonb('LAS VEGAS HOTEL'::text),true);
  elsif v_raw_norm ~ 'PASA[N]?[[:space:]]+A[[:space:]]+(LAS[[:space:]]+)?[0-2]?[0-9][:.]([0-5][0-9])' then
    v:=jsonb_set(v,'{pickup_time}',to_jsonb(replace(substring(v_raw_norm from '([0-2]?[0-9])[:.]([0-5][0-9])'),'.',':')),true);
    v:=jsonb_set(v,'{pickup_location_hint}',to_jsonb(coalesce(nullif(v_agency,''),'LAS VEGAS HOTEL')),true);
  end if;

$block$ || v_old;
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'normalizer injection anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);
  v_old := '      ''key'',x.key,''label'',x.label,''qty'',1,''unit'',case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end,';
  v_new := '      ''key'',x.key,''label'',x.label,''qty'',case when x.key=''child_seat'' then coalesce(nullif(substring(v_row.raw_text from ''(?i)([0-9]+)[[:space:]]+(sillas?|sillitas?)''),'''')::integer,1) else 1 end,''unit'',case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end,';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'extras qty anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := '      ''total'',case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end,';
  v_new := '      ''total'',(case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end) * case when x.key=''child_seat'' then coalesce(nullif(substring(v_row.raw_text from ''(?i)([0-9]+)[[:space:]]+(sillas?|sillitas?)''),'''')::integer,1) else 1 end,';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'extras total anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    coalesce(sum(case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end),0)';
  v_new := '    coalesce(sum((case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end) * case when x.key=''child_seat'' then coalesce(nullif(substring(v_row.raw_text from ''(?i)([0-9]+)[[:space:]]+(sillas?|sillitas?)''),'''')::integer,1) else 1 end),0)';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'extras sum anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := '(v_row.raw_text ~* ''baby[[:space:]]*seat'' or (v_row.raw_text ~* ''sillita'' and v_row.raw_text !~* ''(sillita[[:space:]]*(de[[:space:]]*)?bici|silla[[:space:]]*(de[[:space:]]*)?bici)''))';
  v_new := '(v_row.raw_text ~* ''baby[[:space:]]*seat'' or (v_row.raw_text ~* ''(sillita|sillas?)'' and v_row.raw_text !~* ''(sillita[[:space:]]*(de[[:space:]]*)?bici|silla[[:space:]]*(de[[:space:]]*)?bici|silla[[:space:]]+bici)''))';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'child seat detector anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    ''agency'',coalesce(v->>''agency_hint'',''''),';
  v_new := '    ''agency'',coalesce(v->>''agency_hint'',''''),''commission_excluded'',coalesce((v->>''commission_excluded'')::boolean,false),';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'commission payload anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.larios_whatsapp_apply_reply_amendment(text,text,text)'::regprocedure);
  v_old := '  if v_msg.raw_text ~* ''cambia.*a[[:space:]]+las[[:space:]]+[0-2]?[0-9]:[0-5][0-9]'' then';
  v_new := $block$  if v_msg.raw_text ~* 'pasa[n]?[[:space:]]+a[[:space:]]+(las[[:space:]]+)?nueve[[:space:]]+30' then
    v_new_time := time '09:30';
    v_has_change := true;
  elsif v_msg.raw_text ~* 'pasa[n]?[[:space:]]+a[[:space:]]+(las[[:space:]]+)?[0-2]?[0-9][:.]([0-5][0-9])' then
    v_new_time := replace(substring(v_msg.raw_text from '([0-2]?[0-9])[:.]([0-5][0-9])'),'.',':')::time;
    v_has_change := true;
  elsif v_msg.raw_text ~* 'cambia.*a[[:space:]]+las[[:space:]]+[0-2]?[0-9]:[0-5][0-9]' then$block$;
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'amendment time anchor missing'; END IF;
  v_def := replace(v_def,v_old,v_new);
  EXECUTE v_def;
END
$migration$;

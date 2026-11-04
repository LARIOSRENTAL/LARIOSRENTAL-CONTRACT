CREATE OR REPLACE FUNCTION public.larios_whatsapp_apply_reply_amendment(p_chat text, p_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
  v_msg larios_import.whatsapp_inbox%rowtype;
  v_src larios_import.whatsapp_inbox%rowtype;
  v_contract public.contracts%rowtype;
  v jsonb;
  v_payload jsonb;
  v_new_date date;
  v_new_time time;
  v_new_group text;
  v_new_qty integer;
  v_new_place text;
  v_new_phone text;
  v_new_name text;
  v_new_agency text;
  v_new_days integer;
  v_target_weekday integer;
  v_message_date date;
  v_old_start timestamp;
  v_old_end timestamp;
  v_new_start timestamp;
  v_new_end timestamp;
  v_has_change boolean := false;
begin
  select enabled_since into v_start
  from larios_import.whatsapp_bridge_token
  where name='group_bridge' and active
    and token_sha256=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
  if v_start is null then raise exception 'Unauthorized'; end if;

  select * into v_msg
  from larios_import.whatsapp_inbox
  where source_chat=p_chat and source_id=p_id
  for update;
  if not found then raise exception 'Message not staged'; end if;

  if nullif(v_msg.reply_to,'') is null then
    return jsonb_build_object('status','review','reason','reply_without_target');
  end if;

  select * into v_src
  from larios_import.whatsapp_inbox
  where source_chat=p_chat and source_id=v_msg.reply_to;

  if v_src.id is null or v_src.status<>'created' or v_src.contract_id is null then
    update larios_import.whatsapp_inbox
       set status='review',reason='amendment_target_not_found',processed_at=now()
     where id=v_msg.id;
    return jsonb_build_object('status','review','reason','amendment_target_not_found');
  end if;

  select * into v_contract
  from public.contracts
  where id=v_src.contract_id
  for update;

  if not found or v_contract.status<>'draft' or nullif(v_contract.pdf_path,'') is not null then
    update larios_import.whatsapp_inbox
       set status='review',reason='amendment_target_not_editable',processed_at=now()
     where id=v_msg.id;
    return jsonb_build_object('status','review','reason','amendment_target_not_editable');
  end if;

  v := coalesce(v_msg.candidate,'{}'::jsonb);
  -- Billing notes in quoted text must use the original message timestamp.
  v := public.lr_whatsapp_apply_count_from(v_msg.raw_text,v_src.sent_at,v);

  -- Special natural-language time/date amendments, including weekday changes.
  if v_msg.raw_text ~* 'pasa[n]?[[:space:]]+a[[:space:]]+(las[[:space:]]+)?nueve[[:space:]]+30' then
    v_new_time := time '09:30';
    v_has_change := true;
  elsif v_msg.raw_text ~* 'pasa[n]?[[:space:]]+a[[:space:]]+(las[[:space:]]+)?[0-2]?[0-9][:.]([0-5][0-9])' then
    v_new_time := replace(substring(v_msg.raw_text from '([0-2]?[0-9])[:.]([0-5][0-9])'),'.',':')::time;
    v_has_change := true;
  elsif v_msg.raw_text ~* 'cambia.*a[[:space:]]+las[[:space:]]+[0-2]?[0-9]:[0-5][0-9]' then
    v_new_time := substring(v_msg.raw_text from '([0-2]?[0-9]:[0-5][0-9])')::time;
    v_has_change := true;
    if v_msg.raw_text ~* 'para[[:space:]]+hoy' then
      v_new_date := (v_msg.sent_at at time zone 'Europe/Madrid')::date;
    end if;
    v_target_weekday := case
      when v_msg.raw_text ~* 'lunes' then 1
      when v_msg.raw_text ~* 'martes' then 2
      when v_msg.raw_text ~* 'mi[eé]rcoles' then 3
      when v_msg.raw_text ~* 'jueves' then 4
      when v_msg.raw_text ~* 'viernes' then 5
      when v_msg.raw_text ~* 's[aá]bado' then 6
      when v_msg.raw_text ~* 'domingo' then 7
      else null
    end;
    if v_target_weekday is not null then
      v_message_date := (v_msg.sent_at at time zone 'Europe/Madrid')::date;
      v_new_date := v_message_date +
        ((v_target_weekday - extract(isodow from v_message_date)::integer + 7) % 7);
      if v_new_date = v_message_date and v_msg.raw_text !~* 'hoy' then
        v_new_date := v_new_date + 7;
      end if;
    end if;
  elsif nullif(v->>'pickup_time','') is not null then
    v_new_time := (v->>'pickup_time')::time;
    -- Preserve a known original time if the parser mistakenly says midnight.
    if v_new_time = time '00:00' then
      if v_contract.delivery_time is not null and v_contract.delivery_time <> time '00:00' then
        v_new_time := v_contract.delivery_time;
      elsif coalesce(v_contract.app_payload->>'renthub_real_start','') ~ '[0-2]?[0-9]:[0-5][0-9]' then
        v_new_time := replace(substring(v_contract.app_payload->>'renthub_real_start' from '([0-2]?[0-9])[:.]([0-5][0-9])'),'.',':')::time;
      elsif coalesce(v_msg.raw_text,'') ~ '[0-2]?[0-9][:.;][0-5][0-9]' then
        v_new_time := replace(substring(v_msg.raw_text from '([0-2]?[0-9][:.;][0-5][0-9])'),'.',':')::time;
      else
        v_new_time := null;
      end if;
    end if;
    if v_new_time is not null then v_has_change := true; end if;
  end if;

  if nullif(v->>'pickup_date','') is not null then
    v_new_date := (v->>'pickup_date')::date;
    v_has_change := true;
  end if;

  v_new_group := nullif(upper(v->>'vehicle_group'),'');
  if v_new_group is not null then
    v_new_group := case v_new_group when 'M1' then '50CC' when 'M2' then '125CC'
      when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE' else v_new_group end;
    v_has_change := true;
  end if;

  if nullif(v->>'vehicle_quantity','') is not null then
    v_new_qty := greatest(1,(v->>'vehicle_quantity')::integer);
    v_has_change := true;
  end if;

  v_new_place := nullif(trim(v->>'pickup_location_hint'),'');
  if upper(coalesce(v_new_place,'')) in ('LUGAR PENDIENTE','CITY EXPERT','PARTICULAR')
     or coalesce(v_new_place,'') ~* '(TODO[[:space:]]+RIESGO|SEGURO|PAGAD[OA]|PTE[[:space:]]+PAGO|TEL[EÉ]FONO|GRUPO[[:space:]]+[A-Z])' then
    v_new_place := null;
  end if;
  if v_new_place is null then
    v_new_place := nullif(trim(substring(coalesce(v_msg.raw_text,'') from '(?i)(CALLE[[:space:]]+[^,;\n]+(,[[:space:]]*[0-9]+)?|C/[[:space:]]*[^,;\n]+(,[[:space:]]*[0-9]+)?)')),'');
  end if;
  if v_new_place is not null then v_has_change := true; end if;

  v_new_phone := nullif(trim(v->>'customer_phone_hint'),'');
  if v_new_phone is not null then v_has_change := true; end if;

  v_new_name := nullif(trim(v->>'customer_name_hint'),'');
  if coalesce(v_new_name,'') ~* '^(CALLE|AVENIDA|PLAZA|PASEO|PENDIENTE|NOMBRE|CITY[[:space:]]*EXPERT|PARTICULAR)$' then
    v_new_name := null;
  end if;
  if v_new_name is not null then v_has_change := true; end if;

  v_new_agency := nullif(trim(v->>'agency_hint'),'');
  if v_new_agency is not null and upper(v_new_agency)<>'PARTICULAR' then v_has_change := true; else v_new_agency:=null; end if;

  if nullif(v->>'rental_days','') is not null then
    v_new_days := (v->>'rental_days')::integer;
    if v_new_days > 0 then v_has_change := true; end if;
  end if;

  if not v_has_change then
    update larios_import.whatsapp_inbox
       set status='review',reason='reply_amendment_unparsed',processed_at=now()
     where id=v_msg.id;
    return jsonb_build_object('status','review','reason','reply_amendment_unparsed','contract_id',v_contract.id);
  end if;

  v_old_start := v_contract.delivery_date + v_contract.delivery_time;
  v_old_end := v_contract.return_date + v_contract.return_time;
  v_new_start := coalesce(v_new_date,v_contract.delivery_date) + coalesce(v_new_time,v_contract.delivery_time);

  if v_new_days is not null and v_new_days > 0 then
    v_new_end := v_new_start + make_interval(days=>v_new_days);
  else
    v_new_end := v_new_start + (v_old_end-v_old_start);
  end if;

  if coalesce((v->>'count_from_rule')::boolean,false) then
    v_new_end := (v->>'return_date')::date + (v->>'return_time')::time;
  end if;

  v_payload := coalesce(v_contract.app_payload,'{}'::jsonb)
    || jsonb_build_object(
      'pickup_date',v_new_start::date,
      'pickup_time',to_char(v_new_start::time,'HH24:MI'),
      'return_date',v_new_end::date,
      'return_time',to_char(v_new_end::time,'HH24:MI'),
      'whatsapp_amendment_message_id',v_msg.source_id,
      'whatsapp_amendment_reply_to',v_msg.reply_to,
      'whatsapp_amendment_raw_text',v_msg.raw_text,
      'renthub_amend_pending',v_contract.renthub_contract_id is not null
    );

  if coalesce((v->>'count_from_rule')::boolean,false) then
    v_payload := v_payload || jsonb_build_object(
      'count_from_rule',true,'billing_from_date',v->>'pricing_start_date',
      'billing_from_time','08:30','pricing_start_date',v->>'pricing_start_date',
      'pricing_start_time','08:30');
  end if;
  if v_new_group is not null then v_payload:=jsonb_set(v_payload,'{vehicle_group}',to_jsonb(v_new_group),true); end if;
  if v_new_qty is not null then v_payload:=jsonb_set(v_payload,'{vehicle_quantity}',to_jsonb(v_new_qty),true); end if;
  if v_new_place is not null then v_payload:=jsonb_set(v_payload,'{pickup_location}',to_jsonb(v_new_place),true); end if;
  if v_new_phone is not null then v_payload:=jsonb_set(v_payload,'{customer_phone}',to_jsonb(v_new_phone),true); end if;
  if v_new_name is not null then v_payload:=jsonb_set(v_payload,'{customer_name}',to_jsonb(v_new_name),true); end if;
  if v_new_agency is not null then v_payload:=jsonb_set(v_payload,'{agency}',to_jsonb(v_new_agency),true); end if;
  if v_new_days is not null and v_new_days>0 then v_payload:=jsonb_set(v_payload,'{rental_days}',to_jsonb(v_new_days),true); end if;
  if coalesce(nullif(v->>'full_insurance','')::boolean,false)
     or coalesce(v_msg.raw_text,'') ~* '(TODO[[:space:]]+RIESGO|SEGURO[[:space:]]+COMPLETO|FULL[[:space:]]+INSURANCE)' then
    v_payload:=jsonb_set(v_payload,'{full_insurance}','true'::jsonb,true);
  end if;

  if v_contract.renthub_contract_id is not null then
    v_payload:=v_payload||jsonb_build_object('renthub_amend_old_code',v_contract.renthub_contract_id);
  end if;

  update public.contracts
     set delivery_date=v_new_start::date,
         delivery_time=v_new_start::time,
         return_date=v_new_end::date,
         return_time=v_new_end::time,
         category=coalesce(v_new_group,category),
         quantity=coalesce(v_new_qty,quantity),
         full_insurance=case when coalesce(nullif(v->>'full_insurance','')::boolean,false)
           or coalesce(v_msg.raw_text,'') ~* '(TODO[[:space:]]+RIESGO|SEGURO[[:space:]]+COMPLETO|FULL[[:space:]]+INSURANCE)'
           then true else full_insurance end,
         delivery_location=coalesce(v_new_place,delivery_location),
         renthub_contract_id=case when v_contract.renthub_contract_id is not null then null else renthub_contract_id end,
         renthub_sync_status='pending',
         renthub_sync_error=null,
         app_payload=v_payload,
         updated_at=now()
   where id=v_contract.id;

  if v_new_phone is not null then
    update public.customers set phone=v_new_phone,updated_at=now() where id=v_contract.customer_id;
  end if;
  if v_new_name is not null then
    update public.customers set full_name=v_new_name,updated_at=now() where id=v_contract.customer_id;
    update public.drivers set full_name=v_new_name where id=v_contract.main_driver_id;
  end if;

  update larios_import.whatsapp_inbox
     set status='created',reason='amendment_applied',contract_id=v_contract.id,processed_at=now()
   where id=v_msg.id;

  if v_contract.renthub_contract_id is not null then
    perform net.http_post(
      url:='https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/renthub-booking',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('action','amend_whatsapp','contract_id',v_contract.id,'import_token',p_token)
    );
  end if;

  return jsonb_build_object('status','created','reason','amendment_applied','contract_id',v_contract.id);
end;
$function$;

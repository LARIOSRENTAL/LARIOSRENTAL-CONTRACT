-- Avoid treating the reservation total following "paid with insurance" as a manual insurance price.
-- Explicit no-insurance wording must override inferred insurance flags.

CREATE OR REPLACE FUNCTION public.larios_whatsapp_process(p_chat text, p_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
  v_row larios_import.whatsapp_inbox%rowtype;
  v jsonb;
  v_code text;
  v_group text;
  v_groups text[];
  v_group_count integer;
  v_group_units integer;
  v_group_item text;
  v_date date;
  v_time time;
  v_return_date date;
  v_return_time time;
  v_return_location text;
  v_days integer;
  v_qty integer;
  v_units integer;
  v_unit_qty integer;
  v_unit integer;
  v_price numeric;
  v_insurance_price numeric;
  v_extras jsonb := '[]'::jsonb;
  v_extras_total numeric := 0;
  v_discount numeric;
  v_franchise numeric;
  v_insurance_first numeric;
  v_insurance_extra numeric;
  v_full_insurance boolean;
  v_category text;
  v_season boolean;
  v_payload jsonb;
  v_contract_payload jsonb;
  v_customer uuid;
  v_driver uuid;
  v_contract uuid;
  v_contracts uuid[] := array[]::uuid[];
  v_matches integer;
begin
  select enabled_since into v_start from larios_import.whatsapp_bridge_token
  where name='group_bridge' and active
    and token_sha256=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
  if v_start is null then raise exception 'Unauthorized'; end if;
  select * into v_row from larios_import.whatsapp_inbox
    where source_chat=p_chat and source_id=p_id for update;
  if not found then raise exception 'Message not staged'; end if;
  if v_row.sent_at<v_start then raise exception 'Message predates token activation'; end if;
  if v_row.status<>'pending' then
    if v_row.status='created' then
      select array_agg(c.id order by c.contract_number) into v_contracts
      from public.contracts c
      where c.app_payload->>'source'='whatsapp_group'
        and c.app_payload->>'source_whatsapp_group'=p_chat
        and c.app_payload->>'source_whatsapp_message_id'=p_id;
      return jsonb_build_object('status',v_row.status,'contract_id',v_row.contract_id,
        'contract_ids',to_jsonb(v_contracts),'reason',v_row.reason);
    end if;
    return jsonb_build_object('status',v_row.status,'contract_id',v_row.contract_id,'reason',v_row.reason);
  end if;
  v:=larios_import.lr_whatsapp_merge_pending_context(p_chat,p_id,v_row.candidate);
  v:=public.lr_whatsapp_normalize_location_candidate(v_row.raw_text,public.lr_whatsapp_recover_semicolon_time(v_row.raw_text,public.lr_whatsapp_apply_count_from(v_row.raw_text,v_row.sent_at,v)));
  v:=v || jsonb_build_object(
    'agency_hint', public.larios_whatsapp_resolve_agency(v_row.raw_text,v->>'agency_hint',p_token)->>'agency',
    'agency_resolution_source', public.larios_whatsapp_resolve_agency(v_row.raw_text,v->>'agency_hint',p_token)->>'source',
    'agency_matched_alias', public.larios_whatsapp_resolve_agency(v_row.raw_text,v->>'agency_hint',p_token)->>'matched_alias',
    'commission_excluded', coalesce((public.larios_whatsapp_resolve_agency(v_row.raw_text,v->>'agency_hint',p_token)->>'commission_excluded')::boolean,false)
  );
  v:=public.lr_whatsapp_normalize_location_candidate(v_row.raw_text,v);
  if nullif(v_row.reply_to,'') is not null
     and exists(
       select 1 from larios_import.whatsapp_inbox q
       where q.source_chat=p_chat and q.source_id=v_row.reply_to
         and q.status='created' and q.contract_id is not null
     )
     and v->>'kind'<>'cancellation' then
    return public.larios_whatsapp_apply_reply_amendment(p_chat,p_id,p_token);
  end if;
  if v_row.raw_text ~* '^[[:space:]]*[0-9]{1,2}/[0-9]{1,2}[[:space:]]+[0-2]?[0-9]:[0-5][0-9]' then
    v:=jsonb_set(v,'{pickup_time}',to_jsonb(substring(v_row.raw_text from '^[[:space:]]*[0-9]{1,2}/[0-9]{1,2}[[:space:]]+([0-2]?[0-9]:[0-5][0-9])')),true);
  end if;
  if nullif(v->>'vehicle_group','') is null and v_row.raw_text ~* '[0-9]+[[:space:]]*e-?bike' then
    v:=jsonb_set(v,'{vehicle_group}','"E-BIKE"'::jsonb,true);
    v:=jsonb_set(v,'{vehicle_quantity}',to_jsonb((substring(v_row.raw_text from '([0-9]+)[[:space:]]*e-?bike'))::integer),true);
    v:=jsonb_set(v,'{review_reasons}','[]'::jsonb,true);
  end if;
  if v->>'kind'='context_only' then
    if nullif(v_row.reply_to,'') is not null
       and v_row.raw_text ~* 'cambia.*a[[:space:]]+las[[:space:]]+[0-2]?[0-9]:[0-5][0-9]' then
      return public.larios_whatsapp_apply_reply_time_amend(p_chat,p_id,p_token);
    end if;
    update larios_import.whatsapp_inbox set status='ignored',reason='context_only',processed_at=now()
      where id=v_row.id;
    return jsonb_build_object('status','ignored');
  end if;
  if v->>'kind'='cancellation' then
    if nullif(v_row.reply_to,'') is not null and lower(trim(v_row.raw_text)) ~ '^(cancelad[oa]|cancelar|se cancela)([[:space:]]+(la[[:space:]]+)?reserva)?[[:space:].!]*$' then
      perform net.http_post(
        url:='https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/renthub-cancel-route-probe',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:=jsonb_build_object('chat',p_chat,'source_id',p_id,'token',p_token)
      );
      update larios_import.whatsapp_inbox set status='pending',reason='cancellation_dispatched',processed_at=now() where id=v_row.id;
      return jsonb_build_object('status','pending','reason','cancellation_dispatched');
    end if;
    update larios_import.whatsapp_inbox set status='review',reason='cancellation_requires_review',processed_at=now() where id=v_row.id;
    return jsonb_build_object('status','review','reason','cancellation_requires_review');
  end if;
  if v->>'kind'<>'booking_candidate'
     or jsonb_array_length(coalesce(v->'review_reasons','[]'::jsonb))>0
     or v_row.raw_text ~* '(reserva web|integracion|integración)'
     or nullif(v->>'pickup_date','') is null
     or nullif(v->>'pickup_time','') is null
     or nullif(v->>'vehicle_group','') is null
     or nullif(v->>'pickup_location_hint','') is null
     or (nullif(v->>'completion_parent_source_id','') is null and not larios_import.whatsapp_has_valid_time_expression(v_row.raw_text))
  then
    update larios_import.whatsapp_inbox set status='review',reason='web_or_incomplete',processed_at=now()
      where id=v_row.id;
    return jsonb_build_object('status','review','reason','web_or_incomplete');
  end if;
  v_code:=upper(nullif(v->>'booking_code',''));
  v_date:=(v->>'pickup_date')::date;
  v_time:=(v->>'pickup_time')::time;
  v_days:=coalesce((v->>'rental_days')::integer,0);
  v_return_date:=coalesce(nullif(v->>'return_date','')::date,v_date+v_days);
  v_return_time:=coalesce(nullif(v->>'return_time','')::time,v_time);
  v_return_location:=coalesce(nullif(v->>'return_location_hint',''),v->>'pickup_location_hint');
  v_qty:=coalesce((v->>'vehicle_quantity')::integer,1);
  v_insurance_price:=case when v_row.raw_text ~* 'sin[[:space:]]+seguro'
      or v_row.raw_text ~* '(?is)(pagado|pendiente[[:space:]]+de[[:space:]]+pago|pte[[:space:].]*pago).*seguro' then null
    else nullif(replace(substring(v_row.raw_text from '(?i)seguro[^0-9]{0,8}([0-9]+([,.][0-9]{1,2})?)'),',','.'),'')::numeric end;
  v_price:=case when v_row.raw_text ~* '(pagado|pendiente[[:space:]]+de[[:space:]]+pago|pte[[:space:].]*pago)[^0-9]{0,12}[0-9]'
    then coalesce(nullif(replace((regexp_match(v_row.raw_text,'(?i)(pagado|pendiente[[:space:]]+de[[:space:]]+pago|pte[[:space:].]*pago)[^0-9]{0,12}([0-9]+([,.][0-9]{1,2})?)'))[2],',','.'),'')::numeric,nullif(v->>'total','')::numeric)
    else null end;
  v_discount:=coalesce(nullif(v->>'discount_percent','')::numeric,0);
  v_full_insurance:=case when v_row.raw_text ~* 'sin[[:space:]]+seguro' then false
    else coalesce((v->>'full_insurance')::boolean,false) or v_insurance_price is not null
      or v_row.raw_text ~* '(con[[:space:]]+seguro|\\+[[:space:]]*seguro|seguro[[:space:]]+sin[[:space:]]+franquicia|sin[[:space:]]+franquicia)' end;
  v_group:=upper(v->>'vehicle_group');
  v_group:=case v_group when 'M1' then '50CC' when 'M2' then '125CC'
    when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE' else v_group end;
  if jsonb_typeof(v->'vehicle_groups')='array' then
    select array_agg(case upper(x.value)
      when 'M1' then '50CC' when 'M2' then '125CC'
      when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE'
      else upper(x.value) end order by x.ord)
      into v_groups
      from jsonb_array_elements_text(v->'vehicle_groups') with ordinality x(value,ord);
  else
    v_groups:=array[v_group];
  end if;
  v_group_count:=cardinality(v_groups);
  v_group_units:=case when v_group in ('BICICLETA','E-BIKE') then 1 else v_qty end;
  v_units:=v_group_count*v_group_units;
  v_unit_qty:=case when v_group in ('BICICLETA','E-BIKE') then v_qty else 1 end;
  if v_days not between 1 and 60 or v_qty not between 1 and 10
     or v_group_count not between 1 and 10 or v_units not between 1 and 10
     or v_groups[1] is distinct from v_group
     or (v_group_count>1 and (v_qty<>1
       or v_groups && array['BICICLETA','E-BIKE']::text[]))
     or exists(select 1 from unnest(v_groups) g
       where g !~ '^(A|B|C|D|F|G|H|I|J|K|L|Q|50CC|125CC|BICICLETA|E-BIKE)$')
     or (select count(distinct g) from unnest(v_groups) g)<>v_group_count
     or v_return_date+v_return_time <= v_date+v_time
     or v_return_date > v_date+60
     or v_date < (v_row.sent_at at time zone 'Europe/Madrid')::date
     or v_date > (v_row.sent_at at time zone 'Europe/Madrid')::date+365
     or (
       (larios_import.whatsapp_relative_minutes(v_row.raw_text) is null
         and v_date + v_time <= (now() at time zone 'Europe/Madrid'))
       or
       (larios_import.whatsapp_relative_minutes(v_row.raw_text) is not null
         and v_date + v_time < (now() at time zone 'Europe/Madrid') - interval '90 minutes')
     )
     or (v_price is not null and (v_price<=0 or v_price>100000))
     or v_discount not between 0 and 100
  then
    update larios_import.whatsapp_inbox set status='review',reason='invalid_booking_values',processed_at=now()
      where id=v_row.id;
    return jsonb_build_object('status','review','reason','invalid_booking_values');
  end if;
  if v_units>1 and v_price is not null then
    update larios_import.whatsapp_inbox set status='review',
      reason='multi_vehicle_explicit_price_needs_review',processed_at=now()
      where id=v_row.id;
    return jsonb_build_object('status','review',
      'reason','multi_vehicle_explicit_price_needs_review');
  end if;
  for v_group_item in select unnest(v_groups) order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_date::text||v_time::text||v_group_item,0));
  end loop;
  if v_code is not null and exists(select 1 from public.contracts c where
       upper(c.renthub_contract_id)=v_code or upper(c.app_payload->>'source_booking_code')=v_code) then
    update larios_import.whatsapp_inbox set status='already_exists',
      reason='existing_booking_code',processed_at=now() where id=v_row.id;
    return jsonb_build_object('status','already_exists','reason','existing_booking_code');
  end if;
  for v_group_item in select unnest(v_groups) loop
    select count(*) into v_matches
      from public.contracts c join public.customers cu on cu.id=c.customer_id
      where c.delivery_date=v_date and c.delivery_time=v_time
        and upper(coalesce(c.category,''))=v_group_item
        and larios_import.booking_duplicate_match(
          v->>'customer_phone_hint',v->>'customer_name_hint',
          v->>'pickup_location_hint',v->>'customer_reference_hint',
          cu.phone,cu.full_name,c.delivery_location,c.app_payload->>'reservation_detail');
    if v_matches>0 then
      update larios_import.whatsapp_inbox set
        status=case when v_matches=1 then 'already_exists' else 'review' end,
        reason=case when v_matches=1 then 'matching_name_phone_or_place_reference'
          else 'multiple_matching_reservations' end,
        processed_at=now() where id=v_row.id;
      return jsonb_build_object('status',case when v_matches=1
        then 'already_exists' else 'review' end,
        'reason',case when v_matches=1 then 'matching_name_phone_or_place_reference'
          else 'multiple_matching_reservations' end);
    end if;
    v_category:=case v_group_item when '50CC' then '50cc' when '125CC' then '125cc'
      when 'BICICLETA' then 'BICICLETA' when 'E-BIKE' then 'E-BIKE'
      else 'Grupo '||v_group_item end;
    perform 1 from public.pricing p where p.active
      and upper(p.category)=upper(v_category) limit 1;
    if not found then
      update larios_import.whatsapp_inbox set status='review',
        reason='missing_active_tariff',processed_at=now() where id=v_row.id;
      return jsonb_build_object('status','review','reason','missing_active_tariff');
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'key',x.key,'label',x.label,'qty',1,'unit',case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end,
      'daily',x.daily_price,'max',x.max_price,
      'total',case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end,
      'manual',false) order by x.ord),'[]'::jsonb),
    coalesce(sum(case when x.max_price is null then v_days*x.daily_price else least(v_days*x.daily_price,x.max_price) end),0)
    into v_extras,v_extras_total
    from (values
      (1,'child_seat','Sillita',6,40,(v_row.raw_text ~* 'baby[[:space:]]*seat' or (v_row.raw_text ~* 'sillita' and v_row.raw_text !~* '(sillita[[:space:]]*(de[[:space:]]*)?bici|silla[[:space:]]*(de[[:space:]]*)?bici)'))),
      (2,'carplay','CarPlay',6,40,(v_row.raw_text ~* 'car[[:space:]]*play')),
      (3,'gps','GPS',6,40,(v_row.raw_text ~* 'gps')),
      (4,'booster','Elevador',5,25,(v_row.raw_text ~* 'elevador')),
      (5,'gloves','Guantes',5,25,(v_row.raw_text ~* 'guantes?')),
      (6,'bike_seat','Sillita bici',5,25,(v_row.raw_text ~* '(sillita[[:space:]]*(de[[:space:]]*)?bici|silla[[:space:]]*(de[[:space:]]*)?bici([[:space:]]+niñ[oa])?)')),
      (7,'phone_holder','Soporte móvil',5,25,(v_row.raw_text ~* '(holder|soporte[[:space:]]+(para[[:space:]]+)?m[oó]vil)')),
      (8,'additional_driver','Conductor adicional',5,null::integer,(v_row.raw_text ~* '(2[ºo]?[[:space:]]+conductor(es)?|segundo[[:space:]]+conductor|conductor[[:space:]]+adicional|cond[[:space:].]*adicional)'))
    ) as x(ord,key,label,daily_price,max_price,mentioned) where x.mentioned;
  select exists(select 1 from public.tariff_periods t where t.active
    and coalesce(nullif(v->>'pricing_start_date','')::date,v_date) between t.start_date and t.end_date) into v_season;
  for v_group_item in select unnest(v_groups) loop
  v_category:=case v_group_item when '50CC' then '50cc' when '125CC' then '125cc'
    when 'BICICLETA' then 'BICICLETA' when 'E-BIKE' then 'E-BIKE'
    else 'Grupo '||v_group_item end;
  select p.franchise,p.insurance_first_day,p.insurance_extra_day into v_franchise,v_insurance_first,v_insurance_extra from public.pricing p
    where p.active and upper(p.category)=upper(v_category)
    order by p.created_at desc limit 1;
  v_payload:=jsonb_build_object(
    'source','whatsapp_group','source_whatsapp_message_id',v_row.source_id,
    'source_whatsapp_group',v_row.source_chat,'source_whatsapp_sender',v_row.sender,
    'customer_name',coalesce(nullif(v->>'customer_name_hint',''),'Pendiente Larios Rental'),
    'customer_phone',coalesce(v->>'customer_phone_hint',''),
    'vehicle_group',v_group_item,'vehicle_quantity',v_unit_qty,
    'pickup_date',v_date,'pickup_time',to_char(v_time,'HH24:MI'),
    'pickup_location',v->>'pickup_location_hint',
    'return_date',v_return_date,'return_time',to_char(v_return_time,'HH24:MI'),
    'return_location',v_return_location,
    'rental_days',v_days,'tariff94',v_season,
    'agency',coalesce(v->>'agency_hint',''),
    'discount_percent',v_discount,
    'full_insurance',v_full_insurance,'insurance_total_manual',(v_insurance_price is not null),
    'extras_detail',v_extras,'extras_total',to_char(v_extras_total,'FM999999990.00'),
    'time_pending',coalesce((v->>'time_pending')::boolean,false),
    'renthub_local_only',coalesce((v->>'renthub_local_only')::boolean,false),
    'reservation_detail',concat_ws(' · ',
      case when coalesce((v->>'time_pending')::boolean,false) then 'PENDIENTE HORA' end,
      case when coalesce((v->>'time_inferred')::boolean,false) then 'HORA NO INDICADA · 09:00 PROVISIONAL' end,
      case when coalesce((v->>'delivery_asap')::boolean,false) then 'ENTREGA LO ANTES POSIBLE' end,
      case when nullif(v->>'return_time_text','') is not null then v->>'return_time_text' end,
      case when coalesce((v->>'return_time_approx')::boolean,false) and nullif(v->>'return_time_text','') is null then 'DEVOLUCIÓN '||to_char(v_return_time,'HH24:MI')||' APROX.' end,
      case when coalesce((v->>'departed_now')::boolean,false) then 'HA SALIDO' end,
      case when coalesce((v->>'renthub_local_only')::boolean,false) then 'SOLO APP · OFICINA' end,
      case when coalesce((v->>'count_from_rule')::boolean,false) then 'CUENTA DESDE '||to_char((v->>'pricing_start_date')::date,'DD/MM/YYYY')||' 08:30' end,
      nullif(v->>'customer_reference_hint','')),
    'whatsapp_message',v_row.raw_text,
    'payment_status',case when coalesce((v->>'paid_mentioned')::boolean,false) then 'paid' else 'pending' end);
  if v_price is not null then
    v_payload:=v_payload||jsonb_build_object('rental_price',v_price,'total',v_price);
  end if;
  v_payload:=public.app_prepare_reservation_price(v_payload);
  v_payload:=jsonb_set(v_payload,'{insurance_total}',to_jsonb(case when v_insurance_price is not null then round(v_insurance_price,2) when v_full_insurance then round(coalesce(v_insurance_first,0)+greatest(v_days-1,0)*coalesce(v_insurance_extra,0),2) else 0 end),true);
  if v_price is not null then
    v_payload:=jsonb_set(v_payload,'{rental_price}',to_jsonb(round(greatest(v_price-coalesce((v_payload->>'insurance_total')::numeric,0),0),2)),true);
    v_payload:=jsonb_set(v_payload,'{base_tariff_price}',to_jsonb(round(greatest(v_price-coalesce((v_payload->>'insurance_total')::numeric,0),0),2)),true);
    v_payload:=jsonb_set(v_payload,'{total}',to_jsonb(round(v_price+v_extras_total,2)),true);
  else
    v_payload:=jsonb_set(v_payload,'{total}',
      to_jsonb(round((v_payload->>'rental_price')::numeric*(1-v_discount/100)+coalesce((v_payload->>'insurance_total')::numeric,0)+v_extras_total,2)),true);
  end if;
  for v_unit in 1..v_group_units loop
    v_contract_payload:=v_payload;
    if v_units>1 then
      v_contract_payload:=v_payload||jsonb_build_object(
        'source_whatsapp_unit_index',coalesce(array_length(v_contracts,1),0)+1,
        'source_whatsapp_unit_count',v_units,
        'reservation_detail',concat_ws(' · ',nullif(v_payload->>'reservation_detail',''),
          'UNIDAD '||(coalesce(array_length(v_contracts,1),0)+1)||' DE '||v_units));
    end if;
    insert into public.customers(full_name,phone)
      values (v_contract_payload->>'customer_name',nullif(v_contract_payload->>'customer_phone',''))
      returning id into v_customer;
    insert into public.drivers(customer_id,full_name,is_main_driver)
      values (v_customer,v_contract_payload->>'customer_name',true) returning id into v_driver;
    insert into public.contracts(customer_id,main_driver_id,status,category,quantity,
      delivery_date,delivery_time,delivery_location,return_date,return_time,return_location,
      rental_days,rental_total,full_insurance,insurance_total,young_driver,young_driver_total,
      discount_percent,vat_percent,total,franchise,app_payload)
    values (v_customer,v_driver,'draft',v_group_item,v_unit_qty,v_date,v_time,
      v_contract_payload->>'pickup_location',v_return_date,v_return_time,
      v_contract_payload->>'return_location',
      v_days,(v_contract_payload->>'rental_price')::numeric,v_full_insurance,(v_contract_payload->>'insurance_total')::numeric,false,0,v_discount,21,
      (v_contract_payload->>'total')::numeric,case when v_full_insurance then 0 else coalesce(v_franchise,0) end,v_contract_payload)
    returning id into v_contract;
    v_contracts:=array_append(v_contracts,v_contract);
  end loop;
  end loop;
  update larios_import.whatsapp_inbox set status='created',reason=case when nullif(v->>'completion_parent_source_id','') is not null then 'completed_pending_booking' else 'manual_booking' end,
    contract_id=v_contracts[1],candidate=v,processed_at=now() where id=v_row.id;
  if nullif(v->>'completion_parent_source_id','') is not null then
    update larios_import.whatsapp_inbox
      set status='created',reason='completed_by_followup',contract_id=v_contracts[1],candidate=v,processed_at=now()
      where source_chat=p_chat and source_id=v->>'completion_parent_source_id';
  end if;
  return jsonb_build_object('status','created','contract_id',v_contracts[1],
    'contract_ids',to_jsonb(v_contracts));
end;
$function$



-- WhatsApp vehicle return handling: normalize fuel, match the open contract by plate,
-- close only when no return charge is due, and attach a payment warning otherwise.
create or replace function public.lr_fuel_eighths(p_value text)
returns integer language plpgsql immutable set search_path to 'public','pg_temp' as $$
declare v text:=lower(trim(coalesce(p_value,''))); m text[]; n integer; d integer;
begin
 if v='' then return null; end if;
 if v ~ '(^|[^a-z])(-full|-lleno)([^a-z]|$)' then return 0; end if;
 if v ~ '(full|lleno|8/8|8[[:space:]]*p)' then return 8; end if;
 m:=regexp_match(v,'([+-]?[0-9]+)[[:space:]]*/[[:space:]]*([0-9]+)');
 if m is not null then
  n:=abs(m[1]::integer); d:=m[2]::integer;
  if d=8 and n between 0 and 8 then return n; end if;
  if d=4 and n between 0 and 4 then return n*2; end if;
  if d=2 and n between 0 and 2 then return n*4; end if;
  return null;
 end if;
 m:=regexp_match(v,'([1-8])[[:space:]]*p(?:untos?)?');
 if m is not null then return m[1]::integer; end if;
 return null;
end $$;

create or replace function public.larios_whatsapp_apply_return_internal(p_chat text,p_id text)
returns jsonb language plpgsql security definer set search_path to 'public','larios_import','pg_temp' as $$
declare
 r larios_import.whatsapp_inbox%rowtype;
 v_contract public.contracts%rowtype;
 v_plate text; v_fuel_text text; v_fuel integer; v_parking numeric:=0;
 v_msg_date date; v_candidates integer; v_min_distance integer;
 v_out integer; v_tank numeric; v_fuel_charge numeric:=0;
 v_due numeric:=0; v_reason text:=''; v_banner text; v_group text;
begin
 select * into r from larios_import.whatsapp_inbox where source_chat=p_chat and source_id=p_id for update;
 if not found or r.status<>'pending' then return null; end if;
 if r.raw_text !~* '[0-9]{4}' or r.raw_text !~* '(-?full|lleno|[+-]?[1-3][[:space:]]*/[[:space:]]*[24]|[1-8][[:space:]]*p)' then return null; end if;
 v_plate:=substring(r.raw_text from '([0-9]{4})');
 v_msg_date:=(r.sent_at at time zone 'Europe/Madrid')::date;
 v_fuel_text:=substring(lower(r.raw_text) from '(-?full|lleno|[+-]?[1-3][[:space:]]*/[[:space:]]*[24]|[1-8][[:space:]]*p)');
 v_fuel:=public.lr_fuel_eighths(v_fuel_text);
 if v_fuel is null then
  update larios_import.whatsapp_inbox set status='review',reason='return_fuel_not_recognized',processed_at=now() where id=r.id;
  return jsonb_build_object('status','review','reason','return_fuel_not_recognized');
 end if;
 if r.raw_text ~* 'parking' then
  v_fuel_text:=substring(lower(r.raw_text) from 'parking[^0-9]{0,30}([0-9]+([,.][0-9]{1,2})?)');
  if v_fuel_text is null then
   update larios_import.whatsapp_inbox set status='review',reason='return_parking_amount_missing',processed_at=now() where id=r.id;
   return jsonb_build_object('status','review','reason','return_parking_amount_missing');
  end if;
  v_parking:=replace(v_fuel_text,',','.')::numeric;
 end if;
 select count(*),min(abs(c.return_date-v_msg_date)) into v_candidates,v_min_distance
 from public.contracts c join public.vehicles vh on vh.id=c.vehicle_id
 where c.status not in ('cancelled','canceled','returned','collected','draft')
  and c.return_date between v_msg_date-1 and v_msg_date+3
  and regexp_replace(vh.registration,'[^0-9]','','g') like '%'||v_plate||'%';
 if coalesce(v_candidates,0)=0 then
  update larios_import.whatsapp_inbox set status='review',reason='return_vehicle_contract_not_found',processed_at=now() where id=r.id;
  return jsonb_build_object('status','review','reason','return_vehicle_contract_not_found','plate_fragment',v_plate);
 end if;
 if (select count(*) from public.contracts c join public.vehicles vh on vh.id=c.vehicle_id
   where c.status not in ('cancelled','canceled','returned','collected','draft')
    and c.return_date between v_msg_date-1 and v_msg_date+3
    and abs(c.return_date-v_msg_date)=v_min_distance
    and regexp_replace(vh.registration,'[^0-9]','','g') like '%'||v_plate||'%')<>1 then
  update larios_import.whatsapp_inbox set status='review',reason='return_multiple_matching_contracts',processed_at=now() where id=r.id;
  return jsonb_build_object('status','review','reason','return_multiple_matching_contracts','plate_fragment',v_plate);
 end if;
 select ct.* into v_contract from public.contracts ct join public.vehicles vh on vh.id=ct.vehicle_id
 where ct.status not in ('cancelled','canceled','returned','collected','draft')
  and ct.return_date between v_msg_date-1 and v_msg_date+3
  and abs(ct.return_date-v_msg_date)=v_min_distance
  and regexp_replace(vh.registration,'[^0-9]','','g') like '%'||v_plate||'%'
 limit 1 for update of ct;
 v_out:=public.lr_fuel_eighths(v_contract.delivery_fuel);
 v_group:=upper(regexp_replace(coalesce(v_contract.category,''),'^GRUPO[[:space:]]*','','i'));
 v_tank:=case when v_group in ('A','B','C','D','F','J','K') then 100
  when v_group in ('G','I','L') then 120 when v_group in ('H','Q') then 140 else null end;
 if v_out is null then
  update larios_import.whatsapp_inbox set status='review',reason='return_delivery_fuel_missing',contract_id=v_contract.id,processed_at=now() where id=r.id;
  update public.contracts set return_fuel=v_fuel::text||'/8',
   app_payload=coalesce(app_payload,'{}'::jsonb)||jsonb_build_object('return_fuel_eighths',v_fuel,'return_fuel_source_message',r.source_id,'return_payment_review','No consta el nivel de combustible de entrega')
   where id=v_contract.id;
  return jsonb_build_object('status','review','reason','return_delivery_fuel_missing','contract_id',v_contract.id);
 end if;
 if v_tank is null then
  update larios_import.whatsapp_inbox set status='review',reason='return_fuel_group_rate_missing',contract_id=v_contract.id,processed_at=now() where id=r.id;
  return jsonb_build_object('status','review','reason','return_fuel_group_rate_missing','contract_id',v_contract.id);
 end if;
 if v_fuel<v_out then v_fuel_charge:=round((v_out-v_fuel)*v_tank/8,2); end if;
 v_due:=round(v_parking+v_fuel_charge,2);
 if v_parking>0 then v_reason:='PARKING'; end if;
 if v_fuel_charge>0 then v_reason:=concat_ws(' · ',nullif(v_reason,''),'COMBUSTIBLE '||v_fuel::text||'/8 (ENTREGA '||v_out::text||'/8)'); end if;
 if v_due>0 then
  v_banner:='PTE. DE PAGO '||replace(to_char(v_due,'FM999999990.00'),'.',',')||' € · '||v_reason;
  update public.contracts set return_fuel=v_fuel::text||'/8',
   app_payload=coalesce(app_payload,'{}'::jsonb)||jsonb_build_object('return_fuel_eighths',v_fuel,'return_payment_due',v_due,'return_payment_reason',v_reason,'return_payment_banner',v_banner,'return_payment_status','pending','return_source_message',r.source_id)
   where id=v_contract.id;
  update larios_import.whatsapp_inbox set status='created',reason='vehicle_return_payment_pending',contract_id=v_contract.id,processed_at=now() where id=r.id;
  return jsonb_build_object('status','created','reason','vehicle_return_payment_pending','contract_id',v_contract.id,'amount_due',v_due,'message',v_banner);
 end if;
 update public.contracts set status='returned',return_fuel=v_fuel::text||'/8',collected_by='WhatsApp',
  card_last4=null,card_expiry_month=null,card_expiry_year=null,payment_token=null,
  app_payload=(coalesce(app_payload,'{}'::jsonb)||jsonb_build_object('return_fuel_eighths',v_fuel,'return_payment_due',0,'return_payment_reason',null,'return_payment_banner',null,'return_payment_status','clear','return_source_message',r.source_id,'returned_via_whatsapp',true))
   - array['card_number','card_last4','card_expiry','card_expiry_month','card_expiry_year','payment_token'],
  updated_at=now() where id=v_contract.id;
 update larios_import.whatsapp_inbox set status='created',reason='vehicle_return_closed',contract_id=v_contract.id,processed_at=now() where id=r.id;
 return jsonb_build_object('status','created','reason','vehicle_return_closed','contract_id',v_contract.id,'fuel_in',v_fuel||'/8');
end $$;
revoke all on function public.lr_fuel_eighths(text) from public,anon,authenticated;
revoke all on function public.larios_whatsapp_apply_return_internal(text,text) from public,anon,authenticated;

do $$
declare d text;
begin
 d:=pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);
 if position('v_return_result jsonb;' in d)=0 then
  d:=replace(d,'v_matches integer;','v_matches integer;'||chr(10)||'  v_return_result jsonb;');
 end if;
 if position('v_return_result := public.larios_whatsapp_apply_return_internal' in d)=0 then
  d:=replace(d,
   'if v_row.sent_at<v_start then raise exception ''Message predates token activation''; end if;',
   'if v_row.sent_at<v_start then raise exception ''Message predates token activation''; end if;'||chr(10)||
   '  v_return_result := public.larios_whatsapp_apply_return_internal(p_chat,p_id);'||chr(10)||
   '  if v_return_result is not null then return v_return_result; end if;');
 end if;
 if position('v_return_result := public.larios_whatsapp_apply_return_internal' in d)=0 then
  raise exception 'Could not install WhatsApp return routing into larios_whatsapp_process';
 end if;
 execute d;
end $$;

create or replace function public.app_normalize_manual_reservation(p_raw text,p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid:=gen_random_uuid();
  v_source_id text:='manual:'||v_id::text;
  v_candidate jsonb;
  v_normalized jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or public.app_current_role()<>'admin' then
    raise exception 'Solo los administradores pueden crear reservas manualmente' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_raw,'')),'') is null or length(p_raw)>8000
     or jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then
    raise exception 'Mensaje de reserva no válido';
  end if;

  v_candidate:=jsonb_strip_nulls(jsonb_build_object(
    'kind','booking_candidate',
    'pickup_date',nullif(p_payload->>'pickup_date',''),
    'pickup_time',nullif(p_payload->>'pickup_time',''),
    'return_date',nullif(p_payload->>'return_date',''),
    'return_time',nullif(p_payload->>'return_time',''),
    'rental_days',nullif(p_payload->>'rental_days','')::integer,
    'vehicle_group',nullif(p_payload->>'vehicle_group',''),
    'vehicle_quantity',greatest(1,coalesce(nullif(p_payload->>'vehicle_quantity','')::integer,1)),
    'pickup_location_hint',nullif(p_payload->>'pickup_location',''),
    'return_location_hint',nullif(p_payload->>'return_location',''),
    'customer_name_hint',nullif(p_payload->>'customer_name',''),
    'customer_phone_hint',nullif(p_payload->>'customer_phone',''),
    'agency_hint',nullif(p_payload->>'agency',''),
    'customer_reference_hint',nullif(p_payload->>'reservation_detail',''),
    'payment_status',nullif(p_payload->>'payment_status',''),
    'review_reasons','[]'::jsonb
  ));

  insert into larios_import.whatsapp_inbox
    (source_chat,source_id,sender,sent_at,raw_text,candidate,status)
  values
    ('manual_app',v_source_id,auth.uid()::text,now(),p_raw,v_candidate,'pending')
  returning candidate into v_normalized;

  delete from larios_import.whatsapp_inbox
  where source_chat='manual_app' and source_id=v_source_id;

  v_result:=coalesce(p_payload,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'pickup_date',nullif(v_normalized->>'pickup_date',''),
    'pickup_time',nullif(v_normalized->>'pickup_time',''),
    'return_date',nullif(v_normalized->>'return_date',''),
    'return_time',nullif(v_normalized->>'return_time',''),
    'rental_days',nullif(v_normalized->>'rental_days',''),
    'vehicle_group',nullif(v_normalized->>'vehicle_group',''),
    'vehicle_quantity',nullif(v_normalized->>'vehicle_quantity',''),
    'pickup_location',nullif(v_normalized->>'pickup_location_hint',''),
    'return_location',coalesce(nullif(v_normalized->>'return_location_hint',''),nullif(v_normalized->>'pickup_location_hint','')),
    'customer_name',nullif(v_normalized->>'customer_name_hint',''),
    'customer_phone',nullif(v_normalized->>'customer_phone_hint',''),
    'agency',nullif(v_normalized->>'agency_hint',''),
    'reservation_detail',nullif(v_normalized->>'customer_reference_hint',''),
    'payment_status',nullif(v_normalized->>'payment_status',''),
    'review_reasons',coalesce(v_normalized->'review_reasons','[]'::jsonb),
    'pricing_start_date',nullif(v_normalized->>'pricing_start_date',''),
    'pricing_start_time',nullif(v_normalized->>'pricing_start_time',''),
    'count_from_rule',coalesce((v_normalized->>'count_from_rule')::boolean,false),
    'manual_whatsapp_normalized',true
  ));
  return v_result;
exception when others then
  delete from larios_import.whatsapp_inbox
  where source_chat='manual_app' and source_id=v_source_id;
  raise;
end;
$function$;

revoke all on function public.app_normalize_manual_reservation(text,jsonb) from public,anon;
grant execute on function public.app_normalize_manual_reservation(text,jsonb) to authenticated;

-- Short hotel names used in WhatsApp must resolve identically in the automatic
-- inbox and in the manual paste flow.
insert into public.collaborator_aliases (collaborator_id,alias,normalized_alias)
select c.id,'BRO',public.lr_normalize_partner_name('BRO')
from public.collaborators c
where c.name='HOTEL BRO' and c.active
on conflict (normalized_alias) do update
set collaborator_id=excluded.collaborator_id,alias=excluded.alias;

insert into public.collaborator_aliases (collaborator_id,alias,normalized_alias)
select c.id,'CRISTINE BEDFORD',public.lr_normalize_partner_name('CRISTINE BEDFORD')
from public.collaborators c
where c.name='CRISTINE BEDFORD HOTEL' and c.active
on conflict (normalized_alias) do update
set collaborator_id=excluded.collaborator_id,alias=excluded.alias;

create or replace function larios_import.ensure_whatsapp_collaborator_match()
returns trigger
language plpgsql
set search_path to 'public','larios_import','pg_temp'
as $function$
declare
  v_text text;
  v_hint text;
  v_name text;
  v_alias text;
begin
  v_text := public.lr_normalize_partner_name(coalesce(new.raw_text,''));
  v_hint := public.lr_normalize_partner_name(coalesce(new.candidate->>'agency_hint',''));

  -- Canonicalise a collaborator already extracted by either parser.
  if v_hint<>'' and v_hint<>'PARTICULAR' then
    select c.name,a.alias into v_name,v_alias
    from public.collaborator_aliases a
    join public.collaborators c on c.id=a.collaborator_id
    where c.active and a.normalized_alias=v_hint
    limit 1;
  end if;

  -- Otherwise apply the same whole-message alias fallback used by WhatsApp.
  if v_name is null and coalesce(upper(new.candidate->>'agency_hint'),'PARTICULAR')='PARTICULAR'
     and v_text<>'' then
    select c.name,a.alias into v_name,v_alias
    from public.collaborator_aliases a
    join public.collaborators c on c.id=a.collaborator_id
    where c.active and a.normalized_alias<>''
      and (' '||v_text||' ') like ('% '||a.normalized_alias||' %')
    order by case when c.name='CITY EXPERT' then 0 else 1 end,
      length(a.normalized_alias) desc,c.name
    limit 1;
  end if;

  if v_name is not null then
    new.candidate := jsonb_set(coalesce(new.candidate,'{}'::jsonb),'{agency_hint}',to_jsonb(v_name),true);
    new.candidate := jsonb_set(new.candidate,'{agency_matched_alias}',to_jsonb(v_alias),true);
    new.candidate := jsonb_set(new.candidate,'{agency_resolution_source}',to_jsonb('alias_match_shared'::text),true);
    new.candidate := jsonb_set(new.candidate,'{commission_excluded}','false'::jsonb,true);
    new.candidate := new.candidate-'commission_exclusion_reason';
  end if;

  return new;
end;
$function$;

-- Remove date/time prefixes, preserving numbers within physical addresses.
do $patch$
declare v_def text;
begin
 select pg_get_functiondef('public.lr_whatsapp_clean_place_hint(text)'::regprocedure) into v_def;
 if position('-- Booking date/time prefixes' in v_def)=0 then
  v_def:=replace(v_def,E'begin\n',E'begin\n  -- Booking date/time prefixes are not delivery locations.\n  v := regexp_replace(v, ''^([[:space:]]*([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/.][0-9]{1,2}([/.][0-9]{2,4})?)([[:space:]]+|$))+'', '''', ''i'');\n  v := regexp_replace(v, ''^[[:space:]]*([01]?[0-9]|2[0-3])[:;h.][0-5][0-9]([[:space:]]+|$)'', '''', ''i'');\n  v := regexp_replace(v, ''^[[:space:]]*(hoy|mañana|pasado mañana)([[:space:]]+|$)'', '''', ''i'');\n');
  execute v_def;
 end if;
end;
$patch$;

insert into public.collaborator_aliases(collaborator_id,alias,normalized_alias)
select c.id,a,public.lr_normalize_partner_name(a)
from public.collaborators c cross join unnest(array['M CENTTO','M CENTTRO','MLGA CENTTO','MALAGA CENTTO']) a
where c.name='MALAGA CENTRO HOTEL' and c.active
on conflict(normalized_alias) do update set collaborator_id=excluded.collaborator_id,alias=excluded.alias;

-- Preserve the raw message and the unclassified name for review.
update public.contracts set
 delivery_location='VINCCI LARIOS 10',
 return_location=case when return_location='4/11 larios 10 ralf' then 'VINCCI LARIOS 10' else return_location end,
 app_payload=app_payload||jsonb_build_object('pickup_location','VINCCI LARIOS 10','return_location','VINCCI LARIOS 10','reservation_detail',coalesce(nullif(app_payload->>'reservation_detail',''),'RALF')),
 updated_at=now()
where contract_number=63832 and delivery_location='4/11 larios 10 ralf';

update public.contracts set delivery_location='MALAGA CENTRO HOTEL',
 return_location=case when lower(return_location)='m centto' then 'MALAGA CENTRO HOTEL' else return_location end,
 app_payload=app_payload||jsonb_build_object('pickup_location','MALAGA CENTRO HOTEL','return_location','MALAGA CENTRO HOTEL'),updated_at=now()
where contract_number=63959 and lower(delivery_location)='m centto';

-- The short hotel alias followed by a guest name must remain a hotel location.
do $patch$
declare v_def text;
begin
 select pg_get_functiondef('public.lr_whatsapp_normalize_location_candidate(text,jsonb)'::regprocedure) into v_def;
 if position('-- Canonical physical hotel prefixes' in v_def)=0 then
  v_def:=replace(v_def,E'  if upper(v_loc)=',E'  -- Canonical physical hotel prefixes (guest details stay in the raw message).\n  if v_loc ~* ''^(hotel[[:space:]]+)?(vincci[[:space:]]+)?larios[[:space:]]+(10|diez)([[:space:]]|$)'' then v_loc := ''VINCCI LARIOS 10'';end if;\n  if v_loc ~* ''^m[[:space:]]+centt?ro$|^m[[:space:]]+centto$'' then v_loc := ''MALAGA CENTRO HOTEL'';end if;\n  if upper(v_loc)=');
  execute v_def;
 end if;
end;
$patch$;

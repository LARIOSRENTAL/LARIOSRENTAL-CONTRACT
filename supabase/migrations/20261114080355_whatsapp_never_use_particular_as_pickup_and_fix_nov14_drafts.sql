CREATE OR REPLACE FUNCTION public.lr_whatsapp_normalize_location_candidate(p_raw text, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb := public._lr_whatsapp_normalize_location_candidate_legacy_20261024(p_raw,p_candidate);
  v_raw_norm text := upper(translate(coalesce(p_raw,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_name text := trim(coalesce(v->>'customer_name_hint',''));
  v_agency text := trim(coalesce(v->>'agency_hint',''));
  v_loc text := '';
  v_return_loc text := '';
  v_ref text := trim(coalesce(v->>'customer_reference_hint',''));
  v_note text;
  v_match text[];
  v_no_commission boolean;
begin
  v_no_commission := v_raw_norm ~ '(^|[^A-Z])(NO|SIN)[[:space:]]+COMISION(ES)?([^A-Z]|$)';

  if upper(v_name)='CITY EXPERT' then v := v - 'customer_name_hint'; end if;
  if not v_no_commission and (
       v_raw_norm ~ '(^|[^A-Z0-9])CITY[[:space:]]+EXPERT([^A-Z0-9]|$)'
       or upper(v_agency)='CITY EXPERT'
       or upper(v_name)='CITY EXPERT'
     ) then
    v := jsonb_set(v,'{agency_hint}',to_jsonb('CITY EXPERT'::text),true);
    v_agency := 'CITY EXPERT';
  end if;

  v_loc := coalesce(public.lr_whatsapp_clean_place_hint(v->>'pickup_location_hint'),'');
  v_return_loc := coalesce(public.lr_whatsapp_clean_place_hint(v->>'return_location_hint'),'');

  if upper(v_agency)='HAMPTON' and v_raw_norm ~ '(^|[^A-Z])HAMPTON([^A-Z]|$)' then
    v_loc := 'HOTEL HAMPTON';
    if v_ref='' then
      v_match:=regexp_match(coalesce(p_raw,''),'(?i)hampton[[:space:],;#-]+([0-9]{1,5})([^0-9]|$)');
      if v_match is not null then v_ref:='REFERENCIA '||v_match[1]; end if;
    end if;
  end if;

  if v_loc ~* '^(hotel[[:space:]]+)?(vincci[[:space:]]+)?larios[[:space:]]+(10|diez)([[:space:]]|$)' then v_loc := 'VINCCI LARIOS 10'; end if;
  if v_loc ~* '^m[[:space:]]+centt?ro$|^m[[:space:]]+centto$' then v_loc := 'MALAGA CENTRO HOTEL'; end if;
  if upper(v_loc)='CITY EXPERT' then v_loc := ''; end if;
  if v_loc='' and v_raw_norm ~ '(^|[^A-Z])IBIS[[:space:]]+BUDGET([^A-Z]|$)' then v_loc := 'HOTEL IBIS BUDGET'; end if;

  -- Explicit office or street address takes precedence over collaborator.
  if v_raw_norm ~ '(^|[^A-Z])OFI(CINA)?([^A-Z]|$)' then
    v_loc := 'OFICINA';
    v_match := regexp_match(coalesce(p_raw,''),'(^|[^[:alpha:]])(calle|c/|avenida|avda?\.?|plaza|paseo)[[:space:]]+([[:alpha:]ÁÉÍÓÚÜÑáéíóúüñ]+([[:space:]-]+[[:alpha:]ÁÉÍÓÚÜÑáéíóúüñ]+){0,3})');
    if v_match is not null then v_loc := upper(v_match[3]||' '||v_match[4]); end if;
  end if;

  -- A hotel room number is a reference, not part of the physical place.
  if upper(v_agency)='CARLOS V HOTEL' and v_raw_norm ~ '(^|[^A-Z])CARLOS[[:space:]]+V[[:space:]]+[0-9]{1,5}([^0-9]|$)' then
    v_loc := 'CARLOS V HOTEL';
    if v_ref='' then
      v_match:=regexp_match(coalesce(p_raw,''),'(?i)carlos[[:space:]]+v[[:space:]]+([0-9]{1,5})');
      if v_match is not null then v_ref:='REFERENCIA '||v_match[1]; end if;
    end if;
  end if;

  -- Never use the accounting fallback "PARTICULAR" as a delivery address.
  -- When the message has no explicit physical place, use the matched collaborator;
  -- if there is no collaborator match, use the office as the operational default.
  if upper(trim(v_loc)) in ('PARTICULAR','') then
    if upper(v_agency) not in ('','PARTICULAR') then
      v_loc := upper(v_agency);
    else
      v_loc := 'OFICINA';
    end if;
  elsif upper(v_agency) not in ('','PARTICULAR')
        and upper(v_loc)<>upper(v_agency)
        and v_loc !~* '(CALLE|C/|AVENIDA|AVDA|PLAZA|PASEO|OFICINA|AEROPUERTO|AGP|CRUCEROS|ESTACIÓN|ESTACION|TERMINAL|HOTEL|PALACIO|PUERTA DEL MAR)' then
    -- Avoid promoting a stray word (for example a misspelled business/location
    -- fragment) to the delivery address when a collaborator was matched.
    v_loc := upper(v_agency);
  end if;

  if v_ref<>'' then v := jsonb_set(v,'{customer_reference_hint}',to_jsonb(v_ref),true); end if;
  v := jsonb_set(v,'{pickup_location_hint}',to_jsonb(v_loc),true);
  if v ? 'return_location_hint' then
    if upper(trim(v_return_loc)) in ('PARTICULAR','') then v_return_loc:=v_loc; end if;
    v := jsonb_set(v,'{return_location_hint}',to_jsonb(v_return_loc),true);
  end if;

  if v_ref='' then
    v_note := substring(coalesce(p_raw,'') from '(?i)(pagad[oa]s?|pte[[:space:].]*pago|pendiente[[:space:]]+(de[[:space:]]+)?pago|precio([[:space:]]+especial)?|tarifa[[:space:]]+especial)[[:space:]:=]*(€[[:space:]]*)?[0-9]+([,.][0-9]{1,2})?[[:space:]]*(€|eur)?');
    if v_note is not null then v := jsonb_set(v,'{customer_reference_hint}',to_jsonb(btrim(v_note)),true); end if;
  end if;
  return v;
end
$function$
;

insert into public.collaborator_aliases(collaborator_id,alias,normalized_alias)
select id,'CARLOS V','CARLOS V' from public.collaborators
where upper(name)='CARLOS V HOTEL'
and not exists(select 1 from public.collaborator_aliases where normalized_alias='CARLOS V');

update public.contracts c
set delivery_location='CLUB HISPANICO',return_location='CLUB HISPANICO',
 app_payload=(c.app_payload - 'customer_reference_hint' - 'reservation_detail')
 || jsonb_build_object('pickup_location','CLUB HISPANICO','return_location','CLUB HISPANICO',
  'customer_reference_hint',null,'reservation_detail','','customer_name','Pendiente Larios Rental')
where contract_number=64058 and status='draft'
and app_payload->>'whatsapp_message'='10:00 125 1 dia club Hispanico Biganvilla';

update public.customers cu set full_name='Pendiente Larios Rental'
from public.contracts c where c.contract_number=64058 and c.status='draft'
and c.customer_id=cu.id and cu.full_name='CLUB HISPANICO BIGANVILLA';
update public.drivers d set full_name='Pendiente Larios Rental'
from public.contracts c where c.contract_number=64058 and c.status='draft'
and c.main_driver_id=d.id and d.full_name='CLUB HISPANICO BIGANVILLA';

update public.contracts c set delivery_location='CALLE BALCÓN',return_location='CALLE BALCÓN',
 app_payload=jsonb_set(jsonb_set(c.app_payload,'{pickup_location}','"CALLE BALCÓN"'::jsonb,true),
  '{return_location}','"CALLE BALCÓN"'::jsonb,true)
where c.contract_number=64060 and c.status='draft'
and c.app_payload->>'whatsapp_message'='9:30 g a -15 ofi Rober calle balcón';

update public.contracts c set delivery_location='CARLOS V HOTEL',return_location='CARLOS V HOTEL',
 app_payload=jsonb_set(jsonb_set(jsonb_set(c.app_payload,'{pickup_location}','"CARLOS V HOTEL"'::jsonb,true),
  '{return_location}','"CARLOS V HOTEL"'::jsonb,true),
  '{customer_reference_hint}','"REFERENCIA 47"'::jsonb,true)
where c.contract_number=64061 and c.status='draft'
and c.app_payload->>'whatsapp_message'='10 00 125 un día Carlos V 47';

update public.contracts c set app_payload=jsonb_set(jsonb_set(jsonb_set(c.app_payload,'{agency}','"CARLOS V HOTEL"'::jsonb,true),
 '{commission_excluded}','false'::jsonb,true),'{reservation_detail}','"REFERENCIA 47"'::jsonb,true)
where c.contract_number=64061 and c.status='draft'
and c.app_payload->>'whatsapp_message'='10 00 125 un día Carlos V 47';

update public.contracts c set delivery_location='OFICINA',return_location='OFICINA',
 app_payload=jsonb_set(jsonb_set(c.app_payload,'{pickup_location}','"OFICINA"'::jsonb,true),
  '{return_location}','"OFICINA"'::jsonb,true)
where c.contract_number in (64063,64065) and c.status='draft'
and coalesce(c.app_payload->>'whatsapp_message','') ~* '(^|[^[:alpha:]])ofi(cina)?([^[:alpha:]]|$');

create or replace function public.larios_whatsapp_find_web_duplicate(
  p_message text, p_customer_name text, p_customer_phone text, p_payload jsonb
)
returns table(contract_id uuid, contract_number bigint, match_basis text)
language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare
  v_name text := regexp_replace(translate(upper(coalesce(p_customer_name,'')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_customer_phone,''), '[^0-9]', '', 'g');
  v_has_identity boolean;
begin
  if coalesce(p_message,'') !~* '(pagad[oa]s?|pago[[:space:]]+pendiente|pendiente([[:space:]]+de)?[[:space:]]+pago|pte[.]?[[:space:]]*(de[[:space:]]*)?pago|pdt[.]?[[:space:]]*pago|paid|payment[[:space:]]+due)' then return; end if;
  if trim(v_name) in ('WEB','PENDIENTE LARIOS RENTAL','LARIOS RENTAL') then v_name := ''; end if;
  v_has_identity := (length(v_phone) >= 7 or length(trim(v_name)) >= 4);
  return query
  with candidate as (
    select nullif(p_payload->>'pickup_date','')::date d,
      nullif(p_payload->>'pickup_time','')::time t,
      nullif(p_payload->>'total','')::numeric amount,
      upper(coalesce(p_payload->>'vehicle_group','')) grp,
      regexp_replace(regexp_replace(translate(upper(coalesce(p_payload->>'pickup_location','')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), E'\\mOFI\\M', 'OFICINA', 'g'), '[^A-Z0-9]+', '', 'g') loc
  ), web_rows as (
    select c.id,c.contract_number,c.delivery_date,c.delivery_time,c.category,
      coalesce(c.app_payload->>'web_original_price',c.app_payload->>'total',c.total::text,c.rental_total::text)::numeric web_amount,
      coalesce(c.app_payload->>'pickup_location',c.delivery_location,'') web_location,
      coalesce(c.app_payload->>'customer_name',cu.full_name,'') web_name,
      coalesce(c.app_payload->>'customer_phone',cu.phone,'') web_phone
    from public.contracts c left join public.customers cu on cu.id=c.customer_id
    where c.status not in ('cancelled','canceled')
      and (c.app_payload->>'source'='renthub_web_email' or coalesce(c.app_payload->>'renthub_created_from_web','false')='true')
  ), normalized as (
    select w.*,
      regexp_replace(regexp_replace(translate(upper(coalesce(w.web_location,'')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), E'\\mOFI\\M', 'OFICINA', 'g'), '[^A-Z0-9]+', '', 'g') web_loc,
      regexp_replace(translate(upper(coalesce(w.web_name,'')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g') norm_web_name,
      regexp_replace(coalesce(w.web_phone,''), '[^0-9]', '', 'g') norm_web_phone,
      upper(coalesce(w.category,'')) web_group
    from web_rows w
  )
  select n.id,n.contract_number,
    case when v_has_identity then 'customer_or_phone' else 'date_time_place_price' end
  from normalized n cross join candidate x
  where n.delivery_date=x.d and n.delivery_time=x.t
    and (x.grp='' or n.web_group='' or
      (case x.grp when 'M1' then '50CC' when 'M2' then '125CC' when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE' else x.grp end)
      =(case n.web_group when 'M1' then '50CC' when 'M2' then '125CC' when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE' else n.web_group end))
    and x.loc<>'' and n.web_loc<>''
    and (x.loc=n.web_loc or (length(x.loc)>=4 and strpos(n.web_loc,x.loc)>0) or (length(n.web_loc)>=4 and strpos(x.loc,n.web_loc)>0)
      or exists(
        select 1 from regexp_split_to_table(translate(upper(coalesce(p_payload->>'pickup_location','')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), E'[^A-Z0-9]+') a(token)
        join regexp_split_to_table(translate(upper(n.web_location), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), E'[^A-Z0-9]+') b(token) using(token)
        where length(a.token)>=4 and a.token not in ('OFICINA','PRINCIPAL','MALAGA','CENTRO','HOTEL','AIRPORT','AEROPUERTO','STREET','CALLE','AVENIDA','AV')))
    and ((v_has_identity and (
      (length(v_phone)>=7 and (n.norm_web_phone=v_phone or (length(n.norm_web_phone)>=9 and length(v_phone)>=9 and right(n.norm_web_phone,9)=right(v_phone,9))))
      or (length(trim(v_name))>=4 and exists(
        select 1 from regexp_split_to_table(trim(v_name),' +') a(token)
        join regexp_split_to_table(trim(n.norm_web_name),' +') b(token) using(token) where length(a.token)>=4)))
    ) or (not v_has_identity and x.amount is not null and abs(n.web_amount-x.amount)<=0.01))
  order by n.contract_number desc limit 1;
end;
$fn$;

revoke all on function public.larios_whatsapp_find_web_duplicate(text,text,text,jsonb) from public, anon, authenticated;

do $patch$
declare d text; marker text := '    insert into public.customers(full_name,phone)';
inject text := $inject$
    if v_group_count=1 then
      perform pg_advisory_xact_lock(hashtextextended(
        coalesce(v_contract_payload->>'pickup_date','')||'|'||coalesce(v_contract_payload->>'pickup_time','')||'|'||
        coalesce(v_contract_payload->>'pickup_location','')||'|'||coalesce(v_contract_payload->>'total',''), 0));
      select * into v_duplicate from public.larios_whatsapp_find_web_duplicate(
        v_row.raw_text,v_contract_payload->>'customer_name',v_contract_payload->>'customer_phone',v_contract_payload) limit 1;
      if v_duplicate.contract_id is not null then
        update larios_import.whatsapp_inbox set status='ignored',reason='duplicate_email_booking',
          contract_id=v_duplicate.contract_id,processed_at=now() where id=v_row.id;
        return jsonb_build_object('status','duplicate','reason','duplicate_email_booking',
          'matched_contract_id',v_duplicate.contract_id,'matched_contract_number',v_duplicate.contract_number,
          'match_basis',v_duplicate.match_basis);
      end if;
    end if;
$inject$;
begin
  d:=pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);
  if position('v_duplicate record;' in d)=0 then d:=replace(d,'  v_mix_price numeric := 0;','  v_mix_price numeric := 0;'||E'\\n  v_duplicate record;'); end if;
  if position(marker in d)=0 then raise exception 'Expected insertion marker missing from larios_whatsapp_process'; end if;
  if position('duplicate_email_booking' in d)=0 then d:=replace(d,marker,inject||marker); end if;
  execute d;
end;
$patch$;

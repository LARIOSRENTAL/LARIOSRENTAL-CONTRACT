-- Callable by the administrative SQL connection only. Never exposed to browser roles.
create schema if not exists larios_import;
revoke all on schema larios_import from public, anon, authenticated;
create or replace function larios_import.web_booking(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  code text := upper(trim(p->>'source_booking_code'));
  price numeric := nullif(p->>'web_original_price','')::numeric;
  pending numeric := nullif(p->>'web_pending_payment','')::numeric;
  cid uuid;
  cust uuid;
  driver uuid;
  grp text;
begin
  if p->>'source' <> 'renthub_web_email' or p->>'renthub_created_from_web' <> 'true'
     or code !~ '^[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$'
     or price is null or price <= 0 or pending is null or pending < 0 or pending > price
     or nullif(p->>'customer_name','') is null or nullif(p->>'pickup_date','') is null
     or nullif(p->>'return_date','') is null or nullif(p->>'pickup_time','') is null
     or nullif(p->>'return_time','') is null then
    raise exception 'Invalid WEB booking payload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(code, 0));
  select c.id into cid from public.contracts c
    where c.app_payload->>'source_booking_code'=code
       or c.renthub_contract_id=code limit 1;
  if cid is not null then return jsonb_build_object('id',cid,'created',false); end if;
  grp := case upper(p->>'vehicle_group')
    when 'M1' then '50cc' when 'M2' then '125cc'
    when 'B1' then 'BICICLETA' when 'B2' then 'E-BIKE'
    else upper(p->>'vehicle_group') end;
  insert into public.customers(full_name,email,phone)
  values (p->>'customer_name',nullif(p->>'customer_email',''),nullif(p->>'customer_phone','')) returning id into cust;
  insert into public.drivers(customer_id,full_name,is_main_driver)
  values (cust,p->>'customer_name',true) returning id into driver;
  p := p || jsonb_build_object(
    'source','renthub_web_email','renthub_created_from_web',true,
    'source_booking_code',code,'renthub_booking_code',code,
    'vehicle_group',grp,'web_original_price',to_char(price,'FM999999990.00'),
    'web_pending_payment',to_char(pending,'FM999999990.00'),
    'web_price_locked',true,'payment_status',case when pending=0 then 'paid' else 'pending' end,
    'reservation_detail',case when pending=0 then 'Pagada web ' else 'WEB ' end||code,
    'payment_method',case when pending=0 then 'Online' else '' end,
    'rental_price',to_char(price,'FM999999990.00'),'total',to_char(price,'FM999999990.00'));
  insert into public.contracts(customer_id,main_driver_id,status,category,quantity,
    delivery_date,delivery_time,delivery_location,return_date,return_time,return_location,
    rental_days,rental_total,full_insurance,insurance_total,young_driver,young_driver_total,
    discount_percent,vat_percent,total,franchise,payment_method,renthub_contract_id,app_payload)
  values (cust,driver,'draft',nullif(grp,''),1,
    (p->>'pickup_date')::date,(p->>'pickup_time')::time,nullif(p->>'pickup_location',''),
    (p->>'return_date')::date,(p->>'return_time')::time,nullif(p->>'return_location',''),
    greatest(1,(p->>'rental_days')::integer),price,coalesce((p->>'full_insurance')::boolean,false),0,
    coalesce((p->>'young_driver')::boolean,false),0,0,21,price,
    coalesce(nullif(p->>'franchise','')::numeric,0),case when pending=0 then 'Online' end,code,p)
  returning id into cid;
  return jsonb_build_object('id',cid,'created',true);
end;
$fn$;
revoke all on function larios_import.web_booking(jsonb) from public, anon, authenticated;

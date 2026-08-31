create or replace function public.app_contract_record(p_contract_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
select coalesce(c.app_payload,'{}'::jsonb)
 || jsonb_strip_nulls(jsonb_build_object(
  'id',c.id,'contract_number','LR-'||lpad(c.contract_number::text,6,'0'),
  'pickup_at',case when c.delivery_date is not null and c.delivery_time is not null then (c.delivery_date+c.delivery_time) at time zone 'Europe/Madrid' end,
  'return_at',case when c.return_date is not null and c.return_time is not null then (c.return_date+c.return_time) at time zone 'Europe/Madrid' end,
  'status',c.status,'customer_name',cu.full_name,'customer_email',cu.email,'customer_phone',cu.phone,'customer_document',cu.document_number,
  'customer_nationality',cu.nationality,'customer_birth_date',cu.birth_date,'customer_address',cu.address,'driving_license',md.licence_number,
  'license_issued_by',md.licence_country,'license_issue',md.issue_date,'license_expiry',md.expiry_date,'additional_name',ad.full_name,
  'additional_driving_license',ad.licence_number,'additional_license_issued_by',ad.licence_country,'additional_license_issue',ad.issue_date,
  'additional_license_expiry',ad.expiry_date,'additional_birth_date',ad.birth_date,'vehicle_group',c.category,
  'assigned_vehicle_group',v.category,'vehicle_quantity',c.quantity,'vehicle_model',v.model,'vehicle_plate',v.registration,
  'vehicle_color',v.color,'fuel_type',coalesce(v.fuel_type,c.delivery_fuel)))
 || jsonb_strip_nulls(jsonb_build_object(
  'pickup_location',c.delivery_location,'return_location',c.return_location,'km_out',c.delivery_km,'km_in',c.return_km,'fuel_out',c.delivery_fuel,
  'fuel_in',c.return_fuel,'rental_days',c.rental_days,'tariff94',c.season_94,'rental_price',c.rental_total,'full_insurance',c.full_insurance,
  'insurance_total',c.insurance_total,'young_driver',c.young_driver,'young_driver_amount',c.young_driver_total,'discount_percent',c.discount_percent,
  'vat_percent',c.vat_percent,'total',c.total,'deposit',c.deposit,'payment_method',c.payment_method,'renthub_id',c.renthub_contract_id,
  'renthub_sync_status',c.renthub_sync_status,'pdf_path',c.pdf_path,'created_at',c.created_at,'updated_at',c.updated_at))
from public.contracts c
left join public.customers cu on cu.id=c.customer_id
left join public.vehicles v on v.id=c.vehicle_id
left join public.drivers md on md.id=c.main_driver_id
left join lateral (
  select d.* from public.contract_drivers cd join public.drivers d on d.id=cd.driver_id
  where cd.contract_id=c.id and cd.driver_order>=2 order by cd.driver_order,cd.created_at limit 1
) ad on true
where c.id=p_contract_id;
$function$;

create or replace function public.app_save_contract(p_payload jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_contract_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_main_driver_id uuid;
  v_additional_driver_id uuid;
  v_existing_additional_driver_id uuid;
  v_registration text:=nullif(trim(p_payload->>'vehicle_plate'),'');
  v_assigned_group text:=nullif(trim(p_payload->>'assigned_vehicle_group'),'');
  v_safe_payload jsonb;
  v_card_digits text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_contract_id:=nullif(p_payload->>'id','')::uuid;
  if v_contract_id is not null then
    select customer_id,vehicle_id,main_driver_id into v_customer_id,v_vehicle_id,v_main_driver_id
    from public.contracts where id=v_contract_id;
    if not found then raise exception 'Contract not found' using errcode='P0002'; end if;
  end if;

  if v_customer_id is null then
    insert into public.customers(full_name,document_number,nationality,birth_date,address,email,phone)
    values(nullif(p_payload->>'customer_name',''),nullif(p_payload->>'customer_document',''),nullif(p_payload->>'customer_nationality',''),nullif(p_payload->>'customer_birth_date','')::date,nullif(p_payload->>'customer_address',''),nullif(p_payload->>'customer_email',''),nullif(p_payload->>'customer_phone',''))
    returning id into v_customer_id;
  else
    update public.customers set full_name=nullif(p_payload->>'customer_name',''),document_number=nullif(p_payload->>'customer_document',''),nationality=nullif(p_payload->>'customer_nationality',''),birth_date=nullif(p_payload->>'customer_birth_date','')::date,address=nullif(p_payload->>'customer_address',''),email=nullif(p_payload->>'customer_email',''),phone=nullif(p_payload->>'customer_phone',''),updated_at=now() where id=v_customer_id;
  end if;

  if v_registration is not null then
    select id into v_vehicle_id from public.vehicles where registration=v_registration limit 1;
  end if;
  if v_vehicle_id is null then
    insert into public.vehicles(registration,model,fuel_type,color,category)
    values(v_registration,nullif(p_payload->>'vehicle_model',''),nullif(p_payload->>'fuel_type',''),nullif(p_payload->>'vehicle_color',''),v_assigned_group)
    returning id into v_vehicle_id;
  else
    update public.vehicles set registration=coalesce(v_registration,registration),model=coalesce(nullif(p_payload->>'vehicle_model',''),model),fuel_type=coalesce(nullif(p_payload->>'fuel_type',''),fuel_type),color=coalesce(nullif(p_payload->>'vehicle_color',''),color),category=coalesce(v_assigned_group,category),updated_at=now() where id=v_vehicle_id;
  end if;

  if v_main_driver_id is null then
    insert into public.drivers(customer_id,full_name,licence_number,licence_country,birth_date,issue_date,expiry_date,address,is_main_driver)
    values(v_customer_id,nullif(p_payload->>'customer_name',''),nullif(p_payload->>'driving_license',''),nullif(p_payload->>'license_issued_by',''),nullif(p_payload->>'customer_birth_date','')::date,nullif(p_payload->>'license_issue','')::date,nullif(p_payload->>'license_expiry','')::date,nullif(p_payload->>'customer_address',''),true)
    returning id into v_main_driver_id;
  else
    update public.drivers set customer_id=v_customer_id,full_name=nullif(p_payload->>'customer_name',''),licence_number=nullif(p_payload->>'driving_license',''),licence_country=nullif(p_payload->>'license_issued_by',''),birth_date=nullif(p_payload->>'customer_birth_date','')::date,issue_date=nullif(p_payload->>'license_issue','')::date,expiry_date=nullif(p_payload->>'license_expiry','')::date,address=nullif(p_payload->>'customer_address',''),updated_at=now() where id=v_main_driver_id;
  end if;

  v_safe_payload:=p_payload-array['card_number','card_expiry','signature','damage_drawing','id','contract_number','pdf_path'];
  v_card_digits:=regexp_replace(coalesce(p_payload->>'card_number',''),'\D','','g');
  if v_contract_id is null then
    insert into public.contracts(customer_id,vehicle_id,main_driver_id,status,category,quantity,delivery_date,delivery_time,delivery_location,return_date,return_time,return_location,delivery_km,return_km,delivery_fuel,return_fuel,rental_days,season_94,rental_total,full_insurance,insurance_total,young_driver,young_driver_total,discount_percent,vat_percent,total,deposit,payment_method,card_last4,app_payload)
    values(v_customer_id,v_vehicle_id,v_main_driver_id,coalesce(nullif(p_payload->>'status',''),'draft'),nullif(p_payload->>'vehicle_group',''),greatest(1,coalesce(nullif(p_payload->>'vehicle_quantity','')::integer,1)),nullif(p_payload->>'pickup_date','')::date,nullif(p_payload->>'pickup_time','')::time,nullif(p_payload->>'pickup_location',''),nullif(p_payload->>'return_date','')::date,nullif(p_payload->>'return_time','')::time,nullif(p_payload->>'return_location',''),nullif(p_payload->>'km_out','')::integer,nullif(p_payload->>'km_in','')::integer,nullif(p_payload->>'fuel_out',''),nullif(p_payload->>'fuel_in',''),greatest(1,coalesce(nullif(p_payload->>'rental_days','')::integer,1)),coalesce(nullif(p_payload->>'tariff94','')::boolean,false),coalesce(nullif(p_payload->>'rental_price','')::numeric,0),coalesce(nullif(p_payload->>'full_insurance','')::boolean,false),coalesce(nullif(p_payload->>'insurance_total','')::numeric,0),coalesce(nullif(p_payload->>'young_driver','')::boolean,false),coalesce(nullif(p_payload->>'young_driver_amount','')::numeric,0),coalesce(nullif(p_payload->>'discount_percent','')::numeric,0),coalesce(nullif(p_payload->>'vat_percent','')::numeric,21),coalesce(nullif(p_payload->>'total','')::numeric,0),coalesce(nullif(p_payload->>'deposit','')::numeric,0),nullif(p_payload->>'payment_method',''),case when length(v_card_digits)>=4 then right(v_card_digits,4) end,v_safe_payload)
    returning id into v_contract_id;
  else
    update public.contracts set customer_id=v_customer_id,vehicle_id=v_vehicle_id,main_driver_id=v_main_driver_id,status=coalesce(nullif(p_payload->>'status',''),status),category=nullif(p_payload->>'vehicle_group',''),quantity=greatest(1,coalesce(nullif(p_payload->>'vehicle_quantity','')::integer,1)),delivery_date=nullif(p_payload->>'pickup_date','')::date,delivery_time=nullif(p_payload->>'pickup_time','')::time,delivery_location=nullif(p_payload->>'pickup_location',''),return_date=nullif(p_payload->>'return_date','')::date,return_time=nullif(p_payload->>'return_time','')::time,return_location=nullif(p_payload->>'return_location',''),delivery_km=nullif(p_payload->>'km_out','')::integer,return_km=nullif(p_payload->>'km_in','')::integer,delivery_fuel=nullif(p_payload->>'fuel_out',''),return_fuel=nullif(p_payload->>'fuel_in',''),rental_days=greatest(1,coalesce(nullif(p_payload->>'rental_days','')::integer,1)),season_94=coalesce(nullif(p_payload->>'tariff94','')::boolean,false),rental_total=coalesce(nullif(p_payload->>'rental_price','')::numeric,0),full_insurance=coalesce(nullif(p_payload->>'full_insurance','')::boolean,false),insurance_total=coalesce(nullif(p_payload->>'insurance_total','')::numeric,0),young_driver=coalesce(nullif(p_payload->>'young_driver','')::boolean,false),young_driver_total=coalesce(nullif(p_payload->>'young_driver_amount','')::numeric,0),discount_percent=coalesce(nullif(p_payload->>'discount_percent','')::numeric,0),vat_percent=coalesce(nullif(p_payload->>'vat_percent','')::numeric,21),total=coalesce(nullif(p_payload->>'total','')::numeric,0),deposit=coalesce(nullif(p_payload->>'deposit','')::numeric,0),payment_method=nullif(p_payload->>'payment_method',''),card_last4=case when length(v_card_digits)>=4 then right(v_card_digits,4) else card_last4 end,app_payload=v_safe_payload,updated_at=now() where id=v_contract_id;
  end if;

  if coalesce(nullif(p_payload->>'additional_name',''),nullif(p_payload->>'additional_driving_license','')) is not null then
    select cd.driver_id into v_existing_additional_driver_id from public.contract_drivers cd where cd.contract_id=v_contract_id and cd.driver_order>=2 order by cd.driver_order,cd.created_at limit 1;
    if v_existing_additional_driver_id is null then
      insert into public.drivers(full_name,licence_number,licence_country,birth_date,issue_date,expiry_date,is_main_driver)
      values(nullif(p_payload->>'additional_name',''),nullif(p_payload->>'additional_driving_license',''),nullif(p_payload->>'additional_license_issued_by',''),nullif(p_payload->>'additional_birth_date','')::date,nullif(p_payload->>'additional_license_issue','')::date,nullif(p_payload->>'additional_license_expiry','')::date,false)
      returning id into v_additional_driver_id;
      insert into public.contract_drivers(contract_id,driver_id,driver_order) values(v_contract_id,v_additional_driver_id,2);
    else
      update public.drivers set full_name=nullif(p_payload->>'additional_name',''),licence_number=nullif(p_payload->>'additional_driving_license',''),licence_country=nullif(p_payload->>'additional_license_issued_by',''),birth_date=nullif(p_payload->>'additional_birth_date','')::date,issue_date=nullif(p_payload->>'additional_license_issue','')::date,expiry_date=nullif(p_payload->>'additional_license_expiry','')::date,updated_at=now() where id=v_existing_additional_driver_id;
    end if;
  end if;
  return public.app_contract_record(v_contract_id);
end;
$function$;

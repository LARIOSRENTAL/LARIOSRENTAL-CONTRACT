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
  'vat_percent',c.vat_percent,'total',c.total,'deposit',c.deposit,'payment_method',c.payment_method,'card_last4',c.card_last4,
  'card_expiry_month',c.card_expiry_month,'card_expiry_year',c.card_expiry_year,'renthub_id',c.renthub_contract_id,
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

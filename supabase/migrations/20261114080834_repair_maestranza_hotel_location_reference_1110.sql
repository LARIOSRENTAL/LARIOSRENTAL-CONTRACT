update public.contracts
set delivery_location='MAESTRANZA HOTEL',return_location='MAESTRANZA HOTEL',
 app_payload=jsonb_set(jsonb_set(app_payload,'{pickup_location}','"MAESTRANZA HOTEL"'::jsonb,true),
  '{return_location}','"MAESTRANZA HOTEL"'::jsonb,true)
where contract_number=64059 and status='draft'
and app_payload->>'whatsapp_message'='09.30 MAESTRANZA GA  3 DIAS #1110';

CREATE OR REPLACE FUNCTION public.tablet_submit(p_token text, p_job_id uuid, p_response jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_device uuid;
  v_contract uuid;
  v_customer uuid;
begin
  select id into v_device
  from public.customer_tablet_devices
  where token_hash = encode(digest(p_token,'sha256'),'hex')
    and active = true;

  if v_device is null then
    raise exception 'Tablet no registrada';
  end if;

  update public.customer_tablet_jobs
  set status = 'completed',
      response = coalesce(p_response,'{}'::jsonb),
      completed_at = now()
  where id = p_job_id
    and device_id = v_device
    and status = 'pending'
  returning contract_id into v_contract;

  if not found then
    return false;
  end if;

  if v_contract is not null then
    select customer_id into v_customer
    from public.contracts
    where id=v_contract;

    if v_customer is not null then
      update public.customers
      set
        phone = case when p_response ? 'customer_phone'
          then nullif(trim(p_response->>'customer_phone'),'') else phone end,
        email = case when p_response ? 'customer_email'
          then nullif(trim(p_response->>'customer_email'),'') else email end,
        address = case when p_response ? 'customer_address'
          then nullif(trim(p_response->>'customer_address'),'') else address end,
        updated_at = now()
      where id=v_customer;
    end if;

    update public.contracts
    set
      full_insurance = case
        when p_response ? 'full_insurance'
          then coalesce((p_response->>'full_insurance')::boolean, false)
        else full_insurance
      end,
      insurance_total = case
        when p_response ? 'insurance_total'
          then coalesce((p_response->>'insurance_total')::numeric, insurance_total)
        else insurance_total
      end,
      franchise = case
        when p_response ? 'franchise'
          then coalesce((p_response->>'franchise')::numeric, franchise)
        else franchise
      end,
      total = case
        when p_response ? 'total'
          then coalesce((p_response->>'total')::numeric, total)
        else total
      end,
      updated_at = now(),
      app_payload = (coalesce(app_payload,'{}'::jsonb) - case
        when p_response ? 'customer_address' and jsonb_typeof(p_response->'customer_address_parts') is distinct from 'object'
        then 'customer_address_parts' else '' end) ||
        jsonb_strip_nulls(jsonb_build_object(
          'customer_phone', case when p_response ? 'customer_phone' then p_response->'customer_phone' else null end,
          'customer_email', case when p_response ? 'customer_email' then p_response->'customer_email' else null end,
          'customer_address', case when p_response ? 'customer_address' then p_response->'customer_address' else null end,
          'customer_address_parts', case when jsonb_typeof(p_response->'customer_address_parts')='object' then p_response->'customer_address_parts' else null end,
          'full_insurance', case when p_response ? 'full_insurance' then p_response->'full_insurance' else null end,
          'insurance_total', case when p_response ? 'insurance_total' then p_response->'insurance_total' else null end,
          'franchise', case when p_response ? 'franchise' then p_response->'franchise' else null end,
          'total', case when p_response ? 'total' then p_response->'total' else null end,
          'client_data_checked', case when p_response ? 'data_checked' then p_response->'data_checked' else null end,
          'client_terms_accepted', case when p_response ? 'accepted_terms' then p_response->'accepted_terms' else null end,
          'client_terms_accepted_at', case when p_response ? 'accepted_terms_at' then p_response->'accepted_terms_at' else null end,
          'client_conditions_url', case when p_response ? 'conditions_url' then p_response->'conditions_url' else null end,
          'client_signature_data_url', case when p_response ? 'signature_data_url' then p_response->'signature_data_url' else null end
        ))
    where id = v_contract;
  end if;

  return true;
end;
$function$;

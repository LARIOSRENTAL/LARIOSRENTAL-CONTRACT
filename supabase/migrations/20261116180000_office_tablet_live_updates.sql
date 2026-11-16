create or replace function public.tablet_update(
  p_token text,
  p_job_id uuid,
  p_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_device uuid;
  v_response jsonb;
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception 'Datos de tablet no válidos';
  end if;

  select id into v_device
  from public.customer_tablet_devices
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and active = true;

  if v_device is null then
    raise exception 'Tablet no registrada';
  end if;

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'customer_phone', p_response->'customer_phone',
    'customer_email', p_response->'customer_email',
    'customer_address', p_response->'customer_address',
    'customer_address_parts', case
      when jsonb_typeof(p_response->'customer_address_parts') = 'object'
        then p_response->'customer_address_parts'
      else null
    end,
    'full_insurance', p_response->'full_insurance',
    'insurance_total', p_response->'insurance_total',
    'franchise', p_response->'franchise',
    'total', p_response->'total',
    'accepted_terms', p_response->'accepted_terms',
    'has_signature', p_response->'has_signature'
  ));

  update public.customer_tablet_jobs
  set response = coalesce(response, '{}'::jsonb) || v_response
  where id = p_job_id
    and device_id = v_device
    and status = 'pending';

  return found;
end;
$function$;

revoke all on function public.tablet_update(text, uuid, jsonb) from public;
grant execute on function public.tablet_update(text, uuid, jsonb) to anon, authenticated;

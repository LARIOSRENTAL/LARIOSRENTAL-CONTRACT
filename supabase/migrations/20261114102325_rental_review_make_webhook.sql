
create schema if not exists private;
create table private.review_webhook_deliveries (
 contract_id uuid primary key,
 event_id text not null unique,
 request_id bigint,
 queued_at timestamptz not null default now(),
 last_error text
);
alter table private.review_webhook_deliveries enable row level security;
revoke all on private.review_webhook_deliveries from public, anon, authenticated;
create or replace function private.notify_rental_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 p jsonb := coalesce(new.app_payload,'{}'::jsonb);
 endpoint text;
 payload jsonb;
 request bigint;
 inserted integer;
begin
 if new.status <> 'confirmed' or nullif(btrim(new.pdf_path),'') is null then return new; end if;
 -- Only a first generated PDF qualifies; later edits/regeneration must not resend.
 if tg_op='UPDATE' and old.status='confirmed' and nullif(btrim(old.pdf_path),'') is not null then return new; end if;
 select value into endpoint from public.internal_settings where key='rental_review_make_webhook_url';
 if nullif(endpoint,'') is null then return new; end if;
 insert into private.review_webhook_deliveries(contract_id,event_id)
 values(new.id,'contract.generated:'||new.id::text)
 on conflict(contract_id) do nothing;
 get diagnostics inserted = row_count;
 if inserted=0 then return new; end if;
 payload := jsonb_build_object(
  'event','contract.generated','schema_version',1,'is_test',false,
  'event_id','contract.generated:'||new.id::text,
  'generated_at',now(),'timezone','Europe/Madrid',
  'contract_id',new.id,'contract_number','LR-'||lpad(new.contract_number::text,6,'0'),
  'customer_name',coalesce(nullif(p->>'customer_name',''),(select full_name from public.customers where id=new.customer_id)),
  'customer_email',coalesce(nullif(p->>'customer_email',''),(select email from public.customers where id=new.customer_id)),
  'customer_phone',coalesce(nullif(p->>'customer_phone',''),(select phone from public.customers where id=new.customer_id)),
  'customer_nationality',coalesce(nullif(p->>'customer_nationality',''),(select nationality from public.customers where id=new.customer_id)),
  'pickup_date',new.delivery_date,'pickup_time',new.delivery_time,'pickup_location',new.delivery_location,
  'return_date',new.return_date,'return_time',new.return_time,'return_location',new.return_location,
  'vehicle_group',new.category,'vehicle_quantity',new.quantity,
  'vehicle_model',coalesce(nullif(p->>'vehicle_model',''),(select concat_ws(' ',make,model) from public.vehicles where id=new.vehicle_id)),
  'vehicle_plate',coalesce(nullif(p->>'vehicle_plate',''),(select registration from public.vehicles where id=new.vehicle_id)),
  'rental_days',new.rental_days,'rental_total',new.rental_total,'insurance_total',new.insurance_total,
  'full_insurance',new.full_insurance,'total',new.total,'currency','EUR',
  'service_email_notice_acknowledged',p->'service_email_notice_acknowledged',
  'commercial_information_opt_out',new.commercial_information_opt_out
 );
 select net.http_post(url:=endpoint,headers:='{"Content-Type":"application/json"}'::jsonb,body:=payload,timeout_milliseconds:=10000) into request;
 update private.review_webhook_deliveries set request_id=request where contract_id=new.id;
 return new;
exception when others then
 -- Do not make a Make failure prevent saving a rental contract.
 insert into private.review_webhook_deliveries(contract_id,event_id,last_error)
 values(new.id,'contract.generated:'||new.id::text,sqlstate||': '||sqlerrm)
 on conflict(contract_id) do update set last_error=excluded.last_error;
 return new;
end;
$$;
revoke all on function private.notify_rental_review() from public, anon, authenticated;
create trigger trg_rental_review_make
after insert or update of status,pdf_path on public.contracts
for each row execute function private.notify_rental_review();
comment on table private.review_webhook_deliveries is 'One Make review event per newly generated rental contract. Request IDs correlate with net._http_response. No historical backfill.';

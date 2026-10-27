-- Restore the established quantity rule for bicycles and e-bikes:
-- one reservation with quantity N. Cars and motorcycles still create one
-- independent contract per unit/driver.

do $do$
declare
  v_def text;
  v_old text := $old$
  v_group_count:=cardinality(v_groups);
  v_group_units:=v_qty;
  v_units:=v_group_count*v_group_units;
  v_unit_qty:=1;
$old$;
  v_new text := $new$
  v_group_count:=cardinality(v_groups);
  -- Cars and motorcycles require one independent contract per unit.
  -- Bicycles and e-bikes stay in one reservation and preserve their quantity.
  if v_group_count=1 and v_group in ('BICICLETA','E-BIKE') then
    v_group_units:=1;
    v_units:=1;
    v_unit_qty:=v_qty;
  else
    v_group_units:=v_qty;
    v_units:=v_group_count*v_group_units;
    v_unit_qty:=1;
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='larios_whatsapp_process'
    and pg_get_function_identity_arguments(p.oid)='p_chat text, p_id text, p_token text';

  if v_def is null then
    raise exception 'larios_whatsapp_process not found';
  end if;

  if position(v_new in v_def)>0 then
    return;
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'expected WhatsApp quantity block not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$do$;

-- Repair any still-open bicycle/e-bike reservations split by the regression.
with groups as (
  select
    c.app_payload->>'source_whatsapp_message_id' as source_id,
    min(c.contract_number) as keep_contract,
    max((c.app_payload->>'source_whatsapp_unit_count')::int) as requested_quantity
  from public.contracts c
  where c.app_payload->>'source'='whatsapp_group'
    and upper(c.category) in ('BICICLETA','E-BIKE')
    and nullif(c.app_payload->>'source_whatsapp_unit_count','') is not null
    and c.status='draft'
    and c.pdf_path is null
    and c.renthub_contract_id is null
  group by c.app_payload->>'source_whatsapp_message_id'
  having count(*)>1
),
cleaned as (
  select
    c.id,
    g.requested_quantity,
    public.app_prepare_reservation_price(
      jsonb_set(
        jsonb_set(
          c.app_payload
            - 'source_whatsapp_unit_index'
            - 'source_whatsapp_unit_count'
            - 'rental_price'
            - 'base_tariff_price'
            - 'total'
            - 'price_source',
          '{vehicle_quantity}',to_jsonb(g.requested_quantity),true
        ),
        '{reservation_detail}',
        to_jsonb(trim(regexp_replace(
          coalesce(c.app_payload->>'reservation_detail',''),
          '( · )?UNIDAD [0-9]+ DE [0-9]+$','','i'
        ))),
        true
      )
    ) as payload
  from public.contracts c
  join groups g on g.keep_contract=c.contract_number
),
updated as (
  update public.contracts c
  set quantity=x.requested_quantity,
      rental_total=(x.payload->>'rental_price')::numeric,
      total=(x.payload->>'total')::numeric,
      app_payload=x.payload,
      updated_at=now()
  from cleaned x
  where c.id=x.id
  returning c.contract_number
)
update public.contracts c
set status='cancelled',
    app_payload=(c.app_payload - 'source_whatsapp_unit_index' - 'source_whatsapp_unit_count')
      || jsonb_build_object(
        'cancel_reason','Reserva duplicada por división incorrecta de bicicletas',
        'superseded_by_contract_number',g.keep_contract
      ),
    updated_at=now()
from groups g
where c.app_payload->>'source_whatsapp_message_id'=g.source_id
  and c.contract_number<>g.keep_contract
  and c.status='draft'
  and c.pdf_path is null
  and c.renthub_contract_id is null;

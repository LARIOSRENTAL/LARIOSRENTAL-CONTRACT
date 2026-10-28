do $test$
declare
  v jsonb;
begin
  v := larios_import.recover_compact_bicycle_time_quantity(
    '11002 bicis un día bro 408',
    '{"kind":"booking_candidate","pickup_time":"11:00","vehicle_group":"BICICLETA","vehicle_quantity":11002,"review_reasons":[]}'::jsonb
  );
  if v->>'pickup_time' <> '11:00'
     or v->>'vehicle_group' <> 'BICICLETA'
     or v->>'vehicle_quantity' <> '2'
  then
    raise exception '11002 bicycle format failed: %', v;
  end if;

  v := larios_import.recover_compact_bicycle_time_quantity(
    '9002 bicis un día bro 408',
    '{"kind":"booking_candidate","vehicle_quantity":9002,"review_reasons":["falta hora explícita"]}'::jsonb
  );
  if v->>'pickup_time' <> '09:00'
     or v->>'vehicle_quantity' <> '2'
     or v->'review_reasons' <> '[]'::jsonb
  then
    raise exception '9002 bicycle format failed: %', v;
  end if;

  v := larios_import.recover_compact_bicycle_time_quantity(
    '2 bicis un día bro 408',
    '{"kind":"booking_candidate","vehicle_quantity":2}'::jsonb
  );
  if v ? 'pickup_time' then
    raise exception 'Separated quantity must not invent a time: %', v;
  end if;
end;
$test$;

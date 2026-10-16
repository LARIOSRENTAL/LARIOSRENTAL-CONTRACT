BEGIN;

DO $test$
DECLARE v jsonb; base jsonb:='{"kind":"booking_candidate","rental_days":1,"review_reasons":["falta grupo explícito"]}';
BEGIN
 v:=larios_import.recover_compact_scooter_booking('17 30 30 50 CC2 días Camper La Cala, XXL5',base);
 IF v->>'pickup_time'<>'17:30' OR v->>'vehicle_group'<>'50CC' OR v->>'rental_days'<>'2' OR v->>'pickup_location_hint'<>'Camper La Cala' OR v->>'customer_reference_hint'<>'XXL5' OR v->'review_reasons'<>'[]'::jsonb THEN RAISE EXCEPTION 'Exact message failed: %',v; END IF;
 IF larios_import.recover_compact_scooter_booking('17 30 45 50 CC2 días Camper La Cala, XXL5',base)<>base THEN RAISE EXCEPTION 'Different minutes must not be guessed'; END IF;
 IF larios_import.recover_compact_scooter_booking('17 30 30 50 CC2 días Camper La Cala, XXL5',base||'{"kind":"cancellation"}')<>base||'{"kind":"cancellation"}' THEN RAISE EXCEPTION 'Cancellation changed'; END IF;
 IF larios_import.recover_compact_scooter_booking('recogidas bicis 5 13 y 21 mlga centro',base)<>base THEN RAISE EXCEPTION 'Return message changed'; END IF;
 v:=larios_import.recover_compact_scooter_booking('09:15 125cc3 dias Hotel Test, 204',base);
 IF v->>'vehicle_group'<>'125CC' OR v->>'rental_days'<>'3' OR v->>'pickup_time'<>'09:15' THEN RAISE EXCEPTION 'Normal compact input failed'; END IF;
END $test$;

ROLLBACK;

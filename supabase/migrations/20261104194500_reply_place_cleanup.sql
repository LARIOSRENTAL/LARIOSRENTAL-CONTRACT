DO $patch$
declare d text;
begin
d:=pg_get_functiondef('public.larios_whatsapp_apply_reply_amendment(text,text,text)'::regprocedure);
d:=replace(d,'  -- Special natural-language time/date amendments, including weekday changes.', $insert$
  -- A reply containing a quoted booking and a final known place replaces the place only.
  if exists (
    select 1 from public.collaborator_aliases a
    where lower(trim(a.alias))=lower(trim(regexp_replace(v_msg.raw_text,E'^.*\\n','','s')))
  ) and v_msg.raw_text like E'%\n%' then
    v:=v || jsonb_build_object(
      'pickup_location_hint',trim(regexp_replace(v_msg.raw_text,E'^.*\\n','','s')),
      'customer_reference_hint',coalesce(nullif(v_src.candidate->>'customer_reference_hint',''),
        'REFERENCIA '||substring(v_src.candidate->>'pickup_location_hint' from '([0-9]+)[[:space:]]*$')));
  end if;
  v:=public.lr_whatsapp_normalize_location_candidate(v_msg.raw_text,v);
  -- Special natural-language time/date amendments, including weekday changes.
$insert$);
d:=replace(d,'  if v_new_group is not null then v_payload', $insert$
  if nullif(v->>'customer_reference_hint','') is not null then
    v_payload:=v_payload || jsonb_build_object('customer_reference_hint',v->>'customer_reference_hint');
  end if;
  if v_new_group is not null then v_payload
$insert$);
execute d;
end $patch$;
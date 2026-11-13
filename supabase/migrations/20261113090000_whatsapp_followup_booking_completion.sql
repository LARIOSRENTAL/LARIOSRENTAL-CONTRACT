-- Keep WhatsApp booking recovery rules in source control and make them safe to reapply.
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);

  -- Structured booking templates contain the label "Fecha de recogida".
  -- Do not classify that field label as a vehicle-return command.
  v_old := 'if v_row.raw_text ~* ''(^|[^[:alpha:]])(entra|entran|recogid[oa]s?|tarda|tardan)([^[:alpha:]]|$)'' then';
  v_new := 'if v_row.raw_text !~* ''(veh[ií]culo|vehicle)[[:space:]]*:'' and v_row.raw_text ~* ''(^|[^[:alpha:]])(entra|entran|recogid[oa]s?|tarda|tardan)([^[:alpha:]]|$)'' then';
  if position(v_new in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'WhatsApp return guard was not found; refusing to apply partial migration';
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('larios_import.lr_whatsapp_merge_pending_context(text,text,jsonb)'::regprocedure);

  -- A candidate location containing booking language (e.g. "coche tipo J
  -- por un día") is not a usable pickup location; allow the next group
  -- message to supply the real location/collaborator.
  v_old := 'or upper(v_parent_loc) like ''REFERENCIA %'';';
  v_new := 'or upper(v_parent_loc) like ''REFERENCIA %''
    or v_parent_loc ~* ''(coche[[:space:]]+tipo|por[[:space:]]+(un[[:space:]]+)?d[ií]a|a[[:space:]]+las|mañana)'';';
  if position(v_new in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'WhatsApp location validator was not found; refusing to apply partial migration';
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.larios_whatsapp_process(text,text,text)'::regprocedure);

  -- Allow an incomplete review candidate to be reprocessed when a consecutive
  -- message arrives, so the existing context merger can complete it.
  v_old := 'if v_row.status<>''pending'' then';
  v_new := 'if v_row.status<>''pending'' and not (v_row.status=''review'' and v_row.reason=''web_or_incomplete'') then';
  if position(v_new in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'WhatsApp review status gate was not found; refusing to apply partial migration';
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
  end if;
end
$migration$;

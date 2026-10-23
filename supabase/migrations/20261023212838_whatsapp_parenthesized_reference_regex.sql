-- Correctly match parenthesized WhatsApp comments in the place field.

CREATE OR REPLACE FUNCTION public.lr_whatsapp_normalize_location_candidate(p_raw text, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb:=coalesce(p_candidate,'{}'::jsonb);
  v_loc text:=trim(coalesce(v->>'pickup_location_hint',''));
  v_agency text:=trim(coalesce(v->>'agency_hint',''));
  v_ref text:=coalesce(v->>'customer_reference_hint','');
  v_refnum text;
  v_loc_norm text;
  v_agency_norm text;
  v_raw_norm text:=upper(translate(coalesce(p_raw,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_other_place text;
  v_comment text;
begin
  v_loc:=regexp_replace(v_loc,'^(hoy|manana|mañana)[[:space:]]+','','i');
  v_loc:=regexp_replace(v_loc,'^(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)[[:space:]]+','','i');

  if v_ref='' then
    v_refnum:=substring(coalesce(p_raw,'') from '(?:^|[[:space:]])[-#]([0-9]{2,4})(?:[[:space:]]|$)');
    if v_refnum is not null then v_ref:='REFERENCIA '||v_refnum; end if;
  end if;

  v_loc:=regexp_replace(v_loc,'^[[:space:]]*[-#]?[0-9]{2,4}[[:space:]]*','','i');
  v_loc:=trim(regexp_replace(v_loc,'[[:space:]]+',' ','g'));

  v_comment:=substring(v_loc from '\(([^()]*)\)');
  if v_comment is not null then
    v_loc:=trim(regexp_replace(v_loc,'[[:space:]]*\([^()]*\)[[:space:]]*',' ','g'));
    v_comment:=trim(both ' .;,-' from v_comment);
    if v_comment<>'' then
      v_ref:=concat_ws(' · ',nullif(trim(v_ref),''),v_comment);
    end if;
  end if;

  v_loc_norm:=upper(translate(v_loc,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));
  v_agency_norm:=upper(translate(v_agency,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'));

  if v_agency_norm='CITY EXPERT' then
    -- CITY EXPERT is only a collaborator and can never be a physical delivery/return place.
    if v_loc_norm='CITY EXPERT' or v_loc='' then
      v_loc:='';
    end if;

    -- Prefer another known collaborator/hotel/place mentioned in the same message.
    select c.name into v_other_place
    from public.collaborator_aliases a
    join public.collaborators c on c.id=a.collaborator_id
    where c.active
      and upper(c.name)<>'CITY EXPERT'
      and length(trim(a.normalized_alias))>=3
      and v_raw_norm like '%'||upper(a.normalized_alias)||'%'
    order by length(a.normalized_alias) desc
    limit 1;

    if v_other_place is not null then
      v_loc:=v_other_place;
    elsif v_raw_norm ~ '(^|[^A-Z])C/?CISTER([^A-Z]|$)' or v_raw_norm ~ '(^|[^A-Z])CISTER([^A-Z]|$)' then
      v_loc:='CISTER';
    elsif v_raw_norm ~ '(^|[^A-Z])OFI(CINA)?([^A-Z]|$)' then
      v_loc:='OFICINA';
    elsif v_raw_norm ~ '(^|[^A-Z])AEROPUERTO([^A-Z]|$)' then
      v_loc:='AEROPUERTO';
    elsif v_loc_norm='CITY EXPERT' then
      v_loc:='';
    end if;
  elsif v_agency<>'' and upper(v_agency)<>'PARTICULAR' then
    if v_loc='' or v_loc ~ '^[-#]?[0-9]{2,4}$'
       or v_agency_norm like '%'||v_loc_norm||'%'
       or v_loc_norm like '%'||v_agency_norm||'%' then
      v_loc:=v_agency;
    end if;
  end if;

  v:=jsonb_set(v,'{pickup_location_hint}',to_jsonb(v_loc),true);
  if v_ref<>'' then
    v:=jsonb_set(v,'{customer_reference_hint}',to_jsonb(v_ref),true);
  end if;
  return v;
end
$function$
;

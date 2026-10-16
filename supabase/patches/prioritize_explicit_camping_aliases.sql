CREATE OR REPLACE FUNCTION public.larios_whatsapp_resolve_agency(p_text text, p_hint text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_start timestamptz; v_text text; v_hint text; v_name text; v_alias text;
begin
 select enabled_since into v_start from larios_import.whatsapp_bridge_token
 where name='group_bridge' and active and token_sha256=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
 if v_start is null then raise exception 'Unauthorized'; end if;
 v_text:=public.lr_normalize_partner_name(upper(coalesce(p_text,'')));
 v_hint:=public.lr_normalize_partner_name(upper(coalesce(p_hint,'')));
 if v_text ~ '(^| )(SIN|NO) COMISION(ES)?( |$)' then
  return jsonb_build_object('agency','PARTICULAR','source','explicit_no_commission','commission_excluded',true);
 end if;

 select c.name,ca.alias into v_name,v_alias
 from public.collaborator_aliases ca join public.collaborators c on c.id=ca.collaborator_id and c.active
 where ca.normalized_alias<>'' and (ca.normalized_alias=v_hint or (' '||v_text||' ') like ('% '||ca.normalized_alias||' %'))
 and (c.name<>'JORGE TAXI' or v_text ~ '(^| )(JORGE TAXI|TAXISTA JORGE|JORGE TAXISTA)( |$)')
 order by case when c.name='CITY EXPERT' then 0 else 1 end,
          case when ca.normalized_alias in ('CAMPER CALA','CAMPER LA CALA','CAMPER RINCON','CAMPER EL RINCON')
            and (' '||v_text||' ') like ('% '||ca.normalized_alias||' %') then 0 else 1 end,
          case when ca.normalized_alias=v_hint then 0 else 1 end,
          length(ca.normalized_alias) desc,c.name limit 1;
 if v_name is not null then
  return jsonb_build_object('agency',v_name,'source','alias_match','matched_alias',v_alias,'commission_excluded',false);
 end if;

 with candidates as (
  select distinct c.id,c.name,ca.alias,
    greatest(
      case when v_hint<>'' and length(v_hint)>=4 and (' '||ca.normalized_alias||' ') like ('% '||v_hint||' %') then length(v_hint) else 0 end,
      coalesce((select max(length(t)) from pg_catalog.regexp_split_to_table(v_text,'[^A-Z0-9]+') t
        where length(t)>=4 and t not in ('HOTEL','HOSTAL','HOSTEL','APART','APRT','APTO','APARTAMENTO','APARTAMENTOS','MALAGA','CENTRO','SOHO','BOUTIQUE','CITY','CLUB','SUITE','SUITES','PREMIUM','GUEST','HOUSE','HOUSES','VILLA','TRAVEL','PLAYA','CALLE','ROOM','ROOMS','BUDGET','GOLF','HOME','HOMES')
          and (' '||ca.normalized_alias||' ') like ('% '||t||' %')),0)
    ) score
  from public.collaborators c join public.collaborator_aliases ca on ca.collaborator_id=c.id
  where c.active and ca.normalized_alias<>'' and c.name<>'JORGE TAXI'
 ), best as (select * from candidates where score>=4 order by case when name='CITY EXPERT' then 0 else 1 end,score desc,length(alias) desc,name limit 2)
 select name,alias into v_name,v_alias from best
 where (select count(distinct id) from best where score=(select max(score) from best))=1
 order by score desc limit 1;

 if v_name is not null then
  return jsonb_build_object('agency',v_name,'source','partial_collaborator_match','matched_alias',v_alias,'commission_excluded',false);
 end if;
 return jsonb_build_object('agency','PARTICULAR','source','no_collaborator_match','commission_excluded',true);
end;$function$;

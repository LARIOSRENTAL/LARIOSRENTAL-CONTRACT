begin;
insert into public.collaborator_aliases(collaborator_id,alias,normalized_alias)
select c.id,v.alias,public.lr_normalize_partner_name(v.alias)
from public.collaborators c cross join (values ('taxista jorge'),('jorge taxista')) v(alias)
where c.id='54118082-4c44-40a5-afeb-2673c92e5509' and c.name='JORGE TAXI' and c.active
on conflict(normalized_alias) do nothing;
do $patch$
declare body text; original text;
begin
select pg_get_functiondef('public.larios_whatsapp_resolve_agency(text,text,text)'::regprocedure) into original;
body:=replace(original,
$where$where ca.normalized_alias<>'' and (ca.normalized_alias=v_hint or (' '||v_text||' ') like ('% '||ca.normalized_alias||' %'))$where$,
$where$where ca.normalized_alias<>'' and (ca.normalized_alias=v_hint or (' '||v_text||' ') like ('% '||ca.normalized_alias||' %'))
 and (c.name<>'JORGE TAXI' or v_text ~ '(^| )(JORGE TAXI|TAXISTA JORGE|JORGE TAXISTA)( |$)')$where$);
body:=replace(body,
$where$where c.active and ca.normalized_alias<>''$where$,
$where$where c.active and ca.normalized_alias<>'' and c.name<>'JORGE TAXI'$where$);
if body=original or position($guard$and (c.name<>'JORGE TAXI' or v_text ~$guard$ in body)=0
 or position($guard$where c.active and ca.normalized_alias<>'' and c.name<>'JORGE TAXI'$guard$ in body)=0 then
 raise exception 'Resolver changed; inspect before applying';
end if;
execute body;
end $patch$;
commit;

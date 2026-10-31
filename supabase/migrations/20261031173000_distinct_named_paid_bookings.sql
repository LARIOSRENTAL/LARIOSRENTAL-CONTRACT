create or replace function larios_import.booking_duplicate_match(
  p_phone_a text, p_name_a text, p_place_a text, p_ref_a text,
  p_phone_b text, p_name_b text, p_place_b text, p_ref_b text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $function$
declare
  a_phone text := pg_catalog.regexp_replace(coalesce(p_phone_a,''),'[^0-9]','','g');
  b_phone text := pg_catalog.regexp_replace(coalesce(p_phone_b,''),'[^0-9]','','g');
  a_name text := pg_catalog.upper(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(coalesce(p_name_a,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),
    '[[:space:]]+',' ','g')));
  b_name text := pg_catalog.upper(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(coalesce(p_name_b,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),
    '[[:space:]]+',' ','g')));
  a_ref text := pg_catalog.upper(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(coalesce(p_ref_a,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),
    '^(REFERENCIA|REF[.]?|HABITACION|HAB[.]?)[[:space:]#:.-]*','', 'i')));
  b_ref text := pg_catalog.upper(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(coalesce(p_ref_b,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'),
    '^(REFERENCIA|REF[.]?|HABITACION|HAB[.]?)[[:space:]#:.-]*','', 'i')));
  a_specific boolean;
  b_specific boolean;
begin
  a_ref := pg_catalog.regexp_replace(a_ref,'[^A-Z0-9-]','','g');
  b_ref := pg_catalog.regexp_replace(b_ref,'[^A-Z0-9-]','','g');
  a_specific := a_name <> '' and a_name not in ('PARTICULAR','PENDIENTE LARIOS RENTAL','CITY EXPERT');
  b_specific := b_name <> '' and b_name not in ('PARTICULAR','PENDIENTE LARIOS RENTAL','CITY EXPERT');

  return
    (a_ref<>'' and b_ref<>'' and a_ref=b_ref)
    or
    (a_name<>'' and b_name<>'' and a_name=b_name and a_name<>'PENDIENTE LARIOS RENTAL')
    or
    (
      length(a_phone)>=9 and length(b_phone)>=9 and right(a_phone,9)=right(b_phone,9)
      and not (a_specific and b_specific and a_name<>b_name)
    );
end;
$function$;

comment on function larios_import.booking_duplicate_match(text,text,text,text,text,text,text,text)
is 'Prevents true duplicate WhatsApp bookings while allowing distinct named customers that share an agency telephone, date and time.';

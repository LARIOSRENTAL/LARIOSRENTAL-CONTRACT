DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('larios_import.whatsapp_has_valid_time_expression(text)'::regprocedure);
 IF position('compact bicycle time' in d)=0 THEN
 d:=replace(d,'  return false;', E'  -- compact bicycle time and quantity already normalized by the candidate parser\n  if v ~ ''^([01]?[0-9]|2[0-3])[0-5][0-9][1-9][[:space:]]*(bicis?|bicicletas?|e-?bikes?)([^a-z]|$)'' then return true; end if;\n  return false;');
 EXECUTE d;
 END IF;
END $patch$;

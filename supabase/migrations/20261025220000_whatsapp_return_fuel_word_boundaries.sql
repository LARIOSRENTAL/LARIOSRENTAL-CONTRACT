do $$
declare
 v_def text;
begin
 v_def:=pg_get_functiondef('public.larios_whatsapp_apply_return_internal(text,text)'::regprocedure);
 v_def:=replace(v_def,'(^|[^0-9])[+-]?[1-3][[:space:]]*/[[:space:]]*[24]([^0-9]|$)','(^|[^[:alnum:]])[+-]?[1-3][[:space:]]*/[[:space:]]*[24]([^[:alnum:]]|$)');
 v_def:=replace(v_def,'(^|[^0-9])([+-]?[1-3][[:space:]]*/[[:space:]]*[24])([^0-9]|$)','(^|[^[:alnum:]])([+-]?[1-3][[:space:]]*/[[:space:]]*[24])([^[:alnum:]]|$)');
 v_def:=replace(v_def,'(^|[^0-9])[1-8][[:space:]]*p(untos?)?([^[:alpha:]]|$)','(^|[^[:alnum:]])[1-8][[:space:]]*p(untos?)?([^[:alpha:]]|$)');
 v_def:=replace(v_def,'(^|[^0-9])([1-8][[:space:]]*p(untos?)?)([^[:alpha:]]|$)','(^|[^[:alnum:]])([1-8][[:space:]]*p(untos?)?)([^[:alpha:]]|$)');
 execute v_def;
end $$;

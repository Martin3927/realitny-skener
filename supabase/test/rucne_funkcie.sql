-- funkcie, ktoré v ostrej databáze vznikli ručne (nie sú v migráciách); nesúvisia s kanceláriami
CREATE OR REPLACE FUNCTION public.nahrat_lokality(p_kluc text, p_kraje jsonb, p_riadky text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ begin raise exception 'Import je ukončený.'; end $function$;
CREATE OR REPLACE FUNCTION public.spustit_skener(p_plny boolean DEFAULT false) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$ declare v_id bigint; begin select net.http_post(url := 'https://api.github.com/repos/x/dispatches', body := '{}'::jsonb) into v_id; return v_id; end $function$;
CREATE OR REPLACE FUNCTION public.naplanovana_kontrola() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ begin perform spustit_skener(false); end $function$;

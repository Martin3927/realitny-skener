-- =====================================================================
-- Štatistiky webu makléra za ľubovoľné obdobie (7 dní, 30 dní, rok, od spustenia, vlastné dátumy)
--  * súčty sa počítajú v databáze, takže fungujú aj pre dlhé obdobia a veľa ponúk
--  * porovnanie s predošlým rovnako dlhým obdobím
--  * beží s právami prihláseného makléra (security invoker), takže platia pravidlá prístupu k tabuľkám
-- =====================================================================

create or replace function public.web_statistiky(p_web_id bigint, p_od date default null, p_do date default null, p_ponuky bigint[] default '{}')
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_prvy date;
  v_do date := least(coalesce(p_do, (now() at time zone 'Europe/Bratislava')::date), (now() at time zone 'Europe/Bratislava')::date);
  v_od date;
  v_n int;
  v_od2 date;
  v_do2 date;
begin
  select min(den) into v_prvy from web_zobrazenia where web_id = p_web_id;
  v_od := coalesce(p_od, v_prvy, v_do);
  if v_od > v_do then v_od := v_do; end if;
  if v_do - v_od > 3660 then v_od := v_do - 3660; end if;   -- najviac 10 rokov naraz
  v_n := v_do - v_od + 1;
  v_od2 := v_od - v_n;
  v_do2 := v_od - 1;
  return jsonb_build_object(
    'od', v_od, 'do', v_do, 'prvy_den', v_prvy,
    'dni', coalesce((select jsonb_agg(jsonb_build_array(den, pocet) order by den) from web_zobrazenia where web_id = p_web_id and den between v_od and v_do), '[]'::jsonb),
    'navstevy_pred', (select coalesce(sum(pocet), 0) from web_zobrazenia where web_id = p_web_id and den between v_od2 and v_do2),
    'zdroje', coalesce((select jsonb_object_agg(zdroj, s) from (select zdroj, sum(pocet) s from web_zdroje where web_id = p_web_id and den between v_od and v_do group by zdroj) z), '{}'::jsonb),
    'kliky', coalesce((select jsonb_object_agg(typ, s) from (select typ, sum(pocet) s from web_kliky where web_id = p_web_id and den between v_od and v_do group by typ) z), '{}'::jsonb),
    'kliky_pred', (select coalesce(sum(pocet), 0) from web_kliky where web_id = p_web_id and den between v_od2 and v_do2),
    'kliky_ponuky', coalesce((select jsonb_object_agg(ponuka::text, s) from (select ponuka, sum(pocet) s from web_kliky where web_id = p_web_id and ponuka <> 0 and den between v_od and v_do group by ponuka) z), '{}'::jsonb),
    'ponuky', coalesce((select jsonb_object_agg(nehnutelnost_id::text, s) from (select nehnutelnost_id, sum(pocet) s from zobrazenia_ponuk where nehnutelnost_id = any(coalesce(p_ponuky, '{}')) and den between v_od and v_do group by nehnutelnost_id) z), '{}'::jsonb),
    'kontakty', coalesce((select jsonb_object_agg(zdroj, c) from (select zdroj, count(*) c from web_kontakty where web_id = p_web_id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do group by zdroj) z), '{}'::jsonb),
    'kontakty_pred', (select count(*) from web_kontakty where web_id = p_web_id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od2 and v_do2)
  );
end $$;

revoke execute on function public.web_statistiky(bigint, date, date, bigint[]) from public, anon;
grant execute on function public.web_statistiky(bigint, date, date, bigint[]) to authenticated;

-- Skener (17. 11. 2026, druhá dávka):
--  • „Ešte riešim“ najviac 2× za sebou bez zápisu hovoru/SMS/emailu
--  • ranné zhrnutie do mobilu o 8:00 (prevzaté, na dnes, čo sa uvoľní do obeda)
--  • tímové pohľady filtrov (ukladá admin, vidí celá kancelária)
--  • strážca nevyužitých súkromníkov vynechá inzeráty, ktoré AI s istotou ≥ 88 % považuje za realitku

create or replace function public.predlzit_prevzatie(p_inzerat text, p_poznamka text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid; k bigint := aktivna_kancelaria(); v_za_sebou int;
begin
  perform _over_aktivny();
  if length(trim(coalesce(p_poznamka, ''))) < 3 then raise exception 'Napíšte krátko, čo s inzerátom riešite.'; end if;
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  if v_majitel is null then raise exception 'Inzerát nie je prevzatý.'; end if;
  if v_majitel <> auth.uid() and not ja_admin() then raise exception 'Predĺžiť môže len %, alebo administrátor.', _meno(v_majitel); end if;
  -- najviac 2× za sebou bez zápisu hovoru, SMS alebo emailu – inak by sa dal inzerát držať donekonečna bez práce
  select count(*) into v_za_sebou from (
    select typ, sum(case when typ = 'predlzenie' then 0 else 1 end) over (order by vytvorene desc) as zlom
    from aktivity where inzerat_id = p_inzerat and kancelaria_id = k
      and typ in ('predlzenie', 'hovor', 'sms', 'email', 'prevzatie', 'presun', 'uvolnenie')) x
  where zlom = 0;
  if v_za_sebou >= 2 then
    raise exception 'Už si prevzatie 2× predĺžil bez zápisu. Zapíš hovor, SMS alebo email, alebo si nastav 🔔 pripomienku na konkrétny deň.';
  end if;
  update prevzatia set upravene = now(), upozornene_pred = null where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'predlzenie', left(trim(p_poznamka), 500), k);
  return now() + interval '24 hours';
end $$;

create or replace function public._strazca_sukromnikov() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_txt text;
begin
  if extract(hour from now() at time zone 'Europe/Bratislava')::int <> 9 then return 0; end if;
  for r in
    select k.id as kancelaria_id, count(*) as pocet,
           (array_agg(_nazov_inzeratu(i) order by i.prvy_krat))[1] as najstarsi,
           max(now()::date - i.prvy_krat::date) as dni
    from kancelarie k
    join inzeraty i on i.okres = any(k.okresy)
    left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = k.id
    where i.aktivny and i.duplikat_z is null
      and coalesce(o.predajca_typ, i.predajca_typ) in ('sukromny', 'asi_sukromny')
      and (o.predajca_typ is not null or not exists (select 1 from inzeraty_ai a where a.inzerat_id = i.id and a.verdikt = 'rk' and a.istota >= 88))
      and i.prvy_krat < now() - interval '24 hours' and i.prvy_krat > now() - interval '7 days'
      and not exists (select 1 from prevzatia p where p.inzerat_id = i.id and p.kancelaria_id = k.id
                      and (p.makler_id is not null or p.pocet_hovorov > 0 or p.sms is not null or p.email is not null))
    group by k.id
  loop
    v_txt := r.pocet || case when r.pocet = 1 then ' súkromný inzerát' when r.pocet < 5 then ' súkromné inzeráty' else ' súkromných inzerátov' end ||
             ' za posledný týždeň nikto neprevzal ani nevolal. Najstarší: ' || coalesce(r.najstarsi, 'inzerát') || '.';
    perform _push_zaradit((select array_agg(m.id) from makleri m where m.kancelaria_id = r.kancelaria_id and m.aktivny and m.rola = 'admin'),
                          'inzeraty', '👀 Nevyužití súkromníci v skeneri', v_txt, './#inzeraty', 'typek-strazca-sukromnikov');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- ranné zhrnutie o 8:00
create or replace function public._ranne_zhrnutie() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_lok timestamp := now() at time zone 'Europe/Bratislava'; v_dnes_koniec timestamptz; v_obed timestamptz; v_txt text;
begin
  if extract(hour from v_lok)::int <> 8 then return 0; end if;
  v_dnes_koniec := ((v_lok::date + 1)::timestamp) at time zone 'Europe/Bratislava';
  v_obed := ((v_lok::date)::timestamp + time '12:00') at time zone 'Europe/Bratislava';
  for r in
    select m.id,
      (select count(*) from prevzatia p where p.makler_id = m.id and p.kancelaria_id = m.kancelaria_id) as prevzate,
      (select count(*) from pripomienky x where x.makler_id = m.id and x.hotovo is null and x.zrusena is null
         and x.cas < v_dnes_koniec and x.druh in ('pripomienka', 'volat', 'obhliadka', 'udalost')) as na_dnes,
      (select count(*) from prevzatia p where p.makler_id = m.id and p.kancelaria_id = m.kancelaria_id
         and p.upravene + interval '24 hours' < v_obed
         and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
         and not exists (select 1 from pripomienky x where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                         and x.hotovo is null and x.zrusena is null and x.cas > now())) as uvolni
    from makleri m
    where m.aktivny and exists (select 1 from push_odbery s where s.makler_id = m.id)
  loop
    continue when r.prevzate = 0 and r.na_dnes = 0;
    v_txt := concat_ws(' · ',
      case when r.prevzate > 0 then 'Prevzaté: ' || r.prevzate end,
      case when r.na_dnes > 0 then 'na dnes: ' || r.na_dnes end,
      case when r.uvolni > 0 then r.uvolni || case when r.uvolni = 1 then ' sa ti uvoľní' else ' sa ti uvoľnia' end || ' do obeda' end);
    perform _push_zaradit(array[r.id], 'pripomienky', '☀️ Dobré ráno – tvoj deň v Týpkovi', v_txt || '.', './#inzeraty', 'typek-rano');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._ranne_zhrnutie() from public, anon, authenticated;
do $$ begin perform cron.unschedule('ranne-zhrnutie'); exception when others then null; end $$;
select cron.schedule('ranne-zhrnutie', '1 6,7 * * *', 'select public._ranne_zhrnutie()');

-- ---------------------------------------------------------------- tímové pohľady filtrov
alter table public.kancelarie add column if not exists pohlady jsonb not null default '[]';
create or replace function public.timove_pohlady() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select pohlady from kancelarie where id = aktivna_kancelaria()), '[]'::jsonb)
$$;
revoke execute on function public.timove_pohlady() from public, anon;
grant execute on function public.timove_pohlady() to authenticated;
create or replace function public.ulozit_timove_pohlady(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if jsonb_typeof(coalesce(p, '[]')) <> 'array' or jsonb_array_length(coalesce(p, '[]')) > 12 or length(p::text) > 12000 then
    raise exception 'Priveľa tímových pohľadov.';
  end if;
  update kancelarie set pohlady = coalesce(p, '[]') where id = aktivna_kancelaria();
end $$;
revoke execute on function public.ulozit_timove_pohlady(jsonb) from public, anon;
grant execute on function public.ulozit_timove_pohlady(jsonb) to authenticated;

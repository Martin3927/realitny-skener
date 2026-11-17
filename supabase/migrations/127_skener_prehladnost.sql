-- Prehľadnosť skenera (17. 11. 2026):
--  1) upozornenie do mobilu ~2 h pred automatickým uvoľnením prevzatého inzerátu (v noci nie – pred nočným uvoľnením večer 20–22 h)
--  2) „Ešte riešim (+24 h)“ – predĺženie prevzatia s poznámkou, zapíše sa do histórie (aktivity.typ = 'predlzenie')
--  3) telefónne číslo v poznámke hovoru sa uloží ako telefón predajcu
--  4) súvisiace inzeráty: súkromník a realitka s tým istým bytom sa nespájajú, obom sa zapíše odkaz na druhého (inzeraty.suvisiace)
--  7) uložené pohľady filtrov makléra (makleri.pohlady)
--  9) strážca nevyužitých súkromníkov: ráno o 9:00 adminom kancelárie, keď súkromný inzerát nikto neprevzal viac ako 24 h

alter table public.aktivity drop constraint if exists aktivity_typ_check;
alter table public.aktivity add constraint aktivity_typ_check
  check (typ in ('prevzatie', 'uvolnenie', 'presun', 'hovor', 'sms', 'email', 'sms_zrusena', 'email_zruseny', 'predlzenie'));
alter table public.prevzatia add column if not exists upozornene_pred timestamptz;
alter table public.inzeraty add column if not exists suvisiace jsonb not null default '[]';
alter table public.makleri add column if not exists pohlady jsonb not null default '[]';

-- ---------------------------------------------------------------- 2) Ešte riešim (+24 h)
create or replace function public.predlzit_prevzatie(p_inzerat text, p_poznamka text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid; k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if length(trim(coalesce(p_poznamka, ''))) < 3 then raise exception 'Napíšte krátko, čo s inzerátom riešite.'; end if;
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  if v_majitel is null then raise exception 'Inzerát nie je prevzatý.'; end if;
  if v_majitel <> auth.uid() and not ja_admin() then raise exception 'Predĺžiť môže len %, alebo administrátor.', _meno(v_majitel); end if;
  update prevzatia set upravene = now(), upozornene_pred = null where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'predlzenie', left(trim(p_poznamka), 500), k);
  return now() + interval '24 hours';
end $$;
revoke execute on function public.predlzit_prevzatie(text, text) from public, anon;
grant execute on function public.predlzit_prevzatie(text, text) to authenticated;

-- ---------------------------------------------------------------- 1) upozornenie pred uvoľnením
create or replace function public._upozornit_pred_uvolnenim() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_lok timestamp := now() at time zone 'Europe/Bratislava'; v_hod int; v_kedy text; v_txt text;
begin
  v_hod := extract(hour from v_lok)::int;
  if v_hod < 7 or v_hod >= 22 then return 0; end if;   -- v noci nebudíme
  for r in
    select p.inzerat_id, p.makler_id, p.kancelaria_id, p.upravene + interval '24 hours' as uvolni, i.nazov, _nazov_inzeratu(i) as nazov2
    from prevzatia p join inzeraty i on i.id = p.inzerat_id
    where p.makler_id is not null
      and (p.upozornene_pred is null or p.upozornene_pred < p.upravene)
      and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
      and not exists (select 1 from pripomienky x
                      where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                        and x.hotovo is null and x.zrusena is null and x.cas > now())
      and p.upravene + interval '24 hours' > now()
      and (p.upravene + interval '24 hours' <= now() + interval '2 hours'
           -- uvoľní sa v noci alebo skoro ráno → povieme to už večer
           or (v_hod >= 20 and (p.upravene + interval '24 hours') at time zone 'Europe/Bratislava' < v_lok::date + 1 + time '09:00'))
    for update of p skip locked
  loop
    v_kedy := case when (r.uvolni at time zone 'Europe/Bratislava')::date = v_lok::date then 'dnes o ' else 'zajtra o ' end ||
              to_char(r.uvolni at time zone 'Europe/Bratislava', 'HH24:MI');
    v_txt := coalesce(r.nazov2, r.nazov, 'Inzerát') || ' sa ti uvoľní ' || v_kedy ||
             '. Zapíš hovor, nastav si pripomienku alebo stlač „Ešte riešim“.';
    perform _push_zaradit(array[r.makler_id], 'pripomienky', '⏳ Prevzatý inzerát sa čoskoro uvoľní', v_txt,
                          './#inzeraty/' || r.inzerat_id, 'typek-uvol-' || r.inzerat_id);
    update prevzatia set upozornene_pred = now() where inzerat_id = r.inzerat_id and kancelaria_id = r.kancelaria_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._upozornit_pred_uvolnenim() from public, anon, authenticated;

do $$ begin perform cron.unschedule('uvolnenie-upozornenie'); exception when others then null; end $$;
select cron.schedule('uvolnenie-upozornenie', '*/10 * * * *', 'select public._upozornit_pred_uvolnenim()');

-- ---------------------------------------------------------------- 3) telefón z poznámky hovoru
create or replace function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text)
 returns jsonb language plpgsql security definer set search_path = public as $$
declare m makleri; z inzeraty; v_nehn text; v_cas timestamptz; v_pokus int; v_ma uuid; k bigint := aktivna_kancelaria(); v_tel text; v_vys jsonb := '{}'::jsonb;
begin
  perform _moj_alebo_prevezmi(p_inzerat);
  -- komu inzerát patrí (admin môže zapísať hovor za makléra, ktorému ho pridelil)
  select makler_id into v_ma from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k;
  v_ma := coalesce(v_ma, auth.uid());
  if coalesce(trim(p_vysledok), '') = '' then
    raise exception 'Vyberte, ako dopadol hovor.';
  end if;
  update prevzatia set posledny_vysledok = p_vysledok, posledna_poznamka = nullif(trim(p_poznamka), ''),
    posledny_hovor = now(), pocet_hovorov = pocet_hovorov + 1, upravene = now()
  where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, vysledok, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'hovor', p_vysledok, nullif(trim(p_poznamka), ''), k);
  -- telefónne číslo napísané do poznámky sa uloží ako telefón predajcu (ak k inzerátu ešte žiadne nemáme)
  v_tel := substring(coalesce(p_poznamka, '') from '(?:\+421|00421|0)[ ]?9[0-9]{2}[ /.-]?[0-9]{3}[ /.-]?[0-9]{3}');
  if v_tel is not null and not exists (select 1 from _telefony_inzeratov(k) t where t.inzerat_id = p_inzerat)
     and not exists (select 1 from telefony t where t.inzerat_id = p_inzerat and t.kancelaria_id = k) then
    insert into telefony (inzerat_id, kancelaria_id, telefon, zadal, zadane) values (p_inzerat, k, v_tel, auth.uid(), now())
    on conflict do nothing;
    v_vys := jsonb_build_object('telefon', v_tel);
  end if;
  -- nový hovor → staršie „Znova zavolať“ k tomuto inzerátu už netreba (len v tejto kancelárii)
  update pripomienky set zrusena = now()
  where inzerat_id = p_inzerat and druh = 'volat' and hotovo is null and zrusena is null and kancelaria_id = k;
  select * into z from inzeraty where id = p_inzerat;
  if p_vysledok = 'Nedvíha' then
    v_cas := _cas_volat_znova(now());
    v_pokus := _pokusy_nedviha(p_inzerat, now(), k);
    insert into pripomienky (makler_id, vytvoril, inzerat_id, cas, poznamka, druh, email_odoslany, kancelaria_id)
    values (v_ma, auth.uid(), p_inzerat, v_cas,
            left('Znova zavolať: ' || coalesce(_nazov_inzeratu(z), 'inzerát') || ' – predajca nedvíhal (' ||
                 to_char(now() at time zone 'Europe/Bratislava', 'FMDD. FMMM. "o" HH24:MI') || ', ' || v_pokus || '. pokus)', 500),
            'volat', now(), k);   -- e-mail sa pri tejto pripomienke neposiela
    return v_vys || jsonb_build_object('volat_znova', v_cas, 'pokus', v_pokus);
  end if;
  if p_vysledok = 'Získaný do ponuky' then
    select * into m from makleri where id = v_ma;
    v_nehn := case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom' when 'pozemok' then 'pozemok'
                         when 'chata' then 'chatu' when 'garaz' then 'garáž' else 'nehnuteľnosť' end;
    insert into spravy (makler_id, text, typ, kluc, kancelaria_id)
    values (null, '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end || ' do ponuky ' || v_nehn ||
                  coalesce(', ' || nullif(z.obec, ''), '') || '! Gratulujeme 👏', 'uspech', 'uspech:' || p_inzerat || ':' || v_ma, k)
    on conflict do nothing;
  end if;
  return v_vys;
end $$;

-- ---------------------------------------------------------------- 4) súvisiace inzeráty (súkromník ↔ realitka)
create or replace function public.skener_ulozit(p_kluc text, p_inzeraty jsonb, p_odhady jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform _over_skener(p_kluc);
  insert into inzeraty (id, portal, portaly, url, nazov, typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, prvy_krat, naposledy, aktivny, duplikat_z,
    dalsie_odkazy, historia_cien, lat, lon, ulica, obnovene, suvisiace)
  select id, portal, coalesce(portaly, '{}'), url, coalesce(nazov, ''), typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, coalesce(prvy_krat, now()), coalesce(naposledy, now()),
    coalesce(aktivny, true), duplikat_z, coalesce(dalsie_odkazy, '[]'), coalesce(historia_cien, '[]'), lat, lon, ulica, obnovene, coalesce(suvisiace, '[]')
  from jsonb_populate_recordset(null::inzeraty, p_inzeraty)
  on conflict (id) do update set
    portal = excluded.portal, portaly = excluded.portaly, url = excluded.url, nazov = excluded.nazov,
    typ = excluded.typ, podtyp = excluded.podtyp, izby = excluded.izby, cena = excluded.cena,
    plocha = excluded.plocha, cena_m2 = excluded.cena_m2, obec = excluded.obec, okres = excluded.okres,
    predajca = excluded.predajca, predajca_typ = excluded.predajca_typ, predajca_dovod = excluded.predajca_dovod,
    foto = excluded.foto, popis = excluded.popis, publikovane = excluded.publikovane,
    prvy_krat = excluded.prvy_krat, naposledy = excluded.naposledy, aktivny = excluded.aktivny,
    duplikat_z = excluded.duplikat_z, dalsie_odkazy = excluded.dalsie_odkazy, historia_cien = excluded.historia_cien,
    lat = coalesce(excluded.lat, inzeraty.lat), lon = coalesce(excluded.lon, inzeraty.lon), ulica = coalesce(excluded.ulica, inzeraty.ulica),
    obnovene = coalesce(excluded.obnovene, inzeraty.obnovene), suvisiace = excluded.suvisiace;
  get diagnostics v = row_count;
  if p_odhady is not null then
    insert into odhady (inzerat_id, median, rozdiel_pct, skupina, n, jednotka, podhodnotene)
    select inzerat_id, median, rozdiel_pct, skupina, n, jednotka, coalesce(podhodnotene, false)
    from jsonb_populate_recordset(null::odhady, p_odhady)
    on conflict (inzerat_id) do update set median = excluded.median, rozdiel_pct = excluded.rozdiel_pct,
      skupina = excluded.skupina, n = excluded.n, jednotka = excluded.jednotka, podhodnotene = excluded.podhodnotene;
    update odhady set median = null, rozdiel_pct = null, skupina = null, n = null, jednotka = null, podhodnotene = false
    where inzerat_id in (select x->>'id' from jsonb_array_elements(p_inzeraty) x)
      and inzerat_id not in (select x->>'inzerat_id' from jsonb_array_elements(p_odhady) x);
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- 7) uložené pohľady filtrov
create or replace function public.ulozit_pohlady(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if jsonb_typeof(coalesce(p, '[]')) <> 'array' or jsonb_array_length(coalesce(p, '[]')) > 20 or length(p::text) > 20000 then
    raise exception 'Priveľa uložených pohľadov.';
  end if;
  update makleri set pohlady = coalesce(p, '[]') where id = auth.uid();
end $$;
revoke execute on function public.ulozit_pohlady(jsonb) from public, anon;
grant execute on function public.ulozit_pohlady(jsonb) to authenticated;

-- ---------------------------------------------------------------- 9) strážca nevyužitých súkromníkov
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
revoke execute on function public._strazca_sukromnikov() from public, anon, authenticated;

do $$ begin perform cron.unschedule('strazca-sukromnikov'); exception when others then null; end $$;
select cron.schedule('strazca-sukromnikov', '5 7,8 * * *', 'select public._strazca_sukromnikov()');

-- ---------------------------------------------------------------- 8) výkon tímu: predĺženia („Ešte riešim“) a nevyužití súkromníci
create or replace function public._vykon(p_od timestamptz, p_do timestamptz, p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  with k as (select coalesce(p_kancelaria, aktivna_kancelaria(), 1) as id)
  select jsonb_build_object(
    'od', p_od, 'do', p_do,
    'nove_sukromne', (select count(*) from inzeraty i left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = (select id from k)
                      where i.prvy_krat >= p_od and i.prvy_krat < p_do and i.duplikat_z is null
                        and i.okres = any(coalesce((select okresy from kancelarie where id = (select id from k)), '{}'))
                        and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'),
    -- súkromné inzeráty z obdobia, ktoré nikto neprevzal, nevolal ani im nepísal (aspoň 24 h staré)
    'nevyuzite_sukromne', (select count(*) from inzeraty i left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = (select id from k)
                      where i.prvy_krat >= p_od and i.prvy_krat < p_do and i.prvy_krat < now() - interval '24 hours' and i.duplikat_z is null
                        and i.okres = any(coalesce((select okresy from kancelarie where id = (select id from k)), '{}'))
                        and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'
                        and not exists (select 1 from prevzatia p where p.inzerat_id = i.id and p.kancelaria_id = (select id from k)
                                        and (p.makler_id is not null or p.pocet_hovorov > 0 or p.sms is not null or p.email is not null))
                        and not exists (select 1 from aktivity a where a.inzerat_id = i.id and a.kancelaria_id = (select id from k))),
    'makleri', coalesce((
      select jsonb_agg(r order by r->>'meno') from (
        select jsonb_build_object(
          'id', m.id, 'meno', coalesce(nullif(m.meno, ''), m.email), 'aktivny', m.aktivny, 'rola', m.rola,
          'prevzate', count(a.id) filter (where a.typ = 'prevzatie'),
          'hovory', count(a.id) filter (where a.typ = 'hovor'),
          'sms', count(a.id) filter (where a.typ = 'sms'),
          'emaily', count(a.id) filter (where a.typ = 'email'),
          'uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and coalesce(a.poznamka, '') not like 'automaticky%'),
          'auto_uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and a.poznamka like 'automaticky%'),
          'predlzene', count(a.id) filter (where a.typ = 'predlzenie'),
          'vysledky', coalesce((select jsonb_object_agg(v.vysledok, v.n) from (
                         select coalesce(vysledok, 'Iné') vysledok, count(*) n from aktivity
                         where makler_id = m.id and kancelaria_id = (select id from k) and typ = 'hovor' and vytvorene >= p_od and vytvorene < p_do
                         group by 1) v), '{}'::jsonb),
          'schrankovanie', (select count(*) from schrankovanie s
                            where s.vytvoril = m.id and s.kancelaria_id = (select id from k) and s.vytvorene >= p_od and s.vytvorene < p_do),
          'drzi', (select count(*) from prevzatia p where p.makler_id = m.id and p.kancelaria_id = (select id from k)),
          'posledna', max(a.vytvorene)
        ) r
        from makleri m
        left join aktivity a on a.makler_id = m.id and a.kancelaria_id = (select id from k) and a.vytvorene >= p_od and a.vytvorene < p_do
        where m.kancelaria_id = (select id from k)
        group by m.id
      ) x), '[]'::jsonb)
  )
$$;

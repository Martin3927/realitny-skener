-- Kontakty na predaj: výhody pre zákazníkov Týpka (7. 11. 2026, používateľ: „zľavy aj prednosť nastavím v Týpkovi, navrhol si veľkorysé zľavy, ubral by som 10 %“)
--  * úroveň kancelárie (_kontakty_uroven): 0 = len kontakty / skúšobná doba / bez predplatného, 1 = skener ALEBO web (web = osobný web alebo Kancelária komplet),
--    2 = skener AJ web; len platiaci (aktivny) a vlastná (vlastna)
--  * predvolené: prednosť 60 minút (úroveň 1 a 2 vidí a preberá kontakt hneď, úroveň 0 až po hodine od začiatku ceny – v noci od 8:00),
--    zľava 10 % (1) / 20 % (2) z aktuálnej ceny (zaokrúhlené na celé €), zadarmo na začiatok 2 / 5 / 5 a pri úrovni 2 navyše 1 kontakt zadarmo každý mesiac (neprenáša sa)
--  * všetko sa nastavuje v Správe zákazníkov → Kontakty na predaj → Výhody pre zákazníkov Týpka

alter table public.kontakty_nastavenie add column if not exists vyhody jsonb not null
  default '{"prednost_min": 60, "zlava_jeden": 10, "zlava_oba": 20, "zadarmo_jeden": 5, "zadarmo_oba": 5, "mesacne_oba": 1}'::jsonb;
alter table public.kontakty_pohyby add column if not exists zadarmo_druh text check (zadarmo_druh in ('start', 'mesiac'));
update public.kontakty_pohyby set zadarmo_druh = 'start' where zadarmo and zadarmo_druh is null;
alter table public.odhady_hodnoty add column if not exists trh_oznamena0 integer;   -- cena oznámená kanceláriám bez prednosti

create or replace function public._kontakty_uroven(p_k bigint) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select case when z.stav in ('aktivny', 'vlastna')
                               then ('skener' = any(z.moduly))::int + (z.moduly && array['web', 'kancelaria'])::int else 0 end
                     from kancelarie k join zakaznici z on z.id = k.zakaznik_id where k.id = p_k), 0)
$$;

-- výhody kancelárie {uroven, zlava, prednost, prednost_min, zadarmo_start, mesacne}
create or replace function public._kontakty_vyhoda(p_k bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('uroven', u.u,
    'zlava', case u.u when 2 then coalesce((n.vyhody->>'zlava_oba')::int, 0) when 1 then coalesce((n.vyhody->>'zlava_jeden')::int, 0) else 0 end,
    'prednost', u.u > 0, 'prednost_min', coalesce((n.vyhody->>'prednost_min')::int, 0),
    'zadarmo_start', case u.u when 2 then coalesce((n.vyhody->>'zadarmo_oba')::int, n.zadarmo) when 1 then coalesce((n.vyhody->>'zadarmo_jeden')::int, n.zadarmo) else n.zadarmo end,
    'mesacne', case when u.u = 2 then coalesce((n.vyhody->>'mesacne_oba')::int, 0) else 0 end)
  from kontakty_nastavenie n, (select _kontakty_uroven(p_k) u) u where n.id = 1
$$;

create or replace function public._kontakt_cena_k(p_c integer, p_zlava integer) returns integer
language sql immutable as $$
  select case when p_c is null then null else greatest(1, round(p_c * (100 - least(greatest(coalesce(p_zlava, 0), 0), 90)) / 100.0))::int end
$$;

-- kontakty zadarmo: úvodné (podľa úrovne) a mesačné (úroveň 2, v kalendárnom mesiaci, neprenášajú sa); uznaná reklamácia vráti kontakt do rovnakej skupiny
create or replace function public._kontakty_zadarmo_start(p_k bigint) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, (_kontakty_vyhoda(p_k)->>'zadarmo_start')::int
    - coalesce((select sum(case druh when 'nakup' then 1 when 'vratenie' then -1 else 0 end) from kontakty_pohyby
                 where kancelaria_id = p_k and zadarmo and coalesce(zadarmo_druh, 'start') = 'start'), 0))::int
$$;
create or replace function public._kontakty_zadarmo_mesiac(p_k bigint) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, (_kontakty_vyhoda(p_k)->>'mesacne')::int
    - coalesce((select sum(case druh when 'nakup' then 1 when 'vratenie' then -1 else 0 end) from kontakty_pohyby
                 where kancelaria_id = p_k and zadarmo and zadarmo_druh = 'mesiac'
                   and vytvorene >= (date_trunc('month', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava')), 0))::int
$$;
create or replace function public._kontakty_zadarmo(p_k bigint) returns integer
language sql stable security definer set search_path = public as $$
  select _kontakty_zadarmo_start(p_k) + _kontakty_zadarmo_mesiac(p_k)
$$;

-- makléri, ktorí smú preberať, rozdelení podľa výhody kancelárie
create or replace function public._kontakty_kupci_vyhoda(p_okres text) returns table (prednost boolean, zlava integer, makleri uuid[])
language sql stable security definer set search_path = public as $$
  select (v->>'prednost')::boolean, (v->>'zlava')::int, array_agg(m.id)
    from makleri m cross join lateral (select _kontakty_vyhoda(m.kancelaria_id) v) x
   where m.id = any(_kontakty_kupci(p_okres))
   group by 1, 2
$$;

-- oznámenie do mobilov (117 + výhody): kancelárie s prednosťou hneď, ostatné po prednosti; cena v titulku po zľave kancelárie
create or replace function public._kontakt_oznam(p_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare
  o odhady_hodnoty;
  v_c int;
  v_pm int := coalesce((select (vyhody->>'prednost_min')::int from kontakty_nastavenie where id = 1), 0);
  v_hod int := extract(hour from now() at time zone 'Europe/Bratislava');
  v_n int := 0;
  r record;
  v_nove boolean;
begin
  select * into o from odhady_hodnoty where id = p_id;
  if o.trh_od is null or o.predane is not null or now() >= o.trh_koniec then return 0; end if;
  if v_hod < 7 or v_hod >= 21 then return 0; end if;
  v_c := _kontakt_cena(o.trh_ceny, o.trh_od);
  -- s prednosťou (zákazníci Týpka): nový alebo lacnejší
  if o.trh_oznamena is null or v_c < o.trh_oznamena then
    v_nove := o.trh_oznamena is null;
    for r in select * from _kontakty_kupci_vyhoda(o.okres) where prednost loop
      v_n := v_n + _push_zaradit(r.makleri, 'kontakty',
        case when v_nove then '💰 Nový kontakt na predaj · ' else '💰 Kontakt zlacnel na ' end || _kontakt_cena_k(v_c, r.zlava) || ' €',
        coalesce(o.nazov, o.obec) || '. ' || coalesce(o.dovod || '. ', '') ||
        case when v_nove and v_pm > 0 then 'Ako zákazník Týpka ho vidíš ' || case when v_pm % 60 = 0 then (v_pm / 60) || ' h' else v_pm || ' min' end || ' pred ostatnými. '
             else '' end || 'Kontakt dostane prvá kancelária, ktorá ho prevezme.',
        './#odhady/trh', 'typek-trh-' || o.id);
    end loop;
    update odhady_hodnoty set trh_oznamena = v_c where id = o.id;
  end if;
  -- bez prednosti: až po prednosti, potom nový alebo lacnejší
  if now() >= o.trh_od + v_pm * interval '1 minute' and (o.trh_oznamena0 is null or v_c < o.trh_oznamena0) then
    for r in select * from _kontakty_kupci_vyhoda(o.okres) where not prednost loop
      v_n := v_n + _push_zaradit(r.makleri, 'kontakty',
        case when o.trh_oznamena0 is null then '💰 Nový kontakt na predaj · ' else '💰 Kontakt zlacnel na ' end || _kontakt_cena_k(v_c, r.zlava) || ' €',
        coalesce(o.nazov, o.obec) || '. ' || coalesce(o.dovod || '. ', '') || 'Kontakt dostane prvá kancelária, ktorá ho prevezme.',
        './#odhady/trh', 'typek-trh-' || o.id);
    end loop;
    update odhady_hodnoty set trh_oznamena0 = v_c where id = o.id;
  end if;
  return v_n;
end $$;

create or replace function public.kontakty_na_predaj() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_k bigint := moja_kancelaria();
  n kontakty_nastavenie;
  v_okresy text[];
  v_vyh jsonb := _kontakty_vyhoda(moja_kancelaria());
  v_zl int := (v_vyh->>'zlava')::int;
  v_pred boolean := (v_vyh->>'prednost')::boolean;
  v_pm int := (v_vyh->>'prednost_min')::int;
begin
  if not ja_aktivny() or not ma_pristup('odhady') then raise exception 'Nemáte prístup k odhadom.' using errcode = '42501'; end if;
  select * into n from kontakty_nastavenie where id = 1;
  select coalesce(array_agg(o order by o), '{}') into v_okresy from unnest(n.okresy) o where v_k in (select _kontakty_kancelarie(o));
  return jsonb_build_object(
    'okresy', to_jsonb(v_okresy), 'smiem', _smie_preberat_kontakty(),
    'kredit', _kontakty_kredit(v_k), 'zadarmo', _kontakty_zadarmo(v_k), 'zadarmo_spolu', (v_vyh->>'zadarmo_start')::int,
    'zadarmo_mesiac', _kontakty_zadarmo_mesiac(v_k), 'vyhoda', v_vyh, 'vyhody', n.vyhody,
    'ceny', n.ceny, 'koniec_h', n.koniec_h, 'reklamacia_h', n.reklamacia_h,
    'ponuky', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'typ', o.typ, 'nazov', o.nazov, 'okres', o.okres, 'obec', o.obec, 'cast_obce', o.cast_obce,
        'plocha', o.plocha, 'pozemok', o.pozemok, 'izby', o.izby, 'poschodie', o.poschodie, 'poschodi', o.poschodi, 'druh_pozemku', o.druh_pozemku,
        'stav', o.stav_nehn, 'rek', _odhad_rek_text(o.rekonstrukcia), 'doplnky', o.doplnky, 'siete', o.siete,
        'dovod', o.dovod, 'kedy_predat', o.kedy_predat, 'kedy_volat', o.kedy_volat, 'fotky', o.fotky,
        'odhad', coalesce(case when md.m ? 'od' and md.m->>'od' is not null then jsonb_build_object('od', md.m->'od', 'do', md.m->'do', 'podla', 'median') end,
                          case when o.auto->>'od' is not null then jsonb_build_object('od', o.auto->'od', 'do', o.auto->'do', 'podla', 'skener') end),
        'vytvorene', o.vytvorene, 'od', o.trh_od, 'koniec', o.trh_koniec,
        'cena', _kontakt_cena_k(_kontakt_cena(o.trh_ceny, o.trh_od), v_zl), 'cena_plna', _kontakt_cena(o.trh_ceny, o.trh_od),
        'dalsia', (select case when d is not null then jsonb_set(d, '{c}', to_jsonb(_kontakt_cena_k((d->>'c')::int, v_zl))) end from _kontakt_dalsia(o.trh_ceny, o.trh_od) d),
        -- zákazníci Týpka (prednosť): do kedy kontakt ostatní ešte nevidia
        'len_pre_zakaznikov_do', case when v_pred and v_pm > 0 and now() < o.trh_od + v_pm * interval '1 minute' then o.trh_od + v_pm * interval '1 minute' end)
        order by o.vytvorene desc)
      from odhady_hodnoty o
      left join lateral (select case when o.typ = 'byt' then _odhad_median(o) end as m) md on true
      where o.trh_od is not null and o.predane is null and o.trh_koniec > now() and o.okres = any(v_okresy)
        and (v_pred or now() >= o.trh_od + v_pm * interval '1 minute')), '[]'::jsonb),
    'kupene', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nazov', o.nazov, 'predane', o.predane, 'cena', o.predane_cena, 'zadarmo', o.predane_zadarmo,
        'kto', o.predane_kto, 'reklamacia', (select jsonb_build_object('stav', r.stav, 'dovod', r.dovod, 'odpoved', r.odpoved) from kontakty_reklamacie r where r.odhad_id = o.id))
        order by o.predane desc)
      from odhady_hodnoty o where o.predane_kancelaria = v_k and o.predane_ako = 'nakup' and o.predane > now() - interval '90 days'), '[]'::jsonb),
    'pohyby', case when ja_admin() then coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id desc) from (
        select id, vytvorene, druh, suma, zadarmo, zadarmo_druh, poznamka from kontakty_pohyby where kancelaria_id = v_k order by id desc limit 30) x), '[]'::jsonb) end);
end $$;

create or replace function public.kontakt_prevziat(p_id bigint, p_cena integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
  v_k bigint := moja_kancelaria();
  o odhady_hodnoty;
  v_cena int;
  v_zadarmo boolean;
  v_druh text;
  v_kredit numeric;
  v_vyh jsonb;
  v_od timestamptz;
begin
  if v_ja is null or not ja_aktivny() or not ma_pristup('odhady') then raise exception 'Nemáte prístup k odhadom.' using errcode = '42501'; end if;
  if not _smie_preberat_kontakty() then
    raise exception 'Platené kontakty preberá administrátor kancelárie. Maklérom to môže zapnúť v časti Tím.' using errcode = '42501';
  end if;
  if aktivna_kancelaria() is distinct from v_k then raise exception 'Kontakt sa dá prevziať len vo vlastnej kancelárii.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(918278, v_k::int);
  select * into o from odhady_hodnoty where id = p_id for update;
  if not found or o.trh_od is null then raise exception 'Kontakt sa nenašiel.' using errcode = '22023'; end if;
  if o.predane is not null then
    raise exception '%', case when o.predane_kancelaria = v_k then 'Tento kontakt už vaša kancelária má.' else 'Tento kontakt už prevzala iná kancelária.' end using errcode = '22023';
  end if;
  if now() >= o.trh_koniec then raise exception 'Ponuka tohto kontaktu už skončila.' using errcode = '22023'; end if;
  if not (v_k in (select _kontakty_kancelarie(o.okres))) then
    raise exception 'Vaša kancelária kontakty z okresu % neprevezme – okres nie je medzi vašimi.', o.okres using errcode = '42501';
  end if;
  -- výhody zákazníkov Týpka (123): prednosť a zľava
  v_vyh := _kontakty_vyhoda(v_k);
  v_od := o.trh_od + (v_vyh->>'prednost_min')::int * interval '1 minute';
  if not (v_vyh->>'prednost')::boolean and now() < v_od then
    raise exception 'Kontakt môžete prevziať od % – zákazníci Týpka so skenerom alebo webom ho majú skôr.',
      to_char(v_od at time zone 'Europe/Bratislava', 'HH24:MI') using errcode = '22023';
  end if;
  v_cena := _kontakt_cena_k(_kontakt_cena(o.trh_ceny, o.trh_od), (v_vyh->>'zlava')::int);
  if p_cena is not null and v_cena > p_cena then
    raise exception 'Cena sa medzitým zmenila na % €. Skúste to znova.', v_cena using errcode = '22023';
  end if;
  -- najprv mesačný kontakt zadarmo (prepadá), potom úvodné
  v_druh := case when _kontakty_zadarmo_mesiac(v_k) > 0 then 'mesiac' when _kontakty_zadarmo_start(v_k) > 0 then 'start' end;
  v_zadarmo := v_druh is not null;
  if not v_zadarmo then
    v_kredit := _kontakty_kredit(v_k);
    if v_kredit < v_cena then
      raise exception 'Nemáte dosť kreditu: zostatok % €, kontakt stojí % €. Kredit vám pripíšeme po platbe – napíšte na info@realitnytypek.sk.',
        trim(to_char(v_kredit, 'FM999990.00')), v_cena using errcode = '22023';
    end if;
  end if;
  insert into kontakty_pohyby (kancelaria_id, druh, suma, zadarmo, zadarmo_druh, odhad_id, kto, poznamka)
  values (v_k, 'nakup', case when v_zadarmo then 0 else -v_cena end, v_zadarmo, v_druh, o.id, v_ja,
          left(coalesce(o.nazov, o.obec) || case v_druh when 'mesiac' then ' (mesačný zadarmo)' when 'start' then ' (zadarmo)' else
               case when (v_vyh->>'zlava')::int > 0 then ' (zľava ' || (v_vyh->>'zlava') || ' %)' else '' end end, 200));
  perform _kontakt_odovzdaj(o.id, v_ja, case when v_zadarmo then 0 else v_cena end, v_zadarmo, 'nakup');
  return jsonb_build_object('ok', true, 'id', o.id, 'cena', case when v_zadarmo then 0 else v_cena end, 'zadarmo', v_zadarmo,
    'kredit', _kontakty_kredit(v_k), 'zostava_zadarmo', _kontakty_zadarmo(v_k), 'zlava', (v_vyh->>'zlava')::int);
end $$;

create or replace function public.kontakt_reklamacia_vybav(p_id bigint, p_uznat boolean, p_odpoved text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r kontakty_reklamacie;
  o odhady_hodnoty;
  v_odp text := nullif(left(btrim(coalesce(p_odpoved, '')), 1000), '');
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select * into r from kontakty_reklamacie where id = p_id for update;
  if not found then raise exception 'Reklamácia sa nenašla.' using errcode = '22023'; end if;
  if r.stav <> 'caka' then raise exception 'Reklamácia už je vybavená.' using errcode = '22023'; end if;
  if not p_uznat and v_odp is null then raise exception 'Pri zamietnutí napíšte dôvod.' using errcode = '22023'; end if;
  select * into o from odhady_hodnoty where id = r.odhad_id;
  update kontakty_reklamacie set stav = case when p_uznat then 'uznana' else 'zamietnuta' end, vybavene = now(), vybavil = auth.uid(), odpoved = v_odp where id = r.id;
  if p_uznat then
    insert into kontakty_pohyby (kancelaria_id, druh, suma, zadarmo, zadarmo_druh, odhad_id, kto, poznamka)
    values (r.kancelaria_id, 'vratenie', coalesce(o.predane_cena, 0), coalesce(o.predane_zadarmo, false),
            (select p.zadarmo_druh from kontakty_pohyby p where p.odhad_id = r.odhad_id and p.druh = 'nakup' order by p.id desc limit 1), r.odhad_id, auth.uid(),
            left('Uznaná reklamácia: ' || coalesce(o.nazov, '') , 200));
  end if;
  perform _push_zaradit(array[r.kto], 'kontakty',
    case when p_uznat then '✅ Reklamácia uznaná' || case when coalesce(o.predane_cena, 0) > 0 then ' · ' || o.predane_cena || ' € späť' else ' · kontakt zadarmo späť' end
         else '✖️ Reklamácia zamietnutá' end,
    coalesce(o.nazov, 'Kontakt') || coalesce(' – ' || v_odp, ''), './#odhady/' || r.odhad_id, 'typek-rekl-' || r.odhad_id);
end $$;

create or replace function public.kontakty_sprava() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n kontakty_nastavenie;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select * into n from kontakty_nastavenie where id = 1;
  return jsonb_build_object(
    'nastavenie', jsonb_build_object('okresy', n.okresy, 'ceny', n.ceny, 'ceny_okresy', n.ceny_okresy, 'koniec_h', n.koniec_h, 'zadarmo', n.zadarmo, 'vyhody', n.vyhody,
                                     'reklamacia_h', n.reklamacia_h, 'zaloha_makler', n.zaloha_makler, 'upravene', n.upravene),
    'zaloha', (select jsonb_build_object('id', m.id, 'meno', m.meno) from makleri m where m.id = _kontakty_zaloha()),
    'zalohy', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'meno', m.meno) order by m.meno)
                          from makleri m where m.aktivny and m.kancelaria_id = moja_kancelaria()), '[]'::jsonb),
    'vsetky_okresy', coalesce((select jsonb_agg(o order by o) from (select okres o from _okresy_sr() okres) x), '[]'::jsonb),
    'pokrytie', coalesce((select jsonb_object_agg(o, (select count(*) from _kontakty_kancelarie(o))) from (select distinct unnest(k.okresy) o from kancelarie k where k.aktivna) x), '{}'::jsonb),
    'kancelarie', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nazov', k.nazov, 'okresy', k.okresy, 'aktivna', k.aktivna,
        'kredit', _kontakty_kredit(k.id), 'zadarmo', _kontakty_zadarmo(k.id), 'uroven', _kontakty_uroven(k.id),
        'kupene', (select count(*) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh = 'nakup'),
        'zaplatene', (select coalesce(-sum(p.suma), 0) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh in ('nakup', 'vratenie')),
        'dobite', (select coalesce(sum(p.suma), 0) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh = 'dobitie')) order by k.nazov)
      from kancelarie k where k.id is distinct from n.kancelaria_trh), '[]'::jsonb),
    'trh', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nazov', o.nazov, 'okres', o.okres, 'dovod', o.dovod, 'vytvorene', o.vytvorene,
        'od', o.trh_od, 'koniec', o.trh_koniec, 'cena', case when o.predane is null then _kontakt_cena(o.trh_ceny, o.trh_od) end,
        'dalsia', case when o.predane is null then _kontakt_dalsia(o.trh_ceny, o.trh_od) end,
        'predane', o.predane, 'predane_cena', o.predane_cena, 'zadarmo', o.predane_zadarmo, 'ako', o.predane_ako,
        'kancelaria', (select k.nazov from kancelarie k where k.id = o.predane_kancelaria), 'kto', (select m.meno from makleri m where m.id = o.predane_kto),
        'kupci', (select count(*) from _kontakty_kancelarie(o.okres)),
        'reklamacia', (select r.stav from kontakty_reklamacie r where r.odhad_id = o.id)) order by o.vytvorene desc)
      from odhady_hodnoty o where o.trh_od is not null and (o.predane is null or o.predane > now() - interval '60 days')), '[]'::jsonb),
    'reklamacie', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'odhad_id', r.odhad_id, 'nazov', o.nazov, 'cena', o.predane_cena, 'zadarmo', o.predane_zadarmo,
        'predane', o.predane, 'kancelaria', (select k.nazov from kancelarie k where k.id = r.kancelaria_id), 'kto', (select m.meno from makleri m where m.id = r.kto),
        'dovod', r.dovod, 'text', r.text, 'vytvorene', r.vytvorene, 'stav', r.stav, 'vybavene', r.vybavene, 'odpoved', r.odpoved,
        'telefon', o.telefon, 'email', o.email, 'meno', o.meno) order by (r.stav = 'caka') desc, r.vytvorene desc)
      from kontakty_reklamacie r left join odhady_hodnoty o on o.id = r.odhad_id where r.stav = 'caka' or r.vytvorene > now() - interval '90 days'), '[]'::jsonb),
    'pohyby', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'vytvorene', p.vytvorene, 'druh', p.druh, 'suma', p.suma, 'zadarmo', p.zadarmo,
        'poznamka', p.poznamka, 'kancelaria', (select k.nazov from kancelarie k where k.id = p.kancelaria_id), 'kto', (select m.meno from makleri m where m.id = p.kto)) order by p.id desc)
      from (select * from kontakty_pohyby order by id desc limit 100) p), '[]'::jsonb));
end $$;

create or replace function public.kontakty_nastavit(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_okresy text[];
  v_ceny jsonb;
  v_okr jsonb := '{}'::jsonb;
  r record;
  v_max float8;
  v_koniec int := (p->>'koniec_h')::int;
  v_zadarmo int := (p->>'zadarmo')::int;
  v_rekl int := (p->>'reklamacia_h')::int;
  v_zaloha uuid := nullif(p->>'zaloha_makler', '')::uuid;
  v_vyh jsonb;
  v_x text;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_okresy
    from jsonb_array_elements_text(case when jsonb_typeof(p->'okresy') = 'array' then p->'okresy' else '[]' end) x;
  if exists (select 1 from unnest(v_okresy) x where not (x in (select _okresy_sr()))) then
    raise exception 'Neznámy okres.' using errcode = '22023';
  end if;
  v_ceny := _kontakty_over_ceny(p->'ceny');
  -- vlastné ceny okresov (prázdny zoznam = spoločné ceny)
  if jsonb_typeof(p->'ceny_okresy') = 'object' then
    for r in select key, value from jsonb_each(p->'ceny_okresy') loop
      continue when jsonb_typeof(r.value) <> 'array' or jsonb_array_length(r.value) = 0;
      if not (r.key in (select _okresy_sr())) then raise exception 'Neznámy okres.' using errcode = '22023'; end if;
      v_okr := v_okr || jsonb_build_object(r.key, _kontakty_over_ceny(r.value, 'Okres ' || r.key || ': '));
    end loop;
  end if;
  select max((e->>'h')::float8) into v_max
    from (select jsonb_array_elements(v_ceny) e union all select jsonb_array_elements(value) from jsonb_each(v_okr)) x;
  if v_koniec is null or v_koniec not between 1 and 336 or v_koniec <= v_max then
    raise exception 'Odovzdanie záložnému maklérovi musí byť neskôr ako posledné zlacnenie (najviac 336 h).' using errcode = '22023';
  end if;
  if v_zadarmo is null or v_zadarmo not between 0 and 20 then raise exception 'Kontaktov zadarmo môže byť 0 až 20.' using errcode = '22023'; end if;
  if v_rekl is null or v_rekl not between 1 and 336 then raise exception 'Lehota na reklamáciu musí byť 1 až 336 hodín.' using errcode = '22023'; end if;
  if v_zaloha is not null and not exists (select 1 from makleri where id = v_zaloha and aktivny and kancelaria_id = moja_kancelaria()) then
    raise exception 'Záložný maklér musí byť aktívny maklér vašej kancelárie.' using errcode = '22023';
  end if;
  -- výhody zákazníkov Týpka (123); bez p.vyhody ostanú pôvodné
  select vyhody into v_vyh from kontakty_nastavenie where id = 1;
  if jsonb_typeof(p->'vyhody') = 'object' then
    foreach v_x in array array['prednost_min', 'zlava_jeden', 'zlava_oba', 'zadarmo_jeden', 'zadarmo_oba', 'mesacne_oba'] loop
      if coalesce(p->'vyhody'->>v_x, '') !~ '^\d{1,4}$' then raise exception 'Výhody: zadajte celé čísla.' using errcode = '22023'; end if;
    end loop;
    v_vyh := jsonb_build_object('prednost_min', (p->'vyhody'->>'prednost_min')::int, 'zlava_jeden', (p->'vyhody'->>'zlava_jeden')::int,
      'zlava_oba', (p->'vyhody'->>'zlava_oba')::int, 'zadarmo_jeden', (p->'vyhody'->>'zadarmo_jeden')::int,
      'zadarmo_oba', (p->'vyhody'->>'zadarmo_oba')::int, 'mesacne_oba', (p->'vyhody'->>'mesacne_oba')::int);
    if (v_vyh->>'prednost_min')::int > 1440 then raise exception 'Prednosť môže byť najviac 1 440 minút (deň).' using errcode = '22023'; end if;
    if (v_vyh->>'prednost_min')::int >= v_koniec * 60 then raise exception 'Prednosť musí byť kratšia ako čas do odovzdania záložnému maklérovi.' using errcode = '22023'; end if;
    if (v_vyh->>'zlava_jeden')::int > 90 or (v_vyh->>'zlava_oba')::int > 90 then raise exception 'Zľava môže byť najviac 90 %%.' using errcode = '22023'; end if;
    if (v_vyh->>'zadarmo_jeden')::int > 50 or (v_vyh->>'zadarmo_oba')::int > 50 then raise exception 'Kontaktov zadarmo môže byť najviac 50.' using errcode = '22023'; end if;
    if (v_vyh->>'mesacne_oba')::int > 10 then raise exception 'Mesačne zadarmo môže byť najviac 10 kontaktov.' using errcode = '22023'; end if;
  end if;
  update kontakty_nastavenie set vyhody = v_vyh, okresy = v_okresy, ceny = v_ceny, ceny_okresy = v_okr, koniec_h = v_koniec, zadarmo = v_zadarmo,
         reklamacia_h = v_rekl, zaloha_makler = v_zaloha, upravene = now()
   where id = 1;
end $$;

create or replace function public.kontakty_cennik() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'zadarmo', n.zadarmo, 'vyhody', n.vyhody, 'reklamacia_h', n.reklamacia_h, 'koniec_h', n.koniec_h, 'spolocne', n.ceny,
    'okresy', coalesce((select jsonb_object_agg(o.okres, coalesce(case when jsonb_typeof(n.ceny_okresy->o.okres) = 'array'
                                                                         and jsonb_array_length(n.ceny_okresy->o.okres) > 0 then n.ceny_okresy->o.okres end, n.ceny))
                        from (select okres from _okresy_sr() okres) o), '{}'::jsonb))
  from kontakty_nastavenie n where n.id = 1
$$;


revoke execute on function public._kontakty_uroven(bigint), public._kontakty_vyhoda(bigint), public._kontakt_cena_k(integer, integer),
  public._kontakty_zadarmo_start(bigint), public._kontakty_zadarmo_mesiac(bigint), public._kontakty_zadarmo(bigint),
  public._kontakty_kupci_vyhoda(text), public._kontakt_oznam(bigint) from public, anon, authenticated;

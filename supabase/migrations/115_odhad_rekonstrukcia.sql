-- Odhad hodnoty: pri byte sa formulár pýta, čo je prerobené (elektroinštalácia, bytové jadro, podlahy, kuchynská linka)
-- a kedy prebehla rekonštrukcia (rozhodnutie 5. 11. 2026 – „budeme to brať do úvahy“).
-- Pýta sa pri stave Po kompletnej rekonštrukcii / Čiastočne zrekonštruovaný / Pôvodný, udržiavaný (nie pri novostavbe a „na rekonštrukciu“).
-- Medián okresu sa potom upraví podľa častí: všetko pôvodné −10 %, každá nová časť +5 % (všetko nové +10 %),
-- „Neviem“ = polovica, rekonštrukcia z rokov 2010 – 2015 alebo staršia = polovica, neviem kedy = tri štvrtiny.
-- Bez týchto údajov (staršie žiadosti) platí úprava len podľa stavu (113).

alter table public.odhady_hodnoty add column if not exists rekonstrukcia jsonb;
comment on column public.odhady_hodnoty.rekonstrukcia is 'Byt: elektro/jadro/podlahy/kuchyna = nove|povodne|neviem, kedy = 2021+|2016-2020|2010-2015|pred-2010|neviem';

-- očistí údaje z formulára (len povolené kľúče a hodnoty)
create or replace function public._odhad_rek(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'elektro', case when p->>'elektro' in ('nove', 'povodne', 'neviem') then p->>'elektro' end,
    'jadro',   case when p->>'jadro'   in ('nove', 'povodne', 'neviem') then p->>'jadro' end,
    'podlahy', case when p->>'podlahy' in ('nove', 'povodne', 'neviem') then p->>'podlahy' end,
    'kuchyna', case when p->>'kuchyna' in ('nove', 'povodne', 'neviem') then p->>'kuchyna' end,
    'kedy',    case when p->>'kedy' in ('2021+', '2016-2020', '2010-2015', 'pred-2010', 'neviem') then p->>'kedy' end)), '{}'::jsonb)
  where jsonb_typeof(p) = 'object'
$$;

-- „Nové: elektroinštalácia, bytové jadro. Pôvodné: podlahy. Neviem: kuchynská linka. Rekonštrukcia: 2016 – 2020“
create or replace function public._odhad_rek_text(p jsonb) returns text
language sql immutable set search_path = public as $$
  with c(k, n, i) as (values ('elektro', 'elektroinštalácia', 1), ('jadro', 'bytové jadro', 2), ('podlahy', 'podlahy', 3), ('kuchyna', 'kuchynská linka', 4))
  select nullif(concat_ws('. ',
    'Nové: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'nove'),
    'Pôvodné: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'povodne'),
    'Neviem: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'neviem'),
    'Rekonštrukcia: ' || case p->>'kedy' when '2021+' then '2021 a neskôr' when '2016-2020' then '2016 – 2020' when '2010-2015' then '2010 – 2015'
                                         when 'pred-2010' then 'pred rokom 2010' when 'neviem' then 'nevie kedy' end), '')
$$;

-- úprava ceny v percentách: podľa prerobených častí, inak podľa stavu
create or replace function public._odhad_uprava(p_stav text, p jsonb) returns integer
language plpgsql immutable set search_path = public as $$
declare n numeric := 0; pocet int := 0; v text; k numeric;
begin
  if p_stav = 'Novostavba' or p_stav = 'Na rekonštrukciu' or p is null then return _odhad_stav_uprava(p_stav); end if;
  foreach v in array array[p->>'elektro', p->>'jadro', p->>'podlahy', p->>'kuchyna'] loop
    if v = 'nove' then n := n + 1; pocet := pocet + 1;
    elsif v = 'neviem' then n := n + 0.5; pocet := pocet + 1;
    elsif v = 'povodne' then pocet := pocet + 1; end if;
  end loop;
  if pocet < 4 then return _odhad_stav_uprava(p_stav); end if;
  k := case p->>'kedy' when '2010-2015' then 0.5 when 'pred-2010' then 0.5 when 'neviem' then 0.75 else 1 end;
  return round(-10 + 5 * n * k);
end $$;

-- medián okresu × plocha × úprava (113) – úprava už aj podľa prerobených častí
create or replace function public._odhad_median(o public.odhady_hodnoty) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m2 numeric; v_dat date; v_zdroj text; v_obl text; v_up int; v_m2u numeric; v_stred numeric; v_nove int;
begin
  if o.typ is distinct from 'byt' or o.okres is null then return null; end if;
  if o.okres in ('Bratislava', 'Košice') then
    select round(avg(m.cena_m2)), max(m.k_datumu), max(m.zdroj) into v_m2, v_dat, v_zdroj
      from odhad_mediany m where m.typ = 'byt' and m.okres ~ ('^' || o.okres || ' [IV]+$');
    v_obl := o.okres;
  else
    select m.cena_m2, m.k_datumu, m.zdroj into v_m2, v_dat, v_zdroj
      from odhad_mediany m where m.typ = 'byt' and m.okres = o.okres;
    v_obl := 'okres ' || o.okres;
  end if;
  if v_m2 is null then return null; end if;
  v_up := _odhad_uprava(o.stav_nehn, o.rekonstrukcia);
  v_m2u := round(v_m2 * (100 + v_up) / 100.0);
  v_stred := case when o.plocha > 0 then round(v_m2u * o.plocha, -3) end;
  select count(*) into v_nove from jsonb_each_text(coalesce(o.rekonstrukcia, '{}')) e where e.key <> 'kedy' and e.value = 'nove';
  return jsonb_build_object(
    'oblast', v_obl, 'm2', v_m2, 'uprava', v_up, 'stav', o.stav_nehn, 'm2_upr', v_m2u,
    'podla_casti', coalesce(o.rekonstrukcia ?& array['elektro', 'jadro', 'podlahy', 'kuchyna'], false) and o.stav_nehn not in ('Novostavba', 'Na rekonštrukciu'),
    'nove', case when o.rekonstrukcia is not null then v_nove end,
    'kedy', o.rekonstrukcia->>'kedy',
    'stred', v_stred,
    'od', case when v_stred is not null then round(v_stred * 0.95, -3) end,
    'do', case when v_stred is not null then round(v_stred * 1.05, -3) end,
    'zdroj', v_zdroj, 'k_datumu', v_dat);
end $$;

-- PDF odhadu: aj prerobené časti bytu
create or replace function public.odhad_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o odhady_hodnoty; v_m uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into o from odhady_hodnoty where list_token = p_token;
  if o.id is null or o.cena_od is null then return null; end if;
  v_m := coalesce(o.email_kto, o.makler_id);
  return jsonb_build_object(
    'odhad', jsonb_strip_nulls(jsonb_build_object('nazov', o.nazov, 'typ', o.typ, 'obec', o.obec, 'okres', o.okres, 'cast_obce', o.cast_obce,
       'ulica', o.ulica, 'cislo', o.cislo, 'plocha', o.plocha, 'pozemok', o.pozemok, 'izby', o.izby, 'poschodie', o.poschodie, 'poschodi', o.poschodi,
       'druh_pozemku', o.druh_pozemku, 'popis', o.popis, 'stav_nehn', o.stav_nehn, 'rekonstrukcia', o.rekonstrukcia, 'siete', to_jsonb(o.siete), 'doplnky', to_jsonb(o.doplnky),
       'meno', o.meno, 'cena_od', o.cena_od, 'cena_do', o.cena_do, 'text', o.text_klientovi,
       'datum', coalesce(o.email_odoslany, o.upravene))),
    'porovnanie', case when o.pdf_porovnanie then _odhad_podobne(o, 6) end,
    'makler', verejny_makler(v_m),
    'kancelaria_id', o.kancelaria_id, 'kanc', _kancelaria_verejne(o.kancelaria_id));
end $$;

-- formulár: prerobené časti a rok rekonštrukcie (inak bez zmeny oproti 114)
create or replace function public.odhad_ziadost(p_udaje jsonb, p_overenie jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  STAVY constant text[] := array['Novostavba', 'Po kompletnej rekonštrukcii', 'Čiastočne zrekonštruovaný', 'Pôvodný, udržiavaný', 'Na rekonštrukciu'];
  DOVODY constant text[] := array['Zvažujem predaj', 'Mám záujem aj o ponuku na výkup', 'Len informatívne, zaujíma ma hodnota',
                                  'Vyporiadanie BSM, rozvod alebo delenie majetku', 'Iný dôvod'];
  DRUHY constant text[] := array['Stavebný', 'Záhrada', 'Orná pôda alebo lúka', 'Iný alebo neviem'];
  SIETE constant text[] := array['Elektrina', 'Voda', 'Kanalizácia', 'Plyn', 'Žiadne siete', 'Neviem'];
  DOPLNKY constant text[] := array['Balkón alebo loggia', 'Pivnica', 'Výťah', 'Garáž alebo parkovanie', 'Zateplený dom', 'Garáž', 'Terasa',
                                   'Zateplenie', 'Nové kúrenie', 'Prístup po spevnenej ceste', 'Rovinatý', 'Vydané stavebné povolenie'];
  v_typ text := case when p_udaje->>'typ' in ('byt', 'dom', 'pozemok', 'ine') then p_udaje->>'typ' end;
  v_obec text := _odhad_txt(p_udaje->>'obec', 60);
  v_okres text := _odhad_txt(p_udaje->>'okres', 60);
  v_kraj text; v_cast text := _odhad_txt(p_udaje->>'cast_obce', 60);
  v_ulica text := _odhad_txt(p_udaje->>'ulica', 80);
  v_cislo text := _odhad_txt(p_udaje->>'cislo', 15);
  v_plocha numeric; v_pozemok numeric; v_izby text; v_posch integer; v_posch_sp integer;
  v_druh text; v_popis text := _odhad_txt(p_udaje->>'popis', 120);
  v_stav text := _odhad_txt(p_udaje->>'stav', 40);
  v_rek jsonb;
  v_siete text[]; v_doplnky text[];
  v_dovod text := _odhad_txt(p_udaje->>'dovod', 80);
  v_pozn text := nullif(left(btrim(coalesce(p_udaje->>'poznamka', '')), 1000), '');
  v_kedy text := case when p_udaje->>'kedy_predat' in ('Čo najskôr', 'Do 3 mesiacov', 'Do roka', 'Zatiaľ len zisťujem') then p_udaje->>'kedy_predat' end;
  v_volat text := case when p_udaje->>'kedy_volat' in ('Doobeda', 'Poobede', 'Kedykoľvek', 'Radšej e-mailom') then p_udaje->>'kedy_volat' end;
  v_fotky int := case when coalesce(p_udaje->>'fotky', '') ~ '^[0-9]{1,2}$' then least((p_udaje->>'fotky')::int, 6) else 0 end;
  v_tok text; v_cesta text;
  v_meno text := _odhad_txt(p_udaje->>'meno', 80);
  v_tel text := _odhad_txt(p_udaje->>'telefon', 25);
  v_email text := lower(_odhad_txt(p_udaje->>'email', 120));
  v_odkial text := _odhad_txt(p_udaje->>'odkial', 300);
  v_odtlacok text := _klient_odtlacok();
  v_hodina int; v_komu uuid; v_auto jsonb; v_nazov text; v_kontakt_id bigint; v_id bigint; v_prip bigint; v_text text;
begin
  -- pasca na roboty: skryté pole vyplní len robot → tváriť sa ako úspech, nič neuložiť
  if coalesce(p_overenie->>'med', '') <> '' then return jsonb_build_object('ok', true); end if;
  select count(*) into v_hodina from odhady_hodnoty where vytvorene > now() - interval '1 hour';
  if v_hodina >= 200 then raise exception 'Príliš veľa žiadostí naraz. Skúste to o chvíľu.' using errcode = '54000'; end if;
  perform _portal_overenie2('odhad', 'odhad', p_overenie, case when v_hodina >= 20 then 5 else 4 end);

  if v_typ is null then raise exception 'Vyberte, čo chcete oceniť.' using errcode = '22023'; end if;
  -- obec zo zoznamu obcí a mestských častí SR
  if v_obec is null then raise exception 'Vyberte obec.' using errcode = '22023'; end if;
  select l.nazov, l.okres, l.kraj into v_obec, v_okres, v_kraj from lokality l
   where l.typ in ('obec', 'cast') and _bez_diakritiky(l.nazov) = _bez_diakritiky(v_obec)
   order by (l.okres = v_okres) is true desc, (l.nazov = v_obec) desc, l.mesto desc nulls last limit 1;
  if not found then raise exception 'Vyberte obec zo zoznamu.' using errcode = '22023'; end if;
  if v_typ in ('byt', 'dom') and v_ulica is null then raise exception 'Napíšte ulicu.' using errcode = '22023'; end if;

  -- veľkosť
  if v_typ = 'byt' then
    v_plocha := _odhad_cislo(p_udaje->>'plocha', 10, 1000);
    if v_plocha is null then raise exception 'Napíšte výmeru bytu (10 – 1 000 m²).' using errcode = '22023'; end if;
    v_izby := case when p_udaje->>'izby' in ('1', '2', '3', '4', '5 a viac') then p_udaje->>'izby' end;
    if v_izby is null then raise exception 'Vyberte počet izieb.' using errcode = '22023'; end if;
    v_posch := _odhad_cislo(p_udaje->>'poschodie', -1, 30)::integer;
    if v_posch is null then raise exception 'Napíšte poschodie (prízemie = 0).' using errcode = '22023'; end if;
    v_posch_sp := _odhad_cislo(p_udaje->>'poschodi', 1, 30)::integer;
    if v_posch_sp is not null and v_posch_sp < v_posch then raise exception 'Poschodie nemôže byť vyššie ako počet poschodí domu.' using errcode = '22023'; end if;
  elsif v_typ = 'dom' then
    v_plocha := _odhad_cislo(p_udaje->>'plocha', 20, 3000);
    if v_plocha is null then raise exception 'Napíšte úžitkovú plochu domu (20 – 3 000 m²).' using errcode = '22023'; end if;
    v_pozemok := _odhad_cislo(p_udaje->>'pozemok', 0, 200000);
    v_izby := case when p_udaje->>'izby' in ('2 a menej', '3', '4', '5', '6 a viac') then p_udaje->>'izby' end;
    if v_izby is null then raise exception 'Vyberte počet izieb.' using errcode = '22023'; end if;
  elsif v_typ = 'pozemok' then
    v_plocha := _odhad_cislo(p_udaje->>'plocha', 10, 10000000);
    if v_plocha is null then raise exception 'Napíšte výmeru pozemku v m².' using errcode = '22023'; end if;
    v_druh := case when p_udaje->>'druh_pozemku' = any(DRUHY) then p_udaje->>'druh_pozemku' end;
    if v_druh is null then raise exception 'Vyberte druh pozemku.' using errcode = '22023'; end if;
  else
    if v_popis is null then raise exception 'Napíšte, čo chcete oceniť.' using errcode = '22023'; end if;
    v_plocha := _odhad_cislo(p_udaje->>'plocha', 1, 100000);
  end if;

  -- stav, siete, doplnky
  if v_typ = 'pozemok' then
    select coalesce(array_agg(distinct x), '{}') into v_siete from jsonb_array_elements_text(case when jsonb_typeof(p_udaje->'siete') = 'array' then p_udaje->'siete' else '[]' end) x where x = any(SIETE);
    if cardinality(v_siete) = 0 then raise exception 'Vyberte siete na pozemku (alebo „Neviem“).' using errcode = '22023'; end if;
    v_stav := null;
  else
    if not (v_stav = any(STAVY)) then raise exception 'Vyberte stav nehnuteľnosti.' using errcode = '22023'; end if;
    v_siete := '{}';
    -- byt: čo je prerobené a kedy (pri novostavbe a „na rekonštrukciu“ sa nepýtame)
    if v_typ = 'byt' and v_stav in ('Po kompletnej rekonštrukcii', 'Čiastočne zrekonštruovaný', 'Pôvodný, udržiavaný') then
      v_rek := _odhad_rek(p_udaje->'rekonstrukcia');
    end if;
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_doplnky from jsonb_array_elements_text(case when jsonb_typeof(p_udaje->'doplnky') = 'array' then p_udaje->'doplnky' else '[]' end) x where x = any(DOPLNKY);
  if not (v_dovod = any(DOVODY)) then raise exception 'Vyberte, prečo chcete odhad.' using errcode = '22023'; end if;

  -- kontakt
  if v_meno is null or length(v_meno) < 2 then raise exception 'Napíšte svoje meno.' using errcode = '22023'; end if;
  v_tel := coalesce(_tel_norm(v_tel), case when regexp_replace(coalesce(v_tel, ''), '[\s/.-]', '', 'g') ~ '^\+\d{9,15}$' then regexp_replace(v_tel, '[\s/.-]', '', 'g') end);
  if v_tel is null then raise exception 'Skontrolujte telefónne číslo.' using errcode = '22023'; end if;
  if v_email is null or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$' then
    raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  end if;

  -- z jedného miesta najviac 5 žiadostí za hodinu; dvojklik / opakované odoslanie tej istej žiadosti sa neuloží druhýkrát
  perform pg_advisory_xact_lock(918277, hashtext(coalesce(v_odtlacok, v_email)));
  if v_odtlacok is not null and (select count(*) from odhady_hodnoty where odtlacok = v_odtlacok and vytvorene > now() - interval '1 hour') >= 5 then
    raise exception 'Príliš veľa žiadostí naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  select id, makler_id into v_id, v_komu from odhady_hodnoty
   where email = v_email and typ = v_typ and obec = v_obec and coalesce(ulica, '') = coalesce(v_ulica, '') and vytvorene > now() - interval '15 minutes'
   order by id desc limit 1;

  if v_id is null then
    v_komu := _odhad_makler(v_obec, v_okres);
    if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;
    if v_typ in ('byt', 'dom', 'pozemok') then v_auto := _odhad_ceny(v_typ, v_obec, v_plocha); end if;
    v_nazov := _odhad_nazov(v_typ, v_izby, v_druh, v_popis, v_plocha, v_pozemok, v_obec, v_okres);
    v_text := concat_ws('. ', 'Odhad hodnoty: ' || v_nazov,
                        concat_ws(', ', v_ulica || coalesce(' ' || v_cislo, ''), v_cast), v_stav, _odhad_rek_text(v_rek),
                        case when cardinality(v_siete) > 0 then 'Siete: ' || array_to_string(v_siete, ', ') end,
                        case when cardinality(v_doplnky) > 0 then array_to_string(v_doplnky, ', ') end,
                        'Dôvod: ' || v_dovod, case when v_kedy is not null then 'Predať: ' || lower(v_kedy) end,
                        case when v_volat is not null then 'Volať: ' || lower(v_volat) end, 'E-mail: ' || v_email, v_pozn,
                        case when v_auto is not null then _odhad_text(v_auto) end);

    insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, odkial, portal)
    values (null, v_komu, 'odhad', v_meno, v_tel, left(v_text, 1500), v_odtlacok, true)
    returning id into v_kontakt_id;

    insert into odhady_hodnoty (makler_id, web_kontakt_id, typ, nazov, kraj, okres, obec, cast_obce, ulica, cislo, plocha, pozemok, izby, poschodie, poschodi,
                        druh_pozemku, popis, stav_nehn, siete, doplnky, dovod, poznamka, meno, telefon, email, odkial, odtlacok, auto, potvrdenie_poslat,
                        kedy_predat, kedy_volat, rekonstrukcia)
    values (v_komu, v_kontakt_id, v_typ, v_nazov, v_kraj, v_okres, v_obec, v_cast, v_ulica, v_cislo, v_plocha, v_pozemok, v_izby, v_posch, v_posch_sp,
            v_druh, case when v_typ = 'ine' then v_popis end, v_stav, v_siete, v_doplnky, v_dovod, v_pozn, v_meno, v_tel, v_email, v_odkial, v_odtlacok, v_auto, true,
            v_kedy, v_volat, v_rek)
    returning id into v_id;

    -- predávajúci v adresári kancelárie (ako pri „Chcem predať“ na portáli)
    if v_tel ~ '^0\d{8,10}$' then
      insert into predajcovia (telefon, meno, poznamka, makler_id, upravene)
      values (v_tel, v_meno, left('Odhad hodnoty (realitnytypek.sk/odhad): ' || v_nazov || '. Dôvod: ' || v_dovod || coalesce('. ' || v_pozn, ''), 2000), v_komu, now())
      on conflict (telefon, kancelaria_id) do update set
        makler_id = coalesce(predajcovia.makler_id, excluded.makler_id),
        meno = coalesce(predajcovia.meno, excluded.meno),
        poznamka = left(coalesce(predajcovia.poznamka || E'\n', '') || excluded.poznamka, 2000),
        upravene = now();
    end if;

    insert into pripomienky (makler_id, cas, poznamka, druh, web_kontakt_id)
    values (v_komu, now(), left('Nová žiadosť o odhad hodnoty – ' || v_nazov || ': ' || v_meno || ', ' || v_tel || '. ' || v_dovod ||
            case when v_dovod like 'Vyporiadanie%' then ' (spoplatnené – povedz klientovi cenu vopred)' else '' end || '.' ||
            case when v_kedy is not null then ' Predať: ' || lower(v_kedy) || '.' else '' end ||
            case when v_volat is not null then ' Volať: ' || lower(v_volat) || '.' else '' end, 500), 'web', v_kontakt_id)
    returning id into v_prip;
    update push_fronta set titul = case when v_kedy = 'Čo najskôr' then '🔥 Odhad hodnoty – chce predať čo najskôr'
                                        when v_dovod like '%výkup%' then '📈 Odhad hodnoty + záujem o výkup' else '📈 Nová žiadosť o odhad hodnoty' end,
                           url = './#odhady/' || v_id
     where odoslane is null and tag = 'typek-kontakt-' || v_prip;
  end if;

  -- fotky: jednorazové povolenie nahrať najviac 6 fotiek do priečinka <id>/<kľúč>/ (platí hodinu, v databáze len odtlačok kľúča)
  if v_fotky > 0 then
    v_tok := encode(extensions.gen_random_bytes(16), 'hex');
    v_cesta := v_id || '/' || v_tok;
    update odhady_hodnoty set fotky_token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex'), fotky_do = now() + interval '1 hour', fotky_cesta = v_cesta
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'obec', v_obec, 'okres', v_okres,
    'fotky', case when v_tok is not null then jsonb_build_object('id', v_id, 'token', v_tok, 'cesta', v_cesta) end,
    'pokryte', coalesce((select odhad_pokrytie() ? v_okres), false));
end $$;

revoke execute on function public._odhad_rek(jsonb), public._odhad_rek_text(jsonb), public._odhad_uprava(text, jsonb) from public, anon, authenticated;

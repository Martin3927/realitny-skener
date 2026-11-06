-- Kontakty na predaj: cena podľa okresu (6. 11. 2026, používateľ: „daj mi ešte možnosti nastaviť cenu pri okresoch zvlášť“)
--  * kontakty_nastavenie.ceny_okresy = { "Spišská Nová Ves": [{"h":0,"c":60}, …], … } – okres bez vlastných cien má spoločné ceny
--  * žiadosť si pri vzniku uloží ceny svojho okresu (trh_ceny), neskoršia zmena sa jej netýka
--  * vlastné ceny okresu ostanú uložené, aj keď okres na chvíľu vypneš

alter table public.kontakty_nastavenie add column if not exists ceny_okresy jsonb not null default '{}'::jsonb;

-- ceny pre okres (vlastné, inak spoločné)
create or replace function public._kontakty_ceny(p_okres text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(case when jsonb_typeof(n.ceny_okresy->p_okres) = 'array' and jsonb_array_length(n.ceny_okresy->p_okres) > 0 then n.ceny_okresy->p_okres end, n.ceny)
    from kontakty_nastavenie n where n.id = 1
$$;

-- kontrola zoznamu cien: prvá od 0 h, časy rastú, cena 1 – 500 € a len klesá; vráti očistený zoznam
create or replace function public._kontakty_over_ceny(p jsonb, p_kde text default '') returns jsonb
language plpgsql immutable as $$
declare v_h float8 := -1; v_c int := 100000; e jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 8 then
    raise exception '%Zadajte 1 až 8 cien.', p_kde using errcode = '22023';
  end if;
  for e in select x from jsonb_array_elements(p) x loop
    if coalesce(e->>'h', '') !~ '^\d{1,3}(\.\d+)?$' or coalesce(e->>'c', '') !~ '^\d{1,3}$' then
      raise exception '%Cena musí byť celé číslo a čas v hodinách.', p_kde using errcode = '22023';
    end if;
    if v_h < 0 and (e->>'h')::float8 <> 0 then raise exception '%Prvá cena musí platiť od 0 hodín.', p_kde using errcode = '22023'; end if;
    if (e->>'h')::float8 <= v_h then raise exception '%Časy cien musia ísť za sebou (0, 4, 12…).', p_kde using errcode = '22023'; end if;
    if (e->>'c')::int < 1 or (e->>'c')::int > 500 then raise exception '%Cena musí byť od 1 do 500 €.', p_kde using errcode = '22023'; end if;
    if (e->>'c')::int > v_c then raise exception '%Cena môže časom len klesať.', p_kde using errcode = '22023'; end if;
    v_h := (e->>'h')::float8; v_c := (e->>'c')::int;
  end loop;
  return (select jsonb_agg(jsonb_build_object('h', (x->>'h')::numeric, 'c', (x->>'c')::int)) from jsonb_array_elements(p) x);
end $$;

-- odhad_ziadost (117 + ceny podľa okresu: _kontakty_ceny)
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
  v_trh bigint; v_start timestamptz; n kontakty_nastavenie;
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
    if v_typ in ('byt', 'dom', 'pozemok') then v_auto := _odhad_ceny(v_typ, v_obec, v_plocha); end if;
    v_nazov := _odhad_nazov(v_typ, v_izby, v_druh, v_popis, v_plocha, v_pozemok, v_obec, v_okres);
    v_trh := _kontakty_trh_pre(v_okres);

    if v_trh is not null then
      -- kontakt na predaj (117): žiadosť zatiaľ nikto nevidí, kancelárie s okresom dostanú náhľad bez osobných údajov
      select * into n from kontakty_nastavenie where id = 1;
      v_start := _kontakt_start(now());
      perform set_config('typek.trh', 'ano', true);
      insert into odhady_hodnoty (kancelaria_id, makler_id, web_kontakt_id, typ, nazov, kraj, okres, obec, cast_obce, ulica, cislo, plocha, pozemok, izby, poschodie, poschodi,
                          druh_pozemku, popis, stav_nehn, siete, doplnky, dovod, poznamka, meno, telefon, email, odkial, odtlacok, auto, potvrdenie_poslat,
                          kedy_predat, kedy_volat, rekonstrukcia, trh_od, trh_koniec, trh_ceny)
      values (v_trh, null, null, v_typ, v_nazov, v_kraj, v_okres, v_obec, v_cast, v_ulica, v_cislo, v_plocha, v_pozemok, v_izby, v_posch, v_posch_sp,
              v_druh, case when v_typ = 'ine' then v_popis end, v_stav, v_siete, v_doplnky, v_dovod, v_pozn, v_meno, v_tel, v_email, v_odkial, v_odtlacok, v_auto, true,
              v_kedy, v_volat, v_rek, v_start, v_start + n.koniec_h * interval '1 hour', _kontakty_ceny(v_okres))
      returning id into v_id;
      perform _kontakt_oznam(v_id);
    else
      v_komu := _odhad_makler(v_obec, v_okres);
      if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;
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

create or replace function public.kontakty_sprava() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n kontakty_nastavenie;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select * into n from kontakty_nastavenie where id = 1;
  return jsonb_build_object(
    'nastavenie', jsonb_build_object('okresy', n.okresy, 'ceny', n.ceny, 'ceny_okresy', n.ceny_okresy, 'koniec_h', n.koniec_h, 'zadarmo', n.zadarmo,
                                     'reklamacia_h', n.reklamacia_h, 'zaloha_makler', n.zaloha_makler, 'upravene', n.upravene),
    'zaloha', (select jsonb_build_object('id', m.id, 'meno', m.meno) from makleri m where m.id = _kontakty_zaloha()),
    'zalohy', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'meno', m.meno) order by m.meno)
                          from makleri m where m.aktivny and m.kancelaria_id = moja_kancelaria()), '[]'::jsonb),
    'vsetky_okresy', coalesce((select jsonb_agg(o order by o) from (select distinct okres o from lokality where typ = 'obec' and okres is not null) x), '[]'::jsonb),
    'pokrytie', coalesce((select jsonb_object_agg(o, (select count(*) from _kontakty_kancelarie(o))) from (select distinct unnest(k.okresy) o from kancelarie k where k.aktivna) x), '{}'::jsonb),
    'kancelarie', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nazov', k.nazov, 'okresy', k.okresy, 'aktivna', k.aktivna,
        'kredit', _kontakty_kredit(k.id), 'zadarmo', _kontakty_zadarmo(k.id),
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
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_okresy
    from jsonb_array_elements_text(case when jsonb_typeof(p->'okresy') = 'array' then p->'okresy' else '[]' end) x;
  if exists (select 1 from unnest(v_okresy) x where not exists (select 1 from lokality l where l.typ = 'obec' and l.okres = x)) then
    raise exception 'Neznámy okres.' using errcode = '22023';
  end if;
  v_ceny := _kontakty_over_ceny(p->'ceny');
  -- vlastné ceny okresov (prázdny zoznam = spoločné ceny)
  if jsonb_typeof(p->'ceny_okresy') = 'object' then
    for r in select key, value from jsonb_each(p->'ceny_okresy') loop
      continue when jsonb_typeof(r.value) <> 'array' or jsonb_array_length(r.value) = 0;
      if not exists (select 1 from lokality l where l.typ = 'obec' and l.okres = r.key) then raise exception 'Neznámy okres.' using errcode = '22023'; end if;
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
  update kontakty_nastavenie set okresy = v_okresy, ceny = v_ceny, ceny_okresy = v_okr, koniec_h = v_koniec, zadarmo = v_zadarmo,
         reklamacia_h = v_rekl, zaloha_makler = v_zaloha, upravene = now()
   where id = 1;
end $$;

revoke execute on function public._kontakty_ceny(text), public._kontakty_over_ceny(jsonb, text) from public, anon, authenticated;

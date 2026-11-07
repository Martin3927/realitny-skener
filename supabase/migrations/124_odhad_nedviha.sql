-- Odhad hodnoty: „Nedvíha“, kontrola telefónu a opakované žiadosti (7. 11. 2026, používateľ: „keby sa nedalo dovolať pošleme email, že sa nevieme skontaktovať“)
--  * odhad_nedviha(id): maklér zapíše, že klient nedvíha → klientovi raz za žiadosť odíde e-mail „nezastihli sme vás“ (od makléra, odpoveď ide maklérovi),
--    žiadosť si pamätá počet pokusov a čas, pripomienka „Znova zavolať“ ako pri skeneri (_cas_volat_znova: o 2 h, najneskôr 19:00, inak ráno 8:00)
--    do zvončeka aj mobilu; pripomienka sa zruší, keď žiadosť medzitým prešla ďalej (stav) alebo ju má iný maklér
--  * záznam slúži aj hlavnému správcovi pri reklamácii kontaktu (kontakty_nedviha_info); pravidlá reklamácie sa NEMENIA –
--    podľa podmienok (časť 10) nie je to, že klient nedvíha, dôvodom na reklamáciu
--  * telefón vo formulári odhadu: slovenské číslo musí mať 10 číslic (0905 123 456 / +421 905 123 456), české +420 a 9 číslic, iné krajiny s predvoľbou
--  * opakovaná žiadosť toho istého klienta (telefón alebo e-mail) v tom istom okrese za 30 dní sa druhýkrát nepredáva (odhad_ziadost)

alter table public.odhady_hodnoty
  add column if not exists nedviha_pocet integer not null default 0,
  add column if not exists nedviha_posledne timestamptz,
  add column if not exists nedviha_email_poslat boolean not null default false,
  add column if not exists nedviha_email_kto uuid,
  add column if not exists nedviha_email_odoslane timestamptz,
  add column if not exists nedviha_email_chyba text,
  add column if not exists opakovana_z bigint references public.odhady_hodnoty(id) on delete set null;
create index if not exists odhady_nedviha_email on public.odhady_hodnoty (id) where nedviha_email_poslat;
create index if not exists odhady_tel_okres on public.odhady_hodnoty (telefon, okres, vytvorene desc);

alter table public.pripomienky add column if not exists odhad_id bigint references public.odhady_hodnoty(id) on delete cascade;
create index if not exists pripomienky_odhad on public.pripomienky (odhad_id) where odhad_id is not null;

-- ---------------------------------------------------------------- telefón klienta (formulár odhadu)
-- SK: 0 + 9 číslic (aj bez nuly „905 123 456“, aj s +421/00421) → 0905123456; CZ +420 + 9 číslic; iné krajiny + predvoľba a 7 – 14 číslic
create or replace function public._odhad_tel(t text) returns text
language sql immutable set search_path = public as $$
  select case
    when r ~ '^(\+|00)421[0-9]{9}$' then '0' || right(r, 9)
    when r ~ '^(\+|00)4210[0-9]{9}$' then '0' || right(r, 9)   -- „+421 0905 …“
    when r ~ '^0[1-9][0-9]{8}$' then r
    when r ~ '^9[0-9]{8}$' then '0' || r
    when r ~ '^(\+|00)420[0-9]{9}$' then '+420' || right(r, 9)
    when r ~ '^(\+|00)(42[01])' then null
    when r ~ '^(\+|00)[1-9][0-9]{6,13}$' then '+' || regexp_replace(r, '^(\+|00)', '')
  end
  from (select regexp_replace(coalesce(t, ''), '[\s/.()-]', '', 'g') r) x
$$;

-- ---------------------------------------------------------------- odhad_ziadost (118 + telefón _odhad_tel + opakované žiadosti)
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
  v_pred bigint; v_pred_k bigint; v_pred_m uuid; v_pred_cas timestamptz; v_opak text;
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
  v_tel := _odhad_tel(v_tel);
  if v_tel is null then raise exception 'Skontrolujte telefónne číslo – napríklad 0905 123 456 alebo +421 905 123 456.' using errcode = '22023'; end if;
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

    -- (124) ten istý klient (telefón alebo e-mail) v tom istom okrese za 30 dní: kontakt sa druhýkrát nepredáva.
    -- Nová žiadosť ide maklérovi, ktorý má predchádzajúcu; keď je predchádzajúca ešte na predaji, ide záložnému maklérovi na kontrolu.
    if v_trh is not null then
      select o.id, o.kancelaria_id, o.makler_id, o.vytvorene into v_pred, v_pred_k, v_pred_m, v_pred_cas
        from odhady_hodnoty o
       where (o.telefon = v_tel or o.email = v_email) and o.okres = v_okres and o.vytvorene > now() - interval '30 days'
       order by o.id desc limit 1;
      if v_pred is not null then
        v_komu := case when v_pred_k is distinct from v_trh then (select m.id from makleri m where m.id = v_pred_m and m.aktivny) end;
        v_opak := 'Opakovaná žiadosť – klient už žiadal odhad ' || to_char(v_pred_cas at time zone 'Europe/Bratislava', 'FMDD. FMMM.') ||
                  case when v_komu is null and v_pred_k is not distinct from v_trh then ' a tá je ešte na predaji. Táto na predaj nešla – skontroluj, či nejde o tú istú nehnuteľnosť.'
                       else '. Na predaj nešla, patrí k predchádzajúcej.' end;
        v_komu := coalesce(v_komu, _kontakty_zaloha());
        v_trh := null;
      end if;
    end if;

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
      v_komu := coalesce(v_komu, _odhad_makler(v_obec, v_okres));
      if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;
      v_text := concat_ws('. ', 'Odhad hodnoty: ' || v_nazov, v_opak,
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
                          kedy_predat, kedy_volat, rekonstrukcia, opakovana_z)
      values (v_komu, v_kontakt_id, v_typ, v_nazov, v_kraj, v_okres, v_obec, v_cast, v_ulica, v_cislo, v_plocha, v_pozemok, v_izby, v_posch, v_posch_sp,
              v_druh, case when v_typ = 'ine' then v_popis end, v_stav, v_siete, v_doplnky, v_dovod, v_pozn, v_meno, v_tel, v_email, v_odkial, v_odtlacok, v_auto, true,
              v_kedy, v_volat, v_rek, v_pred)
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
      values (v_komu, now(), left(coalesce('⚠️ ' || v_opak || ' ', '') || 'Nová žiadosť o odhad hodnoty – ' || v_nazov || ': ' || v_meno || ', ' || v_tel || '. ' || v_dovod ||
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

-- ---------------------------------------------------------------- „Nedvíha“
create or replace function public.odhad_nedviha(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o odhady_hodnoty := _odhad_moj(p_id);
  v_kto uuid := coalesce(o.makler_id, auth.uid());
  v_cas timestamptz := _cas_volat_znova(now());
  v_email boolean := o.email is not null and o.nedviha_email_odoslane is null and not o.nedviha_email_poslat;
begin
  if o.telefon is null then raise exception 'Klient nezadal telefón.' using errcode = '22023'; end if;
  -- staršie „Znova zavolať“ k tejto žiadosti už netreba
  update pripomienky set zrusena = now() where odhad_id = o.id and druh = 'volat' and hotovo is null and zrusena is null;
  insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh, email_odoslany, odhad_id, web_kontakt_id, kancelaria_id)
  values (v_kto, auth.uid(), v_cas,
          left('Znova zavolať: ' || o.meno || ', ' || o.telefon || ' – odhad hodnoty ' || coalesce(o.nazov, o.obec, '') || ' (nedvíhal(a) ' ||
               to_char(now() at time zone 'Europe/Bratislava', 'FMDD. FMMM. "o" HH24:MI') || ', ' || (o.nedviha_pocet + 1) || '. pokus)', 500),
          'volat', now(), o.id, o.web_kontakt_id, o.kancelaria_id);   -- e-mail maklérovi sa pri tejto pripomienke neposiela
  update odhady_hodnoty set
    nedviha_pocet = nedviha_pocet + 1, nedviha_posledne = now(),
    nedviha_email_poslat = nedviha_email_poslat or v_email,
    nedviha_email_kto = case when v_email then auth.uid() else nedviha_email_kto end,
    nedviha_email_chyba = case when v_email then null else nedviha_email_chyba end,
    upravene = now()
  where id = o.id returning * into o;
  return to_jsonb(o) || jsonb_build_object('volat_znova', v_cas, 'email_posle', v_email);   -- nie „email“ – to je e-mail klienta
end $$;
revoke execute on function public.odhad_nedviha(bigint) from public, anon;
grant execute on function public.odhad_nedviha(bigint) to authenticated;

-- každú minútu: splatné „Znova zavolať“ pri odhade → upozornenie do mobilu (pri skeneri to robí _volat_znova)
create or replace function public._odhad_volat() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0; v_vcera boolean;
begin
  if not pg_try_advisory_xact_lock(510124) then return 0; end if;
  for p in
    select r.id, r.makler_id, r.vytvorene, o.id as oid, o.stav, o.makler_id as o_makler, o.meno, o.telefon, coalesce(o.nazov, o.obec) as nazov, o.nedviha_pocet
    from pripomienky r join odhady_hodnoty o on o.id = r.odhad_id
    where r.druh = 'volat' and r.odhad_id is not null and r.hotovo is null and r.zrusena is null and r.push_odoslany is null
      and r.cas <= now() and r.cas > now() - interval '12 hours'
    order by r.cas limit 100
  loop
    -- klient sa medzitým ozval (žiadosť je ďalej) alebo žiadosť dostal iný maklér → netreba
    if p.stav not in ('nova', 'kontaktovany') or p.o_makler is distinct from p.makler_id then
      update pripomienky set zrusena = now() where id = p.id;
      continue;
    end if;
    v_vcera := (p.vytvorene at time zone 'Europe/Bratislava')::date < (now() at time zone 'Europe/Bratislava')::date;
    begin
      perform _push_zaradit(array[p.makler_id], 'pripomienky', '📞 Skús znova zavolať',
        'Odhad hodnoty · ' || coalesce(p.nazov, '') || E'\n' || p.meno ||
        case when v_vcera then ' včera o ' else ' o ' end || to_char(p.vytvorene at time zone 'Europe/Bratislava', 'HH24:MI') ||
        ' nedvíhal(a) – skús to teraz.' || case when p.nedviha_pocet >= 2 then ' Ak ani teraz, pošli SMS.' else '' end,
        './#odhady/' || p.oid, 'typek-odhad-volat-' || p.oid);
    exception when others then null;
    end;
    update pripomienky set push_odoslany = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._odhad_volat() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('odhad-volat');
exception when others then null; end $$;
select cron.schedule('odhad-volat', '* * * * *', 'select public._odhad_volat()');

-- hlavný správca pri reklamácii: koľkokrát kancelária zapísala „Nedvíha“ a či klientovi odišiel e-mail
create or replace function public.kontakty_nedviha_info(p_ids bigint[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(o.id::text, jsonb_build_object('pocet', o.nedviha_pocet, 'posledne', o.nedviha_posledne,
                     'email', o.nedviha_email_odoslane, 'email_chyba', o.nedviha_email_chyba, 'stav', o.stav))
                   from odhady_hodnoty o where o.id = any(p_ids) and o.nedviha_pocet > 0), '{}'::jsonb);
end $$;
revoke execute on function public.kontakty_nedviha_info(bigint[]) from public, anon;
grant execute on function public.kontakty_nedviha_info(bigint[]) to authenticated;

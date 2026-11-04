-- Odhad hodnoty – vyladenie (4. 11. 2026, rozhodnutia používateľa: body 2, 3, 4, 7, 9, 12, 14, 15)
--  * kedy chce klient predávať (kedy_predat) a kedy mu volať (kedy_volat); „čo najskôr“ = push „🔥 … chce predať čo najskôr“
--  * fotky od klienta: súkromné úložisko odhady-fotky, nahrať sa dá len s jednorazovým kľúčom z odhad_ziadost
--    (priečinok <id>/<kľúč>/1.jpg … 6.jpg, platí hodinu); vidí ich len maklér žiadosti a administrátor kancelárie
--  * odhad_zhody: klient už inzeruje (skener podľa telefónu alebo adresy), je v adresári predávajúcich, poslal skôr iný odhad
--  * odhad_list: verejná stránka odhadu na stiahnutie ako PDF (odkaz s náhodným kľúčom, ide aj do e-mailu klientovi)
--  * pripomienka maklérovi o 3 mesiace po odoslaní odhadu alebo pri „Bez obchodu“ (zruší sa pri zákazke alebo výkupe)

alter table public.odhady_hodnoty
  add column if not exists kedy_predat text,
  add column if not exists kedy_volat text,
  add column if not exists fotky_cesta text,
  add column if not exists fotky_token_hash text,
  add column if not exists fotky_do timestamptz,
  add column if not exists fotky integer not null default 0,
  add column if not exists list_token text,
  add column if not exists pdf_porovnanie boolean not null default true,
  add column if not exists pripomienka_neskor bigint;
create unique index if not exists odhady_hodnoty_list_token on public.odhady_hodnoty (list_token) where list_token is not null;

-- ---------------------------------------------------------------- fotky
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('odhady-fotky', 'odhady-fotky', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- nahrať smie ktokoľvek s platným jednorazovým kľúčom zo žiadosti (súbory 1.jpg až 6.jpg, bez prepisovania)
create or replace function public._odhad_fotky_smie(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_name ~ '^[0-9]{1,12}/[0-9a-f]{32}/[1-6]\.jpg$', false) and exists (
    select 1 from odhady_hodnoty o
     where o.id = split_part(p_name, '/', 1)::bigint and o.fotky_do > now()
       and o.fotky_token_hash = encode(extensions.digest(split_part(p_name, '/', 2), 'sha256'), 'hex'))
$$;
-- vidí maklér žiadosti a administrátor kancelárie (rovnako ako žiadosť samotnú)
create or replace function public._odhad_fotky_vidi(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(split_part(p_name, '/', 1) ~ '^[0-9]{1,12}$', false) and exists (
    select 1 from odhady_hodnoty o join makleri m on m.id = auth.uid() and m.aktivny
     where o.id = split_part(p_name, '/', 1)::bigint and o.kancelaria_id = aktivna_kancelaria()
       and (o.makler_id = m.id or m.rola = 'admin' or exists (select 1 from hlavni_spravcovia h where h.user_id = m.id)))
$$;
revoke execute on function public._odhad_fotky_smie(text), public._odhad_fotky_vidi(text) from public;
grant execute on function public._odhad_fotky_smie(text) to anon, authenticated;
grant execute on function public._odhad_fotky_vidi(text) to authenticated;

do $$ begin
  create policy odhady_fotky_nahrat on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'odhady-fotky' and public._odhad_fotky_smie(name));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy odhady_fotky_citat on storage.objects for select to authenticated
    using (bucket_id = 'odhady-fotky' and public._odhad_fotky_vidi(name));
exception when duplicate_object then null; end $$;

-- po nahratí stránka oznámi počet fotiek (zapíše sa k žiadosti a nahrávanie sa uzavrie)
create or replace function public.odhad_fotky_hotovo(p_id bigint, p_token text) returns integer
language plpgsql security definer set search_path = public as $$
declare o odhady_hodnoty; n int;
begin
  select * into o from odhady_hodnoty where id = p_id;
  if o.id is null or coalesce(p_token, '') !~ '^[0-9a-f]{32}$' or o.fotky_token_hash is distinct from encode(extensions.digest(p_token, 'sha256'), 'hex')
     or o.fotky_do is null or o.fotky_do < now() - interval '10 minutes' then
    raise exception 'Fotky sa nepodarilo priradiť.' using errcode = '22023';
  end if;
  select count(*) into n from storage.objects where bucket_id = 'odhady-fotky' and name like o.fotky_cesta || '/%';
  update odhady_hodnoty set fotky = n, fotky_do = least(fotky_do, now() + interval '5 minutes') where id = o.id;
  return n;
end $$;
revoke execute on function public.odhad_fotky_hotovo(bigint, text) from public;
grant execute on function public.odhad_fotky_hotovo(bigint, text) to anon, authenticated;

-- ---------------------------------------------------------------- žiadosť zo stránky (+ kedy predať, kedy volať, fotky)
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
                        concat_ws(', ', v_ulica || coalesce(' ' || v_cislo, ''), v_cast), v_stav,
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
                        kedy_predat, kedy_volat)
    values (v_komu, v_kontakt_id, v_typ, v_nazov, v_kraj, v_okres, v_obec, v_cast, v_ulica, v_cislo, v_plocha, v_pozemok, v_izby, v_posch, v_posch_sp,
            v_druh, case when v_typ = 'ine' then v_popis end, v_stav, v_siete, v_doplnky, v_dovod, v_pozn, v_meno, v_tel, v_email, v_odkial, v_odtlacok, v_auto, true,
            v_kedy, v_volat)
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
    'pokryte', coalesce((select odhad_pokrytie() ? v_okres), false),
    'makler', (select jsonb_strip_nulls(jsonb_build_object('meno', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'telefon', m.telefon,
                 'foto', case when m.foto like 'data:image/%' then m.foto end, 'pohlavie', m.pohlavie,
                 'kancelaria', coalesce(_kancelaria_verejne(m.kancelaria_id)->>'nazov', (select k.nazov from kancelarie k where k.id = m.kancelaria_id))))
               from makleri m where m.id = v_komu));
end $$;

-- ---------------------------------------------------------------- podklad zo skenera (spoločný pre aplikáciu a PDF)
create or replace function public._odhad_podobne(o public.odhady_hodnoty, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_min numeric := case when o.typ = 'pozemok' then 1 else 150 end;
  v_max numeric := case when o.typ = 'pozemok' then 1500 else 9000 end;
  v_izby int := case when o.izby ~ '^\d' then substring(o.izby from '^\d+')::int end;
  v_podtyp text := case o.druh_pozemku when 'Stavebný' then 'stavebny' when 'Záhrada' then 'zahrada' when 'Orná pôda alebo lúka' then 'poda' end;
  r jsonb;
begin
  if o.typ = 'ine' then return jsonb_build_object('stat', null, 'podobne', '[]'::jsonb); end if;
  with z as (
    select i.id, i.nazov, i.url, i.portal, i.cena, i.plocha, i.cena_m2, i.obec, i.okres, i.izby, i.aktivny, i.prvy_krat, i.naposledy, i.foto,
           i.predajca_typ, i.obec = o.obec as v_obci
      from inzeraty i
     where i.typ = o.typ and i.duplikat_z is null and i.cena_m2 between v_min and v_max and i.prvy_krat > now() - interval '12 months'
       and (i.obec = o.obec or (o.okres is not null and i.okres = o.okres))
       and (o.typ <> 'pozemok' or v_podtyp is null or coalesce(i.podtyp, 'stavebny') = v_podtyp)
       and (o.plocha is null or i.plocha between o.plocha * 0.7 and o.plocha * 1.3)
       and (o.typ <> 'byt' or v_izby is null or (case when v_izby >= 5 then i.izby >= 5 else i.izby = v_izby end))
  ), n as (select count(*) filter (where v_obci) as obec from z),
  s as (select z.* from z, n where (n.obec >= 5 and z.v_obci) or n.obec < 5)
  select jsonb_build_object(
    'stat', (select case when count(*) >= 3 then jsonb_build_object(
               'oblast', case when (select obec from n) >= 5 then o.obec else 'okres ' || coalesce(o.okres, o.obec) end, 'pocet', count(*),
               'm2', round(percentile_cont(0.5) within group (order by s.cena_m2)::numeric),
               'm2_od', round(percentile_cont(0.25) within group (order by s.cena_m2)::numeric),
               'm2_do', round(percentile_cont(0.75) within group (order by s.cena_m2)::numeric),
               'od', case when o.plocha is not null then round((percentile_cont(0.25) within group (order by s.cena_m2) * o.plocha)::numeric, -3) end,
               'do', case when o.plocha is not null then round((percentile_cont(0.75) within group (order by s.cena_m2) * o.plocha)::numeric, -3) end,
               'stred', case when o.plocha is not null then round((percentile_cont(0.5) within group (order by s.cena_m2) * o.plocha)::numeric, -3) end,
               'zmiznute', count(*) filter (where not s.aktivny)) end from s),
    'podobne', coalesce((select jsonb_agg(to_jsonb(q) order by q.v_obci desc, q.rozdiel, q.prvy_krat desc) from (
                 select z.*, abs(z.plocha - coalesce(o.plocha, z.plocha)) as rozdiel from z
                  order by z.v_obci desc, abs(z.plocha - coalesce(o.plocha, z.plocha)), z.prvy_krat desc limit p_limit) q), '[]'::jsonb))
    into r;
  return r;
end $$;

create or replace function public.odhad_podklad(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o odhady_hodnoty := _odhad_moj(p_id);
begin
  return jsonb_build_object('auto', o.auto) || _odhad_podobne(o, 12);
end $$;

-- ---------------------------------------------------------------- klient už inzeruje / je v adresári / poslal skôr iný odhad
create or replace function public.odhad_zhody(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o odhady_hodnoty := _odhad_moj(p_id);
begin
  return jsonb_build_object(
    'inzeraty', coalesce((select jsonb_agg(to_jsonb(q) order by q.aktivny desc, q.prvy_krat desc) from (
      select i.id, i.nazov, i.url, i.portal, i.cena, i.plocha, i.obec, i.ulica, i.aktivny, i.prvy_krat, i.naposledy, i.predajca, i.predajca_typ,
             case when (o.telefon is not null and (exists (select 1 from telefony t where t.inzerat_id = i.id and t.telefon = o.telefon and t.kancelaria_id = o.kancelaria_id)
                                                   or exists (select 1 from archiv a where a.inzerat_id = i.id and a.telefon = o.telefon)))
                  then 'telefon' else 'adresa' end as zhoda
        from inzeraty i
       where i.duplikat_z is null and (i.aktivny or i.naposledy > now() - interval '12 months')
         and ((o.telefon is not null and (exists (select 1 from telefony t where t.inzerat_id = i.id and t.telefon = o.telefon and t.kancelaria_id = o.kancelaria_id)
                                         or exists (select 1 from archiv a where a.inzerat_id = i.id and a.telefon = o.telefon)))
           or (o.ulica is not null and i.ulica is not null and i.typ = o.typ and i.obec = o.obec
               and _bez_diakritiky(i.ulica) like _bez_diakritiky(o.ulica) || '%'
               and (o.plocha is null or i.plocha is null or i.plocha between o.plocha * 0.85 and o.plocha * 1.15)))
       order by i.aktivny desc, i.prvy_krat desc limit 8) q), '[]'::jsonb),
    'predajca', (select jsonb_strip_nulls(jsonb_build_object('meno', p.meno, 'poznamka', left(p.poznamka, 600), 'rk', p.rk, 'nevolat', p.nevolat,
                         'makler_id', p.makler_id, 'upravene', p.upravene))
                   from predajcovia p where p.telefon = o.telefon and p.kancelaria_id = o.kancelaria_id),
    'odhady', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nazov', x.nazov, 'vytvorene', x.vytvorene, 'stav', x.stav, 'makler_id', x.makler_id) order by x.vytvorene desc)
                          from odhady_hodnoty x where x.id <> o.id and x.kancelaria_id = o.kancelaria_id
                           and ((o.telefon is not null and x.telefon = o.telefon) or (o.email is not null and x.email = o.email))), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- pripomienka o 3 mesiace a odkaz na PDF
create or replace function public._odhad_neskor(o public.odhady_hodnoty) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if o.pripomienka_neskor is not null or o.makler_id is null then return o.pripomienka_neskor; end if;
  insert into pripomienky (makler_id, cas, poznamka, druh, web_kontakt_id, kancelaria_id)
  values (o.makler_id, ((now() at time zone 'Europe/Bratislava')::date + interval '3 months' + interval '9 hours') at time zone 'Europe/Bratislava',
          left('Ozvi sa – pred 3 mesiacmi žiadal(a) o odhad hodnoty: ' || o.meno || coalesce(', ' || o.telefon, '') || '. ' || coalesce(o.nazov, o.obec) ||
               '. Možno už je rozhodnutý(á) predávať.', 500), 'pripomienka', o.web_kontakt_id, o.kancelaria_id)
  returning id into v;
  update odhady_hodnoty set pripomienka_neskor = v where id = o.id;
  return v;
end $$;

create or replace function public._odhad_po_zmene(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o odhady_hodnoty;
begin
  select * into o from odhady_hodnoty where id = p_id;
  if o.cena_od is not null and o.list_token is null then
    update odhady_hodnoty set list_token = encode(extensions.gen_random_bytes(16), 'hex') where id = o.id;
  end if;
  if o.stav in ('odoslany', 'bez_obchodu') then perform _odhad_neskor(o);
  elsif o.stav in ('zakazka', 'vykup') and o.pripomienka_neskor is not null then
    update pripomienky set zrusena = now() where id = o.pripomienka_neskor and hotovo is null and zrusena is null;
  end if;
end $$;

create or replace function public.odhad_ulozit(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o odhady_hodnoty := _odhad_moj(p_id); v_stav text; v_od integer; v_do integer;
begin
  v_stav := coalesce(nullif(p->>'stav', ''), o.stav);
  if v_stav not in ('nova', 'kontaktovany', 'odoslany', 'obhliadka', 'zakazka', 'vykup', 'bez_obchodu') then raise exception 'Neznámy stav.' using errcode = '22023'; end if;
  v_od := case when p ? 'cena_od' then _odhad_cislo(p->>'cena_od', 1, 100000000)::integer else o.cena_od end;
  v_do := case when p ? 'cena_do' then _odhad_cislo(p->>'cena_do', 1, 100000000)::integer else o.cena_do end;
  if v_od is not null and v_do is not null and v_do < v_od then raise exception 'Horná hranica odhadu je nižšia ako dolná.' using errcode = '22023'; end if;
  update odhady_hodnoty set stav = v_stav, cena_od = v_od, cena_do = v_do,
    poznamka_maklera = case when p ? 'poznamka_maklera' then nullif(left(btrim(coalesce(p->>'poznamka_maklera', '')), 3000), '') else poznamka_maklera end,
    text_klientovi = case when p ? 'text_klientovi' then nullif(left(btrim(coalesce(p->>'text_klientovi', '')), 4000), '') else text_klientovi end,
    pdf_porovnanie = case when p ? 'pdf_porovnanie' then coalesce((p->>'pdf_porovnanie')::boolean, true) else pdf_porovnanie end,
    kontaktovane = case when v_stav <> 'nova' then coalesce(kontaktovane, now()) else kontaktovane end,
    upravene = now()
  where id = o.id;
  if v_stav <> 'nova' and o.web_kontakt_id is not null then
    update web_kontakty set odpovedane = coalesce(odpovedane, now()),
           vybavene = case when v_stav in ('zakazka', 'vykup', 'bez_obchodu') then coalesce(vybavene, now()) else vybavene end
     where id = o.web_kontakt_id;
    update pripomienky set hotovo = now() where web_kontakt_id = o.web_kontakt_id and druh = 'web' and hotovo is null and zrusena is null;
  end if;
  perform _odhad_po_zmene(o.id);
  return (select to_jsonb(x) - 'odtlacok' - 'fotky_token_hash' from odhady_hodnoty x where x.id = o.id);
end $$;

create or replace function public.odhad_poslat(p_id bigint, p_od integer, p_do integer, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o odhady_hodnoty := _odhad_moj(p_id); v_od integer := _odhad_cislo(p_od::text, 1, 100000000)::integer; v_do integer := _odhad_cislo(p_do::text, 1, 100000000)::integer;
  v_text text := nullif(left(btrim(coalesce(p_text, '')), 4000), '');
begin
  if o.email is null then raise exception 'Klient nezadal e-mail – odhad mu povedzte telefonicky.' using errcode = '22023'; end if;
  if v_od is null then raise exception 'Napíšte odhadovanú cenu.' using errcode = '22023'; end if;
  if v_do is not null and v_do < v_od then raise exception 'Horná hranica odhadu je nižšia ako dolná.' using errcode = '22023'; end if;
  if v_text is null or length(v_text) < 20 then raise exception 'Napíšte klientovi pár viet k odhadu.' using errcode = '22023'; end if;
  if o.email_poslat > now() - interval '2 minutes' and o.email_odoslany is null and o.email_chyba is null then
    raise exception 'E-mail sa práve odosiela. Počkajte chvíľu.' using errcode = '22023';
  end if;
  update odhady_hodnoty set cena_od = v_od, cena_do = v_do, text_klientovi = v_text,
    email_poslat = now(), email_odoslany = null, email_chyba = null, email_kto = auth.uid(),
    stav = case when stav in ('nova', 'kontaktovany') then 'odoslany' else stav end,
    kontaktovane = coalesce(kontaktovane, now()), upravene = now()
  where id = o.id;
  if o.web_kontakt_id is not null then
    update web_kontakty set odpovedane = coalesce(odpovedane, now()) where id = o.web_kontakt_id;
    update pripomienky set hotovo = now() where web_kontakt_id = o.web_kontakt_id and druh = 'web' and hotovo is null and zrusena is null;
  end if;
  perform _odhad_po_zmene(o.id);
  perform odoslat_pripomienky();
  return (select to_jsonb(x) - 'odtlacok' - 'fotky_token_hash' from odhady_hodnoty x where x.id = o.id);
end $$;

-- verejná stránka odhadu (app.realitnytypek.sk/odhad.html?t=…) – na stiahnutie ako PDF, odkaz ide aj do e-mailu
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
       'druh_pozemku', o.druh_pozemku, 'popis', o.popis, 'stav_nehn', o.stav_nehn, 'siete', to_jsonb(o.siete), 'doplnky', to_jsonb(o.doplnky),
       'meno', o.meno, 'cena_od', o.cena_od, 'cena_do', o.cena_do, 'text', o.text_klientovi,
       'datum', coalesce(o.email_odoslany, o.upravene))),
    'porovnanie', case when o.pdf_porovnanie then _odhad_podobne(o, 6) end,
    'makler', verejny_makler(v_m),
    'kancelaria_id', o.kancelaria_id, 'kanc', _kancelaria_verejne(o.kancelaria_id));
end $$;

-- ---------------------------------------------------------------- upratovanie: žiadosti s fotkami zmaže až po zmazaní fotiek (robí funkcia pripomienky)
create or replace function public._portal_upratanie() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from portal_strazcovia where potvrdeny is null and vytvorene < now() - interval '30 days';
  delete from portal_strazcovia where odhlaseny is not null and odhlaseny < now() - interval '30 days';
  delete from portal_strazca_fronta where odoslane is not null and odoslane < now() - interval '90 days';
  delete from portal_strazca_udalosti where spracovane is not null and spracovane < now() - interval '7 days';
  update portal_strazcovia set odkial = null where odkial is not null and vytvorene < now() - interval '7 days';
  update web_kontakty set odkial = null where portal and odkial is not null and vytvorene < now() - interval '7 days';
  update odhady_hodnoty set odtlacok = null where odtlacok is not null and vytvorene < now() - interval '7 days';
  update odhady_hodnoty set fotky_token_hash = null where fotky_token_hash is not null and fotky_do < now() - interval '1 day';
  -- kontakty z portálu (dopyty, odhady, predaj) a žiadosti o odhad hodnoty najdlhšie 2 roky
  delete from odhady_hodnoty where vytvorene < now() - interval '2 years' and fotky_cesta is null;
  delete from web_kontakty where portal and vytvorene < now() - interval '2 years';
end $$;

-- ---------------------------------------------------------------- práva
revoke execute on function public._odhad_podobne(public.odhady_hodnoty, integer), public._odhad_neskor(public.odhady_hodnoty),
  public._odhad_po_zmene(bigint), public._portal_upratanie() from public, anon, authenticated;
revoke execute on function public.odhad_zhody(bigint), public.odhad_podklad(bigint), public.odhad_ulozit(bigint, jsonb),
  public.odhad_poslat(bigint, integer, integer, text) from public, anon;
grant execute on function public.odhad_zhody(bigint), public.odhad_podklad(bigint), public.odhad_ulozit(bigint, jsonb),
  public.odhad_poslat(bigint, integer, integer, text) to authenticated;
revoke execute on function public.odhad_list(text), public.odhad_ziadost(jsonb, jsonb) from public;
grant execute on function public.odhad_list(text), public.odhad_ziadost(jsonb, jsonb) to anon, authenticated;

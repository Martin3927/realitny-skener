-- Skúška 117_kontakty_trh.sql (Kontakty na predaj – žiadosti o odhad ako platené kontakty pre kancelárie).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky v komentároch „→“.
-- Oznámenia do mobilu idú len 7:00 – 21:00 (Bratislava) – v noci sú počty upozornení 0.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set K '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
\set C '00000000-0000-0000-0000-0000000000c1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'K','k@alpha.sk'), (:'B','b@inak.sk'), (:'C','c@tretia.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup, telefon) values
  (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}','0915 140 759'),
  (:'K','Kristián Alpha','k@alpha.sk','makler',true,'{inzeraty,nehnutelnosti,odhady}','0905 111 222') on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
update kontakty_nastavenie set zaloha_makler = :'A', ceny_okresy = '{}' where id = 1;   -- ceny okresov (119) skúša časť 11
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);
-- druhá kancelária (Poprad aj Spišská Nová Ves) a tretia (len Poprad)
insert into zakaznici (id, nazov, email, stav, moduly) overriding system value values
  (900, 'Iná RK', 'b@inak.sk', 'aktivny', array['skener', 'web']), (901, 'Tretia RK', 'c@tretia.sk', 'aktivny', array['web']) on conflict do nothing;
insert into kancelarie (id, nazov, typ, zakaznik_id, okresy, sekcie, aktivna, slug) values
  (20, 'Iná RK', 'kancelaria', 900, '{Poprad,Spišská Nová Ves}', _sekcie_z_modulov(array['skener', 'web']), true, 'ina'),
  (30, 'Tretia RK', 'kancelaria', 901, '{Poprad}', _sekcie_z_modulov(array['web']), true, 'tretia') on conflict do nothing;
select kancelaria_trh as "TRH" from kontakty_nastavenie \gset
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values
  (:'B','Beáta Iná','b@inak.sk','admin',true,20), (:'C','Cyril Tretí','c@tretia.sk','admin',true,30) on conflict do nothing;
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, cena, obec, okres) values
  (:'K', 'Byt Smižany', 'aktivne', 'predaj', 120000, 'Smižany', 'Spišská Nová Ves'),
  (:'C', 'Dom Svit', 'aktivne', 'predaj', 220000, 'Svit', 'Poprad');
insert into push_odbery (makler_id, endpoint, p256dh, auth) values
  (:'A','https://p/a','x','x'), (:'K','https://p/k','x','x'), (:'B','https://p/b','x','x'), (:'C','https://p/c','x','x') on conflict do nothing;

create or replace function pg_temp.pow(p_start int) returns jsonb language plpgsql as $$
declare ts bigint := extract(epoch from now())::bigint; n int := p_start;
begin
  loop
    if left(encode(extensions.digest('typek1|odhad|odhad|' || ts || '|' || n::text, 'sha256'), 'hex'), 4) = '0000' then
      return jsonb_build_object('ts', ts::text, 'n', n::text);
    end if;
    n := n + 1;
  end loop;
end $$;
select pg_temp.pow(2000000) "P1", pg_temp.pow(4000000) "P2", pg_temp.pow(6000000) "P3", pg_temp.pow(8000000) "P4", pg_temp.pow(10000000) "P5", pg_temp.pow(12000000) "P6" \gset
\set BYT '{"typ":"byt","obec":"Smižany","okres":"Spišská Nová Ves","ulica":"Tatranská","cislo":"12","plocha":"70","izby":"3","poschodie":"2","poschodi":"8","stav":"Pôvodný, udržiavaný","dovod":"Zvažujem predaj","kedy_predat":"Čo najskôr","poznamka":"tichá ulica","meno":"Jana Nováková","telefon":"0905 123 456","email":"jana@example.sk"}'

\echo '=== 1. začiatok ceny: cez deň hneď, v noci od 7:00 (Bratislava)'
select _kontakt_start('2026-11-06 12:30+01') = '2026-11-06 12:30+01' den,
       _kontakt_start('2026-11-06 22:10+01') = '2026-11-07 07:00+01' vecer,
       _kontakt_start('2026-11-06 05:10+01') = '2026-11-06 07:00+01' rano;              -- → t, t, t
select _kontakt_cena(c, now() - interval '1 hour') h1, _kontakt_cena(c, now() - interval '5 hours') h5,
       _kontakt_cena(c, now() - interval '13 hours') h13, _kontakt_cena(c, now() - interval '30 hours') h30,
       _kontakt_cena(c, now() + interval '3 hours') buduci, _kontakt_dalsia(c, now() - interval '5 hours')->>'c' dalsia,
       _kontakt_dalsia(c, now() - interval '30 hours') posledna
  from (select ceny c from kontakty_nastavenie) x;                                    -- → 50, 35, 20, 10, 50, 20, null

\echo '=== 2. predaj vypnutý (žiadny okres) → po starom maklérovi z obce'
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"email":"stara@example.sk"}', :'P1')->>'ok' ok;  -- → true
reset role;
select makler_id = :'K' kristian, trh_od is null mimo_predaja, kancelaria_id from odhady_hodnoty where email = 'stara@example.sk';  -- → t, t, 1

\echo '=== 3. zapnúť Spišskú Novú Ves → žiadosť ide na predaj (nikto ju nevidí, bez kontaktu a zvončeka)'
update kontakty_nastavenie set okresy = '{Spišská Nová Ves}';
delete from push_fronta;
set role anon;
select odhad_ziadost(:'BYT'::jsonb, :'P2')->>'ok' ok;                                  -- → true
reset role;
select id as "T1" from odhady_hodnoty where email = 'jana@example.sk' \gset
select kancelaria_id = (select kancelaria_trh from kontakty_nastavenie) skryta, makler_id, web_kontakt_id, potvrdenie_poslat,
       trh_ceny->0->>'c' prva, round(extract(epoch from trh_koniec - trh_od) / 3600) hodin from odhady_hodnoty where id = :T1;   -- → t, null, null, t, 50, 48
select count(*) pripomienky from pripomienky where poznamka like '%Jana%';              -- → 1 (len zo žiadosti v 2.)
select count(*) predajcovia from predajcovia where telefon = '0905123456';             -- → 1 (zo žiadosti v 2., Alpha)
select makler_id = :'K' k, makler_id = :'B' b, makler_id = :'A' a, titul from push_fronta order by makler_id;
-- → cez deň 3 riadky (A, K, B – nie Tretia RK), „💰 Nový kontakt na predaj · 50 €“; v noci 0

\echo '=== 4. kto vidí žiadosť: nikto priamo, náhľad bez osobných údajov len kancelárie s okresom'
set role authenticated;
set request.jwt.claim.sub = :'A'; select 'A' t, count(*) from odhady_hodnoty where id = :T1;          -- → 0
set request.jwt.claim.sub = :'B'; select 'B' t, count(*) from odhady_hodnoty where id = :T1;          -- → 0
set request.jwt.claim.sub = :'K';
select r->'okresy' okresy, r->>'kredit' kredit, r->>'zadarmo' zadarmo, jsonb_array_length(r->'ponuky') ponuky,
       r->'ponuky'->0->>'cena' cena, r->'ponuky'->0->'dalsia'->>'c' dalsia, r->'ponuky'->0->>'nazov' nazov,
       r->'ponuky'->0->'odhad'->>'podla' odhad, r->'pohyby' pohyby_makler
  from (select kontakty_na_predaj() r) x;   -- → ["Spišská Nová Ves"], 0, 2, 1, 50, 35, 3-izbový byt, 70 m², Smižany…, median, null (nie je admin)
select r->'ponuky'->0 ?| array['meno', 'telefon', 'email', 'ulica', 'cislo', 'poznamka', 'odkial'] osobne_udaje from (select kontakty_na_predaj() r) x;  -- → f
set request.jwt.claim.sub = :'B'; select jsonb_array_length(kontakty_na_predaj()->'ponuky') b_vidi;     -- → 1
set request.jwt.claim.sub = :'C'; select jsonb_array_length(kontakty_na_predaj()->'ponuky') c_vidi, kontakty_na_predaj()->'okresy' c_okresy;  -- → 0, []
select kontakt_prevziat(:T1);                                                          -- → ERROR … okres nie je medzi vašimi
\echo '--- priama zmena a cudzie funkcie'
set request.jwt.claim.sub = :'K';
update odhady_hodnoty set makler_id = :'K' where id = :T1;                             -- → ERROR permission denied
select kontakty_sprava();                                                              -- → ERROR Len pre hlavného správcu.
select kontakty_dobit(1, 500);                                                         -- → ERROR Len pre hlavného správcu.
reset role; reset request.jwt.claim.sub;
set role anon; select kontakty_na_predaj();                                            -- → ERROR permission denied
reset role;

\echo '=== 5. Beáta (Iná RK) prevezme prvá – zadarmo; Kristián už nie'
set role authenticated; set request.jwt.claim.sub = :'B';
select kontakt_prevziat(:T1, 10);                                                      -- → ERROR Cena sa medzitým zmenila na 50 €
select r->>'cena' cena, r->>'zadarmo' zadarmo, r->>'kredit' kredit, r->>'zostava_zadarmo' zostava from (select kontakt_prevziat(:T1, 50) r) x;  -- → 0, true, 0, 1
select count(*) b_vidi, max(meno) meno, max(telefon) tel from odhady_hodnoty where id = :T1;          -- → 1, Jana Nováková, 0905123456
set request.jwt.claim.sub = :'K';
select kontakt_prevziat(:T1);                                                          -- → ERROR Tento kontakt už prevzala iná kancelária.
select jsonb_array_length(kontakty_na_predaj()->'ponuky') k_ponuky;                    -- → 0
reset role; reset request.jwt.claim.sub;
select kancelaria_id, makler_id = :'B' beata, predane_cena, predane_zadarmo, predane_ako, predane_kancelaria from odhady_hodnoty where id = :T1;  -- → 20, t, 0, t, nakup, 20
select w.kancelaria_id, w.makler_id = :'B' beata, w.zdroj, left(w.co, 40) from web_kontakty w join odhady_hodnoty o on o.web_kontakt_id = w.id where o.id = :T1;  -- → 20, t, odhad, Odhad hodnoty: 3-izbový byt, 70 m², Smiža…
select kancelaria_id, makler_id = :'B' beata, druh, left(poznamka, 45) from pripomienky where web_kontakt_id = (select web_kontakt_id from odhady_hodnoty where id = :T1);  -- → 20, t, web, Prevzatý kontakt – odhad hodnoty – 3-izbový…
select kancelaria_id, makler_id = :'B' beata from predajcovia where telefon = '0905123456' order by kancelaria_id;  -- → 1 (K) a 20 (t)
select count(*) push_kupujucemu from push_fronta where tag like 'typek-kontakt-%' and odoslane is null;            -- → 0 (je v aplikácii)
select count(*) push_trh_cakajuce from push_fronta where tag = 'typek-trh-' || :T1 and odoslane is null;         -- → 0
select kancelaria_id, druh, suma, zadarmo from kontakty_pohyby order by id;            -- → 20, nakup, 0.00, t

\echo '=== 6. ďalšie kontakty: druhý zadarmo, tretí bez kreditu nejde, po dobití za 50 €'
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"email":"druhy@example.sk","ulica":"Hlavná"}', :'P3')->>'ok',
       odhad_ziadost(:'BYT'::jsonb || '{"email":"treti@example.sk","ulica":"Nová","telefon":"0905 999 888"}', :'P4')->>'ok';   -- → true, true
reset role;
select id as "T2" from odhady_hodnoty where email = 'druhy@example.sk' \gset
select id as "T3" from odhady_hodnoty where email = 'treti@example.sk' \gset
set role authenticated; set request.jwt.claim.sub = :'B';
select kontakt_prevziat(:T2)->>'zadarmo' druhy_zadarmo;                                -- → true
select kontakt_prevziat(:T3);                                                          -- → ERROR Nemáte dosť kreditu: zostatok 0.00 €, kontakt stojí 50 €…
set request.jwt.claim.sub = :'A';
select kontakty_dobit(20, 100, 'faktúra 2026001') kredit;                               -- → 100.00
select kontakty_dobit(20, 0);                                                           -- → ERROR Zadajte sumu
select kontakty_dobit(:TRH, 10);          -- → ERROR Kancelária neexistuje.
set request.jwt.claim.sub = :'B';
select r->>'cena' cena, r->>'kredit' kredit, r->>'zostava_zadarmo' zostava from (select kontakt_prevziat(:T3) r) x;   -- → 50, 50.00, 0
reset role; reset request.jwt.claim.sub;

\echo '=== 7. zlacnenie a koniec: po 5 h 35 €, po uplynutí záložnému maklérovi (Martin)'
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"email":"styri@example.sk","ulica":"Školská","telefon":"0905 444 555"}', :'P5')->>'ok',
       odhad_ziadost(:'BYT'::jsonb || '{"email":"pat@example.sk","ulica":"Lesná","telefon":"0905 555 666"}', :'P6')->>'ok';  -- → true, true
reset role;
select id as "T4" from odhady_hodnoty where email = 'styri@example.sk' \gset
select id as "T5" from odhady_hodnoty where email = 'pat@example.sk' \gset
update odhady_hodnoty set trh_od = now() - interval '5 hours', trh_koniec = now() + interval '43 hours', trh_oznamena = 50 where id = :T4;
update odhady_hodnoty set trh_od = now() - interval '49 hours', trh_koniec = now() - interval '1 minute' where id = :T5;
delete from push_fronta;
select _kontakty_trh_kolo() odovzdane;                                                 -- → 1
select titul, count(*) from push_fronta where tag = 'typek-trh-' || :T4 group by titul;  -- → cez deň „💰 Kontakt zlacnel na 35 €“, 3; v noci nič
select trh_oznamena from odhady_hodnoty where id = :T4;                                -- → cez deň 35, v noci 50
select kancelaria_id, makler_id = :'A' martin, predane_ako, predane_cena from odhady_hodnoty where id = :T5;  -- → 1, t, zaloha, 0
select titul from push_fronta where tag like 'typek-kontakt-%';                        -- → 📈 Kontakt na predaj nikto neprevzal – je tvoj
select _kontakty_trh_kolo() znova;                                                     -- → 0
set role authenticated; set request.jwt.claim.sub = :'B';
select r->'ponuky'->0->>'cena' cena, r->'ponuky'->0->'dalsia'->>'c' dalsia from (select kontakty_na_predaj() r) x;  -- → 35, 20
select kontakt_prevziat(:T5);                                                          -- → ERROR Tento kontakt už prevzala iná kancelária.
set request.jwt.claim.sub = :'A';
select kontakt_odovzdat_zalohe(:T4);
select count(*) martin_ma from odhady_hodnoty where id = :T4;                          -- → 1
reset role; reset request.jwt.claim.sub;

\echo '=== 8. reklamácia: uznaná vráti kredit, zamietnutá nie; kontakt zadarmo sa vráti ako kontakt'
set role authenticated; set request.jwt.claim.sub = :'K';
select kontakt_reklamovat(:T3, 'Klient o odhad nežiadal');                             -- → ERROR Kontakt nepatrí vašej kancelárii.
set request.jwt.claim.sub = :'B';
select kontakt_reklamovat(:T3, 'Zlý dôvod');                                           -- → ERROR Vyberte dôvod reklamácie.
select kontakt_reklamovat(:T3, 'Iný dôvod');                                           -- → ERROR Napíšte, prečo…
select kontakt_reklamovat(:T3, 'Nesprávne telefónne číslo a e-mail', 'číslo neexistuje');
select kontakt_reklamovat(:T3, 'Klient o odhad nežiadal');                             -- → ERROR Kontakt už je reklamovaný.
select kontakt_reklamovat(:T1, 'Klient o odhad nežiadal', null);
select kontakt_reklamovat(:T2, 'Kontakt už sme mali (duplicitný)');
reset role; reset request.jwt.claim.sub;
update odhady_hodnoty set predane = now() - interval '3 days' where id = :T4;
select titul from push_fronta where tag like 'typek-rekl-%' order by id;               -- → ⚠️ Reklamácia kontaktu · 50 € / · 0 € / · 0 €
select (select id from kontakty_reklamacie where odhad_id = :T1) "R1", (select id from kontakty_reklamacie where odhad_id = :T2) "R2",
       (select id from kontakty_reklamacie where odhad_id = :T3) "R3" \gset
set role authenticated; set request.jwt.claim.sub = :'A';
select kontakt_reklamovat(:T4, 'Klient o odhad nežiadal');                             -- → ERROR Kontakt nepatrí vašej kancelárii. (záloha sa nereklamuje)
select kontakt_reklamacia_vybav(:R3, true, null);
select kontakt_reklamacia_vybav(:R1, true, 'ok');
select kontakt_reklamacia_vybav(:R2, false, null);                                     -- → ERROR Pri zamietnutí napíšte dôvod.
select kontakt_reklamacia_vybav(:R2, false, 'klient potvrdil žiadosť');
select kontakt_reklamacia_vybav(:R2, true, null);                                      -- → ERROR Reklamácia už je vybavená.
set request.jwt.claim.sub = :'B';
select kontakt_reklamacia_vybav(:R2, true, null);                                      -- → ERROR Len pre hlavného správcu.
reset role; reset request.jwt.claim.sub;
select titul from push_fronta where tag like 'typek-rekl-%' and makler_id = :'B' order by id;   -- → ✅ … 50 € späť, ✅ … kontakt zadarmo späť, ✖️ Reklamácia zamietnutá
set role authenticated;
set request.jwt.claim.sub = :'B';
select r->>'kredit' kredit, r->>'zadarmo' zadarmo, jsonb_array_length(r->'kupene') kupene, jsonb_array_length(r->'pohyby') pohyby,
       (select string_agg(k->'reklamacia'->>'stav', ',' order by (k->>'id')::int) from jsonb_array_elements(r->'kupene') k) reklamacie
  from (select kontakty_na_predaj() r) x;                                             -- → 100.00, 1, 3, 6, uznana,zamietnuta,uznana
reset role; reset request.jwt.claim.sub;

\echo '=== 9. Správa: prehľad a nastavenie'
set role authenticated; set request.jwt.claim.sub = :'A';
select jsonb_array_length(r->'trh') trh, jsonb_array_length(r->'reklamacie') rekl, jsonb_array_length(r->'kancelarie') kancelarie,
       r->'pokrytie'->>'Spišská Nová Ves' snv_kupci, r->'zaloha'->>'meno' zaloha, jsonb_array_length(r->'vsetky_okresy') > 70 okresy,
       (select k->>'kredit' from jsonb_array_elements(r->'kancelarie') k where k->>'nazov' = 'Iná RK') kredit_ina
  from (select kontakty_sprava() r) x;                                                -- → 5, 3, 3, 2, Martin Alpha, t, 100.00
select kontakty_nastavit('{"okresy":["Neexistujúci"],"ceny":[{"h":0,"c":50}],"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');   -- → ERROR Neznámy okres.
select kontakty_nastavit('{"okresy":[],"ceny":[{"h":2,"c":50}],"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');                 -- → ERROR Prvá cena musí platiť od 0 hodín.
select kontakty_nastavit('{"okresy":[],"ceny":[{"h":0,"c":30},{"h":4,"c":40}],"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');  -- → ERROR Cena môže časom len klesať.
select kontakty_nastavit('{"okresy":[],"ceny":[{"h":0,"c":50},{"h":24,"c":10}],"koniec_h":12,"zadarmo":2,"reklamacia_h":48}'); -- → ERROR Odovzdanie záložnému maklérovi…
select kontakty_nastavit('{"okresy":["Levoča","Spišská Nová Ves"],"ceny":[{"h":0,"c":60},{"h":6,"c":30}],"koniec_h":24,"zadarmo":1,"reklamacia_h":24,"zaloha_makler":"00000000-0000-0000-0000-0000000000b1"}');  -- → ERROR Záložný maklér musí byť…
select kontakty_nastavit('{"okresy":["Levoča","Spišská Nová Ves"],"ceny":[{"h":0,"c":60},{"h":6,"c":30}],"koniec_h":24,"zadarmo":1,"reklamacia_h":24,"zaloha_makler":"00000000-0000-0000-0000-0000000000a2"}');
reset role; reset request.jwt.claim.sub;
select okresy, ceny, koniec_h, zadarmo, reklamacia_h, zaloha_makler = :'K' kristian from kontakty_nastavenie;  -- → {Levoča,Spišská Nová Ves}, [{"c": 60, "h": 0}, {"c": 30, "h": 6}], 24, 1, 24, t

\echo '=== 10. okres bez kupujúcich (Poprad nie je na predaj) a Levoča bez kancelárie s okresom → po starom'
set role anon;
select odhad_ziadost('{"typ":"dom","obec":"Svit","okres":"Poprad","ulica":"Hlavná","plocha":"140","pozemok":"600","izby":"4","stav":"Novostavba","dovod":"Zvažujem predaj","meno":"Peter","telefon":"+420 777 123 456","email":"p@x.cz"}'::jsonb, pg_temp.pow(22000000))->>'ok';  -- → true
reset role;
select makler_id = :'C' cyril, trh_od is null mimo from odhady_hodnoty where email = 'p@x.cz';   -- → t, t
update kancelarie set okresy = '{Poprad}' where id = 20;
update kancelarie set okresy = '{Spišská Nová Ves}' where id = 1;
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"obec":"Levoča","okres":"Levoča","email":"levoca@example.sk"}', pg_temp.pow(24000000))->>'ok';  -- → true
reset role;
select trh_od is null mimo_predaja, makler_id is not null ma_maklera from odhady_hodnoty where email = 'levoca@example.sk';  -- → t, t (Levoča: nikto ju nekupuje)

\echo '=== 11. ceny podľa okresu (118): vlastné ceny okresu, inak spoločné; žiadosť si ich uloží'
set role authenticated; set request.jwt.claim.sub = :'A';
select kontakty_nastavit('{"okresy":["Spišská Nová Ves"],"ceny":[{"h":0,"c":50},{"h":4,"c":35}],"ceny_okresy":{"Levoča":[{"h":0,"c":20},{"h":4,"c":30}]},"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');  -- → ERROR Okres Levoča: Cena môže časom len klesať.
select kontakty_nastavit('{"okresy":["Spišská Nová Ves"],"ceny":[{"h":0,"c":50}],"ceny_okresy":{"Spišská Nová Ves":[{"h":0,"c":80},{"h":30,"c":40}]},"koniec_h":24,"zadarmo":2,"reklamacia_h":48}');  -- → ERROR Odovzdanie záložnému maklérovi musí byť neskôr…
select kontakty_nastavit('{"okresy":["Spišská Nová Ves"],"ceny":[{"h":0,"c":50}],"ceny_okresy":{"Neexistujúci":[{"h":0,"c":80}]},"koniec_h":24,"zadarmo":2,"reklamacia_h":48}');  -- → ERROR Neznámy okres.
select kontakty_nastavit('{"okresy":["Spišská Nová Ves"],"ceny":[{"h":0,"c":50},{"h":4,"c":35}],"ceny_okresy":{"Spišská Nová Ves":[{"h":0,"c":80},{"h":2,"c":40}],"Levoča":[]},"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');
select kontakty_sprava()->'nastavenie'->'ceny_okresy' ceny_okresy;                    -- → {"Spišská Nová Ves": [{"c": 80, "h": 0}, {"c": 40, "h": 2}]}
reset role; reset request.jwt.claim.sub;
select _kontakty_ceny('Spišská Nová Ves') snv, _kontakty_ceny('Levoča') levoca;      -- → [80 od 0 h, 40 od 2 h], [50, 35] (spoločné)
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"email":"okres@example.sk","ulica":"Okresná"}', pg_temp.pow(26000000))->>'ok';  -- → true
reset role;
select trh_ceny from odhady_hodnoty where email = 'okres@example.sk';                 -- → [{"c": 80, "h": 0}, {"c": 40, "h": 2}]
set role authenticated; set request.jwt.claim.sub = :'K';
select p->>'cena' cena, p->'dalsia'->>'c' dalsia from jsonb_array_elements(kontakty_na_predaj()->'ponuky') p where p->>'nazov' like '%Smižany%' order by (p->>'id')::int desc limit 1;  -- → 80, 40
set request.jwt.claim.sub = :'A';
-- vypnutý okres si vlastné ceny nechá
select kontakty_nastavit('{"okresy":[],"ceny":[{"h":0,"c":50},{"h":4,"c":35}],"ceny_okresy":{"Spišská Nová Ves":[{"h":0,"c":80},{"h":2,"c":40}]},"koniec_h":48,"zadarmo":2,"reklamacia_h":48}');
reset role; reset request.jwt.claim.sub;
select okresy, ceny_okresy ? 'Spišská Nová Ves' ma_ceny from kontakty_nastavenie;    -- → {}, t

\echo '=== 12. ceny podľa mediánu (119)'
set role authenticated; set request.jwt.claim.sub = :'K';
select kontakty_ceny_podla_medianu();                                                  -- → ERROR Len pre hlavného správcu.
set request.jwt.claim.sub = :'A';
select r->'Levoča'->0->>'c' levoca, r->'Spišská Nová Ves'->0->>'c' snv, r->'Bratislava I'->0->>'c' ba1, r->'Bratislava I'->3->>'c' ba1_min, (select count(*) from jsonb_each(r)) okresov
  from (select kontakty_ceny_podla_medianu() r) x;                                    -- → 50, 60, 150, 30 (pri spoločných 50 → 35 → 20 → 10), 79
select kontakty_ceny_podla_medianu(5);                                                 -- → ERROR Deliteľ musí byť 10 až 200.
reset role; reset request.jwt.claim.sub;
select ceny_okresy->'Spišská Nová Ves'->0->>'c' snv_ulozene from kontakty_nastavenie;  -- → 60

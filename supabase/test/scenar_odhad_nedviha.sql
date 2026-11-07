-- Skúška 124_odhad_nedviha.sql (telefón vo formulári odhadu, opakované žiadosti sa druhýkrát nepredávajú, „Nedvíha“ pri žiadosti o odhad).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set K '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'K','k@alpha.sk'), (:'B','b@inak.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup, telefon) values
  (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}','0915 140 759'),
  (:'K','Kristián Alpha','k@alpha.sk','makler',true,'{inzeraty,nehnutelnosti,odhady,kontakty}','0905 111 222') on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
update kontakty_nastavenie set zaloha_makler = :'A', ceny_okresy = '{}',
  vyhody = '{"prednost_min":0,"zlava_jeden":0,"zlava_oba":0,"zadarmo_jeden":2,"zadarmo_oba":2,"mesacne_oba":0}' where id = 1;
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);
insert into zakaznici (id, nazov, email, stav, moduly) overriding system value values (900, 'Iná RK', 'b@inak.sk', 'aktivny', array['skener', 'web']) on conflict do nothing;
insert into kancelarie (id, nazov, typ, zakaznik_id, okresy, sekcie, aktivna, slug) values
  (20, 'Iná RK', 'kancelaria', 900, '{Spišská Nová Ves}', _sekcie_z_modulov(array['skener', 'web']), true, 'ina') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Beáta Iná','b@inak.sk','admin',true,20) on conflict do nothing;
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, cena, obec, okres) values (:'K', 'Byt Smižany', 'aktivne', 'predaj', 120000, 'Smižany', 'Spišská Nová Ves');
insert into push_odbery (makler_id, endpoint, p256dh, auth) values (:'A','https://p/a','x','x'), (:'K','https://p/k','x','x'), (:'B','https://p/b','x','x') on conflict do nothing;
select kancelaria_trh as "TRH" from kontakty_nastavenie \gset

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
\set BYT '{"typ":"byt","obec":"Smižany","okres":"Spišská Nová Ves","ulica":"Tatranská","cislo":"12","plocha":"70","izby":"3","poschodie":"2","poschodi":"8","stav":"Pôvodný, udržiavaný","dovod":"Zvažujem predaj","kedy_predat":"Čo najskôr","meno":"Jana Nováková","telefon":"0905 123 456","email":"jana@example.sk"}'

\echo '=== 1. telefón: správne čísla'
select _odhad_tel('0905 123 456') a, _odhad_tel('+421 905 123 456') b, _odhad_tel('00421905123456') c, _odhad_tel('905123456') d,
       _odhad_tel('+421 0905 123 456') e, _odhad_tel('052/123 45 67') f, _odhad_tel('+420 777 123 456') g, _odhad_tel('+43 664 1234567') h;
-- → 0905123456 (a – e), 0521234567, +420777123456, +436641234567
\echo '--- zlé čísla'
select _odhad_tel('0905 12 345') kratke, _odhad_tel('0905 123 4567') dlhe, _odhad_tel('+421 905 123') sk_kratke, _odhad_tel('+420 77 123') cz_kratke,
       _odhad_tel('12345') nic, _odhad_tel('') prazdne, _odhad_tel('0905 abc 456') pismena;   -- → všetko null
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"telefon":"0905 12 34","email":"zly@example.sk"}', :'P6');   -- → ERROR Skontrolujte telefónne číslo – napríklad 0905 123 456 …
reset role; reset request.jwt.claim.sub;

\echo '=== 2. Spišská Nová Ves na predaji: prvá žiadosť ide na predaj'
update kontakty_nastavenie set okresy = '{Spišská Nová Ves}';
set role anon;
select odhad_ziadost(:'BYT'::jsonb, :'P1')->>'ok' ok;                                       -- → true
reset role; reset request.jwt.claim.sub;
select id as "T1" from odhady_hodnoty where email = 'jana@example.sk' \gset
select kancelaria_id = :TRH na_predaji, telefon, opakovana_z from odhady_hodnoty where id = :T1;   -- → t, 0905123456, null
-- cena beží hneď (aj keď skúška beží v noci)
update odhady_hodnoty set trh_od = now() - interval '1 minute', trh_koniec = now() + interval '47 hours' where id = :T1;

\echo '=== 3. tá istá Jana (rovnaký telefón, iný e-mail), predchádzajúca je ešte na predaji → záložnému maklérovi na kontrolu, nie na predaj'
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"email":"jana.druhy@example.sk","ulica":"Hlavná"}', :'P2')->>'ok' ok;   -- → true
reset role; reset request.jwt.claim.sub;
select id as "T2" from odhady_hodnoty where email = 'jana.druhy@example.sk' \gset
select makler_id = :'A' zaloha, kancelaria_id, trh_od is null nie_na_predaji, opakovana_z = :T1 opakovana from odhady_hodnoty where id = :T2;   -- → t, 1, t, t
select poznamka like '⚠️ Opakovaná žiadosť – klient už žiadal odhad %ešte na predaji%' text from pripomienky
 where web_kontakt_id = (select web_kontakt_id from odhady_hodnoty where id = :T2);         -- → t
select count(*) na_predaji from odhady_hodnoty where kancelaria_id = :TRH;                   -- → 1 (len T1)

\echo '=== 4. Iná RK kúpi prvú Janu; ďalšia žiadosť toho istého e-mailu ide jej maklérke (zadarmo, nie na predaj)'
set role authenticated; set request.jwt.claim.sub = :'B';
select (kontakt_prevziat(:T1))->>'zadarmo' zadarmo;                                          -- → true
reset role; reset request.jwt.claim.sub;
select makler_id = :'B' beata, kancelaria_id from odhady_hodnoty where id = :T1;              -- → t, 20
-- predchádzajúca podľa id je teraz T2 (Alpha) – pre skúšku „kúpenej“ ju dáme mimo 30 dní
update odhady_hodnoty set vytvorene = now() - interval '40 days' where id = :T2;
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"telefon":"+421 905 123 456","ulica":"Školská"}', :'P3')->>'ok' ok;   -- → true
reset role; reset request.jwt.claim.sub;
select id as "T3" from odhady_hodnoty where ulica = 'Školská' \gset
select makler_id = :'B' beata, kancelaria_id, trh_od is null nie_na_predaji, opakovana_z = :T1 opakovana from odhady_hodnoty where id = :T3;   -- → t, 20, t, t
select poznamka like '%Na predaj nešla, patrí k predchádzajúcej%' text from pripomienky
 where web_kontakt_id = (select web_kontakt_id from odhady_hodnoty where id = :T3);         -- → t

\echo '=== 5. nový klient (iný telefón aj e-mail) ide normálne na predaj'
set role anon;
select odhad_ziadost(:'BYT'::jsonb || '{"telefon":"0911 222 333","email":"peter@example.sk","meno":"Peter Malý","ulica":"Lipová"}', :'P4')->>'ok' ok;   -- → true
reset role; reset request.jwt.claim.sub;
select kancelaria_id = :TRH na_predaji, opakovana_z from odhady_hodnoty where email = 'peter@example.sk';   -- → t, null

\echo '=== 6. „Nedvíha“ – Beáta pri Janinej žiadosti T3'
set role authenticated; set request.jwt.claim.sub = :'B';
select r->>'nedviha_pocet' pocet, r->>'email_posle' email_posle, r->>'email' klient, r->>'nedviha_email_poslat' poslat, (r->>'volat_znova')::timestamptz = _cas_volat_znova(now()) cas
  from (select odhad_nedviha(:T3) r) x;                                                     -- → 1, true, jana…@ (e-mail klienta ostal), true, t
select count(*) aktivne, bool_and(makler_id = :'B') beata, bool_and(email_odoslany is not null) bez_emailu_maklerovi, max(poznamka) text
  from pripomienky where odhad_id = :T3 and druh = 'volat' and hotovo is null and zrusena is null;   -- → 1, t, t, Znova zavolať: Jana Nováková, 0905123456 – … 1. pokus)
\echo '--- druhý pokus: e-mail už je v poradí, nepošle sa druhýkrát; staršia pripomienka sa zruší'
select r->>'nedviha_pocet' pocet, r->>'email_posle' email_posle, r->>'email' klient from (select odhad_nedviha(:T3) r) x;    -- → 2, false, jana…@
reset role; reset request.jwt.claim.sub;
select count(*) filter (where zrusena is null) aktivne, count(*) spolu from pripomienky where odhad_id = :T3 and druh = 'volat';   -- → 1, 2
-- funkcia pripomienky e-mail odošle
update odhady_hodnoty set nedviha_email_poslat = false, nedviha_email_odoslane = now() where id = :T3;
set role authenticated; set request.jwt.claim.sub = :'B';
select r->>'nedviha_pocet' pocet, r->>'email_posle' email_posle, r->>'email' klient from (select odhad_nedviha(:T3) r) x;    -- → 3, false, jana…@ (e-mail len raz za žiadosť)
\echo '--- cudzí maklér a anonym'
set request.jwt.claim.sub = :'K';
select odhad_nedviha(:T3);                                                                   -- → ERROR Žiadosť o odhad sa nenašla alebo k nej nemáte prístup.
reset role; reset request.jwt.claim.sub; set role anon;
select odhad_nedviha(:T3);                                                                   -- → ERROR permission denied
reset role; reset request.jwt.claim.sub;

\echo '=== 7. upozornenie do mobilu v čase pripomienky'
delete from push_fronta;
update pripomienky set cas = now() - interval '1 minute' where odhad_id = :T3 and druh = 'volat' and zrusena is null;
select _odhad_volat() poslane;                                                              -- → 1
select makler_id = :'B' beata, titul, url = './#odhady/' || :T3 url, text like 'Odhad hodnoty · %Jana Nováková%nedvíhal(a)%Ak ani teraz, pošli SMS.' text
  from push_fronta;                                                                         -- → t, 📞 Skús znova zavolať, t, t
select _odhad_volat() znova;                                                                -- → 0 (už odoslané)
\echo '--- klient sa medzitým ozval (stav ďalej) → pripomienka sa zruší, nič nepríde'
set role authenticated; set request.jwt.claim.sub = :'B';
select odhad_nedviha(:T3) is not null nedviha;                                              -- → t
select odhad_ulozit(:T3, '{"stav":"obhliadka"}') is not null stav;                          -- → t
reset role; reset request.jwt.claim.sub;
delete from push_fronta;
update pripomienky set cas = now() - interval '1 minute' where odhad_id = :T3 and druh = 'volat' and zrusena is null;
select _odhad_volat() poslane;                                                              -- → 0
select (select count(*) from push_fronta) push,
       (select count(*) from pripomienky where odhad_id = :T3 and druh = 'volat' and zrusena is null) aktivne;   -- → 0, 0

\echo '=== 8. hlavný správca vidí záznam pri reklamácii'
set role authenticated; set request.jwt.claim.sub = :'A';
select r->(:T3)::text->>'pocet' pocet, r->(:T3)::text->>'email' is not null email, r ? (:T1)::text t1_bez_zaznamu
  from (select kontakty_nedviha_info(array[:T1, :T3]::bigint[]) r) x;                       -- → 4, t, f
set request.jwt.claim.sub = :'B';
select kontakty_nedviha_info(array[:T3]::bigint[]);                                          -- → ERROR Len pre hlavného správcu.
reset role; reset request.jwt.claim.sub;

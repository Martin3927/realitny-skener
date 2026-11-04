-- Skúška 108_odhad_hodnoty.sql (Odhad hodnoty – stránka realitnytypek.sk/odhad a sekcia Odhady).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set K '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'K','k@alpha.sk'), (:'B','b@inak.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup, telefon) values
  (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}','0915 140 759'),
  (:'K','Kristián Alpha','k@alpha.sk','makler',true,'{inzeraty,nehnutelnosti}','0905 111 222') on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);
-- iná kancelária (zákazník so skenerom a webom, platiaci) s maklérom v Poprade
insert into zakaznici (id, nazov, email, stav, moduly) overriding system value values (900, 'Iná RK', 'b@inak.sk', 'aktivny', array['skener', 'web']) on conflict do nothing;
insert into kancelarie (id, nazov, typ, zakaznik_id, okresy, sekcie, aktivna) values (2, 'Iná RK', 'kancelaria', 900, '{Poprad}', _sekcie_z_modulov(array['skener', 'web']), true) on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Beáta Iná','b@inak.sk','admin',true,2) on conflict do nothing;
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, cena, obec, okres) values
  (:'K', 'Byt Smižany', 'aktivne', 'predaj', 120000, 'Smižany', 'Spišská Nová Ves'),
  (:'B', 'Dom Svit', 'aktivne', 'predaj', 220000, 'Svit', 'Poprad');
-- inzeráty zo skenera v Smižanoch (podklad pre makléra)
insert into inzeraty (id, portal, url, nazov, typ, izby, cena, plocha, cena_m2, obec, okres, aktivny, prvy_krat, predajca_typ) values
  ('o1','bazos','https://x/o1','3-izbový byt','byt',3,110000,70,1571,'Smižany','Spišská Nová Ves',true, now() - interval '20 days','sukromny'),
  ('o2','bazos','https://x/o2','3-izbový byt','byt',3,118000,72,1639,'Smižany','Spišská Nová Ves',true, now() - interval '40 days','sukromny'),
  ('o3','topreality','https://x/o3','3i byt','byt',3,99000,66,1500,'Smižany','Spišská Nová Ves',false, now() - interval '90 days','rk'),
  ('o4','reality','https://x/o4','3-izbový byt','byt',3,125000,74,1689,'Spišská Nová Ves','Spišská Nová Ves',true, now() - interval '10 days','rk'),
  ('o5','bazos','https://x/o5','2-izbový byt','byt',2,90000,55,1636,'Smižany','Spišská Nová Ves',true, now() - interval '10 days','sukromny'),
  ('o6','bazos','https://x/o6','3-izbový byt','byt',3,115000,68,1691,'Smižany','Spišská Nová Ves',true, now() - interval '5 days','sukromny'),
  ('o7','bazos','https://x/o7','3-izbový byt','byt',3,105000,69,1522,'Smižany','Spišská Nová Ves',true, now() - interval '3 days','sukromny')
on conflict do nothing;

-- výpočtová úloha ako v prehliadači (sha256 začína 4 nulami)
create or replace function pg_temp.pow(p_start int) returns jsonb language plpgsql as $$
declare ts bigint := extract(epoch from now())::bigint; n int := p_start; p_adresa text := 'odhad'; p_zdroj text := 'odhad';
begin
  loop
    if left(encode(extensions.digest('typek1|' || p_adresa || '|' || p_zdroj || '|' || ts || '|' || n::text, 'sha256'), 'hex'), 4) = '0000' then
      return jsonb_build_object('ts', ts::text, 'n', n::text);
    end if;
    n := n + 1;
  end loop;
end $$;
select pg_temp.pow(2000000) "P1", pg_temp.pow(4000000) "P2", pg_temp.pow(6000000) "P3", pg_temp.pow(8000000) "P4", pg_temp.pow(10000000) "P5", pg_temp.pow(12000000) "P6", pg_temp.pow(14000000) "P7", pg_temp.pow(16000000) "P8", pg_temp.pow(18000000) "P9", pg_temp.pow(20000000) "P10" \gset
\set BYT '{"typ":"byt","obec":"Smižany","okres":"Spišská Nová Ves","ulica":"Tatranská","cislo":"12","plocha":"70","izby":"3","poschodie":"2","poschodi":"8","stav":"Pôvodný, udržiavaný","doplnky":["Balkón alebo loggia","Pivnica","Neznáme"],"dovod":"Mám záujem aj o ponuku na výkup","poznamka":"tichá ulica","meno":"Jana Nováková","telefon":"0905 123 456","email":"Jana@Example.sk","odkial":"utm_source=facebook"}'

\echo '=== 1. pokrytie: okresy kancelárií so sekciou Odhady a okresy ponúk'
set role anon;
select odhad_pokrytie() ? 'Spišská Nová Ves' snv, odhad_pokrytie() ? 'Poprad' poprad, odhad_pokrytie() ? 'Senec' senec;  -- → t, t, f
reset role;

\echo '=== 2. žiadosť bez overenia a so zlými údajmi'
set role anon;
select odhad_ziadost(:'BYT'::jsonb, '{"ts":"1","n":"x"}');                                         -- → ERROR obnovte stránku / formulár bol otvorený pridlho
select odhad_ziadost(:'BYT'::jsonb, '{"med":"robot"}') ->> 'ok' robot;                             -- → true (nič sa neuloží)
select odhad_ziadost(:'BYT'::jsonb - 'ulica', :'P1');                      -- → ERROR Napíšte ulicu.
select odhad_ziadost(:'BYT'::jsonb || '{"obec":"Neexistujúca"}', :'P2');  -- → ERROR Vyberte obec zo zoznamu.
select odhad_ziadost(:'BYT'::jsonb || '{"poschodie":"9"}', :'P3');         -- → ERROR Poschodie nemôže byť vyššie…
select odhad_ziadost(:'BYT'::jsonb || '{"email":"jana@"}', :'P4');         -- → ERROR Skontrolujte e-mailovú adresu.
select odhad_ziadost(:'BYT'::jsonb || '{"dovod":"Iné"}', :'P5');           -- → ERROR Vyberte, prečo chcete odhad.
reset role;
select 'po chybách' t, count(*) from odhady_hodnoty;                                                -- → 0

\echo '=== 3. byt v Smižanoch → Kristián (má tam ponuku), zvonček, mobil, predávajúci, potvrdenie'
set role anon;
select r->>'ok' ok, r->>'obec' obec, r->'makler'->>'meno' makler, r->>'pokryte' pokryte
  from (select odhad_ziadost(:'BYT'::jsonb, :'P6') r) x;                    -- → true, Smižany, Kristián Alpha, true
-- dvojklik: tá istá žiadosť do 15 minút sa neuloží druhýkrát
select odhad_ziadost(:'BYT'::jsonb, :'P7')->'makler'->>'meno' druhykrat;    -- → Kristián Alpha
reset role;
select count(*) pocet, max(nazov) nazov, max(email) email, max(telefon) tel, max(kancelaria_id) kanc, bool_and(potvrdenie_poslat) potvrdenie,
       max(array_to_string(doplnky, ',')) doplnky, max(auto->>'pocet') auto_pocet from odhady_hodnoty;
-- → 1, 3-izbový byt, 70 m², Smižany (okres Spišská Nová Ves), jana@example.sk, 0905123456, 1, t, Balkón alebo loggia,Pivnica, 6
select zdroj, portal, kontakt, makler_id = :'K' ok from web_kontakty order by id desc limit 1;      -- → odhad, t, 0905123456, t
select druh, makler_id = :'K' ok, left(poznamka, 60) from pripomienky order by id desc limit 1;     -- → web, t, Nová žiadosť o odhad hodnoty – 3-izbový byt…
select telefon, makler_id = :'K' ok, left(poznamka, 40) from predajcovia where telefon = '0905123456'; -- → 0905123456, t, Odhad hodnoty (realitnytypek.sk/odhad)…

\echo '=== 4. dom vo Svite → maklérka inej kancelárie; pozemok v Senci (nikto) → hlavný správca'
set role anon;
select odhad_ziadost('{"typ":"dom","obec":"Svit","okres":"Poprad","ulica":"Hlavná","plocha":"140","pozemok":"600","izby":"4","stav":"Novostavba","dovod":"Zvažujem predaj","meno":"Peter","telefon":"+420 777 123 456","email":"p@x.cz"}'::jsonb,
                     :'P8')->'makler'->>'meno' svit;                                   -- → Beáta Iná
select r->'makler'->>'meno' senec, r->>'pokryte' pokryte from (select odhad_ziadost('{"typ":"pozemok","obec":"Senec","plocha":"800","druh_pozemku":"Stavebný","siete":["Elektrina","Voda"],"dovod":"Len informatívne, zaujíma ma hodnota","meno":"Eva","telefon":"0911 222 333","email":"eva@x.sk"}'::jsonb,
                     :'P9') r) x;                                                      -- → Martin Alpha, false
select odhad_ziadost('{"typ":"pozemok","obec":"Senec","plocha":"800","druh_pozemku":"Stavebný","siete":[],"dovod":"Iný dôvod","meno":"Eva","telefon":"0911 222 333","email":"eva2@x.sk"}'::jsonb,
                     :'P10');                                                           -- → ERROR Vyberte siete…
reset role;
select o.obec, o.kancelaria_id, o.telefon, m.meno from odhady_hodnoty o join makleri m on m.id = o.makler_id order by o.id;
-- → Smižany 1 Kristián; Svit 2 +420777123456 Beáta; Senec 1 Martin

\echo '=== 5. čítanie: Kristián vidí svoju, Beáta len svoju kanceláriu, admin Alpha všetko v Alpha'
set role authenticated;
set request.jwt.claim.sub = :'K';  select 'K' t, count(*) from odhady_hodnoty;                      -- → 1
set request.jwt.claim.sub = :'B';  select 'B' t, count(*), max(obec) from odhady_hodnoty;           -- → 1, Svit
set request.jwt.claim.sub = :'A';  select 'A' t, count(*) from odhady_hodnoty;                      -- → 2
-- Beáta nesmie čítať ani meniť žiadosť Alpha
reset role; reset request.jwt.claim.sub;
select (select id from odhady_hodnoty where obec = 'Smižany') "ID_SMIZANY", (select id from odhady_hodnoty where obec = 'Svit') "ID_SVIT" \gset
set role authenticated; set request.jwt.claim.sub = :'B';
select odhad_podklad(:ID_SMIZANY);                                                                   -- → ERROR nenašla sa
select odhad_ulozit(:ID_SMIZANY, '{"stav":"zakazka"}');                                              -- → ERROR nenašla sa
update odhady_hodnoty set stav = 'zakazka' where id = :ID_SMIZANY;                                   -- → ERROR permission denied
select odhad_ulozit(:ID_SVIT, '{"stav":"kontaktovany"}')->>'stav' svoja;                             -- → kontaktovany

\echo '=== 6. podklad zo skenera pre Kristiána'
set request.jwt.claim.sub = :'K';
select p->'stat'->>'oblast' oblast, p->'stat'->>'pocet' pocet, p->'stat'->>'od' od, p->'stat'->>'do' do_, p->'stat'->>'zmiznute' zmiznute,
       jsonb_array_length(p->'podobne') podobne, p->'podobne'->0->>'id' prvy
  from (select odhad_podklad(:ID_SMIZANY) p) x;                                                       -- → Smižany, 5, ~108000, ~117000, 1, 6, o1 (bez 2-izbového)

\echo '=== 7. stav a odhad klientovi'
select odhad_ulozit(:ID_SMIZANY, '{"cena_od":"120000","cena_do":"100000"}');                        -- → ERROR Horná hranica…
select odhad_poslat(:ID_SMIZANY, 105000, 115000, 'krátko');                                          -- → ERROR Napíšte klientovi pár viet
select r->>'stav' stav, r->>'cena_od' od, (r->>'email_poslat') is not null caka
  from (select odhad_poslat(:ID_SMIZANY, 105000, 115000, 'Dobrý deň, na základe údajov odhadujem hodnotu bytu na 105 – 115 tisíc eur.') r) x;  -- → odoslany, 105000, t
select odhad_poslat(:ID_SMIZANY, 105000, 115000, 'Dobrý deň, na základe údajov odhadujem hodnotu bytu na 105 – 115 tisíc eur.');  -- → ERROR E-mail sa práve odosiela
reset role; reset request.jwt.claim.sub;
select w.odpovedane is not null odpovedane, p.hotovo is not null prip_hotovo from odhady_hodnoty o join web_kontakty w on w.id = o.web_kontakt_id
  join pripomienky p on p.web_kontakt_id = w.id and p.druh = 'web' where o.id = :ID_SMIZANY;         -- → t, t

\echo '=== 8. admin odovzdá žiadosť zo Senca Kristiánovi; Kristián nemôže odovzdávať'
set role authenticated; set request.jwt.claim.sub = :'K';
select odhad_priradit((select 1::bigint), :'A');                                                     -- → ERROR nenašla sa / len administrátor
set request.jwt.claim.sub = :'A';
select odhad_priradit(id, :'K') from odhady_hodnoty where obec = 'Senec';                           -- → (prázdne – ok)
select odhad_priradit(id, :'B') from odhady_hodnoty where obec = 'Senec';                           -- → ERROR Maklér nie je v tejto kancelárii.
reset role; reset request.jwt.claim.sub;
select m.meno, (select count(*) from pripomienky p where p.web_kontakt_id = o.web_kontakt_id and p.zrusena is null and p.makler_id = :'K') prip_k
  from odhady_hodnoty o join makleri m on m.id = o.makler_id where o.obec = 'Senec';                -- → Kristián Alpha, 1

\echo '=== 9. sekcia Odhady: licencie, predvolený prístup nového makléra, upratovanie (Svit starší ako 2 roky zmizne)'
select _sekcie_z_modulov(array['skener']) skener, 'odhady' = any(_sekcie_z_modulov(array['web'])) web;   -- → {chat,inzeraty,kalendar,kataster,mapa}, t
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3','n@alpha.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny) values ('00000000-0000-0000-0000-0000000000a3', 'Nový maklér', 'n@alpha.sk', 'makler', true);
select 'odhady' = any(pristup) novy_ma_odhady from makleri where email = 'n@alpha.sk';             -- → t (predvolený prístup)
update odhady_hodnoty set vytvorene = now() - interval '25 months' where obec = 'Svit';
select _portal_upratanie();
select count(*) po_upratani from odhady_hodnoty;                                                     -- → 2

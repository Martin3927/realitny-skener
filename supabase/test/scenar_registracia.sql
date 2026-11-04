-- Skúška samoregistrácie na skúšobnú dobu (101_samoregistracia.sql).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky sú v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set P '00000000-0000-0000-0000-0000000000c1'
\set R '00000000-0000-0000-0000-0000000000c2'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'A2','a2@alpha.sk'), (:'P','peter@maly.sk'), (:'R','info@tatry.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup) values (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}'), (:'A2','Kolega Alpha','a2@alpha.sk','makler',true,array['inzeraty','chat']) on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into push_odbery (makler_id, endpoint, p256dh, auth) select id, 'https://p/' || id, 'x', 'y' from makleri on conflict do nothing;
-- Alpha Reality ako vlastná kancelária (098)
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);

\echo '=== 1. Alpha Reality bez zmeny'
set role authenticated; set request.jwt.claim.sub = :'A2';
select 'A2 skener/chat/ponuky' t, ma_pristup('inzeraty') sk, ma_pristup('chat') ch, ma_pristup('nehnutelnosti') nehn;   -- → t, t, f (len podľa pristup)
select 'A2 licencia' t, moja_licencia()->>'platna' platna, moja_licencia()->'sekcie' sekcie;                          -- → true, null
set request.jwt.claim.sub = :'A';
select 'A všetko' t, ma_pristup('matterport') mp, ma_pristup('schrankovanie') sch, ma_pristup('provizie') pr;          -- → t, t, t
reset role; reset request.jwt.claim.sub;

\echo '=== 2. nový záujemca z webu → čaká e-mail s odkazom'
select web_ziadost('peter@maly.sk', array['skener'], 2, 'mesacne', array['Poprad', 'Kežmarok'], 'Peter Malý', null, null, null);
select 'čaká e-mail' t, registracia_poslat is not null caka, stav from zakaznici where email = 'peter@maly.sk';           -- → t, zaujemca
-- funkcia pripomienky vytvorí odkaz (odtlačok h-peter) a pošle e-mail
update zakaznici set registracia_hash = 'h-peter', registracia_do = now() + interval '7 days', registracia_poslat = null where email = 'peter@maly.sk';

\echo '=== 3. chybné údaje'
select _registracia_dokoncit('h-zly', :'P', 'Peter Malý', '0905 123 456', null, array['Poprad']);                          -- → neplatny_odkaz
select _registracia_dokoncit('h-peter', :'P', 'Pe', '0905 123 456', null, array['Poprad']);                                -- → meno
select _registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905', null, array['Poprad']);                                -- → telefon
select _registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905 123 456', null, array['Neexistuje']);                    -- → okresy
select _registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905 123 456', null, array['Poprad', 'Kežmarok', 'Levoča', 'Prešov']);  -- → okresy_max
select 'po chybách' t, count(*) from kancelarie where nazov = 'Peter Malý';                                               -- → 0

\echo '=== 4. dokončenie registrácie'
delete from push_fronta;
select 'výsledok' t, (r->>'kancelaria') is not null kanc, r->>'skusobna_do' = to_char(current_date + 14, 'YYYY-MM-DD') do14
  from (select _registracia_dokoncit('h-peter', :'P', ' Peter Malý ', '0905 123 456', null, array['Poprad', 'Kežmarok', 'Poprad', 'Neexistuje']) r) x;  -- → t, t
select 'kancelária' t, typ, okresy, sekcie, slug like 'k%' slug, pocet_webov from kancelarie where zakaznik_id = (select id from zakaznici where email = 'peter@maly.sk');  -- → makler, {Poprad,Kežmarok}, {chat,inzeraty,kalendar}
select 'maklér' t, meno, rola, telefon, kancelaria_id = (select id from kancelarie where nazov = 'Peter Malý') ok from makleri where id = :'P';  -- → Peter Malý, admin, 0905 123 456, t
select 'zákazník' t, stav, skusobna_od = current_date od, skusobna_do = current_date + 14 do14, okresy, telefon, registrovany is not null reg, registracia_hash is null bez_odkazu
  from zakaznici where email = 'peter@maly.sk';                                                                           -- → skusobna, t, t, {Poprad,Kežmarok}, 0905 123 456, t, t
select 'vzhľad' t, vzhlad_kancelarie((select id from kancelarie where nazov = 'Peter Malý'))->>'nazov';                    -- → Peter Malý
select 'upozornenie' t, p.druh, m.meno, left(p.poznamka, 60) from pripomienky p join makleri m on m.id = p.makler_id where p.druh = 'zakaznik';  -- → zakaznik, Martin Alpha, Nová registrácia…
select 'push' t, count(*) from push_fronta where makler_id = :'A';                                                         -- → 1
select _registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905 123 456', null, array['Poprad']);                        -- → neplatny_odkaz (odkaz už použitý)

\echo '=== 5. Peter vidí len to, čo si objednal'
set role authenticated; set request.jwt.claim.sub = :'P';
select 'P sekcie' t, ma_pristup('inzeraty') sk, ma_pristup('chat') ch, ma_pristup('kalendar') kal, ma_pristup('nehnutelnosti') nehn, ma_pristup('web') web, ma_pristup('matterport') mp;  -- → t, t, t, f, f, f
select 'P licencia' t, moja_licencia()->>'platna' platna, moja_licencia()->>'typ' typ, moja_licencia()->>'stav' stav;       -- → true, makler, skusobna
select 'P vidí inzeráty z okresov' t, count(*) filter (where okres not in ('Poprad', 'Kežmarok')) cudzie from inzeraty;   -- → 0
reset role; reset request.jwt.claim.sub;

\echo '=== 6. koniec skúšobnej doby, platba, nový modul'
update zakaznici set skusobna_do = current_date - 1 where email = 'peter@maly.sk';
set role authenticated; set request.jwt.claim.sub = :'P';
select 'po skúšobnej' t, ma_pristup('inzeraty') sk, ma_pristup('chat') ch, moja_licencia()->>'platna' platna;            -- → f, f, false
reset role; reset request.jwt.claim.sub;
update zakaznici set stav = 'aktivny', zaplatene_do = current_date + 30, moduly = array['skener', 'web'] where email = 'peter@maly.sk';
set role authenticated; set request.jwt.claim.sub = :'P';
select 'platí + web' t, ma_pristup('inzeraty') sk, ma_pristup('web') web, ma_pristup('nehnutelnosti') nehn, ma_pristup('klienti') kl;  -- → t, t, t, f
reset role; reset request.jwt.claim.sub;
update zakaznici set stav = 'pozastaveny' where email = 'peter@maly.sk';
set role authenticated; set request.jwt.claim.sub = :'P';
select 'pozastavený' t, ma_pristup('web') web;                                                                           -- → f
reset role; reset request.jwt.claim.sub;

\echo '=== 7. kancelária sa registruje sama'
select web_ziadost('info@tatry.sk', array['kancelaria', 'skener'], 1, 'mesacne', array['Poprad'], 'Rado Tatry', '0911 222 333', null, 4);
update zakaznici set registracia_hash = 'h-tatry', registracia_do = now() + interval '7 days', registracia_poslat = null where email = 'info@tatry.sk';
select _registracia_dokoncit('h-tatry', :'R', 'Rado Tatry', '0911 222 333', 'Reality Tatry s.r.o.', array['Poprad']) is not null ok;  -- → t
select 'kancelária R' t, k.nazov, k.typ, cardinality(k.sekcie) > 5 vela_sekcii, 'matterport' = any(k.sekcie) mp, z.nazov from kancelarie k join zakaznici z on z.id = k.zakaznik_id where z.email = 'info@tatry.sk';  -- → Reality Tatry s.r.o., kancelaria, t, f, Reality Tatry s.r.o.

\echo '=== 8. poslať odkaz znova'
select web_ziadost('jana@novakova.sk', array['web'], 1, 'mesacne', null, 'Jana Nováková', null, null, null);
update zakaznici set registracia_poslat = null where email = 'jana@novakova.sk';
set role authenticated; set request.jwt.claim.sub = :'A2';
select poslat_registraciu((select id from zakaznici where email = 'jana@novakova.sk'));                                 -- → chyba (len hlavný správca)
set request.jwt.claim.sub = :'A';
select poslat_registraciu((select id from zakaznici where email = 'peter@maly.sk'));                                    -- → chyba (už má prístup)
select poslat_registraciu((select id from zakaznici where email = 'jana@novakova.sk'));                                 -- → ok
reset role; reset request.jwt.claim.sub;
select 'Jana čaká' t, registracia_poslat is not null from zakaznici where email = 'jana@novakova.sk';                     -- → t
select 'Alpha stále všetko' t, (select sekcie from kancelarie where id = 1) is null alpha_null, _kancelaria_platna(1) platna;  -- → t, t

\echo '=== 9. opakovaná žiadosť s tým istým e-mailom → odkaz znova (najviac raz za hodinu)'
alter table zakaznici disable trigger zakaznici_upravene;   -- v skúške treba „staré“ upravene (inak web_ziadost poznámku nedoplní)
update zakaznici set registracia_poslat = null, registracia_email = now() - interval '2 hours', upravene = now() - interval '1 hour', poznamky = 'x' where email = 'jana@novakova.sk';
select web_ziadost('jana@novakova.sk', array['web'], 1, 'mesacne', null, 'Jana Nováková', null, null, null);
select 'Jana znova' t, registracia_poslat is not null caka from zakaznici where email = 'jana@novakova.sk';             -- → t
update zakaznici set registracia_poslat = null, registracia_email = now() - interval '5 minutes', upravene = now() - interval '1 hour', poznamky = 'x' where email = 'jana@novakova.sk';
select web_ziadost('jana@novakova.sk', array['web'], 1, 'mesacne', null, 'Jana Nováková', null, null, null);
select 'Jana o 5 min' t, registracia_poslat is not null caka from zakaznici where email = 'jana@novakova.sk';           -- → f (poslaný pred 5 min)
update zakaznici set upravene = now() - interval '1 hour', poznamky = 'x' where email = 'peter@maly.sk';
select web_ziadost('peter@maly.sk', array['skener'], 1, 'mesacne', null, null, null, null, null);
select 'Peter (zaregistrovaný)' t, registracia_poslat is not null caka from zakaznici where email = 'peter@maly.sk';   -- → f

alter table zakaznici enable trigger zakaznici_upravene;

\echo '=== 10. platiaci zákazník ostane platiaci'
\set Z '00000000-0000-0000-0000-0000000000c3'
insert into auth.users (id, email) values (:'Z', 'plati@realitka.sk') on conflict do nothing;
insert into zakaznici (typ, nazov, email, stav, moduly, zaplatene_do, registracia_hash, registracia_do)
values ('makler', 'Platiaci maklér', 'plati@realitka.sk', 'aktivny', array['web'], current_date + 20, 'h-plati', now() + interval '1 day');
select 'výsledok' t, r->>'skusobna_do' is null bez_skusobnej from (select _registracia_dokoncit('h-plati', :'Z', 'Pavol Platiaci', '0907 111 222', null, null) r) x;  -- → t
select 'zákazník' t, stav, skusobna_do is null bez_skusobnej, registrovany is not null reg from zakaznici where email = 'plati@realitka.sk';  -- → aktivny, t, t
select 'upozornenie' t, left(poznamka, 60) from pripomienky where druh = 'zakaznik' and poznamka like '%Pavol%';     -- → Nová registrácia: Pavol Platiaci … platiaci zákazník

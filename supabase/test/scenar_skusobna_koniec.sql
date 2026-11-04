-- Skúška konca skúšobnej doby a pripomienok do mobilu (103_skusobna_koniec_a_pripomienky_mobil.sql).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky sú v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set P '00000000-0000-0000-0000-0000000000c1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'P','peter@maly.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup) values (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}') on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into push_odbery (makler_id, endpoint, p256dh, auth) select id, 'https://p/' || id, 'x', 'y' from makleri on conflict do nothing;
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);

\echo '=== 1. zákazník v skúšobnej dobe, končí o 3 dni'
select web_ziadost('peter@maly.sk', array['skener'], 1, 'mesacne', array['Poprad'], 'Peter Malý', '0905 123 456', null, null);
update zakaznici set registracia_hash = 'h-peter', registracia_do = now() + interval '7 days', registracia_poslat = null where email = 'peter@maly.sk';
select (_registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905 123 456', null, array['Poprad']))->>'kancelaria' is not null ok;  -- → t
delete from push_fronta; delete from pripomienky where druh = 'zakaznik';
update zakaznici set skusobna_do = current_date + 3 where email = 'peter@maly.sk';
select 'beh' t, _skusobna_koniec() n;                                                                                   -- → 1
select 'zákazník' t, skusobna_email, skusobna_konci_oznamene = skusobna_do ozn from zakaznici where email = 'peter@maly.sk';  -- → konci, t
select 'zvonček' t, m.meno, left(p.poznamka, 80) from pripomienky p join makleri m on m.id = p.makler_id where p.druh = 'zakaznik';  -- → Martin Alpha, Končí skúšobná doba: Peter Malý – … (o 3 dni) · zatiaľ nekontaktovaný …
select 'mobil' t, titul, left(text, 50) from push_fronta where makler_id = :'A';                                          -- → ⏳ Skúšobná doba končí
select 'druhý beh v ten istý deň' t, _skusobna_koniec() n;                                                               -- → 0
-- funkcia pripomienky e-mail odoslala
update zakaznici set skusobna_email = null where email = 'peter@maly.sk';

\echo '=== 2. predĺženie skúšky → upozornenie pre nový dátum znova'
update zakaznici set skusobna_do = current_date + 2 where email = 'peter@maly.sk';
select 'po predĺžení' t, _skusobna_koniec() n;                                                                          -- → 1
select 'e-mail' t, skusobna_email from zakaznici where email = 'peter@maly.sk';                                           -- → konci
update zakaznici set skusobna_email = null where email = 'peter@maly.sk';

\echo '=== 3. skončila včera, nekontaktovaný → e-mail, zvonček, mobil'
delete from push_fronta; delete from pripomienky where druh = 'zakaznik';
update zakaznici set skusobna_do = current_date - 1 where email = 'peter@maly.sk';
select 'beh' t, _skusobna_koniec() n;                                                                                   -- → 1
select 'zákazník' t, skusobna_email, skusobna_skoncila_oznamene = skusobna_do ozn from zakaznici where email = 'peter@maly.sk';  -- → skoncila, t
select 'zvonček' t, left(p.poznamka, 90) from pripomienky p where p.druh = 'zakaznik';                                   -- → Skončila skúšobná doba: … · NEKONTAKTOVANÝ – ozvi sa mu …
select 'mobil' t, count(*) from push_fronta where makler_id = :'A';                                                      -- → 1
update zakaznici set skusobna_email = null where email = 'peter@maly.sk';

\echo '=== 4. kontaktovaný zákazník, ktorému skončila skúška → bez mobilu, len zvonček'
delete from push_fronta; delete from pripomienky where druh = 'zakaznik';
update zakaznici set skusobna_do = current_date - 2, kontaktovany = now() where email = 'peter@maly.sk';
select 'beh' t, _skusobna_koniec() n;                                                                                   -- → 1
select 'zvonček' t, count(*) from pripomienky where druh = 'zakaznik';                                                   -- → 1
select 'mobil' t, count(*) from push_fronta where makler_id = :'A';                                                      -- → 0
update zakaznici set skusobna_email = null where email = 'peter@maly.sk';

\echo '=== 5. zákazník bez registrácie alebo platiaci – nič'
update zakaznici set skusobna_do = current_date + 3, registrovany = null where email = 'peter@maly.sk';
select 'bez registrácie' t, _skusobna_koniec() n;                                                                       -- → 0
update zakaznici set registrovany = now(), stav = 'aktivny' where email = 'peter@maly.sk';
select 'platiaci' t, _skusobna_koniec() n;                                                                              -- → 0

\echo '=== 6. vlastná pripomienka, obhliadka a udalosť → mobil v pravý čas'
delete from push_fronta;
insert into pripomienky (makler_id, cas, poznamka, druh) values
  (:'A', now() - interval '1 minute', 'Zavolať majiteľke rodinného domu', 'pripomienka'),
  (:'A', now() - interval '2 minutes', 'Obhliadka – 3-izbový byt o 10:30', 'obhliadka'),
  (:'A', now() + interval '1 hour', 'Ešte nie', 'pripomienka'),
  (:'A', now() - interval '13 hours', 'Príliš stará', 'pripomienka');
select 'beh' t, _pripomienky_push() n;                                                                                  -- → 2
select 'mobil' t, titul, text from push_fronta where makler_id = :'A' order by id;                                      -- → 🔔 Pripomienka · Zavolať…, 🗝️ Obhliadka · Obhliadka – …
select 'označené' t, count(*) filter (where push_odoslany is not null) odoslane, count(*) filter (where push_odoslany is null) caka
  from pripomienky where makler_id = :'A' and druh in ('pripomienka', 'obhliadka');                                     -- → 2, 2
select 'druhý beh' t, _pripomienky_push() n;                                                                            -- → 0

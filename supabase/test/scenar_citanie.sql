-- Skúška 2. kroku, časti b (čítanie a rozosielanie po kanceláriách): Alpha Reality (A – hlavný správca, A2) a kancelária B (B – admin, B2).
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky sú v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'A2','a2@alpha.sk'), (:'B','b@ina.sk'), (:'B2','b2@ina.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny) values (:'A','Martin Alpha','a@alpha.sk','admin',true), (:'A2','Kolega Alpha','a2@alpha.sk','makler',true) on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into kancelarie (id, nazov, okresy, slug) values (2, 'Iná kancelária', array['Poprad'], 'ina') on conflict (id) do nothing;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Admin B','b@ina.sk','admin',true,2), (:'B2','Maklér B','b2@ina.sk','makler',true,2) on conflict do nothing;
insert into push_odbery (makler_id, endpoint, p256dh, auth) select id, 'https://p/' || id, 'x', 'y' from makleri;
insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', 'x') on conflict (kluc) do nothing;

\echo '=== 1. nastavenia kancelárie'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A vzhľad' t, ulozit_vzhlad('{"nazov":"Alpha Reality","farba":"#c8a24a","meranie":{"ga":"G-ALPHA"}}'::jsonb)->>'nazov';
select 'A odkaz' t, coalesce(nastavit_odkaz('Ahoj Alpha', true)::text, '') = '' ok;
select 'A údaje' t, ulozit_kancelariu('{"nazov":"Alpha Reality s.r.o.","telefon":"0905111222","email":"info@alpha.sk"}'::jsonb)->>'nazov';
set request.jwt.claim.sub = :'B';
select 'B vidí vzhľad' t, vzhlad_kancelarie()->>'nazov' nazov, vzhlad_kancelarie()->'meranie'->>'ga' ga;           -- → null, null
select 'B vidí odkaz' t, nastavenia_aplikacie()->>'odkaz_text' odkaz;                                                -- → (prázdne)
select 'B vidí údaje' t, kancelaria_udaje()->>'nazov';                                                               -- → null
select 'B vzhľad' t, ulozit_vzhlad('{"nazov":"Iná RK","farba":"#2255aa"}'::jsonb)->>'nazov';
reset role; reset request.jwt.claim.sub;
select 'vzhľad 1 / 2' t, vzhlad_kancelarie(1)->>'nazov', vzhlad_kancelarie(2)->>'nazov', vzhlad_kancelarie()->>'nazov' bez_prihlasenia;  -- → Alpha Reality, Iná RK, Alpha Reality
select 'v spoločných nastaveniach' t, count(*) from nastavenia where kluc in ('vzhlad', 'kancelaria', 'odkaz_text');   -- → 0

\echo '=== 2. kľúč skenera mení len hlavný správca'
set role authenticated; set request.jwt.claim.sub = :'B';
select skener_novy_kluc();                                                                                            -- → chyba
set request.jwt.claim.sub = :'A';
select 'A nový kľúč' t, length(skener_novy_kluc()) > 20 ok;                                                         -- → t
reset role; reset request.jwt.claim.sub;

\echo '=== 3. štatistiky a zoznamy len kancelárie'
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, cena) values (:'A', 'Byt Alpha', 'aktivne', 'predaj', 100000), (:'A', 'Koncept Alpha', 'koncept', 'predaj', 90000);
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, cena) values (:'B2', 'Dom B', 'aktivne', 'predaj', 200000);
insert into cas_v_aplikacii (makler_id, den, hodina, sekcia, sekundy) values (:'A2', current_date, 10, 'inzeraty', 600), (:'B2', current_date, 10, 'inzeraty', 900);
select 'značky ponúk' t, string_agg(nazov || ':' || kancelaria || ':' || coalesce(cislo, '-'), ', ' order by id) from nehnutelnosti;  -- → Alpha …:alpha:MA001/MA002, Dom B:ina:MB001
set role authenticated; set request.jwt.claim.sub = :'B';
select 'B štatistiky' t, string_agg(x->>'meno', ',' order by x->>'meno') from jsonb_array_elements(statistiky_ponuk(now() - interval '1 year', now() + interval '1 day')) x;  -- → Admin B,Maklér B
select 'B výkon' t, string_agg(x->>'meno', ',' order by x->>'meno') from jsonb_array_elements(vykon_maklerov(now() - interval '7 days', now())->'makleri') x;  -- → Admin B,Maklér B
select 'B čas' t, jsonb_array_length(cas_v_typkovi()->'makleri') n;                                                  -- → 2
select 'B prihlásenia' t, jsonb_array_length(prihlasenia_maklerov()) n;                                              -- → 2
set request.jwt.claim.sub = :'A';
select 'A štatistiky' t, string_agg(x->>'meno', ',' order by x->>'meno') from jsonb_array_elements(statistiky_ponuk(now() - interval '1 year', now() + interval '1 day')) x;  -- → Kolega Alpha,Martin Alpha
reset role; reset request.jwt.claim.sub;

\echo '=== 4. tímový chat – upozornenie len kolegom z kancelárie'
delete from push_fronta;
insert into spravy (makler_id, text, typ) values (:'A', 'Porada o 9:00', 'sprava');
select 'push po správe A' t, string_agg(m.meno, ',' order by m.meno) from push_fronta f join makleri m on m.id = f.makler_id;  -- → Kolega Alpha
select 'správa v kancelárii' t, kancelaria_id from spravy where text = 'Porada o 9:00';                              -- → 1
set role authenticated; set request.jwt.claim.sub = :'B';
select poslat_sukromnu_spravu(:'A2', 'Ahoj z B');                                                                     -- → chyba (kolega nemá chat)
reset role; reset request.jwt.claim.sub;

\echo '=== 5. web kancelárie – každá kancelária vlastný'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A web kancelárie' t, web_kancelarie()->>'adresa' adresa;
set request.jwt.claim.sub = :'B';
select 'B web kancelárie' t, web_kancelarie()->>'adresa' adresa;                                                    -- → ina-rk (nie web Alpha)
reset role; reset request.jwt.claim.sub;
select 'weby kancelárií' t, string_agg(kancelaria_id || ':' || adresa, ', ' order by kancelaria_id) from weby where kancelaria;  -- → 1:alpha-reality, 2:ina-rk

\echo '=== 6. koncept ponuky a náhľad webu len pre vlastnú kanceláriu'
set role authenticated; set request.jwt.claim.sub = :'B';
select 'B koncept Alpha' t, verejna_ponuka((select id from nehnutelnosti where nazov = 'Koncept Alpha')) is null skryty;  -- → t
set request.jwt.claim.sub = :'A2';
select 'A2 koncept Alpha' t, verejna_ponuka((select id from nehnutelnosti where nazov = 'Koncept Alpha'))->>'kancelaria_id' k;  -- → 1
reset role; reset request.jwt.claim.sub;
select 'verejná ponuka B – kancelária' t, verejna_ponuka((select id from nehnutelnosti where nazov = 'Dom B'))->'kanc'->>'nazov';  -- → Iná RK

\echo '=== 7. kalendár v mobile – zdieľané udalosti len z kancelárie'
insert into udalosti (makler_id, nazov, zaciatok, zdielane) values (:'A', 'Školenie Alpha', now() + interval '1 day', true);
insert into makleri_kalendar (makler_id, token) values (:'B2', 'tokenB2-0123456789abcdef'), (:'A2', 'tokenA2-0123456789abcdef') on conflict do nothing;
select 'kalendár B2' t, jsonb_array_length(_kalendar_feed('tokenB2-0123456789abcdef')->'udalosti') n;                 -- → 0
select 'kalendár A2' t, jsonb_array_length(_kalendar_feed('tokenA2-0123456789abcdef')->'udalosti') n;                 -- → 1

\echo '=== 8. sídliská a Matterport v kancelárii'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A sídlisko' t, ulozit_sidlisko(null, 'Poprad', 'Juh', true) is not null ok;
set request.jwt.claim.sub = :'B';
select 'B rovnaké sídlisko' t, ulozit_sidlisko(null, 'Poprad', 'Juh', true) is not null ok;                         -- → t
select rezervovat_sidlisko((select id from sidliska where kancelaria_id = 1 limit 1), 'cele', null, null);          -- → chyba Sídlisko neexistuje
reset role; reset request.jwt.claim.sub;
select 'sídliská' t, string_agg(kancelaria_id || ':' || nazov, ', ' order by kancelaria_id) from sidliska;          -- → 1:Juh, 2:Juh

\echo '=== 9. história zmien a oznamy adminom v kancelárii'
set role authenticated; set request.jwt.claim.sub = :'A';
select prepnut_kancelariu(2);
reset role;
update nehnutelnosti set cena = 199000 where nazov = 'Dom B';   -- úprava hlavným správcom v režime podpory (ako cez funkciu)
set role authenticated;
select prepnut_kancelariu(null);
reset role; reset request.jwt.claim.sub;
select 'história Dom B' t, kancelaria_id from historia_zmien where tabulka = 'nehnutelnosti' and akcia = 'zmena' order by id desc limit 1;  -- → 2
select _oznam_adminom('Skúška oznamu', 2);
select 'oznam adminom 2' t, string_agg(m.meno, ',') from pripomienky p join makleri m on m.id = p.makler_id where p.poznamka = 'Skúška oznamu';  -- → Admin B

\echo '=== 10. súbory: chat a web podľa kancelárie'
grant select, insert, update, delete on storage.objects to authenticated;   -- v Supabase to platí, v skúšobnej databáze treba doplniť
set role authenticated; set request.jwt.claim.sub = :'B';
insert into storage.objects (bucket_id, name, owner_id) values ('chat-prilohy', 'tim/k2/b.jpg', :'B');               -- → ok
insert into storage.objects (bucket_id, name, owner_id) values ('chat-prilohy', 'tim/k1/b.jpg', :'B');               -- → chyba (cudzí tím)
insert into storage.objects (bucket_id, name, owner_id) values ('chat-prilohy', 'tim/stary.jpg', :'B');              -- → chyba (staré tim/ patrí Alpha)
insert into storage.objects (bucket_id, name, owner_id) values ('weby', 'kancelaria/k2/logo.png', :'B');             -- → ok
insert into storage.objects (bucket_id, name, owner_id) values ('weby', 'kancelaria/logo.png', :'B');                -- → chyba
insert into storage.objects (bucket_id, name, owner_id) values ('weby', :'A2' || '/foto.jpg', :'B');                 -- → chyba (maklér inej kancelárie)
reset role; reset request.jwt.claim.sub;
insert into storage.objects (bucket_id, name, owner_id) values ('chat-prilohy', 'tim/stary-alpha.jpg', :'A2');
set role authenticated; set request.jwt.claim.sub = :'B';
select 'B vidí prílohy' t, string_agg(name, ', ' order by name) from storage.objects where bucket_id = 'chat-prilohy';  -- → tim/k2/b.jpg
set request.jwt.claim.sub = :'A2';
select 'A2 vidí prílohy' t, string_agg(name, ', ' order by name) from storage.objects where bucket_id = 'chat-prilohy';  -- → tim/stary-alpha.jpg
reset role; reset request.jwt.claim.sub;

\echo '=== 11. návrh hovoru z AI vidí len jeho autor, verdikt všetci s okresom'
insert into inzeraty (id, portal, nazov, okres, aktivny) values ('ai-test-1', 'bazos', 'Byt súkromník', 'Poprad', true) on conflict do nothing;
insert into inzeraty_ai (inzerat_id, verdikt, istota, hovor, sms, hovor_vytvoril) values ('ai-test-1', 'sukromny', 90, 'Dobrý deň, tu Admin B…', 'SMS B', :'B')
  on conflict (inzerat_id) do update set hovor = excluded.hovor, sms = excluded.sms, hovor_vytvoril = excluded.hovor_vytvoril;
update kancelarie set okresy = array['Spišská Nová Ves', 'Levoča', 'Poprad'] where id = 1;   -- spoločný okres
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A verdikt' t, verdikt from inzeraty_ai where inzerat_id = 'ai-test-1';                                       -- → sukromny
select hovor from inzeraty_ai where inzerat_id = 'ai-test-1';                                                         -- → chyba (stĺpec nepovolený)
select 'A moje návrhy' t, count(*) from moje_ai_navrhy();                                                             -- → 0
set request.jwt.claim.sub = :'B';
select 'B moje návrhy' t, string_agg(hovor, ',') from moje_ai_navrhy();                                               -- → Dobrý deň, tu Admin B…
reset role; reset request.jwt.claim.sub;
update kancelarie set okresy = array['Spišská Nová Ves', 'Levoča'] where id = 1;

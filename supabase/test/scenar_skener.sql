-- Skúška 3. kroku (skener po kanceláriách): Alpha Reality (A, A2; okresy SNV a Levoča) a kancelária B (Poprad, neskôr aj SNV).
-- Spúšťať po prehraj.sh a nahratí obcí (supabase/seed/lokality.sql). Očakávané výsledky sú v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'A2','a2@alpha.sk'), (:'B','b@ina.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny) values (:'A','Martin','a@alpha.sk','admin',true), (:'A2','Kolega','a2@alpha.sk','makler',true) on conflict do nothing;
update makleri set pristup = array['inzeraty'] where id = :'A2';
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into kancelarie (id, nazov, okresy) values (2, 'Iná kancelária', array['Poprad']) on conflict (id) do update set okresy = excluded.okresy;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Konkurent','b@ina.sk','admin',true,2) on conflict do nothing;
insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(extensions.digest('kluc', 'sha256'), 'hex'))
  on conflict (kluc) do update set hodnota = excluded.hodnota;
insert into inzeraty (id, portal, url, nazov, obec, okres, aktivny, predajca_typ, cena, prvy_krat) values
  ('t1','bazos','https://x/1','Byt SNV','Spišská Nová Ves','Spišská Nová Ves',true,'sukromny',100000, now()),
  ('t2','bazos','https://x/2','Byt Poprad','Poprad','Poprad',true,'sukromny',120000, now()),
  ('t3','bazos','https://x/3','Dom SNV','Smižany','Spišská Nová Ves',true,'sukromny',200000, now()) on conflict do nothing;
insert into archiv (inzerat_id, telefon) values ('t3', '0905 123 456') on conflict do nothing;
insert into push_odbery (makler_id, endpoint, p256dh, auth) values (:'A','https://p/a','x','y'), (:'B','https://p/b','x','y');

\echo '=== 1. kto vidí ktoré inzeráty'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A vidí' t, string_agg(id, ',' order by id) from inzeraty;                                   -- → t1,t3
select 'A zoznam' t, jsonb_array_length(inzeraty_zoznam(0, 100)->'riadky') n;                      -- → 2
set request.jwt.claim.sub = :'B';
select 'B vidí' t, string_agg(id, ',' order by id) from inzeraty;                                   -- → t2
select 'B archív t3' t, count(*) from archiv;                                                       -- → 0
\echo '--- B skúša prevziať inzerát zo SNV (nemá okres) → chyba'
select prevziat('t1');
reset role; reset request.jwt.claim.sub;

\echo '=== 2. obe kancelárie majú SNV – každá vlastné prevzatie, telefón, označenie'
update kancelarie set okresy = array['Poprad', 'Spišská Nová Ves'] where id = 2;
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A prevzal t1' t, prevziat('t1') is null ok;
select 'A telefón t1' t, ulozit_telefon('t1', '0900 111 222') is null ok;
select 'A hovor' t, zapisat_hovor('t1', 'Nedvíha', 'skúsiť poobede')->>'pokus' pokus;              -- → 1
set request.jwt.claim.sub = :'B';
select 'B prevzal t1' t, prevziat('t1') is null ok;                                                  -- → ok (vlastné prevzatie)
select 'B telefón t1' t, ulozit_telefon('t1', '0911 999 888') is null ok;
select 'B hovor' t, zapisat_hovor('t1', 'Nedvíha', null)->>'pokus' pokus;                            -- → 1 (nie 2)
select 'B RK' t, oznacit_predajcu('t1', 'rk') is null ok;
select 'B vidí prevzatia' t, count(*), min(makler_id::text) from prevzatia;                          -- → 1, B
select 'B vidí telefón' t, telefon from telefony;                                                    -- → 0911 999 888
set request.jwt.claim.sub = :'A';
select 'A vidí prevzatie' t, makler_id = :'A' moje, pocet_hovorov from prevzatia where inzerat_id = 't1';  -- → t, 1
select 'A vidí telefón' t, telefon from telefony where inzerat_id = 't1';                            -- → 0900 111 222
select 'A vidí označenia' t, count(*) from oznacenia;                                                -- → 0 (RK označila len B)
select 'A pripomienky volať' t, count(*) from pripomienky where druh = 'volat' and zrusena is null;  -- → 1
reset role; reset request.jwt.claim.sub;
select 'spolu prevzatí t1' t, count(*) from prevzatia where inzerat_id = 't1';                       -- → 2
select 'spolu volať t1' t, count(*) from pripomienky where inzerat_id = 't1' and druh = 'volat' and zrusena is null;  -- → 2

\echo '=== 3. hovor B nezruší pripomienku Alpha'
set role authenticated; set request.jwt.claim.sub = :'B';
select 'B hovor 2' t, zapisat_hovor('t1', 'Nemá záujem', null) is not null ok;
reset role; reset request.jwt.claim.sub;
select 'volať po hovore B' t, string_agg(m.meno, ',') from pripomienky p join makleri m on m.id = p.makler_id
  where p.inzerat_id = 't1' and p.druh = 'volat' and p.zrusena is null;                             -- → Martin

\echo '=== 4. adresár predávajúcich a vymazanie čísla'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A kontakty' t, string_agg(x->>'tel', ',' order by x->>'tel') from jsonb_array_elements(kontakty_predajcov()) x;  -- → 0900111222,0905123456
set request.jwt.claim.sub = :'B';
select 'B kontakty' t, string_agg(x->>'tel' || ':' || (x->>'rk'), ',' order by x->>'tel') from jsonb_array_elements(kontakty_predajcov()) x;  -- → 0905123456:false,0911999888:true
select 'B vymaže 0905' t, vymazat_predajcu('0905 123 456');                                          -- → 1
select 'B kontakty po' t, string_agg(x->>'tel', ',') from jsonb_array_elements(kontakty_predajcov()) x;  -- → 0911999888
set request.jwt.claim.sub = :'A';
select 'A kontakty po' t, string_agg(x->>'tel', ',' order by x->>'tel') from jsonb_array_elements(kontakty_predajcov()) x;  -- → 0900111222,0905123456
select 'A uloží predajcu' t, ulozit_predajcu('0905 123 456', 'Pán Novák', 'volať večer', false) is null ok;
set request.jwt.claim.sub = :'B';
select 'B uloží rovnaké číslo' t, ulozit_predajcu('0905 123 456', 'Iné meno', null, false) is null ok;
reset role; reset request.jwt.claim.sub;
select 'predávajúci 0905' t, string_agg(kancelaria_id || ':' || meno, ',' order by kancelaria_id) from predajcovia where telefon = '0905123456';  -- → 1:Pán Novák,2:Iné meno

\echo '=== 5. upozornenia do mobilu podľa okresov a označení kancelárie'
select 'push t2 (Poprad)' t, string_agg(m.meno, ',') from jsonb_array_elements(skener_push_ciele('kluc', array['t2'])) c,
  jsonb_array_elements(c->'odbery') o join push_odbery s on s.id = (o->>'id')::bigint join makleri m on m.id = s.makler_id;  -- → Konkurent
select 'push t1 (SNV, B označila RK)' t, string_agg(m.meno, ',') from jsonb_array_elements(skener_push_ciele('kluc', array['t1'])) c,
  jsonb_array_elements(c->'odbery') o join push_odbery s on s.id = (o->>'id')::bigint join makleri m on m.id = s.makler_id;  -- → Martin
update predajcovia set nevolat = true where telefon = '0905123456' and kancelaria_id = 1;
select 'push t3 (SNV, Alpha: nevolať)' t, string_agg(m.meno, ',') from jsonb_array_elements(skener_push_ciele('kluc', array['t3'])) c,
  jsonb_array_elements(c->'odbery') o join push_odbery s on s.id = (o->>'id')::bigint join makleri m on m.id = s.makler_id;  -- → Konkurent

\echo '=== 6. okresy pre skener'
insert into zakaznici (nazov, typ, stav, moduly, okresy, skusobna_do) values
  ('Skúška', 'makler', 'skusobna', array['skener'], array['Kežmarok'], current_date + 10),
  ('Bez skenera', 'makler', 'skusobna', array['web'], array['Trnava'], current_date + 10),
  ('Zrušený', 'makler', 'zruseny', array['skener'], array['Senec'], null);
select 'skener okresy' t, skener_okresy('kluc');                                                     -- → Kežmarok, Levoča, Poprad, SNV
select 'zlý kľúč' t, skener_okresy('zly');                                                            -- → chyba

\echo '=== 7. znížená cena a automatické uvoľnenie'
update inzeraty set cena = 90000 where id = 't1';
select 'pripomienky cena' t, string_agg(kancelaria_id::text, ',' order by kancelaria_id) from pripomienky where druh = 'cena';  -- → 1,2
update prevzatia set upravene = now() - interval '2 days', posledny_vysledok = null;
select 'auto uvoľnené' t, auto_uvolnit();                                                             -- → 2
select 'prevzatia po' t, count(*) filter (where makler_id is null), count(*) from prevzatia;         -- → 2, 2
select 'aktivity uvoľnenie' t, string_agg(kancelaria_id::text, ',' order by kancelaria_id) from aktivity where typ = 'uvolnenie';  -- → 1,2

\echo '=== 8. režim podpory: Martin v kancelárii 2'
set role authenticated; set request.jwt.claim.sub = :'A';
select 'prepnúť' t, prepnut_kancelariu(2);
select 'A v podpore vidí' t, string_agg(id, ',' order by id) from inzeraty;                           -- → t1,t2,t3
select 'A v podpore prevezme t2' t, prevziat('t2') is null ok;
select 'späť' t, prepnut_kancelariu(null);
reset role; reset request.jwt.claim.sub;
select 'prevzatie t2' t, kancelaria_id, makler_id = :'A' from prevzatia where inzerat_id = 't2';      -- → 2, t

\echo '=== 9. formulár z webu: predávajúci k makléra B (spúšťač doplní kanceláriu, konflikt na (telefon, kancelaria))'
insert into predajcovia (telefon, meno, makler_id, upravene) values ('0944555666', 'Web 1', :'B', now())
  on conflict (telefon, kancelaria_id) do update set meno = predajcovia.meno || '+' || excluded.meno;
insert into predajcovia (telefon, meno, makler_id, upravene) values ('0944555666', 'Web 2', :'B', now())
  on conflict (telefon, kancelaria_id) do update set meno = predajcovia.meno || '+' || excluded.meno;
select 'web predávajúci' t, kancelaria_id, meno from predajcovia where telefon = '0944555666';         -- → 2, Web 1+Web 2

\echo '=== 10. archív a obnova pre skener (bez duplicít, keď inzerát majú dve kancelárie)'
select 'na archív' t, string_agg(x->>'id', ',' order by x->>'id') from jsonb_array_elements(skener_na_archiv('kluc', 40)) x;  -- → t1,t2 (t3 má archív)

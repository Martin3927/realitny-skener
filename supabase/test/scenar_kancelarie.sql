-- Skúška oddelenia kancelárií: Alpha Reality (A, A2) a iná kancelária (B). Spúšťať po prehraj.sh.
\set ON_ERROR_STOP 0
\set A '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
-- príprava (ako systém)
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'A2','a2@alpha.sk'), (:'B','b@ina.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny) values (:'A','Martin','a@alpha.sk','admin',true), (:'A2','Kolega','a2@alpha.sk','makler',true) on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into kancelarie (nazov) values ('Iná kancelária') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Konkurent','b@ina.sk','admin',true,2) on conflict do nothing;
insert into inzeraty (id, portal, url, nazov, obec, okres, aktivny) values ('t1','bazos','https://x/1','Byt test','Spišská Nová Ves','Spišská Nová Ves',true) on conflict do nothing;
-- ako Martin (Alpha)
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A pripomienka' t, ulozit_pripomienku(null, :'A', 't1', null, now() + interval '1 day', 'Zavolať predajcovi') is not null ok;
select 'A sprava' t, poslat_spravu('Ahoj tím') is not null ok;
select 'A prevziat' t, (prevziat('t1')) is not null ok;
select 'A hovor' t, coalesce((zapisat_hovor('t1', 'Nedvíha', 'skúsiť poobede'))::text, '') = '' ok;
select 'A telefon' t, coalesce((ulozit_telefon('t1', '0900 111 222'))::text, '') = '' ok;
select 'A vidi' t, (select count(*) from pripomienky) prip, (select count(*) from prevzatia) prev, (select count(*) from telefony) tel, (select count(*) from spravy) spr, (select count(*) from makleri) mak;
reset role;
-- ako konkurent B (admin inej kancelárie)
set role authenticated; set request.jwt.claim.sub = :'B';
select 'B vidi' t, (select count(*) from pripomienky) prip, (select count(*) from prevzatia) prev, (select count(*) from telefony) tel, (select count(*) from spravy) spr, (select count(*) from aktivity) akt, (select count(*) from makleri) mak;
select 'B zrusit cudziu pripomienku' t, zrusit_pripomienku((select min(id) from pripomienky where true));
\echo '--- B skúša zrušiť pripomienku Alpha (id 1) cez funkciu'
select zrusit_pripomienku(1);
\echo '--- B skúša uvoľniť inzerát, ktorý prevzala Alpha'
select uvolnit('t1');
\echo '--- B skúša prepísať telefón predajcu'
select ulozit_telefon('t1', '0999 999 999');
\echo '--- B skúša prepnúť sa do Alpha'
select prepnut_kancelariu(1);
reset role;
select 'po pokusoch B' t, (select zrusena is null from pripomienky where id = 1) prip_ostala, (select makler_id from prevzatia where inzerat_id='t1') prevzal, (select telefon from telefony where inzerat_id='t1') telefon;
-- Martin v režime podpory
set role authenticated; set request.jwt.claim.sub = :'A';
select 'A prepne do 2' t, prepnut_kancelariu(2);
select 'A v podpore vidi' t, (select count(*) from pripomienky) prip, (select count(*) from makleri) mak;
select 'A spat' t, prepnut_kancelariu(null);
select 'A doma vidi' t, (select count(*) from pripomienky) prip, (select count(*) from makleri) mak;
reset role;
-- kolega z Alpha vidí Alpha
set role authenticated; set request.jwt.claim.sub = :'A2';
select 'A2 vidi' t, (select count(*) from pripomienky) prip_svoje, (select count(*) from spravy) spr, (select count(*) from makleri) mak;
reset role;
\echo '--- B skúša upraviť a deaktivovať makléra Alpha'
set role authenticated; set request.jwt.claim.sub = :'B';
select upravit_maklera(:'A2', 'Hacknutý', 'makler', false, false);
select nastavit_pristup_maklera(:'A2', array['inzeraty']);
reset role;
select 'makler A2 po pokuse' t, meno, aktivny from makleri where id = :'A2';
\echo '--- Martin v podpore kancelárie 2: zápis času a pripomienky pre seba nesmie padnúť'
set role authenticated; set request.jwt.claim.sub = :'A';
select prepnut_kancelariu(2);
select 'cas v podpore' t, coalesce(pripocitaj_cas('{"inzeraty": 30}'::jsonb)::text, '') = '' ok;
select 'som_tu v podpore' t, coalesce(som_tu()::text, '') = '' ok;
select prepnut_kancelariu(null);
reset role;
\echo '--- web: návštevník pošle kontakt maklérovi B (bez prihlásenia)'

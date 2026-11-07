-- Skúška prepojenia s Facebookom a Instagramom (122): stav vidí len vlastná kancelária, kľúče nikto z aplikácie.
-- Spúšťať po prehraj.sh. Očakávané výsledky sú v komentároch.
\set ON_ERROR_STOP 0
\set A '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B '00000000-0000-0000-0000-0000000000b1'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'A2','a2@alpha.sk'), (:'B','b@ina.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny) values (:'A','Martin','a@alpha.sk','admin',true), (:'A2','Kolega','a2@alpha.sk','makler',true) on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
insert into kancelarie (nazov) values ('Iná kancelária') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values (:'B','Konkurent','b@ina.sk','admin',true,2) on conflict do nothing;
-- server (funkcia meta) uloží prepojenie Alpha a Make webhook kancelárie 2
insert into siete_prepojenia (kancelaria_id, fb_page_id, fb_page_nazov, fb_page_token, ig_id, ig_meno, pripojil)
  values (1, '111', 'Alpha Reality', 'v1.tajne.tajne', '222', 'alphareality', :'A') on conflict do nothing;
insert into nastavenia_kancelarie (kancelaria_id, kluc, hodnota) values (2, 'make_siete_webhook', 'https://hook.example/x') on conflict do nothing;

set role authenticated; set request.jwt.claim.sub = :'A';
-- očakávané: meta so stránkou Alpha Reality, @alphareality, pripojil Martin; make false
select 'A stav' t, siete_prepojenie();
\echo '--- A číta tabuľku priamo (očakávané: permission denied)'
select fb_page_token from siete_prepojenia;
\echo '--- A číta prihlásenia (očakávané: permission denied)'
select * from siete_prihlasenia;
-- režim podpory: Martin v kancelárii 2 → meta null, make true
select 'A prepne do 2' t, prepnut_kancelariu(2);
select 'A v podpore stav' t, siete_prepojenie();
select 'A späť' t, prepnut_kancelariu(null);
reset role; set request.jwt.claim.sub = '';

set role authenticated; set request.jwt.claim.sub = :'A2';
-- kolega z Alpha vidí stav (kvôli panelu príspevku): meta Alpha Reality
select 'A2 stav' t, siete_prepojenie() -> 'meta' ->> 'stranka' stranka;
reset role; set request.jwt.claim.sub = '';

set role authenticated; set request.jwt.claim.sub = :'B';
-- konkurent: meta null, make true (vlastný webhook), nič z Alpha
select 'B stav' t, siete_prepojenie();
\echo '--- B zapisuje do prepojení (očakávané: permission denied)'
insert into siete_prepojenia (kancelaria_id, fb_page_id, fb_page_token) values (2, 'x', 'y');
reset role; set request.jwt.claim.sub = '';

set role anon;
\echo '--- anon (očakávané: permission denied)'
select siete_prepojenie();
reset role;
-- očakávané: 1 prepojenie (Alpha), 0 prihlásení
select 'na konci' t, (select count(*) from siete_prepojenia) prepojenia, (select count(*) from siete_prihlasenia) prihlasenia;

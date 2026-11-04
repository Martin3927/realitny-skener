-- Skúška „Vymazať všetky upozornenia“ v zvončeku (112_zvoncek_vymazat_vsetko.sql).
-- Spúšťať po prehraj.sh. Očakávané výsledky sú v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set K '00000000-0000-0000-0000-0000000000a2'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'K','kolega@alpha.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup) values (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}'),
  (:'K','Kolega Alpha','kolega@alpha.sk','makler',true,'{}') on conflict do nothing;
delete from pripomienky;
insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh) values
  (:'A', :'A', now() - interval '2 days', 'po termíne 1', 'pripomienka'),
  (:'A', null, now() - interval '1 hour', 'kontakt z webu', 'web'),
  (:'A', :'A', now() + interval '3 hours', 'dnes neskôr', 'pripomienka'),
  (:'A', :'A', now() + interval '2 days', 'o 2 dni', 'pripomienka'),
  (:'K', :'A', now() - interval '1 hour', 'kolegovi od admina', 'pripomienka'),
  (:'A', null, now() - interval '5 minutes', 'pribudla medzitým', 'cena');

\echo '=== 1. admin vybaví všetko, čo videl (bez poslednej, ktorá pribudla medzitým)'
set role authenticated; set request.jwt.claim.sub = :'A';
select pripomienky_vybavit_vsetky(array(select id from pripomienky where poznamka <> 'pribudla medzitým' order by id)) n;   -- → 2
reset role; reset request.jwt.claim.sub;
select poznamka, hotovo is not null hotovo from pripomienky order by id;
-- → po termíne 1 t · kontakt z webu t · dnes neskôr f · o 2 dni f · kolegovi od admina f · pribudla medzitým f

\echo '=== 2. opakované volanie nič nezmení, prázdny zoznam = 0'
set role authenticated; set request.jwt.claim.sub = :'A';
select pripomienky_vybavit_vsetky(array(select id from pripomienky where poznamka <> 'pribudla medzitým')) n;   -- → 0
select pripomienky_vybavit_vsetky('{}') n;                                                                   -- → 0
reset role; reset request.jwt.claim.sub;

\echo '=== 3. kolega nevybaví pripomienky admina, len svoje'
set role authenticated; set request.jwt.claim.sub = :'K';
select pripomienky_vybavit_vsetky(array(select id from pripomienky)) n;                                       -- → 1
reset role; reset request.jwt.claim.sub;
select poznamka, hotovo is not null hotovo from pripomienky where poznamka in ('kolegovi od admina', 'pribudla medzitým') order by id;
-- → kolegovi od admina t · pribudla medzitým f

\echo '=== 4. bez prihlásenia sa nedá'
select pripomienky_vybavit_vsetky(array(select id from pripomienky)) n;                                       -- → ERROR
select has_function_privilege('anon', 'pripomienky_vybavit_vsetky(bigint[])', 'execute') anon;               -- → f

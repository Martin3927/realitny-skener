-- Databázový test: zdieľaná úloha v zvončeku – kolega dostane pripomienku „todo“ (bez e-mailu), po splnení ju má vybavenú
-- a autorke príde „Hotovo“; tieto upozornenia nevidí nikto iný, ani administrátor; po zrušení zdieľania zmiznú.
\set ON_ERROR_STOP on
update makleri set pristup = array_append(pristup, 'todo') where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- Jana zdieľa úlohu s Petrom
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into poznamky (text, zdielane) values ('Odfotiť byt na Hviezdoslavovej', array['33333333-3333-3333-3333-333333333333']::uuid[]);
select set_config('typek.zid', (select id::text from poznamky where text like 'Odfotiť%'), false);
commit;
do $$ declare r pripomienky;
begin
  select * into r from pripomienky where druh = 'todo';
  assert r.makler_id = '33333333-3333-3333-3333-333333333333' and r.poznamka_id = current_setting('typek.zid')::bigint, 'Peter má upozornenie k úlohe';
  assert r.poznamka like 'Jana Nováková ti zdieľa úlohu: Odfotiť byt%', 'text upozornenia: ' || r.poznamka;
  assert r.email_odoslany is not null and r.push_odoslany is not null and r.cas <= now(), 'bez e-mailu, hneď v zvončeku';
  assert r.kancelaria_id = 1, 'kancelária';
end $$;

-- administrátor upozornenie kolegu nevidí; Peter áno
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin assert (select count(*) from pripomienky where druh = 'todo') = 0, 'administrátor nevidí cudzie upozornenia ToDo'; end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin assert (select count(*) from pripomienky where druh = 'todo') = 1, 'Peter vidí svoje upozornenie'; end $$;
-- Peter úlohu splní
update poznamky set hotovo = true where id = current_setting('typek.zid')::bigint;
commit;
do $$ begin
  assert (select hotovo is not null from pripomienky where druh = 'todo' and makler_id = '33333333-3333-3333-3333-333333333333' and poznamka like '%zdieľa%'), 'Petrovi sa upozornenie vybavilo';
  assert (select count(*) from pripomienky where druh = 'todo' and makler_id = '22222222-2222-2222-2222-222222222222' and poznamka like 'Hotovo · Peter Kováč: Odfotiť%' and hotovo is null) = 1, 'Jane príde Hotovo';
end $$;

-- Jana úlohu znova otvorí a zdieľa ju s administrátorom, Petrovi ju prestane zdieľať → Petrovi zmiznú neprečítané
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update poznamky set hotovo = false where id = current_setting('typek.zid')::bigint;
update poznamky set zdielane = array['33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111']::uuid[] where id = current_setting('typek.zid')::bigint;
commit;
do $$ begin assert (select count(*) from pripomienky where druh = 'todo' and makler_id = '11111111-1111-1111-1111-111111111111' and hotovo is null) = 1, 'administrátor dostal upozornenie'; end $$;
-- Peter dostane nové, keď ho Jana pridá znova? Nie – stále v zdieľaní, nové nepríde
do $$ begin assert (select count(*) from pripomienky where druh = 'todo' and makler_id = '33333333-3333-3333-3333-333333333333') = 1, 'Petrovi nové neprišlo'; end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update poznamky set zdielane = array['33333333-3333-3333-3333-333333333333']::uuid[] where id = current_setting('typek.zid')::bigint;
commit;
do $$ begin assert (select count(*) from pripomienky where druh = 'todo' and makler_id = '11111111-1111-1111-1111-111111111111' and zrusena is not null) = 1, 'administrátorovi upozornenie zmizlo'; end $$;

-- zmazaná úloha → upozornenia preč
delete from poznamky where id = current_setting('typek.zid')::bigint;
do $$ begin assert (select count(*) from pripomienky where druh = 'todo') = 0, 'po zmazaní úlohy žiadne upozornenia'; end $$;
\echo todo_zvoncek OK

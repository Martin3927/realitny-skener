-- Databázový test: zdieľanie úloh v ToDo Liste – kolega vidí a odklikne zdieľanú úlohu, nemení skupinu ani zdieľanie,
-- nezmaže ju, môže sa odobrať; zdieľať sa dá len s kolegami s ToDo Listom; upozornenia do mobilu.
\set ON_ERROR_STOP on
update makleri set pristup = array_append(pristup, 'todo') where id = '22222222-2222-2222-2222-222222222222';
insert into push_odbery (makler_id, endpoint, p256dh, auth) select id, 'https://test/zdiel/' || id, 'p', 'a' from makleri on conflict do nothing;
delete from push_fronta;

-- Jana zdieľa úlohu s administrátorom aj s Petrom (Peter ToDo List nemá → vypadne) a sama so sebou (vypadne)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into poznamky (text, skupina, zdielane) values ('Pripraviť zmluvu pre Novákovcov', 'Ponuky',
  array['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222']::uuid[]);
insert into poznamky (text) values ('Moja súkromná');
do $$ declare r poznamky;
begin
  select * into r from poznamky where text like 'Pripraviť%';
  assert r.zdielane = array['11111111-1111-1111-1111-111111111111']::uuid[], 'zdieľané len s kolegom s ToDo Listom: ' || r.zdielane::text;
  perform set_config('typek.zid', r.id::text, false);
end $$;
commit;
do $$ begin
  assert (select count(*) from push_fronta where makler_id = '11111111-1111-1111-1111-111111111111' and titul like '%zdieľaná úloha%') = 1, 'upozornenie kolegovi pri zdieľaní';
  assert not exists (select 1 from push_fronta where makler_id <> '11111111-1111-1111-1111-111111111111'), 'nikomu inému';
end $$;

-- administrátor vidí len zdieľanú úlohu (nie Janinu súkromnú), upraví text a termín, skupinu a zdieľanie nezmení, odklikne ju
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin assert (select count(*) from poznamky) = 1, 'kolega vidí len zdieľanú'; end $$;
update poznamky set text = 'Pripraviť zmluvu – Novákovci', termin = '2026-12-01', skupina = 'Iná',
  zdielane = array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[] where id = current_setting('typek.zid')::bigint;
update poznamky set hotovo = true where id = current_setting('typek.zid')::bigint;
do $$ declare r poznamky;
begin
  select * into r from poznamky where id = current_setting('typek.zid')::bigint;
  assert r.text = 'Pripraviť zmluvu – Novákovci' and r.termin = '2026-12-01', 'kolega upravil text a termín';
  assert r.skupina = 'Ponuky' and cardinality(r.zdielane) = 1, 'skupinu a zdieľanie mení len autor';
  assert r.hotovo and r.hotovo_kto = '11111111-1111-1111-1111-111111111111', 'zapísané, kto odklikol';
end $$;
delete from poznamky where id = current_setting('typek.zid')::bigint;
commit;
do $$ begin
  assert exists (select 1 from poznamky where id = current_setting('typek.zid')::bigint), 'kolega nezmaže cudziu úlohu';
  assert (select count(*) from push_fronta where makler_id = '22222222-2222-2222-2222-222222222222' and titul like '✓ Hotovo%') = 1, 'autorke príde, že je hotovo';
end $$;

-- Peter (bez zdieľania) úlohu nevidí ani nezmení
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin assert (select count(*) from poznamky) = 0, 'Peter nevidí cudzie'; end $$;
update poznamky set text = 'x' where id = current_setting('typek.zid')::bigint;
commit;
do $$ begin assert (select text from poznamky where id = current_setting('typek.zid')::bigint) <> 'x', 'Peter nezmenil'; end $$;

-- autorka vráti úlohu medzi nespravené; administrátor sa z nej odoberie
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update poznamky set hotovo = false where id = current_setting('typek.zid')::bigint;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select todo_odobrat_sa(current_setting('typek.zid')::bigint);
do $$ begin assert (select count(*) from poznamky) = 0, 'po odobratí ju už nevidí'; end $$;
do $$ begin begin perform todo_odobrat_sa(current_setting('typek.zid')::bigint); assert false, 'druhýkrát'; exception when raise_exception then null; end; end $$;
commit;
do $$ declare r poznamky;
begin
  select * into r from poznamky where id = current_setting('typek.zid')::bigint;
  assert cardinality(r.zdielane) = 0 and not r.hotovo and r.hotovo_kto is null, 'stav po odobratí';
end $$;
\echo todo_zdielanie OK

-- Databázový test: ranný prehľad kancelárie – počty za včerajšok, len administrátor, vypínač v profile, text do mobilu.
\set ON_ERROR_STOP on
\set ADMIN '11111111-1111-1111-1111-111111111111'
\set JANA '22222222-2222-2222-2222-222222222222'
select kancelaria_id as k from makleri where id = :'ADMIN' \gset
select id as i1 from inzeraty order by id limit 1 \gset
select id as i2 from inzeraty order by id offset 1 limit 1 \gset
-- včera (slovenský čas): 2 hovory Jany, 1 získaný, 1 prevzatie; dnes 1 hovor (nepočíta sa)
insert into aktivity (inzerat_id, makler_id, typ, vysledok, vytvorene, kancelaria_id) values
  (:'i1', :'JANA', 'hovor', 'Volať neskôr', ((now() at time zone 'Europe/Bratislava')::date - 1 + time '10:00') at time zone 'Europe/Bratislava', :k),
  (:'i2', :'JANA', 'hovor', 'Získaný do ponuky', ((now() at time zone 'Europe/Bratislava')::date - 1 + time '15:00') at time zone 'Europe/Bratislava', :k),
  (:'i2', :'JANA', 'prevzatie', null, ((now() at time zone 'Europe/Bratislava')::date - 1 + time '09:00') at time zone 'Europe/Bratislava', :k),
  (:'i1', :'JANA', 'hovor', 'Nedvíha', now(), :k);
do $$
declare d jsonb := _ranny_prehlad_data((select kancelaria_id from makleri where id = '11111111-1111-1111-1111-111111111111'));
begin
  assert (d #>> '{vcera,hovory}')::int = 2, 'včera 2 hovory, je ' || (d #>> '{vcera,hovory}');
  assert (d #>> '{vcera,ziskane}')::int = 1, 'včera 1 získaný';
  assert (d #>> '{vcera,prevzate}')::int = 1, 'včera 1 prevzatie';
  assert d #> '{vcera,makleri}' -> 0 ->> 'id' = '22222222-2222-2222-2222-222222222222', 'Jana v tabuľke maklérov';
  assert _ranny_prehlad_text(d) like 'Včera: 2 hovory, 1 prevzatý inzerát, 🎉 1 získaný do ponuky%', 'text: ' || coalesce(_ranny_prehlad_text(d), 'null');
end $$;
-- maklér prehľad nedostane, administrátor áno
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin begin perform ranny_prehlad(); assert false, 'maklér dostal prehľad'; exception when insufficient_privilege then null; end; end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin assert (ranny_prehlad() #>> '{vcera,hovory}')::int = 2, 'admin vidí prehľad'; end $$;
select nastavit_ranny_prehlad(false);
commit;
do $$ begin assert not _chce_upozornenie((select upozornenia from makleri where id = '11111111-1111-1111-1111-111111111111'), 'rano'), 'vypnuté v profile'; end $$;
select 'ranny_prehlad OK';

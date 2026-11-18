-- Databázové testy: strážca prevádzky, zlacnenie, návrat predajcu, Ešte riešim. Spúšťa testy/spusti_testy.sh.
\set ON_ERROR_STOP on
insert into push_odbery (makler_id, endpoint, p256dh, auth) select id, 'https://test/' || id, 'p', 'a' from makleri;
insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(extensions.digest('test-kluc', 'sha256'), 'hex'))
  on conflict (kluc) do update set hodnota = excluded.hodnota;

do $$
declare n int;
begin
  -- strážca prevádzky: portál nevracia inzeráty → problém; „vrátil len“ nie je porucha; výpadok skenera stráži _skener_nebezi
  update stav_skenera set meta = jsonb_build_object('posledna_kontrola', now()::text,
    'chyby', jsonb_build_array('Nehnuteľnosti.sk: portál nevrátil žiadne inzeráty')) where id = 1;
  perform _prevadzka_kontrola();
  assert exists (select 1 from prevadzka_problemy where kluc = 'portal-nehnutelnosti'), 'portál bez inzerátov – chýba problém';
  update stav_skenera set meta = jsonb_build_object('posledna_kontrola', now()::text,
    'chyby', jsonb_build_array('TopReality.sk vrátil len 50 inzerátov (minule 90)')) where id = 1;
  perform _prevadzka_kontrola();
  assert not exists (select 1 from prevadzka_problemy), '„vrátil len“ nie je porucha';
  -- dlhý beh skenera: počas behu (do 60 min) žiadny poplach, potom áno
  update stav_skenera set meta = jsonb_build_object('posledna_kontrola', (now() - interval '45 minutes')::text,
    'beh_zacal', (now() - interval '20 minutes')::text) where id = 1;
  perform _skener_nebezi();
  assert not exists (select 1 from push_fronta where titul like '%Skener nebeží%'), 'poplach počas bežiacej kontroly';
  -- hlásenie z GitHubu
  perform prevadzka_hlasenie('test-kluc', 'zaloha', false, 'Záloha zlyhala.');
  assert exists (select 1 from prevadzka_problemy where kluc = 'zaloha'), 'hlásenie zálohy';
  perform prevadzka_hlasenie('test-kluc', 'zaloha', true, null);
  assert not exists (select 1 from prevadzka_problemy where kluc = 'zaloha'), 'záloha vyriešená';
  begin
    perform prevadzka_hlasenie('zly-kluc', 'zaloha', false, 'x');
    assert false, 'zlý kľúč prešiel';
  exception when insufficient_privilege then null;
  end;

  -- zlacnenie: Jana volala a1 (seed) → pripomienka „cena“
  update inzeraty set cena = cena - 10000 where id = 'bazos:a1';
  select count(*) into n from pripomienky where druh = 'cena' and inzerat_id = 'bazos:a1'
    and makler_id = '22222222-2222-2222-2222-222222222222';
  assert n = 1, 'zlacnenie: čakám 1 pripomienku, je ' || n;
  update inzeraty set cena = cena + 10000 where id = 'bazos:a1';   -- zdraženie nič nerobí
  select count(*) into n from pripomienky where druh = 'cena' and inzerat_id = 'bazos:a1';
  assert n = 1, 'zdraženie nemá vytvoriť pripomienku';
  update inzeraty set cena = cena - 5000 where id = 'reality:r1';  -- realitka: nič
  assert not exists (select 1 from pripomienky where druh = 'cena' and inzerat_id = 'reality:r1'), 'realitka nemá upozornenie na zlacnenie';

  -- návrat predajcu: a3 (nový, telefón 0905 111 222) a a1 (starý, Jana volala) → pripomienka „navrat“ pri a3
  update inzeraty set prvy_krat = now() - interval '2 hours' where id = 'nehnutelnosti:a3';
  perform _navrat_predajcov();
  assert exists (select 1 from pripomienky where druh = 'navrat' and inzerat_id = 'nehnutelnosti:a3'
                 and makler_id = '22222222-2222-2222-2222-222222222222' and poznamka like '%Nemá záujem%'), 'návrat predajcu';
  perform _navrat_predajcov();
  select count(*) into n from pripomienky where druh = 'navrat';
  assert n = 1, 'návrat sa nemá hlásiť dvakrát, je ' || n;
end $$;

-- Ešte riešim: najviac 2× za sebou bez zápisu
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select prevziat('bazos:c1');
select predlzit_prevzatie('bazos:c1', 'čakám na fotky');
select predlzit_prevzatie('bazos:c1', 'ozve sa v piatok');
do $$ begin
  perform predlzit_prevzatie('bazos:c1', 'tretí raz');
  assert false, 'tretie predĺženie za sebou prešlo';
exception when raise_exception then null;
end $$;
select zapisat_hovor('bazos:c1', 'Nedvíha', 'manžel 0911 222 333');
select predlzit_prevzatie('bazos:c1', 'po hovore znova môžem');
reset role;
select 'DB testy v poriadku';

-- Najprv volať: SMS bez hovoru nejde, po hovore áno; SMS nepredĺži prevzatie
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
select prevziat('bazos:c3');
do $$ begin
  perform oznacit_kontakt('bazos:c3', 'sms', true);
  assert false, 'SMS bez hovoru prešla';
exception when raise_exception then null;
end $$;
select zapisat_hovor('bazos:c3', 'Nedvíha', '');
reset role;
update prevzatia set upravene = now() - interval '5 hours' where inzerat_id = 'bazos:c3';
set role authenticated;
select oznacit_kontakt('bazos:c3', 'sms', true);
reset role;
do $$ begin
  assert (select upravene < now() - interval '4 hours' from prevzatia where inzerat_id = 'bazos:c3'), 'SMS predĺžila prevzatie';
  assert (select sms is not null from prevzatia where inzerat_id = 'bazos:c3'), 'SMS sa nezapísala';
end $$;
select 'SMS až po hovore – v poriadku';

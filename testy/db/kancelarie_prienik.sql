-- Databázové testy: oddelenie kancelárií a ochrana účtu hlavného správcu. Spúšťa testy/spusti_testy.sh.
-- Pokusy o prienik z pôvodného ručného scenára (supabase/test/scenar_kancelarie.sql, zmazaný 22. 11. 2026),
-- tu s assertmi: keď niektorý pokus prejde, test spadne.
-- Osoby: Martin (admin Alpha, hlavný správca), Jana a Peter (makléri Alpha) sú zo seed.sql;
--        A2 = druhý admin Alpha (nie hlavný správca), B = admin inej kancelárie.
\set ON_ERROR_STOP on
insert into kancelarie (nazov) values ('Iná kancelária');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'a2@test.sk'), ('bbbbbbbb-0000-0000-0000-0000000000b1', 'b@ina.sk');
insert into makleri (id, meno, email, rola, aktivny, kancelaria_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'Druhý Admin', 'a2@test.sk', 'admin', true, 1),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Konkurent', 'b@ina.sk', 'admin', true, (select id from kancelarie where nazov = 'Iná kancelária'));
update makleri set farby = '{"schema":"modra"}'::jsonb, sprievodca_videny = now()
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- pokus_prejde(sql): spustí príkaz ako prihlásený maklér; true = prešiel, false = databáza ho odmietla
create function pg_temp.pokus_prejde(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return true;
exception when others then
  return false;
end $$;

-- ---------------------------------------------------------------- Alpha si vytvorí údaje (Jana)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select ulozit_pripomienku(null, '22222222-2222-2222-2222-222222222222', 'bazos:c2', null, now() + interval '1 day', 'Zavolať predajcovi');
select poslat_spravu('Ahoj tím');
select prevziat('bazos:c2');
select ulozit_telefon('bazos:c2', '0900 111 222');
reset role;
do $$ begin
  assert (select count(*) from pripomienky where inzerat_id = 'bazos:c2' and zrusena is null) = 1, 'príprava: pripomienka Alpha';
  assert (select makler_id from prevzatia where inzerat_id = 'bazos:c2') = '22222222-2222-2222-2222-222222222222', 'príprava: prevzatie Alpha';
  assert (select telefon from telefony where inzerat_id = 'bazos:c2') = '0900 111 222', 'príprava: telefón Alpha';
end $$;
select set_config('test.pripomienka', id::text, false) from pripomienky where inzerat_id = 'bazos:c2';

-- ---------------------------------------------------------------- B (admin inej kancelárie) nevidí ani nezmení nič z Alpha
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-0000000000b1","role":"authenticated"}', false);
do $$ begin
  assert (select count(*) from makleri) = 1, 'B vidí cudzích maklérov';
  assert (select count(*) from pripomienky) = 0, 'B vidí pripomienky Alpha';
  assert (select count(*) from prevzatia) = 0, 'B vidí prevzatia Alpha';
  assert (select count(*) from telefony) = 0, 'B vidí telefóny Alpha';
  assert (select count(*) from spravy) = 0, 'B vidí správy Alpha';
  assert (select count(*) from aktivity) = 0, 'B vidí aktivity Alpha';
  assert not pg_temp.pokus_prejde($q$select upravit_maklera('22222222-2222-2222-2222-222222222222', 'Hacknutý', 'makler', false, false)$q$),
    'B upravil makléra Alpha';
  assert not pg_temp.pokus_prejde($q$select nastavit_pristup_maklera('22222222-2222-2222-2222-222222222222', array['inzeraty'])$q$),
    'B zmenil prístup makléra Alpha';
  assert not pg_temp.pokus_prejde($q$select zrusit_pripomienku(current_setting('test.pripomienka')::bigint)$q$), 'B zrušil pripomienku Alpha';
  assert not pg_temp.pokus_prejde($q$select ulozit_telefon('bazos:c2', '0999 999 999')$q$), 'B prepísal telefón predajcu Alpha';
  assert not pg_temp.pokus_prejde($q$select prepnut_kancelariu(1)$q$), 'B sa prepol do Alpha';
  -- tieto funkcie cudzie riadky ticho preskočia; že nič nezmenili, sa overuje nižšie
  perform pg_temp.pokus_prejde($q$select uvolnit('bazos:c2')$q$);
  perform pg_temp.pokus_prejde($q$select obnovit_sprievodcu('22222222-2222-2222-2222-222222222222')$q$);
  perform pg_temp.pokus_prejde($q$select nastavit_farby_timu('modra', null, true, null)$q$);
end $$;
reset role;
do $$ begin
  assert (select meno = 'Jana Nováková' and aktivny and rola = 'makler' and cardinality(pristup) > 1
            and farby is not null and sprievodca_videny is not null
          from makleri where id = '22222222-2222-2222-2222-222222222222'), 'pokusy B zmenili makléra Alpha';
  assert (select count(*) from pripomienky where inzerat_id = 'bazos:c2' and zrusena is null) = 1, 'B zrušil pripomienku Alpha';
  assert (select makler_id from prevzatia where inzerat_id = 'bazos:c2') = '22222222-2222-2222-2222-222222222222', 'B uvoľnil inzerát Alpha';
  assert (select telefon from telefony where inzerat_id = 'bazos:c2') = '0900 111 222', 'B prepísal telefón Alpha';
  assert not exists (select 1 from spravca_podpora where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b1'), 'B je v režime podpory';
end $$;

-- ---------------------------------------------------------------- A2 (druhý admin Alpha) nezmení účet hlavného správcu
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}', false);
do $$ begin
  assert not pg_temp.pokus_prejde($q$select upravit_maklera('11111111-1111-1111-1111-111111111111', 'Martin Testovací', 'makler', true, true)$q$),
    'admin Alpha zobral hlavnému správcovi rolu';
  assert not pg_temp.pokus_prejde($q$select upravit_maklera('11111111-1111-1111-1111-111111111111', 'Martin Testovací', 'admin', false, true)$q$),
    'admin Alpha deaktivoval hlavného správcu';
  assert not pg_temp.pokus_prejde($q$select nastavit_pristup_maklera('11111111-1111-1111-1111-111111111111', array['inzeraty'])$q$),
    'admin Alpha zmenil prístup hlavného správcu';
  assert not pg_temp.pokus_prejde($q$select prepnut_kancelariu(2)$q$), 'admin Alpha sa prepol do inej kancelárie';
  -- bežná práca admina kancelárie ostáva: kolegov upravuje a hromadné úpravy tímu nepadnú ani pri účte hlavného správcu
  assert pg_temp.pokus_prejde($q$select upravit_maklera('33333333-3333-3333-3333-333333333333', 'Peter Kováč', 'makler', true, true)$q$),
    'admin Alpha nevie upraviť kolegu';
  assert pg_temp.pokus_prejde($q$select obnovit_sprievodcu(null)$q$), 'sprievodca pre celý tím padol';
  assert pg_temp.pokus_prejde($q$select nastavit_farby_timu('modra', null, true, null)$q$), 'farby tímu s prepísaním padli';
end $$;
reset role;
do $$ begin
  assert (select rola = 'admin' and aktivny and cardinality(pristup) > 1 from makleri where id = '11111111-1111-1111-1111-111111111111'),
    'účet hlavného správcu sa zmenil';
  assert (select vidi_podhodnotene from makleri where id = '33333333-3333-3333-3333-333333333333'), 'úprava kolegu sa neuložila';
  assert (select sprievodca_videny is null and farby is null from makleri where id = '22222222-2222-2222-2222-222222222222'),
    'hromadná úprava tímu sa neuložila';
end $$;

-- ---------------------------------------------------------------- hlavný správca: svoj účet aj iných admina spravuje ďalej
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
do $$ begin
  assert pg_temp.pokus_prejde($q$select upravit_maklera('aaaaaaaa-0000-0000-0000-0000000000a2', 'Druhý Admin', 'makler', true, false)$q$),
    'hlavný správca nevie upraviť admina Alpha';
  assert pg_temp.pokus_prejde($q$select upravit_maklera('11111111-1111-1111-1111-111111111111', 'Martin Testovací', 'admin', true, true)$q$),
    'hlavný správca nevie upraviť sám seba';
  assert pg_temp.pokus_prejde($q$select prepnut_kancelariu(2)$q$), 'hlavný správca sa nevie prepnúť do inej kancelárie';
  assert (select count(*) from makleri where id <> auth.uid()) = 1 and exists (select 1 from makleri where meno = 'Konkurent'),
    'hlavný správca v podpore nevidí práve maklérov zvolenej kancelárie';
  -- v režime podpory musí ďalej prejsť zápis pre seba (čas v aplikácii, prítomnosť)
  assert pg_temp.pokus_prejde($q$select pripocitaj_cas('{"inzeraty": 30}'::jsonb)$q$), 'zápis času v režime podpory padol';
  assert pg_temp.pokus_prejde($q$select som_tu()$q$), 'som_tu v režime podpory padlo';
  assert pg_temp.pokus_prejde($q$select prepnut_kancelariu(null)$q$), 'hlavný správca sa nevie vrátiť';
  assert (select count(*) from makleri) = 4, 'hlavný správca doma nevidí maklérov Alpha';
end $$;
reset role;
do $$ begin
  assert (select rola from makleri where id = 'aaaaaaaa-0000-0000-0000-0000000000a2') = 'makler', 'úprava admina Alpha sa neuložila';
end $$;
select 'Oddelenie kancelárií a ochrana hlavného správcu – v poriadku';

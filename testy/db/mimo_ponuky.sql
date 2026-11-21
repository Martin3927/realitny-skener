-- Databázový test: stav nehnuteľnosti v dopyte a rubrika Mimo ponuky (párovanie, súkromie kontaktu, zvonček).
-- Spúšťa testy/spusti_testy.sh. Admin 1111…, Jana 2222…, Peter 3333… (seed).
\set ON_ERROR_STOP on
\set JANA '22222222-2222-2222-2222-222222222222'
\set PETER '33333333-3333-3333-3333-333333333333'

insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, stav_objektu) values
  (:'JANA', 'Byt pôvodný', 'aktivne', 'predaj', 'byty', '3-izbový byt', 110000, 'Smižany', 'Spišská Nová Ves', 3, 70, 'pôvodný stav'),
  (:'JANA', 'Byt nový', 'aktivne', 'predaj', 'byty', '3-izbový byt', 125000, 'Smižany', 'Spišská Nová Ves', 3, 72, 'novostavba'),
  (:'JANA', 'Byt bez stavu', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Smižany', 'Spišská Nová Ves', 3, 71, null);

-- ---------- Peter zapíše klienta, ktorý chce novostavbu alebo kompletnú rekonštrukciu
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select ulozit_dopyt('{"transakcia":"predaj","kategorie":["byty"],"obce":["Smižany"],"cena_do":130000,"stavy":["Novostavba","kompletná rekonštrukcia"]}',
                    '{"meno":"Karol Kupec","telefon":"0905 123 456"}') as dopyt \gset
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare d dopyty; v text;
begin
  select * into d from dopyty order by id desc limit 1;
  assert d.stavy = array['novostavba', 'kompletná rekonštrukcia'], 'stavy sa uložia malými písmenami: ' || d.stavy::text;
  select string_agg(n.nazov, ', ' order by n.nazov) into v from nehnutelnosti n where _sedi_ponuka(d, n);
  assert v = 'Byt bez stavu, Byt nový', 'sedí novostavba a ponuka bez vyplneného stavu, pôvodný stav nie: ' || coalesce(v, '-');
end $$;

-- staršie okno aplikácie stav neposiela – uložený stav ostane
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select ulozit_dopyt(jsonb_build_object('id', :dopyt, 'transakcia', 'predaj', 'kategorie', '["byty"]'::jsonb, 'obce', '["Smižany"]'::jsonb, 'cena_do', 130000), null) \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$ begin
  assert (select cardinality(stavy) from dopyty order by id desc limit 1) = 2, 'stav ostal aj bez poľa stavy';
  assert (select telefon from dopyty_kontakty order by dopyt_id desc limit 1) = '0905 123 456', 'kontakt ostal';
end $$;

-- ---------- Jana zapíše nehnuteľnosť mimo ponuky, ktorá Petrovmu klientovi sedí
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform ulozit_mimo('{"obec":"Smižany"}', null);
    assert false, 'bez druhu nehnuteľnosti sa nemá uložiť';
  exception when raise_exception then null;
  end;
  begin
    perform ulozit_mimo('{"kategoria":"byty","makler_id":"33333333-3333-3333-3333-333333333333"}', null);
    assert false, 'maklér zapísal nehnuteľnosť kolegovi';
  exception when insufficient_privilege then null;
  end;
end $$;
select ulozit_mimo('{"kategoria":"byty","typ":"3-izbový byt","obec":"Smižany","okres":"Spišská Nová Ves","cena":"128000","plocha":"74","izby":"3","stav_objektu":"Novostavba","popis":"Majiteľ zvažuje predaj na jar."}',
                   '{"meno":"Ján Tichý","telefon":"0911 222 333","adresa":"Tatranská 5","poznamka":"Volať po 17:00"}') as mimo \gset
select ulozit_mimo('{"kategoria":"byty","typ":"3-izbový byt","obec":"Smižany","okres":"Spišská Nová Ves","cena":"100000","stav_objektu":"pôvodný stav"}', '{"meno":"Iný Majiteľ"}') as mimo2 \gset
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare n int; t text;
begin
  select count(*), max(poznamka) into n, t from pripomienky where makler_id = '33333333-3333-3333-3333-333333333333' and druh = 'zhoda' and poznamka like '%mimo ponuky%';
  assert n = 1, 'Peter dostal práve jedno upozornenie (pôvodný stav nesedí), je ' || n;
  assert t like '%Karol Kupec%' and t like '%3-izbový byt, Smižany%' and t like '%zapísal Jana%', 'text upozornenia: ' || t;
  assert t not like '%Ján Tichý%' and t not like '%0911%', 'kontakt na majiteľa v upozornení nie je';
  assert (select stav_objektu from mimo_ponuky order by id limit 1) = 'novostavba', 'stav malými písmenami';
end $$;

-- úprava ceny znova nezvoní; Peter kontakt na majiteľa nevidí, parametre áno; upraviť nesmie
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
select ulozit_mimo(jsonb_build_object('id', :mimo, 'kategoria', 'byty', 'typ', '3-izbový byt', 'obec', 'Smižany', 'okres', 'Spišská Nová Ves', 'cena', '127000', 'izby', '3', 'stav_objektu', 'novostavba'), null) \gset x_
select count(*) as jana_kontakty from mimo_ponuky_kontakty \gset
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select count(*) as peter_mimo from mimo_ponuky \gset
select count(*) as peter_kontakty from mimo_ponuky_kontakty \gset
do $$
begin
  begin
    perform zmenit_stav_mimo((select min(id) from mimo_ponuky), 'archiv');
    assert false, 'cudzí maklér archivoval nehnuteľnosť';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
select set_config('request.jwt.claims', '', false) \gset x_
select :jana_kontakty = 2 and :peter_mimo = 2 and :peter_kontakty = 0 as ok \gset
\if :ok
\else
  do $$ begin raise exception 'parametre vidia všetci v kancelárii, kontakt len maklér nehnuteľnosti a admin'; end $$;
\endif
do $$ begin
  assert (select count(*) from pripomienky where druh = 'zhoda' and poznamka like '%mimo ponuky%') = 1, 'úprava nezvoní druhýkrát';
  assert (select telefon from mimo_ponuky_kontakty order by mimo_id limit 1) = '0911 222 333', 'kontakt ostal po úprave bez kontaktu';
end $$;

-- ---------- opačný smer: Peter zapíše klienta na pôvodný stav → zvoní Jane (bez mena klienta)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select ulozit_dopyt('{"transakcia":"predaj","kategorie":["byty"],"obce":["Smižany"],"cena_do":105000,"stavy":["pôvodný stav"]}', '{"meno":"Tajný Klient"}') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare n int; t text;
begin
  select count(*), max(poznamka) into n, t from pripomienky where makler_id = '22222222-2222-2222-2222-222222222222' and druh = 'zhoda' and poznamka like '%Kupujúci na vašu nehnuteľnosť mimo ponuky%';
  assert n = 1, 'Jana dostala upozornenie o kupujúcom, je ' || n;
  assert t like '%klienta má Peter%' and t not like '%Tajný%', 'bez mena klienta: ' || t;
end $$;

-- archív nepáruje; zmazanie zmaže aj kontakt; klientska zóna mimo ponuky nikdy neukáže
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
select zmenit_stav_mimo(:mimo, 'archiv') \gset x_
select zmenit_stav_mimo(:mimo2, 'zmazat') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare d dopyty;
begin
  select * into d from dopyty where cardinality(stavy) = 2;
  assert not exists (select 1 from mimo_ponuky m where _sedi_mimo(d, m)), 'archivovaná nehnuteľnosť nepáruje';
  assert (select count(*) from mimo_ponuky) = 1 and (select count(*) from mimo_ponuky_kontakty) = 1, 'zmazanie zmaže aj kontakt';
end $$;

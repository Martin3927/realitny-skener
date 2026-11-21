-- Databázový test: odovzdávací protokol – založenie s predvyplnením, uloženie, podpis a uzavretie, práva, verejná stránka, fotky.
\set ON_ERROR_STOP on
\set JANA '22222222-2222-2222-2222-222222222222'
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, ulica, historia_cien)
values (:'JANA', 'Byt Protokol', 'predane', 'predaj', 'byty', '2-izbový byt', 99000, 'Levoča', 'Levoča', 'Nová', '[]');
select id as byt from nehnutelnosti where nazov = 'Byt Protokol' \gset
insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_telefon, ulica_interna) values (:byt, 'Ján Majiteľ', '0905 111 222', 'Nová 12, Levoča');
select set_config('typek.byt', :'byt', false);

-- Jana (maklérka ponuky) založí protokol – predvyplnené miesto, majiteľ a druh
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ declare r jsonb := protokol_novy(current_setting('typek.byt')::bigint);
begin
  assert r ->> 'druh' = 'predaj', 'druh z ponuky';
  assert r ->> 'miesto' = 'Nová 12, Levoča', 'miesto z presnej adresy';
  assert r ->> 'odovzdavajuci' = 'Ján Majiteľ' and r ->> 'odovzdavajuci_kontakt' = '0905 111 222', 'majiteľ predvyplnený';
  assert r ->> 'podpisane' is null, 'rozpracovaný';
  perform set_config('typek.pid', r ->> 'id', false);
  perform set_config('typek.tok', r ->> 'token', false);
  perform set_config('typek.kanc', r ->> 'kancelaria_id', false);
end $$;
commit;

-- Peter (iný maklér) protokol nevidí ani nezmení
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin assert (select count(*) from odovzdavacie_protokoly) = 0, 'Peter vidí cudzí protokol'; end $$;
do $$ begin begin perform protokol_ulozit(current_setting('typek.pid')::bigint, '{"miesto":"x"}'); assert false, 'Peter zmenil protokol'; exception when raise_exception then null; end; end $$;
do $$ begin begin perform protokol_novy(current_setting('typek.byt')::bigint); assert false, 'Peter založil protokol k cudzej ponuke'; exception when insufficient_privilege then null; end; end $$;
commit;

-- Jana uloží merače (prázdny riadok a cudzia fotka sa zahodia), kľúče a jeden podpis
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ declare r jsonb; c text := current_setting('typek.kanc') || '/' || current_setting('typek.tok') || '/elektrina.jpg';
begin
  r := protokol_ulozit(current_setting('typek.pid')::bigint, jsonb_build_object(
    'preberajuci', 'Karol Kupec', 'preberajuci_kontakt', 'karol@example.sk',
    'meradla', jsonb_build_array(
      jsonb_build_object('druh', 'Elektrina', 'cislo', '123456', 'stav', '4521,3', 'jednotka', 'kWh', 'foto', c),
      jsonb_build_object('druh', 'Plyn', 'cislo', '', 'stav', ''),
      jsonb_build_object('druh', 'Studená voda', 'stav', '88', 'foto', '9/inykluc/zla.jpg')),
    'kluce', jsonb_build_array(jsonb_build_object('co', 'Vchodové dvere', 'pocet', 3), jsonb_build_object('co', ' ', 'pocet', 1), jsonb_build_object('co', 'Schránka', 'pocet', 'x')),
    'stav', 'Bez závad.', 'podpis_odovzdavajuci', 'data:image/png;base64,iVBORw0KGgo='));
  assert jsonb_array_length(r -> 'meradla') = 2, 'prázdny merač sa zahodil';
  assert r -> 'meradla' -> 0 ->> 'foto' = c, 'vlastná fotka ostala';
  assert r -> 'meradla' -> 1 ->> 'foto' is null, 'cudzia fotka sa zahodila';
  assert jsonb_array_length(r -> 'kluce') = 2 and (r -> 'kluce' -> 1 ->> 'pocet')::int = 1, 'kľúče očistené';
  assert r ->> 'odovzdavajuci' = 'Ján Majiteľ', 'nezmenené pole ostalo';
  -- uzavretie bez druhého podpisu neprejde
  begin perform protokol_ulozit(current_setting('typek.pid')::bigint, '{"uzavriet":true}'); assert false, 'uzavreté bez podpisu'; exception when raise_exception then null; end;
  begin perform protokol_ulozit(current_setting('typek.pid')::bigint, '{"podpis_preberajuci":"<script>"}'); assert false, 'zlý podpis prešiel'; exception when raise_exception then null; end;
  r := protokol_ulozit(current_setting('typek.pid')::bigint, '{"podpis_preberajuci":"data:image/png;base64,iVBORw0KGgo=","uzavriet":true}');
  assert r ->> 'podpisane' is not null, 'uzavreté';
  -- po podpise sa nedá meniť ani zmazať maklérom
  begin perform protokol_ulozit(current_setting('typek.pid')::bigint, '{"stav":"iné"}'); assert false, 'zmena po podpise'; exception when raise_exception then null; end;
  begin perform protokol_zmazat(current_setting('typek.pid')::bigint); assert false, 'maklér zmazal podpísaný'; exception when insufficient_privilege then null; end;
  -- fotky: po podpise už maklér nenahrá, čítať sa dá
  assert not _protokol_subor(c, true), 'nahrávanie po podpise';
  assert _protokol_subor(c, false), 'čítanie fotky';
end $$;
commit;

-- verejná stránka: bez kontaktov, s podpismi; cudzí kľúč nič
begin;
set local role anon;
do $$ declare v jsonb := protokol_verejny(current_setting('typek.tok'));
begin
  assert v ->> 'preberajuci' = 'Karol Kupec' and v -> 'ponuka' ->> 'nazov' = 'Byt Protokol', 'verejné údaje';
  assert v ->> 'podpis_preberajuci' like 'data:image/png%', 'podpis na stránke';
  assert v::text not like '%0905%' and v::text not like '%karol@%', 'bez kontaktov strán';
  assert protokol_verejny(repeat('a', 36)) is null, 'cudzí kľúč';
  assert _protokol_subor(current_setting('typek.kanc') || '/' || current_setting('typek.tok') || '/x.jpg', false), 'anon číta fotku s kľúčom';
  assert not _protokol_subor(current_setting('typek.kanc') || '/' || current_setting('typek.tok') || '/x.jpg', true), 'anon nenahrá';
  assert not _protokol_subor('1/' || repeat('b', 36) || '/x.jpg', false), 'cudzí priečinok';
end $$;
do $$ begin begin perform protokol_novy(current_setting('typek.byt')::bigint); assert false, 'anon založil'; exception when insufficient_privilege then null; end; end $$;
commit;

-- administrátor podpísaný protokol zmaže
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin assert (select count(*) from odovzdavacie_protokoly) = 1, 'administrátor vidí protokol'; end $$;
select protokol_zmazat(current_setting('typek.pid')::bigint);
commit;
do $$ begin assert (select count(*) from odovzdavacie_protokoly) = 0, 'zmazaný'; end $$;
\echo odovzdavaci_protokol OK

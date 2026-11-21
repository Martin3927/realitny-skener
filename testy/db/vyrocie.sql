-- Databázový test: výročie obchodu – dátum predaja, vypínač kancelárie, pripomienka raz za rok.
\set ON_ERROR_STOP on
\set JANA '22222222-2222-2222-2222-222222222222'
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien)
values (:'JANA', 'Byt Tarča', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Spišská Nová Ves', 'Spišská Nová Ves', '[]');
select id as byt, kancelaria_id as k from nehnutelnosti where nazov = 'Byt Tarča' \gset
insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno) values (:byt, 'Ján Novák');
update nehnutelnosti set stav = 'predane' where id = :byt;
do $$ begin assert (select predane_kedy > now() - interval '1 minute' from nehnutelnosti where nazov = 'Byt Tarča'), 'predaj zapísal dátum'; end $$;
-- predané presne pred rokom
update nehnutelnosti set predane_kedy = (((now() at time zone 'Europe/Bratislava')::date - interval '1 year')::timestamp + time '11:00') at time zone 'Europe/Bratislava' where id = :byt;
do $$ begin assert _vyrocia_obchodov(true) = 0, 'vypnuté – nič'; end $$;
insert into nastavenia_kancelarie (kancelaria_id, kluc, hodnota) values (:k, 'vyrocia', '1');
do $$ begin assert _vyrocia_obchodov(true) = 1, 'zapnuté – jedna pripomienka'; end $$;
do $$ begin assert _vyrocia_obchodov(true) = 0, 'v ten istý deň len raz'; end $$;
do $$
declare p pripomienky;
begin
  select * into p from pripomienky where poznamka like '🎂%' order by id desc limit 1;
  assert p.makler_id = '22222222-2222-2222-2222-222222222222', 'pripomienka maklérovi ponuky';
  assert p.poznamka like '%pred rokom%Byt Tarča%Ján Novák%', 'text: ' || p.poznamka;
  assert to_char(p.cas at time zone 'Europe/Bratislava', 'HH24:MI') = '09:00', 'o 9:00';
end $$;
-- späť z predaných → dátum zmizne
update nehnutelnosti set stav = 'aktivne' where id = :byt;
do $$ begin assert (select predane_kedy is null from nehnutelnosti where nazov = 'Byt Tarča'), 'nie je predaná – bez dátumu'; end $$;
-- vypínač: maklér nesmie, administrátor áno
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin assert vyrocia_zapnute(), 'maklér vidí, že je zapnuté'; begin perform nastavit_vyrocia(false); assert false, 'maklér prepol'; exception when insufficient_privilege then null; end; end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select nastavit_vyrocia(false);
do $$ begin assert not vyrocia_zapnute(), 'administrátor vypol'; end $$;
commit;
select 'vyrocie OK';

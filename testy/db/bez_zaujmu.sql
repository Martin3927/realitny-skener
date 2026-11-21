-- Databázový test: ponuka bez záujmu – 45 dní bez obhliadky → pripomienka maklérovi, raz za 30 dní; s nedávnou obhliadkou nie.
\set ON_ERROR_STOP on
\set JANA '22222222-2222-2222-2222-222222222222'
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien) values
  (:'JANA', 'Byt bez záujmu', 'aktivne', 'predaj', 'byty', '3-izbový byt', 150000, 'Spišská Nová Ves', 'Spišská Nová Ves', '[]'),
  (:'JANA', 'Byt s obhliadkou', 'aktivne', 'predaj', 'byty', '2-izbový byt', 99000, 'Spišská Nová Ves', 'Spišská Nová Ves', '[]'),
  (:'JANA', 'Byt nový', 'aktivne', 'predaj', 'byty', '1-izbový byt', 70000, 'Spišská Nová Ves', 'Spišská Nová Ves', '[]');
update nehnutelnosti set vytvorene = now() - interval '60 days' where nazov in ('Byt bez záujmu', 'Byt s obhliadkou');
insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno) select id, :'JANA', now() - interval '10 days', 'Eva' from nehnutelnosti where nazov = 'Byt s obhliadkou';
do $$ begin assert _ponuky_bez_zaujmu(true) = 1, 'jedna ponuka bez záujmu'; end $$;
do $$ begin assert (select count(*) from pripomienky where poznamka like '📉 Ponuka bez záujmu: Byt bez záujmu – 60 dní%') = 1, 'pripomienka s počtom dní'; end $$;
do $$ begin assert _ponuky_bez_zaujmu(true) = 0, 'znova až o 30 dní'; end $$;
select 'bez_zaujmu OK';

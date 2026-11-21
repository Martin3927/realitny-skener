-- Databázový test: hodnotenie obhliadky od kupujúceho – odkaz, verejné vyplnenie raz, zvonček, report majiteľa až po schválení.
\set ON_ERROR_STOP on
\set JANA '22222222-2222-2222-2222-222222222222'
insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien)
values (:'JANA', 'Byt Smižany', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Smižany', 'Spišská Nová Ves', '[]');
select id as byt from nehnutelnosti where nazov = 'Byt Smižany' \gset
insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, report_token) values (:byt, 'Ján Majiteľ', 'reporttokenreporttoken0001');
insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno, klient_telefon) values (:byt, :'JANA', now() - interval '1 day', 'Karol Kupec', '0905 123 456');
select id as obh from obhliadky order by id desc limit 1 \gset
-- Jana si vypýta odkaz (dvakrát ten istý)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select hodnotenie_obhliadky_odkaz(:obh) as tok \gset
commit;
do $$ begin assert (select count(*) from obhliadky_hodnotenia) = 1, 'jedno hodnotenie'; end $$;
-- verejná stránka
select token as tok from obhliadky_hodnotenia limit 1 \gset
select set_config('typek.tok', :'tok', false);
begin;
set local role anon;
do $$ declare i jsonb := hodnotenie_obhliadky_info(current_setting('typek.tok'));
begin assert i ->> 'nazov' = 'Byt Smižany' and not (i ->> 'vyplnene')::boolean, 'info pre kupujúceho'; assert i::text not like '%Kupec%' and i::text not like '%0905%', 'bez mien a telefónov'; end $$;
select hodnotenie_obhliadky_ulozit(:'tok', 4, 'Pekný výhľad', 'Malá kuchyňa');
do $$ begin begin perform hodnotenie_obhliadky_ulozit(current_setting('typek.tok'), 5, 'x', 'y'); assert false, 'druhý raz prešlo'; exception when raise_exception then null; end; end $$;
do $$ begin begin perform hodnotenie_obhliadky_ulozit(repeat('a', 36), 5, 'x', 'y'); assert false, 'cudzí token prešiel'; exception when raise_exception then null; end; end $$;
commit;
do $$ begin assert (select count(*) from pripomienky where poznamka like '⭐ Kupujúci ohodnotil obhliadku (4/5)%') = 2, 'zvonček Jane a administrátorovi'; end $$;
-- report majiteľa: pred schválením bez hodnotenia
do $$ begin assert report_majitela('reporttokenreporttoken0001') -> 'obhliadky' -> 0 -> 'hodnotenie' = 'null'::jsonb, 'pred schválením nie je v reporte'; end $$;
-- maklér neschváli, administrátor áno
select id as hid from obhliadky_hodnotenia limit 1 \gset
select set_config('typek.hid', :'hid', false);
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin begin perform hodnotenie_obhliadky_schvalit(current_setting('typek.hid')::bigint, true); assert false, 'maklér schválil'; exception when insufficient_privilege then null; end; end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select hodnotenie_obhliadky_schvalit(:hid, true);
commit;
do $$ declare h jsonb := report_majitela('reporttokenreporttoken0001') -> 'obhliadky' -> 0 -> 'hodnotenie';
begin assert (h ->> 'hviezdy')::int = 4 and h ->> 'nepacilo' = 'Malá kuchyňa', 'po schválení v reporte: ' || coalesce(h::text, 'null'); end $$;
-- výnimka pri ponuke: spätná väzba vypnutá → hodnotenie v reporte nie je
update nehnutelnosti_interne set zona = '{"spatna_vazba": false}' where nehnutelnost_id = :byt;
do $$ begin assert coalesce(report_majitela('reporttokenreporttoken0001') -> 'obhliadky' -> 0 -> 'hodnotenie', 'null'::jsonb) = 'null'::jsonb, 'bez spätnej väzby nie je'; end $$;
select 'hodnotenie_obhliadky OK';

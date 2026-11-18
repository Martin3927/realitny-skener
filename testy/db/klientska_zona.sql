-- Databázový test: klientska zóna – prepínače kancelárie, výnimky pri ponuke, report majiteľa, zóna kupujúceho.
-- Spúšťa testy/spusti_testy.sh. Admin 1111…, Jana 2222…, Peter 3333… (seed).
\set ON_ERROR_STOP on
\set ADMIN '11111111-1111-1111-1111-111111111111'
\set JANA '22222222-2222-2222-2222-222222222222'
\set PETER '33333333-3333-3333-3333-333333333333'

insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, historia_cien)
values (:'JANA', 'Byt Smižany', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Smižany', 'Spišská Nová Ves', 3, 70,
        '[["2026-10-01", 125000], ["2026-11-01", 120000]]'),
       (:'PETER', 'Dom Levoča', 'aktivne', 'predaj', 'domy', 'Rodinný dom', 210000, 'Levoča', 'Levoča', 5, 140, '[]'),
       (:'PETER', 'Byt koncept', 'koncept', 'predaj', 'byty', '3-izbový byt', 110000, 'Smižany', 'Spišská Nová Ves', 3, 68, '[]');
select id as byt from nehnutelnosti where nazov = 'Byt Smižany' \gset
select id as dom from nehnutelnosti where nazov = 'Dom Levoča' \gset
select id as koncept from nehnutelnosti where nazov = 'Byt koncept' \gset
insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_email, report_token, report_tyzdenne)
values (:byt, 'Ján Majiteľ', 'majitel@test.sk', 'reporttokenreporttoken0001', true);
insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno, vysledok, spatna_vazba) values
  (:byt, :'JANA', now() - interval '2 days', 'Karol Kupec', 'zvazuje', 'Páči sa, ale cena je vysoká.'),
  (:byt, :'JANA', now() + interval '2 days', 'Eva Nová', 'naplanovana', null);
insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do) values (:'PETER', 'predaj', '{byty}', '{Smižany}', 130000);
select id as dopyt from dopyty order by id desc limit 1 \gset
insert into dopyty_kontakty (dopyt_id, meno, telefon) values (:dopyt, 'Karol Kupec', '0905 123 456');

-- ---------- predvolené: všetko ako doteraz
do $$
declare r jsonb;
begin
  r := report_majitela('reporttokenreporttoken0001');
  assert r ->> 'vypnute' is null, 'predvolene je zóna zapnutá';
  assert jsonb_array_length(r -> 'obhliadky') = 2, 'obe obhliadky';
  assert r -> 'obhliadky' -> 1 ->> 'spatna_vazba' like 'Páči sa%', 'spätná väzba je vidieť';
  assert (r ->> 'zaujemcovia')::int = 1, 'jeden kupujúci hľadá';
  assert jsonb_array_length(r -> 'historia_cien') = 2, 'vývoj ceny';
  assert (r -> 'zona' ->> 'spatna_vazba')::boolean, 'prepínače v reporte';
  assert jsonb_array_length(_reporty_na_odoslanie()) = 1, 'týždenný e-mail ide';
end $$;

-- ---------- maklér nesmie meniť nastavenie kancelárie; admin áno
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform ulozit_klientsku_zonu('{"predavajuci":{"spatna_vazba":false}}');
    assert false, 'maklér zmenil nastavenie kancelárie';
  exception when insufficient_privilege then null;
  end;
  assert (klientska_zona() -> 'predavajuci' ->> 'spatna_vazba')::boolean, 'maklér nastavenie vidí';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
do $$
declare z jsonb;
begin
  z := ulozit_klientsku_zonu('{"predavajuci":{"spatna_vazba":false,"terminy":false,"kupujuci":false,"hocico":true,"cena":"nie"}}');
  assert not (z -> 'predavajuci' ->> 'spatna_vazba')::boolean, 'spätná väzba vypnutá';
  assert (z -> 'predavajuci' ->> 'cena')::boolean, 'nezmysel sa neuložil';
  assert not (z -> 'predavajuci' ? 'hocico'), 'neznámy prepínač sa neuložil';
  assert (z -> 'kupujuci' ->> 'zapnute')::boolean, 'kupujúci ostal';
end $$;
commit;
select set_config('request.jwt.claims', '', false) \gset x_

do $$
declare r jsonb;
begin
  r := report_majitela('reporttokenreporttoken0001');
  assert jsonb_array_length(r -> 'obhliadky') = 1, 'naplánovaná obhliadka sa skryla';
  assert r -> 'obhliadky' -> 0 ->> 'spatna_vazba' is null and r -> 'obhliadky' -> 0 ->> 'vysledok' is null, 'spätná väzba je skrytá';
  assert r ->> 'zaujemcovia' is null, 'počet kupujúcich je skrytý';
  assert (r ->> 'zobrazenia')::int = 0, 'zobrazenia ostali';
end $$;

-- ---------- výnimka pri ponuke: Jana (zodpovedná) zapne spätnú väzbu svojmu majiteľovi, Peter nesmie
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform ulozit_zonu_ponuky((select id from nehnutelnosti where nazov = 'Byt Smižany'), '{"spatna_vazba":true}');
    assert false, 'cudzí maklér zmenil zónu ponuky';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
do $$
declare z jsonb; v_id bigint := (select id from nehnutelnosti where nazov = 'Byt Smižany');
begin
  z := ulozit_zonu_ponuky(v_id, '{"spatna_vazba":true,"terminy":false,"zobrazenia":false}');
  assert (z ->> 'spatna_vazba')::boolean and not (z ->> 'zobrazenia')::boolean, 'výnimka platí';
  assert (select zona from nehnutelnosti_interne where nehnutelnost_id = v_id) = '{"spatna_vazba":true,"zobrazenia":false}'::jsonb,
         'uložia sa len rozdiely oproti kancelárii: ' || (select zona::text from nehnutelnosti_interne where nehnutelnost_id = v_id);
end $$;
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare r jsonb;
begin
  r := report_majitela('reporttokenreporttoken0001');
  assert r -> 'obhliadky' -> 0 ->> 'spatna_vazba' like 'Páči sa%', 'spätná väzba pri tejto ponuke je vidieť';
  assert r ->> 'zobrazenia' is null, 'zobrazenia pri tejto ponuke skryté';
end $$;

-- admin zakáže maklérom výnimky a vypne celú zónu predávajúceho
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
select ulozit_klientsku_zonu('{"predavajuci":{"makler_meni":false}}') \gset x_
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform ulozit_zonu_ponuky((select id from nehnutelnosti where nazov = 'Byt Smižany'), null);
    assert false, 'maklér zmenil zónu, hoci to kancelária zakázala';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
select ulozit_klientsku_zonu('{"predavajuci":{"zapnute":false}}') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
do $$
declare r jsonb;
begin
  r := report_majitela('reporttokenreporttoken0001');
  assert (r ->> 'vypnute')::boolean, 'vypnutá zóna nič neukáže';
  assert not (r ? 'obhliadky') and not (r ? 'majitel'), 'pri vypnutej zóne nejdú von žiadne údaje';
  assert jsonb_array_length(_reporty_na_odoslanie()) = 0, 'týždenný e-mail pri vypnutej zóne nejde';
end $$;

-- ---------- zóna kupujúceho
-- cudzí maklér odkaz nevytvorí; Peter (maklér klienta) áno
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform zona_kupujuceho_odkaz((select max(id) from dopyty));
    assert false, 'cudzí maklér vytvoril odkaz';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select zona_kupujuceho_odkaz(:dopyt) as tok \gset
select zona_kupujuceho_odkaz(:dopyt) as tok2 \gset
commit;
select set_config('request.jwt.claims', '', false) \gset x_
select :'tok' = :'tok2' and length(:'tok') = 36 as ok \gset
\if :ok
\else
  do $$ begin raise exception 'odkaz sa má vytvoriť raz a ostať rovnaký'; end $$;
\endif
select set_config('test.tok', :'tok', false) \gset x_

-- klient (anon) – predvolene vidí len to, čo maklér poslal
set role anon;
do $$
declare r jsonb; t text := current_setting('test.tok');
begin
  assert zona_kupujuceho('kratke') is null and zona_kupujuceho('neexistujucineexistujuci00') is null, 'zlý odkaz';
  r := zona_kupujuceho(t);
  assert r ->> 'klient' = 'Karol', 'krstné meno klienta';
  assert jsonb_array_length(r -> 'ponuky') = 0, 'bez výberu makléra nič: ' || (r -> 'ponuky')::text;
  assert r -> 'makler' ->> 'meno' = 'Peter Kováč', 'maklér klienta';
  assert not (r::text like '%0905 123 456%'), 'telefón klienta v zóne nie je';
end $$;
reset role;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select zona_ponuka(:dopyt, :dom, 'poslana') \gset x_
do $$
begin
  begin
    perform zona_ponuka((select max(id) from dopyty), (select id from nehnutelnosti where nazov = 'Byt koncept'), 'poslana');
    assert false, 'koncept sa poslal klientovi';
  exception when raise_exception then null;
  end;
end $$;
commit;
select set_config('request.jwt.claims', '', false) \gset x_

set role anon;
do $$
declare r jsonb; t text := current_setting('test.tok'); v_dom bigint; v_byt bigint;
begin
  r := zona_kupujuceho(t);
  assert jsonb_array_length(r -> 'ponuky') = 1 and r -> 'ponuky' -> 0 ->> 'nazov' = 'Dom Levoča', 'poslaná ponuka je v zóne';
  assert (r -> 'ponuky' -> 0 ->> 'nova')::boolean, 'ponuka poslaná po poslednej návšteve je nová';
  assert not (r -> 'ponuky' -> 0 ? 'popis') and not (r -> 'ponuky' -> 0 ? 'makler'), 'karta ponuky je skrátená';
  v_dom := (r -> 'ponuky' -> 0 ->> 'id')::bigint;
  assert zona_reakcia(t, v_dom, 'obhliadka', 'Môžem v sobotu doobeda.') = 'ok', 'reakcia';
  assert zona_reakcia(t, v_dom, 'obhliadka') = 'ok', 'opakovaná reakcia';
  r := zona_kupujuceho(t);
  assert r -> 'ponuky' -> 0 ->> 'reakcia' = 'obhliadka', 'reakcia sa vracia';
  begin
    perform zona_reakcia(t, (r -> 'ponuky' -> 0 ->> 'id')::bigint + 100000, 'paci');
    assert false, 'reakcia na neexistujúcu ponuku';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from pripomienky where druh = 'zhoda' and makler_id = '33333333-3333-3333-3333-333333333333'
     and poznamka like '%Karol Kupec chce obhliadku: Dom Levoča%' and poznamka like '%Môžem v sobotu%';
  assert n = 1, 'maklér dostal práve jedno upozornenie o obhliadke, je ' || n;
  assert (select sprava from dopyty_ponuky where reakcia = 'obhliadka') like 'Môžem v sobotu%', 'správa ostala aj po opakovanom kliknutí';
end $$;

-- automatika: klient vidí aj ponuky, ktoré sedia na dopyt (Byt Smižany), koncept nie; skrytú nie
-- ponuka inej kancelárie, ktorá na dopyt sedí, sa do zóny nedostane nikdy
insert into nehnutelnosti (kancelaria_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova)
select max(id), 'Byt cudzej kancelárie', 'aktivne', 'predaj', 'byty', '3-izbový byt', 115000, 'Smižany', 'Spišská Nová Ves', 3, 66 from kancelarie where id <> 1;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
select ulozit_klientsku_zonu('{"kupujuci":{"automaticky":true}}') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
set role anon;
do $$
declare r jsonb; t text := current_setting('test.tok'); v_byt bigint;
begin
  r := zona_kupujuceho(t);
  assert jsonb_array_length(r -> 'ponuky') = 2, 'automatika pridala byt: ' || (select string_agg(x ->> 'nazov', ', ') from jsonb_array_elements(r -> 'ponuky') x);
  select (x ->> 'id')::bigint into v_byt from jsonb_array_elements(r -> 'ponuky') x where x ->> 'nazov' = 'Byt Smižany';
  assert v_byt is not null, 'byt zo Smižian sedí na dopyt';
  assert not (r::text like '%cudzej kancelárie%'), 'ponuka inej kancelárie v zóne';
  assert zona_reakcia(t, v_byt, 'nie') = 'ok', 'nie je pre mňa';
end $$;
reset role;
do $$ begin
  assert (select stav from dopyty_ponuky where reakcia = 'nie') = 'auto', 'reakcia na automatickú ponuku';
  assert (select count(*) from pripomienky where druh = 'zhoda' and poznamka like '%klientska zóna%') = 1, '„Nie je pre mňa“ maklérovi nezvoní';
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
select zona_ponuka(:dopyt, :byt, 'skryta') \gset x_
select count(*) as vidim from dopyty_ponuky \gset
commit;
select set_config('request.jwt.claims', '', false) \gset x_
select :vidim = 2 as ok \gset
\if :ok
\else
  do $$ begin raise exception 'maklér má vidieť obe reakcie svojej kancelárie'; end $$;
\endif
set role anon;
do $$
declare r jsonb; t text := current_setting('test.tok');
begin
  r := zona_kupujuceho(t);
  assert jsonb_array_length(r -> 'ponuky') = 1 and r -> 'ponuky' -> 0 ->> 'nazov' = 'Dom Levoča', 'skrytá ponuka v zóne nie je';
end $$;
reset role;

-- vypnuté reakcie, vypnutá zóna, vybavený dopyt, zrušený odkaz
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
select ulozit_klientsku_zonu('{"kupujuci":{"reakcie":false}}') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
set role anon;
do $$
declare t text := current_setting('test.tok');
begin
  begin
    perform zona_reakcia(t, (select (zona_kupujuceho(t) -> 'ponuky' -> 0 ->> 'id')::bigint), 'paci');
    assert false, 'reakcia pri vypnutých reakciách';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) \gset x_
select ulozit_klientsku_zonu('{"kupujuci":{"zapnute":false}}') \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
set role anon;
do $$
declare r jsonb;
begin
  r := zona_kupujuceho(current_setting('test.tok'));
  assert (r ->> 'vypnute')::boolean and not (r ? 'ponuky'), 'vypnutá zóna kupujúceho';
end $$;
reset role;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) \gset x_
do $$
begin
  begin
    perform zona_kupujuceho_odkaz((select max(id) from dopyty_kontakty where zona_token is null));
  exception when others then null;
  end;
end $$;
select zona_kupujuceho_odkaz(:dopyt, true) \gset x_
commit;
select set_config('request.jwt.claims', '', false) \gset x_
set role anon;
do $$ begin
  assert zona_kupujuceho(current_setting('test.tok')) is null, 'zrušený odkaz už nefunguje';
end $$;
reset role;

-- Skúška 113_odhad_median.sql: približná cena bytu podľa mediánu okresu a stavu.
-- Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set K '00000000-0000-0000-0000-0000000000c1'
insert into auth.users (id, email) values (:'K','k@alpha.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup) values (:'K','Kristián Alpha','k@alpha.sk','makler',true,'{odhady}') on conflict do nothing;

create function pg_temp.m(p_typ text, p_okres text, p_plocha numeric, p_stav text) returns jsonb language plpgsql as $$
declare o odhady_hodnoty; begin o.typ := p_typ; o.okres := p_okres; o.plocha := p_plocha; o.stav_nehn := p_stav; return _odhad_median(o); end $$;

\echo '=== 1. počet okresov a Spišská Nová Ves (2 109 €/m², 60 m²)'
select count(*) okresov from odhad_mediany where typ = 'byt';                                               -- → 79
select pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Čiastočne zrekonštruovaný') ->> 'stred' ciastocne,       -- → 127000 (2109 × 60 = 126 540)
       pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Po kompletnej rekonštrukcii') ->> 'stred' kompletna,      -- → 139000 (2320 × 60 = 139 200)
       pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Novostavba') ->> 'uprava' novostavba,                     -- → 10
       pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Pôvodný, udržiavaný') ->> 'stred' povodny,                -- → 114000 (1898 × 60 = 113 880)
       pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Na rekonštrukciu') ->> 'm2_upr' na_rek;                   -- → 1898
select pg_temp.m('byt', 'Spišská Nová Ves', 60, 'Po kompletnej rekonštrukcii') - 'k_datumu' cely;         -- → od 132000, do 146000, oblast okres Spišská Nová Ves

\echo '=== 2. Košice IV, Košice bez časti (priemer I–IV), Košice-okolie, bez plochy, dom, neznámy okres'
select pg_temp.m('byt', 'Košice IV', 70, null) ->> 'm2' kosice_iv,                                         -- → 3466
       pg_temp.m('byt', 'Košice', 70, null) ->> 'm2' kosice_mesto,                                         -- → 3471 (priemer 3670, 3573, 3176, 3466)
       pg_temp.m('byt', 'Bratislava', 70, null) ->> 'oblast' ba,                                           -- → Bratislava
       pg_temp.m('byt', 'Košice-okolie', 70, null) ->> 'm2' ke_okolie,                                     -- → 2114
       pg_temp.m('byt', 'Levoča', null, 'Novostavba') ->> 'stred' bez_plochy,                              -- → (prázdne)
       pg_temp.m('byt', 'Levoča', null, 'Novostavba') ->> 'm2_upr' levoca_m2,                              -- → 1945
       pg_temp.m('dom', 'Levoča', 120, null) is null dom,                                                  -- → t
       pg_temp.m('byt', 'Neexistuje', 70, null) is null nezname;                                           -- → t

\echo '=== 3. podklad v aplikácii obsahuje medián; anonym nič nedostane'
insert into odhady_hodnoty (id, kancelaria_id, makler_id, typ, nazov, okres, obec, plocha, stav_nehn, meno, telefon)
  overriding system value values (99001, 1, :'K', 'byt', '2-izbový byt, Levoča', 'Levoča', 'Levoča', 52, 'Pôvodný, udržiavaný', 'Jana Skúšobná', '0905 000 111');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select odhad_podklad(99001) -> 'median' ->> 'stred' podklad_stred;                                         -- → 83000 (1591 × 52 = 82 732)
select count(*) mediany_citatelne from odhad_mediany;                                                       -- → 79
select _odhad_median(null::odhady_hodnoty);                                                                 -- → ERROR permission denied
reset role;
set role anon;
select count(*) from odhad_mediany;                                                                          -- → ERROR permission denied
select odhad_podklad(99001);                                                                                 -- → ERROR permission denied
reset role;
delete from odhady_hodnoty where id = 99001;

\echo '=== 4. (115) prerobené časti bytu: úprava −10 % až +10 %, starší rok polovica'
create function pg_temp.r(p_stav text, p jsonb) returns jsonb language plpgsql as $$
declare o odhady_hodnoty; begin o.typ := 'byt'; o.okres := 'Spišská Nová Ves'; o.plocha := 60; o.stav_nehn := p_stav; o.rekonstrukcia := _odhad_rek(p); return _odhad_median(o); end $$;
select pg_temp.r('Po kompletnej rekonštrukcii', '{"elektro":"nove","jadro":"nove","podlahy":"nove","kuchyna":"nove","kedy":"2021+"}') ->> 'uprava' vsetko_nove,      -- → 10
       pg_temp.r('Po kompletnej rekonštrukcii', '{"elektro":"nove","jadro":"nove","podlahy":"nove","kuchyna":"nove","kedy":"pred-2010"}') ->> 'uprava' stare,      -- → 0
       pg_temp.r('Čiastočne zrekonštruovaný', '{"elektro":"nove","jadro":"nove","podlahy":"povodne","kuchyna":"povodne","kedy":"2016-2020"}') ->> 'uprava' dve,  -- → 0
       pg_temp.r('Čiastočne zrekonštruovaný', '{"elektro":"nove","jadro":"povodne","podlahy":"povodne","kuchyna":"neviem","kedy":"neviem"}') ->> 'uprava' neviem, -- → -4 (−10 + 5 × 1,5 × 0,75 = −4,4)
       pg_temp.r('Pôvodný, udržiavaný', '{"elektro":"povodne","jadro":"povodne","podlahy":"povodne","kuchyna":"povodne"}') ->> 'uprava' povodne,                  -- → -10
       pg_temp.r('Pôvodný, udržiavaný', '{"elektro":"povodne","jadro":"povodne","podlahy":"povodne","kuchyna":"nove","kedy":"2021+"}') ->> 'stred' kuchyna,         -- → 120000 (2109 × 0,95 = 2004 × 60)
       pg_temp.r('Čiastočne zrekonštruovaný', '{"elektro":"nove"}') ->> 'uprava' neuplne,                                                                          -- → 0 (podľa stavu)
       pg_temp.r('Novostavba', '{"elektro":"povodne","jadro":"povodne","podlahy":"povodne","kuchyna":"povodne"}') ->> 'uprava' novostavba;                         -- → 10
select _odhad_rek('{"elektro":"nove","jadro":"zle","kedy":"1999","iné":"x"}') ocistene,                                                                       -- → {"elektro": "nove"}
       _odhad_rek('"text"') ziadne,                                                                                                                            -- → (prázdne)
       _odhad_rek_text('{"elektro":"nove","jadro":"nove","podlahy":"povodne","kuchyna":"neviem","kedy":"2016-2020"}') text;
-- → Nové: elektroinštalácia, bytové jadro. Pôvodné: podlahy. Neviem: kuchynská linka. Rekonštrukcia: 2016 – 2020

\echo '=== 5. (115) formulár uloží prerobené časti a pridá ich do textu pre makléra; pri novostavbe ich zahodí'
insert into hlavni_spravcovia (user_id) values (:'K') on conflict do nothing;
create or replace function pg_temp.pow(p_start int) returns jsonb language plpgsql as $$
declare ts bigint := extract(epoch from now())::bigint; n int := p_start;
begin
  loop
    if left(encode(extensions.digest('typek1|odhad|odhad|' || ts || '|' || n::text, 'sha256'), 'hex'), 4) = '0000' then return jsonb_build_object('ts', ts::text, 'n', n::text); end if;
    n := n + 1;
  end loop;
end $$;
select pg_temp.pow(3000000) "Q1", pg_temp.pow(5000000) "Q2" \gset
\set BYT '{"typ":"byt","obec":"Levoča","okres":"Levoča","ulica":"Probstnerova","plocha":"62","izby":"3","poschodie":"2","poschodi":"4","stav":"Čiastočne zrekonštruovaný","rekonstrukcia":{"elektro":"nove","jadro":"nove","podlahy":"povodne","kuchyna":"nove","kedy":"2016-2020"},"dovod":"Zvažujem predaj","kedy_predat":"Do roka","meno":"Eva Skúšobná","telefon":"0905 222 333","email":"eva@x.sk"}'
set role anon;
select odhad_ziadost(:'BYT'::jsonb, :'Q1') ->> 'ok' ok;                                                                                                       -- → true
select odhad_ziadost(:'BYT'::jsonb || '{"stav":"Novostavba","telefon":"0905 222 444","email":"eva2@x.sk"}', :'Q2') ->> 'ok' ok2;                                -- → true
reset role;
select rekonstrukcia, _odhad_median(h) ->> 'uprava' uprava, _odhad_median(h) ->> 'stred' stred from odhady_hodnoty h where meno = 'Eva Skúšobná' order by id;
-- → {"kedy": "2016-2020", "jadro": "nove", "elektro": "nove", "kuchyna": "nove", "podlahy": "povodne"}, 5, 115000 (1768 × 1,05 = 1856 × 62 = 115 072)
-- → (prázdne), 10, 121000 (novostavba: 1945 × 62)
select position('Nové: elektroinštalácia, bytové jadro, kuchynská linka. Pôvodné: podlahy. Rekonštrukcia: 2016 – 2020' in w.co) > 0 text_v_kontakte
  from web_kontakty w join odhady_hodnoty h on h.web_kontakt_id = w.id where h.meno = 'Eva Skúšobná' and h.stav_nehn <> 'Novostavba';                     -- → t
select odhad_list(null) is null;  -- → t
delete from odhady_hodnoty where meno = 'Eva Skúšobná';

\echo '=== 6. (116) nadštandardná rekonštrukcia +10 %, dvere/stropy/svietidlá len informácia'
select pg_temp.r('Po kompletnej rekonštrukcii', '{"elektro":"nove","jadro":"nove","podlahy":"nove","kuchyna":"nove","kedy":"2021+","nadstandard":true}') ->> 'uprava' nadstandard,          -- → 20
       pg_temp.r('Po kompletnej rekonštrukcii', '{"elektro":"nove","jadro":"nove","podlahy":"nove","kuchyna":"nove","kedy":"2021+","nadstandard":true}') ->> 'nadstandard' priznak,      -- → true
       pg_temp.r('Čiastočne zrekonštruovaný', '{"elektro":"nove","jadro":"povodne","podlahy":"povodne","kuchyna":"povodne","kedy":"2016-2020","nadstandard":true}') ->> 'uprava' jedna,    -- → 5 (−5 + 10)
       pg_temp.r('Pôvodný, udržiavaný', '{"elektro":"povodne","jadro":"povodne","podlahy":"povodne","kuchyna":"povodne","nadstandard":true}') ->> 'uprava' bez_novych,                   -- → -10 (nadštandard bez nových častí sa neráta)
       pg_temp.r('Pôvodný, udržiavaný', '{"elektro":"povodne","jadro":"povodne","podlahy":"povodne","kuchyna":"povodne","dalsie":["dvere","stropy","svietidla"]}') ->> 'uprava' dvere; -- → -10
select _odhad_rek('{"dalsie":["svietidla","dvere","okno","dvere"],"nadstandard":true}') ocistene,          -- → {"dalsie": ["dvere", "svietidla"], "nadstandard": true}
       _odhad_rek('{"nadstandard":"ano"}') zle,                                                              -- → (prázdne)
       _odhad_rek_text('{"elektro":"nove","jadro":"nove","podlahy":"nove","kuchyna":"nove","kedy":"2021+","dalsie":["dvere","svietidla"],"nadstandard":true}') text;
-- → Nové: elektroinštalácia, bytové jadro, podlahy, kuchynská linka. Rekonštrukcia: 2021 a neskôr. Ešte nové: vchodové dvere, svietidlá. Nadštandardná rekonštrukcia

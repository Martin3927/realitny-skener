-- Skúška 106_skener_kataster_mapa_okresy.sql. Spúšťať po prehraj.sh (+ supabase/seed/lokality.sql). Očakávané výsledky v komentároch „→“.
\set ON_ERROR_STOP 0
\pset footer off
\set A '00000000-0000-0000-0000-0000000000a1'
\set P '00000000-0000-0000-0000-0000000000c1'
\set R '00000000-0000-0000-0000-0000000000c2'
insert into auth.users (id, email) values (:'A','a@alpha.sk'), (:'P','peter@maly.sk'), (:'R','info@ba.sk') on conflict do nothing;
insert into makleri (id, meno, email, rola, aktivny, pristup) values (:'A','Martin Alpha','a@alpha.sk','admin',true,'{}') on conflict do nothing;
insert into hlavni_spravcovia (user_id) values (:'A') on conflict do nothing;
update zakaznici set stav = 'vlastna' where id in (select zakaznik_id from kancelarie where id = 1);

\echo '=== 1. sekcie podľa modulov'
select 'skener' t, _sekcie_z_modulov(array['skener']);                                   -- → {chat,inzeraty,kalendar,kataster,mapa}
select 'web' t, _sekcie_z_modulov(array['web']);                                         -- → {asistent,chat,kalendar,nehnutelnosti,recenzie,web}

\echo '=== 2. registrácia skenera v Poprade → kataster a mapa, okresy v licencii'
select web_ziadost('peter@maly.sk', array['skener'], 1, 'mesacne', array['Poprad'], 'Peter Malý', '0905 123 456', null, null, null);
update zakaznici set registracia_hash = 'h-peter', registracia_do = now() + interval '7 days', registracia_poslat = null where email = 'peter@maly.sk';
select (_registracia_dokoncit('h-peter', :'P', 'Peter Malý', '0905 123 456', null, array['Poprad', 'Kežmarok']))->>'kancelaria' is not null ok;  -- → t
set role authenticated; set request.jwt.claim.sub = :'P';
select 'P' t, ma_pristup('mapa') mapa, ma_pristup('kataster') kat, ma_pristup('nehnutelnosti') nehn, moja_licencia()->'okresy' okresy;  -- → t, t, f, ["Poprad","Kežmarok"]
set request.jwt.claim.sub = :'A';
select 'Alpha' t, moja_licencia()->'okresy' okresy, moja_licencia()->'sekcie' sekcie;    -- → ["Spišská Nová Ves","Levoča"], null
reset role; reset request.jwt.claim.sub;

\echo '=== 3. Bratislava v skúšobnej dobe nie, Košice-okolie áno'
select web_ziadost('info@ba.sk', array['skener'], 1, 'mesacne', array['Bratislava II'], 'Rado Bratislavský', '0905 999 888', null, null, null);
update zakaznici set registracia_hash = 'h-ba', registracia_do = now() + interval '7 days', registracia_poslat = null where email = 'info@ba.sk';
select _registracia_dokoncit('h-ba', :'R', 'Rado Bratislavský', '0905 999 888', null, array['Bratislava II']);          -- → ERROR okresy_velke
select _registracia_dokoncit('h-ba', :'R', 'Rado Bratislavský', '0905 999 888', null, array['Senec', 'Košice I']);      -- → ERROR okresy_velke
select _registracia_dokoncit('h-ba', :'R', 'Rado Bratislavský', '0905 999 888', null, array['Bratislava']);             -- → ERROR okresy_velke
select (_registracia_dokoncit('h-ba', :'R', 'Rado Bratislavský', '0905 999 888', null, array['Senec', 'Košice-okolie']))->>'kancelaria' is not null ok;  -- → t
select 'okresy' t, okresy from kancelarie where zakaznik_id = (select id from zakaznici where email = 'info@ba.sk');      -- → {Senec,Košice-okolie}

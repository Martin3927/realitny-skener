-- Databázový test: Tvoje poznámky – každý vidí a mení len svoje, hotovo si zapíše čas, vlastník sa nedá zmeniť.
-- Spúšťa testy/spusti_testy.sh. Admin 1111…, Jana 2222…, Peter 3333… (seed).
\set ON_ERROR_STOP on
\set ADMIN '11111111-1111-1111-1111-111111111111'
\set JANA '22222222-2222-2222-2222-222222222222'
\set PETER '33333333-3333-3333-3333-333333333333'

-- ---------- Jana si zapíše poznámku
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into poznamky (text, skupina, detail) values ('  Zavolať majiteľovi  ', '  Práca ', '   ');
do $$
declare r poznamky;
begin
  select * into r from poznamky;
  assert r.makler_id = '22222222-2222-2222-2222-222222222222', 'vlastník je prihlásený';
  assert r.text = 'Zavolať majiteľovi', 'text bez medzier';
  assert r.skupina = 'Práca', 'skupina bez medzier';
  assert r.detail is null, 'prázdne podrobnosti = null';
  assert not r.hotovo and r.hotovo_kedy is null, 'nová nie je hotová';
end $$;
-- odklikne hotovo → zapíše sa čas, späť → čas zmizne
update poznamky set hotovo = true;
do $$ begin assert (select hotovo_kedy is not null from poznamky), 'hotovo má čas'; end $$;
update poznamky set hotovo = false;
do $$ begin assert (select hotovo_kedy is null from poznamky), 'späť na spravenie bez času'; end $$;
-- vlastníka nemožno zmeniť
update poznamky set makler_id = '33333333-3333-3333-3333-333333333333';
do $$ begin assert (select makler_id = '22222222-2222-2222-2222-222222222222' from poznamky), 'vlastník ostal'; end $$;
-- cudzej poznámky sa nedá vložiť
do $$
begin
  begin
    insert into poznamky (makler_id, text) values ('33333333-3333-3333-3333-333333333333', 'podvrh');
    assert false, 'cudzia poznámka prešla';
  exception when insufficient_privilege then null;
  end;
end $$;
-- prázdny text neprejde
do $$
begin
  begin
    insert into poznamky (text) values ('   ');
    assert false, 'prázdna poznámka prešla';
  exception when check_violation then null;
  end;
end $$;
commit;

-- ---------- admin ani Peter Janine poznámky nevidia, nezmenia ani nezmažú
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin assert (select count(*) from poznamky) = 0, 'admin nevidí cudzie poznámky'; end $$;
update poznamky set text = 'zmenené';
delete from poznamky;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin assert (select count(*) from poznamky) = 0, 'kolega nevidí cudzie poznámky'; end $$;
insert into poznamky (text, dolezite, termin) values ('Moja vlastná', true, current_date);
do $$ begin assert (select count(*) from poznamky) = 1, 'kolega vidí len svoju'; end $$;
commit;
do $$
begin
  assert (select text from poznamky where makler_id = '22222222-2222-2222-2222-222222222222') = 'Zavolať majiteľovi', 'Janina poznámka ostala nezmenená';
  assert (select count(*) from poznamky) = 2, 'obe poznámky existujú';
end $$;

-- ---------- neaktívny maklér nové poznámky nepridá
update makleri set aktivny = false where id = :'PETER';
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$
begin
  begin
    insert into poznamky (text) values ('po vypnutí');
    assert false, 'neaktívny pridal poznámku';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
update makleri set aktivny = true where id = :'PETER';

-- ---------- anonym nič
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from poznamky;
    assert false, 'anon číta poznámky';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
select 'poznamky OK';

-- =====================================================================
-- 1) Export ponúk do Realsoftu cez United Classifieds (číselníky lokalít, údaje kancelárie, nastavenie exportu)
-- 2) Provízie a fakturácia (admin)
-- 3) História zmien (kto čo zmenil pri ponukách a makléroch)
-- 4) Úvodný sprievodca (kedy maklér videl sprievodcu)
-- 5) Príspevky na sociálne siete (záznam odoslaní)
-- =====================================================================

-- ---------------------------------------------------------------- 1) číselníky lokalít Realsoftu
create table if not exists public.uc_kraj (county_id int primary key, state_id int not null, nazov text not null);
create table if not exists public.uc_okres (district_id int primary key, county_id int not null, nazov text not null);
create table if not exists public.uc_obec (region_id int primary key, district_id int not null, nazov text not null, psc text, lat double precision, lon double precision);
create table if not exists public.uc_cast (citypart_id int primary key, region_id int not null, parent_id int, nazov text not null);
create table if not exists public.uc_ulica (street_id int primary key, region_id int not null, citypart_id int, nazov text not null);
create index if not exists uc_obec_okres on public.uc_obec (district_id);
create index if not exists uc_cast_obec on public.uc_cast (region_id);
create index if not exists uc_ulica_obec on public.uc_ulica (region_id);
do $$ declare t text; begin
  foreach t in array array['uc_kraj', 'uc_okres', 'uc_obec', 'uc_cast', 'uc_ulica'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_citat') then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_citat', t);
    end if;
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- nastavenie exportu pri ponuke (ručne vybraná ulica/obec, ak sa nenájde automaticky; vypnutie exportu)
alter table public.nehnutelnosti add column if not exists uc_export boolean not null default true;
alter table public.nehnutelnosti add column if not exists uc_obec_id int;
alter table public.nehnutelnosti add column if not exists uc_ulica_id int;
alter table public.nehnutelnosti add column if not exists uc_cast_id int;

create or replace function public.nastavit_uc_ponuky(p_id bigint, p_export boolean, p_obec int, p_cast int, p_ulica int) returns void
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id;
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  if not ja_admin() and n.makler_id is distinct from auth.uid() then raise exception 'Upraviť môže len zodpovedný maklér alebo administrátor.'; end if;
  if p_ulica is not null and not exists (select 1 from uc_ulica where street_id = p_ulica) then raise exception 'Neznáma ulica.'; end if;
  update nehnutelnosti set uc_export = coalesce(p_export, true), uc_obec_id = p_obec, uc_cast_id = p_cast, uc_ulica_id = p_ulica where id = p_id;
end $$;

-- údaje kancelárie (pracovisko) – potrebné pre export
create or replace function public.ulozit_kancelariu(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_admin();
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte názov kancelárie.'; end if;
  if length(regexp_replace(coalesce(p->>'telefon', ''), '\D', '', 'g')) < 5 then raise exception 'Zadajte telefón kancelárie.'; end if;
  if coalesce(p->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Zadajte platný email kancelárie.'; end if;
  v := jsonb_build_object('nazov', trim(p->>'nazov'), 'telefon', trim(p->>'telefon'), 'email', lower(trim(p->>'email')),
    'mesto', trim(coalesce(p->>'mesto', '')), 'psc', trim(coalesce(p->>'psc', '')), 'ulica', trim(coalesce(p->>'ulica', '')),
    'cislo', trim(coalesce(p->>'cislo', '')), 'kontakt', nullif(trim(coalesce(p->>'kontakt', '')), ''), 'ico', nullif(trim(coalesce(p->>'ico', '')), ''));
  insert into nastavenia (kluc, hodnota) values ('kancelaria', v::text) on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $$;

create or replace function public.kancelaria_udaje() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return coalesce((select hodnota::jsonb from nastavenia where kluc = 'kancelaria'), '{}'::jsonb);
end $$;

-- tajný odkaz na súbor pre United Classifieds (sťahujú ho samy každých 12 hodín)
create or replace function public.uc_feed_odkaz(p_novy boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform _over_admin();
  select hodnota into v from nastavenia where kluc = 'uc_token';
  if v is null or p_novy then
    v := encode(gen_random_bytes(20), 'hex');
    insert into nastavenia (kluc, hodnota) values ('uc_token', v) on conflict (kluc) do update set hodnota = excluded.hodnota;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- 2) provízie a fakturácia
create table if not exists public.provizie (
  id bigint generated always as identity primary key,
  nehnutelnost_id bigint references public.nehnutelnosti(id) on delete set null,
  nazov text not null,                                   -- popis obchodu (napr. „3-izbový byt Mier – predaj“)
  makler_id uuid references public.makleri(id) on delete set null,
  datum_obchodu date not null default current_date,
  provizia_celkom numeric not null default 0,            -- provízia kancelárie od klienta (s DPH alebo bez – podľa poznámky)
  podiel_maklera numeric not null default 0,             -- koľko patrí maklérovi
  faktura_cislo text,
  faktura_vystavena date,
  faktura_splatnost date,
  zaplatene_klientom date,                               -- klient zaplatil kancelárii
  vyplatene_maklerovi date,                              -- kancelária vyplatila maklérovi
  poznamka text,
  zrusene timestamptz,
  vytvoril uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now()
);
alter table public.provizie enable row level security;
do $$ begin
  create policy provizie_citat on public.provizie for select to authenticated
    using (ja_aktivny() and zrusene is null and (ja_admin() or makler_id = auth.uid()));
exception when duplicate_object then null; end $$;
revoke all on public.provizie from anon, authenticated;
grant select on public.provizie to authenticated;

create or replace function public.ulozit_proviziu(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint;
begin
  perform _over_admin();
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte popis obchodu.'; end if;
  if coalesce((p->>'provizia_celkom')::numeric, 0) < 0 or coalesce((p->>'podiel_maklera')::numeric, 0) < 0 then raise exception 'Suma nemôže byť záporná.'; end if;
  if coalesce((p->>'podiel_maklera')::numeric, 0) > coalesce((p->>'provizia_celkom')::numeric, 0) then raise exception 'Podiel makléra je vyšší ako celá provízia.'; end if;
  if v_id is null then
    insert into provizie (nazov, vytvoril) values (trim(p->>'nazov'), auth.uid()) returning id into v_id;
  elsif not exists (select 1 from provizie where id = v_id and zrusene is null) then raise exception 'Záznam neexistuje.';
  end if;
  update provizie set
    nazov = left(trim(p->>'nazov'), 160),
    nehnutelnost_id = nullif(p->>'nehnutelnost_id', '')::bigint,
    makler_id = nullif(p->>'makler_id', '')::uuid,
    datum_obchodu = coalesce(nullif(p->>'datum_obchodu', '')::date, current_date),
    provizia_celkom = coalesce(nullif(p->>'provizia_celkom', '')::numeric, 0),
    podiel_maklera = coalesce(nullif(p->>'podiel_maklera', '')::numeric, 0),
    faktura_cislo = nullif(trim(coalesce(p->>'faktura_cislo', '')), ''),
    faktura_vystavena = nullif(p->>'faktura_vystavena', '')::date,
    faktura_splatnost = nullif(p->>'faktura_splatnost', '')::date,
    zaplatene_klientom = nullif(p->>'zaplatene_klientom', '')::date,
    vyplatene_maklerovi = nullif(p->>'vyplatene_maklerovi', '')::date,
    poznamka = nullif(trim(coalesce(p->>'poznamka', '')), '')
  where id = v_id;
  return v_id;
end $$;

create or replace function public.zrusit_proviziu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  update provizie set zrusene = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------- 3) história zmien
create table if not exists public.historia_zmien (
  id bigint generated always as identity primary key,
  tabulka text not null,
  zaznam_id text not null,
  akcia text not null,                 -- vytvorenie | zmena | zmazanie
  zmeny jsonb not null default '{}',   -- {pole: [stará, nová]}
  kto uuid,
  kedy timestamptz not null default now()
);
create index if not exists historia_zaznam on public.historia_zmien (tabulka, zaznam_id, kedy desc);
create index if not exists historia_kedy on public.historia_zmien (kedy desc);
alter table public.historia_zmien enable row level security;
do $$ begin
  create policy historia_citat on public.historia_zmien for select to authenticated
    using (ja_aktivny() and (ja_admin() or (tabulka = 'nehnutelnosti' and exists (select 1 from nehnutelnosti n where n.id::text = zaznam_id and n.makler_id = auth.uid()))));
exception when duplicate_object then null; end $$;
revoke all on public.historia_zmien from anon, authenticated;
grant select on public.historia_zmien to authenticated;

create or replace function public._zapis_historiu() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  stary jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  novy jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  zmeny jsonb := '{}'::jsonb; k text;
  ignoruj text[] := array['upravene', 'naposledy_aktivny', 'chat_precitane', 'report_odoslany', 'foto', 'kalendar_token', 'report_token'];
begin
  for k in select jsonb_object_keys(stary || novy) loop
    if k = any(ignoruj) then continue; end if;
    if (stary -> k) is distinct from (novy -> k) then
      zmeny := zmeny || jsonb_build_object(k, jsonb_build_array(
        case when length(coalesce(stary ->> k, '')) > 300 then to_jsonb(left(stary ->> k, 300) || '…') else stary -> k end,
        case when length(coalesce(novy ->> k, '')) > 300 then to_jsonb(left(novy ->> k, 300) || '…') else novy -> k end));
    end if;
  end loop;
  if tg_op = 'UPDATE' and zmeny = '{}'::jsonb then return null; end if;
  if tg_op = 'UPDATE' and (select count(*) from jsonb_object_keys(zmeny)) = 1 and zmeny ? 'foto' then return null; end if;
  insert into historia_zmien (tabulka, zaznam_id, akcia, zmeny, kto)
  values (tg_table_name,
    case tg_table_name when 'nehnutelnosti_interne' then coalesce(novy ->> 'nehnutelnost_id', stary ->> 'nehnutelnost_id')
                       else coalesce(novy ->> 'id', stary ->> 'id') end,
    case tg_op when 'INSERT' then 'vytvorenie' when 'UPDATE' then 'zmena' else 'zmazanie' end,
    case when tg_op = 'INSERT' then '{}'::jsonb else zmeny end, auth.uid());
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'historia_nehnutelnosti') then
    create trigger historia_nehnutelnosti after insert or update or delete on public.nehnutelnosti for each row execute function public._zapis_historiu();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'historia_nehnutelnosti_interne') then
    create trigger historia_nehnutelnosti_interne after update on public.nehnutelnosti_interne for each row execute function public._zapis_historiu();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'historia_makleri') then
    create trigger historia_makleri after insert or update or delete on public.makleri for each row execute function public._zapis_historiu();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'historia_provizie') then
    create trigger historia_provizie after insert or update on public.provizie for each row execute function public._zapis_historiu();
  end if;
end $$;

-- ---------------------------------------------------------------- 4) úvodný sprievodca
alter table public.makleri add column if not exists sprievodca_videny timestamptz;
create or replace function public.sprievodca_hotovo(p_znova boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set sprievodca_videny = case when p_znova then null else now() end where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- 5) príspevky na sociálne siete
create table if not exists public.prispevky_siete (
  id bigint generated always as identity primary key,
  nehnutelnost_id bigint references public.nehnutelnosti(id) on delete cascade,
  siete text[] not null,
  text text not null,
  stav text not null default 'odoslane',
  makler_id uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now()
);
alter table public.prispevky_siete enable row level security;
do $$ begin
  create policy prispevky_citat on public.prispevky_siete for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
revoke all on public.prispevky_siete from anon, authenticated;
grant select on public.prispevky_siete to authenticated;

revoke execute on function public.nastavit_uc_ponuky(bigint, boolean, int, int, int), public.ulozit_kancelariu(jsonb), public.kancelaria_udaje(),
  public.uc_feed_odkaz(boolean), public.ulozit_proviziu(jsonb), public.zrusit_proviziu(bigint), public.sprievodca_hotovo(boolean) from public, anon;
grant execute on function public.nastavit_uc_ponuky(bigint, boolean, int, int, int), public.ulozit_kancelariu(jsonb), public.kancelaria_udaje(),
  public.uc_feed_odkaz(boolean), public.ulozit_proviziu(jsonb), public.zrusit_proviziu(bigint), public.sprievodca_hotovo(boolean) to authenticated;
revoke execute on function public._zapis_historiu() from public, anon, authenticated;

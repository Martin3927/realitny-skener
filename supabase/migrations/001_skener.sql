-- =====================================================================
-- Realitný skener Alpha Reality – databáza, práva, funkcie
-- Všetky zápisy z aplikácie idú cez funkcie nižšie (kontrolujú práva).
-- Tabuľky sú pre prihlásených len na čítanie.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- makléri
create table public.makleri (
  id uuid primary key references auth.users(id) on delete cascade,
  meno text not null default '',
  email text,
  rola text not null default 'makler' check (rola in ('admin', 'makler')),
  aktivny boolean not null default true,
  vidi_podhodnotene boolean not null default false,
  vytvorene timestamptz not null default now()
);

-- ---------------------------------------------------------------- inzeráty zo skenera
create table public.inzeraty (
  id text primary key,
  portal text not null,
  portaly text[] not null default '{}',
  url text,
  nazov text not null default '',
  typ text,
  podtyp text,
  izby int,
  cena int,
  plocha numeric,
  cena_m2 numeric,
  obec text,
  okres text,
  predajca text,
  predajca_typ text,
  predajca_dovod text,
  foto text,
  popis text,
  publikovane date,
  prvy_krat timestamptz not null default now(),
  naposledy timestamptz not null default now(),
  aktivny boolean not null default true,
  duplikat_z text,
  dalsie_odkazy jsonb not null default '[]',
  historia_cien jsonb not null default '[]'
);
create index on public.inzeraty (aktivny) where duplikat_z is null;

-- odhad ceny je oddelený, aby ho videli len oprávnení
create table public.odhady (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  median numeric,
  rozdiel_pct numeric,
  skupina text,
  n int,
  jednotka text,
  podhodnotene boolean not null default false
);

-- ---------------------------------------------------------------- práca maklérov s inzerátom
create table public.prevzatia (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete set null,
  prevzate timestamptz,
  posledny_vysledok text,
  posledna_poznamka text,
  posledny_hovor timestamptz,
  pocet_hovorov int not null default 0,
  sms timestamptz,
  sms_kto uuid references public.makleri(id) on delete set null,
  email timestamptz,
  email_kto uuid references public.makleri(id) on delete set null,
  upravene timestamptz not null default now()
);

create table public.aktivity (
  id bigint generated always as identity primary key,
  inzerat_id text not null references public.inzeraty(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete set null,
  typ text not null check (typ in ('prevzatie', 'uvolnenie', 'presun', 'hovor', 'sms', 'email', 'sms_zrusena', 'email_zruseny')),
  vysledok text,
  poznamka text,
  vytvorene timestamptz not null default now()
);
create index on public.aktivity (inzerat_id, vytvorene desc);

-- ---------------------------------------------------------------- schránkovanie
create table public.schrankovanie (
  id bigint generated always as identity primary key,
  lokalita text not null default '',
  typ text,
  cena int,
  telefon text,
  stav text,
  poznamky text,
  makler_id uuid references public.makleri(id) on delete set null,
  vytvoril uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now(),
  zmazane timestamptz,
  zmazal uuid references public.makleri(id) on delete set null
);

-- ---------------------------------------------------------------- stav skenera
create table public.stav_skenera (
  id int primary key check (id = 1),
  meta jsonb not null default '{}',
  upravene timestamptz not null default now()
);

-- ---------------------------------------------------------------- nastavenia (tajný kľúč skenera)
create table public.nastavenia (
  kluc text primary key,
  hodnota text not null
);

-- ---------------------------------------------------------------- pomocné funkcie pre práva
create or replace function public.ja_aktivny() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri where id = auth.uid() and aktivny);
$$;

create or replace function public.ja_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri where id = auth.uid() and aktivny and rola = 'admin');
$$;

create or replace function public.ja_vidim_podhodnotene() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri where id = auth.uid() and aktivny and (rola = 'admin' or vidi_podhodnotene));
$$;

-- ---------------------------------------------------------------- RLS
alter table public.makleri enable row level security;
alter table public.inzeraty enable row level security;
alter table public.odhady enable row level security;
alter table public.prevzatia enable row level security;
alter table public.aktivity enable row level security;
alter table public.schrankovanie enable row level security;
alter table public.nastavenia enable row level security;
alter table public.stav_skenera enable row level security;

create policy makleri_citat on public.makleri for select to authenticated using (ja_aktivny() or id = auth.uid());
create policy inzeraty_citat on public.inzeraty for select to authenticated using (ja_aktivny());
create policy odhady_citat on public.odhady for select to authenticated using (ja_vidim_podhodnotene());
create policy prevzatia_citat on public.prevzatia for select to authenticated using (ja_aktivny());
create policy aktivity_citat on public.aktivity for select to authenticated using (ja_aktivny());
create policy schrankovanie_citat on public.schrankovanie for select to authenticated using (ja_aktivny() and zmazane is null);
create policy stav_citat on public.stav_skenera for select to authenticated using (ja_aktivny());
-- nastavenia: žiadna politika = nikto z aplikácie ich nečíta

revoke all on public.makleri, public.inzeraty, public.odhady, public.prevzatia, public.aktivity,
  public.schrankovanie, public.nastavenia, public.stav_skenera from anon, authenticated;
grant select on public.makleri, public.inzeraty, public.odhady, public.prevzatia, public.aktivity,
  public.schrankovanie, public.stav_skenera to authenticated;

-- ---------------------------------------------------------------- funkcie pre maklérov
create or replace function public._over_aktivny() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not ja_aktivny() then
    raise exception 'Váš účet nie je aktívny. Kontaktujte administrátora.' using errcode = '42501';
  end if;
end $$;

create or replace function public._meno(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(meno, ''), email, 'iný maklér') from makleri where id = p;
$$;

-- prevezme voľný inzerát
create or replace function public.prevziat(p_inzerat text) returns void
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid;
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat) then
    raise exception 'Inzerát neexistuje.';
  end if;
  insert into prevzatia (inzerat_id) values (p_inzerat) on conflict do nothing;
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat for update;
  if v_majitel is not null and v_majitel <> auth.uid() then
    raise exception 'Inzerát už má prevzatý %.', _meno(v_majitel);
  end if;
  if v_majitel is null then
    update prevzatia set makler_id = auth.uid(), prevzate = now(), upravene = now() where inzerat_id = p_inzerat;
    insert into aktivity (inzerat_id, makler_id, typ) values (p_inzerat, auth.uid(), 'prevzatie');
  end if;
end $$;

-- vráti inzerát medzi voľné (majiteľ alebo admin)
create or replace function public.uvolnit(p_inzerat text) returns void
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid;
begin
  perform _over_aktivny();
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat for update;
  if v_majitel is null then return; end if;
  if v_majitel <> auth.uid() and not ja_admin() then
    raise exception 'Uvoľniť môže len %, alebo administrátor.', _meno(v_majitel);
  end if;
  update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = p_inzerat;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka)
    values (p_inzerat, auth.uid(), 'uvolnenie', 'od: ' || _meno(v_majitel));
end $$;

-- interná kontrola: s inzerátom môže pracovať jeho maklér alebo admin; voľný si maklér prevezme
create or replace function public._moj_alebo_prevezmi(p_inzerat text) returns void
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid;
begin
  perform prevziat_ak_volny(p_inzerat);
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat for update;
  if v_majitel is not null and v_majitel <> auth.uid() and not ja_admin() then
    raise exception 'Inzerát má prevzatý %. Zapisovať môže len on alebo administrátor.', _meno(v_majitel);
  end if;
end $$;

create or replace function public.prevziat_ak_volny(p_inzerat text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat) then
    raise exception 'Inzerát neexistuje.';
  end if;
  insert into prevzatia (inzerat_id) values (p_inzerat) on conflict do nothing;
  if exists (select 1 from prevzatia where inzerat_id = p_inzerat and makler_id is null) then
    perform prevziat(p_inzerat);
  end if;
end $$;

-- zápis hovoru
create or replace function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _moj_alebo_prevezmi(p_inzerat);
  if coalesce(trim(p_vysledok), '') = '' then
    raise exception 'Vyberte, ako dopadol hovor.';
  end if;
  update prevzatia set posledny_vysledok = p_vysledok, posledna_poznamka = nullif(trim(p_poznamka), ''),
    posledny_hovor = now(), pocet_hovorov = pocet_hovorov + 1, upravene = now()
  where inzerat_id = p_inzerat;
  insert into aktivity (inzerat_id, makler_id, typ, vysledok, poznamka)
    values (p_inzerat, auth.uid(), 'hovor', p_vysledok, nullif(trim(p_poznamka), ''));
end $$;

-- odkliknutie SMS / emailu (p_typ = 'sms' | 'email', p_stav = true označí, false zruší)
create or replace function public.oznacit_kontakt(p_inzerat text, p_typ text, p_stav boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_typ not in ('sms', 'email') then raise exception 'Neznámy typ.'; end if;
  perform _moj_alebo_prevezmi(p_inzerat);
  if p_typ = 'sms' then
    update prevzatia set sms = case when p_stav then now() end, sms_kto = case when p_stav then auth.uid() end,
      upravene = now() where inzerat_id = p_inzerat;
  else
    update prevzatia set email = case when p_stav then now() end, email_kto = case when p_stav then auth.uid() end,
      upravene = now() where inzerat_id = p_inzerat;
  end if;
  insert into aktivity (inzerat_id, makler_id, typ)
    values (p_inzerat, auth.uid(), case when p_stav then p_typ when p_typ = 'sms' then 'sms_zrusena' else 'email_zruseny' end);
end $$;

-- ---------------------------------------------------------------- funkcie pre administrátora
create or replace function public._over_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not ja_admin() then
    raise exception 'Túto akciu môže urobiť len administrátor.' using errcode = '42501';
  end if;
end $$;

-- presun inzerátu inému maklérovi (null = voľný)
create or replace function public.presunut(p_inzerat text, p_makler uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_povodny uuid;
begin
  perform _over_admin();
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler and aktivny) then
    raise exception 'Maklér neexistuje alebo nie je aktívny.';
  end if;
  insert into prevzatia (inzerat_id) values (p_inzerat) on conflict do nothing;
  select makler_id into v_povodny from prevzatia where inzerat_id = p_inzerat for update;
  update prevzatia set makler_id = p_makler, prevzate = case when p_makler is null then null else now() end,
    upravene = now() where inzerat_id = p_inzerat;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka)
    values (p_inzerat, auth.uid(), 'presun',
            coalesce(_meno(v_povodny), 'voľný') || ' → ' || coalesce(_meno(p_makler), 'voľný'));
end $$;

-- nastavenie makléra (meno, rola, aktívny, vidí podhodnotené)
create or replace function public.upravit_maklera(p_id uuid, p_meno text, p_rola text, p_aktivny boolean, p_vidi_podhodnotene boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_id = auth.uid() and (p_rola <> 'admin' or not p_aktivny) then
    raise exception 'Sám sebe nemôžete odobrať administrátora ani deaktivovať účet.';
  end if;
  update makleri set meno = coalesce(nullif(trim(p_meno), ''), meno), rola = p_rola, aktivny = p_aktivny,
    vidi_podhodnotene = p_vidi_podhodnotene where id = p_id;
end $$;

-- ---------------------------------------------------------------- schránkovanie
create or replace function public.ulozit_schrankovanie(
  p_id bigint, p_lokalita text, p_typ text, p_cena int, p_telefon text, p_stav text, p_poznamky text, p_makler uuid
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_majitel uuid;
begin
  perform _over_aktivny();
  if coalesce(trim(p_lokalita), '') = '' then raise exception 'Zadajte lokalitu.'; end if;
  if p_id is null then
    insert into schrankovanie (lokalita, typ, cena, telefon, stav, poznamky, makler_id, vytvoril)
    values (trim(p_lokalita), p_typ, p_cena, nullif(trim(p_telefon), ''), nullif(trim(p_stav), ''), nullif(trim(p_poznamky), ''),
            case when ja_admin() and p_makler is not null then p_makler else auth.uid() end, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select makler_id into v_majitel from schrankovanie where id = p_id and zmazane is null for update;
  if not found then raise exception 'Záznam neexistuje.'; end if;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Upraviť môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  update schrankovanie set lokalita = trim(p_lokalita), typ = p_typ, cena = p_cena, telefon = nullif(trim(p_telefon), ''),
    stav = nullif(trim(p_stav), ''), poznamky = nullif(trim(p_poznamky), ''),
    makler_id = case when ja_admin() then p_makler else makler_id end, upravene = now()
  where id = p_id;
  return p_id;
end $$;

create or replace function public.zmazat_schrankovanie(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid;
begin
  perform _over_aktivny();
  select makler_id into v_majitel from schrankovanie where id = p_id;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Zmazať môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  -- záznam sa len skryje (dá sa obnoviť v databáze, keby sa zmazal omylom)
  update schrankovanie set zmazane = now(), zmazal = auth.uid() where id = p_id;
end $$;

-- ---------------------------------------------------------------- prvé spustenie
-- Či už existuje nejaký účet (aplikácia podľa toho ponúkne vytvorenie administrátora).
create or replace function public.je_prve_spustenie() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from makleri);
$$;

-- ---------------------------------------------------------------- skener (prístup cez tajný kľúč)
create or replace function public._over_skener(p_kluc text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from nastavenia where kluc = 'skener_kluc_hash'
                 and hodnota = encode(digest(p_kluc, 'sha256'), 'hex')) then
    raise exception 'Neplatný kľúč skenera.' using errcode = '42501';
  end if;
end $$;

create or replace function public.skener_nacitat(p_kluc text, p_od int default 0, p_pocet int default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(r) from (
      select to_jsonb(i) || jsonb_build_object(
        '_odhad', case when o.median is null then null else jsonb_build_object(
          'median', o.median, 'rozdiel_pct', o.rozdiel_pct, 'skupina', o.skupina, 'n', o.n, 'jednotka', o.jednotka) end,
        'podhodnotene', coalesce(o.podhodnotene, false)) as r
      from inzeraty i left join odhady o on o.inzerat_id = i.id
      order by i.id offset p_od limit p_pocet
    ) x), '[]'::jsonb);
end $$;

-- stav posledného behu skenera (čas, chyby) – zapisuje skener, čítajú makléri
create or replace function public.skener_meta(p_kluc text, p_meta jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  if p_meta is not null then
    insert into stav_skenera (id, meta, upravene) values (1, p_meta, now())
    on conflict (id) do update set meta = excluded.meta, upravene = now();
  end if;
  return (select meta from stav_skenera where id = 1);
end $$;

create or replace function public.skener_ulozit(p_kluc text, p_inzeraty jsonb, p_odhady jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform _over_skener(p_kluc);
  insert into inzeraty (id, portal, portaly, url, nazov, typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, prvy_krat, naposledy, aktivny, duplikat_z,
    dalsie_odkazy, historia_cien)
  select id, portal, coalesce(portaly, '{}'), url, coalesce(nazov, ''), typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, coalesce(prvy_krat, now()), coalesce(naposledy, now()),
    coalesce(aktivny, true), duplikat_z, coalesce(dalsie_odkazy, '[]'), coalesce(historia_cien, '[]')
  from jsonb_populate_recordset(null::inzeraty, p_inzeraty)
  on conflict (id) do update set
    portal = excluded.portal, portaly = excluded.portaly, url = excluded.url, nazov = excluded.nazov,
    typ = excluded.typ, podtyp = excluded.podtyp, izby = excluded.izby, cena = excluded.cena,
    plocha = excluded.plocha, cena_m2 = excluded.cena_m2, obec = excluded.obec, okres = excluded.okres,
    predajca = excluded.predajca, predajca_typ = excluded.predajca_typ, predajca_dovod = excluded.predajca_dovod,
    foto = excluded.foto, popis = excluded.popis, publikovane = excluded.publikovane,
    prvy_krat = excluded.prvy_krat, naposledy = excluded.naposledy, aktivny = excluded.aktivny,
    duplikat_z = excluded.duplikat_z, dalsie_odkazy = excluded.dalsie_odkazy, historia_cien = excluded.historia_cien;
  get diagnostics v = row_count;
  if p_odhady is not null then
    -- odhady nových hodnôt prepíšeme, inzerátom bez odhadu ho vynulujeme
    insert into odhady (inzerat_id, median, rozdiel_pct, skupina, n, jednotka, podhodnotene)
    select inzerat_id, median, rozdiel_pct, skupina, n, jednotka, coalesce(podhodnotene, false)
    from jsonb_populate_recordset(null::odhady, p_odhady)
    on conflict (inzerat_id) do update set median = excluded.median, rozdiel_pct = excluded.rozdiel_pct,
      skupina = excluded.skupina, n = excluded.n, jednotka = excluded.jednotka, podhodnotene = excluded.podhodnotene;
    update odhady set median = null, rozdiel_pct = null, skupina = null, n = null, jednotka = null, podhodnotene = false
    where inzerat_id in (select x->>'id' from jsonb_array_elements(p_inzeraty) x)
      and inzerat_id not in (select x->>'inzerat_id' from jsonb_array_elements(p_odhady) x)
      and median is not null;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- oprávnenia na funkcie
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.prevziat(text), public.uvolnit(text), public.zapisat_hovor(text, text, text),
  public.oznacit_kontakt(text, text, boolean), public.presunut(text, uuid),
  public.upravit_maklera(uuid, text, text, boolean, boolean),
  public.ulozit_schrankovanie(bigint, text, text, int, text, text, text, uuid), public.zmazat_schrankovanie(bigint),
  public.ja_aktivny(), public.ja_admin(), public.ja_vidim_podhodnotene()
  to authenticated;
grant execute on function public.je_prve_spustenie() to anon, authenticated, service_role;
grant execute on function public.skener_nacitat(text, int, int), public.skener_ulozit(text, jsonb, jsonb),
  public.skener_meta(text, jsonb) to anon;

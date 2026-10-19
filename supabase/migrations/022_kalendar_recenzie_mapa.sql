-- =====================================================================
-- Oznamy a pochvala pre celý tím, kalendár (+ odber pre Google / Apple),
-- recenzie klientov, poloha inzerátov na realitnú mapu, štatistiky ponúk,
-- nové sekcie v prístupoch (mapa, kalendár, AI asistent, osobný web, recenzie).
-- =====================================================================

-- ---------------------------------------------------------------- oznam / pochvala pre všetkých
alter table public.pochvaly add column if not exists typ text not null default 'osobna';
do $$ begin
  alter table public.pochvaly add constraint pochvaly_typ_chk check (typ in ('osobna', 'tim', 'oznam'));
exception when duplicate_object then null; end $$;

create or replace function public.pochvalit_vsetkych(p_text text, p_typ text) returns int
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, '')); n int;
begin
  perform _over_admin();
  if p_typ not in ('tim', 'oznam') then raise exception 'Neznámy typ správy.'; end if;
  if v = '' then raise exception 'Napíšte text.'; end if;
  if length(v) > 800 then raise exception 'Text je príliš dlhý.'; end if;
  insert into pochvaly (komu, od, text, typ)
  select id, auth.uid(), v, p_typ from makleri where aktivny and id <> auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.pochvalit_vsetkych(text, text) from public, anon;
grant execute on function public.pochvalit_vsetkych(text, text) to authenticated;

-- ---------------------------------------------------------------- kalendár
create table if not exists public.udalosti (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  nazov text not null,
  zaciatok timestamptz not null,
  koniec timestamptz,
  cely_den boolean not null default false,
  typ text not null default 'stretnutie' check (typ in ('stretnutie', 'obhliadka', 'podpis', 'telefonat', 'osobne', 'ine')),
  miesto text,
  poznamka text,
  nehnutelnost_id bigint references public.nehnutelnosti(id) on delete set null,
  zdielane boolean not null default false,          -- vidí celý tím
  zrusene timestamptz,
  vytvorene timestamptz not null default now()
);
create index if not exists udalosti_cas on public.udalosti (makler_id, zaciatok) where zrusene is null;
alter table public.udalosti enable row level security;
do $$ begin
  create policy udalosti_citat on public.udalosti for select to authenticated
    using (ja_aktivny() and zrusene is null and (makler_id = auth.uid() or zdielane or ja_admin()));
exception when duplicate_object then null; end $$;
revoke all on public.udalosti from anon, authenticated;
grant select on public.udalosti to authenticated;

alter table public.makleri add column if not exists kalendar_token text unique;

create or replace function public.ulozit_udalost(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; u udalosti; v_z timestamptz; v_k timestamptz;
begin
  perform _over_aktivny();
  v_z := nullif(p->>'zaciatok', '')::timestamptz; v_k := nullif(p->>'koniec', '')::timestamptz;
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte názov udalosti.'; end if;
  if v_z is null then raise exception 'Zadajte dátum a čas.'; end if;
  if v_k is not null and v_k < v_z then raise exception 'Koniec je skôr ako začiatok.'; end if;
  if v_id is not null then
    select * into u from udalosti where id = v_id and zrusene is null for update;
    if not found then raise exception 'Udalosť neexistuje.'; end if;
    if u.makler_id <> auth.uid() and not ja_admin() then raise exception 'Upraviť môže len autor alebo administrátor.'; end if;
  else
    insert into udalosti (makler_id, nazov, zaciatok) values (auth.uid(), trim(p->>'nazov'), v_z) returning id into v_id;
  end if;
  update udalosti set nazov = left(trim(p->>'nazov'), 140), zaciatok = v_z, koniec = v_k,
    cely_den = coalesce((p->>'cely_den')::boolean, false), typ = coalesce(nullif(p->>'typ', ''), 'stretnutie'),
    miesto = nullif(trim(p->>'miesto'), ''), poznamka = nullif(trim(p->>'poznamka'), ''),
    nehnutelnost_id = nullif(p->>'nehnutelnost_id', '')::bigint, zdielane = coalesce((p->>'zdielane')::boolean, false)
  where id = v_id;
  return v_id;
end $$;

create or replace function public.zrusit_udalost(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u udalosti;
begin
  perform _over_aktivny();
  select * into u from udalosti where id = p_id and zrusene is null for update;
  if not found then raise exception 'Udalosť neexistuje.'; end if;
  if u.makler_id <> auth.uid() and not ja_admin() then raise exception 'Zrušiť môže len autor alebo administrátor.'; end if;
  update udalosti set zrusene = now() where id = p_id;
end $$;

-- tajný odkaz na odber kalendára (Google Kalendár, Apple Kalendár, Outlook)
create or replace function public.moj_kalendar_odkaz(p_novy boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform _over_aktivny();
  update makleri set kalendar_token = case when p_novy or kalendar_token is null then encode(gen_random_bytes(18), 'hex') else kalendar_token end
  where id = auth.uid() returning kalendar_token into v;
  return v;
end $$;

-- údaje pre odber (volá edge funkcia kalendar so service rolou)
create or replace function public._kalendar_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m makleri;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into m from makleri where kalendar_token = p_token and aktivny;
  if not found then return null; end if;
  return jsonb_build_object('meno', m.meno,
    'udalosti', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nazov', u.nazov, 'zaciatok', u.zaciatok, 'koniec', u.koniec,
        'cely_den', u.cely_den, 'miesto', u.miesto, 'poznamka', u.poznamka, 'typ', u.typ, 'upravene', u.vytvorene))
      from udalosti u where u.zrusene is null and (u.makler_id = m.id or u.zdielane) and u.zaciatok > now() - interval '60 days'), '[]'::jsonb),
    'obhliadky', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cas', o.cas, 'klient', o.klient_meno, 'telefon', o.klient_telefon,
        'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'miesto', concat_ws(', ', n.ulica, n.obec)))
      from obhliadky o join nehnutelnosti n on n.id = o.nehnutelnost_id
      where o.zrusena is null and o.cas > now() - interval '60 days' and (o.makler_id = m.id or n.makler_id = m.id)), '[]'::jsonb),
    'pripomienky', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'cas', p.cas, 'poznamka', p.poznamka, 'druh', p.druh))
      from pripomienky p where p.makler_id = m.id and p.zrusena is null and p.hotovo is null and p.druh in ('pripomienka', 'obhliadka')
        and p.cas > now() - interval '7 days'), '[]'::jsonb),
    'zmluvy', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'do', i.zmluva_do, 'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'majitel', i.majitel_meno))
      from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
      where i.zmluva and i.zmluva_do >= current_date - 7 and n.makler_id = m.id and n.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')), '[]'::jsonb));
end $$;
revoke execute on function public._kalendar_feed(text) from public, anon, authenticated;

revoke execute on function public.ulozit_udalost(jsonb), public.zrusit_udalost(bigint), public.moj_kalendar_odkaz(boolean) from public, anon;
grant execute on function public.ulozit_udalost(jsonb), public.zrusit_udalost(bigint), public.moj_kalendar_odkaz(boolean) to authenticated;

-- ---------------------------------------------------------------- recenzie klientov
create table if not exists public.recenzie (
  id bigint generated always as identity primary key,
  kancelaria text not null default 'alpha',
  makler_id uuid references public.makleri(id) on delete set null,
  meno text not null,
  hodnotenie int not null check (hodnotenie between 1 and 5),
  text text not null default '',
  zdroj text not null default 'web' check (zdroj in ('web', 'google', 'facebook', 'osobne', 'ine')),
  stav text not null default 'caka' check (stav in ('caka', 'schvalena', 'zamietnuta')),
  zapisal uuid references public.makleri(id) on delete set null,
  schvalil uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now()
);
alter table public.recenzie enable row level security;
do $$ begin
  create policy recenzie_citat on public.recenzie for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
revoke all on public.recenzie from anon, authenticated;
grant select on public.recenzie to authenticated;

-- klient napíše recenziu cez verejný formulár – čaká na schválenie administrátorom
create or replace function public.poslat_recenziu(p_makler uuid, p_meno text, p_hodnotenie int, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_meno), '') = '' then raise exception 'Napíšte svoje meno.'; end if;
  if p_hodnotenie is null or p_hodnotenie not between 1 and 5 then raise exception 'Vyberte počet hviezdičiek.'; end if;
  if length(coalesce(p_text, '')) > 2000 or length(p_meno) > 80 then raise exception 'Text je príliš dlhý.'; end if;
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler and aktivny) then raise exception 'Maklér neexistuje.'; end if;
  if (select count(*) from recenzie where stav = 'caka' and vytvorene > now() - interval '1 day') > 30 then
    raise exception 'Momentálne nie je možné pridať recenziu, skúste to neskôr.';
  end if;
  insert into recenzie (makler_id, meno, hodnotenie, text, zdroj, stav)
  values (p_makler, left(trim(p_meno), 80), p_hodnotenie, left(trim(coalesce(p_text, '')), 2000), 'web', 'caka');
end $$;

-- maklér zapíše skutočnú recenziu klienta (napr. z Google) – schvaľuje administrátor
create or replace function public.zapisat_recenziu(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _over_aktivny();
  if coalesce(trim(p->>'meno'), '') = '' then raise exception 'Zadajte meno klienta.'; end if;
  insert into recenzie (makler_id, meno, hodnotenie, text, zdroj, stav, zapisal, schvalil)
  values (coalesce(nullif(p->>'makler_id', '')::uuid, auth.uid()), left(trim(p->>'meno'), 80), (p->>'hodnotenie')::int,
          left(trim(coalesce(p->>'text', '')), 2000), coalesce(nullif(p->>'zdroj', ''), 'osobne'),
          case when ja_admin() then 'schvalena' else 'caka' end, auth.uid(), case when ja_admin() then auth.uid() end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.schvalit_recenziu(p_id bigint, p_stav text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_stav not in ('caka', 'schvalena', 'zamietnuta') then raise exception 'Neznámy stav.'; end if;
  update recenzie set stav = p_stav, schvalil = auth.uid() where id = p_id;
end $$;

create or replace function public.verejne_recenzie(p_makler uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'priemer', round(avg(hodnotenie)::numeric, 1), 'pocet', count(*),
    'zoznam', coalesce(jsonb_agg(jsonb_build_object('meno', meno, 'hodnotenie', hodnotenie, 'text', text, 'zdroj', zdroj, 'datum', vytvorene::date,
                                                     'makler', (select m.meno from makleri m where m.id = r.makler_id)) order by vytvorene desc), '[]'::jsonb))
  from recenzie r where stav = 'schvalena' and (p_makler is null or makler_id = p_makler)
$$;

revoke execute on function public.zapisat_recenziu(jsonb), public.schvalit_recenziu(bigint, text) from public, anon;
grant execute on function public.zapisat_recenziu(jsonb), public.schvalit_recenziu(bigint, text) to authenticated;
grant execute on function public.poslat_recenziu(uuid, text, int, text), public.verejne_recenzie(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- poloha inzerátov (realitná mapa)
alter table public.inzeraty add column if not exists lat double precision;
alter table public.inzeraty add column if not exists lon double precision;
alter table public.inzeraty add column if not exists ulica text;

create or replace function public.skener_ulozit(p_kluc text, p_inzeraty jsonb, p_odhady jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform _over_skener(p_kluc);
  insert into inzeraty (id, portal, portaly, url, nazov, typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, prvy_krat, naposledy, aktivny, duplikat_z,
    dalsie_odkazy, historia_cien, lat, lon, ulica)
  select id, portal, coalesce(portaly, '{}'), url, coalesce(nazov, ''), typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, coalesce(prvy_krat, now()), coalesce(naposledy, now()),
    coalesce(aktivny, true), duplikat_z, coalesce(dalsie_odkazy, '[]'), coalesce(historia_cien, '[]'), lat, lon, ulica
  from jsonb_populate_recordset(null::inzeraty, p_inzeraty)
  on conflict (id) do update set
    portal = excluded.portal, portaly = excluded.portaly, url = excluded.url, nazov = excluded.nazov,
    typ = excluded.typ, podtyp = excluded.podtyp, izby = excluded.izby, cena = excluded.cena,
    plocha = excluded.plocha, cena_m2 = excluded.cena_m2, obec = excluded.obec, okres = excluded.okres,
    predajca = excluded.predajca, predajca_typ = excluded.predajca_typ, predajca_dovod = excluded.predajca_dovod,
    foto = excluded.foto, popis = excluded.popis, publikovane = excluded.publikovane,
    prvy_krat = excluded.prvy_krat, naposledy = excluded.naposledy, aktivny = excluded.aktivny,
    duplikat_z = excluded.duplikat_z, dalsie_odkazy = excluded.dalsie_odkazy, historia_cien = excluded.historia_cien,
    lat = coalesce(excluded.lat, inzeraty.lat), lon = coalesce(excluded.lon, inzeraty.lon), ulica = coalesce(excluded.ulica, inzeraty.ulica);
  get diagnostics v = row_count;
  if p_odhady is not null then
    insert into odhady (inzerat_id, median, rozdiel_pct, skupina, n, jednotka, podhodnotene)
    select inzerat_id, median, rozdiel_pct, skupina, n, jednotka, coalesce(podhodnotene, false)
    from jsonb_populate_recordset(null::odhady, p_odhady)
    on conflict (inzerat_id) do update set median = excluded.median, rozdiel_pct = excluded.rozdiel_pct,
      skupina = excluded.skupina, n = excluded.n, jednotka = excluded.jednotka, podhodnotene = excluded.podhodnotene;
    update odhady set median = null, rozdiel_pct = null, skupina = null, n = null, jednotka = null, podhodnotene = false
    where inzerat_id in (select x->>'id' from jsonb_array_elements(p_inzeraty) x)
      and inzerat_id not in (select x->>'inzerat_id' from jsonb_array_elements(p_odhady) x);
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- štatistiky ponúk a odmeny RK (admin)
create or replace function public._odmena_rk(i nehnutelnosti_interne, n nehnutelnosti) returns numeric
language sql immutable as $$
  select case when i.provizia_rk is null then null
              when i.provizia_rk_typ = 'pct' then round(coalesce(n.cena, 0) * i.provizia_rk / 100)
              else i.provizia_rk end
$$;

create or replace function public.statistiky_ponuk(p_od timestamptz, p_do timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return coalesce((select jsonb_agg(r order by r.meno) from (
    select m.id, m.meno, m.aktivny,
      count(*) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'predaj') as aktivne_predaj,
      count(*) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'prenajom') as aktivne_prenajom,
      count(*) filter (where n.stav = 'rezervovane') as rezervovane,
      count(*) filter (where n.vytvorene >= p_od and n.vytvorene < p_do and n.stav <> 'koncept') as nove,
      count(*) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do and n.transakcia = 'predaj') as predane,
      count(*) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do and n.transakcia = 'prenajom') as prenajate,
      coalesce(sum(_odmena_rk(i, n)) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do), 0) as odmena_rk,
      coalesce(sum(_odmena_rk(i, n)) filter (where n.stav in ('aktivne', 'rezervovane')), 0) as odmena_potencial,
      coalesce(sum(n.cena) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'predaj'), 0) as objem_ponuky,
      (select count(*) from obhliadky o where o.makler_id = m.id and o.zrusena is null and o.cas >= p_od and o.cas < p_do) as obhliadky,
      (select round(avg(hodnotenie)::numeric, 1) from recenzie x where x.makler_id = m.id and x.stav = 'schvalena') as hodnotenie
    from makleri m
    left join nehnutelnosti n on n.makler_id = m.id
    left join nehnutelnosti_interne i on i.nehnutelnost_id = n.id
    group by m.id, m.meno, m.aktivny) r), '[]'::jsonb);
end $$;
revoke execute on function public.statistiky_ponuk(timestamptz, timestamptz) from public, anon;
grant execute on function public.statistiky_ponuk(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- nové sekcie v prístupoch
alter table public.makleri alter column pristup set default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat,kalendar,mapa,asistent,web,recenzie}';
update public.makleri set pristup = pristup || array(select x from unnest('{kalendar,mapa,asistent,web,recenzie}'::text[]) x where not x = any(pristup))
where not ('kalendar' = any(pristup) and 'mapa' = any(pristup) and 'asistent' = any(pristup) and 'web' = any(pristup) and 'recenzie' = any(pristup));

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'kalendar', 'mapa', 'asistent', 'web', 'recenzie')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

-- ---------------------------------------------------------------- verejný profil makléra (osobný web, recenzia)
create or replace function public.verejny_makler(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id, 'meno', m.meno, 'email', m.email, 'telefon', m.telefon, 'pohlavie', m.pohlavie,
    'foto', case when m.foto like 'data:%' then m.foto end)
  from makleri m where m.id = p_id and m.aktivny
$$;
grant execute on function public.verejny_makler(uuid) to anon, authenticated;

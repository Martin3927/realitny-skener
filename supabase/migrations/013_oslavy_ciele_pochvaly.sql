-- =====================================================================
-- Osobnejší soft 2: narodeniny, meniny, výročia, oslava úspechu,
-- mesačný cieľ, pochvala od šéfa, reakcie (emoji), obľúbené obce
-- =====================================================================
alter table public.makleri add column if not exists narodeniny date;
alter table public.makleri add column if not exists nastup date;
alter table public.makleri add column if not exists meniny_den text;      -- 'MM-DD', ak sa meno nenachádza v kalendári
alter table public.makleri add column if not exists obce text[] not null default '{}';
alter table public.makler_osobne add column if not exists ciel_hovory int;
alter table public.makler_osobne add column if not exists ciel_ziskane int;

-- systémové správy v chate (oslavy, úspechy); kluc zabráni duplicite
alter table public.spravy add column if not exists typ text not null default 'sprava';
alter table public.spravy add column if not exists kluc text;
create unique index if not exists spravy_kluc on public.spravy (kluc) where kluc is not null;

-- rod a oslovenie makléra (rovnaké pravidlo ako v aplikácii)
create or replace function public._rod(m makleri) returns text language sql immutable as $$
  select coalesce(m.pohlavie,
    case when m.foto = 'avatar:zena' then 'zena' when m.foto = 'avatar:muz' then 'muz'
         when lower(regexp_replace(trim(m.meno), '^.*\s', '')) ~ 'á$'
           or (position(' ' in trim(m.meno)) = 0 and lower(trim(m.meno)) ~ 'a$') then 'zena' else 'muz' end)
$$;
create or replace function public._osl(m makleri) returns text language sql immutable as $$
  select coalesce(nullif(m.oslovenie, ''), nullif(split_part(trim(m.meno), ' ', 1), ''), m.email)
$$;
create or replace function public._roky(n int) returns text language sql immutable as $$
  select n || case when n = 1 then ' rok' when n between 2 and 4 then ' roky' else ' rokov' end
$$;

-- dnešné oslavy (narodeniny, meniny, výročie nástupu) – zoznam
create or replace function public._oslavy_zoznam() returns table (makler_id uuid, typ text, roky int)
language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Europe/Bratislava')::date as dnes),
  k as (select to_char(dnes, 'MM-DD') as md,
               -- 29. 2. v neprestupnom roku oslávime 28. 2.
               (extract(month from dnes) = 2 and extract(day from dnes) = 28
                and not (extract(year from dnes)::int % 4 = 0 and (extract(year from dnes)::int % 100 <> 0 or extract(year from dnes)::int % 400 = 0))) as aj29,
               dnes from d)
  select m.id, 'narodeniny', null::int from makleri m, k
    where m.aktivny and m.narodeniny is not null
      and (to_char(m.narodeniny, 'MM-DD') = k.md or (k.aj29 and to_char(m.narodeniny, 'MM-DD') = '02-29'))
  union all
  select m.id, 'meniny', null from makleri m, k
    where m.aktivny and (m.meniny_den = k.md or (m.meniny_den is null and exists (
      select 1 from meniny x where x.den = k.md and lower(split_part(trim(m.meno), ' ', 1)) = any (select lower(unnest(x.mena))))))
  union all
  select m.id, 'vyrocie', (extract(year from k.dnes) - extract(year from m.nastup))::int from makleri m, k
    where m.aktivny and m.nastup is not null and to_char(m.nastup, 'MM-DD') = k.md and m.nastup < k.dnes
$$;

-- zapíše oslavy do chatu (raz za deň pre každú oslavu)
create or replace function public._oslavy_dnes() returns void
language plpgsql security definer set search_path = public as $$
declare r record; m makleri; t text; dnes text := to_char(now() at time zone 'Europe/Bratislava', 'YYYY-MM-DD');
begin
  for r in select * from _oslavy_zoznam() loop
    select * into m from makleri where id = r.makler_id;
    t := case r.typ
      when 'narodeniny' then '🎂 Dnes má narodeniny ' || _osl(m) || '! Všetko najlepšie, veľa zdravia a úspešných obchodov 🎉'
      when 'meniny' then '🌷 Dnes má meniny ' || _osl(m) || ' – blahoželáme a prajeme krásny deň! 💐'
      else '🏆 ' || _osl(m) || ' je dnes s nami už ' || _roky(r.roky) || '. Ďakujeme, že si súčasťou tímu! 🙌' end;
    insert into spravy (makler_id, text, typ, kluc) values (null, t, 'oslava', r.typ || ':' || r.makler_id || ':' || dnes)
    on conflict do nothing;
  end loop;
end $$;

create or replace function public.oslavy_dnes() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  perform _oslavy_dnes();
  return coalesce((select jsonb_agg(jsonb_build_object('makler_id', makler_id, 'typ', typ, 'roky', roky)) from _oslavy_zoznam()), '[]'::jsonb);
end $$;

-- plánovač: ráno o 7:00 slovenského času
create or replace function public._oslavy_cron() returns void
language plpgsql security definer set search_path = public as $$
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 7 then return; end if;
  perform _oslavy_dnes();
end $$;

-- oslava úspechu: „Získaný do ponuky“ → správa v chate
create or replace function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text) returns void
language plpgsql security definer set search_path = public as $$
declare m makleri; z inzeraty; v_nehn text;
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
  if p_vysledok = 'Získaný do ponuky' then
    select * into m from makleri where id = auth.uid();
    select * into z from inzeraty where id = p_inzerat;
    v_nehn := case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom' when 'pozemok' then 'pozemok'
                         when 'chata' then 'chatu' when 'garaz' then 'garáž' else 'nehnuteľnosť' end;
    insert into spravy (makler_id, text, typ, kluc)
    values (null, '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end || ' do ponuky ' || v_nehn ||
                  coalesce(', ' || nullif(z.obec, ''), '') || '! Gratulujeme 👏', 'uspech', 'uspech:' || p_inzerat || ':' || auth.uid())
    on conflict do nothing;
  end if;
end $$;

-- osobné údaje makléra (admin)
create or replace function public.upravit_profil_maklera(p_id uuid, p_oslovenie text, p_motivacia text, p_narodeniny date,
  p_nastup date, p_meniny text, p_ciel_hovory int, p_ciel_ziskane int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_meniny is not null and p_meniny !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'Meniny zadajte ako deň a mesiac.'; end if;
  perform upravit_osobne(p_id, p_oslovenie, p_motivacia);
  update makleri set narodeniny = p_narodeniny, nastup = p_nastup, meniny_den = p_meniny where id = p_id;
  update makler_osobne set ciel_hovory = nullif(greatest(coalesce(p_ciel_hovory, 0), 0), 0),
    ciel_ziskane = nullif(greatest(coalesce(p_ciel_ziskane, 0), 0), 0) where makler_id = p_id;
end $$;

-- môj mesiac: plnenie cieľa
create or replace function public.moj_mesiac() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_od timestamptz := date_trunc('month', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava';
begin
  perform _over_aktivny();
  return jsonb_build_object(
    'hovory', (select count(*) from aktivity where makler_id = auth.uid() and typ = 'hovor' and vytvorene >= v_od),
    'ziskane', (select count(*) from aktivity where makler_id = auth.uid() and typ = 'hovor' and vysledok = 'Získaný do ponuky' and vytvorene >= v_od),
    'ciel_hovory', (select ciel_hovory from makler_osobne where makler_id = auth.uid()),
    'ciel_ziskane', (select ciel_ziskane from makler_osobne where makler_id = auth.uid()));
end $$;

-- obľúbené obce makléra
create or replace function public.ulozit_moje_obce(p_obce text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if cardinality(coalesce(p_obce, '{}')) > 30 then raise exception 'Najviac 30 obcí.'; end if;
  update makleri set obce = coalesce(p_obce, '{}') where id = auth.uid();
end $$;

-- pochvala od šéfa
create table if not exists public.pochvaly (
  id bigint generated always as identity primary key,
  komu uuid not null references public.makleri(id) on delete cascade,
  od uuid references public.makleri(id) on delete set null,
  text text not null,
  vytvorene timestamptz not null default now(),
  videne timestamptz
);
alter table public.pochvaly enable row level security;
do $$ begin
  create policy pochvaly_citat on public.pochvaly for select to authenticated
    using (ja_aktivny() and (komu = auth.uid() or od = auth.uid() or ja_admin()));
exception when duplicate_object then null; end $$;
revoke all on public.pochvaly from anon, authenticated;
grant select on public.pochvaly to authenticated;

create or replace function public.pochvalit(p_komu uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, ''));
begin
  perform _over_admin();
  if v = '' then raise exception 'Napíšte pochvalu.'; end if;
  if length(v) > 500 then raise exception 'Pochvala je príliš dlhá.'; end if;
  insert into pochvaly (komu, od, text) values (p_komu, auth.uid(), v);
end $$;

create or replace function public.pochvala_videna(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update pochvaly set videne = coalesce(videne, now()) where id = p_id and komu = auth.uid();
end $$;

-- reakcie (emoji) na odkaz pre všetkých a na motivačné vety
create table if not exists public.reakcie (
  ciel text not null,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  emoji text not null,
  aktivna boolean not null default true,
  vytvorene timestamptz not null default now(),
  primary key (ciel, makler_id, emoji)
);
alter table public.reakcie enable row level security;
do $$ begin
  create policy reakcie_citat on public.reakcie for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
revoke all on public.reakcie from anon, authenticated;
grant select on public.reakcie to authenticated;

-- prepne reakciu (zapnúť / vypnúť); vráti true, ak je reakcia zapnutá
create or replace function public.reagovat(p_ciel text, p_emoji text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  perform _over_aktivny();
  if p_emoji not in ('👍', '😂', '😢', '💣', '🔥', '🖐️') then raise exception 'Neznáma reakcia.'; end if;
  if p_ciel !~ '^(odkaz|veta):[A-Za-z0-9:_-]{1,120}$' then raise exception 'Neplatný cieľ.'; end if;
  insert into reakcie (ciel, makler_id, emoji) values (p_ciel, auth.uid(), p_emoji)
  on conflict (ciel, makler_id, emoji) do update set aktivna = not reakcie.aktivna, vytvorene = now()
  returning aktivna into v;
  return v;
end $$;

revoke execute on function public._rod(makleri), public._osl(makleri), public._roky(int), public._oslavy_zoznam(), public._oslavy_dnes(),
  public._oslavy_cron(), public.oslavy_dnes(), public.upravit_profil_maklera(uuid, text, text, date, date, text, int, int),
  public.moj_mesiac(), public.ulozit_moje_obce(text[]), public.pochvalit(uuid, text), public.pochvala_videna(bigint),
  public.reagovat(text, text) from public, anon, authenticated;
grant execute on function public.oslavy_dnes(), public.upravit_profil_maklera(uuid, text, text, date, date, text, int, int),
  public.moj_mesiac(), public.ulozit_moje_obce(text[]), public.pochvalit(uuid, text), public.pochvala_videna(bigint),
  public.reagovat(text, text), public.zapisat_hovor(text, text, text) to authenticated;

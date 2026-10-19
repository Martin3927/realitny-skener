-- =====================================================================
-- Schránkovanie po sídliskách: rezervácia (celé alebo polovica), dátum schránkovania,
-- 2 mesiace obsadené (vidia všetci), kontakty zo schránkovania priradené k akcii.
-- Skener: prevzatý inzerát sa uvoľní po 24 hodinách bez zápisu (predtým 48).
-- =====================================================================

create table if not exists public.sidliska (
  id bigint generated always as identity primary key,
  mesto text not null,
  nazov text not null,
  poradie int not null default 0,
  aktivne boolean not null default true,
  unique (mesto, nazov)
);
insert into public.sidliska (mesto, nazov, poradie) values
  ('Spišská Nová Ves', 'Centrum', 1), ('Spišská Nová Ves', 'Východ', 2), ('Spišská Nová Ves', 'Tarča', 3),
  ('Spišská Nová Ves', 'Mier', 4), ('Spišská Nová Ves', 'Západ', 5),
  ('Smižany', 'Západ', 1), ('Smižany', 'Nízke bytovky', 2),
  ('Levoča', 'Západ I', 1), ('Levoča', 'Západ II', 2), ('Levoča', 'Pri prameni', 3), ('Levoča', 'Rozvoj', 4), ('Levoča', 'Pod vinicou', 5)
on conflict (mesto, nazov) do nothing;

create table if not exists public.schrankovanie_akcie (
  id bigint generated always as identity primary key,
  sidlisko_id bigint not null references public.sidliska(id) on delete cascade,
  polovica text not null default 'cele' check (polovica in ('cele', '1', '2')),   -- celé sídlisko alebo 1. / 2. polovica
  makler_id uuid references public.makleri(id) on delete set null,
  rezervovane timestamptz not null default now(),
  datum date,                                   -- kedy maklér schránkoval (zapisuje sám)
  poznamka text,                                -- napr. ktoré ulice / vchody
  zrusene timestamptz,
  zrusil uuid references public.makleri(id) on delete set null
);
create index if not exists schr_akcie_sidlisko on public.schrankovanie_akcie (sidlisko_id) where zrusene is null;
alter table public.schrankovanie add column if not exists akcia_id bigint references public.schrankovanie_akcie(id) on delete set null;

alter table public.sidliska enable row level security;
alter table public.schrankovanie_akcie enable row level security;
do $$ begin
  create policy sidliska_citat on public.sidliska for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy schr_akcie_citat on public.schrankovanie_akcie for select to authenticated using (ja_aktivny() and zrusene is null);
exception when duplicate_object then null; end $$;
revoke all on public.sidliska, public.schrankovanie_akcie from anon, authenticated;
grant select on public.sidliska, public.schrankovanie_akcie to authenticated;

-- rezervácia platí 7 dní; po zapísaní dátumu je časť obsadená 2 mesiace od dátumu schránkovania
create or replace function public._akcia_blokuje(a schrankovanie_akcie) returns boolean
language sql stable as $$
  select a.zrusene is null and (
    (a.datum is null and a.rezervovane > now() - interval '7 days') or
    (a.datum is not null and a.datum > (current_date - interval '2 months')::date))
$$;

create or replace function public.rezervovat_sidlisko(p_sidlisko bigint, p_polovica text, p_datum date, p_poznamka text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; k schrankovanie_akcie;
begin
  perform _over_aktivny();
  if p_polovica not in ('cele', '1', '2') then raise exception 'Vyberte celé sídlisko alebo polovicu.'; end if;
  if not exists (select 1 from sidliska where id = p_sidlisko and aktivne) then raise exception 'Sídlisko neexistuje.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  select * into k from schrankovanie_akcie a
  where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a) and (a.polovica = 'cele' or p_polovica = 'cele' or a.polovica = p_polovica)
  order by a.rezervovane desc limit 1;
  if found then
    if k.datum is null then
      raise exception 'Už rezervované: % (od %).', coalesce(_meno(k.makler_id), 'iný maklér'), to_char(k.rezervovane, 'DD.MM.YYYY');
    end if;
    raise exception 'Obsadené: % % %, voľné bude od %.', coalesce(_meno(k.makler_id), 'iný maklér'),
      case when (select pohlavie from makleri where id = k.makler_id) = 'zena' then 'schránkovala' else 'schránkoval' end,
      to_char(k.datum, 'DD.MM.YYYY'), to_char(k.datum + interval '2 months', 'DD.MM.YYYY');
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, datum, poznamka)
  values (p_sidlisko, p_polovica, auth.uid(), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.zapisat_datum_schrankovania(p_id bigint, p_datum date, p_poznamka text) returns void
language plpgsql security definer set search_path = public as $$
declare a schrankovanie_akcie;
begin
  perform _over_aktivny();
  select * into a from schrankovanie_akcie where id = p_id and zrusene is null for update;
  if not found then raise exception 'Rezervácia neexistuje.'; end if;
  if a.makler_id is distinct from auth.uid() and not ja_admin() then raise exception 'Dátum zapisuje maklér, ktorý schránkoval, alebo administrátor.'; end if;
  if p_datum is null then raise exception 'Zadajte dátum schránkovania.'; end if;
  if p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  update schrankovanie_akcie set datum = p_datum, poznamka = coalesce(nullif(trim(p_poznamka), ''), poznamka) where id = p_id;
end $$;

create or replace function public.zrusit_akciu_schrankovania(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a schrankovanie_akcie;
begin
  perform _over_aktivny();
  select * into a from schrankovanie_akcie where id = p_id and zrusene is null for update;
  if not found then raise exception 'Rezervácia neexistuje.'; end if;
  if a.makler_id is distinct from auth.uid() and not ja_admin() then raise exception 'Zrušiť môže len maklér, ktorý rezervoval, alebo administrátor.'; end if;
  update schrankovanie_akcie set zrusene = now(), zrusil = auth.uid() where id = p_id;
end $$;

-- kontakt zo schránkovania priradiť k akcii (sídlisko + dátum)
create or replace function public.priradit_kontakt_akcii(p_zaznam bigint, p_akcia bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_m uuid; a schrankovanie_akcie;
begin
  perform _over_aktivny();
  select makler_id into v_m from schrankovanie where id = p_zaznam and zmazane is null;
  if not found then raise exception 'Záznam neexistuje.'; end if;
  if v_m is distinct from auth.uid() and not ja_admin() then raise exception 'Upraviť môže len maklér záznamu alebo administrátor.'; end if;
  if p_akcia is not null then
    select * into a from schrankovanie_akcie where id = p_akcia and zrusene is null;
    if not found then raise exception 'Schránkovanie neexistuje.'; end if;
  end if;
  update schrankovanie set akcia_id = p_akcia where id = p_zaznam;
end $$;

-- administrátor: pridať / premenovať / skryť sídlisko
create or replace function public.ulozit_sidlisko(p_id bigint, p_mesto text, p_nazov text, p_aktivne boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _over_admin();
  if coalesce(trim(p_mesto), '') = '' or coalesce(trim(p_nazov), '') = '' then raise exception 'Zadajte obec aj názov sídliska.'; end if;
  if p_id is null then
    insert into sidliska (mesto, nazov, poradie)
    values (trim(p_mesto), trim(p_nazov), coalesce((select max(poradie) + 1 from sidliska where mesto = trim(p_mesto)), 1))
    returning id into v_id;
    return v_id;
  end if;
  update sidliska set mesto = trim(p_mesto), nazov = trim(p_nazov), aktivne = coalesce(p_aktivne, aktivne) where id = p_id;
  return p_id;
end $$;

revoke execute on function public._akcia_blokuje(schrankovanie_akcie) from public, anon;
revoke execute on function public.rezervovat_sidlisko(bigint, text, date, text), public.zapisat_datum_schrankovania(bigint, date, text),
  public.zrusit_akciu_schrankovania(bigint), public.priradit_kontakt_akcii(bigint, bigint), public.ulozit_sidlisko(bigint, text, text, boolean)
  from public, anon;
grant execute on function public.rezervovat_sidlisko(bigint, text, date, text), public.zapisat_datum_schrankovania(bigint, date, text),
  public.zrusit_akciu_schrankovania(bigint), public.priradit_kontakt_akcii(bigint, bigint), public.ulozit_sidlisko(bigint, text, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------- skener: uvoľnenie po 24 hodinách
create or replace function public.auto_uvolnit() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.inzerat_id, p.makler_id, i.nazov
    from prevzatia p join inzeraty i on i.id = p.inzerat_id
    where p.makler_id is not null
      and p.upravene < now() - interval '24 hours'
      and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
      and not exists (select 1 from pripomienky x
                      where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                        and x.hotovo is null and x.zrusena is null and x.cas > now())
    for update of p skip locked
  loop
    update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = r.inzerat_id;
    insert into aktivity (inzerat_id, makler_id, typ, poznamka)
      values (r.inzerat_id, r.makler_id, 'uvolnenie', 'automaticky – 24 hodín bez zápisu');
    insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh)
      values (r.makler_id, r.inzerat_id, now(),
              'Inzerát sa automaticky uvoľnil – 24 hodín ste pri ňom nič nezapísali: ' || left(r.nazov, 90) ||
              '. Ak ho chcete, prevezmite si ho znova.', 'uvolnenie');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.auto_uvolnit() from public, anon, authenticated;
select cron.schedule('auto-uvolnenie', '*/5 * * * *', 'select public.auto_uvolnit()');

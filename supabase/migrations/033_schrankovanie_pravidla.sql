-- =====================================================================
-- Schránkovanie – pravidlá a verejné poznámky
--  * maklér si môže rezervovať len 1 sídlisko za kalendárny týždeň (po – ne)
--    (nepočíta sa rezervácia, ktorú zrušil administrátor, ani vlastná zrušená do 30 minút)
--  * keď rezervácia prepadne (7 dní bez zapísaného dátumu), ten istý maklér si dané
--    sídlisko nemôže rezervovať ďalšie 2 týždne – pre ostatných je voľné
--  * administrátor pravidlá nemá, môže zrušiť akúkoľvek rezerváciu aj blokáciu
--  * verejné poznámky k sídlisku (vidia všetci makléri)
-- =====================================================================

-- maklér vidí aj svoje zrušené rezervácie (kvôli týždennému limitu v aplikácii)
drop policy if exists schr_akcie_citat on public.schrankovanie_akcie;
create policy schr_akcie_citat on public.schrankovanie_akcie for select to authenticated
  using (ja_aktivny() and (zrusene is null or makler_id = auth.uid()));

-- začiatok aktuálneho týždňa (pondelok 0:00 slovenského času)
create or replace function public._zaciatok_tyzdna() returns timestamptz
language sql stable as $$
  select date_trunc('week', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava'
$$;

-- rezervácia sa počíta do týždenného limitu
create or replace function public._akcia_pocita(a schrankovanie_akcie) returns boolean
language sql stable as $$
  select a.zrusene is null
      or (a.zrusil = a.makler_id and a.zrusene > a.rezervovane + interval '30 minutes')
$$;

-- prepadnutá rezervácia (nestihol zapísať dátum do 7 dní) → blokácia pre toho maklera do
create or replace function public._blokacia_do(a schrankovanie_akcie) returns timestamptz
language sql stable as $$
  select case when a.zrusene is null and a.datum is null and a.rezervovane <= now() - interval '7 days'
              and a.rezervovane + interval '21 days' > now()
         then a.rezervovane + interval '21 days' end
$$;

create or replace function public.rezervovat_sidlisko(p_sidlisko bigint, p_polovica text, p_datum date, p_poznamka text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; k schrankovanie_akcie; v_do timestamptz; v_admin boolean := ja_admin();
begin
  perform _over_aktivny();
  if not exists (select 1 from sidliska where id = p_sidlisko and aktivne) then raise exception 'Sídlisko neexistuje.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  perform pg_advisory_xact_lock(hashtext('sch-makler:' || auth.uid()));
  select * into k from schrankovanie_akcie a
  where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a)
  order by a.rezervovane desc limit 1;
  if found then
    if k.datum is null then
      raise exception 'Už rezervované: % (od %).', coalesce(_meno(k.makler_id), 'iný maklér'), to_char(k.rezervovane, 'DD.MM.YYYY');
    end if;
    raise exception 'Obsadené: % % %, voľné bude od %.', coalesce(_meno(k.makler_id), 'iný maklér'),
      case when (select pohlavie from makleri where id = k.makler_id) = 'zena' then 'schránkovala' else 'schránkoval' end,
      to_char(k.datum, 'DD.MM.YYYY'), to_char(k.datum + interval '2 months', 'DD.MM.YYYY');
  end if;
  if not v_admin then
    select max(_blokacia_do(a)) into v_do from schrankovanie_akcie a
    where a.sidlisko_id = p_sidlisko and a.makler_id = auth.uid();
    if v_do is not null then
      raise exception 'Toto sídlisko ste nestihli vyschránkovať. Znova si ho môžete rezervovať od %. Pre ostatných maklérov je voľné.',
        to_char(v_do at time zone 'Europe/Bratislava', 'DD.MM.YYYY');
    end if;
    select * into k from schrankovanie_akcie a
    where a.makler_id = auth.uid() and a.rezervovane >= _zaciatok_tyzdna() and _akcia_pocita(a)
    order by a.rezervovane desc limit 1;
    if found then
      raise exception 'Tento týždeň už máte rezervované sídlisko %. Ďalšie si môžete rezervovať od pondelka %.',
        (select nazov || ' (' || mesto || ')' from sidliska where id = k.sidlisko_id),
        to_char((date_trunc('week', now() at time zone 'Europe/Bratislava') + interval '7 days')::date, 'DD.MM.YYYY');
    end if;
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, datum, poznamka)
  values (p_sidlisko, 'cele', auth.uid(), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $$;

-- dátum sa dá zapísať len do platnej rezervácie (prepadnutú môže doplniť administrátor)
create or replace function public.zapisat_datum_schrankovania(p_id bigint, p_datum date, p_poznamka text) returns void
language plpgsql security definer set search_path = public as $$
declare a schrankovanie_akcie;
begin
  perform _over_aktivny();
  select * into a from schrankovanie_akcie where id = p_id and zrusene is null for update;
  if not found then raise exception 'Rezervácia neexistuje.'; end if;
  if a.makler_id is distinct from auth.uid() and not ja_admin() then raise exception 'Dátum zapisuje maklér, ktorý schránkoval, alebo administrátor.'; end if;
  if a.datum is null and not _akcia_blokuje(a) and not ja_admin() then
    raise exception 'Rezervácia už prepadla (7 dní bez zapísaného dátumu). Ak ste schránkovali, napíšte administrátorovi.';
  end if;
  if p_datum is null then raise exception 'Zadajte dátum schránkovania.'; end if;
  if p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  update schrankovanie_akcie set datum = p_datum, poznamka = coalesce(nullif(trim(p_poznamka), ''), poznamka) where id = p_id;
end $$;

-- zrušenie: vlastnú rezerváciu zruší maklér, čokoľvek (aj blokáciu po prepadnutí) administrátor
create or replace function public.zrusit_akciu_schrankovania(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a schrankovanie_akcie;
begin
  perform _over_aktivny();
  select * into a from schrankovanie_akcie where id = p_id and zrusene is null for update;
  if not found then raise exception 'Rezervácia neexistuje.'; end if;
  if not ja_admin() then
    if a.makler_id is distinct from auth.uid() then raise exception 'Zrušiť môže len maklér, ktorý rezervoval, alebo administrátor.'; end if;
    if not _akcia_blokuje(a) then raise exception 'Rezervácia už prepadla. Blokáciu môže zrušiť len administrátor.'; end if;
  end if;
  update schrankovanie_akcie set zrusene = now(), zrusil = auth.uid() where id = p_id;
end $$;

-- ---------------------------------------------------------------- verejné poznámky k sídliskám
create table if not exists public.sidliska_poznamky (
  id bigint generated always as identity primary key,
  sidlisko_id bigint not null references public.sidliska(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete set null,
  text text not null check (length(trim(text)) between 1 and 1000),
  vytvorene timestamptz not null default now(),
  zmazane timestamptz
);
create index if not exists sid_pozn_sidlisko on public.sidliska_poznamky (sidlisko_id) where zmazane is null;
alter table public.sidliska_poznamky enable row level security;
drop policy if exists sid_pozn_citat on public.sidliska_poznamky;
create policy sid_pozn_citat on public.sidliska_poznamky for select to authenticated using (ja_aktivny() and zmazane is null);
revoke all on public.sidliska_poznamky from anon, authenticated;
grant select on public.sidliska_poznamky to authenticated;

create or replace function public.pridat_poznamku_sidliska(p_sidlisko bigint, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _over_aktivny();
  if coalesce(trim(p_text), '') = '' then raise exception 'Napíšte text poznámky.'; end if;
  if length(trim(p_text)) > 1000 then raise exception 'Poznámka môže mať najviac 1000 znakov.'; end if;
  if not exists (select 1 from sidliska where id = p_sidlisko) then raise exception 'Sídlisko neexistuje.'; end if;
  insert into sidliska_poznamky (sidlisko_id, makler_id, text) values (p_sidlisko, auth.uid(), trim(p_text)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.zmazat_poznamku_sidliska(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_m uuid;
begin
  perform _over_aktivny();
  select makler_id into v_m from sidliska_poznamky where id = p_id and zmazane is null;
  if not found then raise exception 'Poznámka neexistuje.'; end if;
  if v_m is distinct from auth.uid() and not ja_admin() then raise exception 'Zmazať môže len autor poznámky alebo administrátor.'; end if;
  update sidliska_poznamky set zmazane = now() where id = p_id;
end $$;

revoke execute on function public._zaciatok_tyzdna(), public._akcia_pocita(schrankovanie_akcie), public._blokacia_do(schrankovanie_akcie) from public, anon;
revoke execute on function public.pridat_poznamku_sidliska(bigint, text), public.zmazat_poznamku_sidliska(bigint) from public, anon;
grant execute on function public.pridat_poznamku_sidliska(bigint, text), public.zmazat_poznamku_sidliska(bigint) to authenticated;

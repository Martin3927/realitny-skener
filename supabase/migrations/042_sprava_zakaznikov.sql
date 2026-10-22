-- =====================================================================
-- Správa zákazníkov Realitného týpka (hlavný správca)
-- Evidencia kancelárií a samostatných maklérov, ktorí si objednali softvér:
-- čo majú objednané, skúšobná doba, do kedy majú zaplatené, platby, poznámky.
-- Vidí a upravuje to IBA hlavný správca (nie administrátor Alpha Reality ako taký).
-- =====================================================================

-- ---------------------------------------------------------------- hlavní správcovia
create table if not exists public.hlavni_spravcovia (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vytvorene timestamptz not null default now()
);
alter table public.hlavni_spravcovia enable row level security;
revoke all on public.hlavni_spravcovia from anon, authenticated;

insert into public.hlavni_spravcovia (user_id)
select id from auth.users where lower(email) = 'augustinak@alphareality.sk'
on conflict do nothing;

create or replace function public.je_hlavny_spravca()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hlavni_spravcovia where user_id = auth.uid());
$$;
revoke all on function public.je_hlavny_spravca() from public, anon;
grant execute on function public.je_hlavny_spravca() to authenticated;

-- ---------------------------------------------------------------- zákazníci
create table if not exists public.zakaznici (
  id bigint generated always as identity primary key,
  typ text not null default 'kancelaria' check (typ in ('kancelaria', 'makler')),
  nazov text not null,
  ico text, dic text, ic_dph text,
  adresa text,
  kontakt_meno text, telefon text, email text, web text,
  stav text not null default 'zaujemca' check (stav in ('zaujemca', 'skusobna', 'aktivny', 'pozastaveny', 'zruseny')),
  moduly text[] not null default '{}',           -- skener, web, kancelaria, ponuky, klienti_aml, dokumenty, emailing, ai, pracovny_email
  okresy text[] not null default '{}',           -- okresy pre skener
  pocet_maklerov int not null default 1 check (pocet_maklerov >= 0),
  skusobna_od date,
  skusobna_do date,
  zaplatene_do date,
  platba_obdobie text not null default 'mesacne' check (platba_obdobie in ('mesacne', 'rocne')),
  mesacna_cena numeric(10,2),                    -- s DPH
  cena_zamrazena_do date,                        -- prví zákazníci: 3 roky
  zdroj text,                                    -- odkiaľ prišiel (odporúčanie, web, telefonát…)
  poznamky text,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists zakaznici_stav on public.zakaznici (stav);

create table if not exists public.zakaznici_platby (
  id bigint generated always as identity primary key,
  zakaznik_id bigint not null references public.zakaznici(id) on delete cascade,
  datum date not null default current_date,
  suma numeric(10,2) not null check (suma <> 0),
  obdobie_od date,
  obdobie_do date,
  za_co text,
  cislo_faktury text,
  poznamka text,
  zapisal uuid default auth.uid(),
  vytvorene timestamptz not null default now(),
  check (obdobie_do is null or obdobie_od is null or obdobie_do >= obdobie_od)
);
create index if not exists zakaznici_platby_zak on public.zakaznici_platby (zakaznik_id, datum desc);

-- čas poslednej úpravy
create or replace function public.zakaznici_upravene() returns trigger language plpgsql as $$
begin new.upravene := now(); return new; end $$;
drop trigger if exists zakaznici_upravene on public.zakaznici;
create trigger zakaznici_upravene before update on public.zakaznici
  for each row execute function public.zakaznici_upravene();

-- zapísaná platba posunie „zaplatené do“ a zo skúšobnej doby urobí platiaceho zákazníka
create or replace function public.zakaznici_po_platbe() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.zakaznici z set
      zaplatene_do = case when new.obdobie_do is null then z.zaplatene_do else greatest(coalesce(z.zaplatene_do, new.obdobie_do), new.obdobie_do) end,
      stav = case when z.stav in ('zaujemca', 'skusobna', 'pozastaveny') and new.suma > 0 then 'aktivny' else z.stav end
    where z.id = new.zakaznik_id;
    return new;
  end if;
  -- zmazaná platba: ak práve ona určovala „zaplatené do“, vráti sa na poslednú zostávajúcu
  if old.obdobie_do is not null then
    update public.zakaznici z set
      zaplatene_do = (select max(p.obdobie_do) from public.zakaznici_platby p where p.zakaznik_id = z.id)
    where z.id = old.zakaznik_id and z.zaplatene_do = old.obdobie_do;
  end if;
  return old;
end $$;
drop trigger if exists zakaznici_po_platbe on public.zakaznici_platby;
create trigger zakaznici_po_platbe after insert or delete on public.zakaznici_platby
  for each row execute function public.zakaznici_po_platbe();

-- ---------------------------------------------------------------- práva: iba hlavný správca
alter table public.zakaznici enable row level security;
alter table public.zakaznici_platby enable row level security;
revoke all on public.zakaznici, public.zakaznici_platby from anon;
grant select, insert, update, delete on public.zakaznici, public.zakaznici_platby to authenticated;

drop policy if exists zakaznici_spravca on public.zakaznici;
create policy zakaznici_spravca on public.zakaznici for all to authenticated
  using (public.je_hlavny_spravca()) with check (public.je_hlavny_spravca());

drop policy if exists zakaznici_platby_spravca on public.zakaznici_platby;
create policy zakaznici_platby_spravca on public.zakaznici_platby for all to authenticated
  using (public.je_hlavny_spravca()) with check (public.je_hlavny_spravca());

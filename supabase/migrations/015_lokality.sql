-- =====================================================================
-- Kraje, okresy, obce a mestské časti Slovenska
-- Údaje: supabase/seed/lokality.sql (zdroj Wikidata, doplnené ručne:
-- Bratislava, Košice, Bojnice, Dudince, Sklené Teplice a mestské časti BA a KE).
-- Overené počty obcí podľa krajov (BA 73, TT 251, TN 276, NR 354, ZA 315, BB 516, PO 664*, KE 440).
-- * oficiálne 665 – jednu obec Wikidata nemá správne označenú; formulár dovolí zadať aj inú obec.
-- =====================================================================
create table if not exists public.lokality (
  id serial primary key,
  typ text not null default 'obec' check (typ in ('obec', 'cast')),
  nazov text not null,
  okres text not null,
  kraj text not null,
  psc text,
  lat double precision,
  lon double precision,
  mesto boolean not null default false,
  nadradena text,
  unique (typ, nazov, okres)
);
create index if not exists lokality_nazov on public.lokality (lower(nazov));
alter table public.lokality enable row level security;
do $$ begin
  create policy lokality_citat on public.lokality for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
revoke all on public.lokality from anon, authenticated;
grant select on public.lokality to anon, authenticated;

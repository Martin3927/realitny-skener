-- =====================================================================
-- 139: Tvoje poznámky – súkromný zoznam úloh každého používateľa
--  * každý vidí a mení len svoje poznámky (ani administrátor nevidí cudzie)
--  * poznámka: text, podrobnosti, skupina, termín, dôležité, hotovo (kedy)
--  * najviac 2 000 poznámok na používateľa
-- (číslo 139: 137 a 138 sú rezervované pre vetvu mimo-nadvazne)
-- =====================================================================
create table if not exists public.poznamky (
  id bigint generated always as identity primary key,
  makler_id uuid not null default auth.uid() references public.makleri(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 500),
  detail text check (detail is null or length(detail) <= 4000),
  skupina text check (skupina is null or length(skupina) <= 60),
  termin date,
  dolezite boolean not null default false,
  hotovo boolean not null default false,
  hotovo_kedy timestamptz,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists poznamky_makler on public.poznamky (makler_id, hotovo, vytvorene desc);
alter table public.poznamky enable row level security;
drop policy if exists poznamky_citanie on public.poznamky;
create policy poznamky_citanie on public.poznamky for select to authenticated using (makler_id = (select auth.uid()));
drop policy if exists poznamky_zapis on public.poznamky;
create policy poznamky_zapis on public.poznamky for insert to authenticated with check ((select public.ja_aktivny()) and makler_id = (select auth.uid()));
drop policy if exists poznamky_uprava on public.poznamky;
create policy poznamky_uprava on public.poznamky for update to authenticated using (makler_id = (select auth.uid())) with check ((select public.ja_aktivny()) and makler_id = (select auth.uid()));
drop policy if exists poznamky_mazanie on public.poznamky;
create policy poznamky_mazanie on public.poznamky for delete to authenticated using (makler_id = (select auth.uid()));
revoke all on public.poznamky from anon;
grant select, insert, update, delete on public.poznamky to authenticated;

-- čas úpravy a odklikania „hotovo“ si databáza zapíše sama; vlastníka poznámky nemožno zmeniť
create or replace function public._poznamky_pred() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from poznamky where makler_id = new.makler_id) >= 2000 then
      raise exception 'Poznámok je priveľa (najviac 2 000) – zmaž staré hotové.' using errcode = 'P0001';
    end if;
    new.vytvorene := now();
  else
    new.makler_id := old.makler_id;
    new.vytvorene := old.vytvorene;
  end if;
  new.text := btrim(new.text);
  new.skupina := nullif(btrim(coalesce(new.skupina, '')), '');
  new.detail := nullif(btrim(coalesce(new.detail, '')), '');
  if new.hotovo and (tg_op = 'INSERT' or not old.hotovo) then new.hotovo_kedy := now(); end if;
  if not new.hotovo then new.hotovo_kedy := null; end if;
  new.upravene := now();
  return new;
end $$;
revoke execute on function public._poznamky_pred() from public, anon, authenticated;
drop trigger if exists poznamky_pred on public.poznamky;
create trigger poznamky_pred before insert or update on public.poznamky for each row execute function public._poznamky_pred();

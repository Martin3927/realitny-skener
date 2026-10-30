-- =====================================================================
-- 084: História AI asistenta – rozhovory sa ukladajú samy a dá sa v nich pokračovať
--  * ai_rozhovory: správy rozhovoru (otázky a odpovede), názov podľa prvej otázky, pripojená ponuka
--  * každý maklér vidí len svoje rozhovory; uchová sa posledných 100 (staršie sa zmažú samy)
-- =====================================================================
create table if not exists public.ai_rozhovory (
  id bigint generated always as identity primary key,
  makler_id uuid not null default auth.uid() references public.makleri(id) on delete cascade,
  nazov text not null default 'Rozhovor' check (length(nazov) <= 120),
  nehnutelnost_id bigint references public.nehnutelnosti(id) on delete set null,
  spravy jsonb not null default '[]'::jsonb check (jsonb_typeof(spravy) = 'array' and jsonb_array_length(spravy) <= 200),
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists ai_rozhovory_makler on public.ai_rozhovory (makler_id, upravene desc);
alter table public.ai_rozhovory enable row level security;
drop policy if exists ai_rozhovory_citanie on public.ai_rozhovory;
create policy ai_rozhovory_citanie on public.ai_rozhovory for select to authenticated using (makler_id = auth.uid());
drop policy if exists ai_rozhovory_zapis on public.ai_rozhovory;
create policy ai_rozhovory_zapis on public.ai_rozhovory for insert to authenticated with check (public.ja_aktivny() and makler_id = auth.uid());
drop policy if exists ai_rozhovory_uprava on public.ai_rozhovory;
create policy ai_rozhovory_uprava on public.ai_rozhovory for update to authenticated using (makler_id = auth.uid()) with check (public.ja_aktivny() and makler_id = auth.uid());
drop policy if exists ai_rozhovory_mazanie on public.ai_rozhovory;
create policy ai_rozhovory_mazanie on public.ai_rozhovory for delete to authenticated using (makler_id = auth.uid());
revoke all on public.ai_rozhovory from anon;
grant select, insert, update, delete on public.ai_rozhovory to authenticated;

-- uchová sa posledných 100 rozhovorov každého makléra
create or replace function public._ai_rozhovory_upratat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from ai_rozhovory where makler_id = new.makler_id and id in (
    select id from ai_rozhovory where makler_id = new.makler_id order by upravene desc offset 100);
  return null;
end $$;
revoke execute on function public._ai_rozhovory_upratat() from public, anon, authenticated;
drop trigger if exists ai_rozhovory_upratat on public.ai_rozhovory;
create trigger ai_rozhovory_upratat after insert on public.ai_rozhovory for each row execute function public._ai_rozhovory_upratat();

-- =====================================================================
-- 083: AI asistent si pamätá hotové texty pri nehnuteľnosti
--  * ai_texty: posledný text z AI asistenta ku každej ponuke a úlohe (popis, príspevok, e-mail…)
--    aj s odpoveďami na otázky „Komu píšeš?“ a „Čo má byť výsledok?“
--  * pri ďalšom použití sa text ponúkne hneď – bez nového volania AI (šetrí kredit)
--  * vidia ho všetci aktívni makléri kancelárie, zapisuje ten, kto text vytvoril
-- =====================================================================
create table if not exists public.ai_texty (
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  uloha text not null check (uloha in ('popis', 'prispevok', 'email', 'sms', 'namietka', 'cena')),
  text text not null check (length(text) <= 12000),
  nastavenia jsonb not null default '{}'::jsonb,
  makler_id uuid not null default auth.uid() references public.makleri(id) on delete cascade,
  upravene timestamptz not null default now(),
  primary key (nehnutelnost_id, uloha)
);
alter table public.ai_texty enable row level security;
drop policy if exists ai_texty_citanie on public.ai_texty;
create policy ai_texty_citanie on public.ai_texty for select to authenticated using (public.ja_aktivny());
drop policy if exists ai_texty_zapis on public.ai_texty;
create policy ai_texty_zapis on public.ai_texty for insert to authenticated with check (public.ja_aktivny() and makler_id = auth.uid());
drop policy if exists ai_texty_uprava on public.ai_texty;
create policy ai_texty_uprava on public.ai_texty for update to authenticated using (public.ja_aktivny()) with check (public.ja_aktivny() and makler_id = auth.uid());
revoke all on public.ai_texty from anon;
grant select, insert, update on public.ai_texty to authenticated;

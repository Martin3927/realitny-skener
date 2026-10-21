-- =====================================================================
-- Zvonček: nové súkromné inzeráty zo skenera.
-- Pamätá si (pre každého makléra, na všetkých zariadeniach), dokedy už nové inzeráty videl.
-- Čas sa berie z inzerátov (čas servera), nie z hodín v počítači.
-- =====================================================================
alter table public.makleri add column if not exists inzeraty_videne timestamptz;

create or replace function public.inzeraty_videne(p_cas timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set inzeraty_videne = greatest(coalesce(inzeraty_videne, '-infinity'::timestamptz), least(coalesce(p_cas, now()), now()))
  where id = auth.uid();
end $$;
revoke execute on function public.inzeraty_videne(timestamptz) from public, anon;
grant execute on function public.inzeraty_videne(timestamptz) to authenticated;

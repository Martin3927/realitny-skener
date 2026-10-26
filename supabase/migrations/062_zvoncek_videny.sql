-- Zvonček: ťuknutie naň = „pozrel som si“. Červené číslo potom počíta len to, čo pribudlo neskôr
-- (pripomienky, správy, nové inzeráty ostávajú vo zvončeku, kým ich maklér nevybaví). Platí na všetkých zariadeniach.
alter table public.makleri add column if not exists zvoncek_videne timestamptz;

create or replace function public.zvoncek_videny(p_cas timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set zvoncek_videne = greatest(coalesce(zvoncek_videne, '-infinity'),
    least(coalesce(p_cas, now()), now() + interval '10 minutes'))
  where id = auth.uid();
end $$;
revoke execute on function public.zvoncek_videny(timestamptz) from public, anon;
grant execute on function public.zvoncek_videny(timestamptz) to authenticated;

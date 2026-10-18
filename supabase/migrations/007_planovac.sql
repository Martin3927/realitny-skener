-- =====================================================================
-- Plánovač (pg_cron): automatické uvoľňovanie a týždenný prehľad
-- (len v Supabase – potrebuje pg_cron, pg_net a vault)
-- =====================================================================

-- týždenný prehľad: pondelok 7:00 slovenského času (cron beží v UTC, preto 5:00 aj 6:00 a kontrola hodiny)
create or replace function public.tyzdenny_prehlad() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 7 then return; end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    body := '{"prehlad": true}'::jsonb);
end $$;
revoke execute on function public.tyzdenny_prehlad() from public, anon, authenticated;

select cron.schedule('auto-uvolnenie', '*/15 * * * *', 'select public.auto_uvolnit()');
select cron.schedule('tyzdenny-prehlad', '0 5,6 * * 1', 'select public.tyzdenny_prehlad()');

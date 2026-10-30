-- =====================================================================
-- 079: AI kontrola súkromných inzerátov v skeneri
--  * inzeraty_ai: verdikt AI (súkromník / asi realitka / neisté), istota a dôvod; návrh prvého hovoru a SMS
--  * nový nerealitný inzerát hneď po uložení pošle databáza na kontrolu (funkcia ai-skener);
--    každých 10 minút sa doplnia vynechané a staršie aktívne inzeráty (najviac 10 naraz, najnovšie prvé)
--  * AI len označuje – o presune medzi realitky rozhoduje maklér tlačidlom „Je to RK“
--  * volanie funkcie je chránené tým istým kľúčom ako pripomienky (Vault: pripomienky_kluc)
-- =====================================================================
create table if not exists public.inzeraty_ai (
  inzerat_id text primary key,
  verdikt text check (verdikt in ('sukromny', 'rk', 'neiste')),
  istota smallint check (istota between 0 and 100),
  dovod text,
  model text,
  skontrolovane timestamptz,
  hovor text,
  sms text,
  hovor_vytvoril uuid,
  hovor_vytvorene timestamptz
);
alter table public.inzeraty_ai enable row level security;
drop policy if exists inzeraty_ai_citanie on public.inzeraty_ai;
create policy inzeraty_ai_citanie on public.inzeraty_ai for select to authenticated using (public.ma_pristup('inzeraty'));
revoke all on public.inzeraty_ai from anon;
revoke insert, update, delete on public.inzeraty_ai from authenticated;
grant select on public.inzeraty_ai to authenticated;

-- pošle inzerát (alebo dávku neskontrolovaných, keď p_id je null) na kontrolu AI
create or replace function public._ai_skener(p_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  if v_kluc is null then return; end if;
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/ai-skener',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    body := case when p_id is null then '{}'::jsonb else jsonb_build_object('id', p_id) end,
    timeout_milliseconds := 60000);
end $$;
revoke execute on function public._ai_skener(text) from public, anon, authenticated;

-- nový inzerát od súkromníka → hneď na kontrolu; chyba tu nikdy nesmie zastaviť ukladanie skenera
create or replace function public._ai_skener_novy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.predajca_typ is distinct from 'rk' and new.duplikat_z is null then
    begin
      perform public._ai_skener(new.id);
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke execute on function public._ai_skener_novy() from public, anon, authenticated;
drop trigger if exists ai_skener_novy on public.inzeraty;
create trigger ai_skener_novy after insert on public.inzeraty for each row execute function public._ai_skener_novy();

-- poistka a postupná kontrola starších aktívnych inzerátov
select cron.unschedule('ai-skener') where exists (select 1 from cron.job where jobname = 'ai-skener');
select cron.schedule('ai-skener', '3-59/10 * * * *', 'select public._ai_skener(null)');

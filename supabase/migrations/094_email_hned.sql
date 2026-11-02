-- Funkcia pripomienky (všetky e-maily Týpka) sa doteraz volala len vtedy, keď čakala pripomienka maklérovi.
-- E-maily k objednávkam z webu a strážcovi ponúk by tak čakali aj hodiny.
-- Teraz sa zavolá: hneď pri novej objednávke alebo žiadosti z webu, každú minútu, kým čaká pripomienka
-- alebo neoznámená objednávka, a inak každých 5 minút (strážca ponúk na webe makléra aj na portáli).

create or replace function public.odoslat_pripomienky() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if not exists (select 1 from pripomienky where hotovo is null and zrusena is null and email_odoslany is null and cas <= now())
     and not exists (select 1 from zakaznici where zdroj = 'web' and web_oznamene is null)
     and extract(minute from now())::int % 5 <> 0 then
    return;
  end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  if v_kluc is null then return; end if;
  -- odoslanie e-mailov trvá pár sekúnd – dlhší čas na odpoveď, nech sa beh nezapisuje ako chyba
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    timeout_milliseconds := 30000);
end $$;
revoke execute on function public.odoslat_pripomienky() from public, anon, authenticated;

-- nová objednávka z webu → e-mail hneď (požiadavka odíde až po uložení objednávky)
create or replace function public._objednavka_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform odoslat_pripomienky();
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public._objednavka_email() from public, anon, authenticated;

drop trigger if exists objednavka_email on public.zakaznici;
create trigger objednavka_email after insert on public.zakaznici
  for each row when (new.zdroj = 'web') execute function public._objednavka_email();

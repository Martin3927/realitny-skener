-- 1) Koniec skúšobnej doby: 3 dni pred koncom e-mail zákazníkovi + hlavnému správcovi do zvončeka a mobilu;
--    deň po skončení e-mail zákazníkovi a hlavnému správcovi pripomienka (mobil len, keď zákazník ešte nie je kontaktovaný).
--    E-maily zákazníkom posiela funkcia pripomienky (skusobnaEmaily) – stĺpec zakaznici.skusobna_email je fronta.
--    Predĺženie skúšobnej doby (nový dátum skusobna_do) spustí upozornenie znova pre nový dátum.
-- 2) Vlastné pripomienky, obhliadky, udalosti z kalendára a končiace zmluvy chodia v pravý čas aj do mobilu
--    (push druhu „pripomienky“ – doteraz ním chodilo len „Skús znova zavolať“). Web to sľubuje na /skener.

-- ---------------------------------------------------------------- 1) koniec skúšobnej doby
alter table public.zakaznici
  add column if not exists skusobna_email text,                  -- čaká na e-mail zákazníkovi: 'konci' | 'skoncila'
  add column if not exists skusobna_konci_oznamene date,         -- pre ktorý koniec (skusobna_do) už odišlo „končí o 3 dni“
  add column if not exists skusobna_skoncila_oznamene date;      -- pre ktorý koniec už odišlo „skončila“
do $$ begin
  alter table public.zakaznici add constraint zakaznici_skusobna_email_check check (skusobna_email in ('konci', 'skoncila'));
exception when duplicate_object then null; end $$;

create or replace function public._skusobna_koniec() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_kto uuid[];
  z record;
  v_text text;
  v_kontakt text;
  n int := 0;
begin
  if not pg_try_advisory_xact_lock(510102) then return 0; end if;
  select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto
    from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;

  -- a) končí o 3 dni (alebo skôr, keď sa deň vynechal) – raz pre každý dátum konca
  for z in
    select * from zakaznici
    where stav = 'skusobna' and registrovany is not null and skusobna_do is not null
      and skusobna_do between v_dnes and v_dnes + 3
      and (skusobna_konci_oznamene is null or skusobna_konci_oznamene <> skusobna_do)
    order by skusobna_do, id
  loop
    update zakaznici set skusobna_konci_oznamene = z.skusobna_do, skusobna_email = 'konci' where id = z.id;
    v_kontakt := concat_ws(' · ', nullif(btrim(coalesce(z.kontakt_meno, '')), ''), nullif(btrim(coalesce(z.telefon, '')), ''), z.email);
    v_text := case when z.typ = 'kancelaria' then 'Kancelária ' || z.nazov else z.nazov end
      || ' – skúšobná doba končí ' || to_char(z.skusobna_do, 'FMDD. FMMM. YYYY')
      || case when z.skusobna_do = v_dnes then ' (dnes)' else ' (o ' || (z.skusobna_do - v_dnes) || case when z.skusobna_do - v_dnes = 1 then ' deň)' else ' dni)' end end
      || case when z.kontaktovany is not null then ' · kontaktovaný ' || to_char(z.kontaktovany at time zone 'Europe/Bratislava', 'FMDD. FMMM.') else ' · zatiaľ nekontaktovaný' end
      || coalesce(' · ' || nullif(v_kontakt, ''), '');
    if cardinality(v_kto) > 0 then
      insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id)
      select k, now(), left('Končí skúšobná doba: ' || v_text, 500), 'zakaznik', z.id from unnest(v_kto) k;
      begin
        perform _push_zaradit(v_kto, 'kontakty', '⏳ Skúšobná doba končí', v_text, 'sprava.html#z/' || z.id, 'typek-skusobna-' || z.id);
      exception when others then null;
      end;
    end if;
    n := n + 1;
  end loop;

  -- b) skončila včera (alebo v posledných dňoch) – raz pre každý dátum konca
  for z in
    select * from zakaznici
    where stav = 'skusobna' and registrovany is not null and skusobna_do is not null
      and skusobna_do between v_dnes - 7 and v_dnes - 1
      and (skusobna_skoncila_oznamene is null or skusobna_skoncila_oznamene <> skusobna_do)
    order by skusobna_do, id
  loop
    update zakaznici set skusobna_skoncila_oznamene = z.skusobna_do, skusobna_email = 'skoncila' where id = z.id;
    v_kontakt := concat_ws(' · ', nullif(btrim(coalesce(z.kontakt_meno, '')), ''), nullif(btrim(coalesce(z.telefon, '')), ''), z.email);
    v_text := case when z.typ = 'kancelaria' then 'Kancelária ' || z.nazov else z.nazov end
      || ' – skúšobná doba skončila ' || to_char(z.skusobna_do, 'FMDD. FMMM. YYYY')
      || case when z.kontaktovany is not null then ' · kontaktovaný ' || to_char(z.kontaktovany at time zone 'Europe/Bratislava', 'FMDD. FMMM.') else ' · NEKONTAKTOVANÝ – ozvi sa mu' end
      || coalesce(' · ' || nullif(v_kontakt, ''), '');
    if cardinality(v_kto) > 0 then
      insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id)
      select k, now(), left('Skončila skúšobná doba: ' || v_text, 500), 'zakaznik', z.id from unnest(v_kto) k;
      if z.kontaktovany is null then
        begin
          perform _push_zaradit(v_kto, 'kontakty', '⌛ Skúšobná doba skončila – nekontaktovaný', v_text, 'sprava.html#z/' || z.id, 'typek-skusobna-' || z.id);
        exception when others then null;
        end;
      end if;
    end if;
    n := n + 1;
  end loop;

  -- e-maily zákazníkom nech odídu hneď, nie až o pár minút
  if n > 0 then
    begin perform odoslat_pripomienky(); exception when others then null; end;
  end if;
  return n;
end $$;
revoke execute on function public._skusobna_koniec() from public, anon, authenticated;

-- ráno o 8:00 (letný aj zimný čas – plánovač beží v UTC, hodinu stráži funkcia)
create or replace function public._skusobna_koniec_cron() returns void
language plpgsql security definer set search_path = public as $$
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 8 then return; end if;
  perform _skusobna_koniec();
end $$;
revoke execute on function public._skusobna_koniec_cron() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('skusobna-koniec');
exception when others then null; end $$;
select cron.schedule('skusobna-koniec', '0 6,7 * * *', 'select public._skusobna_koniec_cron()');

-- odoslat_pripomienky: zavolať funkciu aj vtedy, keď čaká e-mail zákazníkovi o skúšobnej dobe
create or replace function public.odoslat_pripomienky() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if not exists (select 1 from pripomienky where hotovo is null and zrusena is null and email_odoslany is null and cas <= now())
     and not exists (select 1 from zakaznici where zdroj = 'web' and web_oznamene is null)
     and not exists (select 1 from zakaznici where skusobna_email is not null)
     and extract(minute from now())::int % 5 <> 0 then
    return;
  end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  if v_kluc is null then return; end if;
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    timeout_milliseconds := 30000);
end $$;
revoke execute on function public.odoslat_pripomienky() from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) pripomienky do mobilu
-- staršie splatné pripomienky sa po nasadení neposielajú (boli by zo včera)
update public.pripomienky set push_odoslany = now()
 where push_odoslany is null and cas <= now()
   and druh in ('pripomienka', 'obhliadka', 'udalost', 'zmluva');

create or replace function public._pripomienky_push() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0; v_titul text;
begin
  if not pg_try_advisory_xact_lock(510103) then return 0; end if;
  for p in
    select r.id, r.makler_id, r.druh, r.poznamka, r.cas
    from pripomienky r
    where r.druh in ('pripomienka', 'obhliadka', 'udalost', 'zmluva')
      and r.hotovo is null and r.zrusena is null and r.push_odoslany is null
      and r.cas <= now() and r.cas > now() - interval '12 hours'
    order by r.cas limit 100
  loop
    v_titul := case p.druh
      when 'obhliadka' then '🗝️ Obhliadka'
      when 'udalost' then '📅 Udalosť v kalendári'
      when 'zmluva' then '📝 Končí zmluva'
      else '🔔 Pripomienka' end;
    begin
      perform _push_zaradit(array[p.makler_id], 'pripomienky', v_titul,
        coalesce(nullif(btrim(p.poznamka), ''), 'Pripomienka bez poznámky'), './#zvoncek', 'typek-pripomienka-' || p.id);
    exception when others then null;
    end;
    update pripomienky set push_odoslany = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._pripomienky_push() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('pripomienky-push');
exception when others then null; end $$;
select cron.schedule('pripomienky-push', '* * * * *', 'select public._pripomienky_push()');

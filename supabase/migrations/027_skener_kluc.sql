-- =====================================================================
-- Nový kľúč skenera z aplikácie (administrátor).
-- Kľúč sa zobrazí len raz – administrátor ho vloží do GitHubu (Settings → Secrets → SKENER_KLUC).
-- V databáze ostáva len jeho odtlačok (sha256), samotný kľúč sa nikde neukladá.
-- =====================================================================
create or replace function public.skener_novy_kluc() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text := encode(gen_random_bytes(24), 'hex');
begin
  perform _over_admin();
  insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(digest(v, 'sha256'), 'hex'))
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  insert into nastavenia (kluc, hodnota) values ('skener_kluc_zmeneny', now()::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $$;

create or replace function public.skener_kluc_zmeneny() returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when ja_admin() then (select hodnota::timestamptz from nastavenia where kluc = 'skener_kluc_zmeneny') end;
$$;

revoke execute on function public.skener_novy_kluc(), public.skener_kluc_zmeneny() from public, anon;
grant execute on function public.skener_novy_kluc(), public.skener_kluc_zmeneny() to authenticated;

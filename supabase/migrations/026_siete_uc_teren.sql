-- =====================================================================
-- Príspevky na Facebook + Instagram jedným klikom (cez scenár Make) a doplnok exportu do Realsoftu (terén pozemku).
-- =====================================================================
alter table public.prispevky_siete add column if not exists kluc text;
alter table public.prispevky_siete add column if not exists vysledok jsonb not null default '{}';

-- adresa webhooku scenára Make „Realitný týpek – príspevok FB + IG“ sa NEUKLADÁ do repozitára (je verejný).
-- Je iba v databáze: nastavenia.kluc = 'make_siete_webhook' (čítať ju vie len server). Zmena: priamo v databáze.

-- terén pozemku (povinný údaj pre domy, chaty, objekty a pozemky v Realsofte)
alter table public.nehnutelnosti add column if not exists uc_teren int;
create or replace function public.nastavit_uc_teren(p_id bigint, p_teren int) returns void
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id;
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  if not ja_admin() and n.makler_id is distinct from auth.uid() then raise exception 'Upraviť môže len zodpovedný maklér alebo administrátor.'; end if;
  if p_teren is not null and p_teren not in (396, 397, 398, 399, 400, 401, 402) then raise exception 'Neznámy terén.'; end if;
  update nehnutelnosti set uc_teren = p_teren where id = p_id;
end $$;
revoke execute on function public.nastavit_uc_teren(bigint, int) from public, anon;
grant execute on function public.nastavit_uc_teren(bigint, int) to authenticated;

-- =====================================================================
-- 075: Zverejňovanie na Facebook a Instagram kancelárie len s povolením
--  * nové právo „siete“ v makleri.pristup: maklér môže zverejniť svoju ponuku na FB a IG kancelárie
--  * administrátor ho má vždy; ostatným ho zapne administrátor v Makléri → Môže
--  * nikto ho nedostane automaticky (predvolený prístup nových maklérov sa nemení)
--  * kontrolu robí aj funkcia siete (Supabase), nie len aplikácia
-- =====================================================================
create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'matterport', 'kalendar', 'mapa', 'kataster', 'asistent', 'web', 'recenzie', 'provizie', 'siete')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

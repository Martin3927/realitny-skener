-- Inzerát, s ktorým maklér pracuje (prevzatý, zapísaný hovor, SMS alebo email), skener nikdy nezlúči ako duplikát
-- do iného inzerátu – inak by maklérovi karta zmizla zo zoznamu (17. 11. 2026: Romanov byt sa zlúčil s inzerátom RK).
create or replace function public.skener_pracovane(p_kluc text) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((select array_agg(distinct inzerat_id) from prevzatia
                   where makler_id is not null or pocet_hovorov > 0 or sms is not null or email is not null), '{}');
end $$;
revoke execute on function public.skener_pracovane(text) from public, authenticated;
grant execute on function public.skener_pracovane(text) to anon;

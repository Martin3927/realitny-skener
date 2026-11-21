-- =====================================================================
-- 148: Odtlačky fotiek aj pre archívy, ktoré majú fotky len na portáli (bez kópie v našom úložisku)
--  (146 vyberala len archívy s uloženými fotkami; ak sa fotka z portálu už nedá stiahnuť, uloží sa prázdny odtlačok a viac sa nepýta)
-- =====================================================================
create or replace function public.skener_fotky_na_odtlacky(p_kluc text, p_pocet int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.inzerat_id, 'fotky', x.f, 'portal', x.p)) from (
    select a.inzerat_id, coalesce(a.fotky[1:4], '{}') as f, coalesce(a.fotky_portal[1:4], '{}') as p from archiv a join inzeraty z on z.id = a.inzerat_id
    where (coalesce(cardinality(a.fotky), 0) > 0 or coalesce(cardinality(a.fotky_portal), 0) > 0)
      and not exists (select 1 from archiv_odtlacky o where o.inzerat_id = a.inzerat_id)
    order by z.prvy_krat desc limit least(greatest(coalesce(p_pocet, 200), 1), 500)) x), '[]'::jsonb);
end $$;
revoke execute on function public.skener_fotky_na_odtlacky(text, int) from public;
grant execute on function public.skener_fotky_na_odtlacky(text, int) to anon, authenticated;

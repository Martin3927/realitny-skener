-- =====================================================================
-- Vlastné inzeráty kancelárie zo skenera → ponuky v Týpkovi
--  * archív stiahne fotky aj k inzerátom vlastnej kancelárie (doteraz len súkromným a rozpracovaným),
--    aby sa dali hromadne preniesť do ponúk a ukázať v Týpkových nehnuteľnostiach
--  * kancelária sa spozná podľa názvu v nastavení vzhľadu (predvolene Alpha Reality) v poli predajca
-- =====================================================================

-- vzor pre ILIKE: %názov kancelárie% (znaky %, _ a \ v názve sa berú doslova); pri príliš krátkom názve nič
create or replace function public._vzor_kancelarie() returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  begin
    v := btrim((select hodnota::jsonb->>'nazov' from nastavenia where kluc = 'vzhlad'));
  exception when others then v := null;
  end;
  v := coalesce(nullif(v, ''), 'Alpha Reality');
  if length(v) < 4 then return null; end if;
  return '%' || replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_') || '%';
end $$;
revoke execute on function public._vzor_kancelarie() from public, anon, authenticated;

create or replace function public.skener_na_archiv(p_kluc text, p_pocet int default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_vzor text := _vzor_kancelarie();
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(x) from (
      select i.id, i.portal, i.url,
        (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null or coalesce(p.pocet_hovorov, 0) > 0
         or (v_vzor is not null and i.predajca ilike v_vzor)) as fotky,
        (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk') as sukromny
      from inzeraty i
      left join oznacenia o on o.inzerat_id = i.id
      left join prevzatia p on p.inzerat_id = i.id
      left join archiv a on a.inzerat_id = i.id
      where i.aktivny and i.url is not null
        and (a.inzerat_id is null
             or (cardinality(a.fotky) = 0 and cardinality(a.fotky_portal) > 0 and coalesce(a.aktualizovane, a.ulozene) < now() - interval '6 hours'
                 and (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null
                      or (v_vzor is not null and i.predajca ilike v_vzor and i.duplikat_z is null))))
      order by (a.inzerat_id is null) desc,
               (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null
                or (v_vzor is not null and i.predajca ilike v_vzor)) desc, i.prvy_krat desc
      limit p_pocet
    ) x), '[]'::jsonb);
end $$;

-- =====================================================================
-- Matterport: štatistika pre administrátora – koľko hodín mal kameru ktorý maklér
-- (podľa začiatku rezervácie v zvolenom období; zrušené sa rátajú zvlášť).
-- =====================================================================

create or replace function public.matterport_statistika(p_od timestamptz, p_do timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'makler_id', makler_id, 'rezervacie', rezervacie, 'hodiny', hodiny, 'predlzenia', predlzenia,
             'zrusene', zrusene, 'naposledy', naposledy) order by hodiny desc, zrusene desc)
    from (
      select r.makler_id,
             count(*) filter (where r.zrusene is null) as rezervacie,
             round(coalesce(sum(extract(epoch from r.koniec - r.zaciatok)) filter (where r.zrusene is null), 0) / 3600.0, 1) as hodiny,
             coalesce(sum(r.predlzenia) filter (where r.zrusene is null), 0) as predlzenia,
             count(*) filter (where r.zrusene is not null) as zrusene,
             max(r.zaciatok) filter (where r.zrusene is null) as naposledy
      from matterport_rezervacie r
      where r.zaciatok >= p_od and r.zaciatok < p_do
      group by r.makler_id
    ) x), '[]'::jsonb);
end $$;
revoke execute on function public.matterport_statistika(timestamptz, timestamptz) from public, anon;
grant execute on function public.matterport_statistika(timestamptz, timestamptz) to authenticated;

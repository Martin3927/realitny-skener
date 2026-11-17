-- História prevzatí v skeneri: oznámenie o automatickom uvoľnení povie, kde inzerát nájsť (skener → 🕘 História)

create or replace function public.auto_uvolnit()
 returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.inzerat_id, p.makler_id, p.kancelaria_id, i.nazov
    from prevzatia p join inzeraty i on i.id = p.inzerat_id
    where p.makler_id is not null
      and p.upravene < now() - interval '24 hours'
      and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
      and not exists (select 1 from pripomienky x
                      where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                        and x.hotovo is null and x.zrusena is null and x.cas > now())
    for update of p skip locked
  loop
    update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = r.inzerat_id and kancelaria_id = r.kancelaria_id;
    insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
      values (r.inzerat_id, r.makler_id, 'uvolnenie', 'automaticky – 24 hodín bez zápisu', r.kancelaria_id);
    insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
      values (r.makler_id, r.inzerat_id, now(),
              'Inzerát sa automaticky uvoľnil – 24 hodín ste pri ňom nič nezapísali: ' || left(r.nazov, 90) ||
              '. Ak ho chcete, prevezmite si ho znova – nájdete ho v skeneri pod 🕘 História.', 'uvolnenie', r.kancelaria_id);
    n := n + 1;
  end loop;
  return n;
end $$;

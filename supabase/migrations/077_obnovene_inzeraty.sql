-- Znova zverejnené (obnovené) inzeráty: predajca dá byt, ktorý už poznáme, na portál znova (často so zníženou cenou).
-- Skener zapíše čas do inzeraty.obnovene a súkromný inzerát pošle maklérom ako upozornenie „🔁 Znova zverejnený“.

alter table public.inzeraty add column if not exists obnovene timestamptz;

create or replace function public.skener_ulozit(p_kluc text, p_inzeraty jsonb, p_odhady jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform _over_skener(p_kluc);
  insert into inzeraty (id, portal, portaly, url, nazov, typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, prvy_krat, naposledy, aktivny, duplikat_z,
    dalsie_odkazy, historia_cien, lat, lon, ulica, obnovene)
  select id, portal, coalesce(portaly, '{}'), url, coalesce(nazov, ''), typ, podtyp, izby, cena, plocha, cena_m2, obec, okres,
    predajca, predajca_typ, predajca_dovod, foto, popis, publikovane, coalesce(prvy_krat, now()), coalesce(naposledy, now()),
    coalesce(aktivny, true), duplikat_z, coalesce(dalsie_odkazy, '[]'), coalesce(historia_cien, '[]'), lat, lon, ulica, obnovene
  from jsonb_populate_recordset(null::inzeraty, p_inzeraty)
  on conflict (id) do update set
    portal = excluded.portal, portaly = excluded.portaly, url = excluded.url, nazov = excluded.nazov,
    typ = excluded.typ, podtyp = excluded.podtyp, izby = excluded.izby, cena = excluded.cena,
    plocha = excluded.plocha, cena_m2 = excluded.cena_m2, obec = excluded.obec, okres = excluded.okres,
    predajca = excluded.predajca, predajca_typ = excluded.predajca_typ, predajca_dovod = excluded.predajca_dovod,
    foto = excluded.foto, popis = excluded.popis, publikovane = excluded.publikovane,
    prvy_krat = excluded.prvy_krat, naposledy = excluded.naposledy, aktivny = excluded.aktivny,
    duplikat_z = excluded.duplikat_z, dalsie_odkazy = excluded.dalsie_odkazy, historia_cien = excluded.historia_cien,
    lat = coalesce(excluded.lat, inzeraty.lat), lon = coalesce(excluded.lon, inzeraty.lon), ulica = coalesce(excluded.ulica, inzeraty.ulica),
    obnovene = coalesce(excluded.obnovene, inzeraty.obnovene);
  get diagnostics v = row_count;
  if p_odhady is not null then
    insert into odhady (inzerat_id, median, rozdiel_pct, skupina, n, jednotka, podhodnotene)
    select inzerat_id, median, rozdiel_pct, skupina, n, jednotka, coalesce(podhodnotene, false)
    from jsonb_populate_recordset(null::odhady, p_odhady)
    on conflict (inzerat_id) do update set median = excluded.median, rozdiel_pct = excluded.rozdiel_pct,
      skupina = excluded.skupina, n = excluded.n, jednotka = excluded.jednotka, podhodnotene = excluded.podhodnotene;
    update odhady set median = null, rozdiel_pct = null, skupina = null, n = null, jednotka = null, podhodnotene = false
    where inzerat_id in (select x->>'id' from jsonb_array_elements(p_inzeraty) x)
      and inzerat_id not in (select x->>'inzerat_id' from jsonb_array_elements(p_odhady) x);
  end if;
  return v;
end $$;

-- komu poslať upozornenie na znova zverejnený súkromný inzerát (každé zverejnenie len raz)
create or replace function public.skener_push_ciele_obnovene(p_kluc text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_skener(p_kluc);
  with i as (
    select z.*, 'obnova:' || z.id || ':' || to_char(z.obnovene at time zone 'Europe/Bratislava', 'YYYY-MM-DD') as kluc
    from inzeraty z
    left join oznacenia o on o.inzerat_id = z.id
    where z.id = any(p_ids) and z.aktivny and z.duplikat_z is null
      and z.obnovene > now() - interval '1 day'
      and coalesce(o.predajca_typ, z.predajca_typ, 'sukromny') <> 'rk'
      and not exists (select 1 from _telefony_inzeratov() t join predajcovia p on p.telefon = t.tel
                      where t.inzerat_id = z.id and (p.rk or p.nevolat))
  ), ciel as (
    select i.id as inzerat_id, i.kluc, m.id as makler_id
    from i join makleri m on m.aktivny and (m.rola = 'admin' or 'inzeraty' = any(m.pristup))
                         and _chce_upozornenie(m.upozornenia, 'inzeraty')
    where exists (select 1 from push_odbery s where s.makler_id = m.id)
      and (cardinality(coalesce(m.obce, '{}')) = 0
           or i.obec = any(m.obce)
           or (i.obec is null and exists (select 1 from lokality l where l.nazov = any(m.obce) and l.okres = i.okres)))
      and not exists (select 1 from push_odoslane x where x.inzerat_id = i.kluc and x.makler_id = m.id)
  ), zapis as (
    insert into push_odoslane (inzerat_id, makler_id) select kluc, makler_id from ciel
    on conflict do nothing returning inzerat_id, makler_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'inzerat', jsonb_build_object('id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres,
                                    'cena', i.cena, 'plocha', i.plocha, 'portal', i.portal, 'historia_cien', i.historia_cien),
      'odbery', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                 from zapis z join push_odbery s on s.makler_id = z.makler_id where z.inzerat_id = i.kluc))), '[]'::jsonb)
    into v
  from i where exists (select 1 from zapis z where z.inzerat_id = i.kluc);
  return v;
end $$;
revoke execute on function public.skener_push_ciele_obnovene(text, text[]) from public, authenticated;
grant execute on function public.skener_push_ciele_obnovene(text, text[]) to anon;

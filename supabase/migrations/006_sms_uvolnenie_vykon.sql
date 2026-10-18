-- =====================================================================
-- SMS šablóny maklérov, automatické uvoľnenie po 2 dňoch, upozornenie
-- na zníženie ceny a prehľad výkonu maklérov
-- =====================================================================

-- ---------------------------------------------------------------- SMS šablóna
alter table public.makleri add column if not exists sms_sablona text;

create or replace function public.ulozit_sms_sablonu(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if length(coalesce(p_text, '')) > 700 then raise exception 'Text SMS je príliš dlhý (max. 700 znakov).'; end if;
  update makleri set sms_sablona = nullif(trim(p_text), '') where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- druh upozornenia v zvončeku
-- pripomienka = nastavil maklér, uvolnenie = automatické uvoľnenie, cena = znížená cena
alter table public.pripomienky add column if not exists druh text not null default 'pripomienka';
do $$ begin
  alter table public.pripomienky add constraint pripomienky_druh_chk check (druh in ('pripomienka', 'uvolnenie', 'cena'));
exception when duplicate_object then null; end $$;

create or replace function public._eur(x numeric) returns text
language sql immutable as $$ select replace(to_char(round(x), 'FM999,999,999,990'), ',', ' ') || ' €' $$;

-- ---------------------------------------------------------------- automatické uvoľnenie
-- prevzatý inzerát, pri ktorom sa 2 dni nič nezapísalo, sa vráti medzi voľné.
-- Neuvoľní sa, ak má maklér pri inzeráte budúcu pripomienku alebo je výsledok
-- hovoru „stretnutie dohodnuté“ / „získaný do ponuky“.
create or replace function public.auto_uvolnit() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.inzerat_id, p.makler_id, i.nazov
    from prevzatia p join inzeraty i on i.id = p.inzerat_id
    where p.makler_id is not null
      and p.upravene < now() - interval '48 hours'
      and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
      and not exists (select 1 from pripomienky x
                      where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                        and x.hotovo is null and x.zrusena is null and x.cas > now())
    for update of p skip locked
  loop
    update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = r.inzerat_id;
    insert into aktivity (inzerat_id, makler_id, typ, poznamka)
      values (r.inzerat_id, r.makler_id, 'uvolnenie', 'automaticky – 2 dni bez zápisu');
    insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh)
      values (r.makler_id, r.inzerat_id, now(),
              'Inzerát sa automaticky uvoľnil – 2 dni ste pri ňom nič nezapísali: ' || left(r.nazov, 90) ||
              '. Ak ho chcete, prevezmite si ho znova.', 'uvolnenie');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- znížená cena
create or replace function public._znizena_cena() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_m uuid;
begin
  if new.cena is null or old.cena is null or old.cena <= 0 or new.cena >= old.cena * 0.995 then return new; end if;
  select makler_id into v_m from prevzatia where inzerat_id = new.id;
  if v_m is null then return new; end if;
  insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh)
    values (v_m, new.id, now(),
            'Znížená cena z ' || _eur(old.cena) || ' na ' || _eur(new.cena) ||
            ' (−' || round((1 - new.cena::numeric / old.cena) * 100) || ' %): ' || left(new.nazov, 90), 'cena');
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'inzeraty_znizena_cena') then
    create trigger inzeraty_znizena_cena after update of cena on public.inzeraty
      for each row when (new.cena is distinct from old.cena) execute function public._znizena_cena();
  end if;
end $$;

-- ---------------------------------------------------------------- výkon maklérov
create or replace function public._vykon(p_od timestamptz, p_do timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'od', p_od, 'do', p_do,
    'nove_sukromne', (select count(*) from inzeraty i left join oznacenia o on o.inzerat_id = i.id
                      where i.prvy_krat >= p_od and i.prvy_krat < p_do and i.duplikat_z is null
                        and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'),
    'makleri', coalesce((
      select jsonb_agg(r order by r->>'meno') from (
        select jsonb_build_object(
          'id', m.id, 'meno', coalesce(nullif(m.meno, ''), m.email), 'aktivny', m.aktivny, 'rola', m.rola,
          'prevzate', count(a.id) filter (where a.typ = 'prevzatie'),
          'hovory', count(a.id) filter (where a.typ = 'hovor'),
          'sms', count(a.id) filter (where a.typ = 'sms'),
          'emaily', count(a.id) filter (where a.typ = 'email'),
          'uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and coalesce(a.poznamka, '') not like 'automaticky%'),
          'auto_uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and a.poznamka like 'automaticky%'),
          'vysledky', coalesce((select jsonb_object_agg(v.vysledok, v.n) from (
                         select coalesce(vysledok, 'Iné') vysledok, count(*) n from aktivity
                         where makler_id = m.id and typ = 'hovor' and vytvorene >= p_od and vytvorene < p_do
                         group by 1) v), '{}'::jsonb),
          'schrankovanie', (select count(*) from schrankovanie s
                            where s.vytvoril = m.id and s.vytvorene >= p_od and s.vytvorene < p_do),
          'drzi', (select count(*) from prevzatia p where p.makler_id = m.id),
          'posledna', max(a.vytvorene)
        ) r
        from makleri m
        left join aktivity a on a.makler_id = m.id and a.vytvorene >= p_od and a.vytvorene < p_do
        group by m.id
      ) x), '[]'::jsonb)
  )
$$;

create or replace function public.vykon_maklerov(p_od timestamptz, p_do timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return _vykon(p_od, p_do);
end $$;

-- minulý týždeň (pondelok–nedeľa podľa slovenského času) pre týždenný email
create or replace function public._vykon_minuly_tyzden() returns jsonb
language sql stable security definer set search_path = public as $$
  select _vykon(d - interval '7 days', d)
  from (select date_trunc('week', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava' as d) t
$$;

-- ---------------------------------------------------------------- práva
revoke execute on function public.ulozit_sms_sablonu(text), public.auto_uvolnit(), public._znizena_cena(),
  public._vykon(timestamptz, timestamptz), public.vykon_maklerov(timestamptz, timestamptz),
  public._vykon_minuly_tyzden(), public._eur(numeric) from public, anon, authenticated;
grant execute on function public.ulozit_sms_sablonu(text), public.vykon_maklerov(timestamptz, timestamptz) to authenticated;
grant execute on function public._vykon_minuly_tyzden() to service_role;

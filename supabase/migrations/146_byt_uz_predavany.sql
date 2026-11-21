-- =====================================================================
-- 146: „Tento byt sa už predával“ – skener spozná rovnaký byt medzi staršími (zmiznutými) inzerátmi
--  * odtlačky fotiek: pre každý archivovaný inzerát 64-bitový odtlačok (dHash) najviac 6 fotiek – nové počíta skener pri archivovaní
--    (fotky už má stiahnuté), staršie archívy dopočíta odtlacky.py v GitHub Actions (najprv z portálu, nie z nášho úložiska)
--  * zhoda: starší inzerát toho istého druhu a okresu, ktorý už zmizol z portálu, a
--      – aspoň 2 takmer rovnaké fotky, alebo
--      – 1 takmer rovnaká fotka a rovnaké parametre (izby, plocha ±3 m²)
--  * výsledok je v inzeraty_predtym (pre kartu inzerátu v skeneri); údaje sú z verejných inzerátov, preto spoločné pre všetky kancelárie
-- =====================================================================
create table if not exists public.archiv_odtlacky (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  odtlacky bigint[] not null default '{}',
  vytvorene timestamptz not null default now()
);
alter table public.archiv_odtlacky enable row level security;
revoke all on public.archiv_odtlacky from anon, authenticated;

create table if not exists public.inzeraty_predtym (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  zhody jsonb not null default '[]',
  vypocitane timestamptz not null default now()
);
alter table public.inzeraty_predtym enable row level security;
drop policy if exists inzeraty_predtym_citat on public.inzeraty_predtym;
create policy inzeraty_predtym_citat on public.inzeraty_predtym for select to authenticated using ((select public.ma_pristup('inzeraty')));
revoke all on public.inzeraty_predtym from anon, authenticated;
grant select on public.inzeraty_predtym to authenticated;

-- skener: ktoré archivované inzeráty ešte nemajú odtlačky (najnovšie prvé)
create or replace function public.skener_fotky_na_odtlacky(p_kluc text, p_pocet int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.inzerat_id, 'fotky', x.f, 'portal', x.p)) from (
    select a.inzerat_id, a.fotky[1:4] as f, a.fotky_portal[1:4] as p from archiv a join inzeraty z on z.id = a.inzerat_id
    where cardinality(a.fotky) > 0 and not exists (select 1 from archiv_odtlacky o where o.inzerat_id = a.inzerat_id)
    order by z.prvy_krat desc limit least(greatest(coalesce(p_pocet, 200), 1), 500)) x), '[]'::jsonb);
end $$;
revoke execute on function public.skener_fotky_na_odtlacky(text, int) from public;
grant execute on function public.skener_fotky_na_odtlacky(text, int) to anon, authenticated;

-- skener: uloží odtlačky [{id, h: ["123", "-456", …]}] (prázdne h = fotky sa nedali stiahnuť, nabudúce sa nepýta znova)
create or replace function public.skener_ulozit_odtlacky(p_kluc text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _over_skener(p_kluc);
  insert into archiv_odtlacky (inzerat_id, odtlacky)
  select x ->> 'id', coalesce((select array_agg(v::bigint) from jsonb_array_elements_text(x -> 'h') v), '{}')
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
  where exists (select 1 from inzeraty z where z.id = x ->> 'id')
  on conflict (inzerat_id) do update set odtlacky = excluded.odtlacky, vytvorene = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.skener_ulozit_odtlacky(text, jsonb) from public;
grant execute on function public.skener_ulozit_odtlacky(text, jsonb) to anon, authenticated;

-- zhody jedného inzerátu so staršími zmiznutými inzerátmi
create or replace function public._predtym_zhody(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  with n as (select z.*, o.odtlacky from inzeraty z join archiv_odtlacky o on o.inzerat_id = z.id where z.id = p_id),
  k as (
    select s.id, s.nazov, s.cena, s.plocha, s.izby, s.portal, s.url, s.predajca, s.predajca_typ, s.prvy_krat, s.naposledy,
      (select count(distinct a) from unnest(n.odtlacky) a where exists (select 1 from unnest(so.odtlacky) b where bit_count((a # b)::bit(64)) <= 5)) as fotiek,
      (coalesce(s.izby, -1) = coalesce(n.izby, -1) and s.plocha is not null and n.plocha is not null and abs(s.plocha - n.plocha) <= 3) as parametre
    from n
    join inzeraty s on s.typ = n.typ and s.okres = n.okres and s.id <> n.id and not s.aktivny
      and s.naposledy < n.prvy_krat + interval '1 day' and s.prvy_krat < n.prvy_krat
      and s.duplikat_z is distinct from n.id and n.duplikat_z is distinct from s.id
    join archiv_odtlacky so on so.inzerat_id = s.id and cardinality(so.odtlacky) > 0
    where cardinality(n.odtlacky) > 0)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nazov', nazov, 'cena', cena, 'plocha', plocha, 'portal', portal, 'url', url,
      'predajca', left(coalesce(predajca, ''), 80), 'rk', predajca_typ = 'rk', 'od', prvy_krat, 'do', naposledy, 'fotiek', fotiek) order by naposledy desc), '[]'::jsonb)
  from (select * from k where fotiek >= 2 or (fotiek >= 1 and parametre) order by naposledy desc limit 3) x
$$;
revoke execute on function public._predtym_zhody(text) from public, anon, authenticated;

-- skener: prepočíta zhody aktívnych inzerátov, ktoré majú odtlačky (nové alebo všetky)
create or replace function public.skener_prepocitaj_predtym(p_kluc text, p_vsetky boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare r record; z jsonb; n int := 0;
begin
  perform _over_skener(p_kluc);
  for r in
    select o.inzerat_id from archiv_odtlacky o join inzeraty i on i.id = o.inzerat_id
    left join inzeraty_predtym p on p.inzerat_id = o.inzerat_id
    where i.aktivny and cardinality(o.odtlacky) > 0 and (p_vsetky or p.inzerat_id is null or p.vypocitane < o.vytvorene)
  loop
    z := _predtym_zhody(r.inzerat_id);
    if jsonb_array_length(z) > 0 then
      insert into inzeraty_predtym (inzerat_id, zhody, vypocitane) values (r.inzerat_id, z, now())
      on conflict (inzerat_id) do update set zhody = excluded.zhody, vypocitane = now();
      n := n + 1;
    else
      insert into inzeraty_predtym (inzerat_id, zhody, vypocitane) values (r.inzerat_id, '[]', now())
      on conflict (inzerat_id) do update set zhody = '[]', vypocitane = now();
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.skener_prepocitaj_predtym(text, boolean) from public;
grant execute on function public.skener_prepocitaj_predtym(text, boolean) to anon, authenticated;

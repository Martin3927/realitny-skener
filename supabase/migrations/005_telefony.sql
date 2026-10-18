-- =====================================================================
-- Telefón predajcu pri súkromných inzerátoch
--  * archiv.telefon – číslo, ktoré predajca napísal do textu inzerátu (ukladá skener)
--  * telefony       – číslo, ktoré zadal maklér (napr. po kliknutí na „zobraz číslo“ na portáli)
-- =====================================================================

alter table public.archiv add column if not exists telefon text;

create table public.telefony (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  telefon text not null default '',
  zadal uuid references public.makleri(id) on delete set null,
  zadane timestamptz not null default now()
);
alter table public.telefony enable row level security;
create policy telefony_citat on public.telefony for select to authenticated using (ja_aktivny());
revoke all on public.telefony from anon, authenticated;
grant select on public.telefony to authenticated;

-- uloženie telefónu maklérom (prázdne číslo = vymazať)
create or replace function public.ulozit_telefon(p_inzerat text, p_telefon text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_telefon, ''));
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat) then raise exception 'Inzerát neexistuje.'; end if;
  if v <> '' and length(regexp_replace(v, '\D', '', 'g')) < 9 then
    raise exception 'Telefónne číslo musí mať aspoň 9 číslic.';
  end if;
  insert into telefony (inzerat_id, telefon, zadal, zadane) values (p_inzerat, v, auth.uid(), now())
  on conflict (inzerat_id) do update set telefon = excluded.telefon, zadal = excluded.zadal, zadane = now();
end $$;

revoke execute on function public.ulozit_telefon(text, text) from public, anon;
grant execute on function public.ulozit_telefon(text, text) to authenticated;

-- skener: zoznam na archiváciu vracia aj informáciu, či je inzerát súkromný
create or replace function public.skener_na_archiv(p_kluc text, p_pocet int default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(x) from (
      select i.id, i.portal, i.url,
        (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null or coalesce(p.pocet_hovorov, 0) > 0) as fotky,
        (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk') as sukromny
      from inzeraty i
      left join oznacenia o on o.inzerat_id = i.id
      left join prevzatia p on p.inzerat_id = i.id
      left join archiv a on a.inzerat_id = i.id
      where i.aktivny and i.duplikat_z is null and i.url is not null
        and (a.inzerat_id is null
             or (cardinality(a.fotky) = 0 and cardinality(a.fotky_portal) > 0
                 and (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null)))
      order by (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null) desc, i.prvy_krat desc
      limit p_pocet
    ) x), '[]'::jsonb);
end $$;

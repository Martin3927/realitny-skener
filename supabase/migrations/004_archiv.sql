-- =====================================================================
-- Archív inzerátov: celý popis, parametre a kópie fotiek,
-- aby ostali v databáze aj po zmazaní inzerátu z portálu
-- =====================================================================

create table public.archiv (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  popis text,
  parametre jsonb not null default '{}',
  fotky text[] not null default '{}',     -- cesty v úložisku "archiv"
  fotky_portal text[] not null default '{}',  -- pôvodné adresy fotiek na portáli
  ulozene timestamptz not null default now()
);
alter table public.archiv enable row level security;
create policy archiv_citat on public.archiv for select to authenticated using (ja_aktivny());
revoke all on public.archiv from anon, authenticated;
grant select on public.archiv to authenticated;

-- ktoré inzeráty ešte treba archivovať: najprv súkromné a tie, s ktorými niekto pracuje (s fotkami),
-- potom ostatné (len text)
create or replace function public.skener_na_archiv(p_kluc text, p_pocet int default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(x) from (
      select i.id, i.portal, i.url,
        (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null or coalesce(p.pocet_hovorov, 0) > 0) as fotky
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

revoke execute on function public.skener_na_archiv(text, int) from public, authenticated;
grant execute on function public.skener_na_archiv(text, int) to anon;

-- verejné úložisko pre fotky (adresy sú nepredvídateľné; zapisuje len funkcia archiv)
insert into storage.buckets (id, name, public) values ('archiv', 'archiv', true)
on conflict (id) do nothing;

-- =====================================================================
-- Archív inzerátov – uložiť všetko, čo sa dá, a nič nestratiť
--  * aj opakovane vložené inzeráty (duplikáty) sa archivujú
--  * súkromné inzeráty sa každú noc pozrú znova: zmenený text sa uloží, pôvodné znenie ostane v histórii,
--    doplnený telefón v texte sa pridá; prázdne údaje (inzerát už zmizol) nikdy neprepíšu uložené
-- =====================================================================
alter table public.archiv add column if not exists historia jsonb not null default '[]';
alter table public.archiv add column if not exists aktualizovane timestamptz;

create or replace function public._archiv_zluc() returns trigger
language plpgsql set search_path = public as $$
begin
  -- prázdne nové údaje nenahrádzajú uložené
  if coalesce(btrim(new.popis), '') = '' then new.popis := old.popis; end if;
  if cardinality(coalesce(new.fotky, '{}')) = 0 then new.fotky := old.fotky; end if;
  if cardinality(coalesce(new.fotky_portal, '{}')) = 0 then new.fotky_portal := old.fotky_portal; end if;
  if coalesce(new.parametre, '{}'::jsonb) = '{}'::jsonb then new.parametre := old.parametre; end if;
  if coalesce(btrim(new.telefon), '') = '' then new.telefon := old.telefon; end if;
  new.historia := coalesce(old.historia, '[]'::jsonb);
  -- zmenený text: pôvodné znenie do histórie (najviac 10 verzií)
  if coalesce(btrim(old.popis), '') <> '' and new.popis is distinct from old.popis then
    new.historia := (jsonb_build_array(jsonb_build_object('do', now(), 'od', old.ulozene, 'popis', old.popis))
                     || new.historia) - 10;
  end if;
  new.ulozene := case when new.popis is distinct from old.popis then now() else old.ulozene end;
  new.aktualizovane := now();
  return new;
end $$;
drop trigger if exists archiv_zluc on public.archiv;
create trigger archiv_zluc before update on public.archiv for each row execute function public._archiv_zluc();

-- čo treba archivovať: aj duplikáty; najprv súkromné a rozpracované (s fotkami), potom ostatné (text)
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
      where i.aktivny and i.url is not null
        and (a.inzerat_id is null
             or (cardinality(a.fotky) = 0 and cardinality(a.fotky_portal) > 0 and coalesce(a.aktualizovane, a.ulozene) < now() - interval '6 hours'
                 and (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null)))
      order by (a.inzerat_id is null) desc,
               (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null) desc, i.prvy_krat desc
      limit p_pocet
    ) x), '[]'::jsonb);
end $$;

-- nočná obnova: súkromné a rozpracované aktívne inzeráty, ktoré sa nepozerali viac ako 20 hodín
create or replace function public.skener_na_obnovu(p_kluc text, p_pocet int default 150) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(x) from (
      select i.id, i.portal, i.url, cardinality(coalesce(a.fotky, '{}')) = 0 as fotky
      from inzeraty i
      join archiv a on a.inzerat_id = i.id
      left join oznacenia o on o.inzerat_id = i.id
      left join prevzatia p on p.inzerat_id = i.id
      where i.aktivny and i.url is not null
        and (coalesce(o.predajca_typ, i.predajca_typ) <> 'rk' or p.makler_id is not null)
        and coalesce(a.aktualizovane, a.ulozene) < now() - interval '20 hours'
      order by coalesce(a.aktualizovane, a.ulozene)
      limit p_pocet
    ) x), '[]'::jsonb);
end $$;
revoke execute on function public.skener_na_obnovu(text, int) from public, authenticated;
grant execute on function public.skener_na_obnovu(text, int) to anon;

insert into public.novinky (nazov, popis, ciel, pre_koho)
select 'Celý text a fotky inzerátu aj v Klientoch',
   'V Klientoch → Predávajúci je pri každom inzeráte uložený celý text, parametre a fotky – aj keď predajca inzerát zmaže. Text skopíruješ jedným ťuknutím. Skener každú noc znova pozrie súkromné inzeráty: keď predajca zmení text alebo dopíše telefón, uloží to a pôvodné znenie si nechá.',
   'predavajuci', 'vsetci'
where not exists (select 1 from public.novinky where nazov = 'Celý text a fotky inzerátu aj v Klientoch');

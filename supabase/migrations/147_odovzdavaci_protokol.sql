-- =====================================================================
-- 147: Odovzdávací protokol pri nehnuteľnosti
--  * maklér ponuky (alebo administrátor) vyplní pri odovzdaní: stavy meračov s fotkami, kľúče, stav a vybavenie,
--    obe strany sa podpíšu prstom priamo na displeji
--  * po podpise oboch strán sa protokol uzavrie a už sa nedá meniť (zmazať ho môže len administrátor)
--  * PDF pre obe strany: verejná stránka protokol.html?t=… (tlač / Uložiť ako PDF), odkaz pošle maklér cez WhatsApp, SMS alebo e-mail
--  * fotky meračov sú v súkromnom úložisku protokoly/<kancelária>/<kľúč protokolu>/… – vidí ich len ten, kto má odkaz
-- =====================================================================
create table if not exists public.odovzdavacie_protokoly (
  id bigint generated always as identity primary key,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  kancelaria_id bigint not null references public.kancelarie(id) on delete cascade,
  token text not null unique check (length(token) >= 32),
  druh text not null default 'predaj' check (druh in ('predaj', 'prenajom', 'vratenie')),
  datum timestamptz not null default now(),
  miesto text check (miesto is null or length(miesto) <= 300),
  odovzdavajuci text check (odovzdavajuci is null or length(odovzdavajuci) <= 200),
  odovzdavajuci_kontakt text check (odovzdavajuci_kontakt is null or length(odovzdavajuci_kontakt) <= 120),
  preberajuci text check (preberajuci is null or length(preberajuci) <= 200),
  preberajuci_kontakt text check (preberajuci_kontakt is null or length(preberajuci_kontakt) <= 120),
  meradla jsonb not null default '[]' check (jsonb_typeof(meradla) = 'array' and jsonb_array_length(meradla) <= 15 and length(meradla::text) <= 20000),
  kluce jsonb not null default '[]' check (jsonb_typeof(kluce) = 'array' and jsonb_array_length(kluce) <= 20 and length(kluce::text) <= 6000),
  stav text check (stav is null or length(stav) <= 3000),
  vybavenie text check (vybavenie is null or length(vybavenie) <= 3000),
  poznamka text check (poznamka is null or length(poznamka) <= 3000),
  podpis_odovzdavajuci text check (podpis_odovzdavajuci is null or (podpis_odovzdavajuci like 'data:image/png;base64,%' and length(podpis_odovzdavajuci) <= 300000)),
  podpis_preberajuci text check (podpis_preberajuci is null or (podpis_preberajuci like 'data:image/png;base64,%' and length(podpis_preberajuci) <= 300000)),
  podpisane timestamptz,
  vytvoril uuid,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists odovzdavacie_protokoly_nehnutelnost on public.odovzdavacie_protokoly (nehnutelnost_id);
alter table public.odovzdavacie_protokoly enable row level security;

-- kto smie protokol vidieť a meniť: administrátor kancelárie, kto ho založil, alebo maklér ponuky
create or replace function public._protokol_smie(pr odovzdavacie_protokoly) returns boolean
language sql stable security definer set search_path = public as $$
  select pr.kancelaria_id = aktivna_kancelaria() and ja_aktivny() and ma_pristup('nehnutelnosti')
    and (ja_admin() or pr.vytvoril = auth.uid() or exists (select 1 from nehnutelnosti n where n.id = pr.nehnutelnost_id and n.makler_id = auth.uid()))
$$;
revoke execute on function public._protokol_smie(odovzdavacie_protokoly) from public, anon;
grant execute on function public._protokol_smie(odovzdavacie_protokoly) to authenticated;

drop policy if exists protokoly_citat on public.odovzdavacie_protokoly;
create policy protokoly_citat on public.odovzdavacie_protokoly for select to authenticated using (_protokol_smie(odovzdavacie_protokoly));
revoke all on public.odovzdavacie_protokoly from anon, authenticated;
grant select on public.odovzdavacie_protokoly to authenticated;

-- nový rozpracovaný protokol: predvyplní druh, miesto a majiteľa z ponuky
create or replace function public.protokol_novy(p_nehnutelnost bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti; i nehnutelnosti_interne; pr odovzdavacie_protokoly;
begin
  perform _over_aktivny();
  if not ma_pristup('nehnutelnosti') then raise exception 'Nemáš prístup k ponukám.' using errcode = '42501'; end if;
  select * into n from nehnutelnosti where id = p_nehnutelnost;
  if not found or n.kancelaria_id <> aktivna_kancelaria() then raise exception 'Ponuka sa nenašla.'; end if;
  if not (ja_admin() or n.makler_id = auth.uid()) then raise exception 'Protokol môže spísať maklér ponuky alebo administrátor.' using errcode = '42501'; end if;
  if (select count(*) from odovzdavacie_protokoly where nehnutelnost_id = n.id) >= 20 then raise exception 'Pri ponuke je priveľa protokolov.'; end if;
  select * into i from nehnutelnosti_interne where nehnutelnost_id = n.id;
  insert into odovzdavacie_protokoly (nehnutelnost_id, kancelaria_id, token, druh, miesto, odovzdavajuci, odovzdavajuci_kontakt, vytvoril)
  values (n.id, n.kancelaria_id, encode(extensions.gen_random_bytes(18), 'hex'),
          case when n.transakcia = 'prenajom' then 'prenajom' else 'predaj' end,
          left(coalesce(nullif(trim(i.ulica_interna), ''), nullif(concat_ws(', ', nullif(n.ulica, ''), nullif(n.cast_obce, ''), nullif(n.obec, '')), '')), 300),
          left(nullif(trim(i.majitel_meno), ''), 200),
          left(coalesce(nullif(trim(i.majitel_telefon), ''), nullif(trim(i.majitel_email), '')), 120),
          auth.uid())
  returning * into pr;
  return to_jsonb(pr);
end $$;
revoke execute on function public.protokol_novy(bigint) from public, anon;
grant execute on function public.protokol_novy(bigint) to authenticated;

-- uloženie rozpracovaného protokolu; p.uzavriet = true → kontrola podpisov a uzavretie (potom sa už nedá meniť)
create or replace function public.protokol_ulozit(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr odovzdavacie_protokoly; m jsonb; k jsonb; cesta text;
begin
  perform _over_aktivny();
  select * into pr from odovzdavacie_protokoly where id = p_id for update;
  if not found or not _protokol_smie(pr) then raise exception 'Protokol sa nenašiel.'; end if;
  if pr.podpisane is not null then raise exception 'Protokol je už podpísaný a nedá sa meniť.'; end if;
  if jsonb_typeof(coalesce(p, 'null')) <> 'object' then raise exception 'Chýbajú údaje protokolu.'; end if;
  cesta := pr.kancelaria_id::text || '/' || pr.token || '/';

  if p ? 'meradla' then
    if jsonb_typeof(p->'meradla') <> 'array' or jsonb_array_length(p->'meradla') > 15 then raise exception 'Meračov môže byť najviac 15.'; end if;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'druh', left(coalesce(nullif(trim(x->>'druh'), ''), 'Merač'), 60),
             'cislo', nullif(left(trim(coalesce(x->>'cislo', '')), 60), ''),
             'stav', nullif(left(trim(coalesce(x->>'stav', '')), 40), ''),
             'jednotka', nullif(left(trim(coalesce(x->>'jednotka', '')), 12), ''),
             'foto', case when starts_with(coalesce(x->>'foto', ''), cesta) and length(x->>'foto') <= 200 and position('..' in x->>'foto') = 0 then x->>'foto' end)) order by o), '[]')
      into m
      from jsonb_array_elements(p->'meradla') with ordinality as t(x, o)
     where jsonb_typeof(x) = 'object'
       and (nullif(trim(coalesce(x->>'cislo', '')), '') is not null or nullif(trim(coalesce(x->>'stav', '')), '') is not null or starts_with(coalesce(x->>'foto', ''), cesta));
  else m := pr.meradla; end if;

  if p ? 'kluce' then
    if jsonb_typeof(p->'kluce') <> 'array' or jsonb_array_length(p->'kluce') > 20 then raise exception 'Kľúčov môže byť najviac 20 riadkov.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('co', left(trim(x->>'co'), 80),
             'pocet', least(99, greatest(1, case when coalesce(x->>'pocet', '') ~ '^\d{1,3}$' then (x->>'pocet')::int else 1 end))) order by o), '[]')
      into k
      from jsonb_array_elements(p->'kluce') with ordinality as t(x, o)
     where jsonb_typeof(x) = 'object' and nullif(trim(coalesce(x->>'co', '')), '') is not null;
  else k := pr.kluce; end if;

  if p ? 'podpis_odovzdavajuci' and p->>'podpis_odovzdavajuci' is not null and p->>'podpis_odovzdavajuci' !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then raise exception 'Podpis sa nepodarilo uložiť.'; end if;
  if p ? 'podpis_preberajuci' and p->>'podpis_preberajuci' is not null and p->>'podpis_preberajuci' !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then raise exception 'Podpis sa nepodarilo uložiť.'; end if;

  update odovzdavacie_protokoly set
    druh = case when p->>'druh' in ('predaj', 'prenajom', 'vratenie') then p->>'druh' else druh end,
    datum = case when coalesce(p->>'datum', '') <> '' then (p->>'datum')::timestamptz else datum end,
    miesto = case when p ? 'miesto' then nullif(left(trim(coalesce(p->>'miesto', '')), 300), '') else miesto end,
    odovzdavajuci = case when p ? 'odovzdavajuci' then nullif(left(trim(coalesce(p->>'odovzdavajuci', '')), 200), '') else odovzdavajuci end,
    odovzdavajuci_kontakt = case when p ? 'odovzdavajuci_kontakt' then nullif(left(trim(coalesce(p->>'odovzdavajuci_kontakt', '')), 120), '') else odovzdavajuci_kontakt end,
    preberajuci = case when p ? 'preberajuci' then nullif(left(trim(coalesce(p->>'preberajuci', '')), 200), '') else preberajuci end,
    preberajuci_kontakt = case when p ? 'preberajuci_kontakt' then nullif(left(trim(coalesce(p->>'preberajuci_kontakt', '')), 120), '') else preberajuci_kontakt end,
    meradla = m, kluce = k,
    stav = case when p ? 'stav' then nullif(left(trim(coalesce(p->>'stav', '')), 3000), '') else stav end,
    vybavenie = case when p ? 'vybavenie' then nullif(left(trim(coalesce(p->>'vybavenie', '')), 3000), '') else vybavenie end,
    poznamka = case when p ? 'poznamka' then nullif(left(trim(coalesce(p->>'poznamka', '')), 3000), '') else poznamka end,
    podpis_odovzdavajuci = case when p ? 'podpis_odovzdavajuci' then p->>'podpis_odovzdavajuci' else podpis_odovzdavajuci end,
    podpis_preberajuci = case when p ? 'podpis_preberajuci' then p->>'podpis_preberajuci' else podpis_preberajuci end,
    upravene = now()
  where id = pr.id
  returning * into pr;

  if coalesce((p->>'uzavriet')::boolean, false) then
    if pr.odovzdavajuci is null or pr.preberajuci is null then raise exception 'Doplň mená oboch strán.'; end if;
    if pr.podpis_odovzdavajuci is null or pr.podpis_preberajuci is null then raise exception 'Chýba podpis oboch strán.'; end if;
    update odovzdavacie_protokoly set podpisane = now() where id = pr.id returning * into pr;
  end if;
  return to_jsonb(pr);
end $$;
revoke execute on function public.protokol_ulozit(bigint, jsonb) from public, anon;
grant execute on function public.protokol_ulozit(bigint, jsonb) to authenticated;

-- zmazanie: rozpracovaný maklér, podpísaný len administrátor
create or replace function public.protokol_zmazat(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare pr odovzdavacie_protokoly;
begin
  perform _over_aktivny();
  select * into pr from odovzdavacie_protokoly where id = p_id;
  if not found or not _protokol_smie(pr) then raise exception 'Protokol sa nenašiel.'; end if;
  if pr.podpisane is not null and not ja_admin() then raise exception 'Podpísaný protokol môže zmazať len administrátor.' using errcode = '42501'; end if;
  delete from odovzdavacie_protokoly where id = pr.id;
end $$;
revoke execute on function public.protokol_zmazat(bigint) from public, anon;
grant execute on function public.protokol_zmazat(bigint) to authenticated;

-- verejná stránka protokolu (obe strany, tlač / PDF) – bez kontaktov strán
create or replace function public.protokol_verejny(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr odovzdavacie_protokoly; n nehnutelnosti;
begin
  if length(coalesce(p_token, '')) < 32 then return null; end if;
  select * into pr from odovzdavacie_protokoly where token = p_token;
  if not found then return null; end if;
  select * into n from nehnutelnosti where id = pr.nehnutelnost_id;
  return jsonb_build_object('id', pr.id, 'druh', pr.druh, 'datum', pr.datum, 'miesto', pr.miesto,
    'odovzdavajuci', pr.odovzdavajuci, 'preberajuci', pr.preberajuci, 'meradla', pr.meradla, 'kluce', pr.kluce,
    'stav', pr.stav, 'vybavenie', pr.vybavenie, 'poznamka', pr.poznamka,
    'podpis_odovzdavajuci', pr.podpis_odovzdavajuci, 'podpis_preberajuci', pr.podpis_preberajuci, 'podpisane', pr.podpisane,
    'ponuka', jsonb_build_object('nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'cislo', n.cislo, 'transakcia', n.transakcia, 'obec', n.obec),
    'makler', _verejna(n) -> 'makler',
    'kanc', _kancelaria_verejne(pr.kancelaria_id), 'kancelaria_id', pr.kancelaria_id);
end $$;
revoke execute on function public.protokol_verejny(text) from public;
grant execute on function public.protokol_verejny(text) to anon, authenticated;

-- ---------------------------------------------------------------- fotky meračov
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protokoly', 'protokoly', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- cesta <kancelária>/<kľúč protokolu>/<súbor>; čítať smie ktokoľvek s kľúčom (stránka protokolu), nahrávať a mazať
-- maklér protokolu, kým nie je podpísaný (administrátor aj potom – pri zmazaní)
create or replace function public._protokol_subor(p_name text, p_zapis boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text[] := storage.foldername(p_name); pr odovzdavacie_protokoly;
begin
  if coalesce(array_length(f, 1), 0) <> 2 or length(coalesce(f[2], '')) < 32 then return false; end if;
  select * into pr from odovzdavacie_protokoly where token = f[2] and kancelaria_id::text = f[1];
  if not found then return false; end if;
  if not p_zapis then return true; end if;
  return auth.uid() is not null and _protokol_smie(pr) and (pr.podpisane is null or ja_admin());
end $$;
revoke execute on function public._protokol_subor(text, boolean) from public;
grant execute on function public._protokol_subor(text, boolean) to anon, authenticated;

drop policy if exists protokoly_subory_nahrat on storage.objects;
create policy protokoly_subory_nahrat on storage.objects for insert to authenticated
  with check (bucket_id = 'protokoly' and public._protokol_subor(name, true));
drop policy if exists protokoly_subory_citat on storage.objects;
create policy protokoly_subory_citat on storage.objects for select to anon, authenticated
  using (bucket_id = 'protokoly' and public._protokol_subor(name, false));
drop policy if exists protokoly_subory_zmazat on storage.objects;
create policy protokoly_subory_zmazat on storage.objects for delete to authenticated
  using (bucket_id = 'protokoly' and public._protokol_subor(name, true));

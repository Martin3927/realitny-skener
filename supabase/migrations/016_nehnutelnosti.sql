-- =====================================================================
-- Nehnuteľnosti v ponuke kancelárie (skúšobná verzia)
--  * nehnutelnosti          – údaje ponuky (vidia všetci makléri kancelárie)
--  * nehnutelnosti_interne  – majiteľ, zmluva, provízia, interná ulica, poznámka, dokumenty
--                             (vidí len zodpovedný maklér a administrátor)
--  * kancelaria – príprava na viac realitných kancelárií v jednom softe
-- =====================================================================
create table if not exists public.nehnutelnosti (
  id bigint generated always as identity primary key,
  kancelaria text not null default 'alpha',
  cislo text,                                   -- interné ID / číslo ponuky
  stav text not null default 'koncept' check (stav in ('koncept', 'aktivne', 'rezervovane', 'predane', 'neaktivne', 'archiv')),
  transakcia text not null default 'predaj' check (transakcia in ('predaj', 'prenajom')),
  kategoria text,
  typ text,
  nazov text not null default '',
  intro text not null default '',
  popis text not null default '',
  makler_id uuid references public.makleri(id) on delete set null,
  -- lokalita
  kraj text, okres text, obec text, cast_obce text, ulica text,
  lat double precision, lon double precision,
  -- cena
  cena numeric, typ_ceny text, text_k_cene text, cena_energie text,
  zobrazit_cenu boolean not null default true,
  -- parametre
  plocha_uzitkova numeric, plocha_zastavana numeric, plocha_pozemku numeric,
  izby int, poschodie int, pocet_podlazi int, rok_vystavby int,
  vlastnictvo text, stav_objektu text, konstrukcia text, energ_certifikat text, kurenie text,
  orientacia text[] not null default '{}',
  vybavenie text[] not null default '{}',
  exkluzivne boolean not null default false,
  vhodne_pre_studentov boolean not null default false,
  virtualna_prehliadka text, video text,
  zobrazit_mapu boolean not null default true,
  specialne text[] not null default '{}',       -- napr. top, novinka, zľava
  -- multimédiá: [{cesta | url, poradie}]
  fotky jsonb not null default '[]',
  zdroj_inzerat text,                           -- id inzerátu zo skenera, ak bola ponuka prenesená
  historia_cien jsonb not null default '[]',
  vytvoril uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists nehnutelnosti_stav on public.nehnutelnosti (kancelaria, stav);

create table if not exists public.nehnutelnosti_interne (
  nehnutelnost_id bigint primary key references public.nehnutelnosti(id) on delete cascade,
  majitel_meno text, majitel_telefon text, majitel_email text,
  ulica_interna text,
  zmluva boolean not null default false, zmluva_typ text, zmluva_od date, zmluva_do date,
  provizia numeric, provizia_typ text not null default 'eur' check (provizia_typ in ('eur', 'pct')),
  provizia_rk numeric, provizia_rk_typ text not null default 'eur' check (provizia_rk_typ in ('eur', 'pct')),
  poznamka text,
  dokumenty jsonb not null default '[]'          -- [{cesta, nazov}] v súkromnom úložisku
);

alter table public.nehnutelnosti enable row level security;
alter table public.nehnutelnosti_interne enable row level security;
do $$ begin
  create policy nehnutelnosti_citat on public.nehnutelnosti for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy nehnutelnosti_interne_citat on public.nehnutelnosti_interne for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from nehnutelnosti n where n.id = nehnutelnost_id and n.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
revoke all on public.nehnutelnosti, public.nehnutelnosti_interne from anon, authenticated;
grant select on public.nehnutelnosti, public.nehnutelnosti_interne to authenticated;

-- uloženie (nová aj úprava); p = verejné údaje, p_int = interné údaje
create or replace function public.ulozit_nehnutelnost(p jsonb, p_int jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_stara nehnutelnosti; v_makler uuid; v_cena numeric;
begin
  perform _over_aktivny();
  v_makler := coalesce(nullif(p->>'makler_id', '')::uuid, auth.uid());
  if not ja_admin() and v_makler <> auth.uid() then raise exception 'Ponuku môžete zapísať len sebe.'; end if;
  if v_id is not null then
    select * into v_stara from nehnutelnosti where id = v_id for update;
    if not found then raise exception 'Ponuka neexistuje.'; end if;
    if not ja_admin() and v_stara.makler_id is distinct from auth.uid() then raise exception 'Upraviť môže len zodpovedný maklér alebo administrátor.'; end if;
  end if;
  if length(coalesce(p->>'nazov', '')) > 120 then raise exception 'Názov je príliš dlhý.'; end if;
  if length(coalesce(p->>'intro', '')) > 300 then raise exception 'Intro je príliš dlhé.'; end if;
  v_cena := nullif(p->>'cena', '')::numeric;

  if v_id is null then
    insert into nehnutelnosti (vytvoril, makler_id) values (auth.uid(), v_makler) returning id into v_id;
  end if;
  update nehnutelnosti set
    cislo = nullif(trim(p->>'cislo'), ''),
    stav = coalesce(nullif(p->>'stav', ''), stav),
    transakcia = coalesce(nullif(p->>'transakcia', ''), 'predaj'),
    kategoria = nullif(p->>'kategoria', ''), typ = nullif(p->>'typ', ''),
    nazov = coalesce(p->>'nazov', ''), intro = coalesce(p->>'intro', ''), popis = coalesce(p->>'popis', ''),
    makler_id = v_makler,
    kraj = nullif(p->>'kraj', ''), okres = nullif(p->>'okres', ''), obec = nullif(p->>'obec', ''),
    cast_obce = nullif(p->>'cast_obce', ''), ulica = nullif(p->>'ulica', ''),
    lat = nullif(p->>'lat', '')::float8, lon = nullif(p->>'lon', '')::float8,
    cena = v_cena, typ_ceny = nullif(p->>'typ_ceny', ''), text_k_cene = nullif(p->>'text_k_cene', ''),
    cena_energie = nullif(p->>'cena_energie', ''), zobrazit_cenu = coalesce((p->>'zobrazit_cenu')::boolean, true),
    plocha_uzitkova = nullif(p->>'plocha_uzitkova', '')::numeric, plocha_zastavana = nullif(p->>'plocha_zastavana', '')::numeric,
    plocha_pozemku = nullif(p->>'plocha_pozemku', '')::numeric,
    izby = nullif(p->>'izby', '')::int, poschodie = nullif(p->>'poschodie', '')::int, pocet_podlazi = nullif(p->>'pocet_podlazi', '')::int,
    rok_vystavby = nullif(p->>'rok_vystavby', '')::int,
    vlastnictvo = nullif(p->>'vlastnictvo', ''), stav_objektu = nullif(p->>'stav_objektu', ''), konstrukcia = nullif(p->>'konstrukcia', ''),
    energ_certifikat = nullif(p->>'energ_certifikat', ''), kurenie = nullif(p->>'kurenie', ''),
    orientacia = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'orientacia') x), '{}'),
    vybavenie = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'vybavenie') x), '{}'),
    specialne = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'specialne') x), '{}'),
    exkluzivne = coalesce((p->>'exkluzivne')::boolean, false), vhodne_pre_studentov = coalesce((p->>'vhodne_pre_studentov')::boolean, false),
    virtualna_prehliadka = nullif(p->>'virtualna_prehliadka', ''), video = nullif(p->>'video', ''),
    zobrazit_mapu = coalesce((p->>'zobrazit_mapu')::boolean, true),
    fotky = coalesce(p->'fotky', '[]'::jsonb),
    zdroj_inzerat = coalesce(nullif(p->>'zdroj_inzerat', ''), zdroj_inzerat),
    historia_cien = case when v_cena is not null and v_cena is distinct from v_stara.cena
                         then historia_cien || jsonb_build_array(jsonb_build_array(now()::date, v_cena)) else historia_cien end,
    upravene = now()
  where id = v_id;

  insert into nehnutelnosti_interne (nehnutelnost_id) values (v_id) on conflict do nothing;
  if p_int is not null then
    update nehnutelnosti_interne set
      majitel_meno = nullif(trim(p_int->>'majitel_meno'), ''), majitel_telefon = nullif(trim(p_int->>'majitel_telefon'), ''),
      majitel_email = nullif(trim(p_int->>'majitel_email'), ''), ulica_interna = nullif(trim(p_int->>'ulica_interna'), ''),
      zmluva = coalesce((p_int->>'zmluva')::boolean, false), zmluva_typ = nullif(p_int->>'zmluva_typ', ''),
      zmluva_od = nullif(p_int->>'zmluva_od', '')::date, zmluva_do = nullif(p_int->>'zmluva_do', '')::date,
      provizia = nullif(p_int->>'provizia', '')::numeric, provizia_typ = coalesce(nullif(p_int->>'provizia_typ', ''), 'eur'),
      provizia_rk = nullif(p_int->>'provizia_rk', '')::numeric, provizia_rk_typ = coalesce(nullif(p_int->>'provizia_rk_typ', ''), 'eur'),
      poznamka = nullif(p_int->>'poznamka', ''), dokumenty = coalesce(p_int->'dokumenty', '[]'::jsonb)
    where nehnutelnost_id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.zmenit_stav_nehnutelnosti(p_id bigint, p_stav text) returns void
language plpgsql security definer set search_path = public as $$
declare v nehnutelnosti;
begin
  perform _over_aktivny();
  if p_stav not in ('koncept', 'aktivne', 'rezervovane', 'predane', 'neaktivne', 'archiv') then raise exception 'Neznámy stav.'; end if;
  select * into v from nehnutelnosti where id = p_id for update;
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  if not ja_admin() and v.makler_id is distinct from auth.uid() then raise exception 'Stav môže zmeniť len zodpovedný maklér alebo administrátor.'; end if;
  update nehnutelnosti set stav = p_stav, upravene = now() where id = p_id;
end $$;

revoke execute on function public.ulozit_nehnutelnost(jsonb, jsonb), public.zmenit_stav_nehnutelnosti(bigint, text) from public, anon;
grant execute on function public.ulozit_nehnutelnost(jsonb, jsonb), public.zmenit_stav_nehnutelnosti(bigint, text) to authenticated;

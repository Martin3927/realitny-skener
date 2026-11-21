-- Dopyt: stav nehnuteľnosti ako kritérium + rubrika „Mimo ponuky“ (21. 11. 2026)
--   1. V dopyte klienta sa dá vyklikať, v akom stave nehnuteľnosť hľadá (novostavba, po rekonštrukcii, pôvodný stav…);
--      párovanie ho berie do úvahy pri ponukách kancelárie (pri súkromných inzerátoch zo skenera stav nepoznáme – prejdú).
--   2. Mimo ponuky = nehnuteľnosti, ktoré nie sú zverejnené (majiteľ zvažuje predaj, tichý predaj, tip). Jednoduchá karta
--      bez fotiek; parametre vidia makléri kancelárie, kontakt na majiteľa len maklér, ktorý ju zapísal, a administrátor
--      (rovnako ako kontakt klienta pri dopyte). Páruje sa s dopytmi kancelárie; klientovi sa neukazuje nikde
--      (ani v klientskej zóne, ani v správe s ponukami).
--   3. Zhoda zvoní: maklérovi klienta, keď pribudne nehnuteľnosť mimo ponuky pre jeho klienta, a maklérovi nehnuteľnosti,
--      keď kolega zapíše klienta, ktorý ju hľadá. Vlastné zhody nezvonia – maklér ich vidí hneď na karte.

-- ---------------------------------------------------------------- 1. stav nehnuteľnosti v dopyte
alter table public.dopyty add column if not exists stavy text[] not null default '{}';   -- prázdne = akýkoľvek stav

create or replace function public._sedi(d dopyty, p_transakcia text, p_kategoria text, p_typ text, p_obec text, p_okres text,
                                         p_cena numeric, p_plocha numeric, p_izby int, p_stav text) returns boolean
language sql immutable as $$
  select d.stav = 'aktivny'
    and d.transakcia = coalesce(p_transakcia, 'predaj')
    and (cardinality(d.kategorie) = 0 or p_kategoria = any(d.kategorie))
    and (cardinality(d.typy) = 0 or p_typ is null or p_typ = any(d.typy))
    and ((cardinality(d.obce) = 0 and cardinality(d.okresy) = 0)
         or _norm(p_obec) = any(select _norm(x) from unnest(d.obce) x)
         or _norm(p_okres) = any(select _norm(x) from unnest(d.okresy) x))
    and (p_cena is null or ((d.cena_od is null or p_cena >= d.cena_od) and (d.cena_do is null or p_cena <= d.cena_do * 1.05)))
    and (p_plocha is null or ((d.plocha_od is null or p_plocha >= d.plocha_od * 0.95) and (d.plocha_do is null or p_plocha <= d.plocha_do)))
    and (p_izby is null or ((d.izby_od is null or p_izby >= d.izby_od) and (d.izby_do is null or p_izby <= d.izby_do)))
    -- nevyplnený stav nehnuteľnosti zhodu nezruší (maklér ho doplní alebo si to overí)
    and (cardinality(d.stavy) = 0 or nullif(btrim(p_stav), '') is null or lower(btrim(p_stav)) = any(d.stavy))
$$;

-- pôvodná podoba bez stavu (súkromné inzeráty zo skenera)
create or replace function public._sedi(d dopyty, p_transakcia text, p_kategoria text, p_typ text, p_obec text, p_okres text,
                                         p_cena numeric, p_plocha numeric, p_izby int) returns boolean
language sql immutable as $$
  select _sedi(d, p_transakcia, p_kategoria, p_typ, p_obec, p_okres, p_cena, p_plocha, p_izby, null::text)
$$;

create or replace function public._sedi_ponuka(d dopyty, n nehnutelnosti) returns boolean
language sql immutable as $$
  select _sedi(d, n.transakcia, n.kategoria, n.typ, n.obec, n.okres, n.cena,
               case when n.kategoria = 'pozemky' then n.plocha_pozemku else coalesce(n.plocha_uzitkova, n.plocha_pozemku) end, n.izby,
               n.stav_objektu)
$$;

-- ---------------------------------------------------------------- 2. nehnuteľnosti mimo ponuky
create table if not exists public.mimo_ponuky (
  id bigint generated always as identity primary key,
  kancelaria_id bigint not null references public.kancelarie(id),
  makler_id uuid references public.makleri(id) on delete set null,
  stav text not null default 'aktivna' check (stav in ('aktivna', 'archiv')),
  transakcia text not null default 'predaj' check (transakcia in ('predaj', 'prenajom')),
  kategoria text not null,
  typ text,
  obec text,
  okres text,
  cena numeric,
  plocha numeric,
  izby int,
  stav_objektu text,
  popis text not null default '',          -- vidia aj kolegovia
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
create index if not exists mimo_ponuky_kancelaria on public.mimo_ponuky (kancelaria_id, stav);

-- kontakt na majiteľa: len maklér, ktorý nehnuteľnosť zapísal, a administrátor
create table if not exists public.mimo_ponuky_kontakty (
  mimo_id bigint primary key references public.mimo_ponuky(id) on delete cascade,
  kancelaria_id bigint not null references public.kancelarie(id),
  meno text,
  telefon text,
  email text,
  adresa text,
  poznamka text
);
create index if not exists mimo_ponuky_kontakty_kancelaria on public.mimo_ponuky_kontakty (kancelaria_id);

drop trigger if exists nastav_kancelariu on public.mimo_ponuky;
create trigger nastav_kancelariu before insert on public.mimo_ponuky for each row execute function public._nastav_kancelariu();
drop trigger if exists zz_straz_kancelariu on public.mimo_ponuky;
create trigger zz_straz_kancelariu before insert or update or delete on public.mimo_ponuky for each row execute function public._straz_kancelariu();
drop trigger if exists zz_straz_kancelariu on public.mimo_ponuky_kontakty;
create trigger zz_straz_kancelariu before insert or update or delete on public.mimo_ponuky_kontakty for each row execute function public._straz_kancelariu();

alter table public.mimo_ponuky enable row level security;
alter table public.mimo_ponuky_kontakty enable row level security;
drop policy if exists mimo_ponuky_citat on public.mimo_ponuky;
create policy mimo_ponuky_citat on public.mimo_ponuky for select to authenticated using ((select ja_aktivny()));
drop policy if exists pristup_mimo_ponuky on public.mimo_ponuky;
create policy pristup_mimo_ponuky on public.mimo_ponuky as restrictive for select to authenticated using ((select ma_pristup('klienti')));
drop policy if exists kancelaria_len_moja on public.mimo_ponuky;
create policy kancelaria_len_moja on public.mimo_ponuky as restrictive for all to authenticated
  using (kancelaria_id = (select aktivna_kancelaria())) with check (kancelaria_id = (select aktivna_kancelaria()));
drop policy if exists mimo_ponuky_kontakty_citat on public.mimo_ponuky_kontakty;
create policy mimo_ponuky_kontakty_citat on public.mimo_ponuky_kontakty for select to authenticated
  using ((select ja_aktivny()) and ((select ja_admin()) or exists (select 1 from mimo_ponuky m where m.id = mimo_id and m.makler_id = (select auth.uid()))));
drop policy if exists pristup_mimo_ponuky_kontakty on public.mimo_ponuky_kontakty;
create policy pristup_mimo_ponuky_kontakty on public.mimo_ponuky_kontakty as restrictive for select to authenticated using ((select ma_pristup('klienti')));
drop policy if exists kancelaria_len_moja on public.mimo_ponuky_kontakty;
create policy kancelaria_len_moja on public.mimo_ponuky_kontakty as restrictive for all to authenticated
  using (kancelaria_id = (select aktivna_kancelaria())) with check (kancelaria_id = (select aktivna_kancelaria()));
revoke all on public.mimo_ponuky, public.mimo_ponuky_kontakty from anon, authenticated;
grant select on public.mimo_ponuky, public.mimo_ponuky_kontakty to authenticated;

create or replace function public._sedi_mimo(d dopyty, m mimo_ponuky) returns boolean
language sql immutable as $$
  select m.stav = 'aktivna' and m.kancelaria_id = d.kancelaria_id
     and _sedi(d, m.transakcia, m.kategoria, m.typ, m.obec, m.okres, m.cena, m.plocha, m.izby, m.stav_objektu)
$$;

create or replace function public._nazov_mimo(m mimo_ponuky) returns text
language sql immutable as $$
  select left(concat_ws(', ', coalesce(nullif(m.typ, ''), m.kategoria), nullif(m.obec, '')), 90) || coalesce(' · ' || _eur(m.cena), '')
$$;

-- zápis / úprava nehnuteľnosti mimo ponuky
create or replace function public.ulozit_mimo(p jsonb, p_k jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p ->> 'id', '')::bigint; v_makler uuid; v_stara mimo_ponuky; v_kanc bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not ma_pristup('klienti') then raise exception 'Nemáte prístup ku klientom.' using errcode = '42501'; end if;
  if nullif(p ->> 'kategoria', '') is null then raise exception 'Vyberte druh nehnuteľnosti.'; end if;
  v_makler := coalesce(nullif(p ->> 'makler_id', '')::uuid, auth.uid());
  if not ja_admin() and v_makler <> auth.uid() then raise exception 'Nehnuteľnosť môžete zapísať len sebe.' using errcode = '42501'; end if;
  if not exists (select 1 from makleri where id = v_makler and kancelaria_id = v_kanc) then raise exception 'Maklér nie je z vašej kancelárie.'; end if;
  if v_id is not null then
    select * into v_stara from mimo_ponuky where id = v_id and kancelaria_id = v_kanc for update;
    if not found then raise exception 'Nehnuteľnosť neexistuje.'; end if;
    if not ja_admin() and v_stara.makler_id is distinct from auth.uid() then
      raise exception 'Upraviť môže len maklér, ktorý nehnuteľnosť zapísal, alebo administrátor.' using errcode = '42501';
    end if;
  else
    insert into mimo_ponuky (kancelaria_id, makler_id, kategoria) values (v_kanc, v_makler, p ->> 'kategoria') returning id into v_id;
  end if;
  update mimo_ponuky set
    makler_id = v_makler,
    transakcia = case when p ->> 'transakcia' = 'prenajom' then 'prenajom' else 'predaj' end,
    kategoria = p ->> 'kategoria',
    typ = nullif(btrim(p ->> 'typ'), ''),
    obec = nullif(btrim(p ->> 'obec'), ''),
    okres = nullif(btrim(p ->> 'okres'), ''),
    cena = nullif(p ->> 'cena', '')::numeric,
    plocha = nullif(p ->> 'plocha', '')::numeric,
    izby = nullif(p ->> 'izby', '')::int,
    stav_objektu = nullif(lower(btrim(p ->> 'stav_objektu')), ''),
    popis = left(coalesce(p ->> 'popis', ''), 1000),
    upravene = now()
  where id = v_id;
  insert into mimo_ponuky_kontakty (mimo_id, kancelaria_id) values (v_id, v_kanc) on conflict do nothing;
  if p_k is not null then
    update mimo_ponuky_kontakty set meno = nullif(btrim(p_k ->> 'meno'), ''), telefon = nullif(btrim(p_k ->> 'telefon'), ''),
      email = nullif(btrim(p_k ->> 'email'), ''), adresa = nullif(btrim(p_k ->> 'adresa'), ''), poznamka = nullif(btrim(p_k ->> 'poznamka'), '')
    where mimo_id = v_id;
  end if;
  return v_id;
end $$;

-- do archívu / späť / zmazať (p_stav: 'aktivna' | 'archiv' | 'zmazat')
create or replace function public.zmenit_stav_mimo(p_id bigint, p_stav text) returns void
language plpgsql security definer set search_path = public as $$
declare m mimo_ponuky;
begin
  perform _over_aktivny();
  select * into m from mimo_ponuky where id = p_id and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Nehnuteľnosť neexistuje.'; end if;
  if not ja_admin() and m.makler_id is distinct from auth.uid() then
    raise exception 'Zmeniť to môže len maklér, ktorý nehnuteľnosť zapísal, alebo administrátor.' using errcode = '42501';
  end if;
  if p_stav = 'zmazat' then delete from mimo_ponuky where id = p_id;
  elsif p_stav in ('aktivna', 'archiv') then update mimo_ponuky set stav = p_stav, upravene = now() where id = p_id;
  else raise exception 'Neznámy stav.';
  end if;
end $$;

-- ---------------------------------------------------------------- 3. zhody do zvončeka
-- nová alebo zmenená nehnuteľnosť mimo ponuky → makléri klientov, ktorým sedí (okrem toho, kto ju zapísal)
create or replace function public._zhoda_mimo() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav <> 'aktivna' then return new; end if;
  for d in select * from dopyty where kancelaria_id = new.kancelaria_id and stav = 'aktivny' loop
    if _sedi_mimo(d, new) and d.makler_id is not null and d.makler_id is distinct from new.makler_id
       and exists (select 1 from makleri where id = d.makler_id and aktivny) then
      insert into zhody_oznamene (dopyt_id, ciel, kancelaria_id) values (d.id, 'm:' || new.id, d.kancelaria_id) on conflict do nothing;
      if found then
        insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id)
        values (d.makler_id, now(),
                '🤫 Nehnuteľnosť mimo ponuky pre vášho klienta – ' || _popis_dopytu(d) || ': ' || _nazov_mimo(new) ||
                coalesce(' · zapísal ' || (select meno from makleri where id = new.makler_id), '') || ' (Klienti → Mimo ponuky)',
                'zhoda', d.kancelaria_id);
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists mimo_ponuky_zhoda on public.mimo_ponuky;
create trigger mimo_ponuky_zhoda after insert or update of stav, transakcia, kategoria, typ, obec, okres, cena, plocha, izby, stav_objektu
  on public.mimo_ponuky for each row execute function public._zhoda_mimo();

-- nový alebo upravený dopyt → makléri nehnuteľností mimo ponuky, ktoré klient hľadá (bez mena klienta – kontakt je súkromný)
create or replace function public._zhoda_dopyt_mimo(p_dopyt bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d dopyty; m mimo_ponuky;
begin
  select * into d from dopyty where id = p_dopyt;
  if not found or d.stav <> 'aktivny' then return; end if;
  for m in select * from mimo_ponuky where kancelaria_id = d.kancelaria_id and stav = 'aktivna' loop
    if _sedi_mimo(d, m) and m.makler_id is not null and m.makler_id is distinct from d.makler_id
       and exists (select 1 from makleri where id = m.makler_id and aktivny) then
      insert into zhody_oznamene (dopyt_id, ciel, kancelaria_id) values (d.id, 'mk:' || m.id, d.kancelaria_id) on conflict do nothing;
      if found then
        insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id)
        values (m.makler_id, now(),
                '🤫 Kupujúci na vašu nehnuteľnosť mimo ponuky – ' || _nazov_mimo(m) || ': klienta má ' ||
                coalesce((select meno from makleri where id = d.makler_id), 'kolega') || ' (Klienti → Mimo ponuky)',
                'zhoda', d.kancelaria_id);
      end if;
    end if;
  end loop;
end $$;

-- uloženie dopytu: + stav nehnuteľnosti, + zhody s nehnuteľnosťami mimo ponuky
create or replace function public.ulozit_dopyt(p jsonb, p_k jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; v_makler uuid; v_stary dopyty;
begin
  perform _over_aktivny();
  v_makler := coalesce(nullif(p->>'makler_id', '')::uuid, auth.uid());
  if not ja_admin() and v_makler <> auth.uid() then raise exception 'Dopyt môžete zapísať len sebe.'; end if;
  if v_id is not null then
    select * into v_stary from dopyty where id = v_id for update;
    if not found then raise exception 'Dopyt neexistuje.'; end if;
    if not ja_admin() and v_stary.makler_id is distinct from auth.uid() then raise exception 'Upraviť môže len maklér klienta alebo administrátor.'; end if;
  else
    insert into dopyty (makler_id) values (v_makler) returning id into v_id;
  end if;
  update dopyty set
    makler_id = v_makler,
    stav = coalesce(nullif(p->>'stav', ''), stav),
    transakcia = coalesce(nullif(p->>'transakcia', ''), 'predaj'),
    kategorie = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'kategorie') x), '{}'),
    typy = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'typy') x), '{}'),
    obce = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'obce') x), '{}'),
    okresy = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'okresy') x), '{}'),
    -- staršie okno aplikácie stav neposiela – vtedy ostane, čo bolo
    stavy = case when jsonb_typeof(p->'stavy') = 'array' then coalesce((select array_agg(lower(x)) from jsonb_array_elements_text(p->'stavy') x), '{}') else stavy end,
    cena_od = nullif(p->>'cena_od', '')::numeric, cena_do = nullif(p->>'cena_do', '')::numeric,
    plocha_od = nullif(p->>'plocha_od', '')::numeric, plocha_do = nullif(p->>'plocha_do', '')::numeric,
    izby_od = nullif(p->>'izby_od', '')::int, izby_do = nullif(p->>'izby_do', '')::int,
    popis = left(coalesce(p->>'popis', ''), 1000),
    upravene = now()
  where id = v_id;
  insert into dopyty_kontakty (dopyt_id) values (v_id) on conflict do nothing;
  if p_k is not null then
    update dopyty_kontakty set meno = nullif(trim(p_k->>'meno'), ''), telefon = nullif(trim(p_k->>'telefon'), ''),
      email = nullif(trim(p_k->>'email'), ''), poznamka = nullif(trim(p_k->>'poznamka'), '')
    where dopyt_id = v_id;
  end if;
  perform _zhoda_dopyt_mimo(v_id);
  return v_id;
end $$;

-- klientska zóna kupujúceho: v „Hľadáte“ aj stav nehnuteľnosti (inak bez zmeny oproti 136)
create or replace function public.zona_kupujuceho(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k dopyty_kontakty; d dopyty; z jsonb; v_pred timestamptz; v jsonb; v_makler jsonb;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into k from dopyty_kontakty where zona_token = p_token;
  if not found then return null; end if;
  select * into d from dopyty where id = k.dopyt_id;
  z := _kz(d.kancelaria_id) -> 'kupujuci';
  select jsonb_build_object('id', m.id, 'meno', m.meno, 'meno_cele', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'email', m.email, 'telefon', m.telefon,
                            'foto', case when m.foto like 'data:%' then m.foto end, 'pohlavie', m.pohlavie)
    into v_makler from makleri m where m.id = d.makler_id and m.aktivny;
  if not (z ->> 'zapnute')::boolean or d.stav <> 'aktivny' then
    return jsonb_build_object('vypnute', true, 'makler', v_makler, 'kanc', _kancelaria_verejne(d.kancelaria_id), 'kancelaria_id', d.kancelaria_id);
  end if;
  v_pred := k.zona_videna;
  update dopyty_kontakty set zona_videna = now() where dopyt_id = d.id;
  select jsonb_build_object(
    'klient', nullif(split_part(btrim(coalesce(k.meno, '')), ' ', 1), ''),
    'hlada', jsonb_build_object('transakcia', d.transakcia, 'kategorie', to_jsonb(d.kategorie), 'typy', to_jsonb(d.typy), 'obce', to_jsonb(d.obce),
                                'okresy', to_jsonb(d.okresy), 'cena_od', d.cena_od, 'cena_do', d.cena_do, 'plocha_od', d.plocha_od,
                                'plocha_do', d.plocha_do, 'izby_od', d.izby_od, 'izby_do', d.izby_do, 'stavy', to_jsonb(d.stavy)),
    'ponuky', coalesce((select jsonb_agg(
                 (_verejna(n) - array['popis', 'intro', 'makler', 'lat', 'lon', 'ulica', 'vybavenie', 'specialne', 'video', 'virtualna_prehliadka'])
                 || jsonb_build_object('fotky', coalesce(jsonb_path_query_array(n.fotky, '$[0 to 0]'), '[]'::jsonb),
                                       'reakcia', p.reakcia, 'vybral_makler', coalesce(p.stav, '') = 'poslana',
                                       'nova', v_pred is not null and coalesce(case when p.stav = 'poslana' then p.poslane end, n.vytvorene) > v_pred)
                 order by coalesce(case when p.stav = 'poslana' then p.poslane end, n.vytvorene) desc)
               from nehnutelnosti n left join dopyty_ponuky p on p.dopyt_id = d.id and p.nehnutelnost_id = n.id
               where n.kancelaria_id = d.kancelaria_id and _zona_vidi(d, n, p.stav, (z ->> 'automaticky')::boolean)), '[]'::jsonb),
    'zona', z - 'zapnute',
    'makler', v_makler,
    'kanc', _kancelaria_verejne(d.kancelaria_id), 'kancelaria_id', d.kancelaria_id,
    'vygenerovane', now()) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- práva
revoke execute on function public._sedi(dopyty, text, text, text, text, text, numeric, numeric, int, text),
  public._sedi_mimo(dopyty, mimo_ponuky), public._nazov_mimo(mimo_ponuky), public._zhoda_mimo(), public._zhoda_dopyt_mimo(bigint) from public, anon, authenticated;
revoke execute on function public.ulozit_mimo(jsonb, jsonb), public.zmenit_stav_mimo(bigint, text) from public, anon;
grant execute on function public.ulozit_mimo(jsonb, jsonb), public.zmenit_stav_mimo(bigint, text) to authenticated;

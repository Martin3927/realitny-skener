-- =====================================================================
-- Nástroje k ponukám:
--  1. verejná stránka ponuky (aj pre web a portály) + počítadlo zobrazení
--  3. dopyty klientov a automatické párovanie s ponukami a inzerátmi skenera
--  4. obhliadky a report pre majiteľa (tajný odkaz, týždenný email)
--  5. upozornenie na končiacu zmluvu
--  telefón makléra (kontakt na verejnej stránke a letáku)
-- =====================================================================

-- ---------------------------------------------------------------- telefón makléra
alter table public.makleri add column if not exists telefon text;

create or replace function public.ulozit_telefon_maklera(p_id uuid, p_telefon text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if coalesce(p_id, auth.uid()) <> auth.uid() and not ja_admin() then raise exception 'Telefón inému maklérovi môže zmeniť len administrátor.'; end if;
  if length(coalesce(p_telefon, '')) > 30 then raise exception 'Telefón je príliš dlhý.'; end if;
  update makleri set telefon = nullif(trim(p_telefon), '') where id = coalesce(p_id, auth.uid());
end $$;

-- ---------------------------------------------------------------- zvonček: nové druhy upozornení a väzby
alter table public.pripomienky add column if not exists nehnutelnost_id bigint references public.nehnutelnosti(id) on delete set null;
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka'));

-- ---------------------------------------------------------------- verejné údaje ponuky
-- vracia len údaje, ktoré sa smú zverejniť (bez majiteľa, zmluvy, provízie, internej adresy)
create or replace function public._verejna(n nehnutelnosti) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id, 'kancelaria', n.kancelaria, 'cislo', n.cislo, 'stav', n.stav, 'transakcia', n.transakcia,
    'kategoria', n.kategoria, 'typ', n.typ, 'nazov', n.nazov, 'intro', n.intro, 'popis', n.popis,
    'kraj', n.kraj, 'okres', n.okres, 'obec', n.obec, 'cast_obce', n.cast_obce, 'ulica', n.ulica,
    'lat', case when n.zobrazit_mapu then n.lat end, 'lon', case when n.zobrazit_mapu then n.lon end,
    'cena', case when n.zobrazit_cenu then n.cena end, 'typ_ceny', n.typ_ceny, 'text_k_cene', n.text_k_cene,
    'cena_energie', n.cena_energie, 'zobrazit_cenu', n.zobrazit_cenu,
    'plocha_uzitkova', n.plocha_uzitkova, 'plocha_zastavana', n.plocha_zastavana, 'plocha_pozemku', n.plocha_pozemku,
    'izby', n.izby, 'poschodie', n.poschodie, 'pocet_podlazi', n.pocet_podlazi, 'rok_vystavby', n.rok_vystavby,
    'vlastnictvo', n.vlastnictvo, 'stav_objektu', n.stav_objektu, 'konstrukcia', n.konstrukcia,
    'energ_certifikat', n.energ_certifikat, 'kurenie', n.kurenie, 'orientacia', to_jsonb(n.orientacia),
    'vybavenie', to_jsonb(n.vybavenie), 'specialne', to_jsonb(n.specialne), 'exkluzivne', n.exkluzivne,
    'vhodne_pre_studentov', n.vhodne_pre_studentov, 'virtualna_prehliadka', n.virtualna_prehliadka, 'video', n.video,
    'fotky', n.fotky, 'vytvorene', n.vytvorene, 'upravene', n.upravene,
    'makler', (select jsonb_build_object('id', m.id, 'meno', m.meno, 'email', m.email, 'telefon', m.telefon,
                                         'foto', case when m.foto like 'data:%' then m.foto end, 'pohlavie', m.pohlavie)
               from makleri m where m.id = n.makler_id))
$$;

-- jedna ponuka pre verejnú stránku a leták; prihlásený maklér vidí aj koncept (náhľad)
create or replace function public.verejna_ponuka(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  select * into n from nehnutelnosti where id = p_id;
  if not found then return null; end if;
  if n.stav not in ('aktivne', 'rezervovane', 'predane') and not ja_aktivny() then return null; end if;
  return _verejna(n);
end $$;

-- zoznam aktívnych ponúk pre web kancelárie / osobný web makléra / feed pre portály
create or replace function public.verejne_ponuky(p_kancelaria text default 'alpha', p_makler uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_verejna(n) order by n.exkluzivne desc, n.upravene desc), '[]'::jsonb)
  from nehnutelnosti n
  where n.kancelaria = coalesce(p_kancelaria, 'alpha') and n.stav in ('aktivne', 'rezervovane')
    and (p_makler is null or n.makler_id = p_makler)
$$;

-- počítadlo zobrazení verejnej stránky (pre report majiteľovi)
create table if not exists public.zobrazenia_ponuk (
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  den date not null default current_date,
  pocet int not null default 0,
  primary key (nehnutelnost_id, den)
);
alter table public.zobrazenia_ponuk enable row level security;
do $$ begin
  create policy zobrazenia_citat on public.zobrazenia_ponuk for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
revoke all on public.zobrazenia_ponuk from anon, authenticated;
grant select on public.zobrazenia_ponuk to authenticated;

create or replace function public.zaznamenat_zobrazenie(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if ja_aktivny() then return; end if;   -- makléri sa nepočítajú
  if not exists (select 1 from nehnutelnosti where id = p_id and stav in ('aktivne', 'rezervovane')) then return; end if;
  insert into zobrazenia_ponuk (nehnutelnost_id, den, pocet) values (p_id, current_date, 1)
    on conflict (nehnutelnost_id, den) do update set pocet = zobrazenia_ponuk.pocet + 1;
end $$;

-- ---------------------------------------------------------------- dopyty klientov
create table if not exists public.dopyty (
  id bigint generated always as identity primary key,
  kancelaria text not null default 'alpha',
  makler_id uuid references public.makleri(id) on delete set null,
  stav text not null default 'aktivny' check (stav in ('aktivny', 'vybaveny', 'zruseny')),
  transakcia text not null default 'predaj' check (transakcia in ('predaj', 'prenajom')),
  kategorie text[] not null default '{}',        -- byty, domy, chaty, pozemky, priestory, objekty, garaze
  typy text[] not null default '{}',             -- napr. 3-izbový byt (prázdne = hocijaký)
  obce text[] not null default '{}',
  okresy text[] not null default '{}',
  cena_od numeric, cena_do numeric,
  plocha_od numeric, plocha_do numeric,
  izby_od int, izby_do int,
  popis text not null default '',                -- čo klient hľadá vlastnými slovami (vidia všetci makléri)
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now()
);
-- kontakt na klienta vidí len jeho maklér a administrátor
create table if not exists public.dopyty_kontakty (
  dopyt_id bigint primary key references public.dopyty(id) on delete cascade,
  meno text, telefon text, email text, poznamka text
);
alter table public.dopyty enable row level security;
alter table public.dopyty_kontakty enable row level security;
do $$ begin
  create policy dopyty_citat on public.dopyty for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dopyty_kontakty_citat on public.dopyty_kontakty for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from dopyty d where d.id = dopyt_id and d.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
revoke all on public.dopyty, public.dopyty_kontakty from anon, authenticated;
grant select on public.dopyty, public.dopyty_kontakty to authenticated;

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
  return v_id;
end $$;

create or replace function public.zmenit_stav_dopytu(p_id bigint, p_stav text) returns void
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  perform _over_aktivny();
  if p_stav not in ('aktivny', 'vybaveny', 'zruseny') then raise exception 'Neznámy stav.'; end if;
  select * into d from dopyty where id = p_id for update;
  if not found then raise exception 'Dopyt neexistuje.'; end if;
  if not ja_admin() and d.makler_id is distinct from auth.uid() then raise exception 'Zmeniť môže len maklér klienta alebo administrátor.'; end if;
  update dopyty set stav = p_stav, upravene = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------- párovanie
create or replace function public._norm(t text) returns text language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ', 'aacdeeillnoorrstuuyzAACDEEILLNOORRSTUUYZ'))
$$;

-- spoločné pravidlo: kategória, lokalita, cena, plocha, izby (chýbajúci údaj nevylučuje)
create or replace function public._sedi(d dopyty, p_transakcia text, p_kategoria text, p_typ text, p_obec text, p_okres text,
                                         p_cena numeric, p_plocha numeric, p_izby int) returns boolean
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
$$;

create or replace function public._sedi_ponuka(d dopyty, n nehnutelnosti) returns boolean
language sql immutable as $$
  select _sedi(d, n.transakcia, n.kategoria, n.typ, n.obec, n.okres, n.cena,
               case when n.kategoria = 'pozemky' then n.plocha_pozemku else coalesce(n.plocha_uzitkova, n.plocha_pozemku) end, n.izby)
$$;

create or replace function public._sedi_inzerat(d dopyty, i inzeraty) returns boolean
language sql immutable as $$
  select _sedi(d, 'predaj',
               case i.typ when 'byt' then 'byty' when 'dom' then 'domy' when 'pozemok' then 'pozemky' when 'chata' then 'chaty' when 'garaz' then 'garaze' end,
               null, i.obec, i.okres, i.cena, i.plocha, i.izby)
$$;

-- čo už bolo maklérovi oznámené (aby neprišlo dvakrát)
create table if not exists public.zhody_oznamene (
  dopyt_id bigint not null references public.dopyty(id) on delete cascade,
  ciel text not null,                            -- 'n:<id ponuky>' alebo 'i:<id inzerátu>'
  kedy timestamptz not null default now(),
  primary key (dopyt_id, ciel)
);
alter table public.zhody_oznamene enable row level security;
revoke all on public.zhody_oznamene from anon, authenticated;

create or replace function public._popis_dopytu(d dopyty) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select k.meno from dopyty_kontakty k where k.dopyt_id = d.id), 'klient') ||
         case when d.cena_do is not null then ' (do ' || _eur(d.cena_do) || ')' else '' end
$$;

-- nová / zverejnená ponuka alebo zníženie ceny → upozorniť maklérov, ktorých klient hľadá niečo také
create or replace function public._zhoda_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav not in ('aktivne', 'rezervovane') then return new; end if;
  if tg_op = 'UPDATE' and old.stav in ('aktivne', 'rezervovane') and new.cena is not distinct from old.cena then return new; end if;
  for d in select * from dopyty where kancelaria = new.kancelaria and stav = 'aktivny' loop
    if _sedi_ponuka(d, new) and d.makler_id is not null
       and exists (select 1 from makleri where id = d.makler_id and aktivny) then
      insert into zhody_oznamene (dopyt_id, ciel) values (d.id, 'n:' || new.id) on conflict do nothing;
      if found then
        insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh)
        values (d.makler_id, new.id, now(),
                'Ponuka pre vášho klienta – ' || _popis_dopytu(d) || ': ' ||
                left(coalesce(nullif(new.nazov, ''), concat_ws(', ', new.typ, new.obec)), 90) ||
                coalesce(' · ' || _eur(new.cena), ''), 'zhoda');
      end if;
    end if;
  end loop;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'nehnutelnosti_zhoda') then
    create trigger nehnutelnosti_zhoda after insert or update of stav, cena on public.nehnutelnosti
      for each row execute function public._zhoda_ponuka();
  end if;
end $$;

-- nový súkromný inzerát zo skenera → upozorniť maklérov s vhodným dopytom
create or replace function public._zhoda_inzerat() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if not new.aktivny or new.duplikat_z is not null or coalesce(new.predajca_typ, '') = 'rk' then return new; end if;
  for d in select * from dopyty where stav = 'aktivny' and transakcia = 'predaj' loop
    if _sedi_inzerat(d, new) and d.makler_id is not null
       and exists (select 1 from makleri where id = d.makler_id and aktivny) then
      insert into zhody_oznamene (dopyt_id, ciel) values (d.id, 'i:' || new.id) on conflict do nothing;
      if found then
        insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh)
        values (d.makler_id, new.id, now(),
                'Nový súkromný inzerát pre vášho klienta – ' || _popis_dopytu(d) || ': ' || left(new.nazov, 90) ||
                coalesce(' · ' || _eur(new.cena), ''), 'zhoda');
      end if;
    end if;
  end loop;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'inzeraty_zhoda') then
    create trigger inzeraty_zhoda after insert on public.inzeraty
      for each row execute function public._zhoda_inzerat();
  end if;
end $$;

-- ---------------------------------------------------------------- obhliadky
create table if not exists public.obhliadky (
  id bigint generated always as identity primary key,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete set null,
  dopyt_id bigint references public.dopyty(id) on delete set null,
  cas timestamptz not null,
  klient_meno text, klient_telefon text,
  vysledok text check (vysledok in ('naplanovana', 'zaujem', 'zvazuje', 'nezaujem', 'ponuka', 'nedostavil')),
  spatna_vazba text,                             -- vidí aj majiteľ v reporte
  poznamka text,                                 -- len interne
  ponuknuta_cena numeric,
  pripomienka_id bigint references public.pripomienky(id) on delete set null,
  zrusena timestamptz,
  vytvorene timestamptz not null default now()
);
create index if not exists obhliadky_ponuka on public.obhliadky (nehnutelnost_id) where zrusena is null;
alter table public.obhliadky enable row level security;
do $$ begin
  create policy obhliadky_citat on public.obhliadky for select to authenticated
    using (ja_aktivny() and zrusena is null and (ja_admin() or makler_id = auth.uid()
           or exists (select 1 from nehnutelnosti n where n.id = nehnutelnost_id and n.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
revoke all on public.obhliadky from anon, authenticated;
grant select on public.obhliadky to authenticated;

create or replace function public.ulozit_obhliadku(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; o obhliadky; n nehnutelnosti; v_cas timestamptz; v_prip bigint;
begin
  perform _over_aktivny();
  v_cas := nullif(p->>'cas', '')::timestamptz;
  if v_cas is null then raise exception 'Zadajte dátum a čas obhliadky.'; end if;
  if v_id is not null then
    select * into o from obhliadky where id = v_id and zrusena is null for update;
    if not found then raise exception 'Obhliadka neexistuje.'; end if;
    select * into n from nehnutelnosti where id = o.nehnutelnost_id;
    if not ja_admin() and o.makler_id is distinct from auth.uid() and n.makler_id is distinct from auth.uid() then
      raise exception 'Túto obhliadku nemôžete upraviť.';
    end if;
  else
    select * into n from nehnutelnosti where id = nullif(p->>'nehnutelnost_id', '')::bigint;
    if not found then raise exception 'Ponuka neexistuje.'; end if;
    insert into obhliadky (nehnutelnost_id, makler_id, cas) values (n.id, auth.uid(), v_cas) returning * into o;
    v_id := o.id;
  end if;
  update obhliadky set cas = v_cas,
    dopyt_id = nullif(p->>'dopyt_id', '')::bigint,
    klient_meno = nullif(trim(p->>'klient_meno'), ''), klient_telefon = nullif(trim(p->>'klient_telefon'), ''),
    vysledok = coalesce(nullif(p->>'vysledok', ''), case when v_cas > now() then 'naplanovana' end),
    spatna_vazba = nullif(trim(p->>'spatna_vazba'), ''), poznamka = nullif(trim(p->>'poznamka'), ''),
    ponuknuta_cena = nullif(p->>'ponuknuta_cena', '')::numeric
  where id = v_id;
  -- pripomienka hodinu pred budúcou obhliadkou
  if o.pripomienka_id is not null then
    update pripomienky set zrusena = now() where id = o.pripomienka_id and hotovo is null and email_odoslany is null;
  end if;
  if v_cas > now() + interval '70 minutes' then
    insert into pripomienky (makler_id, vytvoril, nehnutelnost_id, cas, poznamka, druh)
    values (coalesce(o.makler_id, auth.uid()), auth.uid(), n.id, v_cas - interval '1 hour',
            'Obhliadka o ' || to_char(v_cas at time zone 'Europe/Bratislava', 'HH24:MI') || ': ' ||
            left(coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 80) ||
            coalesce(' · ' || nullif(trim(p->>'klient_meno'), ''), ''), 'obhliadka')
    returning id into v_prip;
    update obhliadky set pripomienka_id = v_prip where id = v_id;
  else
    update obhliadky set pripomienka_id = null where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.zrusit_obhliadku(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o obhliadky; n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into o from obhliadky where id = p_id and zrusena is null for update;
  if not found then raise exception 'Obhliadka neexistuje.'; end if;
  select * into n from nehnutelnosti where id = o.nehnutelnost_id;
  if not ja_admin() and o.makler_id is distinct from auth.uid() and n.makler_id is distinct from auth.uid() then
    raise exception 'Túto obhliadku nemôžete zrušiť.';
  end if;
  update obhliadky set zrusena = now() where id = p_id;
  if o.pripomienka_id is not null then update pripomienky set zrusena = now() where id = o.pripomienka_id and hotovo is null; end if;
end $$;

-- ---------------------------------------------------------------- report pre majiteľa
alter table public.nehnutelnosti_interne add column if not exists report_token text unique;
alter table public.nehnutelnosti_interne add column if not exists report_tyzdenne boolean not null default false;
alter table public.nehnutelnosti_interne add column if not exists report_odoslany timestamptz;

create or replace function public.report_odkaz(p_id bigint, p_tyzdenne boolean default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare n nehnutelnosti; v_t text;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id;
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  if not ja_admin() and n.makler_id is distinct from auth.uid() then raise exception 'Report môže poslať len zodpovedný maklér alebo administrátor.'; end if;
  insert into nehnutelnosti_interne (nehnutelnost_id) values (p_id) on conflict do nothing;
  update nehnutelnosti_interne set
    report_token = coalesce(report_token, encode(gen_random_bytes(18), 'hex')),
    report_tyzdenne = coalesce(p_tyzdenne, report_tyzdenne)
  where nehnutelnost_id = p_id returning report_token into v_t;
  return v_t;
end $$;

-- údaje reportu – dostupné len s tajným odkazom (bez mien a telefónov záujemcov)
create or replace function public.report_majitela(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i nehnutelnosti_interne; n nehnutelnosti; v jsonb;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into i from nehnutelnosti_interne where report_token = p_token;
  if not found then return null; end if;
  select * into n from nehnutelnosti where id = i.nehnutelnost_id;
  select jsonb_build_object(
    'ponuka', _verejna(n),
    'majitel', i.majitel_meno,
    'zmluva_do', i.zmluva_do,
    'cena', n.cena,
    'historia_cien', n.historia_cien,
    'dni_v_ponuke', greatest(0, current_date - n.vytvorene::date),
    'obhliadky', coalesce((select jsonb_agg(jsonb_build_object('cas', o.cas, 'vysledok', o.vysledok, 'spatna_vazba', o.spatna_vazba,
                                                               'klient', case when o.klient_meno is not null then left(o.klient_meno, 1) || '.' end) order by o.cas desc)
                           from obhliadky o where o.nehnutelnost_id = n.id and o.zrusena is null), '[]'::jsonb),
    'zobrazenia', coalesce((select sum(pocet) from zobrazenia_ponuk z where z.nehnutelnost_id = n.id), 0),
    'zobrazenia_7', coalesce((select sum(pocet) from zobrazenia_ponuk z where z.nehnutelnost_id = n.id and z.den > current_date - 7), 0),
    'zaujemcovia', (select count(*) from dopyty d where d.kancelaria = n.kancelaria and _sedi_ponuka(d, n)),
    'vygenerovane', now()) into v;
  return v;
end $$;

-- pre týždenný email: ponuky s reportom zapnutým a emailom majiteľa
create or replace function public._reporty_na_odoslanie() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'token', i.report_token, 'email', i.majitel_email, 'majitel', i.majitel_meno,
                                               'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'makler_id', n.makler_id)), '[]'::jsonb)
  from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
  where i.report_tyzdenne and i.report_token is not null and coalesce(i.majitel_email, '') like '%@%'
    and n.stav in ('aktivne', 'rezervovane')
    and (i.report_odoslany is null or i.report_odoslany < now() - interval '6 days')
$$;
revoke execute on function public._reporty_na_odoslanie() from public, anon, authenticated;

create or replace function public.reporty_majitelom() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 9 then return; end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    body := '{"reporty": true}'::jsonb);
end $$;
revoke execute on function public.reporty_majitelom() from public, anon, authenticated;

-- ---------------------------------------------------------------- končiaca zmluva
create or replace function public.upozornit_na_zmluvy() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_komu uuid; v_n int := 0; v_dni int;
begin
  for r in
    select x.id, x.makler_id, x.nazov, x.typ, x.obec, i.zmluva_do, i.majitel_meno
    from nehnutelnosti_interne i join nehnutelnosti x on x.id = i.nehnutelnost_id
    where i.zmluva and i.zmluva_do is not null and x.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')
      and (i.zmluva_do - current_date) in (14, 3, 0)
  loop
    v_dni := r.zmluva_do - current_date;
    v_komu := coalesce((select id from makleri where id = r.makler_id and aktivny),
                       (select id from makleri where rola = 'admin' and aktivny order by vytvorene limit 1));
    if v_komu is null then continue; end if;
    if exists (select 1 from pripomienky where nehnutelnost_id = r.id and druh = 'zmluva' and vytvorene::date = current_date) then continue; end if;
    insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh)
    values (v_komu, r.id, now(),
            case when v_dni = 0 then 'Dnes končí zmluva: ' else 'Zmluva končí o ' || v_dni || ' dní (' || to_char(r.zmluva_do, 'DD.MM.YYYY') || '): ' end ||
            left(coalesce(nullif(r.nazov, ''), concat_ws(', ', r.typ, r.obec)), 90) ||
            coalesce(' · majiteľ ' || r.majitel_meno, '') || '. Dohodnite predĺženie.', 'zmluva');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.upozornit_na_zmluvy() from public, anon, authenticated;

create or replace function public._zmluvy_cron() returns void
language plpgsql security definer set search_path = public as $$
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 8 then return; end if;
  perform upozornit_na_zmluvy();
end $$;
revoke execute on function public._zmluvy_cron() from public, anon, authenticated;

select cron.schedule('zmluvy-rano', '0 6,7 * * *', 'select public._zmluvy_cron()');
select cron.schedule('reporty-majitelom', '0 7,8 * * 1', 'select public.reporty_majitelom()');

-- ---------------------------------------------------------------- práva
revoke execute on function public._verejna(nehnutelnosti), public._sedi(dopyty, text, text, text, text, text, numeric, numeric, int),
  public._sedi_ponuka(dopyty, nehnutelnosti), public._sedi_inzerat(dopyty, inzeraty), public._popis_dopytu(dopyty),
  public._zhoda_ponuka(), public._zhoda_inzerat() from public, anon, authenticated;
revoke execute on function public.ulozit_telefon_maklera(uuid, text), public.ulozit_dopyt(jsonb, jsonb), public.zmenit_stav_dopytu(bigint, text),
  public.ulozit_obhliadku(jsonb), public.zrusit_obhliadku(bigint), public.report_odkaz(bigint, boolean) from public, anon;
grant execute on function public.ulozit_telefon_maklera(uuid, text), public.ulozit_dopyt(jsonb, jsonb), public.zmenit_stav_dopytu(bigint, text),
  public.ulozit_obhliadku(jsonb), public.zrusit_obhliadku(bigint), public.report_odkaz(bigint, boolean) to authenticated;
grant execute on function public.verejna_ponuka(bigint), public.verejne_ponuky(text, uuid), public.zaznamenat_zobrazenie(bigint),
  public.report_majitela(text) to anon, authenticated;

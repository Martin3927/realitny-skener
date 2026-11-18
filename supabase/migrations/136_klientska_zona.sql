-- Klientska zóna (18. 11. 2026)
-- Spája to, čo už v Týpkovi je (dopyty kupujúcich, párovanie s ponukami, report pre majiteľa), do jednej zóny pre klientov:
--   1. Prepínače kancelárie – čo uvidí predávajúci a čo smie kupujúci (nastavuje administrátor, Klienti → Klientska zóna).
--   2. Výnimky pri jednej ponuke – maklér vie konkrétnemu predávajúcemu niečo skryť alebo ukázať.
--   3. Report pre majiteľa (report_majitela) sa riadi prepínačmi; pri vypnutej zóne nič neukáže a týždenný e-mail neodíde.
--   4. Zóna kupujúceho – tajný odkaz k dopytu, klient vidí ponuky kancelárie a reaguje (Páči sa mi / Nie je pre mňa / Chcem obhliadku).
-- Všetko ostáva v kancelárii: kupujúci vidí len ponuky kancelárie svojho makléra, predávajúci len čísla bez mien.
-- Predvolené hodnoty zachovávajú doterajšie správanie reportu (všetko zapnuté); kupujúcemu ponuky posiela maklér (nie automat).

-- ---------------------------------------------------------------- nastavenia kancelárie
-- len známe prepínače s hodnotou áno/nie
create or replace function public._kz_cisty(p jsonb, p_kluce text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, p -> k), '{}'::jsonb) from unnest(p_kluce) k where jsonb_typeof(p -> k) = 'boolean'
$$;

create or replace function public._kz_kluce(p_cast text) returns text[] language sql immutable as $$
  select case p_cast
    when 'predavajuci' then array['zapnute', 'zobrazenia', 'kontakty', 'kupujuci', 'obhliadky', 'spatna_vazba', 'terminy', 'cena', 'makler_meni']
    when 'ponuka' then array['zapnute', 'zobrazenia', 'kontakty', 'kupujuci', 'obhliadky', 'spatna_vazba', 'terminy', 'cena']
    when 'kupujuci' then array['zapnute', 'automaticky', 'reakcie', 'obhliadka', 'sprava']
  end
$$;

-- nastavenie kancelárie doplnené o predvolené hodnoty
create or replace function public._kz(p_kancelaria bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (select coalesce(nullif(_nk('klientska_zona', coalesce(p_kancelaria, aktivna_kancelaria(), 1)), '')::jsonb, '{}'::jsonb) as v)
  select jsonb_build_object(
    'predavajuci', '{"zapnute":true,"zobrazenia":true,"kontakty":true,"kupujuci":true,"obhliadky":true,"spatna_vazba":true,"terminy":true,"cena":true,"makler_meni":true}'::jsonb
                   || _kz_cisty(u.v -> 'predavajuci', _kz_kluce('predavajuci')),
    'kupujuci', '{"zapnute":true,"automaticky":false,"reakcie":true,"obhliadka":true,"sprava":true}'::jsonb
                || _kz_cisty(u.v -> 'kupujuci', _kz_kluce('kupujuci')))
  from u
$$;

create or replace function public.klientska_zona() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return _kz(aktivna_kancelaria());
end $$;

-- administrátor mení prepínače kancelárie (stačí poslať len to, čo sa mení)
create or replace function public.ulozit_klientsku_zonu(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_k bigint := aktivna_kancelaria(); v_stare jsonb; v jsonb;
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Klientsku zónu nastavuje len administrátor.' using errcode = '42501'; end if;
  v_stare := coalesce(nullif(_nk('klientska_zona', v_k), '')::jsonb, '{}'::jsonb);
  v := jsonb_build_object(
    'predavajuci', _kz_cisty(v_stare -> 'predavajuci', _kz_kluce('predavajuci')) || _kz_cisty(p -> 'predavajuci', _kz_kluce('predavajuci')),
    'kupujuci', _kz_cisty(v_stare -> 'kupujuci', _kz_kluce('kupujuci')) || _kz_cisty(p -> 'kupujuci', _kz_kluce('kupujuci')),
    'upravil', auth.uid(), 'upravene', now());
  perform _nk_ulozit('klientska_zona', v::text, v_k);
  return _kz(v_k);
end $$;

-- ---------------------------------------------------------------- predávajúci: výnimky pri ponuke
alter table public.nehnutelnosti_interne add column if not exists zona jsonb;   -- len prepínače, ktoré sa líšia od kancelárie

-- čo naozaj uvidí majiteľ tejto ponuky: kancelária + výnimky ponuky; vypnutá zóna kancelárie vypne všetko
create or replace function public._kz_ponuky(p_zona jsonb, p_kancelaria bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when (k ->> 'zapnute')::boolean then (k - 'makler_meni') || _kz_cisty(p_zona, _kz_kluce('ponuka'))
              else (select jsonb_object_agg(x, false) from unnest(_kz_kluce('ponuka')) x) end
  from (select _kz(p_kancelaria) -> 'predavajuci' as k) y
$$;

-- maklér ponuky (ak mu to kancelária dovolí) alebo administrátor nastaví, čo uvidí majiteľ tejto ponuky; p = null vráti nastavenie kancelárie
create or replace function public.ulozit_zonu_ponuky(p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti; v_k jsonb; v jsonb;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  v_k := _kz(n.kancelaria_id) -> 'predavajuci';
  if not ja_admin() then
    if n.makler_id is distinct from auth.uid() then raise exception 'Nastaviť to môže len zodpovedný maklér alebo administrátor.' using errcode = '42501'; end if;
    if not (v_k ->> 'makler_meni')::boolean then raise exception 'Čo uvidí predávajúci, nastavuje vo vašej kancelárii len administrátor.' using errcode = '42501'; end if;
  end if;
  select jsonb_object_agg(k, p -> k) into v from unnest(_kz_kluce('ponuka')) k
   where jsonb_typeof(p -> k) = 'boolean' and (p -> k) is distinct from (v_k -> k);
  insert into nehnutelnosti_interne (nehnutelnost_id) values (p_id) on conflict do nothing;
  update nehnutelnosti_interne set zona = v where nehnutelnost_id = p_id;
  return _kz_ponuky(v, n.kancelaria_id);
end $$;

-- report pre majiteľa podľa prepínačov (bez mien a telefónov záujemcov – ako doteraz)
create or replace function public.report_majitela(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i nehnutelnosti_interne; n nehnutelnosti; z jsonb; v jsonb;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into i from nehnutelnosti_interne where report_token = p_token;
  if not found then return null; end if;
  select * into n from nehnutelnosti where id = i.nehnutelnost_id;
  z := _kz_ponuky(i.zona, n.kancelaria_id);
  if not (z ->> 'zapnute')::boolean then
    return jsonb_build_object('vypnute', true, 'ponuka', jsonb_build_object('makler', _verejna(n) -> 'makler'),
                              'kanc', _kancelaria_verejne(n.kancelaria_id), 'kancelaria_id', n.kancelaria_id);
  end if;
  select jsonb_build_object(
    'ponuka', _verejna(n),
    'majitel', i.majitel_meno,
    'zmluva_do', i.zmluva_do,
    'cena', n.cena,
    'historia_cien', case when (z ->> 'cena')::boolean then n.historia_cien end,
    'dni_v_ponuke', greatest(0, current_date - n.vytvorene::date),
    'obhliadky', case when (z ->> 'obhliadky')::boolean then
       coalesce((select jsonb_agg(jsonb_build_object(
                          'cas', o.cas,
                          'vysledok', case when (z ->> 'spatna_vazba')::boolean then o.vysledok end,
                          'spatna_vazba', case when (z ->> 'spatna_vazba')::boolean then o.spatna_vazba end,
                          'klient', case when o.klient_meno is not null then left(o.klient_meno, 1) || '.' end) order by o.cas desc)
                 from obhliadky o where o.nehnutelnost_id = n.id and o.zrusena is null
                  and ((z ->> 'terminy')::boolean or o.cas <= now())), '[]'::jsonb) end,
    'zobrazenia', case when (z ->> 'zobrazenia')::boolean then coalesce((select sum(pocet) from zobrazenia_ponuk x where x.nehnutelnost_id = n.id), 0) end,
    'zobrazenia_7', case when (z ->> 'zobrazenia')::boolean then coalesce((select sum(pocet) from zobrazenia_ponuk x where x.nehnutelnost_id = n.id and x.den > current_date - 7), 0) end,
    'zaujemcovia', case when (z ->> 'kupujuci')::boolean then (select count(*) from dopyty d where d.kancelaria_id = n.kancelaria_id and _sedi_ponuka(d, n)) end,
    'kontakty', case when (z ->> 'kontakty')::boolean then (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca')) end,
    'kontakty_7', case when (z ->> 'kontakty')::boolean then (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca') and k.vytvorene > now() - interval '7 days') end,
    'zona', z,
    'kanc', _kancelaria_verejne(n.kancelaria_id), 'kancelaria_id', n.kancelaria_id,
    'vygenerovane', now()) into v;
  return v;
end $$;

-- týždenný e-mail majiteľovi neodíde, keď je zóna predávajúceho vypnutá (v kancelárii alebo pri ponuke)
create or replace function public._reporty_na_odoslanie() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'token', i.report_token, 'email', i.majitel_email, 'majitel', i.majitel_meno,
                                               'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'makler_id', n.makler_id)), '[]'::jsonb)
  from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
  where i.report_tyzdenne and i.report_token is not null and coalesce(i.majitel_email, '') like '%@%'
    and n.stav in ('aktivne', 'rezervovane')
    and (i.report_odoslany is null or i.report_odoslany < now() - interval '6 days')
    and (_kz_ponuky(i.zona, n.kancelaria_id) ->> 'zapnute')::boolean
$$;

-- ---------------------------------------------------------------- kupujúci: odkaz, ponuky a reakcie
-- odkaz je pri kontakte klienta – vidí ho len maklér klienta a administrátor (ako telefón)
alter table public.dopyty_kontakty add column if not exists zona_token text unique;
alter table public.dopyty_kontakty add column if not exists zona_videna timestamptz;     -- kedy klient zónu naposledy otvoril

create table if not exists public.dopyty_ponuky (
  dopyt_id bigint not null references public.dopyty(id) on delete cascade,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  kancelaria_id bigint not null references public.kancelarie(id),
  stav text not null default 'poslana' check (stav in ('poslana', 'skryta', 'auto')),   -- auto = ponuka z automatického párovania, na ktorú klient reagoval
  poslal uuid references public.makleri(id) on delete set null,
  poslane timestamptz not null default now(),
  reakcia text check (reakcia in ('paci', 'nie', 'obhliadka')),
  reakcia_kedy timestamptz,
  sprava text,
  primary key (dopyt_id, nehnutelnost_id)
);
create index if not exists dopyty_ponuky_kancelaria on public.dopyty_ponuky (kancelaria_id);
create index if not exists dopyty_ponuky_ponuka on public.dopyty_ponuky (nehnutelnost_id);
drop trigger if exists nastav_kancelariu on public.dopyty_ponuky;
create trigger nastav_kancelariu before insert on public.dopyty_ponuky for each row execute function public._nastav_kancelariu();
drop trigger if exists zz_straz_kancelariu on public.dopyty_ponuky;
create trigger zz_straz_kancelariu before insert or update or delete on public.dopyty_ponuky for each row execute function public._straz_kancelariu();
alter table public.dopyty_ponuky enable row level security;
drop policy if exists dopyty_ponuky_citat on public.dopyty_ponuky;
create policy dopyty_ponuky_citat on public.dopyty_ponuky for select to authenticated using ((select ja_aktivny()));
drop policy if exists pristup_dopyty_ponuky on public.dopyty_ponuky;
create policy pristup_dopyty_ponuky on public.dopyty_ponuky as restrictive for select to authenticated using ((select ma_pristup('klienti')));
drop policy if exists kancelaria_len_moja on public.dopyty_ponuky;
create policy kancelaria_len_moja on public.dopyty_ponuky as restrictive for all to authenticated
  using (kancelaria_id = (select aktivna_kancelaria())) with check (kancelaria_id = (select aktivna_kancelaria()));
revoke all on public.dopyty_ponuky from anon, authenticated;
grant select on public.dopyty_ponuky to authenticated;

-- maklér klienta alebo administrátor vytvorí (alebo zruší) odkaz do zóny kupujúceho
create or replace function public.zona_kupujuceho_odkaz(p_dopyt bigint, p_zrusit boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d dopyty; v_t text;
begin
  perform _over_aktivny();
  select * into d from dopyty where id = p_dopyt and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Dopyt neexistuje.'; end if;
  if not ja_admin() and d.makler_id is distinct from auth.uid() then raise exception 'Odkaz môže vytvoriť len maklér klienta alebo administrátor.' using errcode = '42501'; end if;
  insert into dopyty_kontakty (dopyt_id) values (p_dopyt) on conflict do nothing;
  if p_zrusit then
    update dopyty_kontakty set zona_token = null, zona_videna = null where dopyt_id = p_dopyt;
    return null;
  end if;
  if not (_kz(d.kancelaria_id) -> 'kupujuci' ->> 'zapnute')::boolean then
    raise exception 'Zóna kupujúceho je vo vašej kancelárii vypnutá. Zapne ju administrátor v Klienti → Klientska zóna.';
  end if;
  update dopyty_kontakty set zona_token = coalesce(zona_token, encode(gen_random_bytes(18), 'hex'))
   where dopyt_id = p_dopyt returning zona_token into v_t;
  return v_t;
end $$;

-- maklér pošle ponuku do zóny klienta ('poslana'), skryje ju ('skryta') alebo vráti na automatiku (null)
create or replace function public.zona_ponuka(p_dopyt bigint, p_nehnutelnost bigint, p_stav text) returns void
language plpgsql security definer set search_path = public as $$
declare d dopyty; n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into d from dopyty where id = p_dopyt and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Dopyt neexistuje.'; end if;
  if not ja_admin() and d.makler_id is distinct from auth.uid() then raise exception 'Ponuky klientovi vyberá len jeho maklér alebo administrátor.' using errcode = '42501'; end if;
  select * into n from nehnutelnosti where id = p_nehnutelnost and kancelaria_id = d.kancelaria_id;
  if not found then raise exception 'Ponuka neexistuje.'; end if;
  if p_stav is null then
    -- reakciu klienta nemažeme: riadok s reakciou ostane ako automatický
    delete from dopyty_ponuky where dopyt_id = p_dopyt and nehnutelnost_id = p_nehnutelnost and reakcia is null;
    update dopyty_ponuky set stav = 'auto' where dopyt_id = p_dopyt and nehnutelnost_id = p_nehnutelnost;
    return;
  end if;
  if p_stav not in ('poslana', 'skryta') then raise exception 'Neznámy stav.'; end if;
  if p_stav = 'poslana' and n.stav not in ('aktivne', 'rezervovane') then raise exception 'Poslať sa dá len aktívna alebo rezervovaná ponuka.'; end if;
  insert into dopyty_ponuky (dopyt_id, nehnutelnost_id, kancelaria_id, stav, poslal, poslane)
  values (p_dopyt, p_nehnutelnost, d.kancelaria_id, p_stav, auth.uid(), now())
  on conflict (dopyt_id, nehnutelnost_id) do update set
    poslane = case when dopyty_ponuky.stav = 'poslana' and excluded.stav = 'poslana' then dopyty_ponuky.poslane else now() end,
    stav = excluded.stav, poslal = excluded.poslal;
end $$;

-- je ponuka v zóne klienta? (poslaná maklérom, alebo pri automatike sedí na dopyt; skrytá nikdy)
create or replace function public._zona_vidi(d dopyty, n nehnutelnosti, p_stav text, p_auto boolean) returns boolean
language sql stable as $$
  select n.kancelaria_id = d.kancelaria_id and n.stav in ('aktivne', 'rezervovane')
     and coalesce(p_stav, '') <> 'skryta'
     and (p_stav = 'poslana' or (p_auto and _sedi_ponuka(d, n)))
$$;

-- stránka klienta: len s tajným odkazom; kontakty iných ani interné údaje ponúk v nej nie sú
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
                                'plocha_do', d.plocha_do, 'izby_od', d.izby_od, 'izby_do', d.izby_do),
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

-- reakcia klienta na ponuku; pri „Páči sa mi“ a „Chcem obhliadku“ dostane maklér upozornenie do zvončeka a mobilu
create or replace function public.zona_reakcia(p_token text, p_nehnutelnost bigint, p_reakcia text, p_sprava text default null) returns text
language plpgsql security definer set search_path = public as $$
declare k dopyty_kontakty; d dopyty; n nehnutelnosti; z jsonb; s dopyty_ponuky;
        v_sprava text := nullif(left(btrim(coalesce(p_sprava, '')), 600), ''); v_nazov text; v_meno text;
begin
  if length(coalesce(p_token, '')) < 20 then raise exception 'Odkaz nie je platný.' using errcode = '22023'; end if;
  select * into k from dopyty_kontakty where zona_token = p_token;
  if not found then raise exception 'Odkaz už nie je platný. Ozvite sa svojmu maklérovi.' using errcode = '22023'; end if;
  select * into d from dopyty where id = k.dopyt_id;
  z := _kz(d.kancelaria_id) -> 'kupujuci';
  if not (z ->> 'zapnute')::boolean or d.stav <> 'aktivny' or not (z ->> 'reakcie')::boolean then
    raise exception 'Reakcie sú teraz vypnuté. Ozvite sa svojmu maklérovi.' using errcode = '22023';
  end if;
  if p_reakcia is not null and p_reakcia not in ('paci', 'nie', 'obhliadka') then raise exception 'Neznáma reakcia.' using errcode = '22023'; end if;
  if p_reakcia = 'obhliadka' and not (z ->> 'obhliadka')::boolean then raise exception 'O obhliadku požiadajte svojho makléra.' using errcode = '22023'; end if;
  if not (z ->> 'sprava')::boolean then v_sprava := null; end if;
  perform pg_advisory_xact_lock(918275, d.id::int);
  select * into n from nehnutelnosti where id = p_nehnutelnost;
  select * into s from dopyty_ponuky where dopyt_id = d.id and nehnutelnost_id = p_nehnutelnost;
  if n.id is null or not _zona_vidi(d, n, s.stav, (z ->> 'automaticky')::boolean) then
    raise exception 'Táto ponuka už nie je dostupná.' using errcode = '22023';
  end if;
  if (select count(*) from dopyty_ponuky where dopyt_id = d.id and reakcia_kedy > now() - interval '1 hour') >= 60 then
    raise exception 'Príliš veľa reakcií naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  insert into dopyty_ponuky (dopyt_id, nehnutelnost_id, kancelaria_id, stav, reakcia, reakcia_kedy, sprava)
  values (d.id, n.id, d.kancelaria_id, 'auto', p_reakcia, now(), v_sprava)
  on conflict (dopyt_id, nehnutelnost_id) do update set reakcia = excluded.reakcia, reakcia_kedy = now(),
    sprava = coalesce(excluded.sprava, case when excluded.reakcia is not distinct from dopyty_ponuky.reakcia then dopyty_ponuky.sprava end);
  -- upozornenie maklérovi klienta: len pri novom záujme (nie pri opakovanom kliknutí na to isté)
  if p_reakcia in ('paci', 'obhliadka') and (s.reakcia is distinct from p_reakcia or v_sprava is not null)
     and d.makler_id is not null and exists (select 1 from makleri where id = d.makler_id and aktivny) then
    v_nazov := left(coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 90);
    v_meno := coalesce(nullif(btrim(k.meno), ''), 'Klient');
    insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh, kancelaria_id)
    values (d.makler_id, n.id, now(),
            case when p_reakcia = 'obhliadka' then '🗝️ ' || v_meno || ' chce obhliadku: ' else '❤️ ' || v_meno || ' – páči sa mu ponuka: ' end ||
            v_nazov || coalesce(' · ' || _eur(n.cena), '') || coalesce(' · „' || left(v_sprava, 200) || '“', '') || ' (klientska zóna)',
            'zhoda', d.kancelaria_id);
  end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- práva
revoke execute on function public._kz_cisty(jsonb, text[]), public._kz_kluce(text), public._kz(bigint), public._kz_ponuky(jsonb, bigint),
  public._zona_vidi(dopyty, nehnutelnosti, text, boolean) from public, anon, authenticated;
revoke execute on function public._reporty_na_odoslanie() from public, anon, authenticated;
revoke execute on function public.klientska_zona(), public.ulozit_klientsku_zonu(jsonb), public.ulozit_zonu_ponuky(bigint, jsonb),
  public.zona_kupujuceho_odkaz(bigint, boolean), public.zona_ponuka(bigint, bigint, text) from public, anon;
grant execute on function public.klientska_zona(), public.ulozit_klientsku_zonu(jsonb), public.ulozit_zonu_ponuky(bigint, jsonb),
  public.zona_kupujuceho_odkaz(bigint, boolean), public.zona_ponuka(bigint, bigint, text) to authenticated;
grant execute on function public.report_majitela(text), public.zona_kupujuceho(text), public.zona_reakcia(text, bigint, text, text) to anon, authenticated;

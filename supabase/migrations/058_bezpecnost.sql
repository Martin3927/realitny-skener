-- =====================================================================
-- Bezpečnosť (25. 10. 2026)
--  1. Odkaz na kalendár (token) už nie je v tabuľke makleri, ktorú čítajú všetci makléri.
--     Je v samostatnej tabuľke makleri_kalendar, ktorú číta len server. Existujúce odkazy fungujú ďalej.
--  2. Formulár „Požiadať o bezplatnú verziu“: opakovaná žiadosť z toho istého e-mailu už znova neposiela e-maily
--     a z jedného zariadenia prejde najviac 5 žiadostí za hodinu.
--  3. AI asistent: denný počet otázok na makléra (počíta server, limit nastavuje Edge funkcia asistent).
-- =====================================================================

-- ---------------------------------------------------------------- 1. kalendár
create table if not exists public.makleri_kalendar (
  makler_id uuid primary key references public.makleri(id) on delete cascade,
  token text not null unique,
  vytvorene timestamptz not null default now()
);
alter table public.makleri_kalendar enable row level security;
revoke all on public.makleri_kalendar from public, anon, authenticated;

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'makleri' and column_name = 'kalendar_token') then
    execute 'insert into public.makleri_kalendar (makler_id, token)
             select id, kalendar_token from public.makleri where kalendar_token is not null
             on conflict (makler_id) do nothing';
  end if;
end $$;

create or replace function public.moj_kalendar_odkaz(p_novy boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform _over_aktivny();
  select token into v from makleri_kalendar where makler_id = auth.uid();
  if p_novy or v is null then
    v := encode(gen_random_bytes(18), 'hex');
    insert into makleri_kalendar (makler_id, token) values (auth.uid(), v)
    on conflict (makler_id) do update set token = excluded.token, vytvorene = now();
  end if;
  return v;
end $$;

create or replace function public._kalendar_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m makleri;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select mk.* into m from makleri mk join makleri_kalendar k on k.makler_id = mk.id where k.token = p_token and mk.aktivny;
  if not found then return null; end if;
  return jsonb_build_object('meno', m.meno,
    'udalosti', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nazov', u.nazov, 'zaciatok', u.zaciatok, 'koniec', u.koniec,
        'cely_den', u.cely_den, 'miesto', u.miesto, 'poznamka', u.poznamka, 'typ', u.typ, 'upravene', u.vytvorene,
        'mena', (select string_agg(x.meno, ', ' order by x.meno) from makleri x where x.id = u.makler_id or x.id = any(u.ucastnici)),
        'moja', (u.makler_id = m.id or m.id = any(u.ucastnici))))
      from udalosti u where u.zrusene is null and (u.makler_id = m.id or m.id = any(u.ucastnici) or u.zdielane) and u.zaciatok > now() - interval '60 days'), '[]'::jsonb),
    'obhliadky', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cas', o.cas, 'klient', o.klient_meno, 'telefon', o.klient_telefon,
        'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'miesto', concat_ws(', ', n.ulica, n.obec)))
      from obhliadky o join nehnutelnosti n on n.id = o.nehnutelnost_id
      where o.zrusena is null and o.cas > now() - interval '60 days' and (o.makler_id = m.id or n.makler_id = m.id)), '[]'::jsonb),
    'pripomienky', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'cas', p.cas, 'poznamka', p.poznamka, 'druh', p.druh))
      from pripomienky p where p.makler_id = m.id and p.zrusena is null and p.hotovo is null and p.druh in ('pripomienka', 'obhliadka')
        and p.cas > now() - interval '7 days'), '[]'::jsonb),
    'zmluvy', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'do', i.zmluva_do, 'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'majitel', i.majitel_meno))
      from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
      where i.zmluva and i.zmluva_do >= current_date - 7 and n.makler_id = m.id and n.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')), '[]'::jsonb));
end $$;
revoke execute on function public._kalendar_feed(text) from public, anon, authenticated;

alter table public.makleri drop column if exists kalendar_token;

-- ---------------------------------------------------------------- 2. žiadosti o bezplatnú verziu
create table if not exists public.web_ziadosti_odtlacky (
  odtlacok text not null,
  cas timestamptz not null default now()
);
create index if not exists web_ziadosti_odtlacky_kedy on public.web_ziadosti_odtlacky (odtlacok, cas);
alter table public.web_ziadosti_odtlacky enable row level security;
revoke all on public.web_ziadosti_odtlacky from public, anon, authenticated;

create or replace function public.web_ziadost(p_email text, p_moduly text[] default '{}'::text[], p_okresy integer default 1, p_platba text default 'mesacne'::text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_okr int := least(greatest(coalesce(p_okresy, 1), 1), 79);
  v_pl text := case when p_platba = 'rocne' then 'rocne' else 'mesacne' end;
  v_mod text[];
  v_zadarmo text[];
  v_pozn text;
  v_id bigint;
  v_upr timestamptz;
  v_odkial text := _klient_odtlacok();
begin
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'neplatny_email' using errcode = '22023';
  end if;

  -- ochrana pred zahltením: z jedného zariadenia najviac 5 žiadostí za hodinu, spolu najviac 30 nových za hodinu
  if v_odkial is not null then
    if (select count(*) from web_ziadosti_odtlacky where odtlacok = v_odkial and cas > now() - interval '1 hour') >= 5 then
      raise exception 'prilis_vela' using errcode = '54000';
    end if;
    insert into web_ziadosti_odtlacky (odtlacok) values (v_odkial);
    if random() < 0.05 then delete from web_ziadosti_odtlacky where cas < now() - interval '1 day'; end if;
  end if;
  if (select count(*) from zakaznici where zdroj = 'web' and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'prilis_vela' using errcode = '54000';
  end if;

  -- moduly z cenníka webu → moduly v Správe zákazníkov
  select coalesce(array_agg(distinct x order by x), '{}') into v_mod from (
    select case m
      when 'skener' then 'skener' when 'web' then 'web' when 'ponuky' then 'ponuky'
      when 'klienti' then 'klienti_aml' when 'dokumenty' then 'dokumenty'
      when 'newsletter' then 'emailing' when 'email' then 'pracovny_email'
    end as x
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where x is not null;

  select coalesce(array_agg(distinct n order by n), '{}') into v_zadarmo from (
    select case m when 'kataster' then 'Kataster a mapa' when 'kalendar' then 'Kalendár' when 'chat' then 'Chat'
                  when 'domena' then 'Doména + hosting' end as n
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where n is not null;

  v_pozn := 'Žiadosť o bezplatnú verziu z webu ' || to_char(now() at time zone 'Europe/Bratislava', 'DD.MM.YYYY HH24:MI')
    || case when 'skener' = any(v_mod) then '. Skener: ' || v_okr
         || case when v_okr = 1 then ' okres' when v_okr < 5 then ' okresy' else ' okresov' end else '' end
    || case when cardinality(v_zadarmo) > 0 then '. Navyše: ' || array_to_string(v_zadarmo, ', ') else '' end
    || '. Platba: ' || case when v_pl = 'rocne' then 'ročne' else 'mesačne' end || '.';

  -- ten istý e-mail už v evidencii je → iba doplníme moduly a poznámku (e-maily sa znova neposielajú,
  -- inak by sa dal formulár zneužiť na opakované posielanie e-mailov na cudziu adresu)
  select id, upravene into v_id, v_upr from zakaznici where lower(email) = v_email order by id limit 1;
  if v_id is not null then
    if v_upr < now() - interval '10 minutes' then
      update zakaznici set
        moduly = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(moduly || v_mod) x),
        poznamky = left(coalesce(nullif(poznamky, '') || E'\n', '') || v_pozn, 4000)
      where id = v_id;
    end if;
    return 'ok';
  end if;

  insert into zakaznici (typ, nazov, email, stav, moduly, platba_obdobie, zdroj, poznamky)
  values ('makler', v_email, v_email, 'zaujemca', v_mod, v_pl, 'web', v_pozn);
  return 'ok';
end $$;

-- ---------------------------------------------------------------- 3. AI asistent – denný počet otázok
create table if not exists public.asistent_pouzitie (
  makler_id uuid not null references public.makleri(id) on delete cascade,
  den date not null,
  pocet int not null default 0,
  primary key (makler_id, den)
);
alter table public.asistent_pouzitie enable row level security;
revoke all on public.asistent_pouzitie from public, anon, authenticated;

-- pripočíta otázku a vráti, či je ešte v dennom limite (volá len server – Edge funkcia asistent)
create or replace function public.asistent_pocitaj(p_makler uuid, p_limit int default 150) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into asistent_pouzitie (makler_id, den, pocet) values (p_makler, (now() at time zone 'Europe/Bratislava')::date, 1)
  on conflict (makler_id, den) do update set pocet = asistent_pouzitie.pocet + 1
  returning pocet into v;
  if random() < 0.02 then delete from asistent_pouzitie where den < current_date - 90; end if;
  return v <= greatest(coalesce(p_limit, 150), 1);
end $$;
revoke execute on function public.asistent_pocitaj(uuid, int) from public, anon, authenticated;
grant execute on function public.asistent_pocitaj(uuid, int) to service_role;

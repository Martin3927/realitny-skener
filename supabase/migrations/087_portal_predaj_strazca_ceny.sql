-- =====================================================================
-- 087: Týpkove nehnuteľnosti – pre predávajúcich, kupujúcich, maklérov a kancelárie
--  * cenová mapa (portal_ceny): ponukové ceny za m² podľa obcí z inzerátov skenera za 12 mesiacov,
--    rovnaká nehnuteľnosť z viacerých portálov sa počíta raz (duplikat_z), obec len pri aspoň 5 inzerátoch
--  * „Koľko stojí moja nehnuteľnosť?“ a „Chcem predať“ (portal_predaj) → maklér, ktorý v obci pôsobí:
--    najviac ponúk v obci, potom oblasť na jeho webe, potom okres, inak hlavný správca;
--    maklér dostane aj orientačný odhad zo skenera (klient vidí len ceny za m² ako na cenovej mape)
--  * strážca ponúk portálu: dvojité prihlásenie e-mailom, nové a zlacnené ponuky najviac raz za 12 hodín,
--    odhlásenie jedným klikom (e-maily posiela funkcia „pripomienky“)
--  * stránka kancelárie (portal_kancelaria) s recenziami
--  * štatistika pre makléra: zobrazenia ponuky na portáli a dopyty z portálu (portal_statistika)
-- =====================================================================

alter table public.zobrazenia_ponuk add column if not exists portal int not null default 0;

alter table public.web_kontakty drop constraint if exists web_kontakty_zdroj_check;
alter table public.web_kontakty add constraint web_kontakty_zdroj_check
  check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt', 'podobna', 'hypoteka', 'vykup', 'kariera', 'predaj'));
create index if not exists web_kontakty_portal on public.web_kontakty (makler_id, vytvorene desc) where portal;

create or replace function public._bez_diakritiky(t text) returns text
language sql immutable as $$
  select btrim(translate(lower(coalesce(t, '')), 'áäčďéěíĺľňóôŕřšťúůýž', 'aacdeeillnoorrstuuyz'))
$$;

-- ---------------------------------------------------------------- cenová mapa
create or replace function public.portal_ceny() returns jsonb
language sql stable security definer set search_path = public as $$
  with z as (
    select i.obec, i.okres, i.typ, i.cena_m2
    from inzeraty i
    where i.duplikat_z is null and i.prvy_krat > now() - interval '12 months' and i.typ in ('byt', 'dom', 'pozemok')
      and i.cena_m2 between case when i.typ = 'pozemok' then 1 else 150 end and case when i.typ = 'pozemok' then 1500 else 9000 end
  ), o as (
    select obec, okres, typ, count(*) n,
      round(percentile_cont(0.5) within group (order by cena_m2)) m2,
      round(percentile_cont(0.25) within group (order by cena_m2)) od,
      round(percentile_cont(0.75) within group (order by cena_m2)) "do"
    from z where obec is not null group by obec, okres, typ having count(*) >= 5
  ), k as (
    select okres, typ, count(*) n,
      round(percentile_cont(0.5) within group (order by cena_m2)) m2,
      round(percentile_cont(0.25) within group (order by cena_m2)) od,
      round(percentile_cont(0.75) within group (order by cena_m2)) "do"
    from z where okres is not null group by okres, typ having count(*) >= 5
  )
  select jsonb_build_object(
    'obce', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('obec', o.obec, 'okres', o.okres, 'typ', o.typ, 'n', o.n,
                        'm2', o.m2, 'od', o.od, 'do', o."do", 'lat', l.lat, 'lon', l.lon)) order by o.typ, o.n desc)
                      from o left join lateral (select x.lat, x.lon from lokality x where x.typ = 'obec' and x.nazov = o.obec
                                                  and (o.okres is null or x.okres = o.okres) limit 1) l on true), '[]'::jsonb),
    'okresy', coalesce((select jsonb_agg(jsonb_build_object('okres', k.okres, 'typ', k.typ, 'n', k.n, 'm2', k.m2, 'od', k.od, 'do', k."do")
                        order by k.typ, k.n desc) from k), '[]'::jsonb),
    -- obce v okresoch, kde máme údaje (výber obce vo formulároch a náhrada okresom, keď je v obci málo inzerátov)
    'zoznam', coalesce((select jsonb_agg(jsonb_build_array(x.nazov, x.okres) order by x.mesto desc, x.nazov)
                        from lokality x where x.typ = 'obec' and x.okres in (select okres from k)), '[]'::jsonb),
    'inzeratov', (select count(*) from z), 'cas', now())
$$;

-- ---------------------------------------------------------------- maklér, ktorý pôsobí v obci
create or replace function public._portal_makler_oblasti(p_obec text, p_okres text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select n.makler_id from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
      where p_obec is not null and _bez_diakritiky(n.obec) = _bez_diakritiky(p_obec)
        and n.stav in ('aktivne', 'rezervovane', 'predane') and n.vytvorene > now() - interval '3 years'
      group by n.makler_id order by count(*) filter (where n.stav in ('aktivne', 'rezervovane')) desc, count(*) desc limit 1),
    (select m.id from makleri m join weby w on w.makler_id = m.id and not w.kancelaria and w.zverejnene is not null
      where m.aktivny and p_obec is not null and length(btrim(p_obec)) >= 3
        and position(_bez_diakritiky(p_obec) in _bez_diakritiky(w.zverejnene->>'area')) > 0
      order by m.vytvorene limit 1),
    (select n.makler_id from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
      where p_okres is not null and _bez_diakritiky(n.okres) = _bez_diakritiky(p_okres)
        and n.stav in ('aktivne', 'rezervovane', 'predane') and n.vytvorene > now() - interval '3 years'
      group by n.makler_id order by count(*) filter (where n.stav in ('aktivne', 'rezervovane')) desc, count(*) desc limit 1),
    (select m.id from makleri m join weby w on w.makler_id = m.id and not w.kancelaria and w.zverejnene is not null
      where m.aktivny and p_okres is not null and length(btrim(p_okres)) >= 3
        and position(_bez_diakritiky(p_okres) in _bez_diakritiky(w.zverejnene->>'area')) > 0
      order by m.vytvorene limit 1),
    (select m.id from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny order by h.vytvorene limit 1),
    (select id from makleri where aktivny and rola = 'admin' order by vytvorene limit 1))
$$;

-- ---------------------------------------------------------------- Koľko stojí moja nehnuteľnosť? / Chcem predať
create or replace function public.portal_predaj(p_typ text, p_meno text, p_kontakt text, p_udaje jsonb default null,
                                                p_overenie jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  DRUHY constant jsonb := '{"byt":"Byt","dom":"Rodinný dom","pozemok":"Pozemok","chata":"Chata alebo chalupa","ine":"Iná nehnuteľnosť"}';
  STAVY constant jsonb := '{"novostavba":"novostavba","rekonstrukcia":"po rekonštrukcii","povodny":"pôvodný stav"}';
  KEDY constant jsonb := '{"hned":"chce predať čo najskôr","mesiace":"chce predať do pár mesiacov","neviem":"ešte sa rozhoduje"}';
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_druh text := case when DRUHY ? coalesce(p_udaje->>'druh', '') then p_udaje->>'druh' end;
  v_obec text := nullif(left(btrim(regexp_replace(coalesce(p_udaje->>'obec', ''), '\s+', ' ', 'g')), 60), '');
  v_m2 numeric := case when replace(coalesce(p_udaje->>'m2', ''), ',', '.') ~ '^\d{1,6}(\.\d{1,2})?$' then replace(p_udaje->>'m2', ',', '.')::numeric end;
  v_izby int := case when coalesce(p_udaje->>'izby', '') ~ '^[1-9]$' then (p_udaje->>'izby')::int end;
  v_stav text := STAVY->>coalesce(p_udaje->>'stav', '');
  v_kedy text := KEDY->>coalesce(p_udaje->>'kedy', '');
  v_pozn text := left(btrim(coalesce(p_udaje->>'pozn', '')), 600);
  v_odkial text := _klient_odtlacok();
  v_okres text; v_obec_ok text; v_email boolean; v_komu uuid; v_odhad jsonb; v_popis text; v_text text; v_id bigint; v_nazov text;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return jsonb_build_object('ok', true); end if;
  if p_typ is null or p_typ not in ('odhad', 'predat') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  perform _portal_overenie('portal-' || p_typ, p_typ, p_overenie);
  if v_druh is null then raise exception 'Vyberte, čo chcete predať.' using errcode = '22023'; end if;
  if v_obec is null then raise exception 'Napíšte obec, kde je nehnuteľnosť.' using errcode = '22023'; end if;
  if v_m2 is not null and (v_m2 < 5 or v_m2 > 500000) then v_m2 := null; end if;
  if length(v_kontakt) < 5 then raise exception 'Napíšte telefón alebo e-mail, aby sa vám maklér mohol ozvať.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  else
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;

  -- obec podľa zoznamu obcí (správny názov a okres)
  select x.nazov, x.okres into v_obec_ok, v_okres from lokality x
   where x.typ = 'obec' and _bez_diakritiky(x.nazov) = _bez_diakritiky(v_obec)
   order by (x.nazov = v_obec) desc, x.mesto desc limit 1;
  v_obec := coalesce(v_obec_ok, v_obec);

  v_komu := _portal_makler_oblasti(v_obec, v_okres);
  if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918276, hashtext(coalesce(v_odkial, '-')));
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where portal and zdroj in ('odhad', 'predaj') and vytvorene > now() - interval '1 hour') >= 40 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;

  if p_typ = 'odhad' and v_druh in ('byt', 'dom', 'pozemok', 'chata') then v_odhad := _odhad_ceny(v_druh, v_obec, v_m2); end if;
  v_popis := concat_ws(', ', DRUHY->>v_druh, v_obec || case when v_okres is not null and v_okres <> v_obec then ' (okres ' || v_okres || ')' else '' end,
                       case when v_m2 is not null then _cislo_sk(v_m2) || ' m²' end,
                       case when v_izby is not null then v_izby || case when v_izby = 1 then ' izba' when v_izby < 5 then ' izby' else ' izieb' end end, v_stav);
  v_nazov := case when p_typ = 'odhad' then 'Odhad ceny' else 'Chce predať' end;
  v_text := concat_ws('. ', v_nazov || ': ' || v_popis, case when v_kedy is not null then upper(left(v_kedy, 1)) || substr(v_kedy, 2) end,
                      nullif(v_pozn, ''), case when v_odhad is not null then _odhad_text(v_odhad) end);

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, odkial, portal)
  values (null, v_komu, case when p_typ = 'odhad' then 'odhad' else 'predaj' end, v_meno, v_kontakt, left(v_text, 1500), v_odkial, true)
  returning id into v_id;

  -- s telefónom sa zapíše aj medzi predávajúcich (Klienti → Predávajúci), ako pri webe kancelárie
  if not v_email and v_kontakt ~ '^0\d{8,10}$' then
    insert into predajcovia (telefon, meno, poznamka, makler_id, upravene)
    values (v_kontakt, v_meno, left('Z Týpkových nehnuteľností – ' || v_nazov || ': ' || v_popis || case when v_kedy is not null then '. ' || v_kedy else '' end ||
            case when v_pozn <> '' then '. ' || v_pozn else '' end, 2000), v_komu, now())
    on conflict (telefon) do update set
      makler_id = coalesce(predajcovia.makler_id, excluded.makler_id),
      meno = coalesce(predajcovia.meno, excluded.meno),
      poznamka = left(coalesce(predajcovia.poznamka || E'\n', '') || excluded.poznamka, 2000),
      upravene = now();
  end if;

  insert into pripomienky (makler_id, cas, poznamka, druh, web_kontakt_id)
  values (v_komu, now(), left('Nový kontakt z Týpkových nehnuteľností – ' || v_nazov || ': ' || coalesce(v_meno || ', ', '') || v_kontakt || '. ' ||
          v_popis || case when v_kedy is not null then '. ' || upper(left(v_kedy, 1)) || substr(v_kedy, 2) else '' end ||
          case when v_pozn <> '' then '. ' || v_pozn else '' end, 500), 'web', v_id);
  update push_fronta set titul = case when p_typ = 'odhad' then '🏡 Odhad ceny z Týpkových nehnuteľností' else '🏡 Chce predať – Týpkove nehnuteľnosti' end
   where odoslane is null and tag in (select 'typek-kontakt-' || id from pripomienky where web_kontakt_id = v_id);

  return jsonb_build_object('ok', true, 'obec', v_obec,
    'makler', (select jsonb_strip_nulls(jsonb_build_object('meno', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'telefon', m.telefon,
                 'foto', case when m.foto like 'data:image/%' then m.foto end)) from makleri m where m.id = v_komu));
end $$;

-- ---------------------------------------------------------------- strážca ponúk portálu
create table if not exists public.portal_strazcovia (
  id bigint generated always as identity primary key,
  email text not null,
  meno text,
  filtre jsonb not null default '{}'::jsonb,
  token text not null unique,
  odkial text,
  potvrdeny timestamptz,
  potvrdenie_odoslane timestamptz,
  potvrdenie_pokusy int not null default 0,
  odhlaseny timestamptz,
  posledny_email timestamptz,
  emailov int not null default 0,
  vytvorene timestamptz not null default now()
);
create index if not exists portal_strazcovia_email on public.portal_strazcovia (lower(email)) where odhlaseny is null;
create table if not exists public.portal_strazca_fronta (
  id bigint generated always as identity primary key,
  strazca_id bigint not null references public.portal_strazcovia(id) on delete cascade,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  cena numeric,
  zlacnena boolean not null default false,
  vytvorene timestamptz not null default now(),
  odoslane timestamptz,
  chyba text,
  pokusy int not null default 0
);
create unique index if not exists portal_strazca_fronta_kluc on public.portal_strazca_fronta (strazca_id, nehnutelnost_id, coalesce(cena, -1));
create index if not exists portal_strazca_fronta_caka on public.portal_strazca_fronta (vytvorene) where odoslane is null;
create index if not exists portal_strazca_fronta_ponuka on public.portal_strazca_fronta (nehnutelnost_id);
alter table public.portal_strazcovia enable row level security;
alter table public.portal_strazca_fronta enable row level security;
revoke all on public.portal_strazcovia, public.portal_strazca_fronta from anon, authenticated;

-- rovnaké pravidlá ako filtre na portáli (druh, kúpa/prenájom, obec, cena, plocha, izby)
create or replace function public._portal_sedi(f jsonb, n nehnutelnosti) returns boolean
language sql stable set search_path = public as $$
  select (coalesce(f->>'t', '') = '' or n.transakcia = f->>'t')
     and (coalesce(f->>'k', '') = '' or n.kategoria = f->>'k')
     and (coalesce(f->>'q', '') = '' or position(_bez_diakritiky(f->>'q') in _bez_diakritiky(concat_ws(' ', n.obec, n.cast_obce, n.okres, n.nazov, n.typ))) > 0)
     and (f->>'cod' is null or (n.zobrazit_cenu and n.cena >= (f->>'cod')::numeric))
     and (f->>'cdo' is null or (n.zobrazit_cenu and n.cena is not null and n.cena <= (f->>'cdo')::numeric))
     and (f->>'pod' is null or coalesce(case when n.kategoria = 'pozemky' then n.plocha_pozemku else coalesce(n.plocha_uzitkova, n.plocha_pozemku) end, 0) >= (f->>'pod')::numeric)
     and (f->>'izby' is null or coalesce(n.izby, (substring(coalesce(n.typ, '') from '(\d)\s*-?\s*izb'))::int,
                                          case when n.typ ilike '%garsónka%' then 1 end, 0) >= (f->>'izby')::int)
$$;

-- popis strážcu do e-mailov (len z overených hodnôt filtra)
create or replace function public._portal_strazca_popis(f jsonb) returns text
language sql immutable set search_path = public as $$
  select concat_ws(' · ',
    coalesce((('{"byty":"byty","domy":"domy","pozemky":"pozemky","chaty":"chaty a chalupy","priestory":"priestory","objekty":"objekty","garaze":"garáže"}'::jsonb)->>(f->>'k')), 'všetky nehnuteľnosti')
      || case f->>'t' when 'predaj' then ' na predaj' when 'prenajom' then ' na prenájom' else '' end,
    nullif(f->>'q', ''),
    case when f->>'cod' is not null and f->>'cdo' is not null then _cislo_sk((f->>'cod')::numeric) || ' – ' || _cislo_sk((f->>'cdo')::numeric) || ' €'
         when f->>'cdo' is not null then 'do ' || _cislo_sk((f->>'cdo')::numeric) || ' €'
         when f->>'cod' is not null then 'od ' || _cislo_sk((f->>'cod')::numeric) || ' €' end,
    case when f->>'pod' is not null then 'od ' || _cislo_sk((f->>'pod')::numeric) || ' m²' end,
    case when f->>'izby' is not null then (f->>'izby') || '+ izby' end)
$$;

create or replace function public.portal_strazca(p_email text, p_meno text default null, p_filtre jsonb default null,
                                                 p_overenie jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 40), '');
  v_q text := left(btrim(regexp_replace(coalesce(p_filtre->>'q', ''), '\s+', ' ', 'g')), 40);
  v_f jsonb; v_odkial text := _klient_odtlacok(); v_cislo text;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  perform _portal_overenie('portal-strazca', 'strazca', p_overenie);
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$' or length(v_email) > 120 then
    raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  end if;
  if v_meno is not null and v_meno !~ '^[[:alpha:] .''-]+$' then v_meno := null; end if;
  if v_q <> '' and v_q !~ '^[[:alpha:] .-]+$' then v_q := ''; end if;
  v_f := jsonb_strip_nulls(jsonb_build_object(
    't', case when p_filtre->>'t' in ('predaj', 'prenajom') then p_filtre->>'t' end,
    'k', case when p_filtre->>'k' in ('byty', 'domy', 'pozemky', 'chaty', 'priestory', 'objekty', 'garaze') then p_filtre->>'k' end,
    'q', nullif(v_q, ''),
    'cod', case when coalesce(p_filtre->>'cod', '') ~ '^\d{1,9}$' and (p_filtre->>'cod')::bigint > 0 then (p_filtre->>'cod')::bigint end,
    'cdo', case when coalesce(p_filtre->>'cdo', '') ~ '^\d{1,9}$' and (p_filtre->>'cdo')::bigint > 0 then (p_filtre->>'cdo')::bigint end,
    'pod', case when coalesce(p_filtre->>'pod', '') ~ '^\d{1,7}$' and (p_filtre->>'pod')::bigint > 0 then (p_filtre->>'pod')::bigint end,
    'izby', case when coalesce(p_filtre->>'izby', '') ~ '^[1-9]$' then (p_filtre->>'izby')::int end));

  perform pg_advisory_xact_lock(918277, hashtext(v_email));
  -- rovnaký strážca na rovnaký e-mail sa nezakladá druhýkrát
  if exists (select 1 from portal_strazcovia where lower(email) = v_email and filtre = v_f and odhlaseny is null
             and (potvrdeny is not null or vytvorene > now() - interval '7 days')) then return 'ok'; end if;
  if v_odkial is not null and (select count(*) from portal_strazcovia where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 5 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from portal_strazcovia where lower(email) = v_email and vytvorene > now() - interval '1 day') >= 3
     or (select count(*) from portal_strazcovia where vytvorene > now() - interval '1 hour') >= 60 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from portal_strazcovia where lower(email) = v_email and odhlaseny is null and potvrdeny is not null) >= 5 then
    raise exception 'Na tento e-mail už máte 5 strážcov. Niektorého odhláste odkazom v e-maile a skúste to znova.' using errcode = '22023';
  end if;
  v_cislo := encode(extensions.gen_random_bytes(24), 'hex');
  insert into portal_strazcovia (email, meno, filtre, token, odkial) values (v_email, v_meno, v_f, v_cislo, v_odkial);
  return 'ok';
end $$;

create or replace function public.portal_strazca_potvrdit(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s portal_strazcovia;
begin
  select * into s from portal_strazcovia where token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 20 for update;
  if not found or s.odhlaseny is not null then return jsonb_build_object('ok', false); end if;
  if s.potvrdeny is null then
    if s.vytvorene < now() - interval '30 days' then return jsonb_build_object('ok', false, 'stary', true); end if;
    update portal_strazcovia set potvrdeny = now() where id = s.id;
  end if;
  return jsonb_build_object('ok', true, 'popis', _portal_strazca_popis(s.filtre));
end $$;

create or replace function public.portal_strazca_odhlasit(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s portal_strazcovia;
begin
  select * into s from portal_strazcovia where token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 20;
  if not found then return jsonb_build_object('ok', false); end if;
  if s.odhlaseny is null then update portal_strazcovia set odhlaseny = now() where id = s.id; end if;
  return jsonb_build_object('ok', true, 'popis', _portal_strazca_popis(s.filtre));
end $$;

-- nová ponuka na portáli alebo znížená cena → do fronty strážcom, ktorým zodpovedá
create or replace function public._portal_strazca_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; v_zlacnena boolean := false;
begin
  if new.stav <> 'aktivne' or not _portal_viditelna(new) then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and coalesce(old.na_portali, true) then
    if not (new.zobrazit_cenu and new.cena < old.cena) then return new; end if;
    v_zlacnena := true;
  end if;
  for s in select id, filtre from portal_strazcovia where potvrdeny is not null and odhlaseny is null loop
    if _portal_sedi(s.filtre, new) then
      insert into portal_strazca_fronta (strazca_id, nehnutelnost_id, cena, zlacnena) values (s.id, new.id, new.cena, v_zlacnena)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists nehnutelnosti_strazca_portal on public.nehnutelnosti;
create trigger nehnutelnosti_strazca_portal after insert or update of stav, cena, na_portali on public.nehnutelnosti
  for each row execute function public._portal_strazca_ponuka();

-- e-maily s potvrdením (volá funkcia „pripomienky“): nepotvrdené prihlásenia za posledných 7 dní, každé raz
create or replace function public._portal_strazca_potvrdenia(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r portal_strazcovia; v_out jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(510061) then return v_out; end if;
  for r in select * from portal_strazcovia
           where potvrdeny is null and odhlaseny is null and potvrdenie_odoslane is null and vytvorene > now() - interval '7 days'
           order by vytvorene limit greatest(1, least(coalesce(p_limit, 20), 50)) for update skip locked loop
    update portal_strazcovia set potvrdenie_odoslane = now() where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'email', r.email, 'meno', r.meno, 'token', r.token,
                                                           'popis', _portal_strazca_popis(r.filtre)));
  end loop;
  return v_out;
end $$;

create or replace function public._portal_strazca_potvrdenie_chyba(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update portal_strazcovia set potvrdenie_pokusy = potvrdenie_pokusy + 1,
         potvrdenie_odoslane = case when potvrdenie_pokusy + 1 >= 3 then potvrdenie_odoslane end
   where id = p_id;
$$;

-- e-maily s ponukami: najviac raz za 12 hodín, ponuka 10 minút po zverejnení (stihne sa opraviť)
create or replace function public._portal_strazca_na_odoslanie(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; v_ponuky jsonb;
begin
  if not pg_try_advisory_xact_lock(510062) then return v_out; end if;
  update portal_strazca_fronta f set odoslane = now(), chyba = 'neaktuálne'
   where f.odoslane is null and (f.vytvorene < now() - interval '14 days'
     or exists (select 1 from portal_strazcovia s where s.id = f.strazca_id and (s.odhlaseny is not null or s.potvrdeny is null))
     or not exists (select 1 from nehnutelnosti n where n.id = f.nehnutelnost_id and n.stav = 'aktivne' and _portal_viditelna(n)));
  for r in select s.id, s.email, s.meno, s.token, s.filtre, array_agg(f.id) as ids, array_agg(distinct f.nehnutelnost_id) as nids
           from portal_strazca_fronta f join portal_strazcovia s on s.id = f.strazca_id
           where f.odoslane is null and f.vytvorene < now() - interval '10 minutes' and s.potvrdeny is not null and s.odhlaseny is null
             and (s.posledny_email is null or s.posledny_email < now() - interval '12 hours')
           group by s.id order by min(f.vytvorene) limit greatest(1, least(coalesce(p_limit, 20), 50)) loop
    v_ponuky := (select jsonb_agg(_portal_karta(n) - 'vybavenie'
                   || jsonb_build_object(-- znížená cena len pri ponuke, ktorú už strážca predtým videl (nová ponuka je „nová“, aj keď medzitým zlacnela)
                        'nova_cena', not exists (select 1 from portal_strazca_fronta f2 where f2.id = any(r.ids) and f2.nehnutelnost_id = n.id and not f2.zlacnena),
                        'url', 'https://realitnytypek.sk/nehnutelnosti/' || n.id || coalesce('-' || nullif(_slug_ponuky(n), ''), ''),
                        'makler_meno', (select _meno_cele(m.titul_pred, m.meno, m.titul_za) from makleri m where m.id = n.makler_id),
                        'makler_telefon', (select m.telefon from makleri m where m.id = n.makler_id),
                        'kancelaria_nazov', _portal_kancelaria(n.kancelaria)->>'nazov')
                   order by n.cena nulls last)
                 from nehnutelnosti n where n.id = any(r.nids) and n.stav = 'aktivne' and _portal_viditelna(n));
    update portal_strazca_fronta set odoslane = now(), chyba = null where id = any(r.ids) and odoslane is null;
    if v_ponuky is null then continue; end if;
    update portal_strazcovia set posledny_email = now(), emailov = emailov + 1 where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'ids', to_jsonb(r.ids), 'email', r.email, 'meno', r.meno,
      'token', r.token, 'popis', _portal_strazca_popis(r.filtre), 'filtre', r.filtre, 'ponuky', v_ponuky));
  end loop;
  return v_out;
end $$;

create or replace function public._portal_strazca_chyba(p_id bigint, p_ids bigint[], p_chyba text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update portal_strazcovia set posledny_email = null, emailov = greatest(emailov - 1, 0) where id = p_id;
  update portal_strazca_fronta set pokusy = pokusy + 1, chyba = left(coalesce(p_chyba, 'chyba'), 300),
         odoslane = case when pokusy + 1 >= 3 then now() end
   where id = any(p_ids);
end $$;

-- ---------------------------------------------------------------- stránka kancelárie
create or replace function public.portal_kancelaria(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_r jsonb; v_g jsonb;
begin
  if p_id is null or p_id !~ '^[a-z0-9_-]{1,40}$' then return null; end if;
  if not exists (select 1 from nehnutelnosti n where n.kancelaria = p_id and _portal_viditelna(n)) then return null; end if;
  v_r := verejne_recenzie(null);
  v_r := (v_r - 'zoznam') || jsonb_build_object('zoznam', coalesce((select jsonb_agg(e - 'zdroj' order by o)
           from jsonb_array_elements(coalesce(v_r->'zoznam', '[]'::jsonb)) with ordinality t(e, o) where o <= 12), '[]'::jsonb));
  select hodnota::jsonb - 'place_id' into v_g from nastavenia where kluc = 'google_recenzie';
  return jsonb_build_object('kancelaria', _portal_kancelaria(p_id), 'recenzie', v_r, 'google', v_g);
end $$;

-- ---------------------------------------------------------------- štatistika pre makléra
create or replace function public.portal_zobrazenie(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  if ja_aktivny() then return; end if;   -- makléri sa nepočítajú
  select * into n from nehnutelnosti where id = p_id;
  if not found or not _portal_viditelna(n) then return; end if;
  insert into zobrazenia_ponuk (nehnutelnost_id, den, pocet, portal) values (p_id, current_date, 1, 1)
    on conflict (nehnutelnost_id, den) do update set pocet = zobrazenia_ponuk.pocet + 1, portal = zobrazenia_ponuk.portal + 1;
end $$;

create or replace function public.portal_statistika() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not ja_aktivny() then raise exception 'Prístup zamietnutý.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ponuky', coalesce((select jsonb_object_agg(id::text, jsonb_build_object('z', z, 'z7', z7, 'd', d, 'd30', d30)) from (
        select coalesce(a.id, b.id) id, coalesce(a.z, 0) z, coalesce(a.z7, 0) z7, coalesce(b.d, 0) d, coalesce(b.d30, 0) d30
        from (select nehnutelnost_id id, sum(portal) z, sum(portal) filter (where den > current_date - 7) z7
              from zobrazenia_ponuk where portal > 0 group by nehnutelnost_id) a
        full join (select nehnutelnost_id id, count(*) d, count(*) filter (where vytvorene > now() - interval '30 days') d30
                   from web_kontakty where portal and nehnutelnost_id is not null group by nehnutelnost_id) b on b.id = a.id) x), '{}'::jsonb),
    'ja', jsonb_build_object(
      'z30', coalesce((select sum(z.portal) from zobrazenia_ponuk z join nehnutelnosti n on n.id = z.nehnutelnost_id
                       where n.makler_id = auth.uid() and z.den > current_date - 30), 0),
      'd30', (select count(*) from web_kontakty where portal and makler_id = auth.uid() and nehnutelnost_id is not null and vytvorene > now() - interval '30 days'),
      'predaj30', (select count(*) from web_kontakty where portal and makler_id = auth.uid() and zdroj in ('odhad', 'predaj') and vytvorene > now() - interval '30 days')));
end $$;

-- ---------------------------------------------------------------- práva
revoke execute on function public._bez_diakritiky(text) from public, anon, authenticated;
revoke execute on function public._portal_makler_oblasti(text, text), public._portal_sedi(jsonb, nehnutelnosti),
  public._portal_strazca_popis(jsonb), public._portal_strazca_ponuka(),
  public._portal_strazca_potvrdenia(int), public._portal_strazca_potvrdenie_chyba(bigint),
  public._portal_strazca_na_odoslanie(int), public._portal_strazca_chyba(bigint, bigint[], text) from public, anon, authenticated;
grant execute on function public._portal_strazca_potvrdenia(int), public._portal_strazca_potvrdenie_chyba(bigint),
  public._portal_strazca_na_odoslanie(int), public._portal_strazca_chyba(bigint, bigint[], text) to service_role;
revoke execute on function public.portal_ceny(), public.portal_predaj(text, text, text, jsonb, jsonb),
  public.portal_strazca(text, text, jsonb, jsonb), public.portal_strazca_potvrdit(text), public.portal_strazca_odhlasit(text),
  public.portal_kancelaria(text), public.portal_zobrazenie(bigint) from public;
grant execute on function public.portal_ceny(), public.portal_predaj(text, text, text, jsonb, jsonb),
  public.portal_strazca(text, text, jsonb, jsonb), public.portal_strazca_potvrdit(text), public.portal_strazca_odhlasit(text),
  public.portal_kancelaria(text), public.portal_zobrazenie(bigint) to anon, authenticated;
revoke execute on function public.portal_statistika() from public, anon;
grant execute on function public.portal_statistika() to authenticated;

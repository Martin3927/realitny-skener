-- =====================================================================
-- 088: Týpkove nehnuteľnosti – opravy po kontrole
--  * cenová mapa: pozemky len stavebné (záhrady a orná pôda by cenu pokazili)
--  * odhad a Chcem predať: obec sa hľadá aj podľa okresu (rovnaké názvy obcí v rôznych okresoch)
--  * strážca ponúk: znížená cena len pri skutočnom znížení (nie pri chýbajúcej cene), pred odoslaním sa ponuka
--    znova porovná s filtrom, tá istá ponuka na jednu adresu raz; na jednu adresu čaká najviac jedno potvrdenie
--    (e-mail na potvrdenie najviac raz za deň), meno a hľadaný text bez bodiek, celkový strop strážcov
--  * upratovanie údajov (GDPR): nepotvrdení a odhlásení strážcovia po 30 dňoch preč, odoslaná fronta po 90 dňoch,
--    odtlačok prehliadača pri kontaktoch z portálu po 7 dňoch
-- =====================================================================

create index if not exists lokality_obec_nazov_okres on public.lokality (nazov, okres) where typ = 'obec';
create index if not exists inzeraty_ceny_portal on public.inzeraty (prvy_krat) where duplikat_z is null;

create or replace function public.portal_ceny() returns jsonb
language sql stable security definer set search_path = public as $$
  with z as (
    select i.obec, i.okres, i.typ, i.cena_m2
    from inzeraty i
    where i.duplikat_z is null and i.prvy_krat > now() - interval '12 months' and i.typ in ('byt', 'dom', 'pozemok')
      and (i.typ <> 'pozemok' or i.podtyp = 'stavebny')   -- záhrady a orná pôda by cenu stavebných pozemkov pokazili
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
  v_okres_z text := nullif(left(btrim(coalesce(p_udaje->>'okres', '')), 60), '');
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
   order by (x.okres = v_okres_z) is true desc, (x.nazov = v_obec) desc, x.mesto desc limit 1;
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
  -- meno a hľadaný text idú do e-mailu: len písmená (bez bodiek, aby z nich nebol odkaz na web)
  if v_meno is not null and v_meno !~ '^[[:alpha:] ''-]+$' then v_meno := null; end if;
  if v_q <> '' then
    v_q := btrim(regexp_replace(regexp_replace(v_q, '[^[:alpha:][:digit:] -]+', ' ', 'g'), '\s+', ' ', 'g'));
    if v_q = '' then raise exception 'V hľadaní nechajte len názov obce alebo časti.' using errcode = '22023'; end if;
  end if;
  v_f := jsonb_strip_nulls(jsonb_build_object(
    't', case when p_filtre->>'t' in ('predaj', 'prenajom') then p_filtre->>'t' end,
    'k', case when p_filtre->>'k' in ('byty', 'domy', 'pozemky', 'chaty', 'priestory', 'objekty', 'garaze') then p_filtre->>'k' end,
    'q', nullif(v_q, ''),
    'cod', case when coalesce(p_filtre->>'cod', '') ~ '^\d{1,9}$' and (p_filtre->>'cod')::bigint > 0 then (p_filtre->>'cod')::bigint end,
    'cdo', case when coalesce(p_filtre->>'cdo', '') ~ '^\d{1,9}$' and (p_filtre->>'cdo')::bigint > 0 then (p_filtre->>'cdo')::bigint end,
    'pod', case when coalesce(p_filtre->>'pod', '') ~ '^\d{1,7}$' and (p_filtre->>'pod')::bigint > 0 then (p_filtre->>'pod')::bigint end,
    'izby', case when coalesce(p_filtre->>'izby', '') ~ '^[1-9]$' then (p_filtre->>'izby')::int end));

  perform pg_advisory_xact_lock(918277, hashtext(v_email));
  -- rovnaký potvrdený strážca na rovnaký e-mail sa nezakladá druhýkrát
  if exists (select 1 from portal_strazcovia where lower(email) = v_email and filtre = v_f and odhlaseny is null and potvrdeny is not null) then
    return 'ok';
  end if;
  -- na jednu adresu čaká najviac jedno potvrdenie: nové prihlásenie len zmení filter, e-mail na potvrdenie
  -- sa pošle znova najskôr po dni (nedá sa tak zasypávať cudziu schránku)
  if exists (select 1 from portal_strazcovia where lower(email) = v_email and potvrdeny is null and odhlaseny is null and vytvorene > now() - interval '30 days') then
    update portal_strazcovia set filtre = v_f, meno = coalesce(v_meno, meno),
           potvrdenie_odoslane = case when potvrdenie_odoslane < now() - interval '1 day' then null else potvrdenie_odoslane end,
           potvrdenie_pokusy = case when potvrdenie_odoslane < now() - interval '1 day' then 0 else potvrdenie_pokusy end
     where id = (select id from portal_strazcovia where lower(email) = v_email and potvrdeny is null and odhlaseny is null
                 and vytvorene > now() - interval '30 days' order by vytvorene desc limit 1);
    return 'ok';
  end if;
  if v_odkial is not null and (select count(*) from portal_strazcovia where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 5 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from portal_strazcovia where vytvorene > now() - interval '1 hour') >= 60
     or (select count(*) from portal_strazcovia where potvrdeny is not null and odhlaseny is null) >= 5000 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from portal_strazcovia where lower(email) = v_email and odhlaseny is null and potvrdeny is not null) >= 5 then
    raise exception 'Na túto adresu už posielame viac strážcov. Niektorého vypnite odkazom v e-maile a skúste to znova.' using errcode = '22023';
  end if;
  v_cislo := encode(extensions.gen_random_bytes(24), 'hex');
  insert into portal_strazcovia (email, meno, filtre, token, odkial) values (v_email, v_meno, v_f, v_cislo, v_odkial);
  return 'ok';
end $$;

create or replace function public._portal_strazca_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; v_zlacnena boolean := false;
begin
  if new.stav <> 'aktivne' or not _portal_viditelna(new) then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and coalesce(old.na_portali, true) then
    -- len skutočné zníženie zobrazenej ceny (pri chýbajúcej cene nič)
    if new.cena is null or old.cena is null or not coalesce(new.zobrazit_cenu, false) or new.cena >= old.cena then return new; end if;
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
                 from nehnutelnosti n where n.id = any(r.nids) and n.stav = 'aktivne' and _portal_viditelna(n)
                   -- ponuka môže byť medzičasom opravená (cena, obec…): pošle sa, len keď stále sedí
                   and _portal_sedi(r.filtre, n)
                   -- tá istá ponuka na tú istú adresu len raz za 14 dní, aj keď má človek viac strážcov
                   and not exists (select 1 from portal_strazca_fronta f3 join portal_strazcovia s3 on s3.id = f3.strazca_id
                                   where lower(s3.email) = lower(r.email) and s3.id <> r.id and f3.nehnutelnost_id = n.id
                                     and f3.chyba is null and f3.odoslane > now() - interval '14 days'));
    update portal_strazca_fronta set odoslane = now(), chyba = null where id = any(r.ids) and odoslane is null;
    if v_ponuky is null then continue; end if;
    update portal_strazcovia set posledny_email = now(), emailov = emailov + 1 where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'ids', to_jsonb(r.ids), 'email', r.email, 'meno', r.meno,
      'token', r.token, 'popis', _portal_strazca_popis(r.filtre), 'filtre', r.filtre, 'ponuky', v_ponuky));
  end loop;
  return v_out;
end $$;

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
    case when f->>'izby' is not null then (f->>'izby') || case (f->>'izby')::int when 1 then ' izba' when 2 then ' izby' when 3 then ' izby' when 4 then ' izby' else ' izieb' end || ' a viac' end)
$$;

-- ---------------------------------------------------------------- upratovanie (každú noc)
create or replace function public._portal_upratanie() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from portal_strazcovia where potvrdeny is null and vytvorene < now() - interval '30 days';
  delete from portal_strazcovia where odhlaseny is not null and odhlaseny < now() - interval '30 days';
  delete from portal_strazca_fronta where odoslane is not null and odoslane < now() - interval '90 days';
  update portal_strazcovia set odkial = null where odkial is not null and vytvorene < now() - interval '7 days';
  update web_kontakty set odkial = null where portal and odkial is not null and vytvorene < now() - interval '7 days';
end $$;
revoke execute on function public._portal_upratanie() from public, anon, authenticated;
select cron.schedule('portal-upratanie', '17 3 * * *', 'select public._portal_upratanie()');

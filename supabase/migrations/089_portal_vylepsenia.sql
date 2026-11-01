-- =====================================================================
-- 089: Týpkove nehnuteľnosti – vylepšenia po kontrole
--  * strážca ponúk:
--      - ukladanie ponuky v Týpkovi už nečaká na porovnávanie so strážcami: spúšťač len zapíše udalosť,
--        porovná ich plánovač každú minútu (_portal_strazca_rozdel)
--      - e-mail sa označí ako odoslaný až po úspešnom odoslaní (_portal_strazca_odoslane); keď funkcia spadne,
--        ponuky sa po 15 minútach pošlú znova; po 5 neúspešných pokusoch za sebou sa strážca vypne
--      - viac čakajúcich prihlásení na jednu adresu: jedno potvrdenie ich potvrdí všetky, e-mail na potvrdenie
--        najviac raz za deň; najviac 5 čakajúcich na adresu
--      - nový druh: upozornenie na zníženie ceny jednej ponuky (filtre.id)
--  * ochrana formulárov: odtlačok IPv6 podľa siete /64 a s tajnou soľou; pri náraste podaní (mäkký strop)
--    sa vyžaduje ťažšie overenie namiesto odmietnutia, pevný strop je oveľa vyššie
--  * dopyt z portálu môže niesť termín obhliadky (portal_kontakt.p_termin)
--  * cenová mapa: vývoj ponukových cien v okrese po štvrťrokoch (keď sú aspoň 2 štvrťroky s 10+ inzerátmi)
--  * upratovanie: kontakty z portálu po 2 rokoch, spracované udalosti strážcu po 7 dňoch
-- =====================================================================

-- ---------------------------------------------------------------- odtlačok prehliadača (ochrana pred zneužitím)
insert into public.nastavenia (kluc, hodnota)
select 'odtlacok_sol', encode(extensions.gen_random_bytes(24), 'hex')
where not exists (select 1 from public.nastavenia where kluc = 'odtlacok_sol');

create or replace function public._klient_odtlacok() returns text
language plpgsql stable security definer set search_path = public as $$
declare h json; ip text; v_ip inet; v_sol text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1))), '');
  if ip is null then return null; end if;
  -- IPv6: celá sieť /64 je jeden odtlačok (domácnosť si vie meniť adresy v rámci siete)
  begin
    v_ip := ip::inet;
    if family(v_ip) = 6 then ip := host(network(set_masklen(v_ip, 64))) || '/64'; else ip := host(v_ip); end if;
  exception when others then null;
  end;
  select hodnota into v_sol from nastavenia where kluc = 'odtlacok_sol';
  return md5(coalesce(v_sol, 'realitny-typek-web') || ':' || ip);
end $$;
revoke execute on function public._klient_odtlacok() from public, anon, authenticated;

-- overenie proti robotom s voliteľnou obťažnosťou (4 = bežne, 5 = pri náraste podaní)
create or replace function public._portal_overenie2(p_adresa text, p_zdroj text, p_overenie jsonb, p_nul int) returns void
language plpgsql security definer set search_path = public as $$
declare v_ts bigint; v_nonce text; v_hash text;
begin
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|' || p_adresa || '|' || p_zdroj || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  -- stránka pri tejto odpovedi sama vypočíta ťažšie overenie a pošle formulár znova
  if coalesce(p_nul, 4) >= 5 and left(v_hash, 5) <> '00000' then raise exception 'tazsie-overenie' using errcode = 'P0001'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;
end $$;
create or replace function public._portal_overenie(p_adresa text, p_zdroj text, p_overenie jsonb) returns void
language sql security definer set search_path = public as $$ select _portal_overenie2(p_adresa, p_zdroj, p_overenie, 4) $$;
revoke execute on function public._portal_overenie2(text, text, jsonb, int), public._portal_overenie(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- Koľko stojí / Chcem predať: mäkký a pevný strop
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
  v_hodina int;
  v_okres text; v_obec_ok text; v_email boolean; v_komu uuid; v_odhad jsonb; v_popis text; v_text text; v_id bigint; v_nazov text;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return jsonb_build_object('ok', true); end if;
  if p_typ is null or p_typ not in ('odhad', 'predat') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  -- pri náraste podaní (napríklad útok robotov) sa vyžaduje ťažšie overenie; skutoční ľudia počkajú pár sekúnd navyše
  select count(*) into v_hodina from web_kontakty where portal and zdroj in ('odhad', 'predaj') and vytvorene > now() - interval '1 hour';
  if v_hodina >= 200 then raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000'; end if;
  perform _portal_overenie2('portal-' || p_typ, p_typ, p_overenie, case when v_hodina >= 20 then 5 else 4 end);
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

-- ---------------------------------------------------------------- dopyt z portálu aj s termínom obhliadky
drop function if exists public.portal_kontakt(bigint, text, text, text, text, jsonb);
create or replace function public.portal_kontakt(p_id bigint, p_zdroj text, p_kontakt text, p_meno text default null,
                                                 p_co text default null, p_overenie jsonb default null, p_termin timestamptz default null) returns text
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti; v text; v_kid bigint;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  if p_zdroj is null or p_zdroj not in ('obhliadka', 'kontakt', 'callback') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  select * into n from nehnutelnosti where id = p_id;
  if not found or not _portal_viditelna(n) then raise exception 'Ponuka už nie je dostupná.' using errcode = '22023'; end if;
  v := ponuka_kontakt(p_id, p_zdroj, p_kontakt, p_meno, p_co, p_overenie, case when p_zdroj = 'obhliadka' then p_termin end);
  v_kid := currval(pg_get_serial_sequence('public.web_kontakty', 'id'));
  update web_kontakty set portal = true where id = v_kid and nehnutelnost_id = p_id;
  if found then
    update push_fronta set titul = '💬 Nový kontakt z Týpkových nehnuteľností'
     where odoslane is null and tag in (select 'typek-kontakt-' || id from pripomienky where web_kontakt_id = v_kid);
    update pripomienky set poznamka = left(regexp_replace(poznamka, '^Nový kontakt z webu – ', 'Nový kontakt z Týpkových nehnuteľností – '), 500)
     where web_kontakt_id = v_kid;
  end if;
  return v;
end $$;
revoke execute on function public.portal_kontakt(bigint, text, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.portal_kontakt(bigint, text, text, text, text, jsonb, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------- strážca: filtre (aj sledovanie ceny jednej ponuky)
create or replace function public._portal_sedi(f jsonb, n nehnutelnosti) returns boolean
language sql stable set search_path = public as $$
  select (f->>'id' is null or n.id = (f->>'id')::bigint)
     and (coalesce(f->>'t', '') = '' or n.transakcia = f->>'t')
     and (coalesce(f->>'k', '') = '' or n.kategoria = f->>'k')
     and (coalesce(f->>'q', '') = '' or position(_bez_diakritiky(f->>'q') in _bez_diakritiky(concat_ws(' ', n.obec, n.cast_obce, n.okres, n.nazov, n.typ))) > 0)
     and (f->>'cod' is null or (n.zobrazit_cenu and n.cena >= (f->>'cod')::numeric))
     and (f->>'cdo' is null or (n.zobrazit_cenu and n.cena is not null and n.cena <= (f->>'cdo')::numeric))
     and (f->>'pod' is null or coalesce(case when n.kategoria = 'pozemky' then n.plocha_pozemku else coalesce(n.plocha_uzitkova, n.plocha_pozemku) end, 0) >= (f->>'pod')::numeric)
     and (f->>'izby' is null or coalesce(n.izby, (substring(coalesce(n.typ, '') from '(\d)\s*-?\s*izb'))::int,
                                          case when n.typ ilike '%garsónka%' then 1 end, 0) >= (f->>'izby')::int)
$$;

create or replace function public._portal_strazca_popis(f jsonb) returns text
language sql stable set search_path = public as $$
  select case when f->>'id' is not null then
    'zníženie ceny: ' || coalesce((select coalesce(nullif(btrim(n.nazov), ''), concat_ws(', ', n.typ, n.obec)) from nehnutelnosti n where n.id = (f->>'id')::bigint), 'ponuka č. ' || (f->>'id'))
  else concat_ws(' · ',
    coalesce((('{"byty":"byty","domy":"domy","pozemky":"pozemky","chaty":"chaty a chalupy","priestory":"priestory","objekty":"objekty","garaze":"garáže"}'::jsonb)->>(f->>'k')), 'všetky nehnuteľnosti')
      || case f->>'t' when 'predaj' then ' na predaj' when 'prenajom' then ' na prenájom' else '' end,
    nullif(f->>'q', ''),
    case when f->>'cod' is not null and f->>'cdo' is not null then _cislo_sk((f->>'cod')::numeric) || ' – ' || _cislo_sk((f->>'cdo')::numeric) || ' €'
         when f->>'cdo' is not null then 'do ' || _cislo_sk((f->>'cdo')::numeric) || ' €'
         when f->>'cod' is not null then 'od ' || _cislo_sk((f->>'cod')::numeric) || ' €' end,
    case when f->>'pod' is not null then 'od ' || _cislo_sk((f->>'pod')::numeric) || ' m²' end,
    case when f->>'izby' is not null then (f->>'izby') || case (f->>'izby')::int when 1 then ' izba' when 2 then ' izby' when 3 then ' izby' when 4 then ' izby' else ' izieb' end || ' a viac' end)
  end
$$;

alter table public.portal_strazcovia add column if not exists chyby int not null default 0;

create or replace function public.portal_strazca(p_email text, p_meno text default null, p_filtre jsonb default null,
                                                 p_overenie jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 40), '');
  v_q text := left(btrim(regexp_replace(coalesce(p_filtre->>'q', ''), '\s+', ' ', 'g')), 40);
  v_id bigint := case when coalesce(p_filtre->>'id', '') ~ '^\d{1,10}$' then (p_filtre->>'id')::bigint end;
  v_f jsonb; v_odkial text := _klient_odtlacok(); v_cislo text; v_hodina int; v_poslane boolean; n nehnutelnosti;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  select count(*) into v_hodina from portal_strazcovia where vytvorene > now() - interval '1 hour';
  if v_hodina >= 300 or (select count(*) from portal_strazcovia where potvrdeny is not null and odhlaseny is null) >= 5000 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  perform _portal_overenie2('portal-strazca', 'strazca', p_overenie, case when v_hodina >= 30 then 5 else 4 end);
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$' or length(v_email) > 120 then
    raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  end if;
  -- meno a hľadaný text idú do e-mailu: len písmená (bez bodiek, aby z nich nebol odkaz na web)
  if v_meno is not null and v_meno !~ '^[[:alpha:] ''-]+$' then v_meno := null; end if;
  if v_q <> '' then
    v_q := btrim(regexp_replace(regexp_replace(v_q, '[^[:alpha:][:digit:] -]+', ' ', 'g'), '\s+', ' ', 'g'));
    if v_q = '' then raise exception 'V hľadaní nechajte len názov obce alebo časti.' using errcode = '22023'; end if;
  end if;
  if v_id is not null then
    -- upozornenie na zníženie ceny jednej ponuky
    select * into n from nehnutelnosti where id = v_id;
    if not found or not _portal_viditelna(n) then raise exception 'Ponuka už nie je dostupná.' using errcode = '22023'; end if;
    v_f := jsonb_build_object('id', v_id, 'len_zlacnenie', true);
  else
    v_f := jsonb_strip_nulls(jsonb_build_object(
      't', case when p_filtre->>'t' in ('predaj', 'prenajom') then p_filtre->>'t' end,
      'k', case when p_filtre->>'k' in ('byty', 'domy', 'pozemky', 'chaty', 'priestory', 'objekty', 'garaze') then p_filtre->>'k' end,
      'q', nullif(v_q, ''),
      'cod', case when coalesce(p_filtre->>'cod', '') ~ '^\d{1,9}$' and (p_filtre->>'cod')::bigint > 0 then (p_filtre->>'cod')::bigint end,
      'cdo', case when coalesce(p_filtre->>'cdo', '') ~ '^\d{1,9}$' and (p_filtre->>'cdo')::bigint > 0 then (p_filtre->>'cdo')::bigint end,
      'pod', case when coalesce(p_filtre->>'pod', '') ~ '^\d{1,7}$' and (p_filtre->>'pod')::bigint > 0 then (p_filtre->>'pod')::bigint end,
      'izby', case when coalesce(p_filtre->>'izby', '') ~ '^[1-9]$' then (p_filtre->>'izby')::int end));
  end if;

  perform pg_advisory_xact_lock(918277, hashtext(v_email));
  -- rovnaký strážca (potvrdený alebo čakajúci) sa nezakladá druhýkrát
  if exists (select 1 from portal_strazcovia where lower(email) = v_email and filtre = v_f and odhlaseny is null
             and (potvrdeny is not null or vytvorene > now() - interval '30 days')) then
    return 'ok';
  end if;
  if v_odkial is not null and (select count(*) from portal_strazcovia where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 5 then
    raise exception 'Príliš veľa prihlásení naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from portal_strazcovia where lower(email) = v_email and potvrdeny is null and odhlaseny is null and vytvorene > now() - interval '30 days') >= 5
     or (select count(*) from portal_strazcovia where lower(email) = v_email and odhlaseny is null and potvrdeny is not null) >= 10 then
    raise exception 'Na túto adresu už posielame viac strážcov. Niektorého vypnite odkazom v e-maile a skúste to znova.' using errcode = '22023';
  end if;
  -- e-mail na potvrdenie najviac raz za deň na adresu: ďalšie prihlásenia potvrdí ten istý e-mail (potvrdzujú sa všetky čakajúce)
  v_poslane := exists (select 1 from portal_strazcovia where lower(email) = v_email and potvrdeny is null and odhlaseny is null
                       and potvrdenie_odoslane > now() - interval '1 day');
  v_cislo := encode(extensions.gen_random_bytes(24), 'hex');
  insert into portal_strazcovia (email, meno, filtre, token, odkial, potvrdenie_odoslane)
  values (v_email, v_meno, v_f, v_cislo, v_odkial, case when v_poslane then now() end);
  return 'ok';
end $$;

-- potvrdenie overí adresu: potvrdí všetky čakajúce prihlásenia tej istej adresy
create or replace function public.portal_strazca_potvrdit(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s portal_strazcovia; v_popisy jsonb;
begin
  select * into s from portal_strazcovia where token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 20 for update;
  if not found or s.odhlaseny is not null then return jsonb_build_object('ok', false); end if;
  if s.potvrdeny is null and s.vytvorene < now() - interval '30 days' then return jsonb_build_object('ok', false, 'stary', true); end if;
  update portal_strazcovia set potvrdeny = coalesce(potvrdeny, now())
   where lower(email) = lower(s.email) and odhlaseny is null and (id = s.id or (potvrdeny is null and vytvorene > now() - interval '30 days'));
  select jsonb_agg(_portal_strazca_popis(filtre) order by vytvorene) into v_popisy
    from portal_strazcovia where lower(email) = lower(s.email) and odhlaseny is null and potvrdeny > now() - interval '1 minute';
  return jsonb_build_object('ok', true, 'popis', _portal_strazca_popis(s.filtre), 'popisy', coalesce(v_popisy, '[]'::jsonb));
end $$;

-- e-maily s potvrdením: jeden e-mail na adresu, v ňom všetky čakajúce prihlásenia
create or replace function public._portal_strazca_potvrdenia(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(510061) then return v_out; end if;
  for r in select lower(email) as adresa, max(id) as id, array_agg(id) as ids
           from portal_strazcovia
           where potvrdeny is null and odhlaseny is null and potvrdenie_odoslane is null and vytvorene > now() - interval '7 days'
           group by lower(email) order by min(vytvorene) limit greatest(1, least(coalesce(p_limit, 20), 50)) loop
    update portal_strazcovia set potvrdenie_odoslane = now() where id = any(r.ids);
    v_out := v_out || (select jsonb_build_array(jsonb_build_object('id', s.id, 'email', s.email, 'meno', s.meno, 'token', s.token,
              'popis', _portal_strazca_popis(s.filtre),
              'popisy', (select jsonb_agg(_portal_strazca_popis(x.filtre) order by x.vytvorene) from portal_strazcovia x
                         where lower(x.email) = r.adresa and x.potvrdeny is null and x.odhlaseny is null and x.vytvorene > now() - interval '30 days')))
             from portal_strazcovia s where s.id = r.id);
  end loop;
  return v_out;
end $$;

create or replace function public._portal_strazca_potvrdenie_chyba(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update portal_strazcovia x set potvrdenie_pokusy = x.potvrdenie_pokusy + 1,
         potvrdenie_odoslane = case when x.potvrdenie_pokusy + 1 >= 3 then x.potvrdenie_odoslane end
   where lower(x.email) = (select lower(email) from portal_strazcovia where id = p_id) and x.potvrdeny is null
     and x.potvrdenie_odoslane > now() - interval '30 minutes';
$$;

-- ---------------------------------------------------------------- strážca: udalosti namiesto porovnávania pri ukladaní
create table if not exists public.portal_strazca_udalosti (
  id bigint generated always as identity primary key,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  cena numeric,
  zlacnena boolean not null default false,
  vytvorene timestamptz not null default now(),
  spracovane timestamptz
);
create index if not exists portal_strazca_udalosti_caka on public.portal_strazca_udalosti (id) where spracovane is null;
alter table public.portal_strazca_udalosti enable row level security;
revoke all on public.portal_strazca_udalosti from anon, authenticated;
alter table public.portal_strazca_fronta add column if not exists zabrate timestamptz;

create or replace function public._portal_strazca_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_zlacnena boolean := false;
begin
  if new.stav <> 'aktivne' or not _portal_viditelna(new) then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and coalesce(old.na_portali, true) then
    -- len skutočné zníženie zobrazenej ceny (pri chýbajúcej cene nič)
    if new.cena is null or old.cena is null or not coalesce(new.zobrazit_cenu, false) or new.cena >= old.cena then return new; end if;
    v_zlacnena := true;
  end if;
  insert into portal_strazca_udalosti (nehnutelnost_id, cena, zlacnena) values (new.id, new.cena, v_zlacnena);
  return new;
end $$;

create or replace function public._portal_strazca_rozdel() returns int
language plpgsql security definer set search_path = public as $$
declare v int := 0;
begin
  if not pg_try_advisory_xact_lock(510063) then return 0; end if;
  with e as (
    update portal_strazca_udalosti set spracovane = now()
     where id in (select id from portal_strazca_udalosti where spracovane is null order by id limit 500)
    returning nehnutelnost_id, cena, zlacnena
  ), vlozene as (
    insert into portal_strazca_fronta (strazca_id, nehnutelnost_id, cena, zlacnena)
    select s.id, e.nehnutelnost_id, e.cena, e.zlacnena
      from e join nehnutelnosti n on n.id = e.nehnutelnost_id and n.stav = 'aktivne' and _portal_viditelna(n)
      join portal_strazcovia s on s.potvrdeny is not null and s.odhlaseny is null
       and (e.zlacnena or not coalesce((s.filtre->>'len_zlacnenie')::boolean, false))
       and _portal_sedi(s.filtre, n)
    on conflict do nothing
    returning 1
  ) select count(*) into v from vlozene;
  if random() < 0.02 then delete from portal_strazca_udalosti where spracovane < now() - interval '7 days'; end if;
  return v;
end $$;

-- e-maily s ponukami: najviac raz za 12 hodín; riadky sa najprv len zaberú, odoslané sa označia až po úspechu
create or replace function public._portal_strazca_na_odoslanie(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; v_ponuky jsonb; v_posielane bigint[];
begin
  if not pg_try_advisory_xact_lock(510062) then return v_out; end if;
  perform _portal_strazca_rozdel();
  update portal_strazca_fronta f set odoslane = now(), chyba = 'neaktuálne'
   where f.odoslane is null and (f.vytvorene < now() - interval '14 days'
     or exists (select 1 from portal_strazcovia s where s.id = f.strazca_id and (s.odhlaseny is not null or s.potvrdeny is null))
     or not exists (select 1 from nehnutelnosti n where n.id = f.nehnutelnost_id and n.stav = 'aktivne' and _portal_viditelna(n)));
  for r in select s.id, s.email, s.meno, s.token, s.filtre, array_agg(f.id) as ids, array_agg(distinct f.nehnutelnost_id) as nids
           from portal_strazca_fronta f join portal_strazcovia s on s.id = f.strazca_id
           where f.odoslane is null and (f.zabrate is null or f.zabrate < now() - interval '15 minutes')
             and f.vytvorene < now() - interval '10 minutes' and s.potvrdeny is not null and s.odhlaseny is null
             and (s.posledny_email is null or s.posledny_email < now() - interval '12 hours')
           group by s.id order by min(f.vytvorene) limit greatest(1, least(coalesce(p_limit, 20), 50)) loop
    select array_agg(n.id) into v_posielane
      from nehnutelnosti n where n.id = any(r.nids) and n.stav = 'aktivne' and _portal_viditelna(n)
       -- ponuka môže byť medzičasom opravená (cena, obec…): pošle sa, len keď stále sedí
       and _portal_sedi(r.filtre, n)
       -- tá istá ponuka na tú istú adresu len raz za 14 dní, aj keď má človek viac strážcov
       and not exists (select 1 from portal_strazca_fronta f3 join portal_strazcovia s3 on s3.id = f3.strazca_id
                       where lower(s3.email) = lower(r.email) and s3.id <> r.id and f3.nehnutelnost_id = n.id and f3.chyba is null
                         and (f3.odoslane > now() - interval '14 days' or f3.zabrate > now() - interval '15 minutes'));
    -- ponuky, ktoré už nesedia, sa vyradia; ostatné sa zaberú
    update portal_strazca_fronta set odoslane = now(), chyba = 'neaktuálne'
     where id = any(r.ids) and odoslane is null and not (nehnutelnost_id = any(coalesce(v_posielane, '{}')));
    if v_posielane is null then continue; end if;
    update portal_strazca_fronta set zabrate = now() where id = any(r.ids) and odoslane is null;
    v_ponuky := (select jsonb_agg(_portal_karta(n) - 'vybavenie'
                   || jsonb_build_object(-- znížená cena len pri ponuke, ktorú už strážca predtým videl (nová ponuka je „nová“, aj keď medzitým zlacnela)
                        'nova_cena', not exists (select 1 from portal_strazca_fronta f2 where f2.id = any(r.ids) and f2.nehnutelnost_id = n.id and not f2.zlacnena),
                        'url', 'https://realitnytypek.sk/nehnutelnosti/' || n.id || coalesce('-' || nullif(_slug_ponuky(n), ''), ''),
                        'makler_meno', (select _meno_cele(m.titul_pred, m.meno, m.titul_za) from makleri m where m.id = n.makler_id),
                        'makler_telefon', (select m.telefon from makleri m where m.id = n.makler_id),
                        'kancelaria_nazov', _portal_kancelaria(n.kancelaria)->>'nazov')
                   order by n.cena nulls last)
                 from nehnutelnosti n where n.id = any(v_posielane));
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id,
      'ids', (select to_jsonb(array_agg(id)) from portal_strazca_fronta where id = any(r.ids) and odoslane is null),
      'email', r.email, 'meno', r.meno, 'token', r.token, 'popis', _portal_strazca_popis(r.filtre), 'filtre', r.filtre,
      'cena', r.filtre->>'id' is not null, 'ponuky', v_ponuky));
  end loop;
  return v_out;
end $$;

create or replace function public._portal_strazca_odoslane(p_id bigint, p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  update portal_strazca_fronta set odoslane = now(), chyba = null where id = any(p_ids) and odoslane is null;
  update portal_strazcovia set posledny_email = now(), emailov = emailov + 1, chyby = 0 where id = p_id;
end $$;

create or replace function public._portal_strazca_chyba(p_id bigint, p_ids bigint[], p_chyba text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update portal_strazca_fronta set pokusy = pokusy + 1, chyba = left(coalesce(p_chyba, 'chyba'), 300), zabrate = null,
         odoslane = case when pokusy + 1 >= 3 then now() end
   where id = any(p_ids);
  -- adresa, na ktorú sa opakovane nedá doručiť, sa vypne
  update portal_strazcovia set chyby = chyby + 1, odhlaseny = case when chyby + 1 >= 5 then now() else odhlaseny end where id = p_id;
end $$;

select cron.schedule('portal-strazca', '* * * * *', 'select public._portal_strazca_rozdel()');

-- ---------------------------------------------------------------- cenová mapa aj s vývojom v okrese
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
  ), v as (
    -- vývoj: stredná ponuková cena v okrese podľa štvrťroka, keď sa inzerát prvýkrát objavil (posledné 2 roky)
    select i.okres, i.typ, to_char(date_trunc('quarter', i.prvy_krat), 'YYYY-"Q"Q') q, count(*) n,
      round(percentile_cont(0.5) within group (order by i.cena_m2)) m2
    from inzeraty i
    where i.duplikat_z is null and i.prvy_krat > now() - interval '24 months' and i.okres is not null and i.typ in ('byt', 'dom', 'pozemok')
      and (i.typ <> 'pozemok' or i.podtyp = 'stavebny')
      and i.cena_m2 between case when i.typ = 'pozemok' then 1 else 150 end and case when i.typ = 'pozemok' then 1500 else 9000 end
    group by 1, 2, 3 having count(*) >= 10
  )
  select jsonb_build_object(
    'obce', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('obec', o.obec, 'okres', o.okres, 'typ', o.typ, 'n', o.n,
                        'm2', o.m2, 'od', o.od, 'do', o."do", 'lat', l.lat, 'lon', l.lon)) order by o.typ, o.n desc)
                      from o left join lateral (select x.lat, x.lon from lokality x where x.typ = 'obec' and x.nazov = o.obec
                                                  and (o.okres is null or x.okres = o.okres) limit 1) l on true), '[]'::jsonb),
    'okresy', coalesce((select jsonb_agg(jsonb_build_object('okres', k.okres, 'typ', k.typ, 'n', k.n, 'm2', k.m2, 'od', k.od, 'do', k."do")
                        order by k.typ, k.n desc) from k), '[]'::jsonb),
    'vyvoj', coalesce((select jsonb_agg(jsonb_build_object('okres', v.okres, 'typ', v.typ, 'q', v.q, 'n', v.n, 'm2', v.m2) order by v.okres, v.typ, v.q) from v), '[]'::jsonb),
    'zoznam', coalesce((select jsonb_agg(jsonb_build_array(x.nazov, x.okres) order by x.mesto desc, x.nazov)
                        from lokality x where x.typ = 'obec' and x.okres in (select okres from k)), '[]'::jsonb),
    'inzeratov', (select count(*) from z), 'cas', now())
$$;

-- ---------------------------------------------------------------- upratovanie (každú noc)
create or replace function public._portal_upratanie() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from portal_strazcovia where potvrdeny is null and vytvorene < now() - interval '30 days';
  delete from portal_strazcovia where odhlaseny is not null and odhlaseny < now() - interval '30 days';
  delete from portal_strazca_fronta where odoslane is not null and odoslane < now() - interval '90 days';
  delete from portal_strazca_udalosti where spracovane is not null and spracovane < now() - interval '7 days';
  update portal_strazcovia set odkial = null where odkial is not null and vytvorene < now() - interval '7 days';
  update web_kontakty set odkial = null where portal and odkial is not null and vytvorene < now() - interval '7 days';
  -- kontakty z portálu (dopyty, odhady, predaj) najdlhšie 2 roky
  delete from web_kontakty where portal and vytvorene < now() - interval '2 years';
end $$;

-- ---------------------------------------------------------------- práva
revoke execute on function public._portal_sedi(jsonb, nehnutelnosti), public._portal_strazca_popis(jsonb),
  public._portal_strazca_ponuka(), public._portal_strazca_rozdel(), public._portal_strazca_potvrdenia(int),
  public._portal_strazca_potvrdenie_chyba(bigint), public._portal_strazca_na_odoslanie(int),
  public._portal_strazca_odoslane(bigint, bigint[]), public._portal_strazca_chyba(bigint, bigint[], text),
  public._portal_upratanie() from public, anon, authenticated;
grant execute on function public._portal_strazca_potvrdenia(int), public._portal_strazca_potvrdenie_chyba(bigint),
  public._portal_strazca_na_odoslanie(int), public._portal_strazca_odoslane(bigint, bigint[]),
  public._portal_strazca_chyba(bigint, bigint[], text) to service_role;

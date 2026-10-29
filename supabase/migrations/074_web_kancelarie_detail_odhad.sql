-- =====================================================================
-- 074: Web kancelárie – detail ponuky a stránky maklérov na webe, prepínač „zobraziť na webe kancelárie“,
--      orientačný odhad ceny pre makléra a mesačný prehľad webu pre administrátora
--  * nehnutelnosti.web_kancelarie: ponuka sa dá skryť z webu kancelárie (diskrétny predaj); osobný web a stránka ponuky ostávajú
--  * ponuky a makléri na webe kancelárie majú adresu (slug) pre podstránky /ponuka/123-nazov a /tim/meno
--  * formulár Odhad hodnoty: k údajom o nehnuteľnosti sa pripojí odhad podľa inzerátov zo skenera (cena za m² v obci alebo okrese);
--    vidí ho len maklér v zvončeku, e-maile a v štatistikách, klientovi sa neposiela
--  * 1. deň v mesiaci dostanú administrátori do zvončeka, e-mailom aj do mobilu prehľad webu kancelárie za minulý mesiac
-- =====================================================================

alter table public.nehnutelnosti add column if not exists web_kancelarie boolean not null default true;

-- prepínač pri ponuke (zodpovedný maklér alebo administrátor)
create or replace function public.nastavit_web_kancelarie_ponuky(p_id bigint, p_zobrazit boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id;
  if not found then raise exception 'Ponuka neexistuje.' using errcode = '22023'; end if;
  if not ja_admin() and n.makler_id is distinct from auth.uid() then
    raise exception 'Zmeniť môže len zodpovedný maklér alebo administrátor.' using errcode = '42501';
  end if;
  update nehnutelnosti set web_kancelarie = coalesce(p_zobrazit, true) where id = p_id;
end $$;

-- adresa ponuky na webe kancelárie (napr. bungalov-s-terasou-harichovce)
create or replace function public._slug_ponuky(n nehnutelnosti) returns text
language sql immutable set search_path = public as $$
  select trim(both '-' from left(_web_adresa(coalesce(nullif(btrim(n.nazov), ''), concat_ws(' ', n.typ, n.obec), 'ponuka')), 60))
$$;

-- ---------------------------------------------------------------- orientačný odhad ceny podľa inzerátov zo skenera
-- ponukové ceny súkromných aj realitných inzerátov za posledných 12 mesiacov; v obci, a keď je ich málo, v celom okrese
create or replace function public._odhad_ceny(p_typ text, p_obec text, p_m2 numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_typ text := case lower(coalesce(p_typ, '')) when 'byt' then 'byt' when 'dom' then 'dom' when 'poz' then 'pozemok' when 'pozemok' then 'pozemok' when 'chata' then 'chata' end;
  v_obec text := nullif(btrim(coalesce(p_obec, '')), '');
  v_min numeric; v_max numeric; v_okres text; v_oblast text; v_m2 numeric := case when p_m2 > 0 and p_m2 < 1000000 then p_m2 end;
  n int; p25 numeric; p50 numeric; p75 numeric;
begin
  if v_typ is null or v_obec is null then return null; end if;
  v_min := case when v_typ = 'pozemok' then 1 else 150 end;
  v_max := case when v_typ = 'pozemok' then 1500 else 9000 end;
  select count(*), percentile_cont(0.25) within group (order by cena_m2), percentile_cont(0.5) within group (order by cena_m2), percentile_cont(0.75) within group (order by cena_m2)
    into n, p25, p50, p75
    from inzeraty where typ = v_typ and obec = v_obec and duplikat_z is null and cena_m2 between v_min and v_max and prvy_krat > now() - interval '12 months';
  v_oblast := v_obec;
  if n < 5 then
    select okres into v_okres from inzeraty where obec = v_obec and okres is not null group by okres order by count(*) desc limit 1;
    if v_okres is null then return null; end if;
    select count(*), percentile_cont(0.25) within group (order by cena_m2), percentile_cont(0.5) within group (order by cena_m2), percentile_cont(0.75) within group (order by cena_m2)
      into n, p25, p50, p75
      from inzeraty where typ = v_typ and okres = v_okres and duplikat_z is null and cena_m2 between v_min and v_max and prvy_krat > now() - interval '12 months';
    v_oblast := 'okres ' || v_okres;
    if n < 5 then return null; end if;
  end if;
  return jsonb_build_object('typ', v_typ, 'oblast', v_oblast, 'pocet', n,
    'm2', round(p50), 'm2_od', round(p25), 'm2_do', round(p75), 'plocha', v_m2,
    'od', case when v_m2 is not null then round(p25 * v_m2, -3) end,
    'do', case when v_m2 is not null then round(p75 * v_m2, -3) end,
    'stred', case when v_m2 is not null then round(p50 * v_m2, -3) end);
end $$;

create or replace function public._cislo_sk(x numeric) returns text
language sql immutable as $$ select replace(to_char(round(x), 'FM999,999,999,999'), ',', ' ') $$;

create or replace function public._odhad_text(o jsonb) returns text
language sql immutable set search_path = public as $$
  select 'Orientačný odhad zo skenera: ' ||
    case when o->>'stred' is not null
      then _cislo_sk((o->>'od')::numeric) || ' – ' || _cislo_sk((o->>'do')::numeric) || ' € (stred ' || _cislo_sk((o->>'stred')::numeric) || ' €; '
      else _cislo_sk((o->>'m2_od')::numeric) || ' – ' || _cislo_sk((o->>'m2_do')::numeric) || ' €/m² (' end ||
    _cislo_sk((o->>'m2')::numeric) || ' €/m², ' || (o->>'pocet') || ' inzerátov, ' || (o->>'oblast') || '). Ponukové ceny, nie predajné – over pred odpoveďou klientovi.'
$$;

-- ---------------------------------------------------------------- verejný web kancelárie
create or replace function public._verejny_web_kancelarie(w weby, v_obsah jsonb, v_nahlad boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'druh', 'kancelaria', 'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
    'web', v_obsah, 'nahlad', v_nahlad, 'zverejnene_kedy', w.zverejnene_kedy,
    'ponuky', coalesce((select jsonb_agg(((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id, 'slug', _slug_ponuky(n)))
                                         order by (n.stav = 'aktivne') desc, n.exkluzivne desc, n.upravene desc)
                        from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
                        where n.stav in ('aktivne', 'rezervovane') and n.web_kancelarie), '[]'::jsonb),
    'predane', coalesce((select jsonb_agg(x order by x->>'upravene' desc) from (
                          select ((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id, 'slug', _slug_ponuky(n))) as x
                          from nehnutelnosti n join makleri m on m.id = n.makler_id
                          where n.stav = 'predane' and n.web_kancelarie and n.upravene > now() - interval '3 years'
                          order by n.upravene desc limit 36) t), '[]'::jsonb),
    'makleri', coalesce((select jsonb_agg(verejny_makler(m.id) || jsonb_build_object('admin', m.rola = 'admin', 'obce', to_jsonb(coalesce(m.obce, '{}')),
                           'slug', _web_adresa(m.meno),
                           'web', (select jsonb_build_object('adresa', x.adresa, 'domena', case when x.domena_pripojena is not null then x.domena end)
                                   from weby x where x.makler_id = m.id and not x.kancelaria and x.zverejnene is not null))
                         order by m.meno) from makleri m where m.aktivny), '[]'::jsonb),
    'recenzie', verejne_recenzie(null),
    'google', (select hodnota::jsonb - 'place_id' from nastavenia where kluc = 'google_recenzie'),
    'kancelaria', vzhlad_kancelarie())
$$;

-- kontakt z formulára na webe (osobný web makléra aj web kancelárie)
create or replace function public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text default null, p_co text default null,
                                               p_ponuka bigint default null, p_dopyt jsonb default null, p_overenie jsonb default null,
                                               p_komu uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  w weby;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_odkial text := _klient_odtlacok();
  v_ts bigint; v_nonce text; v_hash text;
  v_dopyt bigint; v_id bigint; v_email boolean;
  v_kat text[]; v_obce text[]; v_cena numeric;
  v_ciel uuid; v_kanc boolean; v_ucel text; v_odhad jsonb;
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","strazca":"Strážca ponúk","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","ebook":"E-book","kontakt":"Správa z webu","vykup":"Výkup nehnuteľnosti","kariera":"Záujem o prácu"}';
begin
  -- pasca na roboty: skryté pole vyplní len robot → tváriť sa ako úspech, nič neuložiť
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  -- výpočtová úloha z prehliadača: sha256 začína štyrmi nulami, čas nie starší ako 30 minút, každé riešenie raz
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|' || lower(btrim(coalesce(p_adresa, ''))) || '|' || coalesce(p_zdroj, '') || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;

  w := _web_podla(p_adresa);
  if w.id is null or w.zverejnene is null then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  v_kanc := w.kancelaria;
  if not v_kanc and not exists (select 1 from makleri where id = w.makler_id and aktivny) then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if not v_kanc and p_zdroj in ('vykup', 'kariera') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if p_zdroj = 'ebook' and not v_email then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;
  if p_zdroj = 'callback' and v_email then raise exception 'Na zavolanie napíšte telefónne číslo.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918273, w.id::int);
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id = w.id and vytvorene > now() - interval '1 hour') >= (case when v_kanc then 60 else 30 end) then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;

  -- komu kontakt patrí
  if v_kanc then
    if p_ponuka is not null then
      select n.makler_id into v_ciel from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
      where n.id = p_ponuka and n.stav in ('aktivne', 'rezervovane', 'predane') and n.web_kancelarie;
      if v_ciel is null then p_ponuka := null; end if;
    end if;
    if v_ciel is null and p_komu is not null and p_zdroj <> 'kariera'
       and exists (select 1 from makleri where id = p_komu and aktivny)
       and coalesce(w.zverejnene->'team'->(p_komu::text)->>'on', 'true') <> 'false' then
      v_ciel := p_komu;
    end if;
    if v_ciel is null then v_ciel := _web_kancelarie_komu(w, p_zdroj); end if;
    if v_ciel is null then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  else
    v_ciel := w.makler_id;
    if p_ponuka is not null and not exists (select 1 from nehnutelnosti where id = p_ponuka and makler_id = w.makler_id) then p_ponuka := null; end if;
  end if;

  -- strážca ponúk = dopyt klienta (automaticky sa páruje s novými ponukami a inzerátmi)
  if p_zdroj = 'strazca' and p_dopyt is not null then
    if jsonb_typeof(p_dopyt) <> 'object' then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    v_kat := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'kategorie') = 'array' then p_dopyt->'kategorie' else '[]' end) x
                        where x in ('byty', 'domy', 'pozemky', 'chaty')), '{}');
    v_obce := coalesce((select array_agg(distinct left(btrim(x), 60)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'obce') = 'array' then p_dopyt->'obce' else '[]' end) x limit 10) t
                        where btrim(x) <> ''), '{}');
    v_cena := case when (p_dopyt->>'cena_do') ~ '^\d{3,9}(\.\d{1,2})?$' then (p_dopyt->>'cena_do')::numeric end;
    if cardinality(v_kat) = 0 and cardinality(v_obce) = 0 and v_cena is null then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    if (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < (case when v_kanc then 120 else 60 end) then
      insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do, popis)
      values (v_ciel, case when coalesce((p_dopyt->>'prenajom') = 'true', false) then 'prenajom' else 'predaj' end, v_kat, v_obce, v_cena,
              case when v_kanc then 'Strážca ponúk z webu kancelárie.' else 'Strážca ponúk z webu.' end)
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
      -- s e-mailom: klientovi príde e-mail s odkazom na potvrdenie; až po potvrdení mu chodia nové zhodné ponuky
      if v_email and not exists (select 1 from web_strazcovia where web_id = w.id and email = v_kontakt and potvrdeny is null
                                   and odhlaseny is null and vytvorene > now() - interval '24 hours') then
        insert into web_strazcovia (dopyt_id, web_id, makler_id, email, meno, token)
        values (v_dopyt, w.id, v_ciel, v_kontakt, v_meno, encode(extensions.gen_random_bytes(20), 'hex'));
      end if;
    end if;
  end if;

  -- web kancelárie: kupujúci → dopyt v Klientoch, predávajúci s telefónom → Klienti → Predávajúci
  if v_kanc and p_zdroj in ('kontakt', 'odhad', 'vykup', 'callback') then
    v_ucel := case when p_zdroj in ('odhad', 'vykup') then 'predat' else coalesce(p_dopyt->>'ucel', '') end;
    if v_ucel in ('kupit', 'prenajat') and v_dopyt is null
       and (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < 120 then
      insert into dopyty (makler_id, transakcia, popis)
      values (v_ciel, case when v_ucel = 'prenajat' then 'prenajom' else 'predaj' end,
              left('Z webu kancelárie. ' || coalesce(nullif(v_co, ''), 'Hľadá nehnuteľnosť.'), 1000))
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
    elsif v_ucel = 'predat' and not v_email and v_kontakt ~ '^0\d{8,10}$' then
      insert into predajcovia (telefon, meno, poznamka, makler_id, upravene)
      values (v_kontakt, v_meno, left('Z webu kancelárie – ' || (NAZVY->>p_zdroj) || case when v_co <> '' then ': ' || v_co else '.' end, 2000), v_ciel, now())
      on conflict (telefon) do update set
        makler_id = coalesce(predajcovia.makler_id, excluded.makler_id),
        meno = coalesce(predajcovia.meno, excluded.meno),
        poznamka = left(coalesce(predajcovia.poznamka || E'\n', '') || excluded.poznamka, 2000),
        upravene = now();
    end if;
  end if;

  -- odhad hodnoty: k údajom o nehnuteľnosti sa pripojí orientačný odhad podľa inzerátov zo skenera (len pre makléra, klient ho nevidí)
  if p_zdroj = 'odhad' and jsonb_typeof(p_dopyt->'odhad') = 'object' then
    v_odhad := _odhad_ceny(p_dopyt->'odhad'->>'typ', p_dopyt->'odhad'->>'obec',
                 case when replace(coalesce(p_dopyt->'odhad'->>'m2', ''), ',', '.') ~ '^\d{1,6}(\.\d{1,2})?$' then replace(p_dopyt->'odhad'->>'m2', ',', '.')::numeric end);
    if v_odhad is not null then v_co := left(v_co || '. ' || _odhad_text(v_odhad), 1500); end if;
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (w.id, v_ciel, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (v_ciel, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || case when v_kanc then ' (web kancelárie)' else '' end || ': ' ||
          coalesce(v_meno || ', ', '') || v_kontakt || case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka, v_id);

  if p_zdroj = 'ebook' then return coalesce(nullif(w.zverejnene->'dl'->>'url', ''), 'ok'); end if;
  return 'ok';
end $$;


-- strážca z webu kancelárie dostáva nové a zlacnené ponuky všetkých maklérov, ktoré sú na webe kancelárie
create or replace function public._strazca_web_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav <> 'aktivne' or new.makler_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and not (new.cena < old.cena) then return new; end if;
  for d in select dp.* from dopyty dp join web_strazcovia s on s.dopyt_id = dp.id join weby x on x.id = s.web_id
           where (case when x.kancelaria then new.web_kancelarie else s.makler_id = new.makler_id end)
             and s.odhlaseny is null and s.potvrdeny is not null and dp.stav = 'aktivny' loop
    if _sedi_ponuka(d, new) then
      insert into web_strazca_fronta (dopyt_id, nehnutelnost_id, cena) values (d.id, new.id, new.cena) on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

-- e-maily strážcu z webu kancelárie: v podpise je názov kancelárie
create or replace function public._strazca_na_odoslanie(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; w weby; v_mk jsonb; v_ponuky jsonb;
begin
  if not pg_try_advisory_xact_lock(510057) then return v_out; end if;
  update web_strazca_fronta f set odoslane = now(), chyba = 'neaktuálne'
   where f.odoslane is null and (f.vytvorene < now() - interval '14 days'
     or exists (select 1 from web_strazcovia s where s.dopyt_id = f.dopyt_id and (s.odhlaseny is not null or s.potvrdeny is null))
     or not exists (select 1 from dopyty d where d.id = f.dopyt_id and d.stav = 'aktivny')
     or not exists (select 1 from nehnutelnosti n where n.id = f.nehnutelnost_id and n.stav = 'aktivne'));
  for r in select s.dopyt_id, s.web_id, s.makler_id, s.email, s.meno, s.token,
                  array_agg(f.id) as ids, array_agg(distinct f.nehnutelnost_id) as nids
           from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id
           where f.odoslane is null and f.vytvorene < now() - interval '10 minutes' and s.potvrdeny is not null
             and (s.posledny_email is null or s.posledny_email < now() - interval '12 hours')
           group by s.dopyt_id order by min(f.vytvorene) limit greatest(1, least(coalesce(p_limit, 20), 50)) loop
    select * into w from weby where id = r.web_id;
    v_mk := verejny_makler(r.makler_id);
    if w.zverejnene is null or v_mk is null then
      update web_strazca_fronta set odoslane = now(), chyba = 'web nie je zverejnený' where id = any(r.ids);
      continue;
    end if;
    v_ponuky := (select jsonb_agg(_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne' order by n.cena nulls last) from nehnutelnosti n
                 where n.id = any(r.nids) and n.stav = 'aktivne' and (not w.kancelaria or n.web_kancelarie));
    update web_strazca_fronta set odoslane = now(), chyba = null where id = any(r.ids) and odoslane is null;
    if v_ponuky is null then continue; end if;
    update web_strazcovia set posledny_email = now(), emailov = emailov + 1 where dopyt_id = r.dopyt_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'dopyt_id', r.dopyt_id, 'ids', to_jsonb(r.ids), 'email', r.email, 'meno', r.meno, 'token', r.token,
      'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'makler', v_mk - 'foto',
      'web', jsonb_build_object('name', w.zverejnene->>'name', 'phone', w.zverejnene->>'phone', 'email', w.zverejnene->>'email',
                                'office', coalesce(w.zverejnene->>'office', case when w.kancelaria then w.zverejnene->'k'->>'name' end)),
      'ponuky', v_ponuky));
  end loop;
  return v_out;
end $$;

create or replace function public._strazca_potvrdenia(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; w weby; v_mk jsonb;
begin
  if not pg_try_advisory_xact_lock(510058) then return v_out; end if;
  for r in select s.* , d.transakcia, d.kategorie, d.obce, d.cena_do from web_strazcovia s join dopyty d on d.id = s.dopyt_id
           where s.potvrdeny is null and s.odhlaseny is null and s.potvrdenie_odoslane is null and s.vytvorene > now() - interval '7 days'
           order by s.vytvorene limit greatest(1, least(coalesce(p_limit, 20), 50)) for update of s skip locked loop
    update web_strazcovia set potvrdenie_odoslane = now() where dopyt_id = r.dopyt_id;
    select * into w from weby where id = r.web_id;
    v_mk := verejny_makler(r.makler_id);
    if w.zverejnene is null or v_mk is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'dopyt_id', r.dopyt_id, 'email', r.email, 'meno', r.meno, 'token', r.token,
      'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'makler', v_mk - 'foto',
      'web', jsonb_build_object('name', w.zverejnene->>'name', 'phone', w.zverejnene->>'phone', 'email', w.zverejnene->>'email',
                                'office', coalesce(w.zverejnene->>'office', case when w.kancelaria then w.zverejnene->'k'->>'name' end)),
      'hlada', jsonb_build_object('transakcia', r.transakcia, 'kategorie', to_jsonb(r.kategorie), 'obce', to_jsonb(r.obce), 'cena_do', r.cena_do)));
  end loop;
  return v_out;
end $$;

-- mapa stránok: web kancelárie aj s ponukami (detail na webe) a stránkami maklérov
create or replace function public.verejne_weby_mapa() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'kancelaria', w.kancelaria,
      'upravene', greatest(w.zverejnene_kedy, (select max(n.upravene) from nehnutelnosti n where (w.kancelaria or n.makler_id = w.makler_id) and n.stav in ('aktivne', 'rezervovane'))),
      'ponuky', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'upravene', n.upravene, 'slug', case when w.kancelaria then _slug_ponuky(n) end)) from nehnutelnosti n
                          where n.stav in ('aktivne', 'rezervovane')
                            and (case when w.kancelaria then n.web_kancelarie and exists (select 1 from makleri m where m.id = n.makler_id and m.aktivny) else n.makler_id = w.makler_id end)), '[]'::jsonb),
      'makleri', case when w.kancelaria then coalesce((select jsonb_agg(_web_adresa(m.meno)) from makleri m
                          where m.aktivny and coalesce(w.zverejnene->'team'->(m.id::text)->>'on', 'true') <> 'false'), '[]'::jsonb) else '[]'::jsonb end,
      'stranky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_stranky') = 'array' then w.zverejnene->'_stranky' else '[]'::jsonb end,
      'clanky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_clanky') = 'array' then w.zverejnene->'_clanky' else '[]'::jsonb end)), '[]'::jsonb)
  from weby w left join makleri m on m.id = w.makler_id
  where w.zverejnene is not null and (w.kancelaria or m.aktivny);
$$;

-- ---------------------------------------------------------------- mesačný prehľad webu kancelárie pre administrátorov
create or replace function public._mesacny_prehlad_webu(p_dnes date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  w weby; v_dnes date := coalesce(p_dnes, (now() at time zone 'Europe/Bratislava')::date);
  v_od date; v_do date; v_od2 date; v_do2 date;
  v_nav int; v_nav2 int; v_k int; v_vyb int; v_kl int; v_str int; v_top text; v_zdroj text; v_txt text; v_zmena text; v_admini uuid[];
  MES constant text[] := array['január','február','marec','apríl','máj','jún','júl','august','september','október','november','december'];
  MES2 constant text[] := array['januáru','februáru','marcu','aprílu','máju','júnu','júlu','augustu','septembru','októbru','novembru','decembru'];
  ZDR constant jsonb := '{"google":"Google","facebook":"Facebook","instagram":"Instagram","qr":"QR kód","email":"e-mail","vyhladavac":"iné vyhľadávače","iny":"iné weby","priamo":"priamo zadanú adresu"}';
begin
  select * into w from weby where kancelaria and zverejnene is not null limit 1;
  if not found then return 0; end if;
  v_od := date_trunc('month', v_dnes - 1)::date;
  v_do := (date_trunc('month', v_dnes)::date - 1);
  if v_do < v_od then return 0; end if;
  v_od2 := (v_od - interval '1 month')::date; v_do2 := v_od - 1;
  -- každý mesiac len raz
  if exists (select 1 from nastavenia where kluc = 'web_prehlad_mesiac' and hodnota = to_char(v_od, 'YYYY-MM')) then return 0; end if;
  insert into nastavenia (kluc, hodnota) values ('web_prehlad_mesiac', to_char(v_od, 'YYYY-MM'))
    on conflict (kluc) do update set hodnota = excluded.hodnota;

  select coalesce(sum(pocet), 0) into v_nav from web_zobrazenia where web_id = w.id and den between v_od and v_do;
  select coalesce(sum(pocet), 0) into v_nav2 from web_zobrazenia where web_id = w.id and den between v_od2 and v_do2;
  select count(*), count(*) filter (where vybavene is not null or odpovedane is not null) into v_k, v_vyb
    from web_kontakty where web_id = w.id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do;
  select coalesce(sum(pocet), 0) into v_kl from web_kliky where web_id = w.id and den between v_od and v_do;
  select count(*) into v_str from web_strazcovia s join dopyty d on d.id = s.dopyt_id
    where s.web_id = w.id and s.odhlaseny is null and s.potvrdeny is not null and d.stav = 'aktivny';
  select string_agg(m.meno || ' ' || t.c, ', ' order by t.c desc, m.meno) into v_top from (
    select makler_id, count(*) c from web_kontakty where web_id = w.id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do
    group by makler_id order by count(*) desc limit 4) t join makleri m on m.id = t.makler_id;
  select ZDR->>zdroj into v_zdroj from web_zdroje where web_id = w.id and den between v_od and v_do group by zdroj order by sum(pocet) desc limit 1;

  v_zmena := case when v_nav2 = 0 then '' else ' (' || case when v_nav >= v_nav2 then '+' else '−' end ||
               abs(round((v_nav - v_nav2)::numeric * 100 / v_nav2)) || ' % oproti ' || MES2[extract(month from v_od2)::int] || ')' end;
  v_txt := 'Web kancelárie za ' || MES[extract(month from v_od)::int] || ': ' || v_nav || (case when v_nav = 1 then ' návšteva' when v_nav between 2 and 4 then ' návštevy' else ' návštev' end) || v_zmena ||
    ', ' || v_k || ' kontaktov z formulárov' || case when v_k > 0 then ' (vybavené ' || v_vyb || ')' else '' end ||
    ', ' || v_kl || ' klikov na telefón a e-mail.' ||
    case when v_top is not null then ' Kontakty dostali: ' || v_top || '.' else '' end ||
    case when v_zdroj is not null then ' Najviac ľudí prišlo cez ' || v_zdroj || '.' else '' end ||
    ' Aktívni strážcovia ponúk: ' || v_str || '. Podrobnosti sú v Štatistikách webu kancelárie.';

  select array_agg(id) into v_admini from makleri where aktivny and rola = 'admin';
  if v_admini is null then return 0; end if;
  insert into pripomienky (makler_id, cas, poznamka, druh) select a, now(), left(v_txt, 500), 'pripomienka' from unnest(v_admini) a;
  perform _push_zaradit(v_admini, 'kontakty', '📊 Web kancelárie za ' || MES[extract(month from v_od)::int],
    v_nav || ' návštev, ' || v_k || ' kontaktov' || case when v_k > 0 then ', vybavené ' || v_vyb else '' end || '.', './web-kancelarie.html#statistiky',
    'typek-web-prehlad-' || to_char(v_od, 'YYYY-MM'));
  return array_length(v_admini, 1);
end $$;
select cron.schedule('web-kancelarie-prehlad', '17 7 1 * *', 'select public._mesacny_prehlad_webu()');

-- ---------------------------------------------------------------- práva
revoke execute on function public.nastavit_web_kancelarie_ponuky(bigint, boolean) from public, anon;
grant execute on function public.nastavit_web_kancelarie_ponuky(bigint, boolean) to authenticated;
revoke execute on function public._odhad_ceny(text, text, numeric), public._odhad_text(jsonb), public._mesacny_prehlad_webu(date),
  public._strazca_na_odoslanie(integer), public._strazca_potvrdenia(integer) from public, anon, authenticated;
revoke execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb, uuid) from public;
grant execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb, uuid) to anon, authenticated;
revoke execute on function public.verejne_weby_mapa() from public;
grant execute on function public.verejne_weby_mapa() to anon, authenticated;

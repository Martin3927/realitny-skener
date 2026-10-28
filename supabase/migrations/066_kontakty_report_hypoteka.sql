-- =====================================================================
-- 1) Kontakt z webu, na ktorý nikto neodpovedal: po 2 hodinách pripomenúť maklérovi,
--    po 24 hodinách dať vedieť administrátorovi (len cez deň 8:00 – 20:00).
--    Za vybavený sa považuje: Hotovo v zvončeku, Vybavené v editore webu, alebo klik na odpoveď (Zavolať, SMS, WhatsApp, e-mail).
-- 2) Report pre majiteľa: koľko záujemcov napísalo cez stránku ponuky.
-- 3) Stránka ponuky: „Chcem ponuku hypotéky“ pri kalkulačke.
-- =====================================================================

alter table public.web_kontakty add column if not exists odpovedane timestamptz;
alter table public.web_kontakty add column if not exists pripomenute timestamptz;
alter table public.web_kontakty add column if not exists eskalovane timestamptz;
-- staršie kontakty sa už nepripomínajú
update public.web_kontakty set pripomenute = coalesce(pripomenute, now()), eskalovane = coalesce(eskalovane, now());

alter table public.web_kontakty drop constraint if exists web_kontakty_zdroj_check;
alter table public.web_kontakty add constraint web_kontakty_zdroj_check
  check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt', 'podobna', 'hypoteka'));

-- maklér klikol v zvončeku na odpoveď (Zavolať, SMS, WhatsApp, e-mail) → kontakt sa už nepripomína
create or replace function public.oznacit_odpoved_kontaktu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update web_kontakty set odpovedane = coalesce(odpovedane, now())
  where id = p_id and (makler_id = auth.uid() or ja_admin());
end $$;
revoke execute on function public.oznacit_odpoved_kontaktu(bigint) from public, anon;
grant execute on function public.oznacit_odpoved_kontaktu(bigint) to authenticated;

-- každých 10 minút: čakajúce kontakty (e-book a strážca ponúk sa nepripomínajú – klient nič nečaká)
create or replace function public._kontakty_cakajuce() returns int
language plpgsql security definer set search_path = public as $$
declare k record; v_h int := extract(hour from now() at time zone 'Europe/Bratislava')::int; n int := 0; v_admini uuid[]; v_txt text;
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","kontakt":"Správa","podobna":"Hľadá podobnú","hypoteka":"Hypotéka"}';
begin
  if v_h < 8 or v_h >= 20 then return 0; end if;
  if not pg_try_advisory_xact_lock(510070) then return 0; end if;
  for k in
    select w.*, m.meno as makler_meno,
           (select p.nehnutelnost_id from pripomienky p where p.web_kontakt_id = w.id and p.druh = 'web' order by p.id limit 1) as nehn
    from web_kontakty w join makleri m on m.id = w.makler_id and m.aktivny
    where w.vybavene is null and w.odpovedane is null and w.zdroj not in ('ebook', 'strazca')
      and w.vytvorene > now() - interval '7 days'
      and ((w.pripomenute is null and w.vytvorene < now() - interval '2 hours')
        or (w.eskalovane is null and w.pripomenute < now() - interval '1 hour' and w.vytvorene < now() - interval '24 hours'))
      and exists (select 1 from pripomienky p where p.web_kontakt_id = w.id and p.druh = 'web')
      and not exists (select 1 from pripomienky p where p.web_kontakt_id = w.id and p.druh = 'web' and (p.hotovo is not null or p.zrusena is not null))
    order by w.id limit 50
  loop
    v_txt := coalesce(NAZVY->>k.zdroj, 'Kontakt') || ': ' || coalesce(k.meno || ', ', '') || k.kontakt ||
             case when k.co <> '' then ' – ' || left(k.co, 80) else '' end;
    if k.pripomenute is null then
      perform _push_zaradit(array[k.makler_id], 'kontakty', '⏰ Kontakt z webu čaká na odpoveď', v_txt || '. Ozvi sa a v zvončeku daj Hotovo.', './#zvoncek', 'typek-caka-' || k.id);
      update web_kontakty set pripomenute = now() where id = k.id;
    else
      select array_agg(id) into v_admini from makleri where aktivny and rola = 'admin' and id <> k.makler_id;
      if v_admini is not null then
        insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id)
        select a, now(), left('Kontakt z webu pre ' || k.makler_meno || ' čaká na odpoveď viac ako 24 hodín. ' || v_txt, 500), 'pripomienka', k.nehn
        from unnest(v_admini) a;
        perform _push_zaradit(v_admini, 'kontakty', '⚠️ Nevybavený kontakt z webu', k.makler_meno || ' – ' || v_txt, './#zvoncek', 'typek-eskalacia-' || k.id);
      else
        perform _push_zaradit(array[k.makler_id], 'kontakty', '⏰ Kontakt z webu čaká už vyše 24 hodín', v_txt, './#zvoncek', 'typek-caka-' || k.id);
      end if;
      update web_kontakty set eskalovane = now() where id = k.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._kontakty_cakajuce() from public, anon, authenticated;
select cron.schedule('kontakty-cakajuce', '*/10 * * * *', 'select public._kontakty_cakajuce()');

-- report pre majiteľa: záujemcovia zo stránky ponuky a údaje kancelárie
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
    'kontakty', (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca')),
    'kontakty_7', (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca') and k.vytvorene > now() - interval '7 days'),
    'kanc', _kancelaria_verejne(),
    'vygenerovane', now()) into v;
  return v;
end $$;

-- formulár na stránke ponuky – pribudla „Chcem ponuku hypotéky“
create or replace function public.ponuka_kontakt(p_id bigint, p_zdroj text, p_kontakt text, p_meno text default null,
                                                  p_co text default null, p_overenie jsonb default null, p_termin timestamptz default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  n nehnutelnosti;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_odkial text := _klient_odtlacok();
  v_ts bigint; v_nonce text; v_hash text;
  v_email boolean; v_id bigint; v_dopyt bigint; v_nazov text; v_ud bigint; v_termin_txt text; v_lok timestamp;
  NAZVY constant jsonb := '{"obhliadka":"Chce obhliadku","kontakt":"Otázka k ponuke","callback":"Zavolať späť","podobna":"Hľadá podobnú","hypoteka":"Chce ponuku hypotéky"}';
  DNI constant text[] := array['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|ponuka-' || coalesce(p_id, 0) || '|' || coalesce(p_zdroj, '') || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;

  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  select * into n from nehnutelnosti where id = p_id and stav in ('aktivne', 'rezervovane', 'predane');
  if not found or n.makler_id is null or not exists (select 1 from makleri where id = n.makler_id and aktivny) then
    raise exception 'Ponuka už nie je dostupná.' using errcode = '22023';
  end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;
  if p_zdroj = 'callback' and v_email then raise exception 'Na zavolanie napíšte telefónne číslo.' using errcode = '22023'; end if;

  -- termín obhliadky: len pri obhliadke, aktívnej ponuke, v rozumnom čase (zajtra až o 3 týždne, 7:00 – 20:00)
  if p_termin is not null then
    v_lok := p_termin at time zone 'Europe/Bratislava';
    if p_zdroj <> 'obhliadka' or n.stav <> 'aktivne' then p_termin := null;
    elsif p_termin < now() + interval '1 hour' or p_termin > now() + interval '22 days'
       or extract(hour from v_lok) < 7 or extract(hour from v_lok) > 19 or extract(minute from v_lok) not in (0, 30) then
      raise exception 'Vybraný termín už nie je možný. Vyberte iný, prosím.' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(918274, hashtext(n.makler_id::text));
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id is null and makler_id = n.makler_id and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;

  v_nazov := coalesce(nullif(n.nazov, ''), concat_ws(', ', coalesce(n.typ, 'Nehnuteľnosť'), n.obec));

  if p_zdroj = 'podobna' and (select count(*) from web_kontakty where web_id is null and makler_id = n.makler_id and dopyt_id is not null
                                and vytvorene > now() - interval '30 days') < 60 then
    insert into dopyty (kancelaria, makler_id, transakcia, kategorie, obce, okresy, cena_do, popis)
    values (n.kancelaria, n.makler_id, n.transakcia,
            case when n.kategoria is not null then array[n.kategoria] else '{}' end,
            case when n.obec is not null then array[n.obec] else '{}' end, '{}',
            case when n.zobrazit_cenu and n.cena > 0 then round(n.cena * 1.15, -3) end,
            left('Hľadá podobnú ako ' || v_nazov || coalesce(' (č. ' || n.cislo || ')', '') || ' – zo stránky ponuky.' ||
                 case when v_co <> '' then ' ' || v_co else '' end, 1000))
    returning id into v_dopyt;
    insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
    values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
  end if;

  -- návrh obhliadky v kalendári makléra (potvrdí ho v kalendári jedným klikom)
  if p_termin is not null then
    v_termin_txt := DNI[extract(dow from v_lok)::int + 1] || ' ' || to_char(v_lok, 'FMDD. FMMM.') || ' o ' || to_char(v_lok, 'FMHH24:MI');
    insert into udalosti (makler_id, nazov, zaciatok, koniec, typ, miesto, poznamka, nehnutelnost_id, navrh)
    values (n.makler_id, left('Návrh obhliadky – ' || coalesce(v_meno, 'klient z webu') || ' · ' || v_nazov, 200), p_termin, p_termin + interval '1 hour', 'obhliadka',
            nullif(concat_ws(', ', n.ulica, n.obec), ''),
            left('Klient si termín vybral na stránke ponuky' || coalesce(' č. ' || n.cislo, '') || '. Kontakt: ' || coalesce(v_meno || ', ', '') || v_kontakt ||
                 case when v_co <> '' then '. ' || v_co else '' end || '. Potvrď termín klientovi a tu v kalendári.', 1000),
            n.id, true)
    returning id into v_ud;
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial, termin, udalost_id)
  values (null, n.makler_id, p_zdroj, v_meno, v_kontakt, v_co, n.id, v_dopyt, v_odkial, p_termin, v_ud) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (n.makler_id, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || coalesce(' (č. ' || n.cislo || ')', '') ||
          coalesce(' · termín ' || v_termin_txt, '') || ': ' ||
          coalesce(v_meno || ', ', '') || v_kontakt || case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', n.id, v_id);
  return 'ok';
end $$;
revoke execute on function public.ponuka_kontakt(bigint, text, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.ponuka_kontakt(bigint, text, text, text, text, jsonb, timestamptz) to anon, authenticated;

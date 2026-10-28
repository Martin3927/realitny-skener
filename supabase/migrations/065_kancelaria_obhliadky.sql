-- =====================================================================
-- 1) Údaje kancelárie pre verejné stránky (názov, obchodné meno, web, kde pôsobí, meranie návštevnosti)
--    namiesto „Alpha Reality“ napísaného priamo v stránkach – každá kancelária uvidí seba.
-- 2) Výber termínu obhliadky na stránke ponuky: voľné časy podľa kalendára makléra,
--    návrh obhliadky v kalendári, ktorý maklér potvrdí.
-- =====================================================================

-- ---------------------------------------------------------------- vzhľad a značka: nové polia
create or replace function public.ulozit_vzhlad(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_schema text := coalesce(nullif(p->>'schema', ''), 'zlata');
  v_farba text := nullif(p->>'farba', '');
  v_logo text := nullif(trim(coalesce(p->>'logo', '')), '');
  v_nazov text := nullif(trim(coalesce(p->>'nazov', '')), '');
  v_firma text := nullif(btrim(regexp_replace(coalesce(p->>'firma', ''), '\s+', ' ', 'g')), '');
  v_web text := nullif(btrim(coalesce(p->>'web', '')), '');
  v_region text := nullif(btrim(regexp_replace(coalesce(p->>'region', ''), '\s+', ' ', 'g')), '');
  v_ga text := nullif(upper(btrim(coalesce(p->'meranie'->>'ga', ''))), '');
  v_fb text := nullif(regexp_replace(coalesce(p->'meranie'->>'fb', ''), '\s', '', 'g'), '');
  w jsonb := coalesce(p->'vodoznak', '{}'::jsonb);
  v_poz text := coalesce(nullif(w->>'pozicia', ''), 'pd');
  v_styl text := coalesce(nullif(w->>'styl', ''), 'farebne');
  v_pr numeric := coalesce((w->>'priehladnost')::numeric, 0.62);
  v_vel numeric := coalesce((w->>'velkost')::numeric, 0.2);
  v_x numeric := (w->>'x')::numeric;
  v_y numeric := (w->>'y')::numeric;
  v_w jsonb;
  v jsonb;
begin
  perform _over_admin();
  if v_schema not in ('zlata', 'typek', 'modra', 'smaragd', 'vinova', 'oranzova', 'fialova', 'grafit', 'tatry', 'more', 'tehla', 'slivka', 'salvia', 'noc', 'vlastna') then raise exception 'Neznáma farebná schéma.'; end if;
  if v_farba is not null and v_farba !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Farba musí byť v tvare #RRGGBB.'; end if;
  if v_schema = 'vlastna' and v_farba is null then raise exception 'Vyberte vlastnú farbu.'; end if;
  if v_logo is not null and (length(v_logo) > 600 or v_logo !~ '^https?://') then raise exception 'Neplatná adresa loga.'; end if;
  if length(coalesce(v_nazov, '')) > 80 then raise exception 'Názov je príliš dlhý.'; end if;
  if length(coalesce(v_firma, '')) > 120 then raise exception 'Obchodné meno je príliš dlhé.'; end if;
  if length(coalesce(v_region, '')) > 120 then raise exception 'Text „Kde pôsobíte“ je príliš dlhý.'; end if;
  if v_web is not null then
    if v_web !~* '^https?://' then v_web := 'https://' || v_web; end if;
    if length(v_web) > 200 or v_web !~* '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?(/[^\s"''<>]*)?$' then
      raise exception 'Web kancelárie napíšte v tvare www.vasakancelaria.sk'; end if;
  end if;
  if v_ga is not null and v_ga !~ '^G-[A-Z0-9]{4,14}$' then raise exception 'Google Analytics ID má tvar G-XXXXXXXXXX.'; end if;
  if v_fb is not null and v_fb !~ '^\d{8,20}$' then raise exception 'Meta Pixel je číslo (8 až 20 číslic).'; end if;
  if v_poz not in ('lh', 'hore', 'ph', 'ls', 'stred', 'ps', 'ld', 'dole', 'pd', 'vlastna') then raise exception 'Neznáma poloha vodotlače.'; end if;
  if v_styl not in ('farebne', 'biele') then raise exception 'Neznámy štýl vodotlače.'; end if;
  v_pr := least(1, greatest(0.1, v_pr)); v_vel := least(0.6, greatest(0.08, v_vel));
  v_w := jsonb_build_object('pozicia', v_poz, 'styl', v_styl, 'priehladnost', round(v_pr, 2), 'velkost', round(v_vel, 2));
  if v_poz = 'vlastna' then
    v_w := v_w || jsonb_build_object('x', round(least(1, greatest(0, coalesce(v_x, 0.5))), 3), 'y', round(least(1, greatest(0, coalesce(v_y, 0.5))), 3));
  end if;
  v := jsonb_build_object('schema', v_schema, 'farba', v_farba, 'logo', v_logo, 'nazov', v_nazov,
    'firma', v_firma, 'web', v_web, 'region', v_region, 'meranie', jsonb_strip_nulls(jsonb_build_object('ga', v_ga, 'fb', v_fb)),
    'vodoznak', v_w, 'upravil', auth.uid(), 'upravene', now());
  -- štýl aplikácie (klasický / ako editor webu) sa nastavuje vo Farebnom režime – nezmaže sa
  v := v || jsonb_strip_nulls(jsonb_build_object('styl', (select hodnota::jsonb->>'styl' from nastavenia where kluc = 'vzhlad')));
  insert into nastavenia (kluc, hodnota) values ('vzhlad', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $$;
revoke execute on function public.ulozit_vzhlad(jsonb) from public, anon;
grant execute on function public.ulozit_vzhlad(jsonb) to authenticated;

-- táto inštalácia patrí Alpha Reality: doplniť jej údaje, ak ešte nie sú vyplnené (inú kanceláriu sa to netýka)
do $$ begin
  if exists (select 1 from auth.users where lower(email) like '%@alphareality.sk') then
    insert into nastavenia (kluc, hodnota) values ('vzhlad', '{}') on conflict (kluc) do nothing;
    update nastavenia set hodnota = (hodnota::jsonb
      || case when coalesce(hodnota::jsonb->>'nazov', '') = '' then '{"nazov":"Alpha Reality"}'::jsonb else '{}'::jsonb end
      || case when coalesce(hodnota::jsonb->>'firma', '') = '' then '{"firma":"Alpha Reality s.r.o."}'::jsonb else '{}'::jsonb end
      || case when coalesce(hodnota::jsonb->>'web', '') = '' then '{"web":"https://www.alphareality.sk/"}'::jsonb else '{}'::jsonb end
      || case when coalesce(hodnota::jsonb->>'region', '') = '' then '{"region":"Spišská Nová Ves a Levoča"}'::jsonb else '{}'::jsonb end)::text
    where kluc = 'vzhlad';
  end if;
end $$;

-- údaje kancelárie pre stránku ponuky (server ich použije aj v náhľade pri zdieľaní)
create or replace function public._kancelaria_verejne() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('nazov', nullif(v->>'nazov', ''), 'firma', nullif(v->>'firma', ''),
                                              'web', nullif(v->>'web', ''), 'region', nullif(v->>'region', '')))
  from (select coalesce((select hodnota::jsonb from nastavenia where kluc = 'vzhlad'), '{}'::jsonb) as v) x
$$;
revoke execute on function public._kancelaria_verejne() from public, anon, authenticated;

create or replace function public.verejna_ponuka(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  select * into n from nehnutelnosti where id = p_id;
  if not found then return null; end if;
  if n.stav not in ('aktivne', 'rezervovane', 'predane') and not ja_aktivny() then return null; end if;
  return _verejna(n) || jsonb_build_object('kanc', _kancelaria_verejne());
end $$;

-- ---------------------------------------------------------------- termín obhliadky
alter table public.udalosti add column if not exists navrh boolean not null default false;   -- návrh od klienta, čaká na potvrdenie
alter table public.web_kontakty add column if not exists termin timestamptz;
alter table public.web_kontakty add column if not exists udalost_id bigint references public.udalosti(id) on delete set null;

-- kedy má maklér ponuky obsadené (len časy, bez názvov a detailov) na najbližšie 3 týždne
create or replace function public.obsadene_terminy(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_m uuid; v_od timestamptz := now(); v_do timestamptz := now() + interval '22 days';
begin
  select makler_id into v_m from nehnutelnosti where id = p_id and stav in ('aktivne', 'rezervovane');
  if v_m is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_array(z, k) order by z) from (
    select case when u.cely_den then date_trunc('day', u.zaciatok at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava' else u.zaciatok end as z,
           case when u.cely_den then (date_trunc('day', coalesce(u.koniec, u.zaciatok) at time zone 'Europe/Bratislava') + interval '1 day') at time zone 'Europe/Bratislava'
                else greatest(coalesce(u.koniec, u.zaciatok + interval '1 hour'), u.zaciatok + interval '15 minutes') end as k
    from udalosti u
    where u.zrusene is null and (u.makler_id = v_m or v_m = any(u.ucastnici))
      and coalesce(u.koniec, u.zaciatok + interval '1 day') > v_od and u.zaciatok < v_do
    union all
    select o.cas, o.cas + interval '1 hour' from obhliadky o
    where o.zrusena is null and o.cas > v_od - interval '1 hour' and o.cas < v_do
      and (o.makler_id = v_m or (o.makler_id is null and exists (select 1 from nehnutelnosti n where n.id = o.nehnutelnost_id and n.makler_id = v_m)))
    limit 400) t), '[]'::jsonb);
end $$;
revoke execute on function public.obsadene_terminy(bigint) from public;
grant execute on function public.obsadene_terminy(bigint) to anon, authenticated;

-- maklér potvrdí návrh obhliadky (až potom mu prídu bežné upozornenia deň vopred a ráno)
create or replace function public.potvrdit_navrh_udalosti(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u udalosti;
begin
  perform _over_aktivny();
  select * into u from udalosti where id = p_id and zrusene is null for update;
  if not found then raise exception 'Udalosť neexistuje.'; end if;
  if u.makler_id is distinct from auth.uid() and not ja_admin() then raise exception 'Potvrdiť môže len maklér, ktorému patrí.' using errcode = '42501'; end if;
  update udalosti set navrh = false, nazov = regexp_replace(nazov, '^Návrh obhliadky', 'Obhliadka') where id = p_id;
  perform _upozornenia_udalosti(p_id);
end $$;
revoke execute on function public.potvrdit_navrh_udalosti(bigint) from public, anon;
grant execute on function public.potvrdit_navrh_udalosti(bigint) to authenticated;

-- formulár na stránke ponuky – teraz aj s vybraným termínom obhliadky
drop function if exists public.ponuka_kontakt(bigint, text, text, text, text, jsonb);
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
  NAZVY constant jsonb := '{"obhliadka":"Chce obhliadku","kontakt":"Otázka k ponuke","callback":"Zavolať späť","podobna":"Hľadá podobnú"}';
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

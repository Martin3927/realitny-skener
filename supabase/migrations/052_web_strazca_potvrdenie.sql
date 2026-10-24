-- Bezpečnostné doplnky k webu makléra (po kontrole):
--  • strážca ponúk e-mailom až po potvrdení (dvojité prihlásenie) – nikto nemôže prihlásiť cudziu adresu
--  • bezpečné náhodné kódy (odhlásenie, doména), prísnejšia kontrola e-mailu
--  • nový web nedostane starú adresu iného webu (staré odkazy a QR kódy ostanú jeho)

-- =====================================================================================  strážca: potvrdenie e-mailu
alter table public.web_strazcovia
  add column if not exists potvrdeny timestamptz,
  add column if not exists potvrdenie_odoslane timestamptz,
  add column if not exists potvrdenie_pokusy int not null default 0;
create unique index if not exists web_strazcovia_email_aktivny on public.web_strazcovia (web_id, lower(email)) where potvrdeny is not null and odhlaseny is null;
create index if not exists web_strazcovia_na_potvrdenie on public.web_strazcovia (vytvorene) where potvrdeny is null and odhlaseny is null and potvrdenie_odoslane is null;

create or replace function public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text default null, p_co text default null,
                                               p_ponuka bigint default null, p_dopyt jsonb default null, p_overenie jsonb default null) returns text
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
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","strazca":"Strážca ponúk","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","ebook":"E-book","kontakt":"Správa z webu"}';
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
  if w.id is null or w.zverejnene is null or not exists (select 1 from makleri where id = w.makler_id and aktivny) then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if p_zdroj = 'ebook' and not v_email then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;

  perform pg_advisory_xact_lock(918273, w.id::int);
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id = w.id and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if p_ponuka is not null and not exists (select 1 from nehnutelnosti where id = p_ponuka and makler_id = w.makler_id) then p_ponuka := null; end if;

  if p_zdroj = 'strazca' and p_dopyt is not null then
    if jsonb_typeof(p_dopyt) <> 'object' then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    v_kat := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'kategorie') = 'array' then p_dopyt->'kategorie' else '[]' end) x
                        where x in ('byty', 'domy', 'pozemky', 'chaty')), '{}');
    v_obce := coalesce((select array_agg(distinct left(btrim(x), 60)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'obce') = 'array' then p_dopyt->'obce' else '[]' end) x limit 10) t
                        where btrim(x) <> ''), '{}');
    v_cena := case when (p_dopyt->>'cena_do') ~ '^\d{3,9}(\.\d{1,2})?$' then (p_dopyt->>'cena_do')::numeric end;
    if cardinality(v_kat) = 0 and cardinality(v_obce) = 0 and v_cena is null then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    if (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < 60 then
      insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do, popis)
      values (w.makler_id, case when coalesce((p_dopyt->>'prenajom') = 'true', false) then 'prenajom' else 'predaj' end, v_kat, v_obce, v_cena, 'Strážca ponúk z webu.')
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
      -- s e-mailom: klientovi príde e-mail s odkazom na potvrdenie; až po potvrdení mu chodia nové zhodné ponuky
      -- (na jeden e-mail najviac jedno nepotvrdené prihlásenie za 24 hodín na web – nikto nemôže zahltiť cudziu schránku)
      if v_email and not exists (select 1 from web_strazcovia where web_id = w.id and email = v_kontakt and potvrdeny is null
                                   and odhlaseny is null and vytvorene > now() - interval '24 hours') then
        insert into web_strazcovia (dopyt_id, web_id, makler_id, email, meno, token)
        values (v_dopyt, w.id, w.makler_id, v_kontakt, v_meno, encode(extensions.gen_random_bytes(20), 'hex'));
      end if;
    end if;
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (w.id, w.makler_id, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (w.makler_id, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || ': ' || coalesce(v_meno || ', ', '') || v_kontakt ||
          case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka, v_id);

  if p_zdroj = 'ebook' then return coalesce(nullif(w.zverejnene->'dl'->>'url', ''), 'ok'); end if;
  return 'ok';
end $$;

create or replace function public._strazca_web_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav <> 'aktivne' or new.makler_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and not (new.cena < old.cena) then return new; end if;
  for d in select dp.* from dopyty dp join web_strazcovia s on s.dopyt_id = dp.id
           where s.makler_id = new.makler_id and s.odhlaseny is null and s.potvrdeny is not null and dp.stav = 'aktivny' loop
    if _sedi_ponuka(d, new) then
      insert into web_strazca_fronta (dopyt_id, nehnutelnost_id, cena) values (d.id, new.id, new.cena) on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

create or replace function public._strazca_na_odoslanie(p_limit int default 20) returns jsonb
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
    v_ponuky := (select jsonb_agg(_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne' order by n.cena nulls last) from nehnutelnosti n where n.id = any(r.nids) and n.stav = 'aktivne');
    update web_strazca_fronta set odoslane = now(), chyba = null where id = any(r.ids) and odoslane is null;
    if v_ponuky is null then continue; end if;
    update web_strazcovia set posledny_email = now(), emailov = emailov + 1 where dopyt_id = r.dopyt_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'dopyt_id', r.dopyt_id, 'ids', to_jsonb(r.ids), 'email', r.email, 'meno', r.meno, 'token', r.token,
      'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'makler', v_mk - 'foto',
      'web', jsonb_build_object('name', w.zverejnene->>'name', 'phone', w.zverejnene->>'phone', 'email', w.zverejnene->>'email', 'office', w.zverejnene->>'office'),
      'ponuky', v_ponuky));
  end loop;
  return v_out;
end $$;

create or replace function public.moj_web(p_makler uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  w := _web_na_upravu(p_makler);
  return jsonb_build_object('id', w.id, 'makler_id', w.makler_id, 'adresa', w.adresa, 'koncept', w.koncept, 'zverejnene_kedy', w.zverejnene_kedy,
    'adresa_navrh', w.adresa_navrh, 'adresa_navrh_kedy', w.adresa_navrh_kedy,
    'domena', w.domena, 'domena_token', w.domena_token, 'domena_overena', w.domena_overena, 'domena_smeruje', w.domena_smeruje,
    'domena_kontrola', w.domena_kontrola, 'domena_ziadost', w.domena_ziadost, 'domena_pripojena', w.domena_pripojena,
    'upravene', w.upravene, 'zverejneny', w.zverejnene is not null,
    'zmeny_od_zverejnenia', w.zverejnene is null or w.zverejnene is distinct from w.koncept,
    'strazcovia', jsonb_build_object(
      'aktivni', (select count(*) from web_strazcovia s join dopyty d on d.id = s.dopyt_id where s.web_id = w.id and s.odhlaseny is null and s.potvrdeny is not null and d.stav = 'aktivny'),
      'nepotvrdeni', (select count(*) from web_strazcovia s where s.web_id = w.id and s.odhlaseny is null and s.potvrdeny is null and s.vytvorene > now() - interval '7 days'),
      'emaily_30', (select count(*) from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id where s.web_id = w.id and f.odoslane > now() - interval '30 days' and f.chyba is null),
      'caka', (select count(*) from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id where s.web_id = w.id and f.odoslane is null)),
    'verzie', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kedy', v.kedy, 'kto', (select meno from makleri where id = v.kto)) order by v.kedy desc)
                        from (select * from weby_verzie where web_id = w.id order by kedy desc limit 30) v), '[]'::jsonb));
end $$;

create or replace function public.ulozit_domenu_webu(p_domena text, p_makler uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby; v text := nullif(lower(trim(regexp_replace(coalesce(p_domena, ''), '^(https?://)?(www\.)?|/.*$', '', 'g'))), '');
begin
  w := _web_na_upravu(p_makler);
  if v is not null and v !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'Neplatná doména. Napíš ju v tvare mojemeno.sk' using errcode = '22023'; end if;
  if v is not null and v ~ '(^|\.)realitnytypek\.sk$' then raise exception 'Túto doménu nie je možné použiť.' using errcode = '22023'; end if;
  if v is null then
    update weby set domena = null, domena_token = null, domena_overena = null, domena_smeruje = false, domena_kontrola = null, domena_ziadost = null, domena_pripojena = null where id = w.id;
    return jsonb_build_object('domena', null);
  end if;
  if v is distinct from w.domena then
    if exists (select 1 from weby where domena = v and domena_overena is not null and id <> w.id) then raise exception 'Túto doménu už používa iný web.' using errcode = '23505'; end if;
    update weby set domena = v, domena_token = 'typek-' || encode(extensions.gen_random_bytes(12), 'hex'),
      domena_overena = null, domena_smeruje = false, domena_kontrola = null, domena_ziadost = null, domena_pripojena = null where id = w.id;
  end if;
  select * into w from weby where id = w.id;
  return jsonb_build_object('domena', w.domena, 'token', w.domena_token);
end $$;

-- klient klikol na potvrdenie v e-maile (stránka potvrdit.php); staršie potvrdené prihlásenie toho istého e-mailu na tomto webe nahradí
create or replace function public.potvrdit_strazcu(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s web_strazcovia; v_meno text;
begin
  select * into s from web_strazcovia where token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 20 for update;
  if not found or s.odhlaseny is not null then return jsonb_build_object('ok', false); end if;
  if s.potvrdeny is null then
    if s.vytvorene < now() - interval '30 days' then return jsonb_build_object('ok', false, 'stary', true); end if;
    update web_strazcovia set odhlaseny = now() where web_id = s.web_id and lower(email) = lower(s.email) and dopyt_id <> s.dopyt_id
      and potvrdeny is not null and odhlaseny is null;
    update web_strazcovia set potvrdeny = now() where dopyt_id = s.dopyt_id;
  end if;
  select meno into v_meno from makleri where id = s.makler_id;
  return jsonb_build_object('ok', true, 'makler', v_meno);
end $$;

-- e-maily s odkazom na potvrdenie (volá funkcia „pripomienky“): nepotvrdené prihlásenia za posledných 7 dní, každé raz
create or replace function public._strazca_potvrdenia(p_limit int default 20) returns jsonb
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
      'web', jsonb_build_object('name', w.zverejnene->>'name', 'phone', w.zverejnene->>'phone', 'email', w.zverejnene->>'email', 'office', w.zverejnene->>'office'),
      'hlada', jsonb_build_object('transakcia', r.transakcia, 'kategorie', to_jsonb(r.kategorie), 'obce', to_jsonb(r.obce), 'cena_do', r.cena_do)));
  end loop;
  return v_out;
end $$;
create or replace function public._strazca_potvrdenie_chyba(p_dopyt bigint) returns void
language sql security definer set search_path = public as $$
  update web_strazcovia set potvrdenie_pokusy = potvrdenie_pokusy + 1,
         potvrdenie_odoslane = case when potvrdenie_pokusy + 1 >= 3 then potvrdenie_odoslane end
   where dopyt_id = p_dopyt;
$$;

-- =====================================================================================  nový web nedostane cudziu starú adresu
create or replace function public._web_maklera(p_makler uuid) returns weby
language plpgsql security definer set search_path = public as $$
declare w weby; v_zaklad text; v_adresa text; i int := 1;
begin
  select * into w from weby where makler_id = p_makler;
  if found then return w; end if;
  v_zaklad := left(nullif(_web_adresa((select meno from makleri where id = p_makler)), ''), 40);
  if v_zaklad is null or length(v_zaklad) < 3 then v_zaklad := 'makler'; end if;
  v_adresa := v_zaklad;
  while _adresa_obsadena(v_adresa, -1) loop
    i := i + 1; v_adresa := v_zaklad || '-' || i;
  end loop;
  insert into weby (makler_id, adresa) values (p_makler, v_adresa) returning * into w;
  return w;
end $$;

-- =====================================================================================  práva
revoke execute on function public._strazca_web_ponuka() from public, anon, authenticated;
revoke execute on function public._web_maklera(uuid) from public, anon, authenticated;
revoke execute on function public._strazca_potvrdenia(int), public._strazca_potvrdenie_chyba(bigint) from public, anon, authenticated;
grant execute on function public._strazca_potvrdenia(int), public._strazca_potvrdenie_chyba(bigint) to service_role;
revoke execute on function public.potvrdit_strazcu(text) from public;
grant execute on function public.potvrdit_strazcu(text) to anon, authenticated;
revoke execute on function public.moj_web(uuid), public.ulozit_domenu_webu(text, uuid) from public, anon;
grant execute on function public.moj_web(uuid), public.ulozit_domenu_webu(text, uuid) to authenticated;
revoke execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb), public._strazca_na_odoslanie(int) from public;
grant execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb) to anon, authenticated;
revoke execute on function public._strazca_na_odoslanie(int) from anon, authenticated;
grant execute on function public._strazca_na_odoslanie(int) to service_role;

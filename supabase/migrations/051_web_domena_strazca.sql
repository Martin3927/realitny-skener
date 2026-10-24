-- 051: web makléra – vlastná doména s overením, adresa so schválením adminom, ochrana formulárov,
--      strážca ponúk posiela klientom e-maily, odpoveď na kontakt zo zvončeka, mapa webov pre Google
--
-- Doména: maklér ju uloží → dostane TXT záznam na overenie vlastníctva a A záznam na náš server →
--         funkcia „domena“ (edge) skontroluje DNS a zapíše výsledok → admin ju pripojí na hostingu.
-- Adresa: zmenu adresy webu schvaľuje admin; staré adresy (vytlačené QR kódy) fungujú ďalej.

-- =====================================================================================  pomocníci
create or replace function public._oznam_adminom(p_text text) returns void
language sql security definer set search_path = public as $$
  insert into pripomienky (makler_id, cas, poznamka, druh)
  select id, now(), left(p_text, 500), 'web' from makleri where rola = 'admin' and aktivny;
$$;
create or replace function public._oznam_maklerovi(p_makler uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into pripomienky (makler_id, cas, poznamka, druh)
  select id, now(), left(p_text, 500), 'web' from makleri where id = p_makler and aktivny;
$$;
revoke execute on function public._oznam_adminom(text), public._oznam_maklerovi(uuid, text) from public, anon, authenticated;

-- =====================================================================================  weby: adresa a doména
alter table public.weby
  add column if not exists adresa_navrh text,
  add column if not exists adresa_navrh_kedy timestamptz,
  add column if not exists domena_token text,
  add column if not exists domena_overena timestamptz,
  add column if not exists domena_smeruje boolean not null default false,
  add column if not exists domena_kontrola timestamptz,
  add column if not exists domena_ziadost timestamptz,
  add column if not exists domena_pripojena timestamptz;
-- doménu si môže uložiť viac maklérov, patrí tomu, kto ju overí záznamom v DNS
alter table public.weby drop constraint if exists weby_domena_key;
create unique index if not exists weby_domena_overena on public.weby (domena) where domena_overena is not null;
create index if not exists weby_domena on public.weby (domena) where domena is not null;
create unique index if not exists weby_adresa_navrh on public.weby (adresa_navrh) where adresa_navrh is not null;

create table if not exists public.weby_stare_adresy (
  adresa text primary key,
  web_id bigint not null references public.weby(id) on delete cascade,
  kedy timestamptz not null default now()
);
create index if not exists weby_stare_adresy_web on public.weby_stare_adresy (web_id);
alter table public.weby_stare_adresy enable row level security;
revoke all on public.weby_stare_adresy from anon, authenticated;

-- web podľa adresy, staršej adresy alebo pripojenej domény (www. sa ignoruje)
create or replace function public._web_podla(p text) returns weby
language plpgsql stable security definer set search_path = public as $$
declare v text := lower(trim(coalesce(p, ''))); w weby;
begin
  select * into w from weby where adresa = v;
  if found then return w; end if;
  select * into w from weby where domena = regexp_replace(v, '^www\.', '') and domena_pripojena is not null limit 1;
  if found then return w; end if;
  select x.* into w from weby x join weby_stare_adresy s on s.web_id = x.id where s.adresa = v;
  return w;
end $$;
revoke execute on function public._web_podla(text) from public, anon, authenticated;

create or replace function public._adresa_obsadena(p_adresa text, p_web bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from weby where id <> p_web and (adresa = p_adresa or adresa_navrh = p_adresa))
      or exists (select 1 from weby_stare_adresy where adresa = p_adresa and web_id <> p_web);
$$;
revoke execute on function public._adresa_obsadena(text, bigint) from public, anon, authenticated;

create or replace function public._prepni_adresu(p_web bigint, p_nova text) returns void
language plpgsql security definer set search_path = public as $$
declare v_stara text;
begin
  select adresa into v_stara from weby where id = p_web for update;
  if v_stara = p_nova then return; end if;
  insert into weby_stare_adresy (adresa, web_id) values (v_stara, p_web)
    on conflict (adresa) do update set web_id = excluded.web_id, kedy = now();
  delete from weby_stare_adresy where adresa = p_nova;
  update weby set adresa = p_nova, adresa_navrh = null, adresa_navrh_kedy = null where id = p_web;
end $$;
revoke execute on function public._prepni_adresu(bigint, text) from public, anon, authenticated;

-- zmena adresy: admin hneď, maklér pošle žiadosť adminovi
drop function if exists public.zmenit_adresu_webu(text, uuid);
create or replace function public.zmenit_adresu_webu(p_adresa text, p_makler uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby; v text := _web_adresa(p_adresa); v_meno text;
begin
  w := _web_na_upravu(p_makler);
  if v !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' then raise exception 'Adresa môže mať 3 až 50 znakov: malé písmená bez diakritiky, číslice a pomlčky.' using errcode = '22023'; end if;
  if v = w.adresa then
    update weby set adresa_navrh = null, adresa_navrh_kedy = null where id = w.id;
    return jsonb_build_object('adresa', w.adresa, 'navrh', null);
  end if;
  if _adresa_obsadena(v, w.id) then raise exception 'Adresa % je už obsadená. Skús inú.', v using errcode = '23505'; end if;
  select meno into v_meno from makleri where id = w.makler_id;
  if ja_admin() then
    perform _prepni_adresu(w.id, v);
    if w.makler_id <> auth.uid() then perform _oznam_maklerovi(w.makler_id, 'Adresa tvojho webu je zmenená na ' || v || '. Staré odkazy a QR kódy fungujú ďalej.'); end if;
    return jsonb_build_object('adresa', v, 'navrh', null);
  end if;
  update weby set adresa_navrh = v, adresa_navrh_kedy = now() where id = w.id;
  perform _oznam_adminom('Žiadosť o adresu webu: ' || coalesce(v_meno, 'maklér') || ' chce adresu ' || v || ' (teraz ' || w.adresa || '). Schváliš ju v časti Osobný web.');
  return jsonb_build_object('adresa', w.adresa, 'navrh', v);
end $$;

create or replace function public.schvalit_adresu_webu(p_web bigint, p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Adresy schvaľuje administrátor.' using errcode = '42501'; end if;
  select * into w from weby where id = p_web for update;
  if not found or w.adresa_navrh is null then raise exception 'Žiadosť už nie je aktuálna.' using errcode = '22023'; end if;
  if p_ok then
    if _adresa_obsadena(w.adresa_navrh, w.id) then raise exception 'Adresa % je medzitým obsadená.', w.adresa_navrh using errcode = '23505'; end if;
    perform _prepni_adresu(w.id, w.adresa_navrh);
    perform _oznam_maklerovi(w.makler_id, 'Adresa tvojho webu je schválená: ' || w.adresa_navrh || '. Staré odkazy a QR kódy fungujú ďalej.');
    return w.adresa_navrh;
  end if;
  update weby set adresa_navrh = null, adresa_navrh_kedy = null where id = w.id;
  perform _oznam_maklerovi(w.makler_id, 'Žiadosť o adresu webu ' || w.adresa_navrh || ' nebola schválená. Ozvi sa adminovi.');
  return w.adresa;
end $$;

-- doména: uloženie vytvorí kód na overenie vlastníctva
drop function if exists public.ulozit_domenu_webu(text, uuid);
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
    update weby set domena = v, domena_token = 'typek-' || substr(md5(random()::text || clock_timestamp()::text || w.id::text), 1, 24),
      domena_overena = null, domena_smeruje = false, domena_kontrola = null, domena_ziadost = null, domena_pripojena = null where id = w.id;
  end if;
  select * into w from weby where id = w.id;
  return jsonb_build_object('domena', w.domena, 'token', w.domena_token);
end $$;

-- výsledok kontroly DNS zapisuje len funkcia „domena“ (kľúč služby)
create or replace function public._zapis_kontrolu_domeny(p_web bigint, p_domena text, p_txt boolean, p_smeruje boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby; v_meno text; v_konflikt boolean := false;
begin
  select * into w from weby where id = p_web for update;
  if not found or w.domena is distinct from p_domena then return jsonb_build_object('ok', false, 'chyba', 'Doména sa medzitým zmenila.'); end if;
  if p_txt and exists (select 1 from weby where domena = w.domena and domena_overena is not null and id <> w.id) then v_konflikt := true; end if;
  update weby set domena_kontrola = now(), domena_smeruje = p_smeruje,
    domena_overena = case when p_txt and not v_konflikt then coalesce(domena_overena, now()) when domena_pripojena is not null then domena_overena else null end
  where id = w.id returning * into w;
  -- overená a nasmerovaná doména → žiadosť adminovi o pripojenie na hostingu (raz)
  if w.domena_overena is not null and w.domena_smeruje and w.domena_pripojena is null and w.domena_ziadost is null then
    select meno into v_meno from makleri where id = w.makler_id;
    update weby set domena_ziadost = now() where id = w.id;
    perform _oznam_adminom('Pripojiť doménu ' || w.domena || ' k hostingu – web makléra ' || coalesce(v_meno, '') || '. Vlastníctvo aj smerovanie sú overené. Postup nájdeš v časti Osobný web.');
  end if;
  return jsonb_build_object('ok', true, 'konflikt', v_konflikt, 'overena', w.domena_overena is not null, 'smeruje', w.domena_smeruje,
    'ziadost', w.domena_ziadost is not null or (w.domena_overena is not null and w.domena_smeruje), 'pripojena', w.domena_pripojena is not null);
end $$;
revoke execute on function public._zapis_kontrolu_domeny(bigint, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public._zapis_kontrolu_domeny(bigint, text, boolean, boolean) to service_role;

-- admin: doména je pripojená na hostingu (alebo zamietnutá / odpojená)
create or replace function public.pripojit_domenu_webu(p_web bigint, p_ok boolean, p_dovod text default null) returns void
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Domény pripája administrátor.' using errcode = '42501'; end if;
  select * into w from weby where id = p_web for update;
  if not found or w.domena is null then raise exception 'Web nemá doménu.' using errcode = '22023'; end if;
  if p_ok then
    if w.domena_overena is null then raise exception 'Vlastníctvo domény ešte nie je overené.' using errcode = '22023'; end if;
    update weby set domena_pripojena = now() where id = w.id;
    perform _oznam_maklerovi(w.makler_id, 'Doména ' || w.domena || ' je pripojená. Tvoj web beží na https://' || w.domena || '/');
  else
    update weby set domena_pripojena = null, domena_ziadost = null where id = w.id;
    perform _oznam_maklerovi(w.makler_id, 'Doménu ' || w.domena || ' sa zatiaľ nepodarilo pripojiť' || coalesce(': ' || nullif(left(btrim(p_dovod), 300), ''), '.') );
  end if;
end $$;

-- admin: žiadosti o adresu a domény na pripojenie
create or replace function public.weby_ziadosti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Len pre administrátora.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('web_id', w.id, 'makler_id', w.makler_id, 'meno', m.meno, 'adresa', w.adresa,
      'adresa_navrh', w.adresa_navrh, 'adresa_navrh_kedy', w.adresa_navrh_kedy, 'domena', w.domena, 'domena_overena', w.domena_overena,
      'domena_smeruje', w.domena_smeruje, 'domena_kontrola', w.domena_kontrola, 'domena_ziadost', w.domena_ziadost, 'domena_pripojena', w.domena_pripojena)
      order by coalesce(w.adresa_navrh_kedy, w.domena_ziadost, w.domena_pripojena) desc nulls last)
    from weby w join makleri m on m.id = w.makler_id
    where w.adresa_navrh is not null or w.domena_ziadost is not null or w.domena_pripojena is not null), '[]'::jsonb);
end $$;

-- =====================================================================================  strážca ponúk e-mailom
create table if not exists public.web_strazcovia (
  dopyt_id bigint primary key references public.dopyty(id) on delete cascade,
  web_id bigint not null references public.weby(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete cascade,
  email text not null,
  meno text,
  token text not null unique,
  odhlaseny timestamptz,
  posledny_email timestamptz,
  emailov int not null default 0,
  vytvorene timestamptz not null default now()
);
create index if not exists web_strazcovia_makler on public.web_strazcovia (makler_id) where odhlaseny is null;
create table if not exists public.web_strazca_fronta (
  id bigint generated always as identity primary key,
  dopyt_id bigint not null references public.web_strazcovia(dopyt_id) on delete cascade,
  nehnutelnost_id bigint not null references public.nehnutelnosti(id) on delete cascade,
  cena numeric,
  vytvorene timestamptz not null default now(),
  odoslane timestamptz,
  chyba text,
  pokusy int not null default 0
);
create unique index if not exists web_strazca_fronta_kluc on public.web_strazca_fronta (dopyt_id, nehnutelnost_id, coalesce(cena, -1));
create index if not exists web_strazca_fronta_caka on public.web_strazca_fronta (vytvorene) where odoslane is null;
create index if not exists web_strazca_fronta_ponuka on public.web_strazca_fronta (nehnutelnost_id);
alter table public.web_strazcovia enable row level security;
alter table public.web_strazca_fronta enable row level security;
revoke all on public.web_strazcovia, public.web_strazca_fronta from anon, authenticated;

-- nová alebo zlacnená ponuka makléra → do fronty klientom, ktorých strážca sa s ňou zhoduje
create or replace function public._strazca_web_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav <> 'aktivne' or new.makler_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and not (new.cena < old.cena) then return new; end if;
  for d in select dp.* from dopyty dp join web_strazcovia s on s.dopyt_id = dp.id
           where s.makler_id = new.makler_id and s.odhlaseny is null and dp.stav = 'aktivny' loop
    if _sedi_ponuka(d, new) then
      insert into web_strazca_fronta (dopyt_id, nehnutelnost_id, cena) values (d.id, new.id, new.cena) on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists nehnutelnosti_strazca_web on public.nehnutelnosti;
create trigger nehnutelnosti_strazca_web after insert or update of stav, cena on public.nehnutelnosti
  for each row execute function public._strazca_web_ponuka();

-- odhlásenie jedným klikom z e-mailu
create or replace function public.odhlasit_strazcu(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s web_strazcovia; v_meno text;
begin
  select * into s from web_strazcovia where token = coalesce(p_token, '') and length(coalesce(p_token, '')) >= 20;
  if not found then return jsonb_build_object('ok', false); end if;
  if s.odhlaseny is null then
    update web_strazcovia set odhlaseny = now() where dopyt_id = s.dopyt_id;
    update dopyty set stav = 'zruseny', upravene = now() where id = s.dopyt_id and stav = 'aktivny';
  end if;
  select meno into v_meno from makleri where id = s.makler_id;
  return jsonb_build_object('ok', true, 'makler', v_meno);
end $$;
revoke execute on function public.odhlasit_strazcu(text) from public;
grant execute on function public.odhlasit_strazcu(text) to anon, authenticated;

-- =====================================================================================  odpoveď na kontakt zo zvončeka
alter table public.pripomienky add column if not exists web_kontakt_id bigint references public.web_kontakty(id) on delete set null;
create index if not exists pripomienky_web_kontakt on public.pripomienky (web_kontakt_id) where web_kontakt_id is not null;

-- =====================================================================================  ochrana formulárov
-- prehliadač návštevníka vyrieši malú výpočtovú úlohu (zlomok sekundy); každé riešenie platí raz
create table if not exists public.web_overenia (hash text primary key, cas timestamptz not null default now());
create index if not exists web_overenia_cas on public.web_overenia (cas);
alter table public.web_overenia enable row level security;
revoke all on public.web_overenia from anon, authenticated;

drop function if exists public.web_kontakt(text, text, text, text, text, bigint, jsonb);
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
  v_email := v_kontakt ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$';
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
      -- s e-mailom: nové zhodné ponuky makléra mu prídu automaticky (s odhlásením jedným klikom)
      if v_email then
        insert into web_strazcovia (dopyt_id, web_id, makler_id, email, meno, token)
        values (v_dopyt, w.id, w.makler_id, v_kontakt, v_meno, md5(random()::text || clock_timestamp()::text || v_dopyt::text) || substr(md5(random()::text), 1, 8));
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

-- =====================================================================================  verejný web a návštevy cez _web_podla
create or replace function public.verejny_web(p_adresa text, p_nahlad boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w weby; v_obsah jsonb;
begin
  w := _web_podla(p_adresa);
  if w.id is null then return null; end if;
  if p_nahlad and ja_aktivny() then v_obsah := w.koncept; else v_obsah := w.zverejnene; end if;
  if v_obsah is null then return null; end if;
  if not exists (select 1 from makleri where id = w.makler_id and aktivny) then return null; end if;
  v_obsah := v_obsah #- '{dl,url}';
  return jsonb_build_object(
    'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end, 'web', v_obsah, 'nahlad', p_nahlad and ja_aktivny(),
    'zverejnene_kedy', w.zverejnene_kedy,
    'makler', verejny_makler(w.makler_id),
    'ponuky', coalesce((select jsonb_agg(_web_ponuka(n) order by (n.stav = 'aktivne') desc, n.exkluzivne desc, n.upravene desc)
                        from nehnutelnosti n where n.makler_id = w.makler_id and n.stav in ('aktivne', 'rezervovane')), '[]'::jsonb),
    'predane', coalesce((select jsonb_agg(x order by x->>'upravene' desc) from (
                          select _web_ponuka(n) as x from nehnutelnosti n
                          where n.makler_id = w.makler_id and n.stav = 'predane' and n.upravene > now() - interval '2 years'
                          order by n.upravene desc limit 12) t), '[]'::jsonb),
    'recenzie', verejne_recenzie(w.makler_id),
    'kancelaria', vzhlad_kancelarie());
end $$;

create or replace function public.zaznamenat_navstevu_webu(p_adresa text) returns void
language plpgsql security definer set search_path = public as $$
declare w weby; v_odkial text := _klient_odtlacok(); n int;
begin
  if ja_aktivny() then return; end if;
  w := _web_podla(p_adresa);
  if w.id is null or w.zverejnene is null then return; end if;
  if v_odkial is not null then
    insert into web_navstevnici (web_id, den, odkial) values (w.id, current_date, v_odkial) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then return; end if;
    if random() < 0.02 then delete from web_navstevnici where den < current_date - 2; end if;
  end if;
  insert into web_zobrazenia (web_id, den, pocet) values (w.id, current_date, 1)
    on conflict (web_id, den) do update set pocet = web_zobrazenia.pocet + 1;
end $$;

-- =====================================================================================  editor: nové údaje o webe
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
      'aktivni', (select count(*) from web_strazcovia s join dopyty d on d.id = s.dopyt_id where s.web_id = w.id and s.odhlaseny is null and d.stav = 'aktivny'),
      'emaily_30', (select count(*) from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id where s.web_id = w.id and f.odoslane > now() - interval '30 days' and f.chyba is null),
      'caka', (select count(*) from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id where s.web_id = w.id and f.odoslane is null)),
    'verzie', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kedy', v.kedy, 'kto', (select meno from makleri where id = v.kto)) order by v.kedy desc)
                        from (select * from weby_verzie where web_id = w.id order by kedy desc limit 30) v), '[]'::jsonb));
end $$;

-- =====================================================================================  mapa webov pre Google (sitemap)
create or replace function public.verejne_weby_mapa() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'upravene', greatest(w.zverejnene_kedy, (select max(n.upravene) from nehnutelnosti n where n.makler_id = w.makler_id and n.stav in ('aktivne', 'rezervovane'))),
      'ponuky', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'upravene', n.upravene)) from nehnutelnosti n
                          where n.makler_id = w.makler_id and n.stav in ('aktivne', 'rezervovane')), '[]'::jsonb))), '[]'::jsonb)
  from weby w join makleri m on m.id = w.makler_id
  where w.zverejnene is not null and m.aktivny;
$$;

-- =====================================================================================  práva
revoke execute on function public.zmenit_adresu_webu(text, uuid), public.ulozit_domenu_webu(text, uuid), public.schvalit_adresu_webu(bigint, boolean),
  public.pripojit_domenu_webu(bigint, boolean, text), public.weby_ziadosti(), public.moj_web(uuid) from public, anon;
grant execute on function public.zmenit_adresu_webu(text, uuid), public.ulozit_domenu_webu(text, uuid), public.schvalit_adresu_webu(bigint, boolean),
  public.pripojit_domenu_webu(bigint, boolean, text), public.weby_ziadosti(), public.moj_web(uuid) to authenticated;
revoke execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb), public.verejne_weby_mapa() from public;
grant execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb), public.verejne_weby_mapa() to anon, authenticated;

-- =====================================================================================  limit kontrol domény (funkcia „domena“)
create table if not exists public.web_domena_dotazy (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  cas timestamptz not null default now()
);
create index if not exists web_domena_dotazy_makler on public.web_domena_dotazy (makler_id, cas desc);
alter table public.web_domena_dotazy enable row level security;
revoke all on public.web_domena_dotazy from anon, authenticated;

-- =====================================================================================  strážca ponúk: e-maily klientom
-- Volá funkcia „pripomienky“ (každú minútu). Vráti strážcov, ktorým treba poslať e-mail, a ich položky rovno označí ako odoslané.
-- Klient dostane najviac 1 e-mail za 12 hodín (viac ponúk naraz v jednom e-maile); nová ponuka počká 10 minút,
-- aby maklér stihol doplniť fotky. Neaktuálne položky (odhlásený klient, zrušený dopyt, ponuka už nie je aktívna,
-- staršie ako 14 dní) sa uzavrú bez e-mailu.
create or replace function public._strazca_na_odoslanie(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; w weby; v_mk jsonb; v_ponuky jsonb;
begin
  if not pg_try_advisory_xact_lock(510057) then return v_out; end if;
  update web_strazca_fronta f set odoslane = now(), chyba = 'neaktuálne'
   where f.odoslane is null and (f.vytvorene < now() - interval '14 days'
     or exists (select 1 from web_strazcovia s where s.dopyt_id = f.dopyt_id and s.odhlaseny is not null)
     or not exists (select 1 from dopyty d where d.id = f.dopyt_id and d.stav = 'aktivny')
     or not exists (select 1 from nehnutelnosti n where n.id = f.nehnutelnost_id and n.stav = 'aktivne'));
  for r in select s.dopyt_id, s.web_id, s.makler_id, s.email, s.meno, s.token,
                  array_agg(f.id) as ids, array_agg(distinct f.nehnutelnost_id) as nids
           from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id
           where f.odoslane is null and f.vytvorene < now() - interval '10 minutes'
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
-- e-mail sa nepodaril: položky sa vrátia do fronty (najviac 3 pokusy), chyba sa zapíše
create or replace function public._strazca_chyba(p_dopyt bigint, p_ids bigint[], p_chyba text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update web_strazcovia set posledny_email = null, emailov = greatest(emailov - 1, 0) where dopyt_id = p_dopyt;
  update web_strazca_fronta set pokusy = pokusy + 1, chyba = left(coalesce(p_chyba, 'chyba'), 300),
         odoslane = case when pokusy + 1 >= 3 then now() end
   where id = any(p_ids);
end $$;
revoke execute on function public._strazca_na_odoslanie(int), public._strazca_chyba(bigint, bigint[], text) from public, anon, authenticated;
grant execute on function public._strazca_na_odoslanie(int), public._strazca_chyba(bigint, bigint[], text) to service_role;

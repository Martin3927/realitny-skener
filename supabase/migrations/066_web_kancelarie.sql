-- =====================================================================
-- 065: Web realitnej kancelárie (skladačka webu kancelárie, upravuje ho administrátor)
--  * web kancelárie je riadok v tabuľke weby s kancelaria = true (najviac jeden);
--    zdieľa adresu, doménu, verzie, štatistiky, strážcu ponúk a formuláre s webmi maklérov
--  * na webe sú aktívne ponuky všetkých maklérov, predané ponuky, tím a recenzie z Týpka aj z Google
--  * formuláre: kontakt, odhad ceny, výkup, kariéra, strážca ponúk, zavolať späť
--    → kontakt v zvončeku a v mobile vybraného makléra (kancelária, konkrétny maklér alebo po rade),
--      kupujúci sa zapíše ako dopyt v Klientoch, predávajúci s telefónom do Klienti → Predávajúci
--  * strážca ponúk z webu kancelárie dostáva nové ponuky všetkých maklérov
-- =====================================================================

alter table public.weby add column if not exists kancelaria boolean not null default false;
-- každý maklér má najviac jeden osobný web a kancelária najviac jeden web kancelárie
alter table public.weby drop constraint if exists weby_makler_id_key;
create unique index if not exists weby_makler_jeden on public.weby (makler_id) where not kancelaria;
create unique index if not exists weby_kancelaria_jeden on public.weby ((true)) where kancelaria;

alter table public.web_kontakty drop constraint if exists web_kontakty_zdroj_check;
alter table public.web_kontakty add constraint web_kontakty_zdroj_check
  check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt', 'podobna', 'vykup', 'kariera'));

-- osobný web makléra nikdy nie je web kancelárie
create or replace function public._web_maklera(p_makler uuid) returns weby
language plpgsql security definer set search_path = public as $$
declare w weby; v_zaklad text; v_adresa text; i int := 1;
begin
  select * into w from weby where makler_id = p_makler and not kancelaria;
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

-- ---------------------------------------------------------------- web kancelárie pre editor (len administrátor)
create or replace function public._web_kancelarie(p_vytvorit boolean default false) returns weby
language plpgsql security definer set search_path = public as $$
declare w weby; v_zaklad text; v_adresa text; i int := 1;
begin
  select * into w from weby where kancelaria;
  if found or not p_vytvorit then return w; end if;
  v_zaklad := left(nullif(_web_adresa(coalesce(nullif((select hodnota::jsonb->>'nazov' from nastavenia where kluc = 'vzhlad'), ''), 'alpha-reality')), ''), 40);
  if v_zaklad is null or length(v_zaklad) < 3 then v_zaklad := 'kancelaria'; end if;
  v_adresa := v_zaklad;
  while _adresa_obsadena(v_adresa, -1) loop
    i := i + 1; v_adresa := v_zaklad || '-' || i;
  end loop;
  insert into weby (makler_id, adresa, kancelaria) values (auth.uid(), v_adresa, true) returning * into w;
  return w;
end $$;

create or replace function public._over_admin_webu() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Web kancelárie upravuje administrátor.' using errcode = '42501'; end if;
end $$;

create or replace function public.web_kancelarie() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_admin_webu();
  w := _web_kancelarie(true);
  return jsonb_build_object('id', w.id, 'kancelaria', true, 'adresa', w.adresa, 'koncept', w.koncept, 'zverejnene_kedy', w.zverejnene_kedy,
    'domena', w.domena, 'domena_token', w.domena_token, 'domena_overena', w.domena_overena, 'domena_smeruje', w.domena_smeruje,
    'domena_kontrola', w.domena_kontrola, 'domena_ziadost', w.domena_ziadost, 'domena_pripojena', w.domena_pripojena,
    'upravene', w.upravene, 'zverejneny', w.zverejnene is not null,
    'zmeny_od_zverejnenia', w.zverejnene is null or w.zverejnene is distinct from w.koncept,
    'strazcovia', jsonb_build_object(
      'aktivni', (select count(*) from web_strazcovia s join dopyty d on d.id = s.dopyt_id where s.web_id = w.id and s.odhlaseny is null and s.potvrdeny is not null and d.stav = 'aktivny'),
      'nepotvrdeni', (select count(*) from web_strazcovia s where s.web_id = w.id and s.odhlaseny is null and s.potvrdeny is null and s.vytvorene > now() - interval '7 days'),
      'emaily_30', (select count(*) from web_strazca_fronta f join web_strazcovia s on s.dopyt_id = f.dopyt_id where s.web_id = w.id and f.odoslane > now() - interval '30 days' and f.chyba is null)),
    'verzie', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kedy', v.kedy, 'kto', (select meno from makleri where id = v.kto)) order by v.kedy desc)
                        from (select * from weby_verzie where web_id = w.id order by kedy desc limit 30) v), '[]'::jsonb));
end $$;

create or replace function public.ulozit_web_kancelarie(p_koncept jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_admin_webu();
  if jsonb_typeof(p_koncept) <> 'object' then raise exception 'Neplatné nastavenie webu.' using errcode = '22023'; end if;
  if octet_length(p_koncept::text) > 700000 then raise exception 'Nastavenie webu je príliš veľké. Obrázky nahrávajte ako súbory.' using errcode = '22023'; end if;
  w := _web_kancelarie(true);
  update weby set koncept = p_koncept, upravene = now() where id = w.id;
  return now();
end $$;

create or replace function public.zverejnit_web_kancelarie(p_koncept jsonb default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_admin_webu();
  if p_koncept is not null then perform ulozit_web_kancelarie(p_koncept); end if;
  w := _web_kancelarie(true);
  select * into w from weby where id = w.id for update;
  update weby set zverejnene = koncept, zverejnene_kedy = now() where id = w.id;
  insert into weby_verzie (web_id, obsah, kto) values (w.id, w.koncept, auth.uid());
  delete from weby_verzie where web_id = w.id and id not in (select id from weby_verzie where web_id = w.id order by kedy desc limit 30);
  return now();
end $$;

create or replace function public.zrusit_zverejnenie_webu_kancelarie() returns void
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_admin_webu();
  w := _web_kancelarie(false);
  if w.id is not null then update weby set zverejnene = null where id = w.id; end if;
end $$;

create or replace function public.zmenit_adresu_web_kancelarie(p_adresa text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby; v text := _web_adresa(p_adresa);
begin
  perform _over_admin_webu();
  w := _web_kancelarie(true);
  if v !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' then raise exception 'Adresa môže mať 3 až 50 znakov: malé písmená bez diakritiky, číslice a pomlčky.' using errcode = '22023'; end if;
  if v = w.adresa then return jsonb_build_object('adresa', w.adresa); end if;
  if _adresa_obsadena(v, w.id) then raise exception 'Adresa % je už obsadená. Skús inú.', v using errcode = '23505'; end if;
  perform _prepni_adresu(w.id, v);
  return jsonb_build_object('adresa', v);
end $$;

create or replace function public.ulozit_domenu_web_kancelarie(p_domena text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby; v text := nullif(lower(trim(regexp_replace(coalesce(p_domena, ''), '^(https?://)?(www\.)?|/.*$', '', 'g'))), '');
begin
  perform _over_admin_webu();
  w := _web_kancelarie(true);
  if v is not null and v !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'Neplatná doména. Napíš ju v tvare kancelaria.sk' using errcode = '22023'; end if;
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

-- výsledok kontroly domény: pri webe kancelárie správa „web kancelárie“
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
  if w.domena_overena is not null and w.domena_smeruje and w.domena_pripojena is null and w.domena_ziadost is null then
    select meno into v_meno from makleri where id = w.makler_id;
    update weby set domena_ziadost = now() where id = w.id;
    perform _oznam_adminom('Pripojiť doménu ' || w.domena || ' k hostingu – ' ||
      case when w.kancelaria then 'web kancelárie' else 'web makléra ' || coalesce(v_meno, '') end ||
      '. Vlastníctvo aj smerovanie sú overené. Postup nájdeš v časti Osobný web.');
  end if;
  return jsonb_build_object('ok', true, 'konflikt', v_konflikt, 'overena', w.domena_overena is not null, 'smeruje', w.domena_smeruje,
    'ziadost', w.domena_ziadost is not null or (w.domena_overena is not null and w.domena_smeruje), 'pripojena', w.domena_pripojena is not null);
end $$;

-- ---------------------------------------------------------------- verejný web
-- web kancelárie: ponuky všetkých aktívnych maklérov (bez dlhého popisu a fotky makléra pri každej ponuke), tím, recenzie
create or replace function public._verejny_web_kancelarie(w weby, v_obsah jsonb, v_nahlad boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'druh', 'kancelaria', 'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
    'web', v_obsah, 'nahlad', v_nahlad, 'zverejnene_kedy', w.zverejnene_kedy,
    'ponuky', coalesce((select jsonb_agg(((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id))
                                         order by (n.stav = 'aktivne') desc, n.exkluzivne desc, n.upravene desc)
                        from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
                        where n.stav in ('aktivne', 'rezervovane')), '[]'::jsonb),
    'predane', coalesce((select jsonb_agg(x order by x->>'upravene' desc) from (
                          select ((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id)) as x
                          from nehnutelnosti n join makleri m on m.id = n.makler_id
                          where n.stav = 'predane' and n.upravene > now() - interval '3 years'
                          order by n.upravene desc limit 36) t), '[]'::jsonb),
    'makleri', coalesce((select jsonb_agg(verejny_makler(m.id) || jsonb_build_object('admin', m.rola = 'admin', 'obce', to_jsonb(coalesce(m.obce, '{}')),
                           'web', (select jsonb_build_object('adresa', x.adresa, 'domena', case when x.domena_pripojena is not null then x.domena end)
                                   from weby x where x.makler_id = m.id and not x.kancelaria and x.zverejnene is not null))
                         order by m.meno) from makleri m where m.aktivny), '[]'::jsonb),
    'recenzie', verejne_recenzie(null),
    'google', (select hodnota::jsonb - 'place_id' from nastavenia where kluc = 'google_recenzie'),
    'kancelaria', vzhlad_kancelarie())
$$;

create or replace function public.verejny_web(p_adresa text, p_nahlad boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w weby; v_obsah jsonb;
begin
  w := _web_podla(p_adresa);
  if w.id is null then return null; end if;
  if p_nahlad and ja_aktivny() then v_obsah := w.koncept; else v_obsah := w.zverejnene; end if;
  if v_obsah is null then return null; end if;
  if w.kancelaria then return _verejny_web_kancelarie(w, v_obsah, p_nahlad and ja_aktivny()); end if;
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

-- komu pôjde kontakt z webu kancelárie: kancelária (administrátor, ktorý web založil), vybraný maklér alebo makléri po rade
create or replace function public._web_kancelarie_komu(w weby, p_zdroj text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_pravidlo text := coalesce(nullif(w.zverejnene->'smerovanie'->>p_zdroj, ''), nullif(w.zverejnene->'smerovanie'->>'predvolene', ''), 'kancelaria');
        v uuid;
begin
  if p_zdroj = 'kariera' then v_pravidlo := 'kancelaria'; end if;
  if v_pravidlo = 'rotacia' then
    select m.id into v from makleri m
    where m.aktivny and coalesce(w.zverejnene->'team'->(m.id::text)->>'on', 'true') <> 'false'
    order by (select max(k.vytvorene) from web_kontakty k where k.web_id = w.id and k.makler_id = m.id) asc nulls first, m.meno
    limit 1;
  elsif v_pravidlo ~ '^[0-9a-f-]{36}$' then
    select m.id into v from makleri m where m.id = v_pravidlo::uuid and m.aktivny;
  end if;
  if v is null then select m.id into v from makleri m where m.id = w.makler_id and m.aktivny; end if;
  if v is null then select m.id into v from makleri m where m.rola = 'admin' and m.aktivny order by m.vytvorene limit 1; end if;
  return v;
end $$;

-- kontakt z formulára na webe (osobný web makléra aj web kancelárie)
drop function if exists public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb);
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
  v_ciel uuid; v_kanc boolean; v_ucel text;
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
      where n.id = p_ponuka and n.stav in ('aktivne', 'rezervovane', 'predane');
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

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (w.id, v_ciel, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (v_ciel, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || case when v_kanc then ' (web kancelárie)' else '' end || ': ' ||
          coalesce(v_meno || ', ', '') || v_kontakt || case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka, v_id);

  if p_zdroj = 'ebook' then return coalesce(nullif(w.zverejnene->'dl'->>'url', ''), 'ok'); end if;
  return 'ok';
end $$;

-- strážca z webu kancelárie dostáva nové a zlacnené ponuky všetkých maklérov
create or replace function public._strazca_web_ponuka() returns trigger
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  if new.stav <> 'aktivne' or new.makler_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and not (new.cena < old.cena) then return new; end if;
  for d in select dp.* from dopyty dp join web_strazcovia s on s.dopyt_id = dp.id
           where (s.makler_id = new.makler_id or exists (select 1 from weby x where x.id = s.web_id and x.kancelaria))
             and s.odhlaseny is null and s.potvrdeny is not null and dp.stav = 'aktivny' loop
    if _sedi_ponuka(d, new) then
      insert into web_strazca_fronta (dopyt_id, nehnutelnost_id, cena) values (d.id, new.id, new.cena) on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

-- mapa stránok pre Google: aj web kancelárie (jeho podstránky a články ukladá editor do zverejnenej verzie)
create or replace function public.verejne_weby_mapa() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'kancelaria', w.kancelaria,
      'upravene', greatest(w.zverejnene_kedy, (select max(n.upravene) from nehnutelnosti n where (w.kancelaria or n.makler_id = w.makler_id) and n.stav in ('aktivne', 'rezervovane'))),
      'ponuky', case when w.kancelaria then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'upravene', n.upravene)) from nehnutelnosti n
                          where n.makler_id = w.makler_id and n.stav in ('aktivne', 'rezervovane')), '[]'::jsonb) end,
      'stranky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_stranky') = 'array' then w.zverejnene->'_stranky' else '[]'::jsonb end,
      'clanky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_clanky') = 'array' then w.zverejnene->'_clanky' else '[]'::jsonb end)), '[]'::jsonb)
  from weby w left join makleri m on m.id = w.makler_id
  where w.zverejnene is not null and (w.kancelaria or m.aktivny);
$$;

-- Google recenzie kancelárie (načítava a raz denne obnovuje funkcia google-recenzie; tu len pre verejný web)
-- nastavenia.kluc = 'google_recenzie': {"place_id","nazov","url","hodnotenie","pocet","recenzie":[…],"kedy"}

-- ---------------------------------------------------------------- práva
revoke execute on function public._web_kancelarie(boolean), public._over_admin_webu(), public._verejny_web_kancelarie(weby, jsonb, boolean),
  public._web_kancelarie_komu(weby, text) from public, anon, authenticated;
revoke execute on function public.web_kancelarie(), public.ulozit_web_kancelarie(jsonb), public.zverejnit_web_kancelarie(jsonb),
  public.zrusit_zverejnenie_webu_kancelarie(), public.zmenit_adresu_web_kancelarie(text), public.ulozit_domenu_web_kancelarie(text) from public, anon;
grant execute on function public.web_kancelarie(), public.ulozit_web_kancelarie(jsonb), public.zverejnit_web_kancelarie(jsonb),
  public.zrusit_zverejnenie_webu_kancelarie(), public.zmenit_adresu_web_kancelarie(text), public.ulozit_domenu_web_kancelarie(text) to authenticated;
revoke execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb, uuid) from public;
grant execute on function public.web_kontakt(text, text, text, text, text, bigint, jsonb, jsonb, uuid) to anon, authenticated;
revoke execute on function public.verejny_web(text, boolean), public.verejne_weby_mapa() from public;
grant execute on function public.verejny_web(text, boolean), public.verejne_weby_mapa() to anon, authenticated;
revoke execute on function public._zapis_kontrolu_domeny(bigint, text, boolean, boolean), public._web_maklera(uuid) from public, anon, authenticated;

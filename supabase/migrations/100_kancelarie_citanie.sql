-- =====================================================================
-- Oddelenie kancelárií – 2. krok, časť b: čítanie a rozosielanie len v kancelárii
--  * nastavenia kancelárie (vzhľad, údaje, karta ponuky, odkaz pre tím, odhlásenie, Google recenzie, export na portály,
--    sociálne siete…) má každá kancelária vlastné – tabuľka nastavenia_kancelarie; v nastavenia ostávajú len kľúče Týpka
--  * zoznamy, štatistiky a funkcie podľa id vracajú len údaje aktívnej kancelárie
--  * upozornenia, e-maily a správy idú len maklérom tej istej kancelárie
--  * úložisko súborov: priečinky podľa kancelárie
-- =====================================================================

-- ---------------------------------------------------------------- nastavenia kancelárie
create table if not exists public.nastavenia_kancelarie (
  kancelaria_id bigint not null references public.kancelarie(id) on delete cascade,
  kluc text not null,
  hodnota text,
  primary key (kancelaria_id, kluc)
);
alter table public.nastavenia_kancelarie enable row level security;
revoke all on public.nastavenia_kancelarie from public, anon, authenticated;
grant all on public.nastavenia_kancelarie to service_role;

-- doterajšie nastavenia patria Alpha Reality (kancelária 1); v nastavenia ostanú len kľúče Týpka
-- (odtlačky kľúčov skenera a pripomienok, vapid, soľ odtlačkov, značka mesačného prehľadu…)
insert into public.nastavenia_kancelarie (kancelaria_id, kluc, hodnota)
select 1, kluc, hodnota from public.nastavenia
where kluc in ('vzhlad', 'karta_ponuky', 'kancelaria', 'cas_rebricek_vsetci', 'novinky_okno', 'odhlasenie_min', 'odhlasenie_mobil_min',
               'odkaz_autor', 'odkaz_text', 'odkaz_zapnuty', 'google_recenzie', 'uc_token', 'make_siete_webhook', 'web_prehlad_mesiac')
on conflict (kancelaria_id, kluc) do nothing;
delete from public.nastavenia
where kluc in ('vzhlad', 'karta_ponuky', 'kancelaria', 'cas_rebricek_vsetci', 'novinky_okno', 'odhlasenie_min', 'odhlasenie_mobil_min',
               'odkaz_autor', 'odkaz_text', 'odkaz_zapnuty', 'google_recenzie', 'uc_token', 'make_siete_webhook', 'web_prehlad_mesiac');

-- hodnota nastavenia kancelárie (bez p_kancelaria = aktívna kancelária prihláseného; bez prihlásenia treba kanceláriu zadať)
create or replace function public._nk(p_kluc text, p_kancelaria bigint default null)
returns text language sql stable security definer set search_path = public as $$
  select hodnota from nastavenia_kancelarie where kancelaria_id = coalesce(p_kancelaria, aktivna_kancelaria()) and kluc = p_kluc
$$;
create or replace function public._nk_ulozit(p_kluc text, p_hodnota text, p_kancelaria bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare k bigint := coalesce(p_kancelaria, aktivna_kancelaria());
begin
  if k is null then raise exception 'Chýba kancelária.'; end if;
  insert into nastavenia_kancelarie (kancelaria_id, kluc, hodnota) values (k, p_kluc, p_hodnota)
  on conflict (kancelaria_id, kluc) do update set hodnota = excluded.hodnota;
end $$;
revoke execute on function public._nk(text, bigint), public._nk_ulozit(text, text, bigint) from public, anon, authenticated;
grant execute on function public._nk(text, bigint), public._nk_ulozit(text, text, bigint) to service_role;

-- nastavenia aplikácie, vzhľad, karta ponuky, údaje kancelárie, odkaz pre tím, odhlásenie, export na portály – v kancelárii
CREATE OR REPLACE FUNCTION public.nastavenia_aplikacie()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pc int := coalesce((_nk('odhlasenie_min')::int), 60);
begin
  perform _over_aktivny();
  return jsonb_build_object(
    'odhlasenie_min', v_pc,
    'odhlasenie_mobil_min', coalesce((_nk('odhlasenie_mobil_min')::int), v_pc),
    'odkaz_text', coalesce((_nk('odkaz_text')), ''),
    'odkaz_zapnuty', coalesce((_nk('odkaz_zapnuty') = '1'), false),
    'odkaz_autor', (_nk('odkaz_autor')),
    'novinky_okno', coalesce((_nk('novinky_okno') = '1'), true));
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_cas_rebricek(p_vsetci boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  perform _nk_ulozit('cas_rebricek_vsetci', (case when p_vsetci then '1' else '0' end)::text);
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_farby_karty(p_farby jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform _over_admin();
  v := coalesce((_nk('karta_ponuky')::jsonb), '{}'::jsonb)
       || jsonb_build_object('farby', _farby_karty(p_farby), 'upravil', auth.uid(), 'upravene', now());
  perform _nk_ulozit('karta_ponuky', (v::text)::text);
  return v - 'upravil';
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_farby_timu(p_schema text, p_farba text, p_prepisat boolean DEFAULT false, p_styl text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_farba text := nullif(p_farba, '');
  v_styl text := nullif(p_styl, '');
  v jsonb;
  n int := 0;
begin
  perform _over_admin();
  perform _over_farby(p_schema, v_farba);
  if v_styl is not null and v_styl not in ('klasicky', 'editor') then raise exception 'Neznámy štýl aplikácie.'; end if;
  v := coalesce((_nk('vzhlad')::jsonb), '{}'::jsonb)
    || jsonb_build_object('schema', p_schema, 'farba', case when p_schema = 'vlastna' then v_farba end, 'upravil', auth.uid(), 'upravene', now());
  if v_styl is not null then v := v || jsonb_build_object('styl', v_styl); end if;
  perform _nk_ulozit('vzhlad', (v::text)::text);
  if p_prepisat then
    update makleri set farby = null where id <> auth.uid() and farby is not null;
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('vzhlad', v - 'upravil', 'prepisane', n);
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_novinky_okno(p_zapnute boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  perform _nk_ulozit('novinky_okno', (case when coalesce(p_zapnute, true) then '1' else '0' end)::text);
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_odhlasenie(p_min integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  if p_min is null or p_min < 0 or p_min > 1440 then raise exception 'Zadajte 0 až 1440 minút.'; end if;
  perform _nk_ulozit('odhlasenie_min', (p_min::text)::text);
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_odhlasenie_mobil(p_min integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  if p_min is null or p_min < 0 or p_min > 43200 then raise exception 'Zadajte 0 až 43200 minút (30 dní).'; end if;
  perform _nk_ulozit('odhlasenie_mobil_min', (p_min::text)::text);
end $function$;

CREATE OR REPLACE FUNCTION public.nastavit_odkaz(p_text text, p_zapnuty boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  if length(coalesce(p_text, '')) > 300 then raise exception 'Odkaz je príliš dlhý (max. 300 znakov).'; end if;
  perform _nk_ulozit('odkaz_text', (trim(coalesce(p_text, '')))::text);
  perform _nk_ulozit('odkaz_zapnuty', (case when p_zapnuty then '1' else '0' end)::text);
  perform _nk_ulozit('odkaz_autor', (auth.uid()::text)::text);
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_kartu_ponuky(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bloky jsonb; v_m jsonb := case when jsonb_typeof(p->'moznosti') = 'object' then p->'moznosti' else '{}'::jsonb end;
  v_urok numeric; v jsonb;
  POVOLENE constant text[] := array['galeria', 'zaklad', 'media', 'popis', 'parametre', 'vybavenie', 'mapa', 'hypoteka', 'makler', 'zaujem'];
begin
  perform _over_admin();
  if jsonb_typeof(p->'bloky') is distinct from 'array' or jsonb_array_length(p->'bloky') > 30 then
    raise exception 'Neplatné poradie častí karty.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'stlpec', stlpec, 'zap', zap) order by ord), '[]'::jsonb) into v_bloky
  from (select distinct on (b->>'id') b->>'id' as id,
               case when b->>'stlpec' = 'bok' then 'bok' else 'hlavny' end as stlpec,
               case when b->>'id' = 'zaklad' then true else coalesce(b->>'zap', 'true') <> 'false' end as zap,
               ord
        from jsonb_array_elements(p->'bloky') with ordinality as t(b, ord)
        where jsonb_typeof(b) = 'object' and b->>'id' = any(POVOLENE)
        order by b->>'id', ord) x;
  v_urok := case when (v_m->>'urok') ~ '^\d{1,2}(\.\d{1,2})?$' then (v_m->>'urok')::numeric end;
  v := jsonb_build_object('bloky', v_bloky,
    'moznosti', jsonb_build_object(
      'termin', coalesce(v_m->>'termin', 'true') <> 'false',
      'dalsie', coalesce(v_m->>'dalsie', 'true') <> 'false',
      'zdielat', coalesce(v_m->>'zdielat', 'true') <> 'false',
      'urok', least(10, greatest(0.5, coalesce(v_urok, 3.9)))),
    'farby', _farby_karty(p->'farby'),
    'upravil', auth.uid(), 'upravene', now());
  perform _nk_ulozit('karta_ponuky', (v::text)::text);
  return v - 'upravil';
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_vzhlad(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v := v || jsonb_strip_nulls(jsonb_build_object('styl', (_nk('vzhlad')::jsonb->>'styl')));
  perform _nk_ulozit('vzhlad', (v::text)::text);
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.kancelaria_udaje()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_aktivny();
  return coalesce((_nk('kancelaria')::jsonb), '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_kancelariu(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform _over_admin();
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte názov kancelárie.'; end if;
  if length(regexp_replace(coalesce(p->>'telefon', ''), '\D', '', 'g')) < 5 then raise exception 'Zadajte telefón kancelárie.'; end if;
  if coalesce(p->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Zadajte platný email kancelárie.'; end if;
  v := jsonb_build_object('nazov', trim(p->>'nazov'), 'telefon', trim(p->>'telefon'), 'email', lower(trim(p->>'email')),
    'mesto', trim(coalesce(p->>'mesto', '')), 'psc', trim(coalesce(p->>'psc', '')), 'ulica', trim(coalesce(p->>'ulica', '')),
    'cislo', trim(coalesce(p->>'cislo', '')), 'kontakt', nullif(trim(coalesce(p->>'kontakt', '')), ''), 'ico', nullif(trim(coalesce(p->>'ico', '')), ''));
  perform _nk_ulozit('kancelaria', (v::text)::text);
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.uc_feed_odkaz(p_novy boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v text;
begin
  perform _over_admin();
  v := _nk('uc_token');
  if v is null or p_novy then
    v := encode(gen_random_bytes(20), 'hex');
    perform _nk_ulozit('uc_token', (v)::text);
  end if;
  return v;
end $function$;


CREATE OR REPLACE FUNCTION public.skener_novy_kluc()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v text := encode(gen_random_bytes(24), 'hex');
begin
  perform _over_admin();
  if not je_hlavny_spravca() then raise exception 'Kľúč skenera mení len hlavný správca Týpka.' using errcode = '42501'; end if;
  insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(digest(v, 'sha256'), 'hex'))
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  insert into nastavenia (kluc, hodnota) values ('skener_kluc_zmeneny', now()::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.skener_kluc_zmeneny()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when ja_admin() and je_hlavny_spravca() then (select hodnota::timestamptz from nastavenia where kluc = 'skener_kluc_zmeneny') end;
$function$;

-- ---------------------------------------------------------------- značka kancelárie (doteraz text 'alpha' pre všetkých)
-- portál, číslovanie ponúk, zhody dopytov a report majiteľa porovnávajú textový stĺpec kancelaria – odteraz ho
-- spúšťač nastaví podľa kancelaria_id, takže porovnania sú v rámci kancelárie
alter table public.kancelarie add column if not exists slug text;
update public.kancelarie set slug = 'alpha' where id = 1 and slug is null;
update public.kancelarie set slug = 'k' || id where slug is null;
alter table public.kancelarie alter column slug set not null;
-- nová kancelária bez značky dostane k<id>
create or replace function public._kancelaria_nova_slug()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.slug), '') = '' then new.slug := 'k' || new.id; end if;
  return new;
end $$;
revoke execute on function public._kancelaria_nova_slug() from public, anon, authenticated;
drop trigger if exists kancelaria_nova_slug on public.kancelarie;
create trigger kancelaria_nova_slug before insert on public.kancelarie for each row execute function public._kancelaria_nova_slug();
do $$ begin
  alter table public.kancelarie add constraint kancelarie_slug_key unique (slug);
exception when duplicate_object or duplicate_table then null; end $$;
create or replace function public._kancelaria_slug()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kancelaria_id is not null then
    new.kancelaria := coalesce((select slug from kancelarie where id = new.kancelaria_id), new.kancelaria);
  end if;
  return new;
end $$;
revoke execute on function public._kancelaria_slug() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['nehnutelnosti', 'dopyty', 'recenzie'] loop
    execute format('drop trigger if exists nastav_kancelariu_slug on public.%I', t);
    -- meno za nastav_kancelariu (spúšťače idú podľa abecedy) a pred zz_straz_kancelariu
    execute format('create trigger nastav_kancelariu_slug before insert or update of kancelaria_id, kancelaria on public.%I
                    for each row execute function public._kancelaria_slug()', t);
  end loop;
end $$;

-- štatistiky ponúk len maklérov kancelárie
CREATE OR REPLACE FUNCTION public.statistiky_ponuk(p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  return coalesce((select jsonb_agg(r order by r.meno) from (
    select m.id, m.meno, m.aktivny,
      count(*) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'predaj') as aktivne_predaj,
      count(*) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'prenajom') as aktivne_prenajom,
      count(*) filter (where n.stav = 'rezervovane') as rezervovane,
      count(*) filter (where n.vytvorene >= p_od and n.vytvorene < p_do and n.stav <> 'koncept') as nove,
      count(*) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do and n.transakcia = 'predaj') as predane,
      count(*) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do and n.transakcia = 'prenajom') as prenajate,
      coalesce(sum(_odmena_rk(i, n)) filter (where n.stav = 'predane' and n.upravene >= p_od and n.upravene < p_do), 0) as odmena_rk,
      coalesce(sum(_odmena_rk(i, n)) filter (where n.stav in ('aktivne', 'rezervovane')), 0) as odmena_potencial,
      coalesce(sum(n.cena) filter (where n.stav in ('aktivne', 'rezervovane') and n.transakcia = 'predaj'), 0) as objem_ponuky,
      (select count(*) from obhliadky o where o.makler_id = m.id and o.zrusena is null and o.cas >= p_od and o.cas < p_do) as obhliadky,
      (select round(avg(hodnotenie)::numeric, 1) from recenzie x where x.makler_id = m.id and x.stav = 'schvalena') as hodnotenie
    from makleri m
    left join nehnutelnosti n on n.makler_id = m.id and n.kancelaria_id = m.kancelaria_id
    left join nehnutelnosti_interne i on i.nehnutelnost_id = n.id
    where m.kancelaria_id = aktivna_kancelaria()
    group by m.id, m.meno, m.aktivny) r), '[]'::jsonb);
end $function$;

-- výkon maklérov za obdobie – len kancelária (prihlásený: aktívna kancelária; plánovač zadá kanceláriu)
drop function if exists public._vykon(timestamptz, timestamptz);
create or replace function public._vykon(p_od timestamptz, p_do timestamptz, p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  with k as (select coalesce(p_kancelaria, aktivna_kancelaria(), 1) as id)
  select jsonb_build_object(
    'od', p_od, 'do', p_do,
    'nove_sukromne', (select count(*) from inzeraty i left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = (select id from k)
                      where i.prvy_krat >= p_od and i.prvy_krat < p_do and i.duplikat_z is null
                        and i.okres = any(coalesce((select okresy from kancelarie where id = (select id from k)), '{}'))
                        and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'),
    'makleri', coalesce((
      select jsonb_agg(r order by r->>'meno') from (
        select jsonb_build_object(
          'id', m.id, 'meno', coalesce(nullif(m.meno, ''), m.email), 'aktivny', m.aktivny, 'rola', m.rola,
          'prevzate', count(a.id) filter (where a.typ = 'prevzatie'),
          'hovory', count(a.id) filter (where a.typ = 'hovor'),
          'sms', count(a.id) filter (where a.typ = 'sms'),
          'emaily', count(a.id) filter (where a.typ = 'email'),
          'uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and coalesce(a.poznamka, '') not like 'automaticky%'),
          'auto_uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and a.poznamka like 'automaticky%'),
          'vysledky', coalesce((select jsonb_object_agg(v.vysledok, v.n) from (
                         select coalesce(vysledok, 'Iné') vysledok, count(*) n from aktivity
                         where makler_id = m.id and kancelaria_id = (select id from k) and typ = 'hovor' and vytvorene >= p_od and vytvorene < p_do
                         group by 1) v), '{}'::jsonb),
          'schrankovanie', (select count(*) from schrankovanie s
                            where s.vytvoril = m.id and s.kancelaria_id = (select id from k) and s.vytvorene >= p_od and s.vytvorene < p_do),
          'drzi', (select count(*) from prevzatia p where p.makler_id = m.id and p.kancelaria_id = (select id from k)),
          'posledna', max(a.vytvorene)
        ) r
        from makleri m
        left join aktivity a on a.makler_id = m.id and a.kancelaria_id = (select id from k) and a.vytvorene >= p_od and a.vytvorene < p_do
        where m.kancelaria_id = (select id from k)
        group by m.id
      ) x), '[]'::jsonb)
  )
$$;
revoke execute on function public._vykon(timestamptz, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public._vykon(timestamptz, timestamptz, bigint) to service_role;

drop function if exists public._vykon_minuly_tyzden();
create or replace function public._vykon_minuly_tyzden(p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  select _vykon(d - interval '7 days', d, coalesce(p_kancelaria, 1))
  from (select date_trunc('week', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava' as d) t
$$;
revoke execute on function public._vykon_minuly_tyzden(bigint) from public, anon, authenticated;
grant execute on function public._vykon_minuly_tyzden(bigint) to service_role;

CREATE OR REPLACE FUNCTION public.vykon_maklerov(p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  return _vykon(p_od, p_do, aktivna_kancelaria()) || jsonb_build_object('dni', coalesce((
    select jsonb_agg(jsonb_build_object('den', den, 'hovory', h, 'sms', s, 'emaily', e) order by den) from (
      select (vytvorene at time zone 'Europe/Bratislava')::date den,
        count(*) filter (where typ = 'hovor') h, count(*) filter (where typ = 'sms') s, count(*) filter (where typ = 'email') e
      from aktivity where kancelaria_id = aktivna_kancelaria() and vytvorene >= p_od and vytvorene < p_do group by 1) d), '[]'::jsonb));
end $function$;

-- čas v aplikácii – len kolegovia z kancelárie, nastavenie rebríčka v kancelárii
CREATE OR REPLACE FUNCTION public.cas_v_typkovi(p_od date DEFAULT NULL::date, p_do date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin boolean;
  v_vsetci boolean := coalesce((_nk('cas_rebricek_vsetci') = '1'), true);
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_do date := least(coalesce(p_do, v_dnes), v_dnes);
  v_od date := coalesce(p_od, (select min(den) from cas_v_aplikacii where kancelaria_id = aktivna_kancelaria()), v_do);
begin
  perform _over_aktivny();
  v_admin := ja_admin();
  if v_od > v_do then v_od := v_do; end if;
  return jsonb_build_object(
    'od', v_od, 'do', v_do, 'vsetci', v_vsetci, 'zaciatok', (select min(den) from cas_v_aplikacii where kancelaria_id = aktivna_kancelaria()),
    'makleri', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sekundy', coalesce((select sum(c.sekundy) from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do), 0),
        'dni', (select count(distinct c.den) from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do),
        'sekcie', coalesce((select jsonb_object_agg(x.sekcia, x.s) from (
            select c.sekcia, sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.sekcia) x), '{}'::jsonb),
        'hodiny', coalesce((select jsonb_object_agg(x.hodina::text, x.s) from (
            select c.hodina, sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.hodina) x), '{}'::jsonb),
        'najdlhsi_den', (select max(x.s) from (
            select sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.den) x)
      ))
      from makleri m
      where m.aktivny and m.kancelaria_id = aktivna_kancelaria() and (v_admin or v_vsetci or m.id = auth.uid())
    ), '[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.prihlasenia_maklerov()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  perform _over_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'prihlaseny', u.last_sign_in_at, 'aktivny', m.naposledy_aktivny))
    from makleri m left join auth.users u on u.id = m.id where m.kancelaria_id = aktivna_kancelaria()), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.weby_ziadosti()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Len pre administrátora.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('web_id', w.id, 'makler_id', w.makler_id, 'kancelaria', w.kancelaria,
      'meno', case when w.kancelaria then 'Web kancelárie' else m.meno end, 'adresa', w.adresa,
      'adresa_navrh', w.adresa_navrh, 'adresa_navrh_kedy', w.adresa_navrh_kedy, 'domena', w.domena, 'domena_overena', w.domena_overena,
      'domena_smeruje', w.domena_smeruje, 'domena_kontrola', w.domena_kontrola, 'domena_ziadost', w.domena_ziadost, 'domena_pripojena', w.domena_pripojena)
      order by coalesce(w.adresa_navrh_kedy, w.domena_ziadost, w.domena_pripojena) desc nulls last)
    from weby w join makleri m on m.id = w.makler_id
    where w.kancelaria_id = aktivna_kancelaria() and (w.adresa_navrh is not null or w.domena_ziadost is not null or w.domena_pripojena is not null)), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.portal_statistika()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not ja_aktivny() then raise exception 'Prístup zamietnutý.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ponuky', coalesce((select jsonb_object_agg(id::text, jsonb_build_object('z', z, 'z7', z7, 'd', d, 'd30', d30)) from (
        select coalesce(a.id, b.id) id, coalesce(a.z, 0) z, coalesce(a.z7, 0) z7, coalesce(b.d, 0) d, coalesce(b.d30, 0) d30
        from (select nehnutelnost_id id, sum(portal) z, sum(portal) filter (where den > current_date - 7) z7
              from zobrazenia_ponuk where portal > 0 and kancelaria_id = aktivna_kancelaria() group by nehnutelnost_id) a
        full join (select nehnutelnost_id id, count(*) d, count(*) filter (where vytvorene > now() - interval '30 days') d30
                   from web_kontakty where portal and nehnutelnost_id is not null and kancelaria_id = aktivna_kancelaria() group by nehnutelnost_id) b on b.id = a.id) x), '{}'::jsonb),
    'ja', jsonb_build_object(
      'z30', coalesce((select sum(z.portal) from zobrazenia_ponuk z join nehnutelnosti n on n.id = z.nehnutelnost_id
                       where n.makler_id = auth.uid() and z.den > current_date - 30), 0),
      'd30', (select count(*) from web_kontakty where portal and makler_id = auth.uid() and nehnutelnost_id is not null and vytvorene > now() - interval '30 days'),
      'predaj30', (select count(*) from web_kontakty where portal and makler_id = auth.uid() and zdroj in ('odhad', 'predaj') and vytvorene > now() - interval '30 days')));
end $function$;

CREATE OR REPLACE FUNCTION public.matterport_statistika(p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'makler_id', makler_id, 'rezervacie', rezervacie, 'hodiny', hodiny, 'predlzenia', predlzenia,
             'zrusene', zrusene, 'naposledy', naposledy) order by hodiny desc, zrusene desc)
    from (
      select r.makler_id,
             count(*) filter (where r.zrusene is null) as rezervacie,
             round(coalesce(sum(extract(epoch from r.koniec - r.zaciatok)) filter (where r.zrusene is null), 0) / 3600.0, 1) as hodiny,
             coalesce(sum(r.predlzenia) filter (where r.zrusene is null), 0) as predlzenia,
             count(*) filter (where r.zrusene is not null) as zrusene,
             max(r.zaciatok) filter (where r.zrusene is null) as naposledy
      from matterport_rezervacie r
      where r.kancelaria_id = aktivna_kancelaria() and r.zaciatok >= p_od and r.zaciatok < p_do
      group by r.makler_id
    ) x), '[]'::jsonb);
end $function$;

-- kalendár v mobile: zdieľané udalosti a obhliadky len z kancelárie makléra
CREATE OR REPLACE FUNCTION public._kalendar_feed(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      from udalosti u where u.zrusene is null and (u.makler_id = m.id or m.id = any(u.ucastnici) or (u.zdielane and u.kancelaria_id = m.kancelaria_id)) and u.zaciatok > now() - interval '60 days'), '[]'::jsonb),
    'obhliadky', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cas', o.cas, 'klient', o.klient_meno, 'telefon', o.klient_telefon,
        'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'miesto', concat_ws(', ', n.ulica, n.obec)))
      from obhliadky o join nehnutelnosti n on n.id = o.nehnutelnost_id
      where o.zrusena is null and o.cas > now() - interval '60 days' and o.kancelaria_id = m.kancelaria_id and (o.makler_id = m.id or n.makler_id = m.id)), '[]'::jsonb),
    'pripomienky', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'cas', p.cas, 'poznamka', p.poznamka, 'druh', p.druh))
      from pripomienky p where p.makler_id = m.id and p.zrusena is null and p.hotovo is null and p.druh in ('pripomienka', 'obhliadka')
        and p.cas > now() - interval '7 days'), '[]'::jsonb),
    'zmluvy', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'do', i.zmluva_do, 'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'majitel', i.majitel_meno))
      from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
      where i.zmluva and i.zmluva_do >= current_date - 7 and n.makler_id = m.id and n.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')), '[]'::jsonb));
end $function$;

-- tímový chat: upozornenie len kolegom z kancelárie
CREATE OR REPLACE FUNCTION public._push_tim_sprava()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.typ <> 'sprava' or new.makler_id is null or new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.aktivny and m.kancelaria_id = new.kancelaria_id and m.id <> new.makler_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ ' || _meno(new.makler_id) || ' · tímový chat', _chat_nahlad(new.text, new.prilohy), './#chat', 'typek-chat');
  return new;
exception when others then return new;
end $function$;

CREATE OR REPLACE FUNCTION public._push_sukromna_sprava()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.id = new.komu_id and m.kancelaria_id = new.kancelaria_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ Správa od: ' || _meno(new.od_id), _chat_nahlad(new.text, new.prilohy), './#chat/' || new.od_id, 'typek-dm-' || new.od_id);
  return new;
exception when others then return new;
end $function$;

-- súkromná správa len kolegovi z kancelárie
CREATE OR REPLACE FUNCTION public.poslat_sukromnu_spravu(p_komu uuid, p_text text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := trim(coalesce(p_text, '')); v_id bigint;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_komu is null or p_komu = auth.uid() then raise exception 'Vyberte kolegu, ktorému správu posielate.'; end if;
  if not exists (select 1 from makleri where id = p_komu and aktivny and kancelaria_id = aktivna_kancelaria() and (rola = 'admin' or 'chat' = any(pristup))) then
    raise exception 'Tento kolega nemá prístup k chatu.';
  end if;
  if v = '' then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into sukromne_spravy (od_id, komu_id, text) values (auth.uid(), p_komu, v) returning id into v_id;
  -- kto odpovedá, ten si prečítal
  update sukromne_spravy set precitane = now() where komu_id = auth.uid() and od_id = p_komu and precitane is null;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.poslat_sukromnu_spravu(p_komu uuid, p_text text, p_prilohy jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := trim(coalesce(p_text, '')); v_id bigint; v_pr jsonb;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_komu is null or p_komu = auth.uid() then raise exception 'Vyberte kolegu, ktorému správu posielate.'; end if;
  if not exists (select 1 from makleri where id = p_komu and aktivny and kancelaria_id = aktivna_kancelaria() and (rola = 'admin' or 'chat' = any(pristup))) then
    raise exception 'Tento kolega nemá prístup k chatu.';
  end if;
  v_pr := _chat_prilohy(p_prilohy, 'dm/' || auth.uid()::text || '/' || p_komu::text || '/');
  if v = '' and v_pr is null then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into sukromne_spravy (od_id, komu_id, text, prilohy) values (auth.uid(), p_komu, v, v_pr) returning id into v_id;
  update sukromne_spravy set precitane = now() where komu_id = auth.uid() and od_id = p_komu and precitane is null;
  return v_id;
end $function$;

-- nevybavený kontakt z webu: eskalácia len adminom kancelárie
CREATE OR REPLACE FUNCTION public._kontakty_cakajuce()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      select array_agg(id) into v_admini from makleri where aktivny and rola = 'admin' and id <> k.makler_id and kancelaria_id = k.kancelaria_id;
      if v_admini is not null then
        insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, kancelaria_id)
        select a, now(), left('Kontakt z webu pre ' || k.makler_meno || ' čaká na odpoveď viac ako 24 hodín. ' || v_txt, 500), 'pripomienka', k.nehn, k.kancelaria_id
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
end $function$;

-- kontakt z webu kancelárie dostane len maklér tej kancelárie
CREATE OR REPLACE FUNCTION public._web_kancelarie_komu(w weby, p_zdroj text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pravidlo text := coalesce(nullif(w.zverejnene->'smerovanie'->>p_zdroj, ''), nullif(w.zverejnene->'smerovanie'->>'predvolene', ''), 'kancelaria');
        v uuid;
begin
  if p_zdroj = 'kariera' then v_pravidlo := 'kancelaria'; end if;
  if v_pravidlo = 'rotacia' then
    select m.id into v from makleri m
    where m.aktivny and m.kancelaria_id = w.kancelaria_id and coalesce(w.zverejnene->'team'->(m.id::text)->>'on', 'true') <> 'false'
    order by (select max(k.vytvorene) from web_kontakty k where k.web_id = w.id and k.makler_id = m.id) asc nulls first, m.meno
    limit 1;
  elsif v_pravidlo ~ '^[0-9a-f-]{36}$' then
    select m.id into v from makleri m where m.id = v_pravidlo::uuid and m.aktivny and m.kancelaria_id = w.kancelaria_id;
  end if;
  if v is null then select m.id into v from makleri m where m.id = w.makler_id and m.aktivny; end if;
  if v is null then select m.id into v from makleri m where m.rola = 'admin' and m.aktivny and m.kancelaria_id = w.kancelaria_id order by m.vytvorene limit 1; end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text DEFAULT NULL::text, p_co text DEFAULT NULL::text, p_ponuka bigint DEFAULT NULL::bigint, p_dopyt jsonb DEFAULT NULL::jsonb, p_overenie jsonb DEFAULT NULL::jsonb, p_komu uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      where n.id = p_ponuka and n.stav in ('aktivne', 'rezervovane', 'predane') and n.web_kancelarie and n.kancelaria_id = w.kancelaria_id;
      if v_ciel is null then p_ponuka := null; end if;
    end if;
    if v_ciel is null and p_komu is not null and p_zdroj <> 'kariera'
       and exists (select 1 from makleri where id = p_komu and aktivny and kancelaria_id = w.kancelaria_id)
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
      on conflict (telefon, kancelaria_id) do update set
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
end $function$;

-- oznam adminom kancelárie (bez prihláseného makléra treba kanceláriu zadať)
drop function if exists public._oznam_adminom(text);
create or replace function public._oznam_adminom(p_text text, p_kancelaria bigint default null)
 returns void language sql security definer set search_path = public as $$
  insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id)
  select id, now(), left(p_text, 500), 'web', kancelaria_id from makleri
  where rola = 'admin' and aktivny and kancelaria_id = coalesce(p_kancelaria, aktivna_kancelaria(), 1);
$$;
revoke execute on function public._oznam_adminom(text, bigint) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.zmenit_adresu_webu(p_adresa text, p_makler uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform _oznam_adminom('Žiadosť o adresu webu: ' || coalesce(v_meno, 'maklér') || ' chce adresu ' || v || ' (teraz ' || w.adresa || '). Schváliš ju v časti Osobný web.', w.kancelaria_id);
  return jsonb_build_object('adresa', w.adresa, 'navrh', v);
end $function$;

CREATE OR REPLACE FUNCTION public._zapis_kontrolu_domeny(p_web bigint, p_domena text, p_txt boolean, p_smeruje boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- doménu k hostingu pripája prevádzkovateľ Týpka → hlavní správcovia (vo svojej kancelárii, s názvom kancelárie webu)
    insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id)
    select m.id, now(), left('Pripojiť doménu ' || w.domena || ' k hostingu – ' ||
      case when w.kancelaria then 'web kancelárie' else 'web makléra ' || coalesce(v_meno, '') end ||
      coalesce(' (' || (select nazov from kancelarie where id = w.kancelaria_id) || ')', '') ||
      '. Vlastníctvo aj smerovanie sú overené. Postup nájdeš v časti Osobný web.', 500), 'web', m.kancelaria_id
    from hlavni_spravcovia h join makleri m on m.id = h.user_id and m.aktivny;
  end if;
  return jsonb_build_object('ok', true, 'konflikt', v_konflikt, 'overena', w.domena_overena is not null, 'smeruje', w.domena_smeruje,
    'ziadost', w.domena_ziadost is not null or (w.domena_overena is not null and w.domena_smeruje), 'pripojena', w.domena_pripojena is not null);
end $function$;

-- upozornenia na poruchu skenera len prevádzkovateľovi Týpka
CREATE OR REPLACE FUNCTION public._odbery_adminov()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  from push_odbery s join makleri m on m.id = s.makler_id and m.aktivny and m.rola = 'admin'
  join hlavni_spravcovia h on h.user_id = m.id;
$function$;

-- oslavy do chatu kancelárie oslávenca
CREATE OR REPLACE FUNCTION public._oslavy_dnes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; m makleri; t text; dnes text := to_char(now() at time zone 'Europe/Bratislava', 'YYYY-MM-DD');
begin
  for r in select * from _oslavy_zoznam() loop
    select * into m from makleri where id = r.makler_id;
    t := case r.typ
      when 'narodeniny' then '🎂 Dnes má narodeniny ' || _osl(m) || '! Všetko najlepšie, veľa zdravia a úspešných obchodov 🎉'
      when 'meniny' then '🌷 Dnes má meniny ' || _osl(m) || ' – blahoželáme a prajeme krásny deň! 💐'
      else '🏆 ' || _osl(m) || ' je dnes s nami už ' || _roky(r.roky) || '. Ďakujeme, že si súčasťou tímu! 🙌' end;
    insert into spravy (makler_id, text, typ, kluc, kancelaria_id) values (null, t, 'oslava', r.typ || ':' || r.makler_id || ':' || dnes, m.kancelaria_id)
    on conflict do nothing;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.upozornit_na_zmluvy()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_komu uuid; v_n int := 0; v_dni int;
begin
  for r in
    select x.id, x.makler_id, x.kancelaria_id, x.nazov, x.typ, x.obec, i.zmluva_do, i.majitel_meno
    from nehnutelnosti_interne i join nehnutelnosti x on x.id = i.nehnutelnost_id
    where i.zmluva and i.zmluva_do is not null and x.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')
      and (i.zmluva_do - current_date) in (14, 3, 0)
  loop
    v_dni := r.zmluva_do - current_date;
    v_komu := coalesce((select id from makleri where id = r.makler_id and aktivny),
                       (select id from makleri where rola = 'admin' and aktivny and kancelaria_id = r.kancelaria_id order by vytvorene limit 1));
    if v_komu is null then continue; end if;
    if exists (select 1 from pripomienky where nehnutelnost_id = r.id and druh = 'zmluva' and vytvorene::date = current_date) then continue; end if;
    insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh, kancelaria_id)
    values (v_komu, r.id, now(),
            case when v_dni = 0 then 'Dnes končí zmluva: ' else 'Zmluva končí o ' || v_dni || ' dní (' || to_char(r.zmluva_do, 'DD.MM.YYYY') || '): ' end ||
            left(coalesce(nullif(r.nazov, ''), concat_ws(', ', r.typ, r.obec)), 90) ||
            coalesce(' · majiteľ ' || r.majitel_meno, '') || '. Dohodnite predĺženie.', 'zmluva', r.kancelaria_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public._zhoda_inzerat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d dopyty;
begin
  if not new.aktivny or new.duplikat_z is not null or coalesce(new.predajca_typ, '') = 'rk' then return new; end if;
  -- len dopyty kancelárií, ktoré majú okres inzerátu; RK podľa označenia kancelárie
  for d in select dp.* from dopyty dp join kancelarie k on k.id = dp.kancelaria_id and k.aktivna and new.okres = any(k.okresy)
           where dp.stav = 'aktivny' and dp.transakcia = 'predaj'
             and not exists (select 1 from oznacenia o where o.inzerat_id = new.id and o.kancelaria_id = dp.kancelaria_id and o.predajca_typ = 'rk') loop
    if _sedi_inzerat(d, new) and d.makler_id is not null
       and exists (select 1 from makleri where id = d.makler_id and aktivny) then
      insert into zhody_oznamene (dopyt_id, ciel) values (d.id, 'i:' || new.id) on conflict do nothing;
      if found then
        insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
        values (d.makler_id, new.id, now(),
                'Nový súkromný inzerát pre vášho klienta – ' || _popis_dopytu(d) || ': ' || left(new.nazov, 90) ||
                coalesce(' · ' || _eur(new.cena), ''), 'zhoda', d.kancelaria_id);
      end if;
    end if;
  end loop;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._strazca_web_ponuka()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d dopyty;
begin
  if new.stav <> 'aktivne' or new.makler_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.stav = 'aktivne' and not (new.cena < old.cena) then return new; end if;
  for d in select dp.* from dopyty dp join web_strazcovia s on s.dopyt_id = dp.id join weby x on x.id = s.web_id
           where (case when x.kancelaria then new.web_kancelarie and x.kancelaria_id = new.kancelaria_id else s.makler_id = new.makler_id end)
             and s.odhlaseny is null and s.potvrdeny is not null and dp.stav = 'aktivny' loop
    if _sedi_ponuka(d, new) then
      insert into web_strazca_fronta (dopyt_id, nehnutelnost_id, cena) values (d.id, new.id, new.cena) on conflict do nothing;
    end if;
  end loop;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._strazca_na_odoslanie(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                 where n.id = any(r.nids) and n.stav = 'aktivne' and n.kancelaria_id = w.kancelaria_id and (not w.kancelaria or n.web_kancelarie));
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
end $function$;

CREATE OR REPLACE FUNCTION public.pochvalit_vsetkych(p_text text, p_typ text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := trim(coalesce(p_text, '')); n int;
begin
  perform _over_admin();
  if p_typ not in ('tim', 'oznam') then raise exception 'Neznámy typ správy.'; end if;
  if v = '' then raise exception 'Napíšte text.'; end if;
  if length(v) > 800 then raise exception 'Text je príliš dlhý.'; end if;
  insert into pochvaly (komu, od, text, typ, kancelaria_id)
  select id, auth.uid(), v, p_typ, aktivna_kancelaria() from makleri where aktivny and id <> auth.uid() and kancelaria_id = aktivna_kancelaria();
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.obnovit_sprievodcu(p_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  perform _over_admin();
  update makleri set sprievodca_videny = null
   where aktivny and kancelaria_id = aktivna_kancelaria() and (case when p_id is null then id <> auth.uid() else id = p_id end);
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_udalost(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint := nullif(p->>'id', '')::bigint; u udalosti; v_z timestamptz; v_k timestamptz; v_uc uuid[];
begin
  perform _over_aktivny();
  v_z := nullif(p->>'zaciatok', '')::timestamptz; v_k := nullif(p->>'koniec', '')::timestamptz;
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte názov udalosti.'; end if;
  if v_z is null then raise exception 'Zadajte dátum a čas.'; end if;
  if v_k is not null and v_k < v_z then raise exception 'Koniec je skôr ako začiatok.'; end if;
  if v_id is not null then
    select * into u from udalosti where id = v_id and zrusene is null for update;
    if not found then raise exception 'Udalosť neexistuje.'; end if;
    if u.makler_id <> auth.uid() and not ja_admin() then raise exception 'Upraviť môže len autor alebo administrátor.'; end if;
  else
    insert into udalosti (makler_id, nazov, zaciatok) values (auth.uid(), trim(p->>'nazov'), v_z) returning id into v_id;
    select * into u from udalosti where id = v_id;
  end if;
  -- len aktívni kolegovia, bez autora
  select coalesce(array_agg(m.id), '{}') into v_uc from makleri m
  where m.aktivny and m.id <> u.makler_id and m.kancelaria_id = aktivna_kancelaria()
    and m.id::text in (select jsonb_array_elements_text(coalesce(p->'ucastnici', '[]'::jsonb)));
  update udalosti set nazov = left(trim(p->>'nazov'), 140), zaciatok = v_z, koniec = v_k,
    cely_den = coalesce((p->>'cely_den')::boolean, false), typ = coalesce(nullif(p->>'typ', ''), 'stretnutie'),
    miesto = nullif(trim(p->>'miesto'), ''), poznamka = nullif(trim(p->>'poznamka'), ''),
    nehnutelnost_id = (select n.id from nehnutelnosti n where n.id = nullif(p->>'nehnutelnost_id', '')::bigint and n.kancelaria_id = aktivna_kancelaria()), zdielane = coalesce((p->>'zdielane')::boolean, false),
    ucastnici = v_uc
  where id = v_id;
  perform _upozornenia_udalosti(v_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public._upozornenia_udalosti(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u udalosti; v_mena text; v_cas_txt text; v_text text; v_den date; v_vecer timestamptz; v_rano timestamptz; v_komu uuid;
begin
  update pripomienky set zrusena = now()
  where udalost_id = p_id and hotovo is null and zrusena is null and email_odoslany is null;
  select * into u from udalosti where id = p_id and zrusene is null;
  if not found then return; end if;
  select string_agg(split_part(trim(m.meno), ' ', 1), ', ' order by m.meno) into v_mena
  from makleri m where m.id = u.makler_id or m.id = any(u.ucastnici);
  v_den := (u.zaciatok at time zone 'Europe/Bratislava')::date;
  v_cas_txt := case when u.cely_den then 'celý deň' else to_char(u.zaciatok at time zone 'Europe/Bratislava', 'HH24:MI') end;
  v_text := u.nazov || coalesce(' · 📍 ' || u.miesto, '') || coalesce(' · 👥 ' || v_mena, '');
  v_vecer := ((v_den - 1) + time '18:00') at time zone 'Europe/Bratislava';
  v_rano := (v_den + time '07:00') at time zone 'Europe/Bratislava';
  if not u.cely_den and v_rano >= u.zaciatok then v_rano := u.zaciatok - interval '1 hour'; end if;
  for v_komu in
    select m.id from makleri m where m.aktivny and m.kancelaria_id = u.kancelaria_id and (m.id = u.makler_id or m.id = any(u.ucastnici))
  loop
    if v_vecer > now() then
      insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh, nehnutelnost_id, udalost_id, kancelaria_id)
      values (v_komu, u.makler_id, v_vecer, '📅 Zajtra ' || v_cas_txt || ' – ' || v_text, 'udalost', u.nehnutelnost_id, u.id, u.kancelaria_id);
    end if;
    if v_rano > now() then
      insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh, nehnutelnost_id, udalost_id, kancelaria_id)
      values (v_komu, u.makler_id, v_rano, '📅 Dnes ' || v_cas_txt || ' – ' || v_text, 'udalost', u.nehnutelnost_id, u.id, u.kancelaria_id);
    end if;
  end loop;
end $function$;

drop function if exists public._matterport_kolizia(timestamptz, timestamptz, bigint);
create or replace function public._matterport_kolizia(p_z timestamptz, p_k timestamptz, p_okrem bigint, p_kancelaria bigint default null)
 returns text language sql stable security definer set search_path = public as $$
  select _meno(r.makler_id) || ' (' || _matterport_cas(r.zaciatok, r.koniec) || ')'
  from matterport_rezervacie r
  where r.zrusene is null and r.zaciatok < p_k and r.koniec > p_z and r.id is distinct from p_okrem
    and r.kancelaria_id = coalesce(p_kancelaria, aktivna_kancelaria())
  order by r.zaciatok limit 1;
$$;
revoke execute on function public._matterport_kolizia(timestamptz, timestamptz, bigint, bigint) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rezervovat_matterport(p_zaciatok timestamp with time zone, p_poznamka text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_k timestamptz; v_kol text; v_id bigint; v_pozn text := nullif(trim(coalesce(p_poznamka, '')), '');
begin
  perform _over_matterport();
  if p_zaciatok is null then raise exception 'Vyberte dátum a čas.'; end if;
  if p_zaciatok < now() - interval '30 minutes' then raise exception 'Tento čas už uplynul – vyberte neskorší.'; end if;
  if p_zaciatok > now() + interval '1 year' then raise exception 'Rezervovať sa dá najviac rok dopredu.'; end if;
  v_k := p_zaciatok + interval '2 hours';
  perform pg_advisory_xact_lock(hashtext('matterport_rezervacie:' || aktivna_kancelaria()));
  v_kol := _matterport_kolizia(p_zaciatok, v_k, null);
  if v_kol is not null then raise exception 'Matterport má v tom čase rezervovaný %.', v_kol; end if;
  insert into matterport_rezervacie (makler_id, zaciatok, koniec, poznamka, kancelaria_id)
  values (auth.uid(), p_zaciatok, v_k, left(v_pozn, 300), aktivna_kancelaria()) returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.predlzit_matterport(p_id bigint)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r matterport_rezervacie; v_k timestamptz; v_kol text;
begin
  perform _over_matterport();
  perform pg_advisory_xact_lock(hashtext('matterport_rezervacie:' || aktivna_kancelaria()));
  select * into r from matterport_rezervacie where id = p_id and zrusene is null and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Rezervácia už neexistuje.'; end if;
  if r.makler_id <> auth.uid() and not ja_admin() then raise exception 'Predĺžiť môžete len svoju rezerváciu.'; end if;
  if r.koniec < now() then raise exception 'Rezervácia už skončila.'; end if;
  if r.predlzenia >= 2 then raise exception 'Rezervácia už bola predĺžená 2× – viac sa nedá.'; end if;
  v_k := r.koniec + interval '1 hour';
  v_kol := _matterport_kolizia(r.koniec, v_k, r.id);
  if v_kol is not null then raise exception 'Predĺžiť sa nedá – hneď potom má Matterport rezervovaný %.', v_kol; end if;
  update matterport_rezervacie set koniec = v_k, predlzenia = r.predlzenia + 1, predlzene = true, upravene = now() where id = r.id;
  return v_k;
end $function$;

alter table public.sidliska drop constraint if exists sidliska_mesto_nazov_key;
create unique index if not exists sidliska_kancelaria_mesto_nazov on public.sidliska (kancelaria_id, mesto, nazov);

CREATE OR REPLACE FUNCTION public.ulozit_sidlisko(p_id bigint, p_mesto text, p_nazov text, p_aktivne boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  perform _over_admin();
  if coalesce(trim(p_mesto), '') = '' or coalesce(trim(p_nazov), '') = '' then raise exception 'Zadajte obec aj názov sídliska.'; end if;
  if p_id is null then
    insert into sidliska (mesto, nazov, poradie, kancelaria_id)
    values (trim(p_mesto), trim(p_nazov), coalesce((select max(poradie) + 1 from sidliska where mesto = trim(p_mesto) and kancelaria_id = aktivna_kancelaria()), 1), aktivna_kancelaria())
    returning id into v_id;
    return v_id;
  end if;
  update sidliska set mesto = trim(p_mesto), nazov = trim(p_nazov), aktivne = coalesce(p_aktivne, aktivne) where id = p_id;
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.rezervovat_sidlisko(p_sidlisko bigint, p_polovica text, p_datum date, p_poznamka text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; k schrankovanie_akcie; v_do timestamptz; v_admin boolean := ja_admin();
begin
  perform _over_aktivny();
  if not exists (select 1 from sidliska where id = p_sidlisko and aktivne and kancelaria_id = aktivna_kancelaria()) then raise exception 'Sídlisko neexistuje.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  perform pg_advisory_xact_lock(hashtext('sch-makler:' || auth.uid()));
  select * into k from schrankovanie_akcie a
  where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a)
  order by a.rezervovane desc limit 1;
  if found then
    if k.datum is null then
      raise exception 'Už rezervované: % (od %).', coalesce(_meno(k.makler_id), 'iný maklér'), to_char(k.rezervovane, 'DD.MM.YYYY');
    end if;
    raise exception 'Obsadené: % % %, voľné bude od %.', coalesce(_meno(k.makler_id), 'iný maklér'),
      case when (select pohlavie from makleri where id = k.makler_id) = 'zena' then 'schránkovala' else 'schránkoval' end,
      to_char(k.datum, 'DD.MM.YYYY'), to_char(k.datum + interval '2 months', 'DD.MM.YYYY');
  end if;
  if not v_admin then
    select max(_blokacia_do(a)) into v_do from schrankovanie_akcie a
    where a.sidlisko_id = p_sidlisko and a.makler_id = auth.uid();
    if v_do is not null then
      raise exception 'Toto sídlisko ste nestihli vyschránkovať. Znova si ho môžete rezervovať od %. Pre ostatných maklérov je voľné.',
        to_char(v_do at time zone 'Europe/Bratislava', 'DD.MM.YYYY');
    end if;
    select * into k from schrankovanie_akcie a
    where a.makler_id = auth.uid() and a.rezervovane >= _zaciatok_tyzdna() and _akcia_pocita(a)
    order by a.rezervovane desc limit 1;
    if found then
      raise exception 'Tento týždeň už máte rezervované sídlisko %. Ďalšie si môžete rezervovať od pondelka %.',
        (select nazov || ' (' || mesto || ')' from sidliska where id = k.sidlisko_id),
        to_char((date_trunc('week', now() at time zone 'Europe/Bratislava') + interval '7 days')::date, 'DD.MM.YYYY');
    end if;
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, datum, poznamka)
  values (p_sidlisko, 'cele', auth.uid(), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_zapisat_schrankovanie(p_id bigint, p_sidlisko bigint, p_makler uuid, p_datum date, p_poznamka text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; k schrankovanie_akcie;
begin
  perform _over_admin();
  if p_makler is null or not exists (select 1 from makleri where id = p_makler and kancelaria_id = aktivna_kancelaria()) then raise exception 'Vyberte makléra.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  if p_id is not null then
    select * into k from schrankovanie_akcie where id = p_id and zrusene is null and kancelaria_id = aktivna_kancelaria() for update;
    if not found then raise exception 'Záznam neexistuje.'; end if;
    update schrankovanie_akcie set makler_id = p_makler, datum = coalesce(p_datum, datum),
      poznamka = nullif(trim(coalesce(p_poznamka, '')), '') where id = p_id;
    return p_id;
  end if;
  if not exists (select 1 from sidliska where id = p_sidlisko and kancelaria_id = aktivna_kancelaria()) then raise exception 'Sídlisko neexistuje.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  -- staršie schránkovanie (už po 2 mesiacoch) sa dá zapísať vždy; inak nesmie byť sídlisko obsadené
  if p_datum is null or p_datum > (current_date - interval '2 months')::date then
    select * into k from schrankovanie_akcie a where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a)
    order by a.rezervovane desc limit 1;
    if found then
      raise exception 'Sídlisko je obsadené (%). Najprv zrušte ten záznam alebo ho upravte.', coalesce(_meno(k.makler_id), 'iný maklér');
    end if;
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, rezervovane, datum, poznamka)
  values (p_sidlisko, 'cele', p_makler, coalesce(p_datum::timestamptz, now()), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_schrankovanie(p_id bigint, p_lokalita text, p_typ text, p_cena integer, p_telefon text, p_stav text, p_poznamky text, p_makler uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_majitel uuid;
begin
  perform _over_aktivny();
  if coalesce(trim(p_lokalita), '') = '' then raise exception 'Zadajte lokalitu.'; end if;
  if p_id is null then
    insert into schrankovanie (lokalita, typ, cena, telefon, stav, poznamky, makler_id, vytvoril)
    values (trim(p_lokalita), p_typ, p_cena, nullif(trim(p_telefon), ''), nullif(trim(p_stav), ''), nullif(trim(p_poznamky), ''),
            case when ja_admin() and p_makler is not null then p_makler else auth.uid() end, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select makler_id into v_majitel from schrankovanie where id = p_id and zmazane is null and kancelaria_id = aktivna_kancelaria() for update;
  if not found then raise exception 'Záznam neexistuje.'; end if;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Upraviť môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  update schrankovanie set lokalita = trim(p_lokalita), typ = p_typ, cena = p_cena, telefon = nullif(trim(p_telefon), ''),
    stav = nullif(trim(p_stav), ''), poznamky = nullif(trim(p_poznamky), ''),
    makler_id = case when ja_admin() then p_makler else makler_id end, upravene = now()
  where id = p_id;
  return p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.ulozit_schrankovanie(p_id bigint, p_lokalita text, p_typ text, p_cena integer, p_telefon text, p_stav text, p_poznamky text, p_makler uuid, p_kontakt text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_majitel uuid;
begin
  perform _over_aktivny();
  if coalesce(trim(p_lokalita), '') = '' then raise exception 'Zadajte lokalitu alebo adresu.'; end if;
  if p_id is null then
    insert into schrankovanie (lokalita, typ, cena, telefon, stav, poznamky, kontakt, makler_id, vytvoril)
    values (trim(p_lokalita), p_typ, p_cena, nullif(trim(p_telefon), ''), nullif(trim(p_stav), ''), nullif(trim(p_poznamky), ''),
            nullif(trim(p_kontakt), ''), case when ja_admin() and p_makler is not null then p_makler else auth.uid() end, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select makler_id into v_majitel from schrankovanie where id = p_id and zmazane is null and kancelaria_id = aktivna_kancelaria() for update;
  if not found then raise exception 'Záznam neexistuje.'; end if;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Upraviť môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  update schrankovanie set lokalita = trim(p_lokalita), typ = p_typ, cena = p_cena, telefon = nullif(trim(p_telefon), ''),
    stav = nullif(trim(p_stav), ''), poznamky = nullif(trim(p_poznamky), ''), kontakt = nullif(trim(p_kontakt), ''),
    makler_id = case when ja_admin() then p_makler else makler_id end, upravene = now()
  where id = p_id;
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.zmazat_schrankovanie(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_majitel uuid;
begin
  perform _over_aktivny();
  select makler_id into v_majitel from schrankovanie where id = p_id and kancelaria_id = aktivna_kancelaria();
  if not found then return; end if;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Zmazať môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  -- záznam sa len skryje (dá sa obnoviť v databáze, keby sa zmazal omylom)
  update schrankovanie set zmazane = now(), zmazal = auth.uid() where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.navrh_cisla_ponuky(p_makler uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _over_aktivny();
  return _nove_cislo_ponuky(coalesce(p_makler, auth.uid()), (select slug from kancelarie where id = aktivna_kancelaria()));
end $function$;

CREATE OR REPLACE FUNCTION public._cislo_ponuky_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(trim(new.cislo), '') = '' then
    if tg_op = 'UPDATE' and coalesce(trim(old.cislo), '') <> '' then
      new.cislo := old.cislo;            -- prázdne pole pri úprave = ponechať pridelené číslo
    elsif new.makler_id is not null then
      new.cislo := _nove_cislo_ponuky(new.makler_id, coalesce((select slug from kancelarie where id = new.kancelaria_id), new.kancelaria));
    end if;
  end if;
  return new;
end $function$;

-- web iného makléra upraví len administrátor jeho kancelárie
CREATE OR REPLACE FUNCTION public._web_na_upravu(p_makler uuid)
 RETURNS weby
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid := coalesce(p_makler, auth.uid());
begin
  perform _over_aktivny();
  if v <> auth.uid() and not (ja_admin() and exists (select 1 from makleri where id = v and kancelaria_id = aktivna_kancelaria())) then raise exception 'Web iného makléra môže upraviť len administrátor.' using errcode = '42501'; end if;
  return _web_maklera(v);
end $function$;

CREATE OR REPLACE FUNCTION public.schvalit_adresu_webu(p_web bigint, p_ok boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w weby;
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Adresy schvaľuje administrátor.' using errcode = '42501'; end if;
  select * into w from weby where id = p_web and kancelaria_id = aktivna_kancelaria() for update;
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
end $function$;

CREATE OR REPLACE FUNCTION public._sprava_pre_mna(p_druh text, p_sprava bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_druh = 'dm' then
    select od_id into v from sukromne_spravy where id = p_sprava and komu_id = auth.uid() and zmazane is null;
    if not found then raise exception 'Správa už neexistuje.'; end if;
  elsif p_druh = 'tim' then
    select makler_id into v from spravy where id = p_sprava and zmazane is null and kancelaria_id = aktivna_kancelaria();
    if not found then raise exception 'Správa už neexistuje.'; end if;
    if v = auth.uid() then raise exception 'Toto je vaša vlastná správa.'; end if;
  else
    raise exception 'Neznámy druh správy.';
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.ulozit_obhliadku(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint := nullif(p->>'id', '')::bigint; o obhliadky; n nehnutelnosti; v_cas timestamptz; v_prip bigint;
begin
  perform _over_aktivny();
  v_cas := nullif(p->>'cas', '')::timestamptz;
  if v_cas is null then raise exception 'Zadajte dátum a čas obhliadky.'; end if;
  if v_id is not null then
    select * into o from obhliadky where id = v_id and zrusena is null for update;
    if not found then raise exception 'Obhliadka neexistuje.'; end if;
    select * into n from nehnutelnosti where id = o.nehnutelnost_id;
    if not ja_admin() and o.makler_id is distinct from auth.uid() and n.makler_id is distinct from auth.uid() then
      raise exception 'Túto obhliadku nemôžete upraviť.';
    end if;
  else
    select * into n from nehnutelnosti where id = nullif(p->>'nehnutelnost_id', '')::bigint and kancelaria_id = aktivna_kancelaria();
    if not found then raise exception 'Ponuka neexistuje.'; end if;
    insert into obhliadky (nehnutelnost_id, makler_id, cas) values (n.id, auth.uid(), v_cas) returning * into o;
    v_id := o.id;
  end if;
  update obhliadky set cas = v_cas,
    dopyt_id = (select d.id from dopyty d where d.id = nullif(p->>'dopyt_id', '')::bigint and d.kancelaria_id = aktivna_kancelaria()),
    klient_meno = nullif(trim(p->>'klient_meno'), ''), klient_telefon = nullif(trim(p->>'klient_telefon'), ''),
    vysledok = coalesce(nullif(p->>'vysledok', ''), case when v_cas > now() then 'naplanovana' end),
    spatna_vazba = nullif(trim(p->>'spatna_vazba'), ''), poznamka = nullif(trim(p->>'poznamka'), ''),
    ponuknuta_cena = nullif(p->>'ponuknuta_cena', '')::numeric
  where id = v_id;
  -- pripomienka hodinu pred budúcou obhliadkou
  if o.pripomienka_id is not null then
    update pripomienky set zrusena = now() where id = o.pripomienka_id and hotovo is null and email_odoslany is null;
  end if;
  if v_cas > now() + interval '70 minutes' then
    insert into pripomienky (makler_id, vytvoril, nehnutelnost_id, cas, poznamka, druh)
    values (coalesce(o.makler_id, auth.uid()), auth.uid(), n.id, v_cas - interval '1 hour',
            'Obhliadka o ' || to_char(v_cas at time zone 'Europe/Bratislava', 'HH24:MI') || ': ' ||
            left(coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 80) ||
            coalesce(' · ' || nullif(trim(p->>'klient_meno'), ''), ''), 'obhliadka')
    returning id into v_prip;
    update obhliadky set pripomienka_id = v_prip where id = v_id;
  else
    update obhliadky set pripomienka_id = null where id = v_id;
  end if;
  return v_id;
end $function$;

drop index if exists public.weby_kancelaria_jeden;
create unique index if not exists weby_kancelaria_jeden on public.weby (kancelaria_id) where kancelaria;

CREATE OR REPLACE FUNCTION public._web_kancelarie(p_vytvorit boolean DEFAULT false)
 RETURNS weby
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w weby; v_zaklad text; v_adresa text; i int := 1;
begin
  select * into w from weby where kancelaria and kancelaria_id = aktivna_kancelaria();
  if found or not p_vytvorit then return w; end if;
  v_zaklad := left(nullif(_web_adresa(coalesce(nullif((_nk('vzhlad')::jsonb->>'nazov'), ''), 'alpha-reality')), ''), 40);
  if v_zaklad is null or length(v_zaklad) < 3 then v_zaklad := 'kancelaria'; end if;
  v_adresa := v_zaklad;
  while _adresa_obsadena(v_adresa, -1) loop
    i := i + 1; v_adresa := v_zaklad || '-' || i;
  end loop;
  insert into weby (makler_id, adresa, kancelaria, kancelaria_id) values (auth.uid(), v_adresa, true, aktivna_kancelaria()) returning * into w;
  return w;
end $function$;

CREATE OR REPLACE FUNCTION public.farby_webu_kancelarie()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w weby; v jsonb;
begin
  perform _over_aktivny();
  select * into w from weby where kancelaria and kancelaria_id = aktivna_kancelaria() order by id limit 1;
  if not found then return null; end if;
  v := coalesce(w.zverejnene, w.koncept);
  if v is null then return null; end if;
  return jsonb_build_object('color', v->>'color', 'cc', v->>'cc', 'b2', v->>'b2', 'bg', v->>'bg', 'zverejneny', w.zverejnene is not null);
end $function$;

-- vzhľad kancelárie (logo, farby, meranie): prihlásený – aktívna kancelária; verejné stránky – zadaná kancelária
-- (bez zadania kancelária 1, kým verejné stránky neposielajú kanceláriu ponuky alebo makléra)
drop function if exists public.vzhlad_kancelarie();
create or replace function public.vzhlad_kancelarie(p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(_nk('vzhlad', coalesce(p_kancelaria, aktivna_kancelaria(), 1))::jsonb - 'upravil', '{}'::jsonb)
$$;
grant execute on function public.vzhlad_kancelarie(bigint) to anon, authenticated;

drop function if exists public._kancelaria_verejne();
create or replace function public._kancelaria_verejne(p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('nazov', nullif(v->>'nazov', ''), 'firma', nullif(v->>'firma', ''),
                                              'web', nullif(v->>'web', ''), 'region', nullif(v->>'region', '')))
  from (select coalesce(_nk('vzhlad', coalesce(p_kancelaria, aktivna_kancelaria(), 1))::jsonb, '{}'::jsonb) as v) x
$$;
revoke execute on function public._kancelaria_verejne(bigint) from public, anon, authenticated;

drop function if exists public._karta_ponuky();
create or replace function public._karta_ponuky(p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(_nk('karta_ponuky', coalesce(p_kancelaria, aktivna_kancelaria(), 1))::jsonb - 'upravil', '{}'::jsonb)
$$;
revoke execute on function public._karta_ponuky(bigint) from public, anon, authenticated;

-- portál: kancelária podľa značky (nehnutelnosti.kancelaria = kancelarie.slug)
create or replace function public._portal_kancelaria(p_kancelaria text)
 returns jsonb language sql stable security definer set search_path = public as $$
  with k as (select coalesce((select id from kancelarie where slug = p_kancelaria), 1) as id)
  select coalesce(_kancelaria_verejne((select id from k)), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('id', p_kancelaria,
           'logo', nullif(_nk('vzhlad', (select id from k))::jsonb->>'logo', '')))
$$;

drop function if exists public.verejne_recenzie(uuid);
create or replace function public.verejne_recenzie(p_makler uuid default null, p_kancelaria bigint default null)
 returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'priemer', round(avg(hodnotenie)::numeric, 1), 'pocet', count(*),
    'zoznam', coalesce(jsonb_agg(jsonb_build_object('meno', meno, 'hodnotenie', hodnotenie, 'text', text, 'zdroj', zdroj, 'datum', vytvorene::date,
                                                     'makler', (select m.meno from makleri m where m.id = r.makler_id)) order by vytvorene desc), '[]'::jsonb))
  from recenzie r where stav = 'schvalena' and (p_makler is null or makler_id = p_makler)
    and (p_makler is not null or r.kancelaria_id = coalesce(p_kancelaria, 1))
$$;
grant execute on function public.verejne_recenzie(uuid, bigint) to anon, authenticated;

-- koncepty a neaktívne ponuky vidí len kancelária ponuky
CREATE OR REPLACE FUNCTION public.verejna_ponuka(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n nehnutelnosti;
begin
  select * into n from nehnutelnosti where id = p_id;
  if not found then return null; end if;
  if n.stav not in ('aktivne', 'rezervovane', 'predane') and not (ja_aktivny() and n.kancelaria_id = aktivna_kancelaria()) then return null; end if;
  return _verejna(n) || jsonb_build_object('kanc', _kancelaria_verejne(n.kancelaria_id), 'karta', _karta_ponuky(n.kancelaria_id) - 'upravene', 'kancelaria_id', n.kancelaria_id);
end $function$;

-- koncept webu (náhľad) len pre kanceláriu webu
CREATE OR REPLACE FUNCTION public.verejny_web(p_adresa text, p_nahlad boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w weby; v_obsah jsonb;
begin
  w := _web_podla(p_adresa);
  if w.id is null then return null; end if;
  if p_nahlad and ja_aktivny() and w.kancelaria_id = aktivna_kancelaria() then v_obsah := w.koncept; else v_obsah := w.zverejnene; p_nahlad := false; end if;
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
    'kancelaria', vzhlad_kancelarie(w.kancelaria_id), 'kancelaria_id', w.kancelaria_id);
end $function$;

-- web kancelárie: ponuky, makléri, recenzie a vzhľad len jeho kancelárie
CREATE OR REPLACE FUNCTION public._verejny_web_kancelarie(w weby, v_obsah jsonb, v_nahlad boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'druh', 'kancelaria', 'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
    'web', v_obsah, 'nahlad', v_nahlad, 'zverejnene_kedy', w.zverejnene_kedy,
    'ponuky', coalesce((select jsonb_agg(((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id, 'slug', _slug_ponuky(n)))
                                         order by (n.stav = 'aktivne') desc, n.exkluzivne desc, n.upravene desc)
                        from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
                        where n.stav in ('aktivne', 'rezervovane') and n.web_kancelarie and n.kancelaria_id = w.kancelaria_id), '[]'::jsonb),
    'predane', coalesce((select jsonb_agg(x order by x->>'upravene' desc) from (
                          select ((_web_ponuka(n) - 'makler' - 'popis' - 'vybavenie' - 'specialne') || jsonb_build_object('makler_id', n.makler_id, 'slug', _slug_ponuky(n))) as x
                          from nehnutelnosti n join makleri m on m.id = n.makler_id
                          where n.stav = 'predane' and n.web_kancelarie and n.kancelaria_id = w.kancelaria_id and n.upravene > now() - interval '3 years'
                          order by n.upravene desc limit 36) t), '[]'::jsonb),
    'makleri', coalesce((select jsonb_agg(verejny_makler(m.id) || jsonb_build_object('admin', m.rola = 'admin', 'obce', to_jsonb(coalesce(m.obce, '{}')),
                           'slug', _web_adresa(m.meno),
                           'web', (select jsonb_build_object('adresa', x.adresa, 'domena', case when x.domena_pripojena is not null then x.domena end)
                                   from weby x where x.makler_id = m.id and not x.kancelaria and x.zverejnene is not null))
                         order by m.meno) from makleri m where m.aktivny and m.kancelaria_id = w.kancelaria_id), '[]'::jsonb),
    'recenzie', verejne_recenzie(null, w.kancelaria_id),
    'google', _nk('google_recenzie', w.kancelaria_id)::jsonb - 'place_id',
    'kancelaria', vzhlad_kancelarie(w.kancelaria_id), 'kancelaria_id', w.kancelaria_id)
$function$;

CREATE OR REPLACE FUNCTION public.verejne_weby_mapa()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'kancelaria', w.kancelaria,
      'upravene', greatest(w.zverejnene_kedy, (select max(n.upravene) from nehnutelnosti n where ((w.kancelaria and n.kancelaria_id = w.kancelaria_id) or n.makler_id = w.makler_id) and n.stav in ('aktivne', 'rezervovane'))),
      'ponuky', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'upravene', n.upravene, 'slug', case when w.kancelaria then _slug_ponuky(n) end)) from nehnutelnosti n
                          where n.stav in ('aktivne', 'rezervovane')
                            and (case when w.kancelaria then n.web_kancelarie and n.kancelaria_id = w.kancelaria_id and exists (select 1 from makleri m where m.id = n.makler_id and m.aktivny) else n.makler_id = w.makler_id end)), '[]'::jsonb),
      'makleri', case when w.kancelaria then coalesce((select jsonb_agg(_web_adresa(m.meno)) from makleri m
                          where m.aktivny and m.kancelaria_id = w.kancelaria_id and coalesce(w.zverejnene->'team'->(m.id::text)->>'on', 'true') <> 'false'), '[]'::jsonb) else '[]'::jsonb end,
      'stranky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_stranky') = 'array' then w.zverejnene->'_stranky' else '[]'::jsonb end,
      'clanky', case when w.kancelaria and jsonb_typeof(w.zverejnene->'_clanky') = 'array' then w.zverejnene->'_clanky' else '[]'::jsonb end)), '[]'::jsonb)
  from weby w left join makleri m on m.id = w.makler_id
  where w.zverejnene is not null and (w.kancelaria or m.aktivny);
$function$;

CREATE OR REPLACE FUNCTION public.portal_kancelaria(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_r jsonb; v_g jsonb; v_k bigint;
begin
  if p_id is null or p_id !~ '^[a-z0-9_-]{1,40}$' then return null; end if;
  if not exists (select 1 from nehnutelnosti n where n.kancelaria = p_id and _portal_viditelna(n)) then return null; end if;
  v_k := coalesce((select id from kancelarie where slug = p_id), 1);
  v_r := verejne_recenzie(null, v_k);
  v_r := (v_r - 'zoznam') || jsonb_build_object('zoznam', coalesce((select jsonb_agg(e - 'zdroj' order by o)
           from jsonb_array_elements(coalesce(v_r->'zoznam', '[]'::jsonb)) with ordinality t(e, o) where o <= 12), '[]'::jsonb));
  v_g := _nk('google_recenzie', v_k)::jsonb - 'place_id';
  return jsonb_build_object('kancelaria', _portal_kancelaria(p_id), 'recenzie', v_r, 'google', v_g);
end $function$;

CREATE OR REPLACE FUNCTION public.portal_makleri()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with m as (
    select mk.*, w.adresa, w.domena, w.domena_pripojena, w.zverejnene as web,
      (select count(*) from nehnutelnosti n where n.makler_id = mk.id and _portal_viditelna(n)) as ponuk,
      coalesce((select k.slug from kancelarie k where k.id = mk.kancelaria_id), 'alpha') as kanc
    from makleri mk
    left join weby w on w.makler_id = mk.id and not w.kancelaria and w.zverejnene is not null
    where mk.aktivny
  )
  select jsonb_build_object(
    'makleri', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', m.id, 'meno', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'telefon', m.telefon, 'email', m.email,
        'foto', coalesce(case when m.foto like 'data:image/%' then m.foto end,
                         case when m.web->>'photo' ~ '^https://' then m.web->>'photo' end),
        'kancelaria', m.kanc, 'ponuk', m.ponuk,
        'oblast', nullif(left(btrim(coalesce(m.web->>'area', '')), 80), ''),
        'roky', case when (m.web->>'years') ~ '^\d{1,2}$' then (m.web->>'years')::int end,
        'web', case when m.web is not null then
                 case when m.domena is not null and m.domena_pripojena is not null then 'https://' || m.domena || '/'
                      else 'https://app.realitnytypek.sk/stranka.html?m=' || m.adresa end end))
      order by m.ponuk desc, m.meno) from m where m.ponuk > 0 or m.web is not null), '[]'::jsonb),
    'kancelarie', coalesce((select jsonb_object_agg(k, _portal_kancelaria(k)) from (select distinct kanc k from m where m.ponuk > 0 or m.web is not null) x), '{}'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.report_majitela(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'zaujemcovia', (select count(*) from dopyty d where d.kancelaria_id = n.kancelaria_id and _sedi_ponuka(d, n)),
    'kontakty', (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca')),
    'kontakty_7', (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca') and k.vytvorene > now() - interval '7 days'),
    'kanc', _kancelaria_verejne(n.kancelaria_id), 'kancelaria_id', n.kancelaria_id,
    'vygenerovane', now()) into v;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.poslat_recenziu(p_makler uuid, p_meno text, p_hodnotenie integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(trim(p_meno), '') = '' then raise exception 'Napíšte svoje meno.'; end if;
  if p_hodnotenie is null or p_hodnotenie not between 1 and 5 then raise exception 'Vyberte počet hviezdičiek.'; end if;
  if length(coalesce(p_text, '')) > 2000 or length(p_meno) > 80 then raise exception 'Text je príliš dlhý.'; end if;
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler and aktivny) then raise exception 'Maklér neexistuje.'; end if;
  if (select count(*) from recenzie where stav = 'caka' and vytvorene > now() - interval '1 day'
        and kancelaria_id = coalesce((select kancelaria_id from makleri where id = p_makler), 1)) > 30 then
    raise exception 'Momentálne nie je možné pridať recenziu, skúste to neskôr.';
  end if;
  insert into recenzie (makler_id, meno, hodnotenie, text, zdroj, stav)
  values (p_makler, left(trim(p_meno), 80), p_hodnotenie, left(trim(coalesce(p_text, '')), 2000), 'web', 'caka');
end $function$;

CREATE OR REPLACE FUNCTION public._mesacny_prehlad_webu(p_dnes date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w weby; v_spolu int := 0; v_dnes date := coalesce(p_dnes, (now() at time zone 'Europe/Bratislava')::date);
  v_od date; v_do date; v_od2 date; v_do2 date;
  v_nav int; v_nav2 int; v_k int; v_vyb int; v_kl int; v_str int; v_top text; v_zdroj text; v_txt text; v_zmena text; v_admini uuid[];
  MES constant text[] := array['január','február','marec','apríl','máj','jún','júl','august','september','október','november','december'];
  MES2 constant text[] := array['januáru','februáru','marcu','aprílu','máju','júnu','júlu','augustu','septembru','októbru','novembru','decembru'];
  ZDR constant jsonb := '{"google":"Google","facebook":"Facebook","instagram":"Instagram","qr":"QR kód","email":"e-mail","vyhladavac":"iné vyhľadávače","iny":"iné weby","priamo":"priamo zadanú adresu"}';
begin
  for w in select * from weby where kancelaria and zverejnene is not null loop
  v_od := date_trunc('month', v_dnes - 1)::date;
  v_do := (date_trunc('month', v_dnes)::date - 1);
  if v_do < v_od then continue; end if;
  v_od2 := (v_od - interval '1 month')::date; v_do2 := v_od - 1;
  -- každý mesiac len raz
  if _nk('web_prehlad_mesiac', w.kancelaria_id) = to_char(v_od, 'YYYY-MM') then continue; end if;
  perform _nk_ulozit('web_prehlad_mesiac', to_char(v_od, 'YYYY-MM'), w.kancelaria_id);

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

  select array_agg(id) into v_admini from makleri where aktivny and rola = 'admin' and kancelaria_id = w.kancelaria_id;
  if v_admini is null then continue; end if;
  insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id) select a, now(), left(v_txt, 500), 'pripomienka', w.kancelaria_id from unnest(v_admini) a;
  perform _push_zaradit(v_admini, 'kontakty', '📊 Web kancelárie za ' || MES[extract(month from v_od)::int],
    v_nav || ' návštev, ' || v_k || ' kontaktov' || case when v_k > 0 then ', vybavené ' || v_vyb else '' end || '.', './web-kancelarie.html#statistiky',
    'typek-web-prehlad-' || to_char(v_od, 'YYYY-MM'));
  v_spolu := v_spolu + array_length(v_admini, 1);
  end loop;
  return v_spolu;
end $function$;

-- vlastné inzeráty kancelárie v skeneri – zatiaľ podľa názvu Alpha Reality
CREATE OR REPLACE FUNCTION public._vzor_kancelarie()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text;
begin
  begin
    v := btrim((_nk('vzhlad', 1)::jsonb->>'nazov'));
  exception when others then v := null;
  end;
  v := coalesce(nullif(v, ''), 'Alpha Reality');
  if length(v) < 4 then return null; end if;
  return '%' || replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_') || '%';
end $function$;

-- bez makléra v riadku kancelária prihláseného – v režime podpory zvolená
CREATE OR REPLACE FUNCTION public._nastav_kancelariu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  j jsonb;
  k text;
  v bigint;
begin
  if new.kancelaria_id is not null then return new; end if;
  j := to_jsonb(new);
  begin
    foreach k in array array['makler_id', 'oznacil', 'zadal', 'od_id', 'od', 'kto', 'vytvoril', 'upravil'] loop
      if j ? k and nullif(j ->> k, '') is not null then
        select m.kancelaria_id into v from makleri m where m.id = (j ->> k)::uuid;
      end if;
      exit when v is not null;
    end loop;
    if v is null and nullif(j ->> 'nehnutelnost_id', '') is not null then
      select n.kancelaria_id into v from nehnutelnosti n where n.id = (j ->> 'nehnutelnost_id')::bigint;
    end if;
    if v is null and nullif(j ->> 'web_id', '') is not null then
      select w.kancelaria_id into v from weby w where w.id = (j ->> 'web_id')::bigint;
    end if;
    if v is null and nullif(j ->> 'dopyt_id', '') is not null then
      select d.kancelaria_id into v from dopyty d where d.id = (j ->> 'dopyt_id')::bigint;
    end if;
    if v is null and nullif(j ->> 'sidlisko_id', '') is not null then
      select s.kancelaria_id into v from sidliska s where s.id = (j ->> 'sidlisko_id')::bigint;
    end if;
    if v is null then v := aktivna_kancelaria(); end if;
  exception when others then
    v := null;
  end;
  new.kancelaria_id := coalesce(v, 1);
  return new;
end $function$;

-- história zmien v kancelárii zmeneného záznamu
CREATE OR REPLACE FUNCTION public._zapis_historiu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stary jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  novy jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  zmeny jsonb := '{}'::jsonb; k text;
  ignoruj text[] := array['upravene', 'naposledy_aktivny', 'chat_precitane', 'report_odoslany', 'foto', 'kalendar_token', 'report_token', 'sprievodca_videny', 'novinky_videne'];
begin
  for k in select jsonb_object_keys(stary || novy) loop
    if k = any(ignoruj) then continue; end if;
    if (stary -> k) is distinct from (novy -> k) then
      zmeny := zmeny || jsonb_build_object(k, jsonb_build_array(
        case when length(coalesce(stary ->> k, '')) > 300 then to_jsonb(left(stary ->> k, 300) || '…') else stary -> k end,
        case when length(coalesce(novy ->> k, '')) > 300 then to_jsonb(left(novy ->> k, 300) || '…') else novy -> k end));
    end if;
  end loop;
  if tg_op = 'UPDATE' and zmeny = '{}'::jsonb then return null; end if;
  if tg_op = 'UPDATE' and (select count(*) from jsonb_object_keys(zmeny)) = 1 and zmeny ? 'foto' then return null; end if;
  insert into historia_zmien (tabulka, zaznam_id, akcia, zmeny, kto, kancelaria_id)
  values (tg_table_name,
    case tg_table_name when 'nehnutelnosti_interne' then coalesce(novy ->> 'nehnutelnost_id', stary ->> 'nehnutelnost_id')
                       else coalesce(novy ->> 'id', stary ->> 'id') end,
    case tg_op when 'INSERT' then 'vytvorenie' when 'UPDATE' then 'zmena' else 'zmazanie' end,
    case when tg_op = 'INSERT' then '{}'::jsonb else zmeny end, auth.uid(),
    coalesce((novy ->> 'kancelaria_id')::bigint, (stary ->> 'kancelaria_id')::bigint, aktivna_kancelaria(), 1));
  return null;
end $function$;


-- ---------------------------------------------------------------- úložisko súborov po kanceláriách
-- priečinok patrí kancelárii, keď je to maklér tej kancelárie (fotky, dokumenty, súbory osobného webu)
create or replace function public._priecinok_v_kancelarii(p_priecinok text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri m where m.id::text = p_priecinok and m.kancelaria_id = aktivna_kancelaria())
$$;
revoke execute on function public._priecinok_v_kancelarii(text) from public, anon;
grant execute on function public._priecinok_v_kancelarii(text) to authenticated, service_role;

-- tímové prílohy chatu: tim/k<kancelária>/súbor; staršie tim/súbor sú prílohy Alpha Reality (kancelária 1)
create or replace function public._tim_priecinok_moj(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when array_length(storage.foldername(p_name), 1) = 1 then aktivna_kancelaria() = 1
    else (storage.foldername(p_name))[2] = 'k' || aktivna_kancelaria()::text
  end
$$;
revoke execute on function public._tim_priecinok_moj(text) from public, anon;
grant execute on function public._tim_priecinok_moj(text) to authenticated, service_role;

drop policy if exists chat_prilohy_nahrat on storage.objects;
create policy chat_prilohy_nahrat on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-prilohy' and ma_pristup('chat')
  and (((storage.foldername(name))[1] = 'tim' and array_length(storage.foldername(name), 1) <= 2 and _tim_priecinok_moj(name))
       or ((storage.foldername(name))[1] = 'dm' and array_length(storage.foldername(name), 1) = 3
           and (storage.foldername(name))[2] = (select auth.uid())::text and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
           and _priecinok_v_kancelarii((storage.foldername(name))[3]))));
drop policy if exists chat_prilohy_citat on storage.objects;
create policy chat_prilohy_citat on storage.objects for select to authenticated using (
  bucket_id = 'chat-prilohy' and ma_pristup('chat')
  and (((storage.foldername(name))[1] = 'tim' and _tim_priecinok_moj(name))
       or ((storage.foldername(name))[1] = 'dm'
           and ((select auth.uid())::text = (storage.foldername(name))[2] or (select auth.uid())::text = (storage.foldername(name))[3]))));
drop policy if exists chat_prilohy_zmazat on storage.objects;
create policy chat_prilohy_zmazat on storage.objects for delete to authenticated using (
  bucket_id = 'chat-prilohy'
  and (owner_id = (select auth.uid())::text or ((storage.foldername(name))[1] = 'tim' and ja_admin() and _tim_priecinok_moj(name))));

-- dokumenty k ponukám: vlastné, alebo administrátor kancelárie makléra
drop policy if exists ponuky_dok_citat on storage.objects;
create policy ponuky_dok_citat on storage.objects for select to authenticated using (
  bucket_id = 'ponuky-dokumenty' and ja_aktivny()
  and ((storage.foldername(name))[1] = (auth.uid())::text or (ja_admin() and _priecinok_v_kancelarii((storage.foldername(name))[1]))));

-- súbory webov: vlastný priečinok, administrátor kancelárie makléra, web kancelárie v kancelaria/k<id>/
-- (staršie kancelaria/súbor patria Alpha Reality)
create or replace function public._web_priecinok_moj(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (storage.foldername(p_name))[1] = 'kancelaria' then
      ja_admin() and case when array_length(storage.foldername(p_name), 1) = 1 then aktivna_kancelaria() = 1
                          else (storage.foldername(p_name))[2] = 'k' || aktivna_kancelaria()::text end
    else (storage.foldername(p_name))[1] = (auth.uid())::text or (ja_admin() and _priecinok_v_kancelarii((storage.foldername(p_name))[1]))
  end
$$;
revoke execute on function public._web_priecinok_moj(text) from public, anon;
grant execute on function public._web_priecinok_moj(text) to authenticated, service_role;

drop policy if exists weby_subory_nahrat on storage.objects;
create policy weby_subory_nahrat on storage.objects for insert to authenticated with check (
  bucket_id = 'weby' and ja_aktivny() and _web_priecinok_moj(name));
drop policy if exists weby_subory_zmenit on storage.objects;
create policy weby_subory_zmenit on storage.objects for update to authenticated using (
  bucket_id = 'weby' and ja_aktivny() and _web_priecinok_moj(name));
drop policy if exists weby_subory_zmazat on storage.objects;
create policy weby_subory_zmazat on storage.objects for delete to authenticated using (
  bucket_id = 'weby' and ja_aktivny() and _web_priecinok_moj(name));
drop policy if exists weby_subory_citat on storage.objects;
create policy weby_subory_citat on storage.objects for select to authenticated using (
  bucket_id = 'weby' and ja_aktivny() and _web_priecinok_moj(name));

-- návrh hovoru a SMS z AI obsahuje meno a telefón makléra – vidí ho len ten, kto si ho vytvoril;
-- verdikt AI o súkromníkovi ostáva spoločný pre kancelárie s tým okresom
revoke select on public.inzeraty_ai from authenticated;
grant select (inzerat_id, verdikt, istota, dovod, model, skontrolovane) on public.inzeraty_ai to authenticated;
create or replace function public.moje_ai_navrhy()
returns table (inzerat_id text, hovor text, sms text, hovor_vytvorene timestamptz)
language sql stable security definer set search_path = public as $$
  select a.inzerat_id, a.hovor, a.sms, a.hovor_vytvorene from inzeraty_ai a
  where a.hovor_vytvoril = auth.uid() and (a.hovor is not null or a.sms is not null) and ma_pristup('inzeraty')
$$;
revoke execute on function public.moje_ai_navrhy() from public, anon;
grant execute on function public.moje_ai_navrhy() to authenticated;

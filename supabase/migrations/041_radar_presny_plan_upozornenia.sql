-- =====================================================================
-- 1) Presný plán skenera: Supabase (pg_cron) spúšťa skener na GitHube každých 10 minút
--    (GitHub plánovač mešká aj o 20+ minút). Kľúč GitHubu je vo Vaulte (gh_spustanie_token),
--    vkladá ho tam nasadenie databázy z tajomstva GH_SPUSTANIE_TOKEN.
-- 2) Radar Bazoša: každé 2 minúty pozrie stránku, kde po topovaných začínajú nové inzeráty
--    (byty, domy, pozemky; pri bytoch a domoch každých 6 minút aj 1. stranu – súkromníci tiež topujú). Keď nájde nový inzerát
--    z našich okresov, hneď spustí rýchlu kontrolu skenera. Pri obmedzení (403/429) 2 h pauza.
-- 3) Upozornenia do mobilu (Web Push): odbery maklérov, kľúče VAPID, ciele pre skener.
-- =====================================================================

-- ---------------------------------------------------------------- 1) spúšťanie skenera
create table if not exists public.radar_meta (
  id int primary key check (id = 1),
  spusteny timestamptz not null default now(),       -- kedy radar začal (prvé minúty len zapamätá, čo už na Bazoši je)
  posledna_davka timestamptz,
  posledny_ok timestamptz,
  posledna_prva timestamptz,
  pauza_do timestamptz,
  chyba text,
  chyba_kedy timestamptz,
  posledne_spustenie timestamptz,
  posledne_spustenie_id bigint,
  posledny_rezim text
);
insert into public.radar_meta (id) values (1) on conflict do nothing;
alter table public.radar_meta enable row level security;
revoke all on public.radar_meta from anon, authenticated;

create or replace function public._spustit_skener(p_rezim text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_tok text; v_id bigint;
begin
  if p_rezim not in ('bezny', 'rychly', 'plny') then raise exception 'Neznámy režim.'; end if;
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'gh_spustanie_token';
  if coalesce(v_tok, '') = '' then return null; end if;
  v_id := net.http_post(
    url := 'https://api.github.com/repos/Martin3927/realitny-skener/actions/workflows/skener.yml/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'realitny-typek', 'Content-Type', 'application/json'),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('rezim', p_rezim)),
    timeout_milliseconds := 15000);
  update radar_meta set posledne_spustenie = now(), posledne_spustenie_id = v_id, posledny_rezim = p_rezim where id = 1;
  return v_id;
end $$;
revoke execute on function public._spustit_skener(text) from public, anon, authenticated;

-- každých 10 minút 6:00 – 23:59 slovenského času; o celej a o pol bežná kontrola, inak rýchla
create or replace function public.skener_plan() returns void
language plpgsql security definer set search_path = public as $$
declare v_t timestamp := now() at time zone 'Europe/Bratislava'; v_min int; v_rezim text;
begin
  if extract(hour from v_t) < 6 then return; end if;
  v_min := extract(minute from v_t)::int;
  v_rezim := case when v_min % 30 < 5 then 'bezny' else 'rychly' end;
  -- rýchlu kontrolu práve spustil radar – netreba druhú
  if v_rezim = 'rychly' and exists (select 1 from radar_meta where posledne_spustenie > now() - interval '3 minutes') then return; end if;
  perform _spustit_skener(v_rezim);
end $$;
revoke execute on function public.skener_plan() from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) radar Bazoša
create table if not exists public.radar_stav (
  kat text primary key,                 -- kategória na Bazoši (byt, dom, pozemok, chata)
  ofs int not null default 0,           -- posun stránky, kde po topovaných začínajú netopované inzeráty
  prva boolean not null default false,  -- pozerať občas aj 1. stranu (nové topované)
  aktivna boolean not null default true,
  spat_overene timestamptz              -- kedy sme naposledy overili, že predchádzajúca stránka je celá topovaná
);
-- chaty a garáže radar nesleduje (je ich málo) – tie pokryje bežná kontrola každých 30 minút
insert into public.radar_stav (kat, ofs, prva) values ('byt', 40, true), ('dom', 20, true), ('pozemok', 0, false)
on conflict do nothing;
alter table public.radar_stav enable row level security;
revoke all on public.radar_stav from anon, authenticated;

create table if not exists public.radar_poziadavky (
  id bigint primary key,                -- id požiadavky v pg_net
  kat text not null,
  ofs int not null,
  druh text not null check (druh in ('hranica', 'prva', 'spat')),
  vytvorene timestamptz not null default now()
);
alter table public.radar_poziadavky enable row level security;
revoke all on public.radar_poziadavky from anon, authenticated;

create table if not exists public.radar_videne (
  pid text primary key,                 -- číslo inzerátu na Bazoši
  kat text not null,
  okres text,
  top boolean not null default false,
  videne timestamptz not null default now(),
  pokusy int not null default 0,        -- koľkokrát kvôli nemu radar spustil skener
  vybavene timestamptz                  -- skener ho spracoval (alebo existoval už pri štarte radaru)
);
create index if not exists radar_videne_cakajuce on public.radar_videne (videne) where vybavene is null;
alter table public.radar_videne enable row level security;
revoke all on public.radar_videne from anon, authenticated;

-- inzeráty zo stránky výsledkov Bazoša (poradie, číslo, topovaný, okres)
create or replace function public._radar_bloky(p_html text)
returns table (poradie int, pid text, top boolean, okres text)
language sql immutable set search_path = public as $$
  select o.n::int - 1, substring(o.b from '/inzerat/(\d+)/'), o.b ~ 'class="ztop"',
         btrim(substring(o.b from 'class="inzeratylok">([^<]*)<br'))
  from regexp_split_to_table(coalesce(p_html, ''), '<div class="inzeraty inzeratyflex">') with ordinality o(b, n)
  where o.n > 1 and substring(o.b from '/inzerat/(\d+)/') is not null
$$;

create or replace function public._radar_poziadaj(p_kat text, p_ofs int, p_druh text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  v_id := net.http_get(
    url := 'https://reality.bazos.sk/predam/' || p_kat || '/' || case when p_ofs > 0 then p_ofs || '/' else '' end
           || '?hledat=&rubriky=reality&hlokalita=05201&humkreis=25&cenaod=&cenado=&order=',
    headers := jsonb_build_object('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
                                  'Accept-Language', 'sk-SK,sk;q=0.9'),
    timeout_milliseconds := 20000);
  insert into radar_poziadavky (id, kat, ofs, druh) values (v_id, p_kat, p_ofs, p_druh) on conflict do nothing;
end $$;
revoke execute on function public._radar_poziadaj(text, int, text) from public, anon, authenticated;

-- beží každých 30 s: spracuje odpovede, každé 2 minúty pošle nové požiadavky, pri novom inzeráte spustí skener
create or replace function public.radar_tik() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_t timestamp := now() at time zone 'Europe/Bratislava';
  m radar_meta; r record; v_bloky int; v_netop int; v_prvy_top boolean; v_seed boolean;
begin
  select * into m from radar_meta where id = 1 for update;
  if extract(hour from v_t) < 6 or extract(hour from v_t) >= 23 then
    delete from radar_poziadavky;
    return;
  end if;
  if m.pauza_do > now() then return; end if;
  v_seed := m.spusteny > now() - interval '5 minutes';

  -- odpovede
  for r in select p.*, h.status_code, h.content, h.timed_out, h.error_msg
           from radar_poziadavky p join net._http_response h on h.id = p.id loop
    delete from radar_poziadavky where id = r.id;
    if r.status_code in (403, 429, 503) then
      update radar_meta set pauza_do = now() + interval '2 hours', chyba = 'Bazoš obmedzil prístup (' || r.status_code || ') – radar 2 hodiny čaká',
        chyba_kedy = now() where id = 1;
      delete from radar_poziadavky;
      return;
    end if;
    if coalesce(r.status_code, 0) <> 200 or r.content is null then
      update radar_meta set chyba = 'Bazoš neodpovedal' || coalesce(' (' || r.status_code || ')', '') || coalesce(': ' || r.error_msg, ''), chyba_kedy = now() where id = 1;
      continue;
    end if;
    select count(*), count(*) filter (where not b.top), bool_or(b.top and b.poradie = 0)
      into v_bloky, v_netop, v_prvy_top from _radar_bloky(r.content) b;
    if v_bloky = 0 then
      update radar_meta set chyba = 'Bazoš vrátil stránku bez inzerátov (zmena vzhľadu?)', chyba_kedy = now() where id = 1;
      continue;
    end if;
    update radar_meta set posledny_ok = now() where id = 1;

    -- posun hranice: celá stránka topovaná → ďalej; stránka začína netopovaným → overiť predchádzajúcu (najviac raz za 10 min)
    if r.druh = 'hranica' then
      if v_netop = 0 and r.ofs < 200 then
        update radar_stav set ofs = r.ofs + 20, spat_overene = now() where kat = r.kat;
        perform _radar_poziadaj(r.kat, r.ofs + 20, 'hranica');
      elsif not coalesce(v_prvy_top, false) and r.ofs > 0
            and not exists (select 1 from radar_stav where kat = r.kat and spat_overene > now() - interval '10 minutes') then
        perform _radar_poziadaj(r.kat, r.ofs - 20, 'spat');
      end if;
    elsif r.druh = 'spat' then
      if v_netop > 0 then
        update radar_stav set ofs = r.ofs, spat_overene = null where kat = r.kat;   -- hranica je skôr
      else
        update radar_stav set spat_overene = now() where kat = r.kat;               -- hranica sedí
      end if;
    end if;

    -- nové inzeráty z našich okresov, ktoré skener ešte nepozná
    insert into radar_videne (pid, kat, okres, top, vybavene)
    select b.pid, r.kat, b.okres, b.top, case when v_seed then now() end
    from _radar_bloky(r.content) b
    where (r.druh = 'prva' or not b.top)
      and b.okres in ('Spišská Nová Ves', 'Levoča')
      and not exists (select 1 from inzeraty i where i.id = 'bazos:' || b.pid)
    on conflict (pid) do nothing;
  end loop;

  -- požiadavky bez odpovede dlhšie ako 2 minúty zahodíme
  delete from radar_poziadavky where vytvorene < now() - interval '2 minutes';

  -- nový inzerát → rýchla kontrola skenera (najviac raz za 3 minúty, každý inzerát najviac 3-krát)
  if exists (select 1 from radar_videne where vybavene is null and pokusy < 3 and videne > now() - interval '2 hours')
     and (m.posledne_spustenie is null or m.posledne_spustenie < now() - interval '3 minutes') then
    if _spustit_skener('rychly') is not null then
      update radar_videne set pokusy = pokusy + 1 where vybavene is null and pokusy < 3 and videne > now() - interval '2 hours';
    end if;
  end if;

  -- nová dávka každé 2 minuty
  if (m.posledna_davka is null or m.posledna_davka < now() - interval '115 seconds')
     and not exists (select 1 from radar_poziadavky) then
    for r in select * from radar_stav where aktivna order by kat loop
      perform _radar_poziadaj(r.kat, r.ofs, 'hranica');
      if r.prva and r.ofs > 0 and (m.posledna_prva is null or m.posledna_prva < now() - interval '355 seconds') then
        perform _radar_poziadaj(r.kat, 0, 'prva');
      end if;
    end loop;
    update radar_meta set posledna_davka = now(),
      posledna_prva = case when posledna_prva is null or posledna_prva < now() - interval '355 seconds' then now() else posledna_prva end
    where id = 1;
  end if;
end $$;
revoke execute on function public.radar_tik() from public, anon, authenticated;

-- skener: ktoré kategórie Bazoša treba prejsť kvôli radaru a či radar beží
create or replace function public.skener_radar(p_kluc text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m radar_meta; v_t timestamp := now() at time zone 'Europe/Bratislava';
begin
  perform _over_skener(p_kluc);
  select * into m from radar_meta where id = 1;
  return jsonb_build_object(
    'kategorie', coalesce((select jsonb_agg(distinct kat) from radar_videne
                           where vybavene is null and pokusy <= 3 and videne > now() - interval '2 hours'), '[]'::jsonb),
    'zdravy', extract(hour from v_t) between 6 and 22 and m.posledny_ok > now() - interval '10 minutes' and coalesce(m.pauza_do, now()) <= now(),
    'pauza_do', m.pauza_do,
    'chyba', case when m.chyba_kedy > now() - interval '30 minutes' then m.chyba end);
end $$;

-- skener prešiel tieto kategórie Bazoša → inzeráty, ktoré radar videl pred začiatkom behu, sú vybavené
create or replace function public.skener_radar_vybavene(p_kluc text, p_kategorie text[], p_od timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  update radar_videne set vybavene = now()
  where vybavene is null and kat = any(p_kategorie) and videne <= p_od;
  delete from radar_videne where videne < now() - interval '30 days';
end $$;

revoke execute on function public.skener_radar(text), public.skener_radar_vybavene(text, text[], timestamptz) from public, authenticated;
grant execute on function public.skener_radar(text), public.skener_radar_vybavene(text, text[], timestamptz) to anon;

-- ---------------------------------------------------------------- 3) upozornenia do mobilu
create table if not exists public.push_odbery (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  zariadenie text,
  vytvorene timestamptz not null default now(),
  naposledy_ok timestamptz
);
alter table public.push_odbery enable row level security;
do $$ begin
  create policy push_odbery_moje on public.push_odbery for select to authenticated using (makler_id = auth.uid());
exception when duplicate_object then null; end $$;
revoke all on public.push_odbery from anon, authenticated;
grant select (id, endpoint, zariadenie, vytvorene, naposledy_ok, makler_id) on public.push_odbery to authenticated;

create table if not exists public.push_odoslane (
  inzerat_id text not null,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  odoslane timestamptz not null default now(),
  primary key (inzerat_id, makler_id)
);
alter table public.push_odoslane enable row level security;
revoke all on public.push_odoslane from anon, authenticated;

create or replace function public.push_kluc() returns text
language sql stable security definer set search_path = public as $$
  select case when ja_aktivny() then (select hodnota from nastavenia where kluc = 'vapid_public') end;
$$;

create or replace function public.ulozit_push_odber(p_endpoint text, p_p256dh text, p_auth text, p_zariadenie text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Neplatný odber.'; end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' or length(p_p256dh) > 200 or length(p_auth) > 100 then raise exception 'Neplatný odber.'; end if;
  insert into push_odbery (makler_id, endpoint, p256dh, auth, zariadenie)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_zariadenie, 120))
  on conflict (endpoint) do update set makler_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
    zariadenie = excluded.zariadenie, vytvorene = now();
end $$;

create or replace function public.zrusit_push_odber(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  delete from push_odbery where endpoint = p_endpoint and makler_id = auth.uid();
end $$;

revoke execute on function public.push_kluc(), public.ulozit_push_odber(text, text, text, text), public.zrusit_push_odber(text) from public, anon;
grant execute on function public.push_kluc(), public.ulozit_push_odber(text, text, text, text), public.zrusit_push_odber(text) to authenticated;

-- kľúče VAPID (verejný v nastaveniach – potrebuje ho aplikácia, súkromný vo Vaulte)
create or replace function public.skener_vapid(p_kluc text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform _over_skener(p_kluc);
  return jsonb_build_object(
    'public', (select hodnota from nastavenia where kluc = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'));
end $$;

create or replace function public.skener_ulozit_vapid(p_kluc text, p_public text, p_private text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _over_skener(p_kluc);
  if not exists (select 1 from nastavenia where kluc = 'vapid_public')
     and not exists (select 1 from vault.secrets where name = 'vapid_private') then
    if p_public !~ '^[A-Za-z0-9_-]{80,100}$' or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then raise exception 'Neplatné kľúče.'; end if;
    perform vault.create_secret(p_private, 'vapid_private', 'Súkromný kľúč pre upozornenia do mobilu');
    insert into nastavenia (kluc, hodnota) values ('vapid_public', p_public);
  end if;
  return skener_vapid(p_kluc);
end $$;

-- komu poslať upozornenie na nové súkromné inzeráty (každému maklérovi najviac raz za inzerát)
create or replace function public.skener_push_ciele(p_kluc text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_skener(p_kluc);
  with i as (
    select z.* from inzeraty z
    left join oznacenia o on o.inzerat_id = z.id
    where z.id = any(p_ids) and z.aktivny and z.duplikat_z is null
      and coalesce(o.predajca_typ, z.predajca_typ, 'sukromny') <> 'rk'
      and z.prvy_krat > now() - interval '1 day'
      and (z.publikovane is null or z.publikovane >= current_date - 3)
      and not exists (select 1 from _telefony_inzeratov() t join predajcovia p on p.telefon = t.tel
                      where t.inzerat_id = z.id and (p.rk or p.nevolat))
  ), ciel as (
    select i.id as inzerat_id, m.id as makler_id
    from i join makleri m on m.aktivny and (m.rola = 'admin' or 'inzeraty' = any(m.pristup))
    where exists (select 1 from push_odbery s where s.makler_id = m.id)
      and (cardinality(coalesce(m.obce, '{}')) = 0
           or i.obec = any(m.obce)
           or (i.obec is null and exists (select 1 from lokality l where l.nazov = any(m.obce) and l.okres = i.okres)))
      and not exists (select 1 from push_odoslane x where x.inzerat_id = i.id and x.makler_id = m.id)
  ), zapis as (
    insert into push_odoslane (inzerat_id, makler_id) select inzerat_id, makler_id from ciel
    on conflict do nothing returning inzerat_id, makler_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'inzerat', jsonb_build_object('id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres,
                                    'cena', i.cena, 'plocha', i.plocha, 'portal', i.portal),
      'odbery', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                 from zapis z join push_odbery s on s.makler_id = z.makler_id where z.inzerat_id = i.id))), '[]'::jsonb)
    into v
  from i where exists (select 1 from zapis z where z.inzerat_id = i.id);
  return v;
end $$;

-- výsledok odoslania: neplatné odbery (telefón ich zrušil) zmazať, úspešné označiť
create or replace function public.skener_push_vysledok(p_kluc text, p_ok bigint[], p_zrusit bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  update push_odbery set naposledy_ok = now() where id = any(coalesce(p_ok, '{}'));
  delete from push_odbery where id = any(coalesce(p_zrusit, '{}'));
  delete from push_odoslane where odoslane < now() - interval '30 days';
end $$;

revoke execute on function public.skener_vapid(text), public.skener_ulozit_vapid(text, text, text),
  public.skener_push_ciele(text, text[]), public.skener_push_vysledok(text, bigint[], bigint[]) from public, authenticated;
grant execute on function public.skener_vapid(text), public.skener_ulozit_vapid(text, text, text),
  public.skener_push_ciele(text, text[]), public.skener_push_vysledok(text, bigint[], bigint[]) to anon;

-- ---------------------------------------------------------------- plánovač
select cron.schedule('skener-plan', '*/10 * * * *', 'select public.skener_plan()');
select cron.schedule('bazos-radar', '30 seconds', 'select public.radar_tik()');

insert into public.novinky (nazov, popis, ciel, pre_koho)
select 'Upozornenia na nové súkromné inzeráty do mobilu',
   'Skener teraz kontroluje portály každých 10 minút a Bazoš sleduje radar každé 2 minuty. Keď pribudne nový súkromný inzerát z tvojich obcí, príde ti upozornenie priamo do mobilu. Zapneš ho v Mojom profile → Upozornenia do mobilu. Na iPhone treba mať aplikáciu pridanú na ploche a otvoriť ju z ikony.',
   'upozornenia', 'vsetci'
where not exists (select 1 from public.novinky where nazov = 'Upozornenia na nové súkromné inzeráty do mobilu');

-- =====================================================================
-- Osobný web makléra (skladačka webu)
--  * weby          – web každého makléra: rozpracovaný koncept a zverejnená verzia
--  * weby_verzie   – staršie zverejnené verzie (návrat späť)
--  * web_kontakty  – kontakty z formulárov na webe (odhad ceny, strážca, obhliadka…)
--  * web_zobrazenia– počet návštev webu po dňoch (prehľad pre makléra)
-- Verejný web je bez prihlásenia: číta len cez verejny_web() a zapisuje len cez web_kontakt().
-- =====================================================================

create table if not exists public.weby (
  id bigint generated always as identity primary key,
  makler_id uuid not null unique references public.makleri(id) on delete cascade,
  adresa text not null unique check (adresa ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'),
  koncept jsonb not null default '{}',
  zverejnene jsonb,
  zverejnene_kedy timestamptz,
  domena text unique,
  upravene timestamptz not null default now(),
  vytvorene timestamptz not null default now()
);

create table if not exists public.weby_verzie (
  id bigint generated always as identity primary key,
  web_id bigint not null references public.weby(id) on delete cascade,
  obsah jsonb not null,
  kedy timestamptz not null default now(),
  kto uuid references public.makleri(id) on delete set null
);
create index if not exists weby_verzie_web on public.weby_verzie (web_id, kedy desc);

create table if not exists public.web_kontakty (
  id bigint generated always as identity primary key,
  web_id bigint not null references public.weby(id) on delete cascade,
  makler_id uuid references public.makleri(id) on delete cascade,
  zdroj text not null check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt')),
  meno text,
  kontakt text not null,
  co text not null default '',
  nehnutelnost_id bigint references public.nehnutelnosti(id) on delete set null,
  dopyt_id bigint references public.dopyty(id) on delete set null,
  vybavene timestamptz,
  vytvorene timestamptz not null default now()
);
create index if not exists web_kontakty_makler on public.web_kontakty (makler_id, vytvorene desc);

create table if not exists public.web_zobrazenia (
  web_id bigint not null references public.weby(id) on delete cascade,
  den date not null default current_date,
  pocet int not null default 0,
  primary key (web_id, den)
);

alter table public.weby enable row level security;
alter table public.weby_verzie enable row level security;
alter table public.web_kontakty enable row level security;
alter table public.web_zobrazenia enable row level security;
do $$ begin
  create policy weby_citat on public.weby for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy weby_verzie_citat on public.weby_verzie for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy web_kontakty_citat on public.web_kontakty for select to authenticated
    using (ja_aktivny() and (ja_admin() or makler_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy web_zobrazenia_citat on public.web_zobrazenia for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
revoke all on public.weby, public.weby_verzie, public.web_kontakty, public.web_zobrazenia from anon, authenticated;
grant select on public.weby, public.weby_verzie, public.web_kontakty, public.web_zobrazenia to authenticated;

-- zvonček: nový druh upozornenia „web“ (kontakt z webu)
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost', 'web'));

-- fotky, logá a videá na weby: každý maklér do svojho priečinka, čítať môže ktokoľvek
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('weby', 'weby', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'])
on conflict (id) do nothing;
do $$ begin
  create policy weby_subory_nahrat on storage.objects for insert to authenticated
    with check (bucket_id = 'weby' and public.ja_aktivny() and ((storage.foldername(name))[1] = auth.uid()::text or public.ja_admin()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy weby_subory_zmenit on storage.objects for update to authenticated
    using (bucket_id = 'weby' and public.ja_aktivny() and ((storage.foldername(name))[1] = auth.uid()::text or public.ja_admin()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy weby_subory_zmazat on storage.objects for delete to authenticated
    using (bucket_id = 'weby' and public.ja_aktivny() and ((storage.foldername(name))[1] = auth.uid()::text or public.ja_admin()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy weby_subory_citat on storage.objects for select to anon, authenticated
    using (bucket_id = 'weby');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- pomôcky
-- adresa z mena: „Jana Kováčová“ → „jana-kovacova“
create or replace function public._web_adresa(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(t, ''),
    'áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ', 'aacdeeillnoorrstuuyzAACDEEILLNOORRSTUUYZ')), '[^a-z0-9]+', '-', 'g'))
$$;

-- web prihláseného makléra (pri prvom otvorení sa založí)
create or replace function public._web_maklera(p_makler uuid) returns weby
language plpgsql security definer set search_path = public as $$
declare w weby; v_zaklad text; v_adresa text; i int := 1;
begin
  select * into w from weby where makler_id = p_makler;
  if found then return w; end if;
  v_zaklad := left(nullif(_web_adresa((select meno from makleri where id = p_makler)), ''), 40);
  if v_zaklad is null or length(v_zaklad) < 3 then v_zaklad := 'makler'; end if;
  v_adresa := v_zaklad;
  while exists (select 1 from weby where adresa = v_adresa) loop
    i := i + 1; v_adresa := v_zaklad || '-' || i;
  end loop;
  insert into weby (makler_id, adresa) values (p_makler, v_adresa) returning * into w;
  return w;
end $$;

-- web, s ktorým pracuje prihlásený maklér (administrátor môže otvoriť web iného makléra)
create or replace function public._web_na_upravu(p_makler uuid) returns weby
language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(p_makler, auth.uid());
begin
  perform _over_aktivny();
  if v <> auth.uid() and not ja_admin() then raise exception 'Web iného makléra môže upraviť len administrátor.' using errcode = '42501'; end if;
  return _web_maklera(v);
end $$;

-- ---------------------------------------------------------------- editor
create or replace function public.moj_web(p_makler uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  w := _web_na_upravu(p_makler);
  return jsonb_build_object('id', w.id, 'makler_id', w.makler_id, 'adresa', w.adresa, 'koncept', w.koncept, 'zverejnene_kedy', w.zverejnene_kedy,
    'domena', w.domena, 'upravene', w.upravene, 'zverejneny', w.zverejnene is not null,
    'zmeny_od_zverejnenia', w.zverejnene is null or w.zverejnene is distinct from w.koncept,
    'verzie', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kedy', v.kedy, 'kto', (select meno from makleri where id = v.kto)) order by v.kedy desc)
                        from (select * from weby_verzie where web_id = w.id order by kedy desc limit 30) v), '[]'::jsonb));
end $$;

create or replace function public.ulozit_web(p_koncept jsonb, p_makler uuid default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  w := _web_na_upravu(p_makler);
  if jsonb_typeof(p_koncept) <> 'object' then raise exception 'Neplatné nastavenie webu.'; end if;
  if octet_length(p_koncept::text) > 400000 then raise exception 'Nastavenie webu je príliš veľké. Obrázky nahrávajte ako súbory.'; end if;
  update weby set koncept = p_koncept, upravene = now() where id = w.id;
  return now();
end $$;

create or replace function public.zverejnit_web(p_koncept jsonb default null, p_makler uuid default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  w := _web_na_upravu(p_makler);
  if p_koncept is not null then perform ulozit_web(p_koncept, w.makler_id); end if;
  select * into w from weby where id = w.id for update;
  update weby set zverejnene = koncept, zverejnene_kedy = now() where id = w.id;
  insert into weby_verzie (web_id, obsah, kto) values (w.id, w.koncept, auth.uid());
  delete from weby_verzie where web_id = w.id and id not in (select id from weby_verzie where web_id = w.id order by kedy desc limit 30);
  return now();
end $$;

create or replace function public.obnovit_verziu_webu(p_verzia bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v weby_verzie; w weby;
begin
  perform _over_aktivny();
  select * into v from weby_verzie where id = p_verzia;
  if not found then raise exception 'Verzia neexistuje.'; end if;
  select * into w from weby where id = v.web_id;
  if w.makler_id <> auth.uid() and not ja_admin() then raise exception 'Túto verziu nemôžete obnoviť.' using errcode = '42501'; end if;
  update weby set koncept = v.obsah, upravene = now() where id = w.id;
  return v.obsah;
end $$;

create or replace function public.zmenit_adresu_webu(p_adresa text, p_makler uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare w weby; v text := _web_adresa(p_adresa);
begin
  w := _web_na_upravu(p_makler);
  if v !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' then raise exception 'Adresa môže mať 3 až 50 znakov: malé písmená bez diakritiky, číslice a pomlčky.'; end if;
  if exists (select 1 from weby where adresa = v and id <> w.id) then raise exception 'Adresa %/ je už obsadená. Skúste inú.', v; end if;
  update weby set adresa = v where id = w.id;
  return v;
end $$;

create or replace function public.ulozit_domenu_webu(p_domena text, p_makler uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare w weby; v text := nullif(lower(trim(regexp_replace(coalesce(p_domena, ''), '^(https?://)?(www\.)?|/.*$', '', 'g'))), '');
begin
  w := _web_na_upravu(p_makler);
  if v is not null and v !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'Neplatná doména. Napíšte ju v tvare mojemeno.sk'; end if;
  if v is not null and exists (select 1 from weby where domena = v and id <> w.id) then raise exception 'Túto doménu už používa iný web.'; end if;
  update weby set domena = v where id = w.id;
  return v;
end $$;

-- ---------------------------------------------------------------- verejný web
-- ponuka pre web makléra: verejné údaje + štítok „nová cena“ (cena klesla za posledných 30 dní)
create or replace function public._web_ponuka(n nehnutelnosti) returns jsonb
language sql stable security definer set search_path = public as $$
  -- historia_cien = [[dátum, nová cena], …]; nová cena = posledná zmena za 30 dní bola zníženie
  select _verejna(n) || jsonb_build_object('nova_cena', n.zobrazit_cenu and coalesce((
    with h as (select (e->>0)::date as d, (e->>1)::numeric as c, o from jsonb_array_elements(
                 case when jsonb_typeof(n.historia_cien) = 'array' then n.historia_cien else '[]'::jsonb end) with ordinality t(e, o)
               where jsonb_typeof(e) = 'array')
    select a.d > current_date - 30 and a.c < b.c from h a join h b on b.o = a.o - 1 order by a.o desc limit 1), false))
$$;

create or replace function public.verejny_web(p_adresa text, p_nahlad boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w weby; v_obsah jsonb;
begin
  select * into w from weby where adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')));
  if not found then return null; end if;
  -- náhľad konceptu vidia len prihlásení makléri kancelárie
  if p_nahlad and ja_aktivny() then v_obsah := w.koncept; else v_obsah := w.zverejnene; end if;
  if v_obsah is null then return null; end if;
  if not exists (select 1 from makleri where id = w.makler_id and aktivny) then return null; end if;
  return jsonb_build_object(
    'adresa', w.adresa, 'domena', w.domena, 'web', v_obsah, 'nahlad', p_nahlad and ja_aktivny(),
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

-- návšteva verejného webu (makléri sa nepočítajú)
create or replace function public.zaznamenat_navstevu_webu(p_adresa text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if ja_aktivny() then return; end if;
  select id into v_id from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if v_id is null then return; end if;
  insert into web_zobrazenia (web_id, den, pocet) values (v_id, current_date, 1)
    on conflict (web_id, den) do update set pocet = web_zobrazenia.pocet + 1;
end $$;

-- kontakt z formulára na webe → zoznam kontaktov makléra + zvonček (a e-mail) + pri strážcovi aj dopyt s párovaním
create or replace function public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text default null, p_co text default null,
                                               p_ponuka bigint default null, p_dopyt jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  w weby;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(coalesce(p_meno, '')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_dopyt bigint;
  v_id bigint;
  v_email boolean;
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","strazca":"Strážca ponúk","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","ebook":"E-book","kontakt":"Správa z webu"}';
begin
  select * into w from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if not found then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$';
  if not v_email and _tel_norm(v_kontakt) is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  -- ochrana pred zahltením: najviac 20 kontaktov za hodinu na jeden web
  if (select count(*) from web_kontakty where web_id = w.id and vytvorene > now() - interval '1 hour') >= 20 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if p_ponuka is not null and not exists (select 1 from nehnutelnosti where id = p_ponuka and makler_id = w.makler_id) then p_ponuka := null; end if;

  -- strážca ponúk = dopyt klienta (automaticky sa páruje s novými ponukami a inzerátmi)
  if p_zdroj = 'strazca' and p_dopyt is not null then
    insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do, popis)
    values (w.makler_id,
      case when coalesce((p_dopyt->>'prenajom')::boolean, false) then 'prenajom' else 'predaj' end,
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_dopyt->'kategorie') x where x in ('byty', 'domy', 'pozemky', 'chaty')), '{}'),
      coalesce((select array_agg(left(x, 60)) from jsonb_array_elements_text(p_dopyt->'obce') x), '{}'),
      nullif(p_dopyt->>'cena_do', '')::numeric,
      left('Strážca ponúk z webu. ' || v_co, 1000))
    returning id into v_dopyt;
    insert into dopyty_kontakty (dopyt_id, meno, telefon, email)
    values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end);
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id)
  values (w.id, w.makler_id, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id)
  values (w.makler_id, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || ': ' || coalesce(v_meno || ', ', '') || v_kontakt ||
          case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka);
  return 'ok';
end $$;

create or replace function public.vybavit_web_kontakt(p_id bigint, p_vybavene boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare k web_kontakty;
begin
  perform _over_aktivny();
  select * into k from web_kontakty where id = p_id;
  if not found then raise exception 'Kontakt neexistuje.'; end if;
  if k.makler_id is distinct from auth.uid() and not ja_admin() then raise exception 'Kontakt patrí inému maklérovi.' using errcode = '42501'; end if;
  update web_kontakty set vybavene = case when p_vybavene then now() end where id = p_id;
end $$;

-- práva na funkcie
revoke execute on function public._web_adresa(text), public._web_maklera(uuid), public._web_na_upravu(uuid), public._web_ponuka(nehnutelnosti) from public, anon, authenticated;
revoke execute on function public.moj_web(uuid), public.ulozit_web(jsonb, uuid), public.zverejnit_web(jsonb, uuid), public.obnovit_verziu_webu(bigint),
  public.zmenit_adresu_webu(text, uuid), public.ulozit_domenu_webu(text, uuid), public.vybavit_web_kontakt(bigint, boolean) from public, anon;
grant execute on function public.moj_web(uuid), public.ulozit_web(jsonb, uuid), public.zverejnit_web(jsonb, uuid), public.obnovit_verziu_webu(bigint),
  public.zmenit_adresu_webu(text, uuid), public.ulozit_domenu_webu(text, uuid), public.vybavit_web_kontakt(bigint, boolean) to authenticated;
revoke execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb) from public;
grant execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb) to anon, authenticated;

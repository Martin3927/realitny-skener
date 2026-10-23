-- 050: ochrana webu makléra (kontrola 23. 10. 2026)
-- • formuláre z webu: limit na jedného odosielateľa, zámok proti súbežným požiadavkám, kontrola strážcu ponúk
-- • súbory webov: zoznam priečinkov už nevidí každý (verejné odkazy na fotky fungujú ďalej)
-- • rozpracované weby vidí len ich maklér a admin; náhľad pre kolegu ide naďalej cez verejny_web
-- • návštevy: každý návštevník sa za deň počíta raz
-- • odkaz na e-book dostane návštevník až po vyplnení e-mailu

-- odtlačok IP adresy návštevníka (len na obmedzenie zneužitia, samotná adresa sa neukladá)
create or replace function public._klient_odtlacok() returns text
language plpgsql stable set search_path = public as $$
declare h json; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1))), '');
  if ip is null then return null; end if;
  return md5('realitny-typek-web:' || ip);
end $$;
revoke execute on function public._klient_odtlacok() from public, anon, authenticated;

alter function public._web_adresa(text) set search_path = public;

-- ---------------------------------------------------------------- kontakty z webu
alter table public.web_kontakty add column if not exists odkial text;
create index if not exists web_kontakty_web_cas on public.web_kontakty (web_id, vytvorene desc);
create index if not exists web_kontakty_odkial on public.web_kontakty (odkial, vytvorene desc) where odkial is not null;
create index if not exists web_kontakty_dopyt on public.web_kontakty (dopyt_id) where dopyt_id is not null;
create index if not exists web_kontakty_ponuka on public.web_kontakty (nehnutelnost_id) where nehnutelnost_id is not null;
create index if not exists weby_verzie_kto on public.weby_verzie (kto);

create or replace function public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text default null, p_co text default null,
                                               p_ponuka bigint default null, p_dopyt jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  w weby;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_odkial text := _klient_odtlacok();
  v_dopyt bigint;
  v_id bigint;
  v_email boolean;
  v_kat text[];
  v_obce text[];
  v_cena numeric;
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","strazca":"Strážca ponúk","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","ebook":"E-book","kontakt":"Správa z webu"}';
begin
  select * into w from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if not found or not exists (select 1 from makleri where id = w.makler_id and aktivny) then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$';
  if p_zdroj = 'ebook' and not v_email then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    -- telefón sa uloží len ako číslo, aby sa do upozornenia nedostal cudzí text
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;

  -- ochrana pred zahltením: súbežné požiadavky na jeden web idú po jednej
  perform pg_advisory_xact_lock(918273, w.id::int);
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id = w.id and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if p_ponuka is not null and not exists (select 1 from nehnutelnosti where id = p_ponuka and makler_id = w.makler_id) then p_ponuka := null; end if;

  -- strážca ponúk = dopyt klienta (automaticky sa páruje s novými ponukami a inzerátmi)
  if p_zdroj = 'strazca' and p_dopyt is not null then
    if jsonb_typeof(p_dopyt) <> 'object' then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    v_kat := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'kategorie') = 'array' then p_dopyt->'kategorie' else '[]' end) x
                        where x in ('byty', 'domy', 'pozemky', 'chaty')), '{}');
    v_obce := coalesce((select array_agg(distinct left(btrim(x), 60)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'obce') = 'array' then p_dopyt->'obce' else '[]' end) x limit 10) t
                        where btrim(x) <> ''), '{}');
    v_cena := case when (p_dopyt->>'cena_do') ~ '^\d{3,9}(\.\d{1,2})?$' then (p_dopyt->>'cena_do')::numeric end;
    if cardinality(v_kat) = 0 and cardinality(v_obce) = 0 and v_cena is null then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    -- najviac 60 strážcov z webu za mesiac; ďalšie prídu maklérovi len ako kontakt
    if (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < 60 then
      insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do, popis)
      values (w.makler_id, case when coalesce((p_dopyt->>'prenajom') = 'true', false) then 'prenajom' else 'predaj' end, v_kat, v_obce, v_cena, 'Strážca ponúk z webu.')
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
    end if;
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (w.id, w.makler_id, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id)
  values (w.makler_id, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || ': ' || coalesce(v_meno || ', ', '') || v_kontakt ||
          case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka);

  -- e-book: odkaz na stiahnutie dostane návštevník až teraz
  if p_zdroj = 'ebook' then return coalesce(nullif(w.zverejnene->'dl'->>'url', ''), 'ok'); end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- verejný web bez odkazu na e-book
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
  v_obsah := v_obsah #- '{dl,url}';
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

-- ---------------------------------------------------------------- návštevy: jeden návštevník = jedna návšteva za deň
create table if not exists public.web_navstevnici (
  web_id bigint not null references public.weby(id) on delete cascade,
  den date not null default current_date,
  odkial text not null,
  primary key (web_id, den, odkial)
);
create index if not exists web_navstevnici_den on public.web_navstevnici (den);
alter table public.web_navstevnici enable row level security;
revoke all on public.web_navstevnici from anon, authenticated;

create or replace function public.zaznamenat_navstevu_webu(p_adresa text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_odkial text := _klient_odtlacok(); n int;
begin
  if ja_aktivny() then return; end if;
  select id into v_id from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if v_id is null then return; end if;
  if v_odkial is not null then
    insert into web_navstevnici (web_id, den, odkial) values (v_id, current_date, v_odkial) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then return; end if;
    if random() < 0.02 then delete from web_navstevnici where den < current_date - 2; end if;
  end if;
  insert into web_zobrazenia (web_id, den, pocet) values (v_id, current_date, 1)
    on conflict (web_id, den) do update set pocet = web_zobrazenia.pocet + 1;
end $$;

-- ---------------------------------------------------------------- prístupy
-- rozpracované weby a domény vidí len ich maklér a admin
drop policy if exists weby_citat on public.weby;
create policy weby_citat on public.weby for select to authenticated
  using (ja_aktivny() and (ja_admin() or makler_id = (select auth.uid())));
drop policy if exists weby_verzie_citat on public.weby_verzie;
create policy weby_verzie_citat on public.weby_verzie for select to authenticated
  using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = (select auth.uid()))));
drop policy if exists web_kontakty_citat on public.web_kontakty;
create policy web_kontakty_citat on public.web_kontakty for select to authenticated
  using (ja_aktivny() and (ja_admin() or makler_id = (select auth.uid())));
drop policy if exists web_zobrazenia_citat on public.web_zobrazenia;
create policy web_zobrazenia_citat on public.web_zobrazenia for select to authenticated
  using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = (select auth.uid()))));

-- súbory webov: verejný priečinok ponúka fotky cez verejné odkazy aj bez pravidla na čítanie;
-- zoznam súborov vidí len maklér vo svojom priečinku a admin
drop policy if exists weby_subory_citat on storage.objects;
create policy weby_subory_citat on storage.objects for select to authenticated
  using (bucket_id = 'weby' and public.ja_aktivny() and ((storage.foldername(name))[1] = (select auth.uid())::text or public.ja_admin()));
update storage.buckets set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf']
where id = 'weby';

revoke execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb) from public;
grant execute on function public.verejny_web(text, boolean), public.zaznamenat_navstevu_webu(text),
  public.web_kontakt(text, text, text, text, text, bigint, jsonb) to anon, authenticated;

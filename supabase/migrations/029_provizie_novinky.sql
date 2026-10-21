-- =====================================================================
-- 1) Sekcia Provízie sa dá maklérovi vypnúť (ako ostatné sekcie)
-- 2) Novinky v aplikácii – okno „Ahoj, máš nové funkcie“ pri ďalšom otvorení
-- 3) História zmien: nezapisuje, kedy maklér videl sprievodcu alebo novinky
-- =====================================================================

-- ---------------------------------------------------------------- 3) história zmien bez technických polí
create or replace function public._zapis_historiu() returns trigger
language plpgsql security definer set search_path = public as $$
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
  insert into historia_zmien (tabulka, zaznam_id, akcia, zmeny, kto)
  values (tg_table_name,
    case tg_table_name when 'nehnutelnosti_interne' then coalesce(novy ->> 'nehnutelnost_id', stary ->> 'nehnutelnost_id')
                       else coalesce(novy ->> 'id', stary ->> 'id') end,
    case tg_op when 'INSERT' then 'vytvorenie' when 'UPDATE' then 'zmena' else 'zmazanie' end,
    case when tg_op = 'INSERT' then '{}'::jsonb else zmeny end, auth.uid());
  return null;
end $$;

-- ---------------------------------------------------------------- 1) prístup k Províziám
alter table public.makleri alter column pristup set default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat,kalendar,mapa,kataster,asistent,web,recenzie,provizie}';
-- doteraz videl Provízie každý – nikomu ich teraz nevypíname
update public.makleri set pristup = array_append(pristup, 'provizie') where not ('provizie' = any(pristup));

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'kalendar', 'mapa', 'kataster', 'asistent', 'web', 'recenzie', 'provizie')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

-- maklér s vypnutými províziami ich nedostane ani priamo z databázy
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'provizie' and policyname = 'pristup_provizie') then
    create policy pristup_provizie on public.provizie as restrictive for select to authenticated using ((select public.ma_pristup('provizie')));
  end if;
end $$;

-- ---------------------------------------------------------------- 2) novinky
create table if not exists public.novinky (
  id bigint generated always as identity primary key,
  nazov text not null,
  popis text not null default '',
  ciel text,                                   -- kam vedie „Ukáž mi“: sekcia (napr. provizie) alebo heslo / pomoc
  pre_koho text not null default 'vsetci' check (pre_koho in ('vsetci', 'admin')),
  aktivna boolean not null default true,
  vytvoril uuid references public.makleri(id) on delete set null,
  vytvorene timestamptz not null default now()
);
create index if not exists novinky_kedy on public.novinky (vytvorene desc);
alter table public.novinky enable row level security;
do $$ begin
  create policy novinky_citat on public.novinky for select to authenticated
    using (ja_aktivny() and (ja_admin() or (aktivna and pre_koho = 'vsetci')));
exception when duplicate_object then null; end $$;
revoke all on public.novinky from anon, authenticated;
grant select on public.novinky to authenticated;

-- kedy maklér naposledy videl novinky (nový maklér nedostane staré novinky – dostane sprievodcu)
-- doterajší makléri dostanú dnešné novinky (hodnota pre existujúcich = o minútu skôr), noví makléri nie
alter table public.makleri add column if not exists novinky_videne timestamptz not null default (now() - interval '1 minute');
alter table public.makleri alter column novinky_videne set default now();

create or replace function public.novinky_videne() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set novinky_videne = now() where id = auth.uid();
end $$;

create or replace function public.ulozit_novinku(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint;
begin
  perform _over_admin();
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Napíšte názov novinky.'; end if;
  if length(p->>'nazov') > 120 or length(coalesce(p->>'popis', '')) > 600 then raise exception 'Text novinky je príliš dlhý.'; end if;
  if v_id is null then
    insert into novinky (nazov, popis, ciel, pre_koho, vytvoril)
    values (trim(p->>'nazov'), trim(coalesce(p->>'popis', '')), nullif(trim(coalesce(p->>'ciel', '')), ''), coalesce(nullif(p->>'pre_koho', ''), 'vsetci'), auth.uid())
    returning id into v_id;
  else
    update novinky set nazov = trim(p->>'nazov'), popis = trim(coalesce(p->>'popis', '')), ciel = nullif(trim(coalesce(p->>'ciel', '')), ''),
      pre_koho = coalesce(nullif(p->>'pre_koho', ''), 'vsetci'), aktivna = coalesce((p->>'aktivna')::boolean, aktivna) where id = v_id;
    if not found then raise exception 'Novinka neexistuje.'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.novinky_videne(), public.ulozit_novinku(jsonb) from public, anon;
grant execute on function public.novinky_videne(), public.ulozit_novinku(jsonb) to authenticated;

-- prvé novinky (úpravy podľa pripomienok maklérov, 21. 10. 2026)
insert into public.novinky (nazov, popis, ciel, pre_koho)
select * from (values
  ('Výraznejšie tlačidlo Uložiť', 'Tlačidlo Uložiť je väčšie a pri dlhých formulároch ostáva stále dole na obrazovke. Keď máš neuložené zmeny, upozorní ťa na to. Na počítači ukladáš aj klávesmi Ctrl + S.', null, 'vsetci'),
  ('Zmena hesla hneď po ruke', 'Ťukni na svoju fotku vpravo hore – zmena hesla je hneď na začiatku profilu. Nájdeš ju aj v menu v časti Pomoc.', 'heslo', 'vsetci'),
  ('Sprievodca a novinky v menu', 'V menu pribudla časť Pomoc. Kedykoľvek si tam znova spustíš sprievodcu aplikáciou alebo pozrieš, čo je nové.', 'pomoc', 'vsetci'),
  ('Lepšie zobrazenie na mobile', 'Formuláre, provízie a nastavenia sa na telefóne zobrazujú správne a písmo v políčkach sa pri písaní už nezväčšuje.', null, 'vsetci'),
  ('Provízie sa dajú vypnúť', 'V Makléroch pri každom maklérovi zapneš alebo vypneš sekciu Provízie – rovnako ako ostatné sekcie.', 'makleri', 'admin'),
  ('Novinky pre tím píšeš sám', 'V Makléroch → Nastavenia tímu → Novinky v aplikácii pridáš novú funkciu. Každému maklérovi pri ďalšom otvorení vyskočí okno s tým, čo je nové.', 'makleri', 'admin')
) v(nazov, popis, ciel, pre_koho)
where not exists (select 1 from public.novinky);


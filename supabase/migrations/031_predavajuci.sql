-- =====================================================================
-- Predávajúci zo skenera – adresár kontaktov podľa telefónneho čísla
--  * rovnaké číslo vo viacerých inzerátoch = jeden predávajúci s celou históriou
--  * maklér k nemu dopíše meno, poznámku a „nevolať“
--  * inzerát, s ktorým sa pracovalo, sa už nedá zmazať (história sa nestratí)
-- =====================================================================

-- číslo v jednotnom tvare 0905123456 (z „+421 905 123 456“, „00421…“, „0905/123 456“…)
create or replace function public._tel_norm(t text) returns text
language sql immutable set search_path = public as $$
  select case when d ~ '^0\d{8,10}$' then d when d ~ '^9\d{8}$' then '0' || d end
  from (select regexp_replace(regexp_replace(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '^00', ''), '^421', '0') as d) x
$$;

-- telefóny inzerátov: číslo zadané maklérom má prednosť; prázdne zadané číslo = predajca požiadal o vymazanie
create or replace function public._telefony_inzeratov()
returns table (inzerat_id text, tel text, zobraz text, zdroj text)
language sql stable security definer set search_path = public as $$
  select x.inzerat_id, _tel_norm(c), trim(c), x.zdroj
  from (
    select t.inzerat_id, t.telefon, 'makler'::text as zdroj from telefony t where trim(t.telefon) <> ''
    union all
    select a.inzerat_id, a.telefon, 'text' from archiv a
     where coalesce(trim(a.telefon), '') <> '' and not exists (select 1 from telefony t where t.inzerat_id = a.inzerat_id)
  ) x
  cross join lateral regexp_split_to_table(x.telefon, '\s*[,;]\s*') c
  where _tel_norm(c) is not null
$$;
revoke execute on function public._telefony_inzeratov() from public, anon, authenticated;

-- údaje, ktoré k predávajúcemu dopíšu makléri
create table if not exists public.predajcovia (
  telefon text primary key check (telefon ~ '^0\d{8,10}$'),
  meno text,
  poznamka text,
  nevolat boolean not null default false,
  upravil uuid references public.makleri(id) on delete set null,
  upravene timestamptz not null default now()
);
alter table public.predajcovia enable row level security;
do $$ begin
  create policy predajcovia_citat on public.predajcovia for select to authenticated using (ma_pristup('inzeraty'));
exception when duplicate_object then null; end $$;
revoke all on public.predajcovia from anon, authenticated;
grant select on public.predajcovia to authenticated;

-- zoznam predávajúcich so všetkými inzerátmi a históriou kontaktov
create or replace function public.kontakty_predajcov() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  return coalesce((
    with t as (
      select distinct on (ti.inzerat_id, ti.tel) ti.* from _telefony_inzeratov() ti
    ), i as (
      select t.tel, t.zobraz, t.zdroj, z.*, coalesce(o.predajca_typ, z.predajca_typ, 'sukromny') as ptyp,
             p.makler_id as prevzal, p.posledny_vysledok,
             (select n.id from nehnutelnosti n where n.zdroj_inzerat = z.id order by n.id desc limit 1) as nehnutelnost_id
      from t join inzeraty z on z.id = t.inzerat_id
      left join oznacenia o on o.inzerat_id = z.id
      left join prevzatia p on p.inzerat_id = z.id
      where z.duplikat_z is null
    ), g as (
      select i.tel,
        (array_agg(i.zobraz order by i.prvy_krat desc))[1] as zobraz,
        (array_agg(nullif(trim(i.predajca), '') order by (i.ptyp <> 'rk') desc, i.prvy_krat desc) filter (where nullif(trim(i.predajca), '') is not null))[1] as meno_portal,
        bool_or(i.ptyp <> 'rk') as sukromny,
        count(*) as pocet,
        count(*) filter (where i.aktivny) as aktivnych,
        max(i.prvy_krat) as najnovsi,
        jsonb_agg(jsonb_build_object(
          'id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres, 'cena', i.cena,
          'plocha', i.plocha, 'url', i.url, 'portal', i.portal, 'aktivny', i.aktivny, 'prvy_krat', i.prvy_krat,
          'naposledy', i.naposledy, 'foto', i.foto, 'ptyp', i.ptyp, 'prevzal', i.prevzal,
          'posledny_vysledok', i.posledny_vysledok, 'nehnutelnost_id', i.nehnutelnost_id, 'zdroj', i.zdroj
        ) order by i.prvy_krat desc) as inzeraty,
        array_agg(i.id) as ids
      from i group by i.tel
    )
    select jsonb_agg(jsonb_build_object(
      'tel', g.tel, 'telefon', g.zobraz,
      'meno', coalesce(nullif(trim(pr.meno), ''), g.meno_portal), 'meno_vlastne', nullif(trim(pr.meno), ''), 'meno_portal', g.meno_portal,
      'poznamka', pr.poznamka, 'nevolat', coalesce(pr.nevolat, false), 'upravil', pr.upravil, 'upravene', pr.upravene,
      'sukromny', g.sukromny, 'pocet', g.pocet, 'aktivnych', g.aktivnych, 'najnovsi', g.najnovsi,
      'asi_rk', g.aktivnych >= 3 or g.pocet >= 5,
      'inzeraty', g.inzeraty,
      'hovorov', (select count(*) from aktivity a where a.inzerat_id = any(g.ids) and a.typ = 'hovor'),
      'posledny_kontakt', (select jsonb_build_object('typ', a.typ, 'vysledok', a.vysledok, 'poznamka', a.poznamka, 'makler_id', a.makler_id,
                                                     'vytvorene', a.vytvorene, 'inzerat_id', a.inzerat_id)
                           from aktivity a where a.inzerat_id = any(g.ids) and a.typ in ('hovor', 'sms', 'email')
                           order by a.vytvorene desc limit 1),
      'aktivity', coalesce((select jsonb_agg(x order by x.vytvorene desc) from (
                    select a.inzerat_id, a.makler_id, a.typ, a.vysledok, a.poznamka, a.vytvorene from aktivity a
                    where a.inzerat_id = any(g.ids) order by a.vytvorene desc limit 40) x), '[]'::jsonb)
    ) order by g.najnovsi desc)
    from g left join predajcovia pr on pr.telefon = g.tel
  ), '[]'::jsonb);
end $$;
revoke execute on function public.kontakty_predajcov() from public, anon;
grant execute on function public.kontakty_predajcov() to authenticated;

-- meno, poznámka a „nevolať“ k predávajúcemu
create or replace function public.ulozit_predajcu(p_telefon text, p_meno text, p_poznamka text, p_nevolat boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon);
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  if length(coalesce(p_meno, '')) > 120 then raise exception 'Meno je príliš dlhé.'; end if;
  if length(coalesce(p_poznamka, '')) > 2000 then raise exception 'Poznámka je príliš dlhá.'; end if;
  if coalesce(trim(p_meno), '') = '' and coalesce(trim(p_poznamka), '') = '' and not coalesce(p_nevolat, false) then
    delete from predajcovia where telefon = v_tel;
    return;
  end if;
  insert into predajcovia (telefon, meno, poznamka, nevolat, upravil, upravene)
  values (v_tel, nullif(trim(p_meno), ''), nullif(trim(p_poznamka), ''), coalesce(p_nevolat, false), auth.uid(), now())
  on conflict (telefon) do update set meno = excluded.meno, poznamka = excluded.poznamka, nevolat = excluded.nevolat,
    upravil = excluded.upravil, upravene = now();
end $$;
revoke execute on function public.ulozit_predajcu(text, text, text, boolean) from public, anon;
grant execute on function public.ulozit_predajcu(text, text, text, boolean) to authenticated;

-- vymazanie kontaktu na žiadosť predávajúceho (len administrátor):
-- číslo zmizne zo všetkých jeho inzerátov aj z adresára; inzeráty a zápisy hovorov ostanú bez čísla
create or replace function public.vymazat_predajcu(p_telefon text) returns int
language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon); v_ids text[]; n int;
begin
  perform _over_admin();
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  select array_agg(distinct inzerat_id) into v_ids from _telefony_inzeratov() where tel = v_tel;
  n := coalesce(cardinality(v_ids), 0);
  if n > 0 then
    update archiv set telefon = null where inzerat_id = any(v_ids);
    insert into telefony (inzerat_id, telefon, zadal, zadane) select x, '', auth.uid(), now() from unnest(v_ids) x
    on conflict (inzerat_id) do update set telefon = '', zadal = auth.uid(), zadane = now();
  end if;
  delete from predajcovia where telefon = v_tel;
  return n;
end $$;
revoke execute on function public.vymazat_predajcu(text) from public, anon;
grant execute on function public.vymazat_predajcu(text) to authenticated;

-- poistka: inzerát, s ktorým sa pracovalo alebo ktorý má uloženú kópiu, sa nezmaže
-- (zmiznutý inzerát skener aj tak len označí ako neaktívny)
create or replace function public._chranit_inzerat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('typek.mazat_inzerat', true), '') = 'ano' then return old; end if;
  if exists (select 1 from aktivity where inzerat_id = old.id)
     or exists (select 1 from prevzatia where inzerat_id = old.id)
     or exists (select 1 from telefony where inzerat_id = old.id)
     or exists (select 1 from archiv where inzerat_id = old.id)
     or exists (select 1 from pripomienky where inzerat_id = old.id)
     or exists (select 1 from nehnutelnosti where zdroj_inzerat = old.id) then
    return null;
  end if;
  return old;
end $$;
drop trigger if exists chranit_inzerat on public.inzeraty;
create trigger chranit_inzerat before delete on public.inzeraty for each row execute function public._chranit_inzerat();

insert into public.novinky (nazov, popis, ciel, pre_koho) values
  ('Predávajúci zo skenera v Klientoch',
   'V Klientoch je nová záložka Predávajúci. Každý predávajúci zo skenera je tam podľa telefónneho čísla so všetkými inzerátmi a celou históriou hovorov – aj keď inzerát z portálu zmizne. Dopíšeš mu meno, poznámku alebo označíš „Nevolať“. V skeneri pri inzeráte hneď uvidíš, keď ten istý človek už inzeroval a kto mu volal.',
   'predavajuci', 'vsetci');

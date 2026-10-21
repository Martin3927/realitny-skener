-- =====================================================================
-- Predávajúci označený ako realitná kancelária
--  * „Je to RK“ v Klientoch (alebo v skeneri) označí číslo ako realitku
--  * všetky jeho inzeráty sa v skeneri presunú medzi RK
--  * nové inzeráty s rovnakým číslom sa označia samé
--  * „Nie je RK“ označenie zruší (vráti sa rozpoznanie skenera)
-- =====================================================================
alter table public.predajcovia add column if not exists rk boolean not null default false;
alter table public.predajcovia add column if not exists rk_oznacil uuid references public.makleri(id) on delete set null;
alter table public.predajcovia add column if not exists rk_oznacene timestamptz;

-- označí / odznačí číslo a všetky jeho inzeráty; vráti počet inzerátov
create or replace function public._oznacit_telefon_rk(p_tel text, p_rk boolean) returns int
language plpgsql security definer set search_path = public as $$
declare v_ids text[]; n int;
begin
  select coalesce(array_agg(distinct inzerat_id), '{}') into v_ids from _telefony_inzeratov() where tel = p_tel;
  n := cardinality(v_ids);
  if p_rk then
    insert into predajcovia (telefon, rk, rk_oznacil, rk_oznacene, upravil, upravene)
    values (p_tel, true, auth.uid(), now(), auth.uid(), now())
    on conflict (telefon) do update set rk = true, rk_oznacil = auth.uid(), rk_oznacene = now();
    insert into oznacenia (inzerat_id, predajca_typ, oznacil, oznacene)
    select x, 'rk', auth.uid(), now() from unnest(v_ids) x
    on conflict (inzerat_id) do update set predajca_typ = 'rk', oznacil = auth.uid(), oznacene = now();
  else
    update predajcovia set rk = false, rk_oznacil = null, rk_oznacene = null where telefon = p_tel;
    delete from predajcovia where telefon = p_tel and not rk and not nevolat and meno is null and poznamka is null;
    delete from oznacenia where predajca_typ = 'rk' and inzerat_id = any(v_ids);
  end if;
  return n;
end $$;
revoke execute on function public._oznacit_telefon_rk(text, boolean) from public, anon, authenticated;

create or replace function public.oznacit_predajcu_rk(p_telefon text, p_rk boolean) returns int
language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon);
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  return _oznacit_telefon_rk(v_tel, coalesce(p_rk, false));
end $$;
revoke execute on function public.oznacit_predajcu_rk(text, boolean) from public, anon;
grant execute on function public.oznacit_predajcu_rk(text, boolean) to authenticated;

-- „Je to RK“ / „Nie je RK“ pri inzeráte v skeneri platí pre celé číslo predajcu
create or replace function public.oznacit_predajcu(p_inzerat text, p_typ text) returns void
language plpgsql security definer set search_path = public as $$
declare v_tel text;
begin
  perform _over_aktivny();
  if p_typ is not null and p_typ not in ('rk', 'sukromny') then raise exception 'Neplatné označenie.'; end if;
  if not exists (select 1 from inzeraty where id = p_inzerat) then raise exception 'Inzerát neexistuje.'; end if;
  insert into oznacenia (inzerat_id, predajca_typ, oznacil, oznacene) values (p_inzerat, p_typ, auth.uid(), now())
  on conflict (inzerat_id) do update set predajca_typ = excluded.predajca_typ, oznacil = excluded.oznacil, oznacene = now();
  for v_tel in select distinct tel from _telefony_inzeratov() where inzerat_id = p_inzerat loop
    if p_typ = 'rk' then
      perform _oznacit_telefon_rk(v_tel, true);
    elsif p_typ is null and exists (select 1 from predajcovia where telefon = v_tel and rk) then
      perform _oznacit_telefon_rk(v_tel, false);
    end if;
  end loop;
end $$;

-- nový inzerát s číslom realitky sa označí sám (ručné „súkromný“ sa neprepisuje)
create or replace function public._rk_podla_telefonu() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kto uuid;
begin
  select p.rk_oznacil into v_kto
  from regexp_split_to_table(coalesce(new.telefon, ''), '\s*[,;]\s*') c
  join predajcovia p on p.telefon = _tel_norm(c) and p.rk
  limit 1;
  if found then
    insert into oznacenia (inzerat_id, predajca_typ, oznacil, oznacene) values (new.inzerat_id, 'rk', v_kto, now())
    on conflict (inzerat_id) do update set predajca_typ = 'rk', oznacil = excluded.oznacil, oznacene = now()
      where oznacenia.predajca_typ is null;
  end if;
  return null;
end $$;
drop trigger if exists rk_podla_telefonu on public.archiv;
create trigger rk_podla_telefonu after insert or update of telefon on public.archiv for each row execute function public._rk_podla_telefonu();
drop trigger if exists rk_podla_telefonu on public.telefony;
create trigger rk_podla_telefonu after insert or update of telefon on public.telefony for each row execute function public._rk_podla_telefonu();

-- meno/poznámka sa pri realitke nemaže spolu so záznamom
create or replace function public.ulozit_predajcu(p_telefon text, p_meno text, p_poznamka text, p_nevolat boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon);
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  if length(coalesce(p_meno, '')) > 120 then raise exception 'Meno je príliš dlhé.'; end if;
  if length(coalesce(p_poznamka, '')) > 2000 then raise exception 'Poznámka je príliš dlhá.'; end if;
  insert into predajcovia (telefon, meno, poznamka, nevolat, upravil, upravene)
  values (v_tel, nullif(trim(p_meno), ''), nullif(trim(p_poznamka), ''), coalesce(p_nevolat, false), auth.uid(), now())
  on conflict (telefon) do update set meno = excluded.meno, poznamka = excluded.poznamka, nevolat = excluded.nevolat,
    upravil = excluded.upravil, upravene = now();
  delete from predajcovia where telefon = v_tel and not rk and not nevolat and meno is null and poznamka is null;
end $$;

-- zoznam predávajúcich: navyše údaj, či je číslo označené ako realitka
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
      'rk', coalesce(pr.rk, false), 'rk_oznacil', pr.rk_oznacil, 'rk_oznacene', pr.rk_oznacene,
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

insert into public.novinky (nazov, popis, ciel, pre_koho)
select 'Predávajúci: Je to RK',
   'V Klientoch → Predávajúci môžeš predávajúceho označiť tlačidlom Je to RK. Všetky jeho inzeráty sa v skeneri presunú medzi realitky a aj jeho nové inzeráty s rovnakým číslom sa označia samé. Rovnako funguje aj Je to RK priamo v skeneri. Označené realitky nájdeš vo filtri Realitky, kde sa dá označenie zrušiť.',
   'predavajuci', 'vsetci'
where not exists (select 1 from public.novinky where nazov = 'Predávajúci: Je to RK');

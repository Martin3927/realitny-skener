-- =====================================================================
-- Klienti → Predávajúci: maklér, ktorému predávajúci patrí
--  * predávajúci môže mať priradeného makléra (makler_id)
--  * v zozname sú aj predávajúci, ktorých inzerát v skeneri nie je (napr. prenesení z Excelu
--    alebo pridaní ručne) – ak majú makléra
--  * zoznam vracia aj maklérov, ktorí prevzali jeho inzeráty (na filter podľa makléra)
-- =====================================================================

alter table public.predajcovia add column if not exists makler_id uuid references public.makleri(id) on delete set null;

-- uloženie mena a poznámky: záznam s maklérom sa nemaže
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
  delete from predajcovia where telefon = v_tel and not rk and not nevolat and meno is null and poznamka is null and makler_id is null;
end $$;

-- priradenie predávajúceho maklérovi (null = nikto); maklér priradí sebe alebo zruší svoje, administrátor komukoľvek
create or replace function public.priradit_predajcu(p_telefon text, p_makler uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon); v_teraz uuid;
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  select makler_id into v_teraz from predajcovia where telefon = v_tel;
  if not ja_admin() then
    if p_makler is not null and p_makler <> auth.uid() then raise exception 'Predávajúceho môžete priradiť len sebe.'; end if;
    if p_makler is null and v_teraz is distinct from auth.uid() then raise exception 'Zrušiť môžete len svoje priradenie.'; end if;
    if p_makler is not null and v_teraz is not null and v_teraz <> auth.uid() then
      raise exception 'Predávajúci už patrí maklérovi %.', _meno(v_teraz);
    end if;
  end if;
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler) then raise exception 'Maklér neexistuje.'; end if;
  insert into predajcovia (telefon, makler_id, upravil, upravene) values (v_tel, p_makler, auth.uid(), now())
  on conflict (telefon) do update set makler_id = excluded.makler_id, upravil = excluded.upravil, upravene = now();
  delete from predajcovia where telefon = v_tel and not rk and not nevolat and meno is null and poznamka is null and makler_id is null;
end $$;
revoke execute on function public.priradit_predajcu(text, uuid) from public, anon;
grant execute on function public.priradit_predajcu(text, uuid) to authenticated;

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
        array_agg(i.id) as ids,
        coalesce(array_agg(distinct i.prevzal) filter (where i.prevzal is not null), '{}') as prevzali
      from i group by i.tel
    ), v as (
      select coalesce(g.tel, pr.telefon) as tel,
             coalesce(g.zobraz, substr(pr.telefon, 1, 4) || ' ' || substr(pr.telefon, 5, 3) || ' ' || substr(pr.telefon, 8)) as zobraz,
             g.meno_portal, coalesce(g.sukromny, true) as sukromny, coalesce(g.pocet, 0) as pocet, coalesce(g.aktivnych, 0) as aktivnych,
             coalesce(g.najnovsi, pr.upravene) as najnovsi, coalesce(g.inzeraty, '[]'::jsonb) as inzeraty,
             coalesce(g.ids, '{}') as ids, coalesce(g.prevzali, '{}') as prevzali, pr
      from g full join predajcovia pr on pr.telefon = g.tel
      where g.tel is not null or pr.makler_id is not null
    )
    select jsonb_agg(jsonb_build_object(
      'tel', v.tel, 'telefon', v.zobraz,
      'meno', coalesce(nullif(trim((v.pr).meno), ''), v.meno_portal), 'meno_vlastne', nullif(trim((v.pr).meno), ''), 'meno_portal', v.meno_portal,
      'poznamka', (v.pr).poznamka, 'nevolat', coalesce((v.pr).nevolat, false), 'upravil', (v.pr).upravil, 'upravene', (v.pr).upravene,
      'rk', coalesce((v.pr).rk, false), 'rk_oznacil', (v.pr).rk_oznacil, 'rk_oznacene', (v.pr).rk_oznacene,
      'makler_id', (v.pr).makler_id, 'prevzali', to_jsonb(v.prevzali),
      'sukromny', v.sukromny, 'pocet', v.pocet, 'aktivnych', v.aktivnych, 'najnovsi', v.najnovsi,
      'asi_rk', v.aktivnych >= 3 or v.pocet >= 5,
      'inzeraty', v.inzeraty,
      'hovorov', (select count(*) from aktivity a where a.inzerat_id = any(v.ids) and a.typ = 'hovor'),
      'posledny_kontakt', (select jsonb_build_object('typ', a.typ, 'vysledok', a.vysledok, 'poznamka', a.poznamka, 'makler_id', a.makler_id,
                                                     'vytvorene', a.vytvorene, 'inzerat_id', a.inzerat_id)
                           from aktivity a where a.inzerat_id = any(v.ids) and a.typ in ('hovor', 'sms', 'email')
                           order by a.vytvorene desc limit 1),
      'aktivity', coalesce((select jsonb_agg(x order by x.vytvorene desc) from (
                    select a.inzerat_id, a.makler_id, a.typ, a.vysledok, a.poznamka, a.vytvorene from aktivity a
                    where a.inzerat_id = any(v.ids) order by a.vytvorene desc limit 40) x), '[]'::jsonb)
    ) order by v.najnovsi desc)
    from v
  ), '[]'::jsonb);
end $$;
revoke execute on function public.kontakty_predajcov() from public, anon;
grant execute on function public.kontakty_predajcov() to authenticated;

-- pomocná funkcia z testovania
drop function if exists public._test_kp();

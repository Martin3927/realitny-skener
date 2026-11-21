-- =====================================================================
-- 142: Ranný prehľad pre administrátora o 7:30 – čo sa včera v kancelárii udialo a čo dnes horí
--  * do mobilu (upozornenie druhu „rano“) a v aplikácii (prehľad #rano, karta na Prehľade do obeda)
--  * administrátor si ho vypne v Môj profil (upozornenia.rano = false); predvolene zapnutý
-- =====================================================================

-- údaje prehľadu pre jednu kanceláriu (včera = včerajší deň podľa slovenského času)
create or replace function public._ranny_prehlad_data(p_k bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_od timestamptz := ((v_dnes - 1)::timestamp) at time zone 'Europe/Bratislava';
  v_do timestamptz := (v_dnes::timestamp) at time zone 'Europe/Bratislava';
  v_zajtra timestamptz := ((v_dnes + 1)::timestamp) at time zone 'Europe/Bratislava';
  v_okresy text[] := (select coalesce(okresy, '{}') from kancelarie where id = p_k);
  v_posl timestamptz;
begin
  begin v_posl := (select (meta ->> 'posledna_kontrola')::timestamptz from stav_skenera where id = 1); exception when others then v_posl := null; end;
  return jsonb_build_object(
    'den', v_dnes,
    'vcera', jsonb_build_object(
      'hovory', (select count(*) from aktivity a where a.kancelaria_id = p_k and a.typ = 'hovor' and a.vytvorene >= v_od and a.vytvorene < v_do),
      'prevzate', (select count(*) from aktivity a where a.kancelaria_id = p_k and a.typ = 'prevzatie' and a.vytvorene >= v_od and a.vytvorene < v_do),
      'stretnutia', (select count(*) from aktivity a where a.kancelaria_id = p_k and a.typ = 'hovor' and a.vysledok = 'Záujem – stretnutie dohodnuté' and a.vytvorene >= v_od and a.vytvorene < v_do),
      'ziskane', (select count(*) from aktivity a where a.kancelaria_id = p_k and a.typ = 'hovor' and a.vysledok = 'Získaný do ponuky' and a.vytvorene >= v_od and a.vytvorene < v_do),
      'nove_inzeraty', (select count(*) from inzeraty z where z.okres = any(v_okresy) and z.predajca_typ is distinct from 'rk' and z.prvy_krat >= v_od and z.prvy_krat < v_do),
      'web_kontakty', (select count(*) from web_kontakty w where w.kancelaria_id = p_k and w.vytvorene >= v_od and w.vytvorene < v_do),
      'odhady', (select count(*) from odhady_hodnoty o where o.kancelaria_id = p_k and o.vytvorene >= v_od and o.vytvorene < v_do),
      'nove_ponuky', (select count(*) from nehnutelnosti n where n.kancelaria_id = p_k and n.vytvorene >= v_od and n.vytvorene < v_do),
      'obhliadky', (select count(*) from obhliadky o where o.kancelaria_id = p_k and o.zrusena is null and o.cas >= v_od and o.cas < v_do),
      'makleri', coalesce((select jsonb_agg(x order by x.hovory desc, x.prevzate desc) from (
          select m.id, m.meno,
            (select count(*) from aktivity a where a.makler_id = m.id and a.kancelaria_id = p_k and a.typ = 'hovor' and a.vytvorene >= v_od and a.vytvorene < v_do) as hovory,
            (select count(*) from aktivity a where a.makler_id = m.id and a.kancelaria_id = p_k and a.typ = 'prevzatie' and a.vytvorene >= v_od and a.vytvorene < v_do) as prevzate
          from makleri m where m.kancelaria_id = p_k and m.aktivny) x where x.hovory > 0 or x.prevzate > 0), '[]'::jsonb)),
    'dnes', jsonb_build_object(
      'obhliadky', (select count(*) from obhliadky o where o.kancelaria_id = p_k and o.zrusena is null and o.cas >= v_do and o.cas < v_zajtra),
      'udalosti', (select count(*) from udalosti u where u.kancelaria_id = p_k and u.zrusene is null and u.zaciatok >= v_do and u.zaciatok < v_zajtra),
      'po_termine', (select count(*) from pripomienky x where x.kancelaria_id = p_k and x.hotovo is null and x.zrusena is null and x.cas < v_do
                       and x.druh in ('pripomienka', 'volat', 'obhliadka', 'udalost')),
      'po_termine_makleri', coalesce((select jsonb_agg(y order by y.n desc) from (
          select x.makler_id as id, _meno(x.makler_id) as meno, count(*) as n from pripomienky x
          where x.kancelaria_id = p_k and x.hotovo is null and x.zrusena is null and x.cas < v_do and x.druh in ('pripomienka', 'volat', 'obhliadka', 'udalost')
          group by x.makler_id) y), '[]'::jsonb),
      'zmluvy', (select count(*) from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
                   where n.kancelaria_id = p_k and i.zmluva and i.zmluva_do between v_dnes and v_dnes + 7 and n.stav not in ('predane', 'archiv')),
      'odhady_caka', (select count(*) from odhady_hodnoty o where o.kancelaria_id = p_k and o.stav = 'nova')),
    'skener', jsonb_build_object('posledna_kontrola', v_posl, 'ok', v_posl is not null and v_posl > now() - interval '2 hours'));
end $$;
revoke execute on function public._ranny_prehlad_data(bigint) from public, anon, authenticated;

-- prehľad v aplikácii – len administrátor, len jeho (aktívna) kancelária
create or replace function public.ranny_prehlad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return _ranny_prehlad_data(aktivna_kancelaria());
end $$;
revoke execute on function public.ranny_prehlad() from public, anon;
grant execute on function public.ranny_prehlad() to authenticated;

-- vypínač v Môj profil
create or replace function public.nastavit_ranny_prehlad(p_zap boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not ja_aktivny() then raise exception 'Nie ste prihlásený.'; end if;
  update makleri set upozornenia = coalesce(upozornenia, '{}'::jsonb) || jsonb_build_object('rano', coalesce(p_zap, true)) where id = auth.uid();
end $$;
revoke execute on function public.nastavit_ranny_prehlad(boolean) from public, anon;
grant execute on function public.nastavit_ranny_prehlad(boolean) to authenticated;

-- krátky text do mobilu (1 hovor / 2 hovory / 5 hovorov)
create or replace function public._sk_tvar(n int, a text, b text, c text) returns text
language sql immutable as $$ select n || ' ' || case when n = 1 then a when n between 2 and 4 then b else c end $$;
create or replace function public._ranny_prehlad_text(d jsonb) returns text
language plpgsql immutable as $$
declare
  v1 text[] := '{}'; v2 text[] := '{}';
  h int := coalesce((d #>> '{vcera,hovory}')::int, 0); p int := coalesce((d #>> '{vcera,prevzate}')::int, 0);
  z int := coalesce((d #>> '{vcera,ziskane}')::int, 0); i int := coalesce((d #>> '{vcera,nove_inzeraty}')::int, 0);
  k int := coalesce((d #>> '{vcera,web_kontakty}')::int, 0) + coalesce((d #>> '{vcera,odhady}')::int, 0);
  o int := coalesce((d #>> '{dnes,obhliadky}')::int, 0); t int := coalesce((d #>> '{dnes,po_termine}')::int, 0); zm int := coalesce((d #>> '{dnes,zmluvy}')::int, 0);
begin
  if h > 0 then v1 := v1 || _sk_tvar(h, 'hovor', 'hovory', 'hovorov'); end if;
  if p > 0 then v1 := v1 || _sk_tvar(p, 'prevzatý inzerát', 'prevzaté inzeráty', 'prevzatých inzerátov'); end if;
  if z > 0 then v1 := v1 || ('🎉 ' || _sk_tvar(z, 'získaný do ponuky', 'získané do ponuky', 'získaných do ponuky')); end if;
  if k > 0 then v1 := v1 || _sk_tvar(k, 'nový kontakt', 'nové kontakty', 'nových kontaktov'); end if;
  if i > 0 then v1 := v1 || _sk_tvar(i, 'nový súkromný inzerát', 'nové súkromné inzeráty', 'nových súkromných inzerátov'); end if;
  if o > 0 then v2 := v2 || _sk_tvar(o, 'obhliadka', 'obhliadky', 'obhliadok'); end if;
  if t > 0 then v2 := v2 || _sk_tvar(t, 'pripomienka po termíne', 'pripomienky po termíne', 'pripomienok po termíne'); end if;
  if zm > 0 then v2 := v2 || (_sk_tvar(zm, 'zmluva končí', 'zmluvy končia', 'zmlúv končí') || ' do 7 dní'); end if;
  if not coalesce((d #>> '{skener,ok}')::boolean, true) then v2 := v2 || '⚠️ skener stojí'::text; end if;
  if cardinality(v1) = 0 and cardinality(v2) = 0 then return null; end if;
  return concat_ws(' · ', case when cardinality(v1) > 0 then 'Včera: ' || array_to_string(v1, ', ') end,
                          case when cardinality(v2) > 0 then 'Dnes: ' || array_to_string(v2, ', ') end);
end $$;

-- plánovač: 7:30 slovenského času (cron beží v UTC, preto 5:30 aj 6:30 a kontrola hodiny)
create or replace function public._ranny_prehlad() returns int
language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; t text; n int := 0;
begin
  if extract(hour from now() at time zone 'Europe/Bratislava')::int <> 7 then return 0; end if;
  for r in
    select m.id, m.kancelaria_id from makleri m join kancelarie k on k.id = m.kancelaria_id
    where m.aktivny and m.rola = 'admin' and _chce_upozornenie(m.upozornenia, 'rano')
  loop
    d := _ranny_prehlad_data(r.kancelaria_id);
    t := _ranny_prehlad_text(d);
    continue when t is null;
    perform _push_zaradit(array[r.id], 'rano', '☀️ Ranný prehľad kancelárie', t, './#rano', 'typek-rano-prehlad');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._ranny_prehlad() from public, anon, authenticated;
do $$ begin perform cron.unschedule('ranny-prehlad'); exception when others then null; end $$;
select cron.schedule('ranny-prehlad', '30 5,6 * * *', 'select public._ranny_prehlad()');

-- Odhad hodnoty – byt (5. 11. 2026 13:20): rýchla voľba „Kompletná rekonštrukcia“ / „Úplne pôvodný stav“ (len vo formulári)
-- a nepovinné „Čo je ešte nové?“: vchodové dvere, stropy, nové svietidlá, nadštandardná rekonštrukcia.
-- Nadštandardná rekonštrukcia pridá k úprave mediánu +10 % (keď je v byte aspoň jedna nová časť) – spolu najviac +20 %.
-- Dvere, stropy a svietidlá sú informácia pre makléra, cenu nemenia.

create or replace function public._odhad_rek(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select nullif(jsonb_strip_nulls(jsonb_build_object(
    'elektro', case when p->>'elektro' in ('nove', 'povodne', 'neviem') then p->>'elektro' end,
    'jadro',   case when p->>'jadro'   in ('nove', 'povodne', 'neviem') then p->>'jadro' end,
    'podlahy', case when p->>'podlahy' in ('nove', 'povodne', 'neviem') then p->>'podlahy' end,
    'kuchyna', case when p->>'kuchyna' in ('nove', 'povodne', 'neviem') then p->>'kuchyna' end,
    'kedy',    case when p->>'kedy' in ('2021+', '2016-2020', '2010-2015', 'pred-2010', 'neviem') then p->>'kedy' end,
    'dalsie',  (select jsonb_agg(x order by x) from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p->'dalsie') = 'array' then p->'dalsie' else '[]' end) x
                 where x in ('dvere', 'stropy', 'svietidla')) d),
    'nadstandard', case when p->>'nadstandard' = 'true' then true end)), '{}'::jsonb)
  where jsonb_typeof(p) = 'object'
$$;

create or replace function public._odhad_rek_text(p jsonb) returns text
language sql immutable set search_path = public as $$
  with c(k, n, i) as (values ('elektro', 'elektroinštalácia', 1), ('jadro', 'bytové jadro', 2), ('podlahy', 'podlahy', 3), ('kuchyna', 'kuchynská linka', 4)),
       d(k, n, i) as (values ('dvere', 'vchodové dvere', 1), ('stropy', 'stropy', 2), ('svietidla', 'svietidlá', 3))
  select nullif(concat_ws('. ',
    'Nové: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'nove'),
    'Pôvodné: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'povodne'),
    'Neviem: ' || (select string_agg(n, ', ' order by i) from c where p->>k = 'neviem'),
    'Rekonštrukcia: ' || case p->>'kedy' when '2021+' then '2021 a neskôr' when '2016-2020' then '2016 – 2020' when '2010-2015' then '2010 – 2015'
                                         when 'pred-2010' then 'pred rokom 2010' when 'neviem' then 'nevie kedy' end,
    'Ešte nové: ' || (select string_agg(d.n, ', ' order by d.i) from d where p->'dalsie' ? d.k),
    case when p->>'nadstandard' = 'true' then 'Nadštandardná rekonštrukcia' end), '')
$$;

-- úprava ceny v percentách: časti (−10 % až +10 %) + nadštandardná rekonštrukcia +10 %
create or replace function public._odhad_uprava(p_stav text, p jsonb) returns integer
language plpgsql immutable set search_path = public as $$
declare n numeric := 0; nove int := 0; pocet int := 0; v text; k numeric;
begin
  if p_stav = 'Novostavba' or p_stav = 'Na rekonštrukciu' or p is null then return _odhad_stav_uprava(p_stav); end if;
  foreach v in array array[p->>'elektro', p->>'jadro', p->>'podlahy', p->>'kuchyna'] loop
    if v = 'nove' then n := n + 1; nove := nove + 1; pocet := pocet + 1;
    elsif v = 'neviem' then n := n + 0.5; pocet := pocet + 1;
    elsif v = 'povodne' then pocet := pocet + 1; end if;
  end loop;
  if pocet < 4 then return _odhad_stav_uprava(p_stav); end if;
  k := case p->>'kedy' when '2010-2015' then 0.5 when 'pred-2010' then 0.5 when 'neviem' then 0.75 else 1 end;
  return round(-10 + 5 * n * k) + case when p->>'nadstandard' = 'true' and nove > 0 then 10 else 0 end;
end $$;

create or replace function public._odhad_median(o public.odhady_hodnoty) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m2 numeric; v_dat date; v_zdroj text; v_obl text; v_up int; v_m2u numeric; v_stred numeric; v_nove int;
begin
  if o.typ is distinct from 'byt' or o.okres is null then return null; end if;
  if o.okres in ('Bratislava', 'Košice') then
    select round(avg(m.cena_m2)), max(m.k_datumu), max(m.zdroj) into v_m2, v_dat, v_zdroj
      from odhad_mediany m where m.typ = 'byt' and m.okres ~ ('^' || o.okres || ' [IV]+$');
    v_obl := o.okres;
  else
    select m.cena_m2, m.k_datumu, m.zdroj into v_m2, v_dat, v_zdroj
      from odhad_mediany m where m.typ = 'byt' and m.okres = o.okres;
    v_obl := 'okres ' || o.okres;
  end if;
  if v_m2 is null then return null; end if;
  v_up := _odhad_uprava(o.stav_nehn, o.rekonstrukcia);
  v_m2u := round(v_m2 * (100 + v_up) / 100.0);
  v_stred := case when o.plocha > 0 then round(v_m2u * o.plocha, -3) end;
  select count(*) into v_nove from jsonb_each_text(coalesce(o.rekonstrukcia, '{}')) e where e.key <> 'kedy' and e.value = 'nove';
  return jsonb_build_object(
    'oblast', v_obl, 'm2', v_m2, 'uprava', v_up, 'stav', o.stav_nehn, 'm2_upr', v_m2u,
    'podla_casti', coalesce(o.rekonstrukcia ?& array['elektro', 'jadro', 'podlahy', 'kuchyna'], false) and o.stav_nehn not in ('Novostavba', 'Na rekonštrukciu'),
    'nove', case when o.rekonstrukcia is not null then v_nove end,
    'kedy', o.rekonstrukcia->>'kedy',
    'nadstandard', coalesce((o.rekonstrukcia->>'nadstandard')::boolean, false) and v_nove > 0,
    'stred', v_stred,
    'od', case when v_stred is not null then round(v_stred * 0.95, -3) end,
    'do', case when v_stred is not null then round(v_stred * 1.05, -3) end,
    'zdroj', v_zdroj, 'k_datumu', v_dat);
end $$;

revoke execute on function public._odhad_rek(jsonb), public._odhad_rek_text(jsonb), public._odhad_uprava(text, jsonb) from public, anon, authenticated;

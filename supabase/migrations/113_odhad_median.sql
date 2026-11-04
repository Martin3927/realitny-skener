-- Odhad hodnoty: približná cena bytu podľa mediánu okresu.
-- Zdroj: realityradar.eu/cenova-mapa-slovenska – medián ponukových cien bytov za m² po okresoch (stav 4. 11. 2026).
-- Stav bytu upraví cenu: novostavba a kompletná rekonštrukcia +10 %, čiastočná 0 %, pôvodný stav a na rekonštrukciu −10 %.
-- Vidí len maklér v podklade odhadu (klient cenu na stránke nevidí). Aktualizácia: update odhad_mediany set cena_m2 = …, k_datumu = …

create table if not exists public.odhad_mediany (
  typ text not null default 'byt',
  okres text not null,
  cena_m2 integer not null check (cena_m2 between 100 and 20000),
  zdroj text not null default 'realityradar.eu',
  k_datumu date not null default date '2026-11-04',
  primary key (typ, okres)
);
alter table public.odhad_mediany enable row level security;
do $$ begin
  create policy odhad_mediany_citat on public.odhad_mediany for select to authenticated using (true);
exception when duplicate_object then null; end $$;
revoke all on public.odhad_mediany from anon, authenticated;
grant select on public.odhad_mediany to authenticated;

insert into public.odhad_mediany (typ, okres, cena_m2) values
  ('byt', 'Bratislava I', 5090),
  ('byt', 'Bratislava II', 4315),
  ('byt', 'Bratislava III', 4284),
  ('byt', 'Bratislava IV', 3975),
  ('byt', 'Bratislava V', 4220),
  ('byt', 'Malacky', 2913),
  ('byt', 'Pezinok', 3181),
  ('byt', 'Senec', 3167),
  ('byt', 'Gelnica', 1299),
  ('byt', 'Košice-okolie', 2114),
  ('byt', 'Košice I', 3670),
  ('byt', 'Košice II', 3573),
  ('byt', 'Košice III', 3176),
  ('byt', 'Košice IV', 3466),
  ('byt', 'Michalovce', 2087),
  ('byt', 'Rožňava', 1423),
  ('byt', 'Sobrance', 1521),
  ('byt', 'Spišská Nová Ves', 2109),
  ('byt', 'Trebišov', 1401),
  ('byt', 'Bytča', 2671),
  ('byt', 'Čadca', 2063),
  ('byt', 'Dolný Kubín', 2585),
  ('byt', 'Kysucké Nové Mesto', 2920),
  ('byt', 'Liptovský Mikuláš', 3161),
  ('byt', 'Martin', 2297),
  ('byt', 'Námestovo', 2512),
  ('byt', 'Ružomberok', 2443),
  ('byt', 'Turčianske Teplice', 2324),
  ('byt', 'Tvrdošín', 2261),
  ('byt', 'Žilina', 3156),
  ('byt', 'Bardejov', 2115),
  ('byt', 'Humenné', 1647),
  ('byt', 'Kežmarok', 2752),
  ('byt', 'Levoča', 1768),
  ('byt', 'Medzilaborce', 730),
  ('byt', 'Poprad', 3227),
  ('byt', 'Prešov', 2866),
  ('byt', 'Sabinov', 2279),
  ('byt', 'Snina', 1034),
  ('byt', 'Stará Ľubovňa', 2355),
  ('byt', 'Stropkov', 1252),
  ('byt', 'Svidník', 1658),
  ('byt', 'Vranov nad Topľou', 1711),
  ('byt', 'Dunajská Streda', 2223),
  ('byt', 'Galanta', 2284),
  ('byt', 'Hlohovec', 2271),
  ('byt', 'Piešťany', 2580),
  ('byt', 'Senica', 2077),
  ('byt', 'Skalica', 1922),
  ('byt', 'Trnava', 3214),
  ('byt', 'Banská Bystrica', 3107),
  ('byt', 'Banská Štiavnica', 2664),
  ('byt', 'Brezno', 2184),
  ('byt', 'Detva', 2099),
  ('byt', 'Krupina', 1688),
  ('byt', 'Lučenec', 1317),
  ('byt', 'Poltár', 899),
  ('byt', 'Revúca', 1038),
  ('byt', 'Rimavská Sobota', 1350),
  ('byt', 'Veľký Krtíš', 1168),
  ('byt', 'Žarnovica', 1859),
  ('byt', 'Žiar nad Hronom', 1675),
  ('byt', 'Zvolen', 2495),
  ('byt', 'Bánovce nad Bebravou', 1752),
  ('byt', 'Ilava', 2378),
  ('byt', 'Myjava', 1543),
  ('byt', 'Nové Mesto nad Váhom', 2071),
  ('byt', 'Partizánske', 1457),
  ('byt', 'Považská Bystrica', 2111),
  ('byt', 'Prievidza', 1597),
  ('byt', 'Púchov', 2480),
  ('byt', 'Trenčín', 2614),
  ('byt', 'Komárno', 1848),
  ('byt', 'Levice', 1626),
  ('byt', 'Nitra', 2703),
  ('byt', 'Nové Zámky', 1968),
  ('byt', 'Šaľa', 1930),
  ('byt', 'Topoľčany', 2061),
  ('byt', 'Zlaté Moravce', 1878)
on conflict (typ, okres) do update set cena_m2 = excluded.cena_m2, k_datumu = excluded.k_datumu, zdroj = excluded.zdroj;

-- úprava podľa stavu v percentách (stav_nehn z formulára)
create or replace function public._odhad_stav_uprava(p_stav text) returns integer
language sql immutable set search_path = public as $$
  select case p_stav
    when 'Novostavba' then 10
    when 'Po kompletnej rekonštrukcii' then 10
    when 'Pôvodný, udržiavaný' then -10
    when 'Na rekonštrukciu' then -10
    else 0 end
$$;

-- medián okresu × plocha × stav; Bratislava a Košice bez mestskej časti = priemer mestských okresov
create or replace function public._odhad_median(o public.odhady_hodnoty) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m2 numeric; v_dat date; v_zdroj text; v_obl text; v_up int; v_m2u numeric; v_stred numeric;
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
  v_up := _odhad_stav_uprava(o.stav_nehn);
  v_m2u := round(v_m2 * (100 + v_up) / 100.0);
  v_stred := case when o.plocha > 0 then round(v_m2u * o.plocha, -3) end;
  return jsonb_build_object(
    'oblast', v_obl, 'm2', v_m2, 'uprava', v_up, 'stav', o.stav_nehn, 'm2_upr', v_m2u,
    'stred', v_stred,
    'od', case when v_stred is not null then round(v_stred * 0.95, -3) end,
    'do', case when v_stred is not null then round(v_stred * 1.05, -3) end,
    'zdroj', v_zdroj, 'k_datumu', v_dat);
end $$;

create or replace function public.odhad_podklad(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o odhady_hodnoty := _odhad_moj(p_id);
begin
  return jsonb_build_object('auto', o.auto, 'median', _odhad_median(o)) || _odhad_podobne(o, 12);
end $$;

revoke execute on function public._odhad_median(public.odhady_hodnoty), public._odhad_stav_uprava(text) from public, anon, authenticated;
revoke execute on function public.odhad_podklad(bigint) from public, anon;
grant execute on function public.odhad_podklad(bigint) to authenticated;

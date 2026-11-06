-- Kontakty na predaj: ceny okresov podľa mediánu bytov (6. 11. 2026, používateľ: „zapracuj ceny, ako si ich navrhol pre okresy“)
--  * začiatočná cena okresu = medián €/m² (odhad_mediany, byty) ÷ 35, zaokrúhlené na desiatky, najmenej 40 €, najviac 150 €
--    (Levoča 50, Spišská Nová Ves 60, Prešov 80, Poprad 90, Košice I 110, Bratislava II–V 120, Bratislava I 150)
--  * zlacnenia v rovnakom pomere, ako majú spoločné ceny (napr. 50 → 40 → 30 → 10 → 5 = 100 % → 80 % → 60 % → 20 % → 10 %), zaokrúhlené na 5 €
--  * v Správe zákazníkov tlačidlo „Navrhnúť ceny podľa mediánu“ to prepočíta znova (napr. po zmene spoločných cien alebo mediánov)

create or replace function public._kontakty_navrh_cien(p_delitel numeric default 35) returns jsonb
language sql stable security definer set search_path = public as $$
  with spol as (
    select (e->>'h')::numeric h, (e->>'c')::numeric / nullif((select (x->>'c')::numeric from jsonb_array_elements(n.ceny) x order by (x->>'h')::numeric limit 1), 0) pomer
      from kontakty_nastavenie n, jsonb_array_elements(n.ceny) e where n.id = 1
  ), zaciatok as (
    select m.okres, least(150, greatest(40, round(m.cena_m2 / p_delitel, -1))) c0
      from odhad_mediany m where m.typ = 'byt' and m.cena_m2 > 0
  )
  select coalesce(jsonb_object_agg(z.okres, (
    select jsonb_agg(jsonb_build_object('h', s.h, 'c', greatest(5, round(z.c0 * s.pomer / 5) * 5)::int) order by s.h) from spol s)), '{}'::jsonb)
  from zaciatok z
$$;

-- správca: prepočítať ceny všetkých okresov (p_prepisat = false nechá okresy, ktoré už vlastné ceny majú)
create or replace function public.kontakty_ceny_podla_medianu(p_delitel numeric default 35, p_prepisat boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_navrh jsonb;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  if p_delitel is null or p_delitel not between 10 and 200 then raise exception 'Deliteľ musí byť 10 až 200.' using errcode = '22023'; end if;
  v_navrh := _kontakty_navrh_cien(p_delitel);
  update kontakty_nastavenie set ceny_okresy = case when p_prepisat then ceny_okresy || v_navrh else v_navrh || ceny_okresy end, upravene = now() where id = 1;
  return v_navrh;
end $$;
revoke execute on function public._kontakty_navrh_cien(numeric) from public, anon, authenticated;
revoke execute on function public.kontakty_ceny_podla_medianu(numeric, boolean) from public, anon;
grant execute on function public.kontakty_ceny_podla_medianu(numeric, boolean) to authenticated;

-- prvé naplnenie: všetky okresy s mediánom
update public.kontakty_nastavenie set ceny_okresy = public._kontakty_navrh_cien(35) || ceny_okresy, upravene = now() where id = 1;

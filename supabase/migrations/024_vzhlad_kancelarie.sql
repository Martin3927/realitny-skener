-- =====================================================================
-- Vzhľad kancelárie (nastavuje administrátor): farebná schéma, logo, názov,
-- vodotlač na fotky (poloha, farebná/biela, priehľadnosť, veľkosť).
-- Čítať môže ktokoľvek (prihlasovacia obrazovka a verejné stránky ponúk).
-- =====================================================================
create or replace function public.vzhlad_kancelarie() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select hodnota::jsonb - 'upravil' from nastavenia where kluc = 'vzhlad'), '{}'::jsonb)
$$;
grant execute on function public.vzhlad_kancelarie() to anon, authenticated;

create or replace function public.ulozit_vzhlad(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_schema text := coalesce(nullif(p->>'schema', ''), 'zlata');
  v_farba text := nullif(p->>'farba', '');
  v_logo text := nullif(trim(coalesce(p->>'logo', '')), '');
  v_nazov text := nullif(trim(coalesce(p->>'nazov', '')), '');
  w jsonb := coalesce(p->'vodoznak', '{}'::jsonb);
  v_poz text := coalesce(nullif(w->>'pozicia', ''), 'pd');
  v_styl text := coalesce(nullif(w->>'styl', ''), 'farebne');
  v_pr numeric := coalesce((w->>'priehladnost')::numeric, 0.62);
  v_vel numeric := coalesce((w->>'velkost')::numeric, 0.2);
  v jsonb;
begin
  perform _over_admin();
  if v_schema not in ('zlata', 'typek', 'modra', 'smaragd', 'vinova', 'oranzova', 'fialova', 'grafit', 'vlastna') then raise exception 'Neznáma farebná schéma.'; end if;
  if v_farba is not null and v_farba !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Farba musí byť v tvare #RRGGBB.'; end if;
  if v_schema = 'vlastna' and v_farba is null then raise exception 'Vyberte vlastnú farbu.'; end if;
  if v_logo is not null and (length(v_logo) > 600 or v_logo !~ '^https?://') then raise exception 'Neplatná adresa loga.'; end if;
  if length(coalesce(v_nazov, '')) > 80 then raise exception 'Názov je príliš dlhý.'; end if;
  if v_poz not in ('stred', 'pd', 'ld', 'ph', 'lh', 'dole') then raise exception 'Neznáma poloha vodotlače.'; end if;
  if v_styl not in ('farebne', 'biele') then raise exception 'Neznámy štýl vodotlače.'; end if;
  v_pr := least(1, greatest(0.1, v_pr)); v_vel := least(0.6, greatest(0.08, v_vel));
  v := jsonb_build_object('schema', v_schema, 'farba', v_farba, 'logo', v_logo, 'nazov', v_nazov,
    'vodoznak', jsonb_build_object('pozicia', v_poz, 'styl', v_styl, 'priehladnost', round(v_pr, 2), 'velkost', round(v_vel, 2)),
    'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('vzhlad', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $$;
revoke execute on function public.ulozit_vzhlad(jsonb) from public, anon;
grant execute on function public.ulozit_vzhlad(jsonb) to authenticated;

-- =====================================================================
-- Farebný režim v menu: každý maklér si môže vybrať vlastné farby
-- (makleri.farby), administrátor navyše nastaví farby celému tímu.
-- Pribudli nové farebné sady (rovnaké ako pri webe makléra).
-- =====================================================================
alter table public.makleri add column if not exists farby jsonb;

create or replace function public._over_farby(p_schema text, p_farba text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_schema not in ('zlata', 'typek', 'modra', 'smaragd', 'vinova', 'oranzova', 'fialova', 'grafit', 'tatry', 'more', 'tehla', 'slivka', 'salvia', 'noc', 'vlastna') then raise exception 'Neznáma farebná schéma.'; end if;
  if p_farba is not null and p_farba !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Farba musí byť v tvare #RRGGBB.'; end if;
  if p_schema = 'vlastna' and p_farba is null then raise exception 'Vyberte vlastnú farbu.'; end if;
end $$;

-- vlastné farby prihláseného makléra (prázdne = farby kancelárie)
create or replace function public.nastavit_moje_farby(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_schema text := nullif(p->>'schema', '');
  v_farba text := nullif(p->>'farba', '');
  v jsonb;
begin
  if auth.uid() is null then raise exception 'Nie ste prihlásený.' using errcode = '42501'; end if;
  if v_schema is null then
    update makleri set farby = null where id = auth.uid();
    return null;
  end if;
  perform _over_farby(v_schema, v_farba);
  v := jsonb_build_object('schema', v_schema, 'farba', case when v_schema = 'vlastna' then v_farba end);
  update makleri set farby = v where id = auth.uid();
  return v;
end $$;
revoke execute on function public.nastavit_moje_farby(jsonb) from public, anon;
grant execute on function public.nastavit_moje_farby(jsonb) to authenticated;

-- farby pre celý tím (len administrátor); p_prepisat = zruší aj vlastné farby ostatných
create or replace function public.nastavit_farby_timu(p_schema text, p_farba text, p_prepisat boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_farba text := nullif(p_farba, '');
  v jsonb;
  n int := 0;
begin
  perform _over_admin();
  perform _over_farby(p_schema, v_farba);
  v := coalesce((select hodnota::jsonb from nastavenia where kluc = 'vzhlad'), '{}'::jsonb)
    || jsonb_build_object('schema', p_schema, 'farba', case when p_schema = 'vlastna' then v_farba end, 'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('vzhlad', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  if p_prepisat then
    update makleri set farby = null where id <> auth.uid() and farby is not null;
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('vzhlad', v - 'upravil', 'prepisane', n);
end $$;
revoke execute on function public.nastavit_farby_timu(text, text, boolean) from public, anon;
grant execute on function public.nastavit_farby_timu(text, text, boolean) to authenticated;

-- nové sady aj v nastavení vzhľadu kancelárie
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
  v_x numeric := (w->>'x')::numeric;
  v_y numeric := (w->>'y')::numeric;
  v_w jsonb;
  v jsonb;
begin
  perform _over_admin();
  if v_schema not in ('zlata', 'typek', 'modra', 'smaragd', 'vinova', 'oranzova', 'fialova', 'grafit', 'tatry', 'more', 'tehla', 'slivka', 'salvia', 'noc', 'vlastna') then raise exception 'Neznáma farebná schéma.'; end if;
  if v_farba is not null and v_farba !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Farba musí byť v tvare #RRGGBB.'; end if;
  if v_schema = 'vlastna' and v_farba is null then raise exception 'Vyberte vlastnú farbu.'; end if;
  if v_logo is not null and (length(v_logo) > 600 or v_logo !~ '^https?://') then raise exception 'Neplatná adresa loga.'; end if;
  if length(coalesce(v_nazov, '')) > 80 then raise exception 'Názov je príliš dlhý.'; end if;
  if v_poz not in ('lh', 'hore', 'ph', 'ls', 'stred', 'ps', 'ld', 'dole', 'pd', 'vlastna') then raise exception 'Neznáma poloha vodotlače.'; end if;
  if v_styl not in ('farebne', 'biele') then raise exception 'Neznámy štýl vodotlače.'; end if;
  v_pr := least(1, greatest(0.1, v_pr)); v_vel := least(0.6, greatest(0.08, v_vel));
  v_w := jsonb_build_object('pozicia', v_poz, 'styl', v_styl, 'priehladnost', round(v_pr, 2), 'velkost', round(v_vel, 2));
  if v_poz = 'vlastna' then
    v_w := v_w || jsonb_build_object('x', round(least(1, greatest(0, coalesce(v_x, 0.5))), 3), 'y', round(least(1, greatest(0, coalesce(v_y, 0.5))), 3));
  end if;
  v := jsonb_build_object('schema', v_schema, 'farba', v_farba, 'logo', v_logo, 'nazov', v_nazov,
    'vodoznak', v_w, 'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('vzhlad', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v;
end $$;
revoke execute on function public.ulozit_vzhlad(jsonb) from public, anon;
grant execute on function public.ulozit_vzhlad(jsonb) to authenticated;

-- =====================================================================
-- Kalendár: kolegovia na udalosti (účastníci) a automatické upozornenia
-- deň vopred o 18:00 a ráno v deň udalosti o 7:00 (zvonček + email)
-- =====================================================================

alter table public.udalosti add column if not exists ucastnici uuid[] not null default '{}';
create index if not exists udalosti_ucastnici on public.udalosti using gin (ucastnici) where zrusene is null;

-- udalosť vidí aj kolega, ktorý je na nej pridaný
drop policy if exists udalosti_citat on public.udalosti;
create policy udalosti_citat on public.udalosti for select to authenticated
  using (ja_aktivny() and zrusene is null and (makler_id = auth.uid() or auth.uid() = any(ucastnici) or zdielane or ja_admin()));

-- nový druh pripomienky: udalosť z kalendára
alter table public.pripomienky add column if not exists udalost_id bigint references public.udalosti(id) on delete cascade;
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost'));
create index if not exists pripomienky_udalost on public.pripomienky (udalost_id) where udalost_id is not null;

-- prepočíta upozornenia k udalosti (zruší čakajúce a vytvorí nové pre autora a všetkých kolegov)
create or replace function public._upozornenia_udalosti(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u udalosti; v_mena text; v_cas_txt text; v_text text; v_den date; v_vecer timestamptz; v_rano timestamptz; v_komu uuid;
begin
  update pripomienky set zrusena = now()
  where udalost_id = p_id and hotovo is null and zrusena is null and email_odoslany is null;
  select * into u from udalosti where id = p_id and zrusene is null;
  if not found then return; end if;
  select string_agg(split_part(trim(m.meno), ' ', 1), ', ' order by m.meno) into v_mena
  from makleri m where m.id = u.makler_id or m.id = any(u.ucastnici);
  v_den := (u.zaciatok at time zone 'Europe/Bratislava')::date;
  v_cas_txt := case when u.cely_den then 'celý deň' else to_char(u.zaciatok at time zone 'Europe/Bratislava', 'HH24:MI') end;
  v_text := u.nazov || coalesce(' · 📍 ' || u.miesto, '') || coalesce(' · 👥 ' || v_mena, '');
  v_vecer := ((v_den - 1) + time '18:00') at time zone 'Europe/Bratislava';
  v_rano := (v_den + time '07:00') at time zone 'Europe/Bratislava';
  if not u.cely_den and v_rano >= u.zaciatok then v_rano := u.zaciatok - interval '1 hour'; end if;
  for v_komu in
    select m.id from makleri m where m.aktivny and (m.id = u.makler_id or m.id = any(u.ucastnici))
  loop
    if v_vecer > now() then
      insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh, nehnutelnost_id, udalost_id)
      values (v_komu, u.makler_id, v_vecer, '📅 Zajtra ' || v_cas_txt || ' – ' || v_text, 'udalost', u.nehnutelnost_id, u.id);
    end if;
    if v_rano > now() then
      insert into pripomienky (makler_id, vytvoril, cas, poznamka, druh, nehnutelnost_id, udalost_id)
      values (v_komu, u.makler_id, v_rano, '📅 Dnes ' || v_cas_txt || ' – ' || v_text, 'udalost', u.nehnutelnost_id, u.id);
    end if;
  end loop;
end $$;
revoke execute on function public._upozornenia_udalosti(bigint) from public, anon, authenticated;

create or replace function public.ulozit_udalost(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p->>'id', '')::bigint; u udalosti; v_z timestamptz; v_k timestamptz; v_uc uuid[];
begin
  perform _over_aktivny();
  v_z := nullif(p->>'zaciatok', '')::timestamptz; v_k := nullif(p->>'koniec', '')::timestamptz;
  if coalesce(trim(p->>'nazov'), '') = '' then raise exception 'Zadajte názov udalosti.'; end if;
  if v_z is null then raise exception 'Zadajte dátum a čas.'; end if;
  if v_k is not null and v_k < v_z then raise exception 'Koniec je skôr ako začiatok.'; end if;
  if v_id is not null then
    select * into u from udalosti where id = v_id and zrusene is null for update;
    if not found then raise exception 'Udalosť neexistuje.'; end if;
    if u.makler_id <> auth.uid() and not ja_admin() then raise exception 'Upraviť môže len autor alebo administrátor.'; end if;
  else
    insert into udalosti (makler_id, nazov, zaciatok) values (auth.uid(), trim(p->>'nazov'), v_z) returning id into v_id;
    select * into u from udalosti where id = v_id;
  end if;
  -- len aktívni kolegovia, bez autora
  select coalesce(array_agg(m.id), '{}') into v_uc from makleri m
  where m.aktivny and m.id <> u.makler_id
    and m.id::text in (select jsonb_array_elements_text(coalesce(p->'ucastnici', '[]'::jsonb)));
  update udalosti set nazov = left(trim(p->>'nazov'), 140), zaciatok = v_z, koniec = v_k,
    cely_den = coalesce((p->>'cely_den')::boolean, false), typ = coalesce(nullif(p->>'typ', ''), 'stretnutie'),
    miesto = nullif(trim(p->>'miesto'), ''), poznamka = nullif(trim(p->>'poznamka'), ''),
    nehnutelnost_id = nullif(p->>'nehnutelnost_id', '')::bigint, zdielane = coalesce((p->>'zdielane')::boolean, false),
    ucastnici = v_uc
  where id = v_id;
  perform _upozornenia_udalosti(v_id);
  return v_id;
end $$;

create or replace function public.zrusit_udalost(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare u udalosti;
begin
  perform _over_aktivny();
  select * into u from udalosti where id = p_id and zrusene is null for update;
  if not found then raise exception 'Udalosť neexistuje.'; end if;
  if u.makler_id <> auth.uid() and not ja_admin() then raise exception 'Zrušiť môže len autor alebo administrátor.'; end if;
  update udalosti set zrusene = now() where id = p_id;
  update pripomienky set zrusena = now() where udalost_id = p_id and hotovo is null and zrusena is null;
end $$;

-- odber kalendára: aj udalosti, kde je maklér pridaný ako kolega, s menami
create or replace function public._kalendar_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m makleri;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into m from makleri where kalendar_token = p_token and aktivny;
  if not found then return null; end if;
  return jsonb_build_object('meno', m.meno,
    'udalosti', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nazov', u.nazov, 'zaciatok', u.zaciatok, 'koniec', u.koniec,
        'cely_den', u.cely_den, 'miesto', u.miesto, 'poznamka', u.poznamka, 'typ', u.typ, 'upravene', u.vytvorene,
        'mena', (select string_agg(x.meno, ', ' order by x.meno) from makleri x where x.id = u.makler_id or x.id = any(u.ucastnici)),
        'moja', (u.makler_id = m.id or m.id = any(u.ucastnici))))
      from udalosti u where u.zrusene is null and (u.makler_id = m.id or m.id = any(u.ucastnici) or u.zdielane) and u.zaciatok > now() - interval '60 days'), '[]'::jsonb),
    'obhliadky', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'cas', o.cas, 'klient', o.klient_meno, 'telefon', o.klient_telefon,
        'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'miesto', concat_ws(', ', n.ulica, n.obec)))
      from obhliadky o join nehnutelnosti n on n.id = o.nehnutelnost_id
      where o.zrusena is null and o.cas > now() - interval '60 days' and (o.makler_id = m.id or n.makler_id = m.id)), '[]'::jsonb),
    'pripomienky', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'cas', p.cas, 'poznamka', p.poznamka, 'druh', p.druh))
      from pripomienky p where p.makler_id = m.id and p.zrusena is null and p.hotovo is null and p.druh in ('pripomienka', 'obhliadka')
        and p.cas > now() - interval '7 days'), '[]'::jsonb),
    'zmluvy', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'do', i.zmluva_do, 'nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'majitel', i.majitel_meno))
      from nehnutelnosti_interne i join nehnutelnosti n on n.id = i.nehnutelnost_id
      where i.zmluva and i.zmluva_do >= current_date - 7 and n.makler_id = m.id and n.stav in ('aktivne', 'rezervovane', 'neaktivne', 'koncept')), '[]'::jsonb));
end $$;
revoke execute on function public._kalendar_feed(text) from public, anon, authenticated;

revoke execute on function public.ulozit_udalost(jsonb), public.zrusit_udalost(bigint) from public, anon;
grant execute on function public.ulozit_udalost(jsonb), public.zrusit_udalost(bigint) to authenticated;

-- upozornenia aj pre udalosti, ktoré už v kalendári sú
do $$ declare r record; begin
  for r in select id from udalosti where zrusene is null and zaciatok > now() loop perform _upozornenia_udalosti(r.id); end loop;
end $$;

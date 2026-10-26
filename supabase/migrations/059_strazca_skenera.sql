-- Strážca skenera: počíta zlyhané kontroly po sebe. Po 2. zlyhaní skener pošle adminovi upozornenie do mobilu
-- (pri trvajúcej poruche znova najskôr o 3 hodiny, v noci 22:00 – 6:00 nie), po oprave správu „skener opäť funguje“.
-- Admin vidí poruchu aj v aplikácii (pruh nad inzerátmi).

create table if not exists public.skener_strazca (
  id int primary key default 1 check (id = 1),
  zlyhania int not null default 0,
  prve_zlyhanie timestamptz,
  posledne_zlyhanie timestamptz,
  posledna_chyba text,
  upozornene timestamptz,
  posledny_uspech timestamptz
);
insert into public.skener_strazca (id) values (1) on conflict do nothing;
alter table public.skener_strazca enable row level security;
revoke all on public.skener_strazca from public, anon, authenticated;
grant select on public.skener_strazca to authenticated;
drop policy if exists strazca_admin on public.skener_strazca;
create policy strazca_admin on public.skener_strazca for select to authenticated using (ja_admin());

create or replace function public._odbery_adminov() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  from push_odbery s join makleri m on m.id = s.makler_id and m.aktivny and m.rola = 'admin';
$$;
revoke execute on function public._odbery_adminov() from public, anon, authenticated;

-- skener zlyhal (volá ho krok „Strážca“ na GitHube)
create or replace function public.skener_zlyhanie(p_kluc text, p_chyba text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r skener_strazca; v_hod int := extract(hour from now() at time zone 'Europe/Bratislava')::int;
begin
  perform _over_skener(p_kluc);
  update skener_strazca set zlyhania = zlyhania + 1, prve_zlyhanie = coalesce(prve_zlyhanie, now()),
    posledne_zlyhanie = now(), posledna_chyba = left(coalesce(nullif(trim(p_chyba), ''), 'neznáma chyba'), 500)
  where id = 1 returning * into r;
  if r.zlyhania >= 2 and v_hod >= 6 and v_hod < 22
     and (r.upozornene is null or r.upozornene < now() - interval '3 hours') then
    update skener_strazca set upozornene = now() where id = 1;
    return jsonb_build_object('upozornit', true, 'zlyhania', r.zlyhania, 'od', r.prve_zlyhanie,
                              'chyba', r.posledna_chyba, 'odbery', _odbery_adminov());
  end if;
  return jsonb_build_object('upozornit', false, 'zlyhania', r.zlyhania);
end $$;

-- kontrola prebehla v poriadku: vynulovať; ak admin dostal upozornenie o poruche, vrátiť odbery na správu „opäť funguje“
create or replace function public.skener_uspech(p_kluc text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r skener_strazca;
begin
  perform _over_skener(p_kluc);
  select * into r from skener_strazca where id = 1;
  if r.zlyhania = 0 and r.posledny_uspech > now() - interval '5 minutes' then
    return jsonb_build_object('obnovene', false);
  end if;
  update skener_strazca set zlyhania = 0, prve_zlyhanie = null, upozornene = null, posledny_uspech = now() where id = 1;
  if r.upozornene is not null then
    return jsonb_build_object('obnovene', true, 'od', r.prve_zlyhanie, 'zlyhania', r.zlyhania, 'odbery', _odbery_adminov());
  end if;
  return jsonb_build_object('obnovene', false);
end $$;

grant execute on function public.skener_zlyhanie(text, text), public.skener_uspech(text) to anon;

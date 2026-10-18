-- =====================================================================
-- Posledné prihlásenie / aktivita maklérov a automatické odhlásenie
-- =====================================================================
alter table public.makleri add column if not exists naposledy_aktivny timestamptz;

-- aplikácia raz za pár minút oznámi, že maklér je aktívny
create or replace function public.som_tu() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set naposledy_aktivny = now() where id = auth.uid();
end $$;

-- admin: posledné prihlásenie heslom (z prihlasovacej služby) a posledná aktivita
create or replace function public.prihlasenia_maklerov() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform _over_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'prihlaseny', u.last_sign_in_at, 'aktivny', m.naposledy_aktivny))
    from makleri m left join auth.users u on u.id = m.id), '[]'::jsonb);
end $$;

-- čas automatického odhlásenia pri nečinnosti (v minútach, 0 = vypnuté); predvolene 60 minút
create or replace function public.nastavenia_aplikacie() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return jsonb_build_object('odhlasenie_min',
    coalesce((select hodnota::int from nastavenia where kluc = 'odhlasenie_min'), 60));
end $$;

create or replace function public.nastavit_odhlasenie(p_min int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_min is null or p_min < 0 or p_min > 1440 then raise exception 'Zadajte 0 až 1440 minút.'; end if;
  insert into nastavenia (kluc, hodnota) values ('odhlasenie_min', p_min::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
end $$;

revoke execute on function public.som_tu(), public.prihlasenia_maklerov(), public.nastavenia_aplikacie(), public.nastavit_odhlasenie(int) from public, anon;
grant execute on function public.som_tu(), public.prihlasenia_maklerov(), public.nastavenia_aplikacie(), public.nastavit_odhlasenie(int) to authenticated;

-- =====================================================================
-- Okno „Ahoj, máš nové funkcie“: vypínač pre celý tím a pre každého makléra
-- =====================================================================

-- ---------------------------------------------------------------- 1) celý tím
-- nastavenia.novinky_okno: '1' = okno vyskakuje, '0' = nevyskakuje nikomu (novinky ostanú v Pomoc → Čo je nové)
-- od 28. 10. 2026 dočasne vypnuté
insert into public.nastavenia (kluc, hodnota) values ('novinky_okno', '0')
  on conflict (kluc) do update set hodnota = excluded.hodnota;

create or replace function public.nastavenia_aplikacie() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pc int := coalesce((select hodnota::int from nastavenia where kluc = 'odhlasenie_min'), 60);
begin
  perform _over_aktivny();
  return jsonb_build_object(
    'odhlasenie_min', v_pc,
    'odhlasenie_mobil_min', coalesce((select hodnota::int from nastavenia where kluc = 'odhlasenie_mobil_min'), v_pc),
    'odkaz_text', coalesce((select hodnota from nastavenia where kluc = 'odkaz_text'), ''),
    'odkaz_zapnuty', coalesce((select hodnota = '1' from nastavenia where kluc = 'odkaz_zapnuty'), false),
    'odkaz_autor', (select hodnota from nastavenia where kluc = 'odkaz_autor'),
    'novinky_okno', coalesce((select hodnota = '1' from nastavenia where kluc = 'novinky_okno'), true));
end $$;

create or replace function public.nastavit_novinky_okno(p_zapnute boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  insert into nastavenia (kluc, hodnota) values ('novinky_okno', case when coalesce(p_zapnute, true) then '1' else '0' end)
    on conflict (kluc) do update set hodnota = excluded.hodnota;
end $$;

revoke execute on function public.nastavenia_aplikacie(), public.nastavit_novinky_okno(boolean) from public, anon;
grant execute on function public.nastavenia_aplikacie(), public.nastavit_novinky_okno(boolean) to authenticated;

-- ---------------------------------------------------------------- 2) každý maklér zvlášť
-- makleri.upozornenia ->> 'novinky' (predvolene zapnuté, rovnako ako ostatné druhy upozornení)
create or replace function public.nastavit_upozornenie_maklera(p_id uuid, p_druh text, p_zapnute boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_druh not in ('spravy', 'inzeraty', 'kontakty', 'novinky') then raise exception 'Neznámy druh upozornení.'; end if;
  update makleri set upozornenia = coalesce(upozornenia, '{}'::jsonb) || jsonb_build_object(p_druh, coalesce(p_zapnute, true))
  where id = p_id;
end $$;
revoke execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) from public, anon;
grant execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) to authenticated;

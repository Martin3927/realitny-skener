-- Automatické odhlásenie: samostatný čas pre mobil a tablet (aplikácia aj prehliadač v mobile).
-- Počítač ostáva na 'odhlasenie_min'. Kým admin čas pre mobil nenastaví, platí rovnaký ako na počítači.

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
    'odkaz_autor', (select hodnota from nastavenia where kluc = 'odkaz_autor'));
end $$;

-- mobil: 0 = vypnuté, najviac 30 dní
create or replace function public.nastavit_odhlasenie_mobil(p_min int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_min is null or p_min < 0 or p_min > 43200 then raise exception 'Zadajte 0 až 43200 minút (30 dní).'; end if;
  insert into nastavenia (kluc, hodnota) values ('odhlasenie_mobil_min', p_min::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
end $$;

revoke execute on function public.nastavenia_aplikacie(), public.nastavit_odhlasenie_mobil(int) from public, anon;
grant execute on function public.nastavenia_aplikacie(), public.nastavit_odhlasenie_mobil(int) to authenticated;

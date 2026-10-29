-- Rýchlejšie spúšťanie a menej mobilných dát v aplikácii
-- 1) čas poslednej zmeny pri inzerátoch a odhadoch – aplikácia namiesto celého zoznamu každých 10 minút
--    sťahuje len to, čo sa zmenilo (celý zoznam už len raz za hodinu)
-- 2) zoznam inzerátov bez popisu – popisy (takmer polovica údajov) dotiahne aplikácia hneď po zobrazení zoznamu

alter table public.inzeraty add column if not exists zmenene timestamptz not null default now();
alter table public.odhady add column if not exists zmenene timestamptz not null default now();
create index if not exists inzeraty_zmenene_idx on public.inzeraty (zmenene);
create index if not exists odhady_zmenene_idx on public.odhady (zmenene);

-- čas sa posunie len pri skutočnej zmene riadku (zápis rovnakých údajov ho nemení)
create or replace function public._zmenene_teraz() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.zmenene := now();
  elsif (to_jsonb(new) - 'zmenene') is distinct from (to_jsonb(old) - 'zmenene') then
    new.zmenene := now();
  end if;
  return new;
end $$;

drop trigger if exists inzeraty_zmenene on public.inzeraty;
create trigger inzeraty_zmenene before insert or update on public.inzeraty
  for each row execute function public._zmenene_teraz();
drop trigger if exists odhady_zmenene on public.odhady;
create trigger odhady_zmenene before insert or update on public.odhady
  for each row execute function public._zmenene_teraz();

-- inzeráty bez popisu (bez duplicít), po stranách najviac 1000, spolu s časom servera (od neho sa potom sťahujú zmeny);
-- práva ako pri bežnom čítaní tabuľky (security invoker → platia pravidlá prístupu)
create or replace function public.inzeraty_zoznam(p_od int default 0, p_pocet int default 1000) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('cas', now(), 'riadky', coalesce((
    select jsonb_agg(to_jsonb(i) - 'popis' order by i.id)
    from (
      select * from inzeraty
      where duplikat_z is null
      order by id
      offset greatest(coalesce(p_od, 0), 0)
      limit least(greatest(coalesce(p_pocet, 1000), 1), 1000)
    ) i), '[]'::jsonb))
$$;

-- inzeráty (aj s popisom, aj duplicity – aby ich aplikácia vyradila) a odhady zmenené od daného času;
-- najviac 501 / 1001 riadkov – pri viacerých aplikácia načíta všetko znova
create or replace function public.zmeny_inzeratov(p_od timestamptz) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'cas', now(),
    'inzeraty', coalesce((select jsonb_agg(to_jsonb(i)) from (
      select * from inzeraty where zmenene > p_od order by zmenene limit 501) i), '[]'::jsonb),
    'odhady', coalesce((select jsonb_agg(to_jsonb(o)) from (
      select * from odhady where zmenene > p_od order by zmenene limit 1001) o), '[]'::jsonb))
$$;

revoke execute on function public.inzeraty_zoznam(int, int), public.zmeny_inzeratov(timestamptz) from public, anon;
grant execute on function public.inzeraty_zoznam(int, int), public.zmeny_inzeratov(timestamptz) to authenticated;

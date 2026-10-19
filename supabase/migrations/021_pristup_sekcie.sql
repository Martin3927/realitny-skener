-- =====================================================================
-- Prístup maklérov k sekciám (nastavuje administrátor):
--   inzeraty (Realitný skener), schrankovanie, nehnutelnosti, klienti, chat
-- Výkon a Makléri má vždy len administrátor. Administrátor vidí všetko.
-- Prístup sa stráži aj v databáze (doplnkové obmedzujúce pravidlá na čítanie).
-- =====================================================================
alter table public.makleri add column if not exists pristup text[] not null
  default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat}';

create or replace function public.ma_pristup(p_sekcia text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri where id = auth.uid() and aktivny and (rola = 'admin' or p_sekcia = any(pristup)))
$$;
grant execute on function public.ma_pristup(text) to authenticated;

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;
revoke execute on function public.nastavit_pristup_maklera(uuid, text[]) from public, anon;
grant execute on function public.nastavit_pristup_maklera(uuid, text[]) to authenticated;

-- obmedzujúce pravidlá (platia popri existujúcich – riadok musí prejsť oboma)
do $$
declare t record;
begin
  for t in select * from (values
      ('inzeraty', 'inzeraty'), ('prevzatia', 'inzeraty'), ('odhady', 'inzeraty'), ('aktivity', 'inzeraty'),
      ('archiv', 'inzeraty'), ('telefony', 'inzeraty'), ('oznacenia', 'inzeraty'),
      ('schrankovanie', 'schrankovanie'), ('schrankovanie_akcie', 'schrankovanie'),
      ('nehnutelnosti', 'nehnutelnosti'), ('nehnutelnosti_interne', 'nehnutelnosti'), ('obhliadky', 'nehnutelnosti'), ('zobrazenia_ponuk', 'nehnutelnosti'),
      ('dopyty', 'klienti'), ('dopyty_kontakty', 'klienti'),
      ('spravy', 'chat')) v(tab, sekcia)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t.tab and policyname = 'pristup_' || t.tab) then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using ((select public.ma_pristup(%L)))',
                     'pristup_' || t.tab, t.tab, t.sekcia);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 143: Výročie obchodu – rok (a každý ďalší rok) po predaji pripomenie maklérovi, aby majiteľovi poslal pozdrav
--  * zapína administrátor pre celú kanceláriu (nastavenia_kancelarie.vyrocia, predvolene vypnuté)
--  * nehnutelnosti.predane_kedy – kedy ponuka prešla do stavu „predané“ (staršie podľa histórie zmien)
--  * pripomienka v zvončeku a v mobile v deň výročia o 9:00; pripravená správa je pri ponuke (Výročie predaja)
-- =====================================================================
alter table public.nehnutelnosti add column if not exists predane_kedy timestamptz;
alter table public.nehnutelnosti add column if not exists vyrocie_pripomenute date;

update public.nehnutelnosti n set predane_kedy = coalesce(
  (select max(h.kedy) from historia_zmien h where h.tabulka = 'nehnutelnosti' and h.zaznam_id = n.id::text and h.zmeny -> 'stav' ->> 1 = 'predane'),
  n.upravene)
where n.stav = 'predane' and n.predane_kedy is null;

create or replace function public._predane_kedy() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.stav = 'predane' and (tg_op = 'INSERT' or old.stav is distinct from 'predane') then new.predane_kedy := coalesce(new.predane_kedy, now());
  elsif new.stav is distinct from 'predane' then new.predane_kedy := null;
  end if;
  return new;
end $$;
revoke execute on function public._predane_kedy() from public, anon, authenticated;
drop trigger if exists predane_kedy on public.nehnutelnosti;
create trigger predane_kedy before insert or update of stav on public.nehnutelnosti for each row execute function public._predane_kedy();

-- vypínač kancelárie
create or replace function public.vyrocia_zapnute() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select hodnota = '1' from nastavenia_kancelarie where kancelaria_id = aktivna_kancelaria() and kluc = 'vyrocia'), false)
$$;
revoke execute on function public.vyrocia_zapnute() from public, anon;
grant execute on function public.vyrocia_zapnute() to authenticated;

create or replace function public.nastavit_vyrocia(p_zap boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  insert into nastavenia_kancelarie (kancelaria_id, kluc, hodnota) values (aktivna_kancelaria(), 'vyrocia', case when coalesce(p_zap, false) then '1' else '0' end)
    on conflict (kancelaria_id, kluc) do update set hodnota = excluded.hodnota;
end $$;
revoke execute on function public.nastavit_vyrocia(boolean) from public, anon;
grant execute on function public.nastavit_vyrocia(boolean) to authenticated;

-- plánovač: ráno o 8:xx slovenského času založí pripomienky na 9:00 (cron beží v UTC, preto 6 aj 7 a kontrola hodiny)
drop function if exists public._vyrocia_obchodov();
create or replace function public._vyrocia_obchodov(p_hned boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; n int := 0;
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_cas timestamptz := (v_dnes::timestamp + time '09:00') at time zone 'Europe/Bratislava';
  v_md text := to_char(v_dnes, 'MM-DD');
  v_prestupny boolean := extract(day from (date_trunc('year', v_dnes) + interval '2 months - 1 day'))::int = 29;
begin
  if not p_hned and extract(hour from now() at time zone 'Europe/Bratislava')::int <> 8 then return 0; end if;
  for r in
    select n.id, n.kancelaria_id, n.predane_kedy, coalesce(nullif(n.nazov, ''), n.typ, 'nehnuteľnosť') as nazov,
      coalesce((select m.id from makleri m where m.id = n.makler_id and m.aktivny and m.kancelaria_id = n.kancelaria_id),
               (select m.id from makleri m where m.kancelaria_id = n.kancelaria_id and m.aktivny and m.rola = 'admin' order by m.id limit 1)) as komu,
      (select i.majitel_meno from nehnutelnosti_interne i where i.nehnutelnost_id = n.id) as majitel,
      extract(year from v_dnes)::int - extract(year from n.predane_kedy at time zone 'Europe/Bratislava')::int as rokov
    from nehnutelnosti n
    where n.stav = 'predane' and n.predane_kedy is not null
      and n.vyrocie_pripomenute is distinct from v_dnes
      and (n.predane_kedy at time zone 'Europe/Bratislava')::date < v_dnes - 300
      and (to_char(n.predane_kedy at time zone 'Europe/Bratislava', 'MM-DD') = v_md
           or (v_md = '02-28' and not v_prestupny and to_char(n.predane_kedy at time zone 'Europe/Bratislava', 'MM-DD') = '02-29'))
      and exists (select 1 from nastavenia_kancelarie s where s.kancelaria_id = n.kancelaria_id and s.kluc = 'vyrocia' and s.hodnota = '1')
  loop
    continue when r.komu is null or r.rokov < 1;
    insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh, kancelaria_id)
    values (r.komu, r.id, v_cas,
      left('🎂 Výročie predaja: pred ' || case when r.rokov = 1 then 'rokom' else r.rokov || ' rokmi' end || ' si predal(a) ' || r.nazov ||
        coalesce(' (majiteľ ' || nullif(r.majitel, '') || ')', '') || '. Pošli pozdrav – správu nájdeš pri ponuke v časti Výročie predaja.', 500),
      'pripomienka', r.kancelaria_id);
    update nehnutelnosti set vyrocie_pripomenute = v_dnes where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._vyrocia_obchodov(boolean) from public, anon, authenticated;
do $$ begin perform cron.unschedule('vyrocia-obchodov'); exception when others then null; end $$;
select cron.schedule('vyrocia-obchodov', '3 6,7 * * *', 'select public._vyrocia_obchodov()');

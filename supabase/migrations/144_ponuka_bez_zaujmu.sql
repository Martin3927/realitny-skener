-- =====================================================================
-- 144: Ponuka bez záujmu – keď aktívna ponuka 45 dní nemala obhliadku, maklér dostane ráno pripomienku
--  * pri ponuke v aplikácii je porovnanie s konkurenciou zo skenera a návrh rozhovoru s majiteľom (AI asistent)
--  * pripomína sa najviac raz za 30 dní pri jednej ponuke, najviac 3 ponuky denne jednému maklérovi
-- =====================================================================
alter table public.nehnutelnosti add column if not exists bez_zaujmu_pripomenute date;

create or replace function public._ponuky_bez_zaujmu(p_hned boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; n int := 0;
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_cas timestamptz := (v_dnes::timestamp + time '09:00') at time zone 'Europe/Bratislava';
begin
  if not p_hned and extract(hour from now() at time zone 'Europe/Bratislava')::int <> 8 then return 0; end if;
  for r in
    select x.* from (
      select n.id, n.kancelaria_id, n.makler_id, coalesce(nullif(n.nazov, ''), n.typ, 'ponuka') as nazov,
        (now()::date - greatest(n.vytvorene, coalesce((select max(o.cas) from obhliadky o where o.nehnutelnost_id = n.id and o.zrusena is null and o.cas <= now()), n.vytvorene))::date) as dni,
        row_number() over (partition by n.makler_id order by n.vytvorene) as poradie
      from nehnutelnosti n
      join makleri m on m.id = n.makler_id and m.aktivny
      where n.stav = 'aktivne' and n.vytvorene < now() - interval '45 days'
        and (n.bez_zaujmu_pripomenute is null or n.bez_zaujmu_pripomenute < v_dnes - 30)
        and not exists (select 1 from obhliadky o where o.nehnutelnost_id = n.id and o.zrusena is null and o.cas > now() - interval '45 days' and o.cas <= now())
    ) x where x.dni >= 45 and x.poradie <= 3
  loop
    insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh, kancelaria_id)
    values (r.makler_id, r.id, v_cas,
      left('📉 Ponuka bez záujmu: ' || r.nazov || ' – ' || r.dni || ' dní bez obhliadky. Pri ponuke nájdeš porovnanie s konkurenciou a návrh rozhovoru s majiteľom o cene.', 500),
      'pripomienka', r.kancelaria_id);
    update nehnutelnosti set bez_zaujmu_pripomenute = v_dnes where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._ponuky_bez_zaujmu(boolean) from public, anon, authenticated;
do $$ begin perform cron.unschedule('ponuky-bez-zaujmu'); exception when others then null; end $$;
select cron.schedule('ponuky-bez-zaujmu', '9 6,7 * * *', 'select public._ponuky_bez_zaujmu()');

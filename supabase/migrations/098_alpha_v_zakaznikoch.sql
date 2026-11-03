-- =====================================================================
-- Alpha Reality v Správe zákazníkov ako vlastná kancelária Týpka (stav „vlastna“ – bez platieb a skúšobnej doby)
-- a okresy zákazníka → okresy jeho kancelárie (čo kancelária vidí v skeneri). Prázdny zoznam okresov sa neprenesie,
-- aby kancelária omylom neprišla o všetky inzeráty.
-- =====================================================================
alter table public.zakaznici drop constraint if exists zakaznici_stav_check;
alter table public.zakaznici add constraint zakaznici_stav_check
  check (stav in ('zaujemca', 'skusobna', 'aktivny', 'pozastaveny', 'zruseny', 'vlastna'));

-- okresy pre skener: aj vlastné kancelárie
create or replace function public._skener_okresy()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct o order by o), '{}') from (
    select unnest(okresy) o from kancelarie where aktivna
    union all
    select unnest(okresy) from zakaznici
    where 'skener' = any(moduly)
      and (stav in ('aktivny', 'vlastna') or (stav = 'skusobna' and coalesce(skusobna_do, current_date) >= current_date - 7))
  ) x where nullif(trim(o), '') is not null
$$;

create or replace function public._zakaznik_okresy_kancelarii()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if cardinality(coalesce(new.okresy, '{}')) > 0 then
    update kancelarie set okresy = new.okresy where zakaznik_id = new.id and okresy is distinct from new.okresy;
  end if;
  return null;
end $$;
revoke execute on function public._zakaznik_okresy_kancelarii() from public, anon, authenticated;
drop trigger if exists zakaznik_okresy_kancelarii on public.zakaznici;
create trigger zakaznik_okresy_kancelarii after update of okresy on public.zakaznici
  for each row execute function public._zakaznik_okresy_kancelarii();

-- Alpha Reality = kancelária 1
do $$
declare v_id bigint;
begin
  if exists (select 1 from kancelarie where id = 1 and zakaznik_id is null) then
    insert into zakaznici (typ, nazov, web, stav, moduly, okresy, pocet_maklerov, zdroj, poznamky)
    select 'kancelaria', k.nazov, 'https://www.alphareality.sk', 'vlastna',
           array['skener', 'web', 'kancelaria', 'ponuky', 'klienti_aml', 'dokumenty', 'emailing', 'ai', 'pracovny_email'],
           k.okresy, (select count(*) from makleri m where m.kancelaria_id = 1 and m.aktivny),
           'Týpek – vlastná kancelária', 'Kancelária č. 1 v Týpkovi – vlastná, neplatí. Okresy tu určujú, čo kancelária vidí v skeneri.'
    from kancelarie k where k.id = 1
    returning id into v_id;
    update kancelarie set zakaznik_id = v_id where id = 1;
  end if;
end $$;

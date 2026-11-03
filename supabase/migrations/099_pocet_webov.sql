-- =====================================================================
-- Počet osobných webov maklérov, ktorý má zákazník (kancelária) objednaný.
-- Cena za web podľa počtu (mesačne s DPH, rozhodnutie 3. 11. 2026): 1 web 57 €, 2–4 po 45 €, 5–9 po 35 €, od 10 po 29 €.
-- kancelarie.pocet_webov: koľko maklérov môže mať web (null = bez obmedzenia – vlastná kancelária Týpka);
-- stráženie v aplikácii a databáze pribudne v 4. kroku. Prenáša sa zo zákazníka rovnako ako okresy.
-- =====================================================================
alter table public.zakaznici add column if not exists pocet_webov integer not null default 1;
do $$ begin
  alter table public.zakaznici add constraint zakaznici_pocet_webov_check check (pocet_webov >= 0);
exception when duplicate_object then null; end $$;
alter table public.kancelarie add column if not exists pocet_webov integer;

create or replace function public._zakaznik_okresy_kancelarii()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- okresy: prázdny zoznam sa neprenesie, aby kancelária omylom neprišla o všetky inzeráty
  if cardinality(coalesce(new.okresy, '{}')) > 0 then
    update kancelarie set okresy = new.okresy where zakaznik_id = new.id and okresy is distinct from new.okresy;
  end if;
  update kancelarie set pocet_webov = case when new.stav = 'vlastna' then null else new.pocet_webov end
  where zakaznik_id = new.id
    and pocet_webov is distinct from case when new.stav = 'vlastna' then null else new.pocet_webov end;
  return null;
end $$;
drop trigger if exists zakaznik_okresy_kancelarii on public.zakaznici;
create trigger zakaznik_okresy_kancelarii after update of okresy, pocet_webov, stav on public.zakaznici
  for each row execute function public._zakaznik_okresy_kancelarii();

-- vlastná kancelária Týpka: weby bez obmedzenia, v Správe zákazníkov počet aktívnych maklérov
update public.zakaznici set pocet_webov = greatest(pocet_maklerov, 1) where stav = 'vlastna' and pocet_webov = 1;

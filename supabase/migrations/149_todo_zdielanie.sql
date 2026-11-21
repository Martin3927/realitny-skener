-- =====================================================================
-- 149: Zdieľanie úloh v ToDo Liste medzi kolegami
--  * autor úlohy ju môže zdieľať s kolegami z kancelárie, ktorí používajú ToDo List (administrátor alebo právo „todo“)
--  * kolega ju vidí vo svojom ToDo Liste, môže ju upraviť (text, podrobnosti, termín, dôležité) a odkliknúť;
--    skupinu, prepojenie a zdieľanie mení len autor, zmazať ju môže len autor (kolega sa z nej môže odobrať)
--  * kto úlohu odklikol, sa zapíše (hotovo_kto); upozornenie do mobilu pri zdieľaní a keď ju splní niekto iný
--    (druh upozornení „pripomienky“ – vypína sa rovnako ako pripomienky)
--  * úlohy, ktoré nikto nezdieľa, ostávajú ako doteraz len pre autora – ani administrátor ich nevidí
-- =====================================================================
alter table public.poznamky add column if not exists zdielane uuid[] not null default '{}';
alter table public.poznamky add column if not exists hotovo_kto uuid;
alter table public.poznamky drop constraint if exists poznamky_zdielane_max;
alter table public.poznamky add constraint poznamky_zdielane_max check (cardinality(zdielane) <= 20);
create index if not exists poznamky_zdielane on public.poznamky using gin (zdielane);

-- kolegovia, s ktorými autor smie úlohu zdieľať: aktívni v jeho kancelárii a s ToDo Listom
create or replace function public._todo_kolegovia(p_autor uuid, p_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.id), '{}')
  from makleri m join makleri a on a.id = p_autor
  where m.id = any(coalesce(p_ids, '{}')) and m.id <> p_autor and m.aktivny
    and m.kancelaria_id = a.kancelaria_id and (m.rola = 'admin' or 'todo' = any(coalesce(m.pristup, '{}')))
$$;
revoke execute on function public._todo_kolegovia(uuid, uuid[]) from public, anon, authenticated;

drop policy if exists poznamky_citanie on public.poznamky;
create policy poznamky_citanie on public.poznamky for select to authenticated
  using (makler_id = (select auth.uid()) or (select auth.uid()) = any(zdielane));
drop policy if exists poznamky_uprava on public.poznamky;
create policy poznamky_uprava on public.poznamky for update to authenticated
  using (makler_id = (select auth.uid()) or (select auth.uid()) = any(zdielane))
  with check ((select public.ja_aktivny()) and (makler_id = (select auth.uid()) or (select auth.uid()) = any(zdielane)));

create or replace function public._poznamky_pred() returns trigger
language plpgsql security definer set search_path = public as $$
declare autor boolean;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from poznamky where makler_id = new.makler_id) >= 2000 then
      raise exception 'Poznámok je priveľa (najviac 2 000) – zmaž staré hotové.' using errcode = 'P0001';
    end if;
    new.vytvorene := now();
  else
    new.makler_id := old.makler_id;
    new.vytvorene := old.vytvorene;
    -- kolega (nie autor) mení len text, podrobnosti, termín, dôležité a hotovo
    autor := auth.uid() is null or auth.uid() = old.makler_id;
    if not autor then
      new.skupina := old.skupina; new.odkaz := old.odkaz;
      -- zo zdieľania sa smie odobrať len sám seba
      if new.zdielane is distinct from array_remove(old.zdielane, auth.uid()) then new.zdielane := old.zdielane; end if;
    end if;
  end if;
  new.text := btrim(new.text);
  new.skupina := nullif(btrim(coalesce(new.skupina, '')), '');
  new.detail := nullif(btrim(coalesce(new.detail, '')), '');
  if tg_op = 'INSERT' or new.zdielane is distinct from old.zdielane then
    new.zdielane := _todo_kolegovia(new.makler_id, new.zdielane);
  end if;
  if new.hotovo and (tg_op = 'INSERT' or not old.hotovo) then new.hotovo_kedy := now(); new.hotovo_kto := coalesce(auth.uid(), new.makler_id); end if;
  if not new.hotovo then new.hotovo_kedy := null; new.hotovo_kto := null; end if;
  if tg_op = 'UPDATE' and new.hotovo and old.hotovo then new.hotovo_kto := old.hotovo_kto; end if;
  new.upravene := now();
  return new;
end $$;
revoke execute on function public._poznamky_pred() from public, anon, authenticated;

-- upozornenia: nový kolega v zdieľaní; úlohu splnil niekto iný
create or replace function public._poznamky_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare nove uuid[]; kto uuid := coalesce(auth.uid(), new.makler_id); ostatni uuid[];
begin
  nove := array(select x from unnest(new.zdielane) x where tg_op = 'INSERT' or not (x = any(old.zdielane)));
  if cardinality(nove) > 0 and not new.hotovo then
    perform _push_zaradit(nove, 'pripomienky', '✅ ' || _meno(new.makler_id) || ' · zdieľaná úloha', new.text, './#poznamky', 'typek-todo-' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.hotovo and not old.hotovo then
    ostatni := array(select x from unnest(array_append(new.zdielane, new.makler_id)) x where x <> kto);
    if cardinality(new.zdielane) > 0 and cardinality(ostatni) > 0 then
      perform _push_zaradit(ostatni, 'pripomienky', '✓ Hotovo · ' || _meno(kto), new.text, './#poznamky', 'typek-todo-' || new.id);
    end if;
  end if;
  return new;
exception when others then return new;
end $$;
revoke execute on function public._poznamky_push() from public, anon, authenticated;
drop trigger if exists poznamky_push on public.poznamky;
create trigger poznamky_push after insert or update of zdielane, hotovo on public.poznamky for each row execute function public._poznamky_push();

-- kolega sa zo zdieľanej úlohy odoberie (prestane ju vidieť)
create or replace function public.todo_odobrat_sa(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update poznamky set zdielane = array_remove(zdielane, auth.uid()) where id = p_id and auth.uid() = any(zdielane);
  if not found then raise exception 'Úloha sa nenašla.'; end if;
end $$;
revoke execute on function public.todo_odobrat_sa(bigint) from public, anon;
grant execute on function public.todo_odobrat_sa(bigint) to authenticated;

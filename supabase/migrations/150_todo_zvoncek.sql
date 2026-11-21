-- =====================================================================
-- 150: Zdieľané úlohy ToDo Listu aj v zvončeku a na prehľade (nielen do mobilu)
--  * pri zdieľaní dostane kolega pripomienku druhu „todo“ (zvonček na počítači aj v mobile, karta na prehľade);
--    keď úlohu niekto splní, dostanú ju ostatní účastníci
--  * e-mail a ďalší push sa neposiela (push ide z _poznamky_push hneď), preto email_odoslany a push_odoslany = now()
--  * keď kolega úlohu splní, odoberie sa z nej alebo mu ju autor prestane zdieľať, jeho upozornenie zmizne
--  * tieto upozornenia vidí len ten, komu patria – ani administrátor (ToDo List je súkromný)
-- =====================================================================
alter table public.pripomienky add column if not exists poznamka_id bigint references public.poznamky(id) on delete cascade;
create index if not exists pripomienky_poznamka on public.pripomienky (poznamka_id) where poznamka_id is not null;
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk check (druh = any (array['pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost', 'web', 'volat', 'zakaznik', 'navrat', 'todo']));

drop policy if exists pripomienky_todo_len_moje on public.pripomienky;
create policy pripomienky_todo_len_moje on public.pripomienky as restrictive for all to authenticated
  using (coalesce(druh, '') <> 'todo' or makler_id = (select auth.uid()))
  with check (coalesce(druh, '') <> 'todo' or makler_id = (select auth.uid()));

create or replace function public._poznamky_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare nove uuid[]; prec uuid[]; kto uuid := coalesce(auth.uid(), new.makler_id); ostatni uuid[];
begin
  nove := array(select x from unnest(new.zdielane) x where tg_op = 'INSERT' or not (x = any(old.zdielane)));
  if cardinality(nove) > 0 and not new.hotovo then
    insert into pripomienky (makler_id, cas, poznamka, druh, poznamka_id, email_odoslany, push_odoslany)
    select x, now(), left(_meno(new.makler_id) || ' ti zdieľa úlohu: ' || new.text, 500), 'todo', new.id, now(), now() from unnest(nove) x;
    begin
      perform _push_zaradit(nove, 'pripomienky', '✅ ' || _meno(new.makler_id) || ' · zdieľaná úloha', new.text, './#poznamky', 'typek-todo-' || new.id);
    exception when others then null;
    end;
  end if;
  if tg_op = 'UPDATE' then
    -- komu sa úloha prestala zdieľať, tomu zmizne aj upozornenie
    prec := array(select x from unnest(old.zdielane) x where not (x = any(new.zdielane)));
    if cardinality(prec) > 0 then
      update pripomienky set zrusena = now() where poznamka_id = new.id and druh = 'todo' and makler_id = any(prec) and hotovo is null and zrusena is null;
    end if;
    if new.hotovo and not old.hotovo then
      -- kto úlohu splnil, ten má upozornenie vybavené; ostatným príde, že je hotová
      update pripomienky set hotovo = now() where poznamka_id = new.id and druh = 'todo' and makler_id = kto and hotovo is null and zrusena is null;
      ostatni := array(select x from unnest(array_append(new.zdielane, new.makler_id)) x where x <> kto);
      if cardinality(new.zdielane) > 0 and cardinality(ostatni) > 0 then
        insert into pripomienky (makler_id, cas, poznamka, druh, poznamka_id, email_odoslany, push_odoslany)
        select x, now(), left('Hotovo · ' || _meno(kto) || ': ' || new.text, 500), 'todo', new.id, now(), now() from unnest(ostatni) x;
        begin
          perform _push_zaradit(ostatni, 'pripomienky', '✓ Hotovo · ' || _meno(kto), new.text, './#poznamky', 'typek-todo-' || new.id);
        exception when others then null;
        end;
      end if;
    end if;
  end if;
  return new;
exception when others then return new;
end $$;
revoke execute on function public._poznamky_push() from public, anon, authenticated;

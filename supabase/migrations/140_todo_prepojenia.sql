-- =====================================================================
-- 140: ToDo List (predtým Tvoje poznámky) – úloha môže byť prepojená s miestom v Týpkovi
--  * poznamky.odkaz: {"t": druh, "id": …, "n": názov na zobrazenie, "p": ponuka pri obhliadke}
--    druhy: inzerat (skener), ponuka, obhliadka, dopyt (klient), predavajuci (telefón), odhad, mimo (mimo ponuky)
--  * prepojenie neotvára žiadny prístup – úloha je stále len majiteľova, odkaz len ukáže, kam sa vrátiť
-- =====================================================================
alter table public.poznamky add column if not exists odkaz jsonb;
alter table public.poznamky drop constraint if exists poznamky_odkaz_tvar;
alter table public.poznamky add constraint poznamky_odkaz_tvar check (
  odkaz is null or (
    jsonb_typeof(odkaz) = 'object'
    and odkaz ->> 't' in ('inzerat', 'ponuka', 'obhliadka', 'dopyt', 'predavajuci', 'odhad', 'mimo')
    and length(coalesce(odkaz ->> 'id', '')) between 1 and 120
    and length(odkaz::text) <= 800
  ));
create index if not exists poznamky_odkaz on public.poznamky (makler_id, (odkaz ->> 't'), (odkaz ->> 'id')) where odkaz is not null;

-- text chyby po premenovaní na ToDo List
create or replace function public._poznamky_pred() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from poznamky where makler_id = new.makler_id) >= 2000 then
      raise exception 'Úloh je priveľa (najviac 2 000) – zmaž staré hotové.' using errcode = 'P0001';
    end if;
    new.vytvorene := now();
  else
    new.makler_id := old.makler_id;
    new.vytvorene := old.vytvorene;
  end if;
  new.text := btrim(new.text);
  new.skupina := nullif(btrim(coalesce(new.skupina, '')), '');
  new.detail := nullif(btrim(coalesce(new.detail, '')), '');
  if new.hotovo and (tg_op = 'INSERT' or not old.hotovo) then new.hotovo_kedy := now(); end if;
  if not new.hotovo then new.hotovo_kedy := null; end if;
  new.upravene := now();
  return new;
end $$;
revoke execute on function public._poznamky_pred() from public, anon, authenticated;

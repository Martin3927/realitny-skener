-- =====================================================================
-- Automatické interné číslo ponuky podľa makléra: iniciály + poradie (MA001, MA002…)
-- =====================================================================
create or replace function public._inicialy(p_meno0 text) returns text language sql immutable as $$
  -- tituly (Mgr., Ing., RSc.…) vynecháme
  with t as (select trim(regexp_replace(coalesce(p_meno0, ''), '\S+\.(\s+|$)', '', 'g')) as p_meno)
  select upper(translate(
    case when position(' ' in trim(p_meno)) > 0
         then left(trim(p_meno), 1) || left(regexp_replace(trim(p_meno), '^.*\s', ''), 1)
         else left(trim(p_meno), 2) end,
    'áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ', 'aacdeeillnoorrstuuyzAACDEEILLNOORRSTUUYZ')) from t
$$;

create or replace function public._nove_cislo_ponuky(p_makler uuid, p_kancelaria text) returns text
language plpgsql security definer set search_path = public as $$
declare v_pref text; v_max int;
begin
  select coalesce(nullif(_inicialy(coalesce(nullif(meno, ''), email)), ''), 'RK') into v_pref from makleri where id = p_makler;
  v_pref := coalesce(v_pref, 'RK');
  perform pg_advisory_xact_lock(hashtext('cislo:' || p_kancelaria || ':' || v_pref));
  select max(substring(cislo from length(v_pref) + 1)::int) into v_max
  from nehnutelnosti where kancelaria = p_kancelaria and cislo ~ ('^' || v_pref || '[0-9]+$');
  return v_pref || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end $$;

-- pri uložení bez čísla sa číslo vygeneruje
create or replace function public._cislo_ponuky_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.cislo), '') = '' then
    if tg_op = 'UPDATE' and coalesce(trim(old.cislo), '') <> '' then
      new.cislo := old.cislo;            -- prázdne pole pri úprave = ponechať pridelené číslo
    elsif new.makler_id is not null then
      new.cislo := _nove_cislo_ponuky(new.makler_id, new.kancelaria);
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'nehnutelnosti_cislo') then
    create trigger nehnutelnosti_cislo before insert or update of cislo, makler_id on public.nehnutelnosti
      for each row execute function public._cislo_ponuky_trigger();
  end if;
end $$;

-- náhľad čísla vo formulári
create or replace function public.navrh_cisla_ponuky(p_makler uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return _nove_cislo_ponuky(coalesce(p_makler, auth.uid()), 'alpha');
end $$;

revoke execute on function public._inicialy(text), public._nove_cislo_ponuky(uuid, text), public._cislo_ponuky_trigger(), public.navrh_cisla_ponuky(uuid) from public, anon, authenticated;
grant execute on function public.navrh_cisla_ponuky(uuid) to authenticated;

-- doplnenie čísel existujúcim ponukám
update public.nehnutelnosti set cislo = null where coalesce(trim(cislo), '') = '';

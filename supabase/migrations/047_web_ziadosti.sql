-- =====================================================================
-- Žiadosti o bezplatnú verziu z predajného webu (realitnytypek.sk)
-- Formulár „Požiadať o bezplatnú verziu“ zapíše záujemcu rovno do Správy zákazníkov
-- (stav Záujemca, zdroj „web“) aj s modulmi, ktoré si návštevník vyskladal v cenníku.
-- Web nie je prihlásený, preto zapisuje iba cez túto funkciu – do tabuľky zakaznici
-- anonymný návštevník priamo nevidí ani nezapíše nič.
-- =====================================================================

-- kedy hlavný správca dostal o žiadosti e-mail (keď je e-mail v Supabase nastavený)
alter table public.zakaznici add column if not exists web_oznamene timestamptz;

create or replace function public.web_ziadost(
  p_email text,
  p_moduly text[] default '{}',
  p_okresy int default 1,
  p_platba text default 'mesacne'
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_okr int := least(greatest(coalesce(p_okresy, 1), 1), 79);
  v_pl text := case when p_platba = 'rocne' then 'rocne' else 'mesacne' end;
  v_mod text[];
  v_zadarmo text[];
  v_pozn text;
  v_id bigint;
  v_upr timestamptz;
begin
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'neplatny_email' using errcode = '22023';
  end if;

  -- ochrana pred zahltením: najviac 30 žiadostí z webu za hodinu
  if (select count(*) from zakaznici where zdroj = 'web' and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'prilis_vela' using errcode = '54000';
  end if;

  -- moduly z cenníka webu → moduly v Správe zákazníkov
  select coalesce(array_agg(distinct x order by x), '{}') into v_mod from (
    select case m
      when 'skener' then 'skener' when 'web' then 'web' when 'ponuky' then 'ponuky'
      when 'klienti' then 'klienti_aml' when 'dokumenty' then 'dokumenty'
      when 'newsletter' then 'emailing' when 'email' then 'pracovny_email'
    end as x
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where x is not null;

  select coalesce(array_agg(distinct n order by n), '{}') into v_zadarmo from (
    select case m when 'kataster' then 'Kataster a mapa' when 'kalendar' then 'Kalendár' when 'chat' then 'Chat'
                  when 'domena' then 'Doména + hosting' end as n
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where n is not null;

  v_pozn := 'Žiadosť o bezplatnú verziu z webu ' || to_char(now() at time zone 'Europe/Bratislava', 'DD.MM.YYYY HH24:MI')
    || case when 'skener' = any(v_mod) then '. Skener: ' || v_okr
         || case when v_okr = 1 then ' okres' when v_okr < 5 then ' okresy' else ' okresov' end else '' end
    || case when cardinality(v_zadarmo) > 0 then '. Navyše: ' || array_to_string(v_zadarmo, ', ') else '' end
    || '. Platba: ' || case when v_pl = 'rocne' then 'ročne' else 'mesačne' end || '.';

  -- ten istý e-mail už v evidencii je → iba doplníme, nič neduplikujeme
  select id, upravene into v_id, v_upr from zakaznici where lower(email) = v_email order by id limit 1;
  if v_id is not null then
    if v_upr < now() - interval '10 minutes' then
      update zakaznici set
        moduly = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(moduly || v_mod) x),
        poznamky = left(coalesce(nullif(poznamky, '') || E'\n', '') || v_pozn, 4000),
        web_oznamene = null
      where id = v_id;
    end if;
    return 'ok';
  end if;

  insert into zakaznici (typ, nazov, email, stav, moduly, platba_obdobie, zdroj, poznamky)
  values ('makler', v_email, v_email, 'zaujemca', v_mod, v_pl, 'web', v_pozn);
  return 'ok';
end $$;

revoke all on function public.web_ziadost(text, text[], int, text) from public;
grant execute on function public.web_ziadost(text, text[], int, text) to anon, authenticated;

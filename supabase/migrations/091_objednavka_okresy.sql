-- Objednávka z predajnej stránky /skener: hlavný a ďalšie okresy (z celého Slovenska), meno, telefón
-- a pri balíku Realitná kancelária aj názov kancelárie a počet maklérov.
-- Staré volanie so 4 parametrami (hlavná stránka, /osobny-web) funguje ďalej – nové parametre majú predvolené hodnoty.
-- Funkciu treba najprv zmazať: dve verzie s rovnakým začiatkom by API nevedelo rozlíšiť.

drop function if exists public.web_ziadost(text, text[], integer, text);

create or replace function public.web_ziadost(
  p_email text,
  p_moduly text[] default '{}'::text[],
  p_okresy integer default 1,
  p_platba text default 'mesacne'::text,
  p_okresy_zoznam text[] default null,
  p_meno text default null,
  p_telefon text default null,
  p_kancelaria text default null,
  p_pocet_maklerov integer default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_zoz text[];
  v_okr int;
  v_pl text := case when p_platba = 'rocne' then 'rocne' else 'mesacne' end;
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  v_tel text := nullif(left(btrim(regexp_replace(coalesce(p_telefon, ''), '[^0-9+ ()/-]', '', 'g')), 30), '');
  v_kanc text := nullif(left(btrim(regexp_replace(coalesce(p_kancelaria, ''), '[[:cntrl:]]+', ' ', 'g')), 160), '');
  v_pm int := case when p_pocet_maklerov between 1 and 500 then p_pocet_maklerov end;
  v_mod text[];
  v_zadarmo text[];
  v_pozn text;
  v_id bigint;
  v_upr timestamptz;
  v_odkial text := _klient_odtlacok();
begin
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'neplatny_email' using errcode = '22023';
  end if;

  -- ochrana pred zahltením: z jedného zariadenia najviac 5 žiadostí za hodinu, spolu najviac 30 nových za hodinu
  if v_odkial is not null then
    if (select count(*) from web_ziadosti_odtlacky where odtlacok = v_odkial and cas > now() - interval '1 hour') >= 5 then
      raise exception 'prilis_vela' using errcode = '54000';
    end if;
    insert into web_ziadosti_odtlacky (odtlacok) values (v_odkial);
    if random() < 0.05 then delete from web_ziadosti_odtlacky where cas < now() - interval '1 day'; end if;
  end if;
  if (select count(*) from zakaznici where zdroj = 'web' and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'prilis_vela' using errcode = '54000';
  end if;

  -- okresy: len skutočné okresy SR (podľa tabuľky lokality), bez opakovania, v poradí výberu – prvý je hlavný
  select coalesce(array_agg(o order by poradie), '{}') into v_zoz from (
    select distinct on (o) o, poradie from (
      select btrim(x) as o, i as poradie from unnest(coalesce(p_okresy_zoznam, '{}')) with ordinality as u(x, i)
    ) a
    where exists (select 1 from lokality l where l.okres = a.o)
    order by o, poradie
  ) t;
  v_zoz := v_zoz[1:79];
  v_okr := least(greatest(coalesce(nullif(cardinality(v_zoz), 0), p_okresy, 1), 1), 79);

  -- moduly z cenníka webu → moduly v Správe zákazníkov
  select coalesce(array_agg(distinct x order by x), '{}') into v_mod from (
    select case m
      when 'skener' then 'skener' when 'web' then 'web' when 'ponuky' then 'ponuky'
      when 'klienti' then 'klienti_aml' when 'dokumenty' then 'dokumenty'
      when 'newsletter' then 'emailing' when 'email' then 'pracovny_email'
      when 'kancelaria' then 'kancelaria'
    end as x
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where x is not null;

  select coalesce(array_agg(distinct n order by n), '{}') into v_zadarmo from (
    select case m when 'kataster' then 'Kataster a mapa' when 'kalendar' then 'Kalendár' when 'chat' then 'Chat'
                  when 'domena' then 'Doména + hosting' end as n
    from unnest(coalesce(p_moduly, '{}')) m
  ) t where n is not null;

  v_pozn := case when cardinality(v_zoz) > 0 or v_meno is not null then 'Objednávka z webu (30 dní zadarmo) '
                 else 'Žiadosť o bezplatnú verziu z webu ' end
    || to_char(now() at time zone 'Europe/Bratislava', 'DD.MM.YYYY HH24:MI')
    || case when 'kancelaria' = any(v_mod)
         then '. Realitná kancelária' || coalesce(': ' || v_kanc, '') || coalesce(', počet maklérov: ' || v_pm, '') else '' end
    || case when 'skener' = any(v_mod) then '. Skener: ' || v_okr
         || case when v_okr = 1 then ' okres' when v_okr < 5 then ' okresy' else ' okresov' end
         || case when cardinality(v_zoz) > 0 then ' – ' || v_zoz[1] || ' (hlavný)'
              || case when cardinality(v_zoz) > 1 then ', ' || array_to_string(v_zoz[2:], ', ') else '' end
            else '' end
       else '' end
    || case when cardinality(v_zadarmo) > 0 then '. Navyše: ' || array_to_string(v_zadarmo, ', ') else '' end
    || '. Platba: ' || case when v_pl = 'rocne' then 'ročne' else 'mesačne' end
    || coalesce('. Kontakt: ' || nullif(concat_ws(', ', v_meno, v_tel), ''), '') || '.';

  -- ten istý e-mail už v evidencii je → iba doplníme moduly a poznámku (e-maily sa znova neposielajú,
  -- inak by sa dal formulár zneužiť na opakované posielanie e-mailov na cudziu adresu).
  -- Okresy, meno a telefón existujúceho zákazníka sa z webu nemenia – sú len v poznámke.
  select id, upravene into v_id, v_upr from zakaznici where lower(email) = v_email order by id limit 1;
  if v_id is not null then
    if v_upr < now() - interval '10 minutes' then
      update zakaznici set
        moduly = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(moduly || v_mod) x),
        poznamky = left(coalesce(nullif(poznamky, '') || E'\n', '') || v_pozn, 4000)
      where id = v_id;
    end if;
    return 'ok';
  end if;

  insert into zakaznici (typ, nazov, email, kontakt_meno, telefon, stav, moduly, okresy, pocet_maklerov, platba_obdobie, zdroj, poznamky)
  values (case when 'kancelaria' = any(v_mod) then 'kancelaria' else 'makler' end,
          coalesce(v_kanc, v_meno, v_email), v_email, v_meno, v_tel, 'zaujemca', v_mod, v_zoz, coalesce(v_pm, 1),
          v_pl, 'web', v_pozn);
  return 'ok';
end $$;

revoke all on function public.web_ziadost(text, text[], integer, text, text[], text, text, text, integer) from public;
grant execute on function public.web_ziadost(text, text[], integer, text, text[], text, text, text, integer) to anon, authenticated, service_role;

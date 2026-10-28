-- „Nedvíha“ → automatická pripomienka „Znova zavolať“ (zvonček + upozornenie do mobilu)
--  * o 2 hodiny po zapísaní hovoru, najneskôr o 19:00; ak by to vyšlo neskôr (alebo v noci), nasledujúce ráno o 8:00
--  * každý ďalší zapísaný hovor k inzerátu staršiu pripomienku „Znova zavolať“ zruší (pri „Nedvíha“ vznikne nová)
--  * v čase pripomienky príde maklérovi upozornenie do mobilu (ak inzerát medzitým nepustil alebo ho nemá iný maklér)
--  * e-mail sa pri tejto pripomienke neposiela

alter table public.pripomienky add column if not exists push_odoslany timestamptz;
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost', 'web', 'volat'));
create index if not exists pripomienky_volat on public.pripomienky (cas) where druh = 'volat' and hotovo is null and zrusena is null and push_odoslany is null;

-- kedy znova volať: o 2 h, najneskôr 19:00, inak ďalšie ráno 8:00 (slovenský čas)
create or replace function public._cas_volat_znova(p_od timestamptz) returns timestamptz
language plpgsql stable as $$
declare v_lok timestamp := p_od at time zone 'Europe/Bratislava'; v timestamp := v_lok + interval '2 hours';
begin
  if v::date > v_lok::date or v::time > time '19:00' then
    v := (v_lok::date + 1) + time '08:00';
  elsif v::time < time '08:00' then
    v := v::date + time '08:00';
  end if;
  return v at time zone 'Europe/Bratislava';
end $$;

-- „3-izbový byt, Spišská Nová Ves“
create or replace function public._nazov_inzeratu(z inzeraty) returns text
language sql stable as $$
  select concat_ws(', ', case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom'
                                    when 'pozemok' then 'pozemok' when 'chata' then 'chata' when 'garaz' then 'garáž' else 'nehnuteľnosť' end,
                   nullif(z.obec, ''))
$$;

-- koľkokrát po sebe predajca nedvíhal (od posledného hovoru s iným výsledkom)
create or replace function public._pokusy_nedviha(p_inzerat text, p_do timestamptz default now()) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from aktivity a
  where a.inzerat_id = p_inzerat and a.typ = 'hovor' and a.vysledok = 'Nedvíha' and a.vytvorene <= p_do
    and a.vytvorene > coalesce((select max(b.vytvorene) from aktivity b where b.inzerat_id = p_inzerat and b.typ = 'hovor'
                                and b.vysledok <> 'Nedvíha' and b.vytvorene <= p_do), '-infinity')
$$;
revoke execute on function public._pokusy_nedviha(text, timestamptz) from public, anon, authenticated;

-- zapísanie hovoru: navyše vráti, kedy sa pripomenie znova volať
drop function if exists public.zapisat_hovor(text, text, text);
create function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m makleri; z inzeraty; v_nehn text; v_cas timestamptz; v_pokus int;
begin
  perform _moj_alebo_prevezmi(p_inzerat);
  if coalesce(trim(p_vysledok), '') = '' then
    raise exception 'Vyberte, ako dopadol hovor.';
  end if;
  update prevzatia set posledny_vysledok = p_vysledok, posledna_poznamka = nullif(trim(p_poznamka), ''),
    posledny_hovor = now(), pocet_hovorov = pocet_hovorov + 1, upravene = now()
  where inzerat_id = p_inzerat;
  insert into aktivity (inzerat_id, makler_id, typ, vysledok, poznamka)
    values (p_inzerat, auth.uid(), 'hovor', p_vysledok, nullif(trim(p_poznamka), ''));
  -- nový hovor → staršie „Znova zavolať“ k tomuto inzerátu už netreba
  update pripomienky set zrusena = now()
  where inzerat_id = p_inzerat and druh = 'volat' and hotovo is null and zrusena is null;
  select * into z from inzeraty where id = p_inzerat;
  if p_vysledok = 'Nedvíha' then
    v_cas := _cas_volat_znova(now());
    v_pokus := _pokusy_nedviha(p_inzerat);
    insert into pripomienky (makler_id, vytvoril, inzerat_id, cas, poznamka, druh, email_odoslany)
    values (auth.uid(), auth.uid(), p_inzerat, v_cas,
            left('Znova zavolať: ' || coalesce(_nazov_inzeratu(z), 'inzerát') || ' – predajca nedvíhal (' ||
                 to_char(now() at time zone 'Europe/Bratislava', 'FMDD. FMMM. "o" HH24:MI') || ', ' || v_pokus || '. pokus)', 500),
            'volat', now());   -- e-mail sa pri tejto pripomienke neposiela
    return jsonb_build_object('volat_znova', v_cas, 'pokus', v_pokus);
  end if;
  if p_vysledok = 'Získaný do ponuky' then
    select * into m from makleri where id = auth.uid();
    v_nehn := case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom' when 'pozemok' then 'pozemok'
                         when 'chata' then 'chatu' when 'garaz' then 'garáž' else 'nehnuteľnosť' end;
    insert into spravy (makler_id, text, typ, kluc)
    values (null, '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end || ' do ponuky ' || v_nehn ||
                  coalesce(', ' || nullif(z.obec, ''), '') || '! Gratulujeme 👏', 'uspech', 'uspech:' || p_inzerat || ':' || auth.uid())
    on conflict do nothing;
  end if;
  return '{}'::jsonb;
end $$;
revoke execute on function public.zapisat_hovor(text, text, text) from public, anon;
grant execute on function public.zapisat_hovor(text, text, text) to authenticated;

-- každú minútu: splatné „Znova zavolať“ → upozornenie do mobilu
create or replace function public._volat_znova() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0; v_vcera boolean; v_txt text;
begin
  if not pg_try_advisory_xact_lock(510071) then return 0; end if;
  for p in
    select r.*, z.cena, _nazov_inzeratu(z) as nazov,
           exists (select 1 from prevzatia v where v.inzerat_id = r.inzerat_id and v.makler_id = r.makler_id) as stale_moj
    from pripomienky r join inzeraty z on z.id = r.inzerat_id
    where r.druh = 'volat' and r.hotovo is null and r.zrusena is null and r.push_odoslany is null
      and r.cas <= now() and r.cas > now() - interval '12 hours'
    order by r.cas limit 100
  loop
    if not p.stale_moj then   -- inzerát sa uvoľnil alebo ho prevzal iný maklér
      update pripomienky set zrusena = now() where id = p.id;
      continue;
    end if;
    v_vcera := (p.vytvorene at time zone 'Europe/Bratislava')::date < (now() at time zone 'Europe/Bratislava')::date;
    v_txt := coalesce(p.nazov, 'Inzerát') || coalesce(' · ' || replace(to_char(p.cena, 'FM999,999,999'), ',', ' ') || ' €', '') || E'\n' ||
      case when v_vcera
        then 'Dobré ráno! Predajca včera o ' || to_char(p.vytvorene at time zone 'Europe/Bratislava', 'HH24:MI') || ' nedvíhal – skús mu zavolať teraz.'
        else 'Predajca o ' || to_char(p.vytvorene at time zone 'Europe/Bratislava', 'HH24:MI') || ' nedvíhal – teraz je dobrý čas skúsiť to znova.' end ||
      case when _pokusy_nedviha(p.inzerat_id, p.vytvorene) >= 2 then ' Ak nedvíha ani teraz, pošli SMS.' else '' end;
    perform _push_zaradit(array[p.makler_id], 'pripomienky', '📞 Skús znova zavolať', v_txt, './#inzeraty/' || p.inzerat_id,
                          'typek-volat-' || p.inzerat_id);
    update pripomienky set push_odoslany = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._volat_znova() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('volat-znova');
exception when others then null; end $$;
select cron.schedule('volat-znova', '* * * * *', 'select public._volat_znova()');

-- admin môže maklérovi tieto upozornenia vypnúť
create or replace function public.nastavit_upozornenie_maklera(p_id uuid, p_druh text, p_zapnute boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_druh not in ('spravy', 'inzeraty', 'kontakty', 'novinky', 'pripomienky') then raise exception 'Neznámy druh upozornení.'; end if;
  update makleri set upozornenia = coalesce(upozornenia, '{}'::jsonb) || jsonb_build_object(p_druh, coalesce(p_zapnute, true))
  where id = p_id;
end $$;
revoke execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) from public, anon;
grant execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) to authenticated;

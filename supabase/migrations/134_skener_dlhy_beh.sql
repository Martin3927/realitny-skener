-- Falošný poplach „Skener nebeží“ (17. 11. 2026 23:55): plná kontrola (raz za ~20 h) bežala 29 minút a ďalšie
-- kontroly na ňu čakali – strážca to považoval za výpadok. Teraz:
--  • skener na začiatku behu zapíše „beh_zacal“ – strážca počas bežiacej kontroly (do 60 min) nehlási výpadok
--  • plná kontrola len v noci (2:17), záložne ráno – nie večer (úprava v skener.py)
--  • strážca prevádzky už výpadok skenera nehlási druhýkrát (stráži ho _skener_nebezi)

create or replace function public.skener_beh_zacal(p_kluc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  update stav_skenera set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('beh_zacal', now()) where id = 1;
end $$;
revoke execute on function public.skener_beh_zacal(text) from public, authenticated;
grant execute on function public.skener_beh_zacal(text) to anon;

create or replace function public._skener_nebezi() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t timestamp := now() at time zone 'Europe/Bratislava';
  v_posl timestamptz;
  v_kto uuid[];
  r dostupnost;
  v_text text;
  v_beh timestamptz;
begin
  if not pg_try_advisory_xact_lock(510107) then return; end if;
  select nullif(meta ->> 'posledna_kontrola', '')::timestamptz into v_posl from stav_skenera limit 1;
  if v_posl is null then return; end if;
  insert into dostupnost (sluzba) values ('Realitný skener') on conflict do nothing;
  select * into r from dostupnost where sluzba = 'Realitný skener' for update;

  -- práve beží dlhšia kontrola (plná prechádza všetky stránky portálov, trvá aj 30 – 40 minút) → nie je to výpadok
  select nullif(meta ->> 'beh_zacal', '')::timestamptz into v_beh from stav_skenera limit 1;
  if v_beh > v_posl and v_beh > now() - interval '60 minutes' then return; end if;
  if v_posl > now() - interval '30 minutes' then
    update dostupnost set zlyhania = 0, prve_zlyhanie = null, upozornene = null, posledny_uspech = v_posl, posledna_kontrola = now()
     where sluzba = 'Realitný skener';
    if r.upozornene is not null then
      select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;
      begin
        perform _push_zaradit(v_kto, 'kontakty', '✅ Skener opäť beží',
          'Posledná kontrola portálov o ' || to_char(v_posl at time zone 'Europe/Bratislava', 'HH24:MI') || '.', './#inzeraty', 'typek-skener-bezi');
      exception when others then null;
      end;
    end if;
    return;
  end if;

  -- cez noc skener nebeží (len nočná plná kontrola) – stráži sa od 6:40
  if v_t::time < time '06:40' then return; end if;
  update dostupnost set zlyhania = zlyhania + 1, prve_zlyhanie = coalesce(prve_zlyhanie, v_posl), posledne_zlyhanie = now(),
         posledna_chyba = 'posledná kontrola ' || to_char(v_posl at time zone 'Europe/Bratislava', 'DD. MM. HH24:MI'), posledna_kontrola = now()
   where sluzba = 'Realitný skener' returning * into r;
  if r.upozornene is not null and r.upozornene > now() - interval '3 hours' then return; end if;
  update dostupnost set upozornene = now() where sluzba = 'Realitný skener';

  select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;
  if cardinality(v_kto) = 0 then return; end if;
  v_text := 'Skener ' || (extract(epoch from now() - v_posl) / 60)::int || ' minút neprezrel portály (posledná kontrola '
    || to_char(v_posl at time zone 'Europe/Bratislava', 'HH24:MI') || '). Nové inzeráty sa teraz neukladajú. Skontroluj GitHub Actions alebo server skenera.';
  insert into pripomienky (makler_id, cas, poznamka, druh, email_odoslany, push_odoslany)
  select k, now(), left('Výpadok: ' || v_text, 500), 'pripomienka', now(), now() from unnest(v_kto) k;
  begin
    perform _push_zaradit(v_kto, 'kontakty', '⚠️ Skener nebeží', v_text, './#inzeraty', 'typek-skener-bezi');
  exception when others then null;
  end;
end $$;

create or replace function public._prevadzka_kontrola() returns int
language plpgsql security definer set search_path = public as $$
declare v_meta jsonb; v_posl timestamptz; v_hod int := extract(hour from now() at time zone 'Europe/Bratislava')::int;
        p record; n int := 0; v_ch text; v_portal record;
begin
  if not pg_try_advisory_xact_lock(510129) then return 0; end if;
  select meta into v_meta from stav_skenera where id = 1;
  v_posl := nullif(v_meta ->> 'posledna_kontrola', '')::timestamptz;
  -- výpadok skenera stráži _skener_nebezi (od 6:40, správa „⚠️ Skener nebeží“) – tu sa už nezdvojuje
  delete from prevadzka_problemy where kluc = 'skener';
  -- portály: chyba v poslednej kontrole (nevrátil nič, nedostupný, zlyhal, zmenil vzhľad); „vrátil len X“ sa nepočíta
  for v_portal in select * from (values
      ('bazos', 'Bazoš', '(^|[^a-z])bazo'), ('nehnutelnosti', 'Nehnuteľnosti.sk', 'nehnute'),
      ('reality', 'Reality.sk', '(^|[^p])reality\.sk'), ('topreality', 'TopReality.sk', 'topreality')) x(kod, nazov, vzor)
  loop
    select string_agg(c, ' · ') into v_ch
    from jsonb_array_elements_text(coalesce(v_meta -> 'chyby', '[]')) c
    where c ~* v_portal.vzor and c !~* 'vrátil len' and c !~* '^radar';
    perform _prevadzka_nastav('portal-' || v_portal.kod, v_ch is not null and v_posl > now() - interval '35 minutes',
      case when v_ch ilike v_portal.nazov || '%' then v_ch else v_portal.nazov || ': ' || coalesce(v_ch, '') end);
  end loop;
  -- upozornenie: cez deň; portál až keď problém trvá aspoň 45 minút (krátke výpadky sa riešia samé); znova po 12 h
  if v_hod >= 7 and v_hod < 22 then
    for p in select * from prevadzka_problemy
             where (upozornene is null or upozornene < now() - interval '12 hours')
               and (kluc not like 'portal-%' or od < now() - interval '45 minutes')
             for update skip locked
    loop
      perform _push_zaradit(_prevadzka_spravcovia(), 'prevadzka', '⚠️ Týpek: problém v prevádzke', p.text,
                            './#inzeraty', 'typek-prevadzka-' || p.kluc);
      update prevadzka_problemy set upozornene = now() where kluc = p.kluc;
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

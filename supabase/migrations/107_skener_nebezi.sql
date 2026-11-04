-- Strážca behu skenera (4. 11. 2026): keď skener cez deň (6:40 – 23:59) 30 minút neprezrel portály, dostane hlavný správca
-- upozornenie do mobilu a zvončeka; pri trvajúcom výpadku znova najskôr o 3 hodiny, po obnove „Skener opäť beží“.
-- Doteraz sa porucha hlásila len vtedy, keď beh skončil chybou – keď sa beh vôbec nespustil (výpadok GitHubu, vypnutý
-- vlastný server, chýbajúci kľúč na spúšťanie), nikto sa to nedozvedel. Stav je v tabuľke dostupnost (služba „Realitný skener“).

create or replace function public._skener_nebezi() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t timestamp := now() at time zone 'Europe/Bratislava';
  v_posl timestamptz;
  v_kto uuid[];
  r dostupnost;
  v_text text;
begin
  if not pg_try_advisory_xact_lock(510107) then return; end if;
  select nullif(meta ->> 'posledna_kontrola', '')::timestamptz into v_posl from stav_skenera limit 1;
  if v_posl is null then return; end if;
  insert into dostupnost (sluzba) values ('Realitný skener') on conflict do nothing;
  select * into r from dostupnost where sluzba = 'Realitný skener' for update;

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
revoke execute on function public._skener_nebezi() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('skener-nebezi');
exception when others then null; end $$;
select cron.schedule('skener-nebezi', '*/5 * * * *', 'select public._skener_nebezi()');

-- Maklér musí volať, nie len posielať SMS (18. 11. 2026):
--  • „SMS poslaná“ / „Email poslaný“ sa dá zapísať, až keď kancelária pri inzeráte zapísala hovor (posledných 30 dní)
--    – typicky „Nedvíha“ a potom SMS. Zrušiť označenie sa dá vždy.
--  • SMS ani email už nepredlžujú prevzatie (24 h odpočet) – predĺži ho len hovor, „Ešte riešim“ alebo pripomienka.
--  • „Ešte riešim“: limit 2× za sebou sa vynuluje len hovorom (nie SMS/emailom).

create or replace function public.oznacit_kontakt(p_inzerat text, p_typ text, p_stav boolean)
 returns void language plpgsql security definer set search_path = public as $$
declare k bigint := aktivna_kancelaria();
begin
  if p_typ not in ('sms', 'email') then raise exception 'Neznámy typ.'; end if;
  if p_stav and not exists (select 1 from aktivity a where a.inzerat_id = p_inzerat and a.kancelaria_id = k and a.typ = 'hovor'
                            and a.vytvorene > now() - interval '30 days') then
    raise exception 'Najprv zavolaj a zapíš hovor – % pošleš, keď predajca nedvíha alebo si to dohodnete.',
      case when p_typ = 'sms' then 'SMS' else 'email' end;
  end if;
  perform _moj_alebo_prevezmi(p_inzerat);
  if p_typ = 'sms' then
    update prevzatia set sms = case when p_stav then now() end, sms_kto = case when p_stav then auth.uid() end
      where inzerat_id = p_inzerat and kancelaria_id = k;
  else
    update prevzatia set email = case when p_stav then now() end, email_kto = case when p_stav then auth.uid() end
      where inzerat_id = p_inzerat and kancelaria_id = k;
  end if;
  insert into aktivity (inzerat_id, makler_id, typ, kancelaria_id)
    values (p_inzerat, auth.uid(), case when p_stav then p_typ when p_typ = 'sms' then 'sms_zrusena' else 'email_zruseny' end, k);
end $$;

create or replace function public.predlzit_prevzatie(p_inzerat text, p_poznamka text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_majitel uuid; k bigint := aktivna_kancelaria(); v_za_sebou int;
begin
  perform _over_aktivny();
  if length(trim(coalesce(p_poznamka, ''))) < 3 then raise exception 'Napíšte krátko, čo s inzerátom riešite.'; end if;
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  if v_majitel is null then raise exception 'Inzerát nie je prevzatý.'; end if;
  if v_majitel <> auth.uid() and not ja_admin() then raise exception 'Predĺžiť môže len %, alebo administrátor.', _meno(v_majitel); end if;
  -- najviac 2× za sebou bez zápisu hovoru – inak by sa dal inzerát držať donekonečna bez práce (SMS ani email sa nepočítajú)
  select count(*) into v_za_sebou from (
    select typ, sum(case when typ = 'predlzenie' then 0 else 1 end) over (order by vytvorene desc) as zlom
    from aktivity where inzerat_id = p_inzerat and kancelaria_id = k
      and typ in ('predlzenie', 'hovor', 'prevzatie', 'presun', 'uvolnenie')) x
  where zlom = 0;
  if v_za_sebou >= 2 then
    raise exception 'Už si prevzatie 2× predĺžil bez hovoru. Zavolaj a zapíš hovor, alebo si nastav 🔔 pripomienku na konkrétny deň.';
  end if;
  update prevzatia set upravene = now(), upozornene_pred = null where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'predlzenie', left(trim(p_poznamka), 500), k);
  return now() + interval '24 hours';
end $$;

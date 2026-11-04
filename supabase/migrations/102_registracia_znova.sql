-- Oprava samoregistrácie (4. 11. 2026):
--  * opakovaná žiadosť z webu s tým istým e-mailom: kto ešte nie je zaregistrovaný, dostane odkaz na registráciu znova
--    (najviac raz za hodinu – ochrana pred posielaním e-mailov na cudziu adresu); predtým neprišlo nič
--  * platiaci zákazník, ktorému hlavný správca pošle odkaz, ostane po registrácii platiaci (bez skúšobnej doby)

create or replace function public._zakaznik_registracia_znova() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_novy text := regexp_replace(btrim(coalesce(new.poznamky, '')), '^.*\n', '');
  v_stary text := regexp_replace(btrim(coalesce(old.poznamky, '')), '^.*\n', '');
begin
  if v_novy ~ '^(Objednávka z webu|Žiadosť o bezplatnú verziu z webu)' and v_novy is distinct from v_stary
     and new.registrovany is null and new.registracia_poslat is null
     and coalesce(btrim(new.email), '') <> '' and new.stav not in ('vlastna', 'zruseny')
     and (new.registracia_email is null or new.registracia_email < now() - interval '1 hour')
     and not exists (select 1 from kancelarie where zakaznik_id = new.id) then
    new.registracia_poslat := now();
  end if;
  return new;
end $$;
revoke execute on function public._zakaznik_registracia_znova() from public, anon, authenticated;
drop trigger if exists zakaznik_registracia_znova on public.zakaznici;
create trigger zakaznik_registracia_znova before update of poznamky on public.zakaznici
  for each row when (new.zdroj = 'web') execute function public._zakaznik_registracia_znova();

create or replace function public._registracia_dokoncit(p_hash text, p_user uuid, p_meno text, p_telefon text, p_nazov text, p_okresy text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  z zakaznici;
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  v_tel text := nullif(left(btrim(regexp_replace(coalesce(p_telefon, ''), '[^0-9+ ()/-]', '', 'g')), 30), '');
  v_nazov text;
  v_okr text[] := '{}';
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_do date := (now() at time zone 'Europe/Bratislava')::date + 14;
  v_k bigint;
  v_kto uuid[];
  v_text text;
  v_plati boolean;
begin
  select * into z from zakaznici
   where registracia_hash = p_hash and registracia_do > now() and registrovany is null and stav not in ('vlastna', 'zruseny')
   for update;
  if not found then raise exception 'neplatny_odkaz' using errcode = '22023'; end if;
  if exists (select 1 from kancelarie where zakaznik_id = z.id) then raise exception 'neplatny_odkaz' using errcode = '22023'; end if;
  v_plati := z.stav = 'aktivny';   -- platiaci zákazník (odkaz mu poslal hlavný správca) ostáva platiaci, bez skúšobnej doby
  if v_meno is null or length(v_meno) < 3 then raise exception 'meno' using errcode = '22023'; end if;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 9 then raise exception 'telefon' using errcode = '22023'; end if;

  -- okresy skenera: len skutočné okresy SR, bez opakovania, v poradí výberu, najviac 3
  if 'skener' = any(z.moduly) then
    select coalesce(array_agg(o order by i), '{}') into v_okr from (
      select distinct on (o) o, i from (select btrim(x) o, i from unnest(coalesce(p_okresy, '{}')) with ordinality u(x, i)) a
      where exists (select 1 from lokality l where l.okres = a.o)
      order by o, i) t;
    if cardinality(v_okr) = 0 then raise exception 'okresy' using errcode = '22023'; end if;
    if cardinality(v_okr) > 3 then raise exception 'okresy_max' using errcode = '22023'; end if;
  end if;

  v_nazov := case when z.typ = 'kancelaria'
                  then coalesce(nullif(left(btrim(regexp_replace(coalesce(p_nazov, ''), '[[:cntrl:]]+', ' ', 'g')), 160), ''),
                                nullif(btrim(z.nazov), ''), v_meno)
                  else v_meno end;

  insert into kancelarie (nazov, typ, zakaznik_id, okresy, sekcie, pocet_webov)
  values (v_nazov, z.typ, z.id, v_okr, _sekcie_z_modulov(z.moduly), z.pocet_webov)
  returning id into v_k;

  insert into makleri (id, meno, email, telefon, rola, aktivny, vidi_podhodnotene, kancelaria_id)
  values (p_user, v_meno, lower(btrim(z.email)), v_tel, 'admin', true, true, v_k);

  -- názov a kontakt kancelárie pre verejné stránky a export
  perform _nk_ulozit('vzhlad', jsonb_build_object('nazov', v_nazov)::text, v_k);
  perform _nk_ulozit('kancelaria', jsonb_build_object('nazov', v_nazov, 'telefon', v_tel, 'email', lower(btrim(z.email)))::text, v_k);

  update zakaznici set
    stav = case when v_plati then 'aktivny' else 'skusobna' end,
    skusobna_od = case when v_plati then skusobna_od else v_dnes end,
    skusobna_do = case when v_plati then skusobna_do else v_do end,
    okresy = case when cardinality(v_okr) > 0 then v_okr else okresy end,
    nazov = case when z.typ = 'kancelaria' then v_nazov else coalesce(nullif(btrim(nazov), ''), v_meno) end,
    kontakt_meno = v_meno, telefon = v_tel,
    registrovany = now(), registracia_hash = null, registracia_do = null, registracia_poslat = null
  where id = z.id;

  -- upozornenie hlavnému správcovi: zvonček + e-mail (pripomienka) a mobil
  select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto
    from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;
  v_text := case when z.typ = 'kancelaria' then 'Kancelária ' || v_nazov || ' (' || v_meno || ')' else v_meno end
         || ' sa zaregistroval' || case when z.typ = 'kancelaria' then 'a' else '' end
         || case when v_plati then ' – platiaci zákazník' else ' – skúšobná doba do ' || to_char(v_do, 'FMDD. FMMM. YYYY') end
         || case when cardinality(v_okr) > 0 then ' · okresy: ' || array_to_string(v_okr, ', ') else '' end
         || ' · ' || v_tel;
  if cardinality(v_kto) > 0 then
    insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id)
    select k, now(), left(case when v_plati then 'Nová registrácia: ' else 'Nová registrácia na skúšobnú dobu: ' end || v_text, 500), 'zakaznik', z.id from unnest(v_kto) k;
    begin
      perform _push_zaradit(v_kto, 'kontakty', case when v_plati then '🎉 Nová registrácia' else '🎉 Nová registrácia na skúšobnú dobu' end, v_text,
                            'sprava.html#z/' || z.id, 'typek-registracia-' || z.id);
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('kancelaria', v_k, 'skusobna_do', case when v_plati then null else v_do end, 'email', lower(btrim(z.email)));
end $$;
revoke execute on function public._registracia_dokoncit(text, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public._registracia_dokoncit(text, uuid, text, text, text, text[]) to service_role;

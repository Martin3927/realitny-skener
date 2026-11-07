-- Kontakty z odhadov pre maklérov a kancelárie (7. 11. 2026, používateľ: „priprav, čo vieš hneď“)
--  * kontakty_cennik() – verejný cenník kontaktov podľa okresu pre stránku realitnytypek.sk/kontakty (len ceny a lehoty, nič o žiadostiach)
--  * kontakty_zaujem(…) – formulár „Mám záujem o kontakty“: záujemca v Správe zákazníkov (modul kontakty, okresy),
--    hlavnému správcovi zvonček, mobil a e-mail; odkaz na registráciu sa NEPOSIELA automaticky – kanceláriu najprv overíme
--    (inak by si ktokoľvek mohol založiť účet a brať kontakty zadarmo), registráciu pošle hlavný správca zo Správy

-- 79 okresov SR: obce + mestské časti (Bratislava I – V a Košice I – IV majú v lokalitách len časti), bez miest Bratislava a Košice
-- (oprava: Správa → Kontakty na predaj doteraz ukazovala a prijímala len okresy s obcami – bez Bratislavy I – V a Košíc I – IV)
create or replace function public._okresy_sr() returns setof text
language sql stable set search_path = public as $$
  select distinct okres from lokality where typ in ('obec', 'cast') and okres is not null and okres not in ('Bratislava', 'Košice')
$$;

create or replace function public.kontakty_cennik() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'zadarmo', n.zadarmo, 'reklamacia_h', n.reklamacia_h, 'koniec_h', n.koniec_h, 'spolocne', n.ceny,
    'okresy', coalesce((select jsonb_object_agg(o.okres, coalesce(case when jsonb_typeof(n.ceny_okresy->o.okres) = 'array'
                                                                         and jsonb_array_length(n.ceny_okresy->o.okres) > 0 then n.ceny_okresy->o.okres end, n.ceny))
                        from (select okres from _okresy_sr() okres) o), '{}'::jsonb))
  from kontakty_nastavenie n where n.id = 1
$$;
revoke execute on function public.kontakty_cennik() from public;
grant execute on function public.kontakty_cennik() to anon, authenticated;

create or replace function public.kontakty_zaujem(
  p_email text, p_meno text, p_telefon text, p_kancelaria text default null, p_okresy text[] default '{}',
  p_poznamka text default null, p_odkial text default null, p_med text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  v_tel text := nullif(left(btrim(regexp_replace(coalesce(p_telefon, ''), '[^0-9+ ()/-]', '', 'g')), 30), '');
  v_kanc text := nullif(left(btrim(regexp_replace(coalesce(p_kancelaria, ''), '[[:cntrl:]]+', ' ', 'g')), 160), '');
  v_pozn text := nullif(left(btrim(regexp_replace(coalesce(p_poznamka, ''), '[[:cntrl:]]+', ' ', 'g')), 500), '');
  v_odk text := nullif(left(btrim(regexp_replace(coalesce(p_odkial, ''), '[^[:alnum:] ._:/=&+,()-]+', ' ', 'g')), 200), '');
  v_odtlacok text := _klient_odtlacok();
  v_zoz text[];
  v_riadok text;
  v_id bigint;
  v_upr timestamptz;
begin
  if coalesce(p_med, '') <> '' then return 'ok'; end if;   -- pasca na roboty
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then raise exception 'neplatny_email' using errcode = '22023'; end if;
  if v_meno is null or length(v_meno) < 2 then raise exception 'chyba_meno' using errcode = '22023'; end if;
  if v_tel is null or length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 9 then raise exception 'chyba_telefon' using errcode = '22023'; end if;

  if v_odtlacok is not null then
    if (select count(*) from web_ziadosti_odtlacky where odtlacok = v_odtlacok and cas > now() - interval '1 hour') >= 5 then
      raise exception 'prilis_vela' using errcode = '54000';
    end if;
    insert into web_ziadosti_odtlacky (odtlacok) values (v_odtlacok);
  end if;
  if (select count(*) from zakaznici where zdroj = 'web' and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'prilis_vela' using errcode = '54000';
  end if;

  select coalesce(array_agg(o order by i), '{}') into v_zoz from (
    select distinct on (btrim(x)) btrim(x) o, i from unnest(coalesce(p_okresy, '{}')) with ordinality u(x, i)
     where btrim(x) in (select _okresy_sr())
     order by btrim(x), i) t;
  v_zoz := v_zoz[1:10];

  v_riadok := 'Záujem o kontakty z odhadov z webu ' || to_char(now() at time zone 'Europe/Bratislava', 'DD.MM.YYYY HH24:MI')
    || coalesce('. ' || v_kanc, '')
    || case when cardinality(v_zoz) > 0 then '. Okresy: ' || array_to_string(v_zoz, ', ') else '. Okresy: neuvedené' end
    || coalesce('. Poznámka: ' || v_pozn, '')
    || coalesce('. Odkiaľ: ' || v_odk, '')
    || '. Kontakt: ' || concat_ws(', ', v_meno, v_tel) || '.';

  -- už je v evidencii → len poznámka (moduly a okresy existujúceho zákazníka mení hlavný správca)
  select id, upravene into v_id, v_upr from zakaznici where lower(email) = v_email order by id limit 1;
  if v_id is not null then
    if v_upr < now() - interval '10 minutes' then
      update zakaznici set poznamky = left(coalesce(nullif(poznamky, '') || E'\n', '') || v_riadok, 4000), odkial = coalesce(odkial, v_odk) where id = v_id;
    end if;
    return 'ok';
  end if;

  insert into zakaznici (typ, nazov, email, kontakt_meno, telefon, stav, moduly, okresy, pocet_maklerov, platba_obdobie, mesacna_cena, zdroj, poznamky, odkial)
  values (case when v_kanc is not null then 'kancelaria' else 'makler' end, coalesce(v_kanc, v_meno), v_email, v_meno, v_tel, 'zaujemca',
          '{kontakty}', v_zoz, 1, 'mesacne', 0, 'web', v_riadok, v_odk)
  returning id into v_id;
  -- odkaz na registráciu až po overení (trigger zakaznik_registracia_novy ho pri zdroji web zaradil)
  update zakaznici set registracia_poslat = null where id = v_id;
  return 'ok';
end $$;
revoke execute on function public.kontakty_zaujem(text, text, text, text, text[], text, text, text) from public;
grant execute on function public.kontakty_zaujem(text, text, text, text, text[], text, text, text) to anon, authenticated;

-- zvonček a mobil hlavnému správcovi aj pri záujme o kontakty (093 + riadok „Záujem o kontakty z odhadov“)
create or replace function public._objednavka_upozornenie() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_riadky text[] := regexp_split_to_array(btrim(coalesce(new.poznamky, '')), E'\n');
  v_riadok text;
  v_stary text;
  v_obj boolean;
  v_kont boolean;
  v_bal text;
  v_det text;
  v_text text;
  v_kto uuid[] := '{}';
  v_komu uuid;
begin
  v_riadok := btrim(coalesce(v_riadky[array_upper(v_riadky, 1)], ''));
  if v_riadok !~ '^(Objednávka z webu|Žiadosť o bezplatnú verziu z webu|Záujem o kontakty z odhadov)' then return new; end if;
  if tg_op = 'UPDATE' then
    v_riadky := regexp_split_to_array(btrim(coalesce(old.poznamky, '')), E'\n');
    v_stary := btrim(coalesce(v_riadky[array_upper(v_riadky, 1)], ''));
    if v_stary = v_riadok then return new; end if;
  end if;

  v_obj := v_riadok ~ '^Objednávka';
  v_kont := v_riadok ~ '^Záujem o kontakty';
  v_bal := case
    when v_kont then 'Kontakty z odhadov' || case when tg_op = 'UPDATE' then ' (už je v evidencii)' else '' end
    when tg_op = 'UPDATE' then 'opakovaná objednávka'
    when 'kancelaria' = any(new.moduly) then 'Realitná kancelária'
    when 'skener' = any(new.moduly) and 'web' = any(new.moduly) then 'Skener + osobný web'
    when 'skener' = any(new.moduly) then 'Realitný skener'
    when 'web' = any(new.moduly) then 'Osobný web'
  end;
  -- z poznámky ostanú okresy, moduly navyše a platba (kontakt je v texte zvlášť)
  v_det := coalesce(substring(v_riadok from '[0-9]{2}:[0-9]{2}\.\s*(.*)$'), '');
  v_det := btrim(regexp_replace(v_det, '\s*Kontakt: .*$', ''));
  v_text := concat_ws(' · ', v_bal, nullif(btrim(coalesce(new.kontakt_meno, '')), ''), nullif(btrim(coalesce(new.telefon, '')), ''), new.email)
            || case when v_det <> '' then '. ' || v_det else '' end;

  for v_komu in select m.id from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny order by h.vytvorene loop
    v_kto := v_kto || v_komu;
  end loop;
  if cardinality(v_kto) = 0 then
    select array_agg(id) into v_kto from (select id from makleri where aktivny and rola = 'admin' order by vytvorene limit 1) a;
  end if;
  if coalesce(cardinality(v_kto), 0) = 0 then return new; end if;

  insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id, email_odoslany)
  select k, now(), left(case when v_kont then 'Záujem o kontakty z odhadov – ' when v_obj then 'Nová objednávka z webu – ' else 'Nová žiadosť o bezplatnú verziu – ' end || v_text, 500),
         'web', new.id, now()
  from unnest(v_kto) k;

  perform _push_zaradit(v_kto, 'kontakty',
    case when v_kont then '💰 Záujem o kontakty z odhadov' when v_obj then '🛒 Nová objednávka z webu' else '🆕 Nová žiadosť o bezplatnú verziu' end,
    v_text, 'sprava.html#z/' || new.id, 'typek-zakaznik-' || new.id);
  return new;
exception when others then
  return new;
end $$;

-- Správa: zoznam a kontrola okresov cez _okresy_sr (118 + oprava)
create or replace function public.kontakty_sprava() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n kontakty_nastavenie;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select * into n from kontakty_nastavenie where id = 1;
  return jsonb_build_object(
    'nastavenie', jsonb_build_object('okresy', n.okresy, 'ceny', n.ceny, 'ceny_okresy', n.ceny_okresy, 'koniec_h', n.koniec_h, 'zadarmo', n.zadarmo,
                                     'reklamacia_h', n.reklamacia_h, 'zaloha_makler', n.zaloha_makler, 'upravene', n.upravene),
    'zaloha', (select jsonb_build_object('id', m.id, 'meno', m.meno) from makleri m where m.id = _kontakty_zaloha()),
    'zalohy', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'meno', m.meno) order by m.meno)
                          from makleri m where m.aktivny and m.kancelaria_id = moja_kancelaria()), '[]'::jsonb),
    'vsetky_okresy', coalesce((select jsonb_agg(o order by o) from (select okres o from _okresy_sr() okres) x), '[]'::jsonb),
    'pokrytie', coalesce((select jsonb_object_agg(o, (select count(*) from _kontakty_kancelarie(o))) from (select distinct unnest(k.okresy) o from kancelarie k where k.aktivna) x), '{}'::jsonb),
    'kancelarie', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nazov', k.nazov, 'okresy', k.okresy, 'aktivna', k.aktivna,
        'kredit', _kontakty_kredit(k.id), 'zadarmo', _kontakty_zadarmo(k.id),
        'kupene', (select count(*) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh = 'nakup'),
        'zaplatene', (select coalesce(-sum(p.suma), 0) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh in ('nakup', 'vratenie')),
        'dobite', (select coalesce(sum(p.suma), 0) from kontakty_pohyby p where p.kancelaria_id = k.id and p.druh = 'dobitie')) order by k.nazov)
      from kancelarie k where k.id is distinct from n.kancelaria_trh), '[]'::jsonb),
    'trh', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nazov', o.nazov, 'okres', o.okres, 'dovod', o.dovod, 'vytvorene', o.vytvorene,
        'od', o.trh_od, 'koniec', o.trh_koniec, 'cena', case when o.predane is null then _kontakt_cena(o.trh_ceny, o.trh_od) end,
        'dalsia', case when o.predane is null then _kontakt_dalsia(o.trh_ceny, o.trh_od) end,
        'predane', o.predane, 'predane_cena', o.predane_cena, 'zadarmo', o.predane_zadarmo, 'ako', o.predane_ako,
        'kancelaria', (select k.nazov from kancelarie k where k.id = o.predane_kancelaria), 'kto', (select m.meno from makleri m where m.id = o.predane_kto),
        'kupci', (select count(*) from _kontakty_kancelarie(o.okres)),
        'reklamacia', (select r.stav from kontakty_reklamacie r where r.odhad_id = o.id)) order by o.vytvorene desc)
      from odhady_hodnoty o where o.trh_od is not null and (o.predane is null or o.predane > now() - interval '60 days')), '[]'::jsonb),
    'reklamacie', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'odhad_id', r.odhad_id, 'nazov', o.nazov, 'cena', o.predane_cena, 'zadarmo', o.predane_zadarmo,
        'predane', o.predane, 'kancelaria', (select k.nazov from kancelarie k where k.id = r.kancelaria_id), 'kto', (select m.meno from makleri m where m.id = r.kto),
        'dovod', r.dovod, 'text', r.text, 'vytvorene', r.vytvorene, 'stav', r.stav, 'vybavene', r.vybavene, 'odpoved', r.odpoved,
        'telefon', o.telefon, 'email', o.email, 'meno', o.meno) order by (r.stav = 'caka') desc, r.vytvorene desc)
      from kontakty_reklamacie r left join odhady_hodnoty o on o.id = r.odhad_id where r.stav = 'caka' or r.vytvorene > now() - interval '90 days'), '[]'::jsonb),
    'pohyby', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'vytvorene', p.vytvorene, 'druh', p.druh, 'suma', p.suma, 'zadarmo', p.zadarmo,
        'poznamka', p.poznamka, 'kancelaria', (select k.nazov from kancelarie k where k.id = p.kancelaria_id), 'kto', (select m.meno from makleri m where m.id = p.kto)) order by p.id desc)
      from (select * from kontakty_pohyby order by id desc limit 100) p), '[]'::jsonb));
end $$;

create or replace function public.kontakty_nastavit(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_okresy text[];
  v_ceny jsonb;
  v_okr jsonb := '{}'::jsonb;
  r record;
  v_max float8;
  v_koniec int := (p->>'koniec_h')::int;
  v_zadarmo int := (p->>'zadarmo')::int;
  v_rekl int := (p->>'reklamacia_h')::int;
  v_zaloha uuid := nullif(p->>'zaloha_makler', '')::uuid;
begin
  if not je_hlavny_spravca() then raise exception 'Len pre hlavného správcu.' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_okresy
    from jsonb_array_elements_text(case when jsonb_typeof(p->'okresy') = 'array' then p->'okresy' else '[]' end) x;
  if exists (select 1 from unnest(v_okresy) x where not (x in (select _okresy_sr()))) then
    raise exception 'Neznámy okres.' using errcode = '22023';
  end if;
  v_ceny := _kontakty_over_ceny(p->'ceny');
  -- vlastné ceny okresov (prázdny zoznam = spoločné ceny)
  if jsonb_typeof(p->'ceny_okresy') = 'object' then
    for r in select key, value from jsonb_each(p->'ceny_okresy') loop
      continue when jsonb_typeof(r.value) <> 'array' or jsonb_array_length(r.value) = 0;
      if not (r.key in (select _okresy_sr())) then raise exception 'Neznámy okres.' using errcode = '22023'; end if;
      v_okr := v_okr || jsonb_build_object(r.key, _kontakty_over_ceny(r.value, 'Okres ' || r.key || ': '));
    end loop;
  end if;
  select max((e->>'h')::float8) into v_max
    from (select jsonb_array_elements(v_ceny) e union all select jsonb_array_elements(value) from jsonb_each(v_okr)) x;
  if v_koniec is null or v_koniec not between 1 and 336 or v_koniec <= v_max then
    raise exception 'Odovzdanie záložnému maklérovi musí byť neskôr ako posledné zlacnenie (najviac 336 h).' using errcode = '22023';
  end if;
  if v_zadarmo is null or v_zadarmo not between 0 and 20 then raise exception 'Kontaktov zadarmo môže byť 0 až 20.' using errcode = '22023'; end if;
  if v_rekl is null or v_rekl not between 1 and 336 then raise exception 'Lehota na reklamáciu musí byť 1 až 336 hodín.' using errcode = '22023'; end if;
  if v_zaloha is not null and not exists (select 1 from makleri where id = v_zaloha and aktivny and kancelaria_id = moja_kancelaria()) then
    raise exception 'Záložný maklér musí byť aktívny maklér vašej kancelárie.' using errcode = '22023';
  end if;
  update kontakty_nastavenie set okresy = v_okresy, ceny = v_ceny, ceny_okresy = v_okr, koniec_h = v_koniec, zadarmo = v_zadarmo,
         reklamacia_h = v_rekl, zaloha_makler = v_zaloha, upravene = now()
   where id = 1;
end $$;

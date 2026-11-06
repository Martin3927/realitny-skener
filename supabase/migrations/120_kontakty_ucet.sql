-- Kontakty na predaj (6. 11. 2026 21:39, používateľ: „priprav účet len na kontakty a admin bude mať možnosť zapnúť maklérom preberanie kontaktov“)
--  * modul „kontakty“ (Správa zákazníkov → Čo má objednané → Kontakty z odhadov): kancelária má len sekciu Odhady (+ kalendár a chat),
--    bez skenera a webu, zadarmo – platí len za prevzaté kontakty. Hlavný správca ju zapíše ako „Platiaci“ (cena 0 €), okresy = odkiaľ vidí kontakty,
--    a pošle odkaz na registráciu (bez skúšobnej doby, okresy sa pri registrácii nepýtajú – prenesú sa zo zákazníka)
--  * právo „kontakty“ v prístupe makléra: platené kontakty preberá administrátor; maklérom ho zapne administrátor v časti Tím
--    (upozornenia do mobilu na nové kontakty dostávajú len tí, ktorí ich smú preberať)

create or replace function public._sekcie_z_modulov(p_moduly text[])
returns text[] language sql immutable set search_path = public as $$
  select array(select distinct s from unnest(
    array['kalendar', 'chat']
    || case when 'skener' = any(p_moduly) then array['inzeraty', 'mapa', 'kataster'] else '{}'::text[] end
    || case when 'web' = any(p_moduly) then array['web', 'nehnutelnosti', 'recenzie', 'asistent', 'odhady'] else '{}'::text[] end
    || case when 'ponuky' = any(p_moduly) then array['nehnutelnosti', 'odhady'] else '{}'::text[] end
    || case when 'klienti_aml' = any(p_moduly) then array['klienti'] else '{}'::text[] end
    || case when 'ai' = any(p_moduly) then array['asistent'] else '{}'::text[] end
    || case when 'kontakty' = any(p_moduly) then array['odhady'] else '{}'::text[] end   -- 120: účet len na kontakty z odhadov
    || case when 'kancelaria' = any(p_moduly)
         then array['nehnutelnosti', 'klienti', 'mapa', 'kataster', 'asistent', 'web', 'recenzie', 'provizie', 'odhady'] else '{}'::text[] end
  ) s order by s)
$$;

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'matterport', 'kalendar', 'mapa', 'kataster', 'asistent', 'web',
                             'recenzie', 'provizie', 'siete', 'odhady', 'kontakty')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

-- smie prihlásený preberať platené kontakty (administrátor vždy, maklér s právom „kontakty“)
create or replace function public._smie_preberat_kontakty() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from makleri m where m.id = auth.uid() and m.aktivny and (m.rola = 'admin' or 'kontakty' = any(m.pristup)))
$$;

-- makléri, ktorým príde do mobilu nový kontakt na predaj – len tí, čo ho smú prevziať
create or replace function public._kontakty_kupci(p_okres text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.id), '{}') from makleri m
   where m.aktivny and m.kancelaria_id in (select _kontakty_kancelarie(p_okres))
     and (m.rola = 'admin' or ('kontakty' = any(m.pristup) and 'odhady' = any(m.pristup)))
$$;

create or replace function public.kontakty_na_predaj() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_k bigint := moja_kancelaria();
  n kontakty_nastavenie;
  v_okresy text[];
begin
  if not ja_aktivny() or not ma_pristup('odhady') then raise exception 'Nemáte prístup k odhadom.' using errcode = '42501'; end if;
  select * into n from kontakty_nastavenie where id = 1;
  select coalesce(array_agg(o order by o), '{}') into v_okresy from unnest(n.okresy) o where v_k in (select _kontakty_kancelarie(o));
  return jsonb_build_object(
    'okresy', to_jsonb(v_okresy), 'smiem', _smie_preberat_kontakty(),
    'kredit', _kontakty_kredit(v_k), 'zadarmo', _kontakty_zadarmo(v_k), 'zadarmo_spolu', n.zadarmo,
    'ceny', n.ceny, 'koniec_h', n.koniec_h, 'reklamacia_h', n.reklamacia_h,
    'ponuky', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'typ', o.typ, 'nazov', o.nazov, 'okres', o.okres, 'obec', o.obec, 'cast_obce', o.cast_obce,
        'plocha', o.plocha, 'pozemok', o.pozemok, 'izby', o.izby, 'poschodie', o.poschodie, 'poschodi', o.poschodi, 'druh_pozemku', o.druh_pozemku,
        'stav', o.stav_nehn, 'rek', _odhad_rek_text(o.rekonstrukcia), 'doplnky', o.doplnky, 'siete', o.siete,
        'dovod', o.dovod, 'kedy_predat', o.kedy_predat, 'kedy_volat', o.kedy_volat, 'fotky', o.fotky,
        'odhad', coalesce(case when md.m ? 'od' and md.m->>'od' is not null then jsonb_build_object('od', md.m->'od', 'do', md.m->'do', 'podla', 'median') end,
                          case when o.auto->>'od' is not null then jsonb_build_object('od', o.auto->'od', 'do', o.auto->'do', 'podla', 'skener') end),
        'vytvorene', o.vytvorene, 'od', o.trh_od, 'koniec', o.trh_koniec,
        'cena', _kontakt_cena(o.trh_ceny, o.trh_od), 'dalsia', _kontakt_dalsia(o.trh_ceny, o.trh_od)) order by o.vytvorene desc)
      from odhady_hodnoty o
      left join lateral (select case when o.typ = 'byt' then _odhad_median(o) end as m) md on true
      where o.trh_od is not null and o.predane is null and o.trh_koniec > now() and o.okres = any(v_okresy)), '[]'::jsonb),
    'kupene', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nazov', o.nazov, 'predane', o.predane, 'cena', o.predane_cena, 'zadarmo', o.predane_zadarmo,
        'kto', o.predane_kto, 'reklamacia', (select jsonb_build_object('stav', r.stav, 'dovod', r.dovod, 'odpoved', r.odpoved) from kontakty_reklamacie r where r.odhad_id = o.id))
        order by o.predane desc)
      from odhady_hodnoty o where o.predane_kancelaria = v_k and o.predane_ako = 'nakup' and o.predane > now() - interval '90 days'), '[]'::jsonb),
    'pohyby', case when ja_admin() then coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id desc) from (
        select id, vytvorene, druh, suma, zadarmo, poznamka from kontakty_pohyby where kancelaria_id = v_k order by id desc limit 30) x), '[]'::jsonb) end);
end $$;

create or replace function public.kontakt_prevziat(p_id bigint, p_cena integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
  v_k bigint := moja_kancelaria();
  o odhady_hodnoty;
  v_cena int;
  v_zadarmo boolean;
  v_kredit numeric;
begin
  if v_ja is null or not ja_aktivny() or not ma_pristup('odhady') then raise exception 'Nemáte prístup k odhadom.' using errcode = '42501'; end if;
  if not _smie_preberat_kontakty() then
    raise exception 'Platené kontakty preberá administrátor kancelárie. Maklérom to môže zapnúť v časti Tím.' using errcode = '42501';
  end if;
  if aktivna_kancelaria() is distinct from v_k then raise exception 'Kontakt sa dá prevziať len vo vlastnej kancelárii.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(918278, v_k::int);
  select * into o from odhady_hodnoty where id = p_id for update;
  if not found or o.trh_od is null then raise exception 'Kontakt sa nenašiel.' using errcode = '22023'; end if;
  if o.predane is not null then
    raise exception '%', case when o.predane_kancelaria = v_k then 'Tento kontakt už vaša kancelária má.' else 'Tento kontakt už prevzala iná kancelária.' end using errcode = '22023';
  end if;
  if now() >= o.trh_koniec then raise exception 'Ponuka tohto kontaktu už skončila.' using errcode = '22023'; end if;
  if not (v_k in (select _kontakty_kancelarie(o.okres))) then
    raise exception 'Vaša kancelária kontakty z okresu % neprevezme – okres nie je medzi vašimi.', o.okres using errcode = '42501';
  end if;
  v_cena := _kontakt_cena(o.trh_ceny, o.trh_od);
  if p_cena is not null and v_cena > p_cena then
    raise exception 'Cena sa medzitým zmenila na % €. Skúste to znova.', v_cena using errcode = '22023';
  end if;
  v_zadarmo := _kontakty_zadarmo(v_k) > 0;
  if not v_zadarmo then
    v_kredit := _kontakty_kredit(v_k);
    if v_kredit < v_cena then
      raise exception 'Nemáte dosť kreditu: zostatok % €, kontakt stojí % €. Kredit vám pripíšeme po platbe – napíšte na info@realitnytypek.sk.',
        trim(to_char(v_kredit, 'FM999990.00')), v_cena using errcode = '22023';
    end if;
  end if;
  insert into kontakty_pohyby (kancelaria_id, druh, suma, zadarmo, odhad_id, kto, poznamka)
  values (v_k, 'nakup', case when v_zadarmo then 0 else -v_cena end, v_zadarmo, o.id, v_ja,
          left(coalesce(o.nazov, o.obec) || case when v_zadarmo then ' (zadarmo)' else '' end, 200));
  perform _kontakt_odovzdaj(o.id, v_ja, case when v_zadarmo then 0 else v_cena end, v_zadarmo, 'nakup');
  return jsonb_build_object('ok', true, 'id', o.id, 'cena', case when v_zadarmo then 0 else v_cena end, 'zadarmo', v_zadarmo,
    'kredit', _kontakty_kredit(v_k), 'zostava_zadarmo', _kontakty_zadarmo(v_k));
end $$;

-- existujúce kancelárie zákazníkov: prepočítať sekcie (nový modul zatiaľ nikto nemá – pre istotu)
update public.kancelarie k set sekcie = _sekcie_z_modulov(z.moduly)
  from public.zakaznici z
 where z.id = k.zakaznik_id and k.sekcie is not null and k.sekcie is distinct from _sekcie_z_modulov(z.moduly);

revoke execute on function public._smie_preberat_kontakty() from public, anon, authenticated;
revoke execute on function public._kontakty_kupci(text) from public, anon, authenticated;

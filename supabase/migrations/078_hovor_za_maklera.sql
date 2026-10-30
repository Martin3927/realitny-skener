-- Hovor zapísaný adminom za makléra: oslava „získal do ponuky“ v chate a pripomienka „Znova zavolať“
-- patria maklérovi, ktorému je inzerát pridelený (nie tomu, kto hovor zapísal).

create or replace function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m makleri; z inzeraty; v_nehn text; v_cas timestamptz; v_pokus int; v_ma uuid;
begin
  perform _moj_alebo_prevezmi(p_inzerat);
  -- komu inzerát patrí (admin môže zapísať hovor za makléra, ktorému ho pridelil)
  select makler_id into v_ma from prevzatia where inzerat_id = p_inzerat;
  v_ma := coalesce(v_ma, auth.uid());
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
    values (v_ma, auth.uid(), p_inzerat, v_cas,
            left('Znova zavolať: ' || coalesce(_nazov_inzeratu(z), 'inzerát') || ' – predajca nedvíhal (' ||
                 to_char(now() at time zone 'Europe/Bratislava', 'FMDD. FMMM. "o" HH24:MI') || ', ' || v_pokus || '. pokus)', 500),
            'volat', now());   -- e-mail sa pri tejto pripomienke neposiela
    return jsonb_build_object('volat_znova', v_cas, 'pokus', v_pokus);
  end if;
  if p_vysledok = 'Získaný do ponuky' then
    select * into m from makleri where id = v_ma;
    v_nehn := case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom' when 'pozemok' then 'pozemok'
                         when 'chata' then 'chatu' when 'garaz' then 'garáž' else 'nehnuteľnosť' end;
    insert into spravy (makler_id, text, typ, kluc)
    values (null, '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end || ' do ponuky ' || v_nehn ||
                  coalesce(', ' || nullif(z.obec, ''), '') || '! Gratulujeme 👏', 'uspech', 'uspech:' || p_inzerat || ':' || v_ma)
    on conflict do nothing;
  end if;
  return '{}'::jsonb;
end $$;

-- oprava správy z 30. 10. (byt na Mieri pridelený Martine Macejovej)
update spravy s set text = '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end ||
         ' do ponuky 3-izbový byt, Spišská Nová Ves! Gratulujeme 👏',
       kluc = 'uspech:bazos:195439155:' || m.id
from prevzatia p join makleri m on m.id = p.makler_id
where p.inzerat_id = 'bazos:195439155' and s.kluc like 'uspech:bazos:195439155:%' and s.kluc <> 'uspech:bazos:195439155:' || m.id;

-- =====================================================================
-- 17. 11. 2026
--  1) Pondelkový e-mail maklérovi: jeho web (návštevy, kontakty, najsledovanejšia ponuka), skener (minulý týždeň,
--     čo drží, čo sa mu dnes uvoľní, nové súkromné v jeho obciach) a pripomienky na tento týždeň.
--     Vypne si ho sám v Môj profil (makleri.upozornenia.tyzden = false).
--  2) Prvé kroky: kontrolný zoznam pre nového makléra v aplikácii a prehľad pre hlavného správcu, kto sa kde zasekol.
--  3) Web makléra: sekcia „Hľadám pre svojich klientov“ – anonymné aktívne dopyty (bez mena, kontaktu a popisu).
-- =====================================================================

-- ---------------------------------------------------------------- spoločné
-- prístup daného makléra k sekcii (ako ma_pristup, ale pre ľubovoľného makléra – pre e-maily a prehľady)
create or replace function public._ma_pristup_m(p_makler uuid, p_sekcia text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from makleri m left join kancelarie k on k.id = m.kancelaria_id
    where m.id = p_makler and m.aktivny and (m.rola = 'admin' or p_sekcia = any(m.pristup))
      and (k.id is null
           or exists (select 1 from hlavni_spravcovia h where h.user_id = m.id)
           or (_kancelaria_platna(k.id) and (k.sekcie is null or p_sekcia = any(k.sekcie)))))
$$;
revoke execute on function public._ma_pristup_m(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 1) pondelkový e-mail
alter table public.makleri add column if not exists tyzden_email timestamptz;

-- údaje pre e-mail jedného makléra za minulý týždeň (pondelok – nedeľa)
create or replace function public._tyzden_maklera(p_makler uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m makleri; w weby; v_kn text;
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_od date := v_dnes - 7; v_do date := v_dnes - 1;
  v_web jsonb; v_sk jsonb; v_prip jsonb; v_prip_n int; ids bigint[];
begin
  select * into m from makleri where id = p_makler and aktivny;
  if m.id is null then return null; end if;
  select nazov into v_kn from kancelarie where id = m.kancelaria_id;

  -- osobný web (len zverejnený)
  if _ma_pristup_m(p_makler, 'web') then
    select * into w from weby where makler_id = p_makler and not coalesce(kancelaria, false) and zverejnene_kedy is not null order by id limit 1;
    if w.id is not null then
      select array_agg(id) into ids from nehnutelnosti where makler_id = p_makler and stav in ('aktivne', 'rezervovane');
      v_web := jsonb_build_object(
        'adresa', w.adresa,
        'domena', case when w.domena_pripojena is not null then w.domena end,
        'navstevy', (select coalesce(sum(pocet), 0) from web_zobrazenia where web_id = w.id and den between v_od and v_do),
        'navstevy_pred', (select coalesce(sum(pocet), 0) from web_zobrazenia where web_id = w.id and den between v_od - 7 and v_od - 1),
        'kliky', (select coalesce(sum(pocet), 0) from web_kliky where web_id = w.id and den between v_od and v_do),
        'kontakty_pocet', (select count(*) from web_kontakty where web_id = w.id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
        'kontakty', coalesce((select jsonb_agg(jsonb_build_object('meno', k.meno, 'zdroj', k.zdroj, 'co', left(coalesce(k.co, ''), 120), 'kedy', k.vytvorene) order by k.vytvorene desc)
                              from (select * from web_kontakty where web_id = w.id and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do
                                    order by vytvorene desc limit 6) k), '[]'::jsonb),
        'top', (select jsonb_build_object('id', n.id, 'nazov', coalesce(nullif(trim(n.nazov), ''), concat_ws(', ', n.typ, n.obec)), 'pocet', z.s)
                from (select nehnutelnost_id, sum(pocet) s from zobrazenia_ponuk
                      where nehnutelnost_id = any(coalesce(ids, '{}')) and den between v_od and v_do group by 1 order by 2 desc limit 1) z
                join nehnutelnosti n on n.id = z.nehnutelnost_id));
    end if;
  end if;

  -- skener
  if _ma_pristup_m(p_makler, 'inzeraty') then
    v_sk := jsonb_build_object(
      'prevzal', (select count(*) from aktivity where makler_id = p_makler and typ = 'prevzatie' and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
      'hovory', (select count(*) from aktivity where makler_id = p_makler and typ = 'hovor' and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
      'ziskane', (select count(*) from aktivity where makler_id = p_makler and typ = 'hovor' and vysledok = 'Získaný do ponuky' and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
      'stretnutia', (select count(*) from aktivity where makler_id = p_makler and typ = 'hovor' and vysledok = 'Záujem – stretnutie dohodnuté' and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
      'auto_uvolnene', (select count(*) from aktivity where makler_id = p_makler and typ = 'uvolnenie' and poznamka like 'automaticky%' and (vytvorene at time zone 'Europe/Bratislava')::date between v_od and v_do),
      'drzi', (select count(*) from prevzatia where makler_id = p_makler),
      'bez_hovoru', (select count(*) from prevzatia where makler_id = p_makler and coalesce(pocet_hovorov, 0) = 0),
      'uvolni_dnes', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nazov', x.nazov, 'kedy', x.kedy) order by x.kedy) from (
          select i.id, coalesce(_nazov_inzeratu(i), i.nazov) as nazov, p.upravene + interval '24 hours' as kedy
          from prevzatia p join inzeraty i on i.id = p.inzerat_id
          where p.makler_id = p_makler
            and ((p.upravene + interval '24 hours') at time zone 'Europe/Bratislava')::date <= v_dnes
            and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
            and not exists (select 1 from pripomienky r where r.inzerat_id = p.inzerat_id and r.makler_id = p.makler_id and r.druh = 'pripomienka'
                              and r.hotovo is null and r.zrusena is null and r.cas > now())
          order by p.upravene limit 6) x), '[]'::jsonb),
      'obce', to_jsonb(coalesce(m.obce, '{}')),
      'nove_obce', case when coalesce(array_length(m.obce, 1), 0) > 0 then
          (select count(*) from inzeraty i where i.aktivny and i.duplikat_z is null and coalesce(i.predajca_typ, '') <> 'rk'
             and i.obec = any(m.obce) and i.prvy_krat >= now() - interval '7 days') end,
      'volne_obce', case when coalesce(array_length(m.obce, 1), 0) > 0 then
          (select count(*) from inzeraty i where i.aktivny and i.duplikat_z is null and coalesce(i.predajca_typ, '') <> 'rk'
             and i.obec = any(m.obce)
             and not exists (select 1 from prevzatia p where p.inzerat_id = i.id and p.kancelaria_id = m.kancelaria_id and p.makler_id is not null)) end);
  end if;

  -- pripomienky na najbližších 7 dní
  select count(*) into v_prip_n from pripomienky
   where makler_id = p_makler and hotovo is null and zrusena is null and cas >= now() and cas < now() + interval '7 days'
     and coalesce(druh, 'pripomienka') <> 'uvolnenie';
  v_prip := coalesce((select jsonb_agg(jsonb_build_object('cas', x.cas, 'poznamka', left(coalesce(x.poznamka, ''), 120), 'druh', x.druh) order by x.cas) from (
      select * from pripomienky
      where makler_id = p_makler and hotovo is null and zrusena is null and cas >= now() and cas < now() + interval '7 days'
        and coalesce(druh, 'pripomienka') <> 'uvolnenie'
      order by cas limit 6) x), '[]'::jsonb);

  return jsonb_build_object('meno', m.meno, 'oslovenie', m.oslovenie, 'pohlavie', m.pohlavie, 'kancelaria', coalesce(v_kn, 'Realitná kancelária'),
    'od', v_od, 'do', v_do, 'web', v_web, 'skener', v_sk, 'pripomienky', v_prip, 'pripomienky_pocet', v_prip_n);
end $$;
revoke execute on function public._tyzden_maklera(uuid) from public, anon, authenticated;

-- komu poslať (aktívny, má e-mail, nevypol si ho, kancelária platí, tento týždeň ešte nedostal)
create or replace function public._tyzden_na_odoslanie() returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select m.id, m.email from makleri m left join kancelarie k on k.id = m.kancelaria_id
  where m.aktivny and coalesce(trim(m.email), '') <> ''
    and coalesce(m.upozornenia->>'tyzden', 'true') <> 'false'
    and (m.tyzden_email is null or m.tyzden_email < now() - interval '5 days')
    and (k.id is null or _kancelaria_platna(k.id))
  order by m.kancelaria_id, m.meno
$$;
revoke execute on function public._tyzden_na_odoslanie() from public, anon, authenticated;

-- maklér si e-mail zapne alebo vypne sám (Môj profil)
create or replace function public.nastavit_tyzdenny_email(p_zap boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not ja_aktivny() then raise exception 'Nie ste prihlásený.'; end if;
  update makleri set upozornenia = coalesce(upozornenia, '{}'::jsonb) || jsonb_build_object('tyzden', coalesce(p_zap, true)) where id = auth.uid();
end $$;
revoke execute on function public.nastavit_tyzdenny_email(boolean) from public, anon;
grant execute on function public.nastavit_tyzdenny_email(boolean) to authenticated;

-- plánovač: pondelok 7:30 slovenského času (cron beží v UTC, preto 5:30 aj 6:30 a kontrola hodiny)
create or replace function public.tyzden_maklerom() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if extract(hour from now() at time zone 'Europe/Bratislava') <> 7 then return; end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    body := '{"maklerom": true}'::jsonb,
    timeout_milliseconds := 120000);
end $$;
revoke execute on function public.tyzden_maklerom() from public, anon, authenticated;

do $$ begin perform cron.unschedule('tyzden-maklerom'); exception when others then null; end $$;
select cron.schedule('tyzden-maklerom', '30 5,6 * * 1', 'select public.tyzden_maklerom()');

-- ---------------------------------------------------------------- 2) prvé kroky
create or replace function public._prve_kroky(p_makler uuid) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'vytvorene', m.vytvorene,
    'prihlaseny', (select u.last_sign_in_at from auth.users u where u.id = m.id),
    'naposledy', m.naposledy_aktivny,
    'foto', coalesce(m.foto, '') <> '',
    'telefon', coalesce(trim(m.telefon), '') <> '',
    'obce', coalesce(array_length(m.obce, 1), 0),
    'push', (select count(*) from push_odbery p where p.makler_id = m.id),
    'prevzatia', (select count(*) from aktivity a where a.makler_id = m.id and a.typ = 'prevzatie'),
    'hovory', (select count(*) from aktivity a where a.makler_id = m.id and a.typ = 'hovor'),
    'web_zverejneny', exists (select 1 from weby w where w.makler_id = m.id and not coalesce(w.kancelaria, false) and w.zverejnene_kedy is not null),
    'ma_skener', _ma_pristup_m(m.id, 'inzeraty'),
    'ma_web', _ma_pristup_m(m.id, 'web'))
  from makleri m where m.id = p_makler
$$;
revoke execute on function public._prve_kroky(uuid) from public, anon, authenticated;

create or replace function public.moje_prve_kroky() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not ja_aktivny() then return null; end if;
  return _prve_kroky(auth.uid());
end $$;
revoke execute on function public.moje_prve_kroky() from public, anon;
grant execute on function public.moje_prve_kroky() to authenticated;

-- prehľad pre hlavného správcu: každý aktívny maklér zákazníkov a jeho prvé kroky
create or replace function public.prve_kroky_prehlad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not je_hlavny_spravca() then raise exception 'Prehľad vidí iba hlavný správca.'; end if;
  return coalesce((select jsonb_agg(x order by x->>'zakaznik_stav' = 'vlastna', x->>'kancelaria', x->>'meno') from (
    select jsonb_build_object('id', m.id, 'meno', m.meno, 'email', m.email, 'telefon', m.telefon, 'rola', m.rola,
             'kancelaria', k.nazov, 'kancelaria_id', k.id, 'zakaznik_id', z.id, 'zakaznik_stav', z.stav, 'skusobna_do', z.skusobna_do,
             'kroky', _prve_kroky(m.id)) as x
    from makleri m join kancelarie k on k.id = m.kancelaria_id left join zakaznici z on z.id = k.zakaznik_id
    where m.aktivny and coalesce(z.stav, '') <> 'zruseny') t), '[]'::jsonb);
end $$;
revoke execute on function public.prve_kroky_prehlad() from public, anon;
grant execute on function public.prve_kroky_prehlad() to authenticated;

-- ---------------------------------------------------------------- 3) web makléra: anonymné dopyty
create or replace function public.verejny_web(p_adresa text, p_nahlad boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w weby; v_obsah jsonb;
begin
  w := _web_podla(p_adresa);
  if w.id is null then return null; end if;
  if p_nahlad and ja_aktivny() and w.kancelaria_id = aktivna_kancelaria() then v_obsah := w.koncept; else v_obsah := w.zverejnene; p_nahlad := false; end if;
  if v_obsah is null then return null; end if;
  if w.kancelaria then return _verejny_web_kancelarie(w, v_obsah, p_nahlad and ja_aktivny()); end if;
  if not exists (select 1 from makleri where id = w.makler_id and aktivny) then return null; end if;
  v_obsah := v_obsah #- '{dl,url}';
  return jsonb_build_object(
    'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end, 'web', v_obsah, 'nahlad', p_nahlad and ja_aktivny(),
    'zverejnene_kedy', w.zverejnene_kedy,
    'makler', verejny_makler(w.makler_id),
    'ponuky', coalesce((select jsonb_agg(_web_ponuka(n) order by (n.stav = 'aktivne') desc, n.exkluzivne desc, n.upravene desc)
                        from nehnutelnosti n where n.makler_id = w.makler_id and n.stav in ('aktivne', 'rezervovane')), '[]'::jsonb),
    'predane', coalesce((select jsonb_agg(x order by x->>'upravene' desc) from (
                          select _web_ponuka(n) as x from nehnutelnosti n
                          where n.makler_id = w.makler_id and n.stav = 'predane' and n.upravene > now() - interval '2 years'
                          order by n.upravene desc limit 12) t), '[]'::jsonb),
    'recenzie', verejne_recenzie(w.makler_id),
    -- len čo klient hľadá: bez mena, kontaktu a vlastného popisu; na verejnom webe len so zapnutou sekciou
    'dopyty', case when p_nahlad or coalesce(v_obsah->'on'->>'hladam', 'false') = 'true' then
                coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('t', d.transakcia, 'k', d.kategorie, 'ty', d.typy, 'o', d.obce, 'ok', d.okresy,
                           'c1', d.cena_od, 'c2', d.cena_do, 'p1', d.plocha_od, 'i1', d.izby_od, 'i2', d.izby_do,
                           'dni', greatest(0, current_date - d.vytvorene::date)) as x
                  from dopyty d
                  where d.makler_id = w.makler_id and d.stav = 'aktivny' and d.upravene > now() - interval '1 year'
                  order by d.vytvorene desc limit 12) t), '[]'::jsonb)
              else '[]'::jsonb end,
    'kancelaria', vzhlad_kancelarie(w.kancelaria_id), 'kancelaria_id', w.kancelaria_id);
end $$;
revoke execute on function public.verejny_web(text, boolean) from public;
grant execute on function public.verejny_web(text, boolean) to anon, authenticated;

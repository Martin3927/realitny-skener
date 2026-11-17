-- Prevádzka a nové kontakty (17. 11. 2026):
--  1) strážca prevádzky – hlavnému správcovi príde správa, len keď je problém: skener nebeží, portál dlhšie nevracia
--     inzeráty, zlyhala záloha alebo nasadenie, hosting je plný na viac ako 85 %. Keď sa to vyrieši, príde „✅“.
--  3) predajca zlacnel – upozornenie (zvonček + mobil cez deň) každému maklérovi, ktorý s inzerátom pracoval
--  4) súkromník sa vrátil – nový inzerát s telefónom predajcu, s ktorým sme už hovorili (alebo znova zverejnený
--     inzerát) → upozornenie pôvodnému maklérovi aj s výsledkom a poznámkou z minulého hovoru

-- ---------------------------------------------------------------- 1) strážca prevádzky
create table if not exists public.prevadzka_problemy (
  kluc text primary key,
  text text not null,
  od timestamptz not null default now(),
  posledne timestamptz not null default now(),
  upozornene timestamptz,
  zdroj text not null default 'kontrola'          -- kontrola (cron v databáze) | hlasenie (z GitHubu)
);
alter table public.prevadzka_problemy enable row level security;
drop policy if exists prevadzka_spravca on public.prevadzka_problemy;
create policy prevadzka_spravca on public.prevadzka_problemy for select to authenticated
  using (exists (select 1 from hlavni_spravcovia h where h.user_id = auth.uid()));

create or replace function public._prevadzka_spravcovia() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from hlavni_spravcovia
$$;
revoke execute on function public._prevadzka_spravcovia() from public, anon, authenticated;

-- zapíše alebo vyrieši problém; pri vyriešení po upozornení pošle „✅ vyriešené“ (v noci potichu)
create or replace function public._prevadzka_nastav(p_kluc text, p_problem boolean, p_text text, p_zdroj text default 'kontrola') returns void
language plpgsql security definer set search_path = public as $$
declare r prevadzka_problemy; v_hod int := extract(hour from now() at time zone 'Europe/Bratislava')::int;
begin
  if p_problem then
    insert into prevadzka_problemy (kluc, text, zdroj) values (p_kluc, left(p_text, 280), p_zdroj)
    on conflict (kluc) do update set text = excluded.text, posledne = now();
  else
    delete from prevadzka_problemy where kluc = p_kluc returning * into r;
    if r.upozornene is not null and v_hod >= 7 and v_hod < 22 then
      perform _push_zaradit(_prevadzka_spravcovia(), 'prevadzka', '✅ Týpek: vyriešené', 'Už je to v poriadku: ' || r.text,
                            './#inzeraty', 'typek-prevadzka-' || p_kluc);
    end if;
  end if;
end $$;
revoke execute on function public._prevadzka_nastav(text, boolean, text, text) from public, anon, authenticated;

-- hlásenie z GitHubu (záloha, nasadenie, hosting) – kľúč skenera
create or replace function public.prevadzka_hlasenie(p_kluc text, p_druh text, p_ok boolean, p_text text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  if p_druh not in ('zaloha', 'nasadenie', 'hosting', 'databaza') then raise exception 'Neznámy druh hlásenia.'; end if;
  perform _prevadzka_nastav(p_druh, not p_ok, coalesce(nullif(trim(p_text), ''), case p_druh
    when 'zaloha' then 'Záloha zlyhala.' when 'nasadenie' then 'Nasadenie aplikácie zlyhalo – beží predchádzajúca verzia.'
    when 'databaza' then 'Nasadenie zmien databázy zlyhalo.' else 'Hosting je takmer plný.' end), 'hlasenie');
end $$;
revoke execute on function public.prevadzka_hlasenie(text, text, boolean, text) from public, authenticated;
grant execute on function public.prevadzka_hlasenie(text, text, boolean, text) to anon;

create or replace function public._prevadzka_kontrola() returns int
language plpgsql security definer set search_path = public as $$
declare v_meta jsonb; v_posl timestamptz; v_hod int := extract(hour from now() at time zone 'Europe/Bratislava')::int;
        p record; n int := 0; v_ch text; v_portal record;
begin
  if not pg_try_advisory_xact_lock(510129) then return 0; end if;
  select meta into v_meta from stav_skenera where id = 1;
  v_posl := nullif(v_meta ->> 'posledna_kontrola', '')::timestamptz;
  -- skener beží každých 10 minút (aj v noci); 35 minút bez kontroly = niečo je zle (GitHub, plánovač, kľúč)
  perform _prevadzka_nastav('skener', v_posl is null or v_posl < now() - interval '35 minutes',
    'Skener nebežal od ' || coalesce(to_char(v_posl at time zone 'Europe/Bratislava', 'DD. MM. HH24:MI'), 'neznáma') ||
    ' – nové inzeráty sa neukladajú. Pozri GitHub Actions (Realitný skener).');
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
revoke execute on function public._prevadzka_kontrola() from public, anon, authenticated;
do $$ begin perform cron.unschedule('prevadzka-kontrola'); exception when others then null; end $$;
select cron.schedule('prevadzka-kontrola', '*/10 * * * *', 'select public._prevadzka_kontrola()');

-- ---------------------------------------------------------------- pripomienky: nové druhy
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost', 'web', 'volat', 'zakaznik', 'navrat'));

-- maklér, ktorý s inzerátom pracoval (prevzal, volal, poslal SMS/email) – v danej kancelárii
create or replace function public._pracovali_s_inzeratom(p_inzerat text) returns table (makler_id uuid, kancelaria_id bigint)
language sql stable security definer set search_path = public as $$
  select distinct x.makler_id, x.kancelaria_id from (
    select p.makler_id, p.kancelaria_id from prevzatia p where p.inzerat_id = p_inzerat and p.makler_id is not null
    union all
    select a.makler_id, a.kancelaria_id from aktivity a
    where a.inzerat_id = p_inzerat and a.typ in ('hovor', 'sms', 'email', 'prevzatie') and a.vytvorene > now() - interval '1 year'
  ) x join makleri m on m.id = x.makler_id and m.aktivny
  where x.makler_id is not null
$$;
revoke execute on function public._pracovali_s_inzeratom(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) predajca zlacnel
create or replace function public._znizena_cena()
 returns trigger language plpgsql security definer set search_path = public as $$
declare v_karta text := coalesce(new.duplikat_z, new.id); v_pct int;
begin
  if new.cena is null or old.cena is null or old.cena <= 0 or new.cena >= old.cena * 0.995 then return new; end if;
  v_pct := round((1 - new.cena::numeric / old.cena) * 100);
  insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
  select w.makler_id, v_karta, now(),
         left(coalesce(nullif(new.nazov, ''), 'Inzerát'), 70) || coalesce(' (' || new.obec || ')', '') ||
         ' zlacnel z ' || _eur(old.cena) || ' na ' || _eur(new.cena) || ' (−' || _eur(old.cena - new.cena) || ', ' || v_pct || ' %). ' ||
         'Dobrý moment znova zavolať.', 'cena', w.kancelaria_id
  from (select * from _pracovali_s_inzeratom(new.id) union select * from _pracovali_s_inzeratom(v_karta)) w
  left join oznacenia o on o.inzerat_id = v_karta and o.kancelaria_id = w.kancelaria_id
  where coalesce(o.predajca_typ, new.predajca_typ) <> 'rk'
    and not exists (select 1 from pripomienky x where x.makler_id = w.makler_id and x.inzerat_id = v_karta and x.druh = 'cena'
                    and x.vytvorene > now() - interval '12 hours');
  return new;
exception when others then return new;   -- upozornenie nesmie zastaviť ukladanie skenera
end $$;

-- ---------------------------------------------------------------- 4) súkromník sa vrátil
create or replace function public._navrat_predajcov() returns int
language plpgsql security definer set search_path = public as $$
declare k record; r record; n int := 0; v_txt text;
begin
  if not pg_try_advisory_xact_lock(510130) then return 0; end if;
  for k in select id, okresy from kancelarie where aktivna loop
    for r in
      with t as (select * from _telefony_inzeratov(k.id)),
      nove as (   -- nové súkromné inzeráty z okresov kancelárie (posledné 3 dni)
        select i.id, i.nazov, i.obec, t.tel from inzeraty i join t on t.inzerat_id = i.id
        left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = k.id
        where i.prvy_krat > now() - interval '3 days' and i.aktivny and i.duplikat_z is null and i.okres = any(k.okresy)
          and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'
          and not exists (select 1 from predajcovia pr where pr.telefon = t.tel and pr.kancelaria_id = k.id and (pr.rk or pr.nevolat))
      ),
      zhody as (  -- starší inzerát s tým istým telefónom, s ktorým niekto z kancelárie pracoval
        select distinct on (n.id, w.makler_id) n.id as nove_id, n.nazov, n.obec, s.inzerat_id as stary_id, w.makler_id
        from nove n join t s on s.tel = n.tel and s.inzerat_id <> n.id
        join inzeraty o on o.id = s.inzerat_id and o.prvy_krat < now() - interval '3 days'
        cross join lateral _pracovali_s_inzeratom(s.inzerat_id) w
        where w.kancelaria_id = k.id
        order by n.id, w.makler_id, o.prvy_krat desc
      ),
      obnovene as (  -- ten istý inzerát zverejnený znova (skener ho spojil so starým)
        select i.id as nove_id, i.nazov, i.obec, i.id as stary_id, w.makler_id
        from inzeraty i cross join lateral _pracovali_s_inzeratom(i.id) w
        where i.obnovene > now() - interval '1 day' and i.aktivny and i.duplikat_z is null and i.okres = any(k.okresy)
          and w.kancelaria_id = k.id
      )
      select z.*, (select a.vytvorene from aktivity a where a.inzerat_id = z.stary_id and a.makler_id = z.makler_id
                    and a.typ in ('hovor', 'sms', 'email', 'prevzatie') order by a.vytvorene desc limit 1) as kedy,
             (select a.vysledok from aktivity a where a.inzerat_id = z.stary_id and a.makler_id = z.makler_id and a.typ = 'hovor'
                    order by a.vytvorene desc limit 1) as vysledok,
             (select a.poznamka from aktivity a where a.inzerat_id = z.stary_id and a.makler_id = z.makler_id and a.typ = 'hovor'
                    and nullif(trim(a.poznamka), '') is not null order by a.vytvorene desc limit 1) as poznamka
      from (select * from zhody union select * from obnovene) z
      where not exists (select 1 from pripomienky x where x.makler_id = z.makler_id and x.inzerat_id = z.nove_id and x.druh = 'navrat')
        and not exists (select 1 from prevzatia p where p.inzerat_id = z.nove_id and p.kancelaria_id = k.id and p.makler_id = z.makler_id
                        and z.nove_id <> z.stary_id)
    loop
      v_txt := 'Predajca, s ktorým si už ' || case when r.vysledok is not null then 'hovoril' else 'pracoval' end ||
               coalesce(' (' || to_char(r.kedy at time zone 'Europe/Bratislava', 'DD. MM. YYYY') || ')', '') ||
               case when r.nove_id = r.stary_id then ', zverejnil inzerát znova: ' else ', má nový inzerát: ' end ||
               left(coalesce(nullif(r.nazov, ''), 'Inzerát'), 70) || coalesce(' (' || r.obec || ')', '') || '.' ||
               coalesce(' Minule: ' || r.vysledok, '') || coalesce(' – „' || left(r.poznamka, 120) || '“', '');
      insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
        values (r.makler_id, r.nove_id, now(), v_txt, 'navrat', k.id);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public._navrat_predajcov() from public, anon, authenticated;
do $$ begin perform cron.unschedule('navrat-predajcov'); exception when others then null; end $$;
select cron.schedule('navrat-predajcov', '7,37 * * * *', 'select public._navrat_predajcov()');

-- ---------------------------------------------------------------- push pripomienok: aj zlacnenie a návrat (len cez deň)
create or replace function public._pripomienky_push() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0; v_titul text; v_den boolean;
begin
  if not pg_try_advisory_xact_lock(510103) then return 0; end if;
  v_den := extract(hour from now() at time zone 'Europe/Bratislava')::int between 7 and 21;
  for p in
    select r.id, r.makler_id, r.druh, r.poznamka, r.cas, r.inzerat_id
    from pripomienky r
    where (r.druh in ('pripomienka', 'obhliadka', 'udalost', 'zmluva') or (v_den and r.druh in ('cena', 'navrat')))
      and r.hotovo is null and r.zrusena is null and r.push_odoslany is null
      and r.cas <= now() and r.cas > now() - interval '12 hours'
    order by r.cas limit 100
  loop
    v_titul := case p.druh
      when 'obhliadka' then '🗝️ Obhliadka'
      when 'udalost' then '📅 Udalosť v kalendári'
      when 'zmluva' then '📝 Končí zmluva'
      when 'cena' then '📉 Predajca zlacnel'
      when 'navrat' then '🔁 Predajca sa vrátil'
      else '🔔 Pripomienka' end;
    begin
      perform _push_zaradit(array[p.makler_id], case when p.druh in ('cena', 'navrat') then 'inzeraty' else 'pripomienky' end, v_titul,
        coalesce(nullif(btrim(p.poznamka), ''), 'Pripomienka bez poznámky'),
        case when p.druh in ('cena', 'navrat') and p.inzerat_id is not null then './#inzeraty/' || p.inzerat_id else './#zvoncek' end,
        'typek-pripomienka-' || p.id);
    exception when others then null;
    end;
    update pripomienky set push_odoslany = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- 086: Týpkove nehnuteľnosti – články, Vyhľadaj makléra, Chcem byť maklér
--  * portal_clanky: články na portáli; píše a zverejňuje ich hlavný správca v Správe zákazníkov (záložka Články)
--    fotka = adresa https alebo názov obrázka z knižnice webov (img/web/<názov>.webp)
--  * portal_makleri: makléri, ktorí majú ponuku na portáli alebo zverejnený osobný web
--  * portal_ziadost: formulár „Chcem byť maklér“ → hlavnému správcovi do zvončeka a mobilu
--    (rovnaká ochrana proti robotom ako ostatné formuláre webov)
-- =====================================================================

-- ---------------------------------------------------------------- články
create table if not exists public.portal_clanky (
  id bigint generated always as identity primary key,
  slug text not null unique,
  nadpis text not null,
  perex text not null default '',
  text text not null default '',
  foto text,
  autor text,
  stav text not null default 'koncept' check (stav in ('koncept', 'zverejnene')),
  zverejnene timestamptz,
  vytvorene timestamptz not null default now(),
  upravene timestamptz not null default now(),
  upravil uuid references public.makleri(id) on delete set null
);
create index if not exists portal_clanky_zverejnene on public.portal_clanky (zverejnene desc) where stav = 'zverejnene';
alter table public.portal_clanky enable row level security;
revoke all on public.portal_clanky from anon, authenticated;

create or replace function public._portal_clanok(c portal_clanky, p_text boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('id', c.id, 'slug', c.slug, 'nadpis', c.nadpis, 'perex', c.perex,
    'text', case when p_text then c.text end, 'foto', c.foto, 'autor', c.autor, 'datum', coalesce(c.zverejnene, c.vytvorene)))
$$;

-- zverejnené články, najnovšie navrchu (bez celého textu)
create or replace function public.portal_clanky(p_limit int default 24) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_portal_clanok(c, false) order by c.zverejnene desc, c.id desc), '[]'::jsonb)
  from (select * from portal_clanky where stav = 'zverejnene' and zverejnene <= now()
        order by zverejnene desc, id desc limit least(greatest(coalesce(p_limit, 24), 1), 100)) c
$$;

create or replace function public.portal_clanok(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select _portal_clanok(c, true) from portal_clanky c
  where c.slug = lower(btrim(coalesce(p_slug, ''))) and c.stav = 'zverejnene' and c.zverejnene <= now()
$$;

-- správa článkov (iba hlavný správca)
create or replace function public._over_spravcu_portalu() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not je_hlavny_spravca() then raise exception 'Články na portáli spravuje hlavný správca.' using errcode = '42501'; end if;
end $$;

create or replace function public.portal_clanky_sprava() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_spravcu_portalu();
  return coalesce((select jsonb_agg(_portal_clanok(c, true) || jsonb_build_object('stav', c.stav, 'upravene', c.upravene, 'vytvorene', c.vytvorene)
                                    order by coalesce(c.zverejnene, c.vytvorene) desc, c.id desc) from portal_clanky c), '[]'::jsonb);
end $$;

create or replace function public.ulozit_portal_clanok(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_nadpis text := btrim(regexp_replace(coalesce(p->>'nadpis', ''), '\s+', ' ', 'g'));
  v_perex text := btrim(coalesce(p->>'perex', ''));
  v_text text := btrim(coalesce(p->>'text', ''));
  v_foto text := nullif(btrim(coalesce(p->>'foto', '')), '');
  v_autor text := nullif(btrim(coalesce(p->>'autor', '')), '');
  v_stav text := coalesce(nullif(p->>'stav', ''), 'koncept');
  v_slug text := nullif(_web_adresa(coalesce(nullif(p->>'slug', ''), p->>'nadpis')), '');
  v_zakl text; i int := 1; c portal_clanky;
begin
  perform _over_spravcu_portalu();
  if length(v_nadpis) < 3 then raise exception 'Napíš nadpis článku.' using errcode = '22023'; end if;
  if length(v_nadpis) > 140 then raise exception 'Nadpis je príliš dlhý (najviac 140 znakov).' using errcode = '22023'; end if;
  if length(v_perex) > 400 then raise exception 'Úvod je príliš dlhý (najviac 400 znakov).' using errcode = '22023'; end if;
  if length(v_text) > 40000 then raise exception 'Text článku je príliš dlhý.' using errcode = '22023'; end if;
  if v_stav not in ('koncept', 'zverejnene') then raise exception 'Neznámy stav článku.' using errcode = '22023'; end if;
  if v_foto is not null and (length(v_foto) > 600 or v_foto !~ '^(https://[^\s"''<>]+|[a-z0-9-]{2,60})$') then raise exception 'Fotka musí byť adresa https alebo obrázok z knižnice.' using errcode = '22023'; end if;
  if length(coalesce(v_autor, '')) > 80 then raise exception 'Meno autora je príliš dlhé.' using errcode = '22023'; end if;
  v_slug := left(trim(both '-' from coalesce(v_slug, 'clanok')), 80);
  v_zakl := v_slug;
  while exists (select 1 from portal_clanky where slug = v_slug and id is distinct from v_id) loop
    i := i + 1; v_slug := left(v_zakl, 76) || '-' || i;
  end loop;
  if v_id is null then
    insert into portal_clanky (slug, nadpis, perex, text, foto, autor, stav, zverejnene, upravil)
    values (v_slug, v_nadpis, v_perex, v_text, v_foto, v_autor, v_stav, case when v_stav = 'zverejnene' then now() end, auth.uid())
    returning * into c;
  else
    update portal_clanky set slug = v_slug, nadpis = v_nadpis, perex = v_perex, text = v_text, foto = v_foto, autor = v_autor,
      stav = v_stav, zverejnene = case when v_stav = 'zverejnene' then coalesce(zverejnene, now()) else null end,
      upravene = now(), upravil = auth.uid()
    where id = v_id returning * into c;
    if not found then raise exception 'Článok neexistuje.' using errcode = '22023'; end if;
  end if;
  return _portal_clanok(c, true) || jsonb_build_object('stav', c.stav, 'upravene', c.upravene, 'vytvorene', c.vytvorene);
end $$;

create or replace function public.zmazat_portal_clanok(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_spravcu_portalu();
  delete from portal_clanky where id = p_id;
end $$;

-- úvodné články (len keď ešte nie je žiadny) – hlavný správca ich môže upraviť alebo zmazať
insert into public.portal_clanky (slug, nadpis, perex, text, foto, stav, zverejnene)
select x.slug, x.nadpis, x.perex, x.text, x.foto, 'zverejnene', now() - x.pred
from (values
  ('kupa-nehnutelnosti-krok-za-krokom', 'Kúpa nehnuteľnosti krok za krokom',
   'Od prvej obhliadky až po odovzdanie kľúčov. Prehľad toho, čo vás pri kúpe bytu alebo domu čaká a na čo nezabudnúť.',
   E'Kúpa nehnuteľnosti je pre väčšinu ľudí jedno z najväčších rozhodnutí v živote. Keď viete, čo vás čaká, ide všetko pokojnejšie.\n\n## 1. Obhliadka\nNa obhliadku si nechajte dosť času a pokojne prídite aj druhýkrát, ideálne v inú dennú hodinu. Pýtajte sa na náklady na bývanie, kúrenie a stav domu.\n\n## 2. Rezervácia\nKeď sa rozhodnete, nehnuteľnosť sa zvyčajne rezervuje rezervačnou zmluvou. Pred podpisom si prečítajte, za akých podmienok sa rezervačný poplatok vracia a do kedy treba podpísať kúpnu zmluvu.\n\n## 3. Financovanie\nAk kupujete s hypotékou, začnite riešiť financovanie čo najskôr. Banka bude potrebovať odhad hodnoty nehnuteľnosti a doklady o príjme.\n\n## 4. Kúpna zmluva a kataster\nPo podpise kúpnej zmluvy sa podáva návrh na vklad do katastra. Vlastníkom sa stávate až zápisom do katastra, preto sa kúpna cena často vypláca cez úschovu.\n\n## 5. Odovzdanie\nPri odovzdaní si spíšte preberací protokol so stavmi meračov a nezabudnite prepísať energie na seba.\n\nAk si nie ste istí niektorým krokom, opýtajte sa makléra, ktorý ponuku spravuje. Pomôže vám prejsť celým procesom.',
   'dom-rodinny', interval '2 days'),
  ('list-vlastnictva-co-skontrolovat', 'List vlastníctva: čo v ňom skontrolovať pred kúpou',
   'Kto je vlastník, aká je výmera a či na nehnuteľnosti neviaznu ťarchy. Tri časti listu vlastníctva, ktoré by ste mali poznať.',
   E'List vlastníctva je verejná listina z katastra nehnuteľností. Pred kúpou by ste ho mali vidieť vždy a mal by byť aktuálny.\n\n## Časť A – nehnuteľnosti\nTu nájdete parcely, stavby alebo byty, ktorých sa list týka, aj s výmerou a druhom pozemku. Skontrolujte, či zodpovedajú tomu, čo kupujete.\n\n## Časť B – vlastníci\nV tejto časti sú vlastníci a ich podiely. Predávajúci by mal byť vlastníkom, a ak je vlastníkov viac, predať musia všetci.\n\n## Časť C – ťarchy\nTu sú zapísané napríklad záložné práva banky, vecné bremená alebo predkupné práva. Ťarcha ešte nemusí znamenať problém, no vopred si vyjasnite, ako a kedy sa vyrieši.\n\nKatastrálnu mapu a údaje o parcele si môžete pozrieť aj sami na webe katastra. Maklér vám s listom vlastníctva rád pomôže a vysvetlí, čo v ňom znamená každý zápis.',
   'mesto-letecky', interval '9 days'),
  ('na-co-sa-pozriet-pri-obhliadke-bytu', 'Na čo sa pozrieť pri obhliadke bytu',
   'Okná, vlhkosť, stúpačky aj hluk od susedov. Krátky zoznam vecí, ktoré si oplatí skontrolovať priamo na mieste.',
   E'Fotky ukážu veľa, ale niektoré veci zistíte len na mieste. Tu je krátky zoznam, ktorý si môžete vziať so sebou.\n\n## V byte\n- okná a dvere: tesnia, dobre sa otvárajú?\n- steny a rohy: nie sú na nich mapy od vlhkosti alebo pleseň?\n- kúpeľňa a kuchyňa: stav rozvodov, tlak vody, odpad\n- elektrina: vek rozvodov, počet zásuviek, istič\n\n## V dome\n- vchod, výťah a pivnice\n- zateplenie a strecha\n- výmena stúpačiek a plánované opravy\n- výška príspevku do fondu opráv\n\n## Okolie\nPrejdite sa okolo domu, pozrite sa na parkovanie, obchody a zastávky. Ak môžete, prídite aj večer, keď sú susedia doma.\n\nNa všetko sa pokojne pýtajte. Dobrý maklér vám odpovie otvorene a čo nevie hneď, zistí.',
   'byt-obyvacka', interval '16 days')
) as x(slug, nadpis, perex, text, foto, pred)
where not exists (select 1 from public.portal_clanky);

-- ---------------------------------------------------------------- makléri na portáli
-- len aktívni makléri, ktorí sú už verejne: majú ponuku na portáli alebo zverejnený osobný web
create or replace function public.portal_makleri() returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select mk.*, w.adresa, w.domena, w.domena_pripojena, w.zverejnene as web,
      (select count(*) from nehnutelnosti n where n.makler_id = mk.id and _portal_viditelna(n)) as ponuk,
      coalesce((select n.kancelaria from nehnutelnosti n where n.makler_id = mk.id order by n.id desc limit 1), 'alpha') as kanc
    from makleri mk
    left join weby w on w.makler_id = mk.id and not w.kancelaria and w.zverejnene is not null
    where mk.aktivny
  )
  select jsonb_build_object(
    'makleri', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', m.id, 'meno', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'telefon', m.telefon, 'email', m.email,
        'foto', coalesce(case when m.foto like 'data:image/%' then m.foto end,
                         case when m.web->>'photo' ~ '^https://' then m.web->>'photo' end),
        'kancelaria', m.kanc, 'ponuk', m.ponuk,
        'oblast', nullif(left(btrim(coalesce(m.web->>'area', '')), 80), ''),
        'roky', case when (m.web->>'years') ~ '^\d{1,2}$' then (m.web->>'years')::int end,
        'web', case when m.web is not null then
                 case when m.domena is not null and m.domena_pripojena is not null then 'https://' || m.domena || '/'
                      else 'https://app.realitnytypek.sk/stranka.html?m=' || m.adresa end end))
      order by m.ponuk desc, m.meno) from m where m.ponuk > 0 or m.web is not null), '[]'::jsonb),
    'kancelarie', coalesce((select jsonb_object_agg(k, _portal_kancelaria(k)) from (select distinct kanc k from m where m.ponuk > 0 or m.web is not null) x), '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- formuláre portálu (Chcem byť maklér)
-- overenie ako pri webe makléra: SHA-256 z „typek1|adresa|formulár|čas|číslo“ začína štyrmi nulami, každé riešenie raz
create or replace function public._portal_overenie(p_adresa text, p_zdroj text, p_overenie jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_ts bigint; v_nonce text; v_hash text;
begin
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|' || p_adresa || '|' || p_zdroj || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;
end $$;

create or replace function public.portal_ziadost(p_typ text, p_meno text, p_kontakt text, p_co text default null,
                                                 p_udaje jsonb default null, p_overenie jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_okres text := nullif(left(btrim(coalesce(p_udaje->>'okres', '')), 60), '');
  v_prax text := case p_udaje->>'prax' when 'zaciatok' then 'začína' when 'prax' then 'má prax v realitách' when 'kancelaria' then 'mení kanceláriu' end;
  v_odkial text := _klient_odtlacok();
  v_email boolean; v_komu uuid; v_id bigint; v_text text;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  if p_typ is distinct from 'makler' then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  perform _portal_overenie('portal-' || p_typ, p_typ, p_overenie);
  if v_meno is null then raise exception 'Napíšte svoje meno.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  else
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;

  select m.id into v_komu from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny order by h.vytvorene limit 1;
  if v_komu is null then select id into v_komu from makleri where aktivny and rola = 'admin' order by vytvorene limit 1; end if;
  if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918275, hashtext(v_komu::text));
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where portal and zdroj = 'kariera' and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;

  v_text := concat_ws('. ', 'Chce byť maklér', case when v_okres is not null then 'Kde: ' || v_okres end,
                      case when v_prax is not null then upper(left(v_prax, 1)) || substr(v_prax, 2) end, nullif(v_co, ''));
  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, odkial, portal)
  values (null, v_komu, 'kariera', v_meno, v_kontakt, left(v_text, 1500), v_odkial, true) returning id into v_id;
  insert into pripomienky (makler_id, cas, poznamka, druh, web_kontakt_id)
  values (v_komu, now(), left('Nový kontakt z Týpkových nehnuteľností – Chce byť maklér: ' || v_meno || ', ' || v_kontakt ||
          case when v_okres is not null then '. Kde: ' || v_okres else '' end || case when v_prax is not null then '. ' || upper(left(v_prax, 1)) || substr(v_prax, 2) else '' end ||
          case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', v_id);
  update push_fronta set titul = '💬 Záujemca o prácu makléra'
   where odoslane is null and tag in (select 'typek-kontakt-' || id from pripomienky where web_kontakt_id = v_id);
  return 'ok';
end $$;

revoke execute on function public._portal_clanok(portal_clanky, boolean), public._over_spravcu_portalu(),
  public._portal_overenie(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.portal_clanky_sprava(), public.ulozit_portal_clanok(jsonb), public.zmazat_portal_clanok(bigint) from public, anon;
grant execute on function public.portal_clanky_sprava(), public.ulozit_portal_clanok(jsonb), public.zmazat_portal_clanok(bigint) to authenticated;
revoke execute on function public.portal_clanky(int), public.portal_clanok(text), public.portal_makleri(),
  public.portal_ziadost(text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.portal_clanky(int), public.portal_clanok(text), public.portal_makleri(),
  public.portal_ziadost(text, text, text, text, jsonb, jsonb) to anon, authenticated;

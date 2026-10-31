-- =====================================================================
-- 085: Týpkove nehnuteľnosti – ponuky realitných kancelárií a maklérov na realitnytypek.sk/nehnutelnosti
--  * pri každej ponuke prepínač „V Týpkových nehnuteľnostiach“ (predvolene zapnutý, mení zodpovedný maklér alebo administrátor)
--  * na portáli sú len aktívne a rezervované ponuky aktívnych maklérov; súkromníci zo skenera tam nikdy nie sú
--  * verejné funkcie: zoznam (portal_ponuky), detail (portal_ponuka), dopyt kupujúceho (portal_kontakt)
--    → dopyt príde maklérovi do zvončeka a do mobilu rovnako ako zo stránky ponuky, s označením „z Týpkových nehnuteľností“
--  * pripravené na import z iných softvérov: každá ponuka nesie zdroj ('typek') a kanceláriu, ktorej patrí;
--    rovnakú nehnuteľnosť od viacerých kancelárií portál ukáže viackrát (nezlučuje sa), poradie je od najnovších
-- =====================================================================

alter table public.nehnutelnosti add column if not exists na_portali boolean not null default true;
alter table public.web_kontakty add column if not exists portal boolean not null default false;

-- ---------------------------------------------------------------- prepínač pri ponuke
create or replace function public.nastavit_portal_ponuky(p_id bigint, p_zobrazit boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  perform _over_aktivny();
  select * into n from nehnutelnosti where id = p_id;
  if not found then raise exception 'Ponuka neexistuje.' using errcode = '22023'; end if;
  if not ja_admin() and n.makler_id is distinct from auth.uid() then
    raise exception 'Zmeniť môže len zodpovedný maklér alebo administrátor.' using errcode = '42501';
  end if;
  update nehnutelnosti set na_portali = coalesce(p_zobrazit, true) where id = p_id;
end $$;

-- ---------------------------------------------------------------- čo smie byť na portáli
create or replace function public._portal_viditelna(n nehnutelnosti) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(n.na_portali, true) and n.stav in ('aktivne', 'rezervovane') and n.makler_id is not null
     and exists (select 1 from makleri m where m.id = n.makler_id and m.aktivny)
$$;

-- kancelária na portáli (dnes je v jednej databáze jedna kancelária – údaje zo Vzhľadu kancelárie)
create or replace function public._portal_kancelaria(p_kancelaria text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(_kancelaria_verejne(), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('id', p_kancelaria,
           'logo', nullif((select hodnota::jsonb->>'logo' from nastavenia where kluc = 'vzhlad'), '')))
$$;

-- karta ponuky v zozname a na mape (bez dlhého popisu, najviac 8 fotiek)
create or replace function public._portal_karta(n nehnutelnosti) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', n.id, 'slug', _slug_ponuky(n), 'zdroj', 'typek', 'kancelaria', n.kancelaria, 'makler', n.makler_id,
    'stav', n.stav, 'transakcia', n.transakcia, 'kategoria', n.kategoria, 'typ', n.typ, 'nazov', n.nazov,
    'obec', n.obec, 'cast_obce', n.cast_obce, 'okres', n.okres, 'kraj', n.kraj,
    'cena', case when n.zobrazit_cenu then n.cena end, 'typ_ceny', n.typ_ceny,
    'znizena', n.zobrazit_cenu and n.cena is not null and _cena_znizena(n.historia_cien),
    'plocha_uzitkova', n.plocha_uzitkova, 'plocha_pozemku', n.plocha_pozemku, 'izby', n.izby,
    'stav_objektu', n.stav_objektu,
    'lat', case when n.zobrazit_mapu then round(n.lat::numeric, 5) end,
    'lon', case when n.zobrazit_mapu then round(n.lon::numeric, 5) end,
    'fotky', (select coalesce(jsonb_agg(f order by o), '[]'::jsonb)
              from jsonb_array_elements(case when jsonb_typeof(n.fotky) = 'array' then n.fotky else '[]'::jsonb end) with ordinality t(f, o)
              where o <= 8),
    'pocet_fotiek', case when jsonb_typeof(n.fotky) = 'array' then jsonb_array_length(n.fotky) else 0 end,
    'exkluzivne', n.exkluzivne, 'prehliadka', n.virtualna_prehliadka is not null and n.virtualna_prehliadka <> '',
    'vybavenie', to_jsonb(n.vybavenie), 'vytvorene', n.vytvorene))
$$;

-- ---------------------------------------------------------------- zoznam pre portál
create or replace function public.portal_ponuky() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ponuky', coalesce((select jsonb_agg(_portal_karta(n) order by n.vytvorene desc, n.id desc)
                        from nehnutelnosti n where _portal_viditelna(n)), '[]'::jsonb),
    'makleri', coalesce((select jsonb_object_agg(m.id, jsonb_strip_nulls(jsonb_build_object(
                           'meno', _meno_cele(m.titul_pred, m.meno, m.titul_za),
                           'foto', case when m.foto like 'data:%' then m.foto end)))
                         from makleri m
                         where m.id in (select n.makler_id from nehnutelnosti n where _portal_viditelna(n))), '{}'::jsonb),
    'kancelarie', coalesce((select jsonb_object_agg(k, _portal_kancelaria(k))
                            from (select distinct n.kancelaria k from nehnutelnosti n where _portal_viditelna(n)) x), '{}'::jsonb),
    'cas', now())
$$;

-- ---------------------------------------------------------------- detail ponuky na portáli
create or replace function public.portal_ponuka(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  select * into n from nehnutelnosti where id = p_id;
  if not found or not _portal_viditelna(n) then return null; end if;
  return _verejna(n) || jsonb_build_object('slug', _slug_ponuky(n), 'zdroj', 'typek', 'kanc', _portal_kancelaria(n.kancelaria));
end $$;

-- ---------------------------------------------------------------- dopyt kupujúceho z portálu
-- rovnaká ochrana a limity ako formulár na stránke ponuky (overenie „ponuka-ID“), navyše označenie, že prišiel z portálu
create or replace function public.portal_kontakt(p_id bigint, p_zdroj text, p_kontakt text, p_meno text default null,
                                                 p_co text default null, p_overenie jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare n nehnutelnosti; v text; v_kid bigint;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  if p_zdroj is null or p_zdroj not in ('obhliadka', 'kontakt', 'callback') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  select * into n from nehnutelnosti where id = p_id;
  if not found or not _portal_viditelna(n) then raise exception 'Ponuka už nie je dostupná.' using errcode = '22023'; end if;
  v := ponuka_kontakt(p_id, p_zdroj, p_kontakt, p_meno, p_co, p_overenie, null);
  v_kid := currval(pg_get_serial_sequence('public.web_kontakty', 'id'));
  update web_kontakty set portal = true where id = v_kid and nehnutelnost_id = p_id;
  if found then
    update push_fronta set titul = '💬 Nový kontakt z Týpkových nehnuteľností'
     where odoslane is null and tag in (select 'typek-kontakt-' || id from pripomienky where web_kontakt_id = v_kid);
    update pripomienky set poznamka = left(regexp_replace(poznamka, '^Nový kontakt z webu – ', 'Nový kontakt z Týpkových nehnuteľností – '), 500)
     where web_kontakt_id = v_kid;
  end if;
  return v;
end $$;

revoke execute on function public._portal_viditelna(nehnutelnosti), public._portal_kancelaria(text), public._portal_karta(nehnutelnosti)
  from public, anon, authenticated;
revoke execute on function public.nastavit_portal_ponuky(bigint, boolean) from public, anon;
grant execute on function public.nastavit_portal_ponuky(bigint, boolean) to authenticated;
revoke execute on function public.portal_ponuky(), public.portal_ponuka(bigint), public.portal_kontakt(bigint, text, text, text, text, jsonb) from public;
grant execute on function public.portal_ponuky(), public.portal_ponuka(bigint), public.portal_kontakt(bigint, text, text, text, text, jsonb) to anon, authenticated;

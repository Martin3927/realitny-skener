-- =====================================================================
-- Skladačka karty nehnuteľnosti (stránka ponuky ponuka.html):
-- administrátor si poukladá a zapne/vypne časti (fotky, popis, videá, kontakt, formulár s kalendárom,
-- hypotekárna kalkulačka, mapa…) a vyberie, či sú v hlavnom stĺpci alebo v bočnom paneli.
-- Uložené v nastavenia.karta_ponuky; stránka ponuky ho dostane spolu s údajmi ponuky.
-- =====================================================================

create or replace function public._karta_ponuky() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select hodnota::jsonb - 'upravil' from nastavenia where kluc = 'karta_ponuky'), '{}'::jsonb)
$$;
revoke execute on function public._karta_ponuky() from public, anon, authenticated;

create or replace function public.karta_ponuky() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return _karta_ponuky();
end $$;
revoke execute on function public.karta_ponuky() from public, anon;
grant execute on function public.karta_ponuky() to authenticated;

create or replace function public.ulozit_kartu_ponuky(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bloky jsonb; v_m jsonb := case when jsonb_typeof(p->'moznosti') = 'object' then p->'moznosti' else '{}'::jsonb end;
  v_urok numeric; v jsonb;
  POVOLENE constant text[] := array['galeria', 'zaklad', 'media', 'popis', 'parametre', 'vybavenie', 'mapa', 'hypoteka', 'makler', 'zaujem'];
begin
  perform _over_admin();
  if jsonb_typeof(p->'bloky') is distinct from 'array' or jsonb_array_length(p->'bloky') > 30 then
    raise exception 'Neplatné poradie častí karty.' using errcode = '22023';
  end if;
  -- každá časť raz, v poradí od administrátora; názov a cena sú vždy zapnuté
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'stlpec', stlpec, 'zap', zap) order by ord), '[]'::jsonb) into v_bloky
  from (select distinct on (b->>'id') b->>'id' as id,
               case when b->>'stlpec' = 'bok' then 'bok' else 'hlavny' end as stlpec,
               case when b->>'id' = 'zaklad' then true else coalesce(b->>'zap', 'true') <> 'false' end as zap,
               ord
        from jsonb_array_elements(p->'bloky') with ordinality as t(b, ord)
        where jsonb_typeof(b) = 'object' and b->>'id' = any(POVOLENE)
        order by b->>'id', ord) x;
  v_urok := case when (v_m->>'urok') ~ '^\d{1,2}(\.\d{1,2})?$' then (v_m->>'urok')::numeric end;
  v := jsonb_build_object('bloky', v_bloky,
    'moznosti', jsonb_build_object(
      'termin', coalesce(v_m->>'termin', 'true') <> 'false',
      'dalsie', coalesce(v_m->>'dalsie', 'true') <> 'false',
      'zdielat', coalesce(v_m->>'zdielat', 'true') <> 'false',
      'urok', least(10, greatest(0.5, coalesce(v_urok, 3.9)))),
    'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('karta_ponuky', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v - 'upravil';
end $$;
revoke execute on function public.ulozit_kartu_ponuky(jsonb) from public, anon;
grant execute on function public.ulozit_kartu_ponuky(jsonb) to authenticated;

-- stránka ponuky dostane nastavenie karty spolu s ponukou (aj v náhľade pri zdieľaní pripravenom serverom)
create or replace function public.verejna_ponuka(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n nehnutelnosti;
begin
  select * into n from nehnutelnosti where id = p_id;
  if not found then return null; end if;
  if n.stav not in ('aktivne', 'rezervovane', 'predane') and not ja_aktivny() then return null; end if;
  return _verejna(n) || jsonb_build_object('kanc', _kancelaria_verejne(), 'karta', _karta_ponuky() - 'upravene');
end $$;

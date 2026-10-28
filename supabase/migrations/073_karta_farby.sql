-- =====================================================================
-- Farby karty nehnuteľnosti (stránka ponuky): podľa Vzhľadu kancelárie (predvolené),
-- podľa webu kancelárie alebo vlastné (farebná sada, vlastná farba, svetlé / krémové / tmavé pozadie).
-- Pri zverejnení webu kancelárie sa editor webu spýta, či rovnaké farby nastaviť aj na kartu.
-- =====================================================================

-- overené farby karty, alebo null (= podľa Vzhľadu kancelárie)
create or replace function public._farby_karty(f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
begin
  if f is null or jsonb_typeof(f) <> 'object' or coalesce(f->>'a', '') !~ '^#[0-9a-fA-F]{6}$' then return null; end if;
  return jsonb_build_object(
    'a', lower(f->>'a'),
    'b', case when coalesce(f->>'b', '') ~ '^#[0-9a-fA-F]{6}$' then lower(f->>'b') end,
    'bg', case when f->>'bg' in ('svetle', 'kremove', 'tmave') then f->>'bg' else 'kremove' end,
    'zdroj', case when f->>'zdroj' = 'web' then 'web' else 'vlastne' end);
end $$;

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
    'farby', _farby_karty(p->'farby'),
    'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('karta_ponuky', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v - 'upravil';
end $$;
revoke execute on function public.ulozit_kartu_ponuky(jsonb) from public, anon;
grant execute on function public.ulozit_kartu_ponuky(jsonb) to authenticated;

-- len farby (z editora webu kancelárie po zverejnení); poradie a možnosti karty ostanú
create or replace function public.nastavit_farby_karty(p_farby jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_admin();
  v := coalesce((select hodnota::jsonb from nastavenia where kluc = 'karta_ponuky'), '{}'::jsonb)
       || jsonb_build_object('farby', _farby_karty(p_farby), 'upravil', auth.uid(), 'upravene', now());
  insert into nastavenia (kluc, hodnota) values ('karta_ponuky', v::text)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
  return v - 'upravil';
end $$;
revoke execute on function public.nastavit_farby_karty(jsonb) from public, anon;
grant execute on function public.nastavit_farby_karty(jsonb) to authenticated;

-- farby webu kancelárie pre skladačku karty (zverejnená verzia, inak rozpracovaná); bez webu null
create or replace function public.farby_webu_kancelarie() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w weby; v jsonb;
begin
  perform _over_aktivny();
  select * into w from weby where kancelaria order by id limit 1;
  if not found then return null; end if;
  v := coalesce(w.zverejnene, w.koncept);
  if v is null then return null; end if;
  return jsonb_build_object('color', v->>'color', 'cc', v->>'cc', 'b2', v->>'b2', 'bg', v->>'bg', 'zverejneny', w.zverejnene is not null);
end $$;
revoke execute on function public.farby_webu_kancelarie() from public, anon;
grant execute on function public.farby_webu_kancelarie() to authenticated;

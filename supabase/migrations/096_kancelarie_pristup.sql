-- ODDELENIE KANCELÁRIÍ – 2. krok, časť a: pravidlá prístupu v tabuľkách
-- * aktivna_kancelaria(): kancelária prihláseného; hlavný správca si môže zvoliť inú kanceláriu (režim podpory)
-- * čítanie: ku každej tabuľke kancelárie pravidlo RESTRICTIVE „len riadky aktívnej kancelárie" (pridá sa k doterajším)
-- * zápis: strážca v každej tabuľke kancelárie – maklér nemôže pridať, zmeniť ani zmazať riadok cudzej kancelárie,
--   nech zápis ide cez ktorúkoľvek funkciu (aj security definer). Web, portál, skener a plánovač (bez prihláseného
--   makléra) strážca nezastaví – tie zapisujú pre konkrétneho makléra a kanceláriu dopĺňa nastav_kancelariu.
-- Kým je v Týpkovi len Alpha Reality, správanie sa nemení.

-- režim podpory hlavného správcu (zvolená kancelária); bez záznamu = jeho vlastná
create table if not exists public.spravca_podpora (
  user_id uuid primary key references public.makleri(id) on delete cascade,
  kancelaria_id bigint not null references public.kancelarie(id) on delete cascade,
  od timestamptz not null default now()
);
alter table public.spravca_podpora enable row level security;
revoke all on public.spravca_podpora from public, anon, authenticated;

create or replace function public.aktivna_kancelaria() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.kancelaria_id from spravca_podpora s where s.user_id = auth.uid()
       and exists (select 1 from hlavni_spravcovia h where h.user_id = auth.uid())),
    (select m.kancelaria_id from makleri m where m.id = auth.uid()))
$$;
revoke execute on function public.aktivna_kancelaria() from public, anon;
grant execute on function public.aktivna_kancelaria() to authenticated, service_role;

-- hlavný správca: prepnúť sa do kancelárie (null = späť do vlastnej)
create or replace function public.prepnut_kancelariu(p_kancelaria bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not je_hlavny_spravca() then raise exception 'Prepínať kancelárie môže len hlavný správca.' using errcode = '42501'; end if;
  if p_kancelaria is null or p_kancelaria = (select kancelaria_id from makleri where id = auth.uid()) then
    delete from spravca_podpora where user_id = auth.uid();
  else
    if not exists (select 1 from kancelarie where id = p_kancelaria) then raise exception 'Kancelária neexistuje.' using errcode = '22023'; end if;
    insert into spravca_podpora (user_id, kancelaria_id) values (auth.uid(), p_kancelaria)
      on conflict (user_id) do update set kancelaria_id = excluded.kancelaria_id, od = now();
  end if;
  return aktivna_kancelaria();
end $$;
revoke execute on function public.prepnut_kancelariu(bigint) from public, anon;
grant execute on function public.prepnut_kancelariu(bigint) to authenticated;

-- strážca zápisu: prihlásený maklér smie meniť len riadky svojej kancelárie;
-- hlavný správca v režime podpory aj riadky zvolenej kancelárie (a ďalej svoje vlastné – čas v aplikácii, upozornenia…)
create or replace function public._straz_kancelariu() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
  v_smie bigint[];
begin
  if v_ja is null or not exists (select 1 from makleri where id = v_ja) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_smie := array[aktivna_kancelaria(), moja_kancelaria()];
  if tg_op in ('UPDATE', 'DELETE') and not (old.kancelaria_id = any(v_smie)) then
    raise exception 'Tento záznam patrí inej kancelárii.' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not (new.kancelaria_id = any(v_smie)) then
    raise exception 'Záznam sa nedá uložiť do inej kancelárie.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.kancelaria_id is distinct from old.kancelaria_id and not je_hlavny_spravca() then
    raise exception 'Záznam sa nedá presunúť do inej kancelárie.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public._straz_kancelariu() from public, anon, authenticated;

-- strážca maklérov: upravovať makléra smie len jeho kancelária (a on sám seba); presun do inej kancelárie len hlavný správca
create or replace function public._straz_maklera() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
begin
  if v_ja is null or not exists (select 1 from makleri where id = v_ja) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.id <> v_ja
     and not (old.kancelaria_id = any(array[aktivna_kancelaria(), moja_kancelaria()])) then
    raise exception 'Tento maklér patrí inej kancelárii.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not (new.kancelaria_id = any(array[aktivna_kancelaria(), moja_kancelaria()])) then
    raise exception 'Makléra sa nedá pridať do inej kancelárie.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.kancelaria_id is distinct from old.kancelaria_id and not je_hlavny_spravca() then
    raise exception 'Makléra sa nedá presunúť do inej kancelárie.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public._straz_maklera() from public, anon, authenticated;
drop trigger if exists zz_straz_maklera on public.makleri;
create trigger zz_straz_maklera before insert or update or delete on public.makleri
  for each row execute function public._straz_maklera();

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_rozhovory', 'ai_texty', 'aktivity', 'asistent_pouzitie', 'cas_posledny_zapis', 'cas_v_aplikacii', 'chat_reakcie',
    'dopyty', 'dopyty_kontakty', 'historia_zmien', 'makler_osobne', 'makleri_kalendar', 'matterport_rezervacie',
    'nehnutelnosti', 'nehnutelnosti_interne', 'obhliadky', 'oznacenia', 'pochvaly', 'predajcovia', 'prevzatia',
    'pripomienky', 'prispevky_siete', 'provizie', 'reakcie', 'recenzie', 'schrankovanie', 'schrankovanie_akcie',
    'sidliska', 'sidliska_poznamky', 'spravy', 'sukromne_spravy', 'telefony', 'udalosti', 'web_domena_dotazy',
    'web_kliky', 'web_kontakty', 'web_navstevnici', 'web_strazca_fronta', 'web_strazcovia', 'web_zdroje',
    'web_zobrazenia', 'weby', 'weby_stare_adresy', 'weby_verzie', 'zhody_oznamene', 'zobrazenia_ponuk'
  ] loop
    -- RLS je zapnuté vo všetkých tabuľkách Týpka; pre istotu (bez pravidla na čítanie sa nič nezmení)
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists kancelaria_len_moja on public.%I', t);
    execute format('create policy kancelaria_len_moja on public.%I as restrictive for all to authenticated '
                   'using (kancelaria_id = (select public.aktivna_kancelaria())) '
                   'with check (kancelaria_id = (select public.aktivna_kancelaria()))', t);
    -- strážca beží až po nastav_kancelariu (triggery idú podľa abecedy)
    execute format('drop trigger if exists zz_straz_kancelariu on public.%I', t);
    execute format('create trigger zz_straz_kancelariu before insert or update or delete on public.%I '
                   'for each row execute function public._straz_kancelariu()', t);
  end loop;
end $$;

-- makléri: vidno len kolegov z aktívnej kancelárie (a seba)
drop policy if exists kancelaria_len_moja on public.makleri;
create policy kancelaria_len_moja on public.makleri as restrictive for select to authenticated
  using (kancelaria_id = (select public.aktivna_kancelaria()) or id = (select auth.uid()));

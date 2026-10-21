-- =====================================================================
-- Chat: okno s obálkou pri novej správe – Prečítať / Pripomenúť neskôr / Ignorovať.
--   * „Pripomenúť neskôr“ – správa sa v zvolenom čase ukáže znova (na každom zariadení).
--   * „Ignorovať“ – odosielateľ dostane oznámenie (zvonček), správa sa označí ako prečítaná.
-- Riadok vidí ten, kto reagoval, a pri ignorovaní aj autor správy.
-- =====================================================================
create table if not exists public.chat_reakcie (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,   -- kto reagoval (príjemca správy)
  autor_id uuid references public.makleri(id) on delete cascade,              -- autor správy (null = správa tímu od systému)
  druh text not null check (druh in ('tim', 'dm')),
  sprava_id bigint not null,
  akcia text not null check (akcia in ('neskor', 'ignorovane')),
  pripomenut timestamptz,          -- neskor: kedy pripomenúť
  vybavene timestamptz,            -- neskor: už pripomenuté alebo prečítané
  videne_autorom timestamptz,      -- ignorovane: autor oznámenie videl
  vytvorene timestamptz not null default now()
);
create index if not exists chat_reakcie_moje on public.chat_reakcie (makler_id, id desc);
create index if not exists chat_reakcie_autor on public.chat_reakcie (autor_id, id desc) where akcia = 'ignorovane';

alter table public.chat_reakcie enable row level security;
do $$ begin
  create policy chat_reakcie_citat on public.chat_reakcie for select to authenticated
    using ((makler_id = (select auth.uid()) or (akcia = 'ignorovane' and autor_id = (select auth.uid())))
           and (select public.ma_pristup('chat')));
exception when duplicate_object then null; end $$;
revoke all on public.chat_reakcie from anon, authenticated;
grant select on public.chat_reakcie to authenticated;

-- overí, že správu smiem vidieť ako príjemca; vráti jej autora (null = systémová správa tímu)
create or replace function public._sprava_pre_mna(p_druh text, p_sprava bigint) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_druh = 'dm' then
    select od_id into v from sukromne_spravy where id = p_sprava and komu_id = auth.uid() and zmazane is null;
    if not found then raise exception 'Správa už neexistuje.'; end if;
  elsif p_druh = 'tim' then
    select makler_id into v from spravy where id = p_sprava and zmazane is null;
    if not found then raise exception 'Správa už neexistuje.'; end if;
    if v = auth.uid() then raise exception 'Toto je vaša vlastná správa.'; end if;
  else
    raise exception 'Neznámy druh správy.';
  end if;
  return v;
end $$;

-- pripomenúť neskôr (nahradí predchádzajúce odloženie tej istej konverzácie)
create or replace function public.odlozit_spravu(p_druh text, p_sprava bigint, p_kedy timestamptz) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_autor uuid; v_id bigint; v_kedy timestamptz;
begin
  v_autor := _sprava_pre_mna(p_druh, p_sprava);
  v_kedy := least(greatest(coalesce(p_kedy, now() + interval '1 hour'), now() + interval '1 minute'), now() + interval '14 days');
  update chat_reakcie set vybavene = now()
  where makler_id = auth.uid() and akcia = 'neskor' and vybavene is null and druh = p_druh
    and (p_druh = 'tim' or autor_id = v_autor);
  insert into chat_reakcie (makler_id, autor_id, druh, sprava_id, akcia, pripomenut)
  values (auth.uid(), v_autor, p_druh, p_sprava, 'neskor', v_kedy) returning id into v_id;
  return v_id;
end $$;

-- ignorovať: správa sa označí ako prečítaná a autor dostane oznámenie
create or replace function public.ignorovat_spravu(p_druh text, p_sprava bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  v_autor := _sprava_pre_mna(p_druh, p_sprava);
  update chat_reakcie set vybavene = now()
  where makler_id = auth.uid() and akcia = 'neskor' and vybavene is null and druh = p_druh
    and (p_druh = 'tim' or autor_id = v_autor);
  if p_druh = 'dm' then
    update sukromne_spravy set precitane = now() where komu_id = auth.uid() and od_id = v_autor and precitane is null and id <= p_sprava;
  else
    update makleri set chat_precitane = greatest(coalesce(chat_precitane, now()), (select vytvorene from spravy where id = p_sprava)) where id = auth.uid();
  end if;
  if v_autor is not null and not exists (
      select 1 from chat_reakcie where makler_id = auth.uid() and druh = p_druh and sprava_id = p_sprava and akcia = 'ignorovane') then
    insert into chat_reakcie (makler_id, autor_id, druh, sprava_id, akcia) values (auth.uid(), v_autor, p_druh, p_sprava, 'ignorovane');
  end if;
end $$;

-- odložená správa bola pripomenutá; vráti false, ak ju medzitým vybavilo iné zariadenie
create or replace function public.vybavit_odlozenu(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update chat_reakcie set vybavene = now() where id = p_id and makler_id = auth.uid() and akcia = 'neskor' and vybavene is null;
  return found;
end $$;

-- konverzácia je prečítaná → zrušia sa jej odložené pripomenutia
create or replace function public.vybavit_odlozene(p_druh text, p_autor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update chat_reakcie set vybavene = now()
  where makler_id = auth.uid() and akcia = 'neskor' and vybavene is null and druh = p_druh
    and (p_druh = 'tim' or autor_id = p_autor);
end $$;

-- autor videl oznámenia o ignorovaní (null = všetky)
create or replace function public.ignoracie_videne(p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update chat_reakcie set videne_autorom = now()
  where autor_id = auth.uid() and akcia = 'ignorovane' and videne_autorom is null and (p_ids is null or id = any(p_ids));
end $$;

revoke execute on function public._sprava_pre_mna(text, bigint) from public, anon, authenticated;
revoke execute on function public.odlozit_spravu(text, bigint, timestamptz), public.ignorovat_spravu(text, bigint),
  public.vybavit_odlozenu(bigint), public.vybavit_odlozene(text, uuid), public.ignoracie_videne(bigint[]) from public, anon;
grant execute on function public.odlozit_spravu(text, bigint, timestamptz), public.ignorovat_spravu(text, bigint),
  public.vybavit_odlozenu(bigint), public.vybavit_odlozene(text, uuid), public.ignoracie_videne(bigint[]) to authenticated;

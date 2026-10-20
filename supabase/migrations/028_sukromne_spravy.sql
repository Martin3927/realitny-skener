-- =====================================================================
-- Chat: súkromné správy medzi kolegami (jeden na jedného).
-- Správu vidí len odosielateľ a príjemca – ani administrátor ju nečíta.
-- Tímový chat (tabuľka spravy) ostáva bez zmeny.
-- =====================================================================
create table if not exists public.sukromne_spravy (
  id bigint generated always as identity primary key,
  od_id uuid not null references public.makleri(id) on delete cascade,
  komu_id uuid not null references public.makleri(id) on delete cascade,
  text text not null,
  vytvorene timestamptz not null default now(),
  precitane timestamptz,
  zmazane timestamptz,
  constraint sukromne_nie_sebe check (od_id <> komu_id)
);
create index if not exists sukromne_komu on public.sukromne_spravy (komu_id, id desc);
create index if not exists sukromne_od on public.sukromne_spravy (od_id, id desc);
create index if not exists sukromne_neprecitane on public.sukromne_spravy (komu_id, od_id) where precitane is null and zmazane is null;

alter table public.sukromne_spravy enable row level security;
do $$ begin
  create policy sukromne_citat on public.sukromne_spravy for select to authenticated
    using ((od_id = (select auth.uid()) or komu_id = (select auth.uid()))
           and zmazane is null
           and (select public.ma_pristup('chat')));
exception when duplicate_object then null; end $$;
revoke all on public.sukromne_spravy from anon, authenticated;
grant select on public.sukromne_spravy to authenticated;

-- pošle súkromnú správu kolegovi
create or replace function public.poslat_sukromnu_spravu(p_komu uuid, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, '')); v_id bigint;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_komu is null or p_komu = auth.uid() then raise exception 'Vyberte kolegu, ktorému správu posielate.'; end if;
  if not exists (select 1 from makleri where id = p_komu and aktivny and (rola = 'admin' or 'chat' = any(pristup))) then
    raise exception 'Tento kolega nemá prístup k chatu.';
  end if;
  if v = '' then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into sukromne_spravy (od_id, komu_id, text) values (auth.uid(), p_komu, v) returning id into v_id;
  -- kto odpovedá, ten si prečítal
  update sukromne_spravy set precitane = now() where komu_id = auth.uid() and od_id = p_komu and precitane is null;
  return v_id;
end $$;

-- označí správy od kolegu ako prečítané
create or replace function public.sukromne_precitane(p_od uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update sukromne_spravy set precitane = now()
  where komu_id = auth.uid() and od_id = p_od and precitane is null and zmazane is null;
end $$;

-- zmazať môže len autor (správa zmizne úplne aj u príjemcu)
create or replace function public.zmazat_sukromnu_spravu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  perform _over_aktivny();
  select od_id into v_autor from sukromne_spravy where id = p_id;
  if not found then return; end if;
  if v_autor is distinct from auth.uid() then raise exception 'Zmazať môžete len svoju správu.'; end if;
  update sukromne_spravy set zmazane = now(), text = '' where id = p_id;
end $$;

revoke execute on function public.poslat_sukromnu_spravu(uuid, text), public.sukromne_precitane(uuid), public.zmazat_sukromnu_spravu(bigint) from public, anon;
grant execute on function public.poslat_sukromnu_spravu(uuid, text), public.sukromne_precitane(uuid), public.zmazat_sukromnu_spravu(bigint) to authenticated;

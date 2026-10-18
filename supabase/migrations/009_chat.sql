-- =====================================================================
-- Tímový chat
-- =====================================================================
create table if not exists public.spravy (
  id bigint generated always as identity primary key,
  makler_id uuid references public.makleri(id) on delete set null,
  text text not null,
  vytvorene timestamptz not null default now(),
  zmazane timestamptz
);
create index if not exists spravy_vytvorene on public.spravy (id desc);
alter table public.spravy enable row level security;
do $$ begin
  create policy spravy_citat on public.spravy for select to authenticated using (ja_aktivny());
exception when duplicate_object then null; end $$;
revoke all on public.spravy from anon, authenticated;
grant select on public.spravy to authenticated;

alter table public.makleri add column if not exists chat_precitane timestamptz;

create or replace function public.poslat_spravu(p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, '')); v_id bigint;
begin
  perform _over_aktivny();
  if v = '' then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into spravy (makler_id, text) values (auth.uid(), v) returning id into v_id;
  update makleri set chat_precitane = now() where id = auth.uid();
  return v_id;
end $$;

-- zmazať môže autor alebo administrátor (správa ostane v databáze označená ako zmazaná)
create or replace function public.zmazat_spravu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  perform _over_aktivny();
  select makler_id into v_autor from spravy where id = p_id;
  if not found then return; end if;
  if v_autor is distinct from auth.uid() and not ja_admin() then raise exception 'Zmazať môžete len svoju správu.'; end if;
  update spravy set zmazane = now() where id = p_id;
end $$;

create or replace function public.chat_precitane() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set chat_precitane = now() where id = auth.uid();
end $$;

revoke execute on function public.poslat_spravu(text), public.zmazat_spravu(bigint), public.chat_precitane() from public, anon;
grant execute on function public.poslat_spravu(text), public.zmazat_spravu(bigint), public.chat_precitane() to authenticated;

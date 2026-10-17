-- =====================================================================
-- Pripomienky (zvonček) a fotky maklérov
-- =====================================================================

-- fotka makléra: 'data:image/jpeg;base64,…' alebo 'avatar:zena' / 'avatar:muz'
alter table public.makleri add column if not exists foto text;

create table public.pripomienky (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,   -- komu pripomenúť
  vytvoril uuid references public.makleri(id) on delete set null,
  inzerat_id text references public.inzeraty(id) on delete set null,
  schrankovanie_id bigint references public.schrankovanie(id) on delete set null,
  cas timestamptz not null,
  poznamka text not null default '',
  hotovo timestamptz,
  zrusena timestamptz,
  email_odoslany timestamptz,
  email_chyba text,
  vytvorene timestamptz not null default now()
);
create index on public.pripomienky (cas) where hotovo is null and zrusena is null;

alter table public.pripomienky enable row level security;
create policy pripomienky_citat on public.pripomienky for select to authenticated
  using (ja_aktivny() and zrusena is null and (makler_id = auth.uid() or vytvoril = auth.uid() or ja_admin()));
revoke all on public.pripomienky from anon, authenticated;
grant select on public.pripomienky to authenticated;

-- uloženie novej alebo úprava existujúcej pripomienky
create or replace function public.ulozit_pripomienku(
  p_id bigint, p_makler uuid, p_inzerat text, p_schrankovanie bigint, p_cas timestamptz, p_poznamka text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_komu uuid := coalesce(p_makler, auth.uid()); v_id bigint; r pripomienky%rowtype;
begin
  perform _over_aktivny();
  if p_cas is null then raise exception 'Zadajte dátum a čas pripomienky.'; end if;
  if v_komu <> auth.uid() and not ja_admin() then
    raise exception 'Pripomienku inému maklérovi môže nastaviť len administrátor.';
  end if;
  if not exists (select 1 from makleri where id = v_komu and aktivny) then
    raise exception 'Maklér neexistuje alebo nie je aktívny.';
  end if;
  if p_id is null then
    insert into pripomienky (makler_id, vytvoril, inzerat_id, schrankovanie_id, cas, poznamka)
    values (v_komu, auth.uid(), p_inzerat, p_schrankovanie, p_cas, coalesce(trim(p_poznamka), ''))
    returning id into v_id;
    return v_id;
  end if;
  select * into r from pripomienky where id = p_id and zrusena is null for update;
  if not found then raise exception 'Pripomienka neexistuje.'; end if;
  if r.makler_id <> auth.uid() and r.vytvoril is distinct from auth.uid() and not ja_admin() then
    raise exception 'Túto pripomienku nemôžete upraviť.';
  end if;
  update pripomienky set makler_id = v_komu, cas = p_cas, poznamka = coalesce(trim(p_poznamka), ''),
    hotovo = case when p_cas <> r.cas then null else hotovo end,
    email_odoslany = case when p_cas <> r.cas then null else email_odoslany end,
    email_chyba = case when p_cas <> r.cas then null else email_chyba end
  where id = p_id;
  return p_id;
end $$;

create or replace function public.pripomienka_hotovo(p_id bigint, p_hotovo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r pripomienky%rowtype;
begin
  perform _over_aktivny();
  select * into r from pripomienky where id = p_id and zrusena is null for update;
  if not found then raise exception 'Pripomienka neexistuje.'; end if;
  if r.makler_id <> auth.uid() and r.vytvoril is distinct from auth.uid() and not ja_admin() then
    raise exception 'Túto pripomienku nemôžete zmeniť.';
  end if;
  update pripomienky set hotovo = case when p_hotovo then now() end where id = p_id;
end $$;

create or replace function public.zrusit_pripomienku(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r pripomienky%rowtype;
begin
  perform _over_aktivny();
  select * into r from pripomienky where id = p_id and zrusena is null for update;
  if not found then return; end if;
  if r.makler_id <> auth.uid() and r.vytvoril is distinct from auth.uid() and not ja_admin() then
    raise exception 'Túto pripomienku nemôžete zrušiť.';
  end if;
  update pripomienky set zrusena = now() where id = p_id;
end $$;

-- fotka: admin komukoľvek, maklér sebe
create or replace function public.nastavit_foto(p_id uuid, p_foto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if p_id <> auth.uid() and not ja_admin() then
    raise exception 'Fotku inému maklérovi môže zmeniť len administrátor.';
  end if;
  if p_foto is not null and p_foto not in ('avatar:zena', 'avatar:muz')
     and (p_foto not like 'data:image/%' or length(p_foto) > 300000) then
    raise exception 'Neplatná fotka (najviac cca 200 kB).';
  end if;
  update makleri set foto = p_foto where id = p_id;
end $$;

revoke execute on function public.ulozit_pripomienku(bigint, uuid, text, bigint, timestamptz, text),
  public.pripomienka_hotovo(bigint, boolean), public.zrusit_pripomienku(bigint), public.nastavit_foto(uuid, text)
  from public, anon;
grant execute on function public.ulozit_pripomienku(bigint, uuid, text, bigint, timestamptz, text),
  public.pripomienka_hotovo(bigint, boolean), public.zrusit_pripomienku(bigint), public.nastavit_foto(uuid, text)
  to authenticated;

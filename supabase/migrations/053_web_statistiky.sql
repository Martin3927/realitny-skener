-- =====================================================================
-- Štatistiky webu makléra: odkiaľ návštevníci prišli a kliky na kontakt
--  * web_zdroje – návštevy po dňoch podľa zdroja (Google, Facebook, Instagram, QR kód, e-mail, priamo…)
--  * web_kliky  – kliky na telefón, WhatsApp a e-mail (aj pri konkrétnej ponuke)
-- Počíta sa bez cookies a bez osobných údajov, len súčty po dňoch. Prihlásení makléri sa nepočítajú.
-- =====================================================================

create table if not exists public.web_zdroje (
  web_id bigint not null references public.weby(id) on delete cascade,
  den date not null default current_date,
  zdroj text not null check (zdroj in ('google', 'vyhladavac', 'facebook', 'instagram', 'qr', 'email', 'priamo', 'iny')),
  pocet int not null default 0,
  primary key (web_id, den, zdroj)
);

create table if not exists public.web_kliky (
  web_id bigint not null references public.weby(id) on delete cascade,
  den date not null default current_date,
  typ text not null check (typ in ('tel', 'wa', 'mail')),
  ponuka bigint not null default 0,            -- 0 = klik mimo konkrétnej ponuky
  pocet int not null default 0,
  primary key (web_id, den, typ, ponuka)
);

alter table public.web_zdroje enable row level security;
alter table public.web_kliky enable row level security;
do $$ begin
  create policy web_zdroje_citat on public.web_zdroje for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy web_kliky_citat on public.web_kliky for select to authenticated
    using (ja_aktivny() and (ja_admin() or exists (select 1 from weby w where w.id = web_id and w.makler_id = auth.uid())));
exception when duplicate_object then null; end $$;
revoke all on public.web_zdroje, public.web_kliky from anon, authenticated;
grant select on public.web_zdroje, public.web_kliky to authenticated;

-- návšteva verejného webu aj so zdrojom (makléri sa nepočítajú)
drop function if exists public.zaznamenat_navstevu_webu(text);
create or replace function public.zaznamenat_navstevu_webu(p_adresa text, p_zdroj text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_z text := case when p_zdroj in ('google', 'vyhladavac', 'facebook', 'instagram', 'qr', 'email', 'priamo', 'iny') then p_zdroj else 'priamo' end;
begin
  if ja_aktivny() then return; end if;
  select id into v_id from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if v_id is null then return; end if;
  insert into web_zobrazenia (web_id, den, pocet) values (v_id, current_date, 1)
    on conflict (web_id, den) do update set pocet = web_zobrazenia.pocet + 1;
  insert into web_zdroje (web_id, den, zdroj, pocet) values (v_id, current_date, v_z, 1)
    on conflict (web_id, den, zdroj) do update set pocet = web_zdroje.pocet + 1;
end $$;

-- klik na telefón, WhatsApp alebo e-mail na verejnom webe (makléri sa nepočítajú)
create or replace function public.zaznamenat_klik_webu(p_adresa text, p_typ text, p_ponuka bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_p bigint := 0;
begin
  if ja_aktivny() or p_typ is null or p_typ not in ('tel', 'wa', 'mail') then return; end if;
  select id into v_id from weby where (adresa = lower(trim(coalesce(p_adresa, ''))) or domena = lower(trim(coalesce(p_adresa, '')))) and zverejnene is not null;
  if v_id is null then return; end if;
  -- ochrana pred zahltením
  if (select coalesce(sum(pocet), 0) from web_kliky where web_id = v_id and den = current_date) >= 2000 then return; end if;
  if p_ponuka is not null and exists (select 1 from nehnutelnosti where id = p_ponuka) then v_p := p_ponuka; end if;
  insert into web_kliky (web_id, den, typ, ponuka, pocet) values (v_id, current_date, p_typ, v_p, 1)
    on conflict (web_id, den, typ, ponuka) do update set pocet = web_kliky.pocet + 1;
end $$;

revoke execute on function public.zaznamenat_navstevu_webu(text, text), public.zaznamenat_klik_webu(text, text, bigint) from public;
grant execute on function public.zaznamenat_navstevu_webu(text, text), public.zaznamenat_klik_webu(text, text, bigint) to anon, authenticated;

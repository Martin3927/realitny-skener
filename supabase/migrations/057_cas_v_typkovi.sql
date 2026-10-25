-- =====================================================================
-- Čas v týpkovi – koľko aktívneho času strávil každý v aplikácii (štatistika zo srandy)
--  * aplikácia počíta len čas, keď je okno otvorené a niekto v ňom niečo robí (klik, písanie, posúvanie)
--  * raz za minútu pošle nazbierané sekundy podľa sekcií; hodinu a deň určí databáza (slovenský čas)
--  * databáza nepripíše viac, než koľko naozaj uplynulo od posledného zápisu,
--    takže dve otvorené okná naraz sa nepočítajú dvakrát
--  * rebríček vidí admin vždy; makléri celý tím, ak to admin nevypne (inak len svoj čas)
-- =====================================================================

create table if not exists public.cas_v_aplikacii (
  makler_id uuid not null references public.makleri(id) on delete cascade,
  den date not null,
  hodina smallint not null check (hodina between 0 and 23),
  sekcia text not null,
  sekundy int not null default 0 check (sekundy >= 0),
  primary key (makler_id, den, hodina, sekcia)
);
create index if not exists cas_v_aplikacii_den on public.cas_v_aplikacii (den);
alter table public.cas_v_aplikacii enable row level security;
revoke all on public.cas_v_aplikacii from anon, authenticated;

create table if not exists public.cas_posledny_zapis (
  makler_id uuid primary key references public.makleri(id) on delete cascade,
  cas timestamptz not null
);
alter table public.cas_posledny_zapis enable row level security;
revoke all on public.cas_posledny_zapis from anon, authenticated;

-- aplikácia pošle {"inzeraty": 42, "domov": 18} – sekundy podľa sekcií
create or replace function public.pripocitaj_cas(p_sekcie jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
  v_teraz timestamptz := now();
  v_den date := (now() at time zone 'Europe/Bratislava')::date;
  v_hod smallint := extract(hour from now() at time zone 'Europe/Bratislava')::smallint;
  v_posl timestamptz;
  v_rozpocet int;
  v_s int;
  r record;
begin
  perform _over_aktivny();
  if p_sekcie is null or jsonb_typeof(p_sekcie) <> 'object' then return; end if;
  -- riadok s posledným zápisom uzamkneme, aby dve okná naraz nepripísali čas dvakrát
  insert into cas_posledny_zapis (makler_id, cas) values (v_ja, v_teraz - interval '5 minutes') on conflict (makler_id) do nothing;
  select cas into v_posl from cas_posledny_zapis where makler_id = v_ja for update;
  -- najviac toľko, koľko uplynulo od posledného zápisu (+1 s rezerva), a najviac 5 minút naraz
  v_rozpocet := least(300, greatest(0, floor(extract(epoch from v_teraz - v_posl))::int + 1));
  if v_rozpocet <= 0 then return; end if;
  for r in select key, value from jsonb_each(p_sekcie) order by key loop
    exit when v_rozpocet <= 0;
    if r.key !~ '^[a-z_]{1,30}$' or jsonb_typeof(r.value) <> 'number' then continue; end if;
    v_s := least(v_rozpocet::numeric, greatest(0, floor(r.value::text::numeric)))::int;
    if v_s <= 0 then continue; end if;
    insert into cas_v_aplikacii (makler_id, den, hodina, sekcia, sekundy) values (v_ja, v_den, v_hod, r.key, v_s)
    on conflict (makler_id, den, hodina, sekcia) do update set sekundy = cas_v_aplikacii.sekundy + excluded.sekundy;
    v_rozpocet := v_rozpocet - v_s;
  end loop;
  update cas_posledny_zapis set cas = v_teraz where makler_id = v_ja;
end $$;

-- rebríček za obdobie (od – do vrátane); bez dátumov = od začiatku merania
create or replace function public.cas_v_typkovi(p_od date default null, p_do date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean;
  v_vsetci boolean := coalesce((select hodnota = '1' from nastavenia where kluc = 'cas_rebricek_vsetci'), true);
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_do date := least(coalesce(p_do, v_dnes), v_dnes);
  v_od date := coalesce(p_od, (select min(den) from cas_v_aplikacii), v_do);
begin
  perform _over_aktivny();
  v_admin := ja_admin();
  if v_od > v_do then v_od := v_do; end if;
  return jsonb_build_object(
    'od', v_od, 'do', v_do, 'vsetci', v_vsetci, 'zaciatok', (select min(den) from cas_v_aplikacii),
    'makleri', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sekundy', coalesce((select sum(c.sekundy) from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do), 0),
        'dni', (select count(distinct c.den) from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do),
        'sekcie', coalesce((select jsonb_object_agg(x.sekcia, x.s) from (
            select c.sekcia, sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.sekcia) x), '{}'::jsonb),
        'hodiny', coalesce((select jsonb_object_agg(x.hodina::text, x.s) from (
            select c.hodina, sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.hodina) x), '{}'::jsonb),
        'najdlhsi_den', (select max(x.s) from (
            select sum(c.sekundy) s from cas_v_aplikacii c where c.makler_id = m.id and c.den between v_od and v_do group by c.den) x)
      ))
      from makleri m
      where m.aktivny and (v_admin or v_vsetci or m.id = auth.uid())
    ), '[]'::jsonb)
  );
end $$;

-- admin: či rebríček vidia všetci makléri (inak každý len svoj čas)
create or replace function public.nastavit_cas_rebricek(p_vsetci boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  insert into nastavenia (kluc, hodnota) values ('cas_rebricek_vsetci', case when p_vsetci then '1' else '0' end)
  on conflict (kluc) do update set hodnota = excluded.hodnota;
end $$;

revoke execute on function public.pripocitaj_cas(jsonb), public.cas_v_typkovi(date, date), public.nastavit_cas_rebricek(boolean) from public, anon;
grant execute on function public.pripocitaj_cas(jsonb), public.cas_v_typkovi(date, date), public.nastavit_cas_rebricek(boolean) to authenticated;

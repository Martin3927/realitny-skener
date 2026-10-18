-- =====================================================================
-- Rod makléra (pre text SMS) a denné údaje pre graf výkonu
-- =====================================================================
alter table public.makleri add column if not exists pohlavie text;
do $$ begin
  alter table public.makleri add constraint makleri_pohlavie_chk check (pohlavie in ('muz', 'zena'));
exception when duplicate_object then null; end $$;

-- rod: admin komukoľvek, maklér sebe
create or replace function public.nastavit_pohlavie(p_id uuid, p_pohlavie text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if p_id <> auth.uid() and not ja_admin() then raise exception 'Rod môžete zmeniť len sebe.'; end if;
  if p_pohlavie is not null and p_pohlavie not in ('muz', 'zena') then raise exception 'Neplatná hodnota.'; end if;
  update makleri set pohlavie = p_pohlavie where id = p_id;
end $$;

-- výkon pre admina: súhrn + kontakty po dňoch (slovenský čas)
create or replace function public.vykon_maklerov(p_od timestamptz, p_do timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return _vykon(p_od, p_do) || jsonb_build_object('dni', coalesce((
    select jsonb_agg(jsonb_build_object('den', den, 'hovory', h, 'sms', s, 'emaily', e) order by den) from (
      select (vytvorene at time zone 'Europe/Bratislava')::date den,
        count(*) filter (where typ = 'hovor') h, count(*) filter (where typ = 'sms') s, count(*) filter (where typ = 'email') e
      from aktivity where vytvorene >= p_od and vytvorene < p_do group by 1) d), '[]'::jsonb));
end $$;

revoke execute on function public.nastavit_pohlavie(uuid, text) from public, anon;
grant execute on function public.nastavit_pohlavie(uuid, text) to authenticated;

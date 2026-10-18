-- =====================================================================
-- Osobnejší soft: oslovenie, motivačné vety pre makléra, odkaz pre všetkých
-- =====================================================================
alter table public.makleri add column if not exists oslovenie text;

-- motivačné vety vidí len daný maklér a administrátor
create table if not exists public.makler_osobne (
  makler_id uuid primary key references public.makleri(id) on delete cascade,
  motivacia text not null default '',
  autor uuid references public.makleri(id) on delete set null,
  upravene timestamptz not null default now()
);
alter table public.makler_osobne enable row level security;
do $$ begin
  create policy makler_osobne_citat on public.makler_osobne for select to authenticated
    using (ja_aktivny() and (makler_id = auth.uid() or ja_admin()));
exception when duplicate_object then null; end $$;
revoke all on public.makler_osobne from anon, authenticated;
grant select on public.makler_osobne to authenticated;

create or replace function public.upravit_osobne(p_id uuid, p_oslovenie text, p_motivacia text) returns void
language plpgsql security definer set search_path = public as $$
declare v_mot text;
begin
  perform _over_admin();
  if length(coalesce(p_oslovenie, '')) > 40 then raise exception 'Oslovenie je príliš dlhé.'; end if;
  -- najviac 5 neprázdnych riadkov po 300 znakov
  select string_agg(left(trim(r), 300), E'\n' order by n) into v_mot
  from (select r, n from unnest(string_to_array(coalesce(p_motivacia, ''), E'\n')) with ordinality t(r, n)
        where trim(r) <> '' order by n limit 5) x;
  update makleri set oslovenie = nullif(trim(p_oslovenie), '') where id = p_id;
  insert into makler_osobne (makler_id, motivacia, autor, upravene) values (p_id, coalesce(v_mot, ''), auth.uid(), now())
  on conflict (makler_id) do update set motivacia = excluded.motivacia, autor = excluded.autor, upravene = now();
end $$;

-- odkaz pre všetkých (zapnúť / vypnúť)
create or replace function public.nastavit_odkaz(p_text text, p_zapnuty boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if length(coalesce(p_text, '')) > 300 then raise exception 'Odkaz je príliš dlhý (max. 300 znakov).'; end if;
  insert into nastavenia (kluc, hodnota) values ('odkaz_text', trim(coalesce(p_text, '')))
    on conflict (kluc) do update set hodnota = excluded.hodnota;
  insert into nastavenia (kluc, hodnota) values ('odkaz_zapnuty', case when p_zapnuty then '1' else '0' end)
    on conflict (kluc) do update set hodnota = excluded.hodnota;
  insert into nastavenia (kluc, hodnota) values ('odkaz_autor', auth.uid()::text)
    on conflict (kluc) do update set hodnota = excluded.hodnota;
end $$;

create or replace function public.nastavenia_aplikacie() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  return jsonb_build_object(
    'odhlasenie_min', coalesce((select hodnota::int from nastavenia where kluc = 'odhlasenie_min'), 60),
    'odkaz_text', coalesce((select hodnota from nastavenia where kluc = 'odkaz_text'), ''),
    'odkaz_zapnuty', coalesce((select hodnota = '1' from nastavenia where kluc = 'odkaz_zapnuty'), false),
    'odkaz_autor', (select hodnota from nastavenia where kluc = 'odkaz_autor'));
end $$;

revoke execute on function public.upravit_osobne(uuid, text, text), public.nastavit_odkaz(text, boolean) from public, anon;
grant execute on function public.upravit_osobne(uuid, text, text), public.nastavit_odkaz(text, boolean) to authenticated;

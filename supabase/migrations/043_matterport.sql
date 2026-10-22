-- =====================================================================
-- Rezervácia Matterportu (3D kamera kancelárie)
-- Maklér klikne v kalendári na deň a hodinu → kamera je jeho na 3 hodiny.
-- Svoju rezerváciu si môže predĺžiť o hodinu (aj viackrát) alebo zrušiť.
-- Pri každej zmene dostane celý tím správu v chate (vyskočí obálka).
-- Dve rezervácie sa nikdy neprekryjú.
-- =====================================================================

create table if not exists public.matterport_rezervacie (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  zaciatok timestamptz not null,
  koniec timestamptz not null,
  poznamka text,
  vytvorene timestamptz not null default now(),
  upravene timestamptz,
  zrusene timestamptz,
  zrusil uuid references public.makleri(id) on delete set null,
  check (koniec > zaciatok)
);
create index if not exists matterport_rez_cas on public.matterport_rezervacie (zaciatok, koniec) where zrusene is null;

alter table public.matterport_rezervacie enable row level security;
revoke all on public.matterport_rezervacie from anon, authenticated;
grant select on public.matterport_rezervacie to authenticated;
drop policy if exists matterport_citat on public.matterport_rezervacie;
create policy matterport_citat on public.matterport_rezervacie for select to authenticated
  using (ja_aktivny() and zrusene is null);

-- ---------------------------------------------------------------- pomocné
-- „štvrtok 23. 10. od 9:00 do 12:00“ (slovenský čas)
create or replace function public._matterport_cas(p_z timestamptz, p_k timestamptz) returns text
language sql immutable set search_path = public as $$
  select (array['nedeľu','pondelok','utorok','stredu','štvrtok','piatok','sobotu'])[extract(dow from p_z at time zone 'Europe/Bratislava')::int + 1]
    || ' ' || to_char(p_z at time zone 'Europe/Bratislava', 'FMDD. FMMM.')
    || ' od ' || to_char(p_z at time zone 'Europe/Bratislava', 'FMHH24:MI')
    || ' do ' || to_char(p_k at time zone 'Europe/Bratislava', 'FMHH24:MI')
    || case when (p_k at time zone 'Europe/Bratislava')::date <> (p_z at time zone 'Europe/Bratislava')::date
            then ' (' || to_char(p_k at time zone 'Europe/Bratislava', 'FMDD. FMMM.') || ')' else '' end;
$$;
revoke execute on function public._matterport_cas(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public._matterport_kolizia(p_z timestamptz, p_k timestamptz, p_okrem bigint) returns text
language sql stable security definer set search_path = public as $$
  select _meno(r.makler_id) || ' (' || _matterport_cas(r.zaciatok, r.koniec) || ')'
  from matterport_rezervacie r
  where r.zrusene is null and r.zaciatok < p_k and r.koniec > p_z and r.id is distinct from p_okrem
  order by r.zaciatok limit 1;
$$;
revoke execute on function public._matterport_kolizia(timestamptz, timestamptz, bigint) from public, anon, authenticated;

create or replace function public._over_matterport() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not ma_pristup('matterport') then raise exception 'Nemáte prístup k rezervácii Matterportu.' using errcode = '42501'; end if;
end $$;
revoke execute on function public._over_matterport() from public, anon, authenticated;

-- ---------------------------------------------------------------- rezervovať (3 hodiny)
create or replace function public.rezervovat_matterport(p_zaciatok timestamptz, p_poznamka text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_k timestamptz; v_kol text; v_id bigint; v_pozn text := nullif(trim(coalesce(p_poznamka, '')), '');
begin
  perform _over_matterport();
  if p_zaciatok is null then raise exception 'Vyberte dátum a čas.'; end if;
  if p_zaciatok < now() - interval '30 minutes' then raise exception 'Tento čas už uplynul – vyberte neskorší.'; end if;
  if p_zaciatok > now() + interval '1 year' then raise exception 'Rezervovať sa dá najviac rok dopredu.'; end if;
  v_k := p_zaciatok + interval '3 hours';
  perform pg_advisory_xact_lock(hashtext('matterport_rezervacie'));
  v_kol := _matterport_kolizia(p_zaciatok, v_k, null);
  if v_kol is not null then raise exception 'Matterport má v tom čase rezervovaný %.', v_kol; end if;
  insert into matterport_rezervacie (makler_id, zaciatok, koniec, poznamka)
  values (auth.uid(), p_zaciatok, v_k, left(v_pozn, 300)) returning id into v_id;
  insert into spravy (makler_id, text)
  values (auth.uid(), '📸 Rezervujem si Matterport na ' || _matterport_cas(p_zaciatok, v_k) || '.' || coalesce(' ' || left(v_pozn, 300), ''));
  return v_id;
end $$;

-- ---------------------------------------------------------------- predĺžiť o hodinu
create or replace function public.predlzit_matterport(p_id bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r matterport_rezervacie; v_k timestamptz; v_kol text;
begin
  perform _over_matterport();
  perform pg_advisory_xact_lock(hashtext('matterport_rezervacie'));
  select * into r from matterport_rezervacie where id = p_id and zrusene is null;
  if not found then raise exception 'Rezervácia už neexistuje.'; end if;
  if r.makler_id <> auth.uid() and not ja_admin() then raise exception 'Predĺžiť môžete len svoju rezerváciu.'; end if;
  if r.koniec < now() then raise exception 'Rezervácia už skončila.'; end if;
  v_k := r.koniec + interval '1 hour';
  if v_k - r.zaciatok > interval '12 hours' then raise exception 'Jedna rezervácia môže trvať najviac 12 hodín.'; end if;
  v_kol := _matterport_kolizia(r.koniec, v_k, r.id);
  if v_kol is not null then raise exception 'Predĺžiť sa nedá – hneď potom má Matterport rezervovaný %.', v_kol; end if;
  update matterport_rezervacie set koniec = v_k, upravene = now() where id = r.id;
  insert into spravy (makler_id, text)
  values (auth.uid(), '📸 ' || case when r.makler_id = auth.uid() then 'Matterport si nechávam o hodinu dlhšie, mám ho na '
                                   else 'Rezervácia Matterportu (' || _meno(r.makler_id) || ') je predĺžená o hodinu, teraz je na ' end
          || _matterport_cas(r.zaciatok, v_k) || '.');
  return v_k;
end $$;

-- ---------------------------------------------------------------- zrušiť
create or replace function public.zrusit_matterport(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r matterport_rezervacie;
begin
  perform _over_matterport();
  select * into r from matterport_rezervacie where id = p_id and zrusene is null;
  if not found then return; end if;
  if r.makler_id <> auth.uid() and not ja_admin() then raise exception 'Zrušiť môžete len svoju rezerváciu.'; end if;
  update matterport_rezervacie set zrusene = now(), zrusil = auth.uid() where id = r.id;
  if r.koniec > now() then
    insert into spravy (makler_id, text)
    values (auth.uid(), '📸 Matterport je opäť voľný – ' || case when r.makler_id = auth.uid() then 'ruším svoju rezerváciu' else 'rezervácia (' || _meno(r.makler_id) || ')' end
            || ' na ' || _matterport_cas(r.zaciatok, r.koniec) || case when r.makler_id = auth.uid() then '.' else ' je zrušená.' end);
  end if;
end $$;

revoke execute on function public.rezervovat_matterport(timestamptz, text), public.predlzit_matterport(bigint), public.zrusit_matterport(bigint) from public, anon;
grant execute on function public.rezervovat_matterport(timestamptz, text), public.predlzit_matterport(bigint), public.zrusit_matterport(bigint) to authenticated;

-- ---------------------------------------------------------------- nová sekcia v prístupoch (dostanú ju všetci)
alter table public.makleri alter column pristup set default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat,matterport,kalendar,mapa,kataster,asistent,web,recenzie,provizie}';
update public.makleri set pristup = pristup || '{matterport}'::text[] where not ('matterport' = any(pristup));

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'matterport', 'kalendar', 'mapa', 'kataster', 'asistent', 'web', 'recenzie', 'provizie')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

insert into public.novinky (nazov, popis, ciel, pre_koho)
select 'Rezervácia Matterportu',
   'Vedľa chatu pribudla sekcia Matterport. Klikneš v kalendári na deň a hodinu a kamera je tvoja na 3 hodiny. Keď potrebuješ viac, pridáš si +1 hodinu. Kolegom príde správa v chate, takže každý hneď vie, kedy je kamera obsadená. Kalendár si môžeš prelistovať aj na ďalšie týždne.',
   'matterport', 'vsetci'
where not exists (select 1 from public.novinky where nazov = 'Rezervácia Matterportu');

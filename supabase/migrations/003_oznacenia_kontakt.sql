-- =====================================================================
-- Ručné označenie predajcu (RK) a meno kontaktu v schránkovaní
-- =====================================================================

-- ručné označenie: prepíše odhad skenera (skener túto tabuľku nemení)
create table public.oznacenia (
  inzerat_id text primary key references public.inzeraty(id) on delete cascade,
  predajca_typ text check (predajca_typ in ('rk', 'sukromny')),
  oznacil uuid references public.makleri(id) on delete set null,
  oznacene timestamptz not null default now()
);
alter table public.oznacenia enable row level security;
create policy oznacenia_citat on public.oznacenia for select to authenticated using (ja_aktivny());
revoke all on public.oznacenia from anon, authenticated;
grant select on public.oznacenia to authenticated;

-- p_typ = 'rk' označí ako realitku, null vráti pôvodné rozpoznanie skenera
create or replace function public.oznacit_predajcu(p_inzerat text, p_typ text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if p_typ is not null and p_typ not in ('rk', 'sukromny') then raise exception 'Neplatné označenie.'; end if;
  if not exists (select 1 from inzeraty where id = p_inzerat) then raise exception 'Inzerát neexistuje.'; end if;
  insert into oznacenia (inzerat_id, predajca_typ, oznacil, oznacene) values (p_inzerat, p_typ, auth.uid(), now())
  on conflict (inzerat_id) do update set predajca_typ = excluded.predajca_typ, oznacil = excluded.oznacil, oznacene = now();
end $$;

-- meno kontaktu v schránkovaní
alter table public.schrankovanie add column if not exists kontakt text;

create or replace function public.ulozit_schrankovanie(
  p_id bigint, p_lokalita text, p_typ text, p_cena int, p_telefon text, p_stav text, p_poznamky text, p_makler uuid, p_kontakt text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_majitel uuid;
begin
  perform _over_aktivny();
  if coalesce(trim(p_lokalita), '') = '' then raise exception 'Zadajte lokalitu alebo adresu.'; end if;
  if p_id is null then
    insert into schrankovanie (lokalita, typ, cena, telefon, stav, poznamky, kontakt, makler_id, vytvoril)
    values (trim(p_lokalita), p_typ, p_cena, nullif(trim(p_telefon), ''), nullif(trim(p_stav), ''), nullif(trim(p_poznamky), ''),
            nullif(trim(p_kontakt), ''), case when ja_admin() and p_makler is not null then p_makler else auth.uid() end, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  select makler_id into v_majitel from schrankovanie where id = p_id and zmazane is null for update;
  if not found then raise exception 'Záznam neexistuje.'; end if;
  if v_majitel is distinct from auth.uid() and not ja_admin() then
    raise exception 'Upraviť môže len %, alebo administrátor.', coalesce(_meno(v_majitel), 'pôvodný maklér');
  end if;
  update schrankovanie set lokalita = trim(p_lokalita), typ = p_typ, cena = p_cena, telefon = nullif(trim(p_telefon), ''),
    stav = nullif(trim(p_stav), ''), poznamky = nullif(trim(p_poznamky), ''), kontakt = nullif(trim(p_kontakt), ''),
    makler_id = case when ja_admin() then p_makler else makler_id end, upravene = now()
  where id = p_id;
  return p_id;
end $$;

revoke execute on function public.oznacit_predajcu(text, text),
  public.ulozit_schrankovanie(bigint, text, text, int, text, text, text, uuid, text)
  from public, anon;
grant execute on function public.oznacit_predajcu(text, text),
  public.ulozit_schrankovanie(bigint, text, text, int, text, text, text, uuid, text)
  to authenticated;

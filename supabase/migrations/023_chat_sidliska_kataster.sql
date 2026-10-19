-- =====================================================================
-- Chat: zmazaná správa zmizne úplne (text sa vymaže a nikto ju už nevidí).
-- Schránkovanie: Centrum v Spišskej Novej Vsi rozdelené na Centrum sever a Centrum juh,
--   rezervuje sa vždy celé sídlisko (bez polovíc).
-- Nová sekcia Kataster v prístupoch maklérov.
-- =====================================================================

-- ---------------------------------------------------------------- chat
create or replace function public.zmazat_spravu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  perform _over_aktivny();
  select makler_id into v_autor from spravy where id = p_id;
  if not found then return; end if;
  if v_autor is distinct from auth.uid() and not ja_admin() then raise exception 'Zmazať môžete len svoju správu.'; end if;
  update spravy set zmazane = now(), text = '' where id = p_id;
end $$;

update public.spravy set text = '' where zmazane is not null and text <> '';

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'spravy' and policyname = 'spravy_bez_zmazanych') then
    create policy spravy_bez_zmazanych on public.spravy as restrictive for select to authenticated using (zmazane is null);
  end if;
end $$;

-- ---------------------------------------------------------------- sídliská
update public.sidliska set nazov = 'Centrum sever' where mesto = 'Spišská Nová Ves' and nazov = 'Centrum';
update public.sidliska set poradie = poradie + 1 where mesto = 'Spišská Nová Ves' and nazov <> 'Centrum sever' and poradie >= 2
  and not exists (select 1 from public.sidliska where mesto = 'Spišská Nová Ves' and nazov = 'Centrum juh');
insert into public.sidliska (mesto, nazov, poradie) values ('Spišská Nová Ves', 'Centrum juh', 2)
  on conflict (mesto, nazov) do nothing;

-- polovice sa už nepoužívajú – každá rezervácia platí pre celé sídlisko
create or replace function public.rezervovat_sidlisko(p_sidlisko bigint, p_polovica text, p_datum date, p_poznamka text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; k schrankovanie_akcie;
begin
  perform _over_aktivny();
  if not exists (select 1 from sidliska where id = p_sidlisko and aktivne) then raise exception 'Sídlisko neexistuje.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  select * into k from schrankovanie_akcie a
  where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a)
  order by a.rezervovane desc limit 1;
  if found then
    if k.datum is null then
      raise exception 'Už rezervované: % (od %).', coalesce(_meno(k.makler_id), 'iný maklér'), to_char(k.rezervovane, 'DD.MM.YYYY');
    end if;
    raise exception 'Obsadené: % % %, voľné bude od %.', coalesce(_meno(k.makler_id), 'iný maklér'),
      case when (select pohlavie from makleri where id = k.makler_id) = 'zena' then 'schránkovala' else 'schránkoval' end,
      to_char(k.datum, 'DD.MM.YYYY'), to_char(k.datum + interval '2 months', 'DD.MM.YYYY');
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, datum, poznamka)
  values (p_sidlisko, 'cele', auth.uid(), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- sekcia Kataster
alter table public.makleri alter column pristup set default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat,kalendar,mapa,kataster,asistent,web,recenzie}';
update public.makleri set pristup = pristup || '{kataster}'::text[] where not ('kataster' = any(pristup));

create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'kalendar', 'mapa', 'kataster', 'asistent', 'web', 'recenzie')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

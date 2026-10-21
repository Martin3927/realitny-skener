-- =====================================================================
-- Schránkovanie: administrátor zapíše schránkovanie (alebo rezerváciu) za ktoréhokoľvek makléra
-- a pri existujúcom zázname môže zmeniť makléra, dátum aj poznámku.
--  p_id null  → nový záznam pre sídlisko p_sidlisko (sídlisko nesmie byť práve obsadené)
--  p_id daný  → úprava existujúceho záznamu
-- =====================================================================

create or replace function public.admin_zapisat_schrankovanie(p_id bigint, p_sidlisko bigint, p_makler uuid, p_datum date, p_poznamka text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; k schrankovanie_akcie;
begin
  perform _over_admin();
  if p_makler is null or not exists (select 1 from makleri where id = p_makler) then raise exception 'Vyberte makléra.'; end if;
  if p_datum is not null and p_datum > current_date then raise exception 'Dátum schránkovania nemôže byť v budúcnosti.'; end if;
  if p_id is not null then
    select * into k from schrankovanie_akcie where id = p_id and zrusene is null for update;
    if not found then raise exception 'Záznam neexistuje.'; end if;
    update schrankovanie_akcie set makler_id = p_makler, datum = coalesce(p_datum, datum),
      poznamka = nullif(trim(coalesce(p_poznamka, '')), '') where id = p_id;
    return p_id;
  end if;
  if not exists (select 1 from sidliska where id = p_sidlisko) then raise exception 'Sídlisko neexistuje.'; end if;
  perform pg_advisory_xact_lock(hashtext('sidlisko:' || p_sidlisko));
  -- staršie schránkovanie (už po 2 mesiacoch) sa dá zapísať vždy; inak nesmie byť sídlisko obsadené
  if p_datum is null or p_datum > (current_date - interval '2 months')::date then
    select * into k from schrankovanie_akcie a where a.sidlisko_id = p_sidlisko and _akcia_blokuje(a)
    order by a.rezervovane desc limit 1;
    if found then
      raise exception 'Sídlisko je obsadené (%). Najprv zrušte ten záznam alebo ho upravte.', coalesce(_meno(k.makler_id), 'iný maklér');
    end if;
  end if;
  insert into schrankovanie_akcie (sidlisko_id, polovica, makler_id, rezervovane, datum, poznamka)
  values (p_sidlisko, 'cele', p_makler, coalesce(p_datum::timestamptz, now()), p_datum, nullif(trim(p_poznamka), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.admin_zapisat_schrankovanie(bigint, bigint, uuid, date, text) from public, anon;
grant execute on function public.admin_zapisat_schrankovanie(bigint, bigint, uuid, date, text) to authenticated;

-- Nadväzuje na 137 (21. 11. 2026):
--   1. Nehnuteľnosť mimo ponuky vie, z ktorého odhadu hodnoty vznikla (tlačidlo „Pridať do Mimo ponuky“ pri odhade).
--   2. Kontrola starých dopytov: aktívny dopyt 60 dní bez zmeny a bez potvrdenia → pripomienka maklérovi klienta
--      („hľadá klient ešte?“), najviac raz za 30 dní a najviac 5 na makléra denne. Maklér dopyt potvrdí jedným klikom
--      (potvrdit_dopyt) alebo ho uzavrie. Čísla „hľadá ju X klientov“ tak ostanú pravdivé.

alter table public.mimo_ponuky add column if not exists odhad_id bigint references public.odhady_hodnoty(id) on delete set null;
create index if not exists mimo_ponuky_odhad on public.mimo_ponuky (odhad_id) where odhad_id is not null;

alter table public.dopyty add column if not exists overene timestamptz;       -- kedy maklér naposledy potvrdil, že klient stále hľadá
alter table public.dopyty add column if not exists pripomenute timestamptz;   -- kedy sme mu to naposledy pripomenuli

-- zápis nehnuteľnosti mimo ponuky: + odkaz na odhad (len odhad vlastnej kancelárie; inak bez zmeny oproti 137)
create or replace function public.ulozit_mimo(p jsonb, p_k jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(p ->> 'id', '')::bigint; v_makler uuid; v_stara mimo_ponuky; v_kanc bigint := aktivna_kancelaria();
        v_odhad bigint := nullif(p ->> 'odhad_id', '')::bigint;
begin
  perform _over_aktivny();
  if not ma_pristup('klienti') then raise exception 'Nemáte prístup ku klientom.' using errcode = '42501'; end if;
  if nullif(p ->> 'kategoria', '') is null then raise exception 'Vyberte druh nehnuteľnosti.'; end if;
  v_makler := coalesce(nullif(p ->> 'makler_id', '')::uuid, auth.uid());
  if not ja_admin() and v_makler <> auth.uid() then raise exception 'Nehnuteľnosť môžete zapísať len sebe.' using errcode = '42501'; end if;
  if not exists (select 1 from makleri where id = v_makler and kancelaria_id = v_kanc) then raise exception 'Maklér nie je z vašej kancelárie.'; end if;
  if v_odhad is not null and not exists (select 1 from odhady_hodnoty o where o.id = v_odhad and o.kancelaria_id = v_kanc
                                           and (ja_admin() or o.makler_id = auth.uid())) then
    v_odhad := null;
  end if;
  if v_id is not null then
    select * into v_stara from mimo_ponuky where id = v_id and kancelaria_id = v_kanc for update;
    if not found then raise exception 'Nehnuteľnosť neexistuje.'; end if;
    if not ja_admin() and v_stara.makler_id is distinct from auth.uid() then
      raise exception 'Upraviť môže len maklér, ktorý nehnuteľnosť zapísal, alebo administrátor.' using errcode = '42501';
    end if;
  else
    insert into mimo_ponuky (kancelaria_id, makler_id, kategoria) values (v_kanc, v_makler, p ->> 'kategoria') returning id into v_id;
  end if;
  update mimo_ponuky set
    makler_id = v_makler,
    transakcia = case when p ->> 'transakcia' = 'prenajom' then 'prenajom' else 'predaj' end,
    kategoria = p ->> 'kategoria',
    typ = nullif(btrim(p ->> 'typ'), ''),
    obec = nullif(btrim(p ->> 'obec'), ''),
    okres = nullif(btrim(p ->> 'okres'), ''),
    cena = nullif(p ->> 'cena', '')::numeric,
    plocha = nullif(p ->> 'plocha', '')::numeric,
    izby = nullif(p ->> 'izby', '')::int,
    stav_objektu = nullif(lower(btrim(p ->> 'stav_objektu')), ''),
    popis = left(coalesce(p ->> 'popis', ''), 1000),
    odhad_id = coalesce(v_odhad, odhad_id),
    upravene = now()
  where id = v_id;
  insert into mimo_ponuky_kontakty (mimo_id, kancelaria_id) values (v_id, v_kanc) on conflict do nothing;
  if p_k is not null then
    update mimo_ponuky_kontakty set meno = nullif(btrim(p_k ->> 'meno'), ''), telefon = nullif(btrim(p_k ->> 'telefon'), ''),
      email = nullif(btrim(p_k ->> 'email'), ''), adresa = nullif(btrim(p_k ->> 'adresa'), ''), poznamka = nullif(btrim(p_k ->> 'poznamka'), '')
    where mimo_id = v_id;
  end if;
  return v_id;
end $$;

-- maklér klienta (alebo administrátor) potvrdí, že klient stále hľadá
create or replace function public.potvrdit_dopyt(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d dopyty;
begin
  perform _over_aktivny();
  select * into d from dopyty where id = p_id and kancelaria_id = aktivna_kancelaria();
  if not found then raise exception 'Dopyt neexistuje.'; end if;
  if not ja_admin() and d.makler_id is distinct from auth.uid() then
    raise exception 'Potvrdiť môže len maklér klienta alebo administrátor.' using errcode = '42501';
  end if;
  update dopyty set overene = now() where id = p_id;
end $$;

-- denná kontrola: dopyty 60 dní bez zmeny a bez potvrdenia
create or replace function public._dopyty_kontrola() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select * from (
      select d.id, d.makler_id, d.kancelaria_id, greatest(d.upravene, coalesce(d.overene, d.upravene)) as naposledy,
             coalesce(nullif(btrim(k.meno), ''), 'váš klient') as klient,
             row_number() over (partition by d.makler_id order by greatest(d.upravene, coalesce(d.overene, d.upravene))) as poradie
      from dopyty d
      join makleri m on m.id = d.makler_id and m.aktivny
      join kancelarie kc on kc.id = d.kancelaria_id and kc.aktivna
      left join dopyty_kontakty k on k.dopyt_id = d.id
      where d.stav = 'aktivny'
        and greatest(d.upravene, coalesce(d.overene, d.upravene)) < now() - interval '60 days'
        and (d.pripomenute is null or d.pripomenute < now() - interval '30 days')
    ) x where x.poradie <= 5
  loop
    insert into pripomienky (makler_id, cas, poznamka, druh, kancelaria_id)
    values (r.makler_id, now(),
            '⏳ Hľadá ešte ' || r.klient || '? Dopyt je bez zmeny od ' || to_char(r.naposledy at time zone 'Europe/Bratislava', 'DD. MM. YYYY') ||
            ' – potvrďte ho alebo uzavrite (Klienti → Dopyty klientov).', 'pripomienka', r.kancelaria_id);
    update dopyty set pripomenute = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public._dopyty_kontrola() from public, anon, authenticated;
revoke execute on function public.potvrdit_dopyt(bigint) from public, anon;
grant execute on function public.potvrdit_dopyt(bigint) to authenticated;

do $$ begin perform cron.unschedule('dopyty-kontrola'); exception when others then null; end $$;
select cron.schedule('dopyty-kontrola', '40 7 * * 1-5', 'select public._dopyty_kontrola()');

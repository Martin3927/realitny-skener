-- =====================================================================
-- Matterport: rezervácia, predĺženie ani zrušenie už nepíše do chatu
-- (bez obálok a upozornení na ploche). Kto má kameru, je vidieť v sekcii Matterport.
-- =====================================================================

create or replace function public.rezervovat_matterport(p_zaciatok timestamptz, p_poznamka text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_k timestamptz; v_kol text; v_id bigint; v_pozn text := nullif(trim(coalesce(p_poznamka, '')), '');
begin
  perform _over_matterport();
  if p_zaciatok is null then raise exception 'Vyberte dátum a čas.'; end if;
  if p_zaciatok < now() - interval '30 minutes' then raise exception 'Tento čas už uplynul – vyberte neskorší.'; end if;
  if p_zaciatok > now() + interval '1 year' then raise exception 'Rezervovať sa dá najviac rok dopredu.'; end if;
  v_k := p_zaciatok + interval '2 hours';
  perform pg_advisory_xact_lock(hashtext('matterport_rezervacie'));
  v_kol := _matterport_kolizia(p_zaciatok, v_k, null);
  if v_kol is not null then raise exception 'Matterport má v tom čase rezervovaný %.', v_kol; end if;
  insert into matterport_rezervacie (makler_id, zaciatok, koniec, poznamka)
  values (auth.uid(), p_zaciatok, v_k, left(v_pozn, 300)) returning id into v_id;
  return v_id;
end $$;

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
  if r.predlzenia >= 2 then raise exception 'Rezervácia už bola predĺžená 2× – viac sa nedá.'; end if;
  v_k := r.koniec + interval '1 hour';
  v_kol := _matterport_kolizia(r.koniec, v_k, r.id);
  if v_kol is not null then raise exception 'Predĺžiť sa nedá – hneď potom má Matterport rezervovaný %.', v_kol; end if;
  update matterport_rezervacie set koniec = v_k, predlzenia = r.predlzenia + 1, predlzene = true, upravene = now() where id = r.id;
  return v_k;
end $$;

create or replace function public.zrusit_matterport(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r matterport_rezervacie;
begin
  perform _over_matterport();
  select * into r from matterport_rezervacie where id = p_id and zrusene is null;
  if not found then return; end if;
  if r.makler_id <> auth.uid() and not ja_admin() then raise exception 'Zrušiť môžete len svoju rezerváciu.'; end if;
  update matterport_rezervacie set zrusene = now(), zrusil = auth.uid() where id = r.id;
end $$;

-- oznam v „Čo je nové“ bez zmienky o chate (čas sa nemení – nikomu znova nevyskočí)
update public.novinky set
  popis = 'V menu vedľa Chatu pribudol Matterport. V kalendári klikneš na deň a hodinu a kamera je tvoja na 2 hodiny. Keď potrebuješ viac, pridáš si +1 hodinu – najviac 2×, ak hneď po tebe nemá kameru kolega. Hore vždy vidíš, či je Matterport práve voľný a kto ho má, a kalendár si prelistuješ aj na ďalšie týždne.'
where nazov = 'Rezervácia Matterportu';

-- =====================================================================
-- Matterport: základná rezervácia 2 hodiny, predĺžiť o hodinu sa dá len raz.
-- =====================================================================

alter table public.matterport_rezervacie add column if not exists predlzene boolean not null default false;
update public.matterport_rezervacie set predlzene = true where koniec - zaciatok > interval '2 hours' and not predlzene;

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
  insert into spravy (makler_id, text)
  values (auth.uid(), '📸 Rezervujem si Matterport na ' || _matterport_cas(p_zaciatok, v_k) || '.' || coalesce(' ' || left(v_pozn, 300), ''));
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
  if r.predlzene then raise exception 'Rezervácia už bola predĺžená – o hodinu sa dá predĺžiť len raz.'; end if;
  v_k := r.koniec + interval '1 hour';
  v_kol := _matterport_kolizia(r.koniec, v_k, r.id);
  if v_kol is not null then raise exception 'Predĺžiť sa nedá – hneď potom má Matterport rezervovaný %.', v_kol; end if;
  update matterport_rezervacie set koniec = v_k, predlzene = true, upravene = now() where id = r.id;
  insert into spravy (makler_id, text)
  values (auth.uid(), '📸 ' || case when r.makler_id = auth.uid() then 'Matterport si nechávam o hodinu dlhšie, mám ho na '
                                   else 'Rezervácia Matterportu (' || _meno(r.makler_id) || ') je predĺžená o hodinu, teraz je na ' end
          || _matterport_cas(r.zaciatok, v_k) || '.');
  return v_k;
end $$;

update public.novinky set popis = 'Vedľa chatu pribudla sekcia Matterport. Klikneš v kalendári na deň a hodinu a kamera je tvoja na 2 hodiny. Keď potrebuješ viac, raz si pridáš +1 hodinu. Kolegom príde správa v chate, takže každý hneď vie, kedy je kamera obsadená. Kalendár si môžeš prelistovať aj na ďalšie týždne.'
where nazov = 'Rezervácia Matterportu';

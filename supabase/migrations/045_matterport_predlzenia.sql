-- =====================================================================
-- Matterport: predĺžiť o hodinu sa dá najviac 2× (iba kým hneď potom nemá rezerváciu kolega).
-- =====================================================================

alter table public.matterport_rezervacie add column if not exists predlzenia int not null default 0;
update public.matterport_rezervacie set predlzenia = greatest(predlzenia, 1) where predlzene;

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
  insert into spravy (makler_id, text)
  values (auth.uid(), '📸 ' || case when r.makler_id = auth.uid() then 'Matterport si nechávam o hodinu dlhšie, mám ho na '
                                   else 'Rezervácia Matterportu (' || _meno(r.makler_id) || ') je predĺžená o hodinu, teraz je na ' end
          || _matterport_cas(r.zaciatok, v_k) || '.');
  return v_k;
end $$;

update public.novinky set popis = 'Vedľa chatu pribudla sekcia Matterport. Klikneš v kalendári na deň a hodinu a kamera je tvoja na 2 hodiny. Keď potrebuješ viac, pridáš si +1 hodinu (najviac 2×), ak hneď potom nemá kameru kolega. Kolegom príde správa v chate, takže každý hneď vie, kedy je kamera obsadená. Kalendár si môžeš prelistovať aj na ďalšie týždne.'
where nazov = 'Rezervácia Matterportu';

-- Zvonček: „Vymazať všetky upozornenia“ – maklér jedným ťuknutím vybaví všetky svoje pripomienky po termíne
-- (kontakty z webu, objednávky, zníženie ceny, zhody, uvoľnenia, znova zavolať, vlastné pripomienky…).
-- Je to to isté ako „✓ Hotovo“ pri každej zvlášť. Naplánované do budúcnosti (dnes neskôr, ďalšie dni) ostávajú.
-- Aplikácia posiela id, ktoré maklér práve videl v zvončeku – čo medzitým pribudlo, v zvončeku ostane.
-- Len vlastné pripomienky makléra (nie tie, ktoré nastavil kolegovi, ani pripomienky ostatných pri administrátorovi)
-- a len v kancelárii, v ktorej práve pracuje.

create or replace function public.pripomienky_vybavit_vsetky(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform _over_aktivny();
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 2000 then raise exception 'Naraz sa dá vybaviť najviac 2000 pripomienok.'; end if;
  update pripomienky set hotovo = now()
   where id = any(p_ids)
     and makler_id = auth.uid()
     and kancelaria_id = aktivna_kancelaria()
     and hotovo is null and zrusena is null
     and cas <= now() + interval '2 minutes';            -- hodiny v telefóne môžu ísť trochu dopredu
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.pripomienky_vybavit_vsetky(bigint[]) from public, anon;
grant execute on function public.pripomienky_vybavit_vsetky(bigint[]) to authenticated;

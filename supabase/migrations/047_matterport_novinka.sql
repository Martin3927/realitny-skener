-- =====================================================================
-- Matterport: oznam v „Čo je nové“ – finálne znenie, navrch zoznamu.
-- Makléri ho uvidia pri najbližšom prihlásení (kto ho už videl, tomu znova nevyskočí,
-- lebo čas sa posúva len vtedy, keď oznam ešte nikto z maklérov nevidel).
-- =====================================================================

update public.novinky set
  popis = 'V menu vedľa Chatu pribudol Matterport. V kalendári klikneš na deň a hodinu a kamera je tvoja na 2 hodiny. Keď potrebuješ viac, pridáš si +1 hodinu – najviac 2×, ak hneď po tebe nemá kameru kolega. Pri každej rezervácii, predĺžení aj zrušení dostane tím správu v chate, takže každý vie, kedy je kamera obsadená. Hore vždy vidíš, či je Matterport práve voľný, a kalendár si prelistuješ aj na ďalšie týždne.',
  ciel = 'matterport',
  aktivna = true,
  vytvorene = case
    when exists (select 1 from public.makleri m where m.aktivny and m.rola <> 'admin' and m.novinky_videne > novinky.vytvorene) then vytvorene
    else now() end
where nazov = 'Rezervácia Matterportu';

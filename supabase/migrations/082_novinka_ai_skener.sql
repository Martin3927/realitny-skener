-- =====================================================================
-- Novinka v Pomoc → Čo je nové (všetci, tlačidlo vedie do Realitného skenera):
-- skener kontroluje súkromné inzeráty aj pomocou AI (hodnotenie vidí každý so skenerom)
-- =====================================================================
insert into public.novinky (nazov, popis, ciel, pre_koho)
select x.nazov, x.popis, 'inzeraty', 'vsetci'
from (values
  ('Skener kontroluje aj AI',
   'Každý nový inzerát od súkromníka si do pár sekúnd prečíta aj AI a pozrie sa na jeho hlavnú fotku. Na karte inzerátu uvidíš riadok „AI: súkromník“ alebo „AI: asi realitka“ aj s dôvodom – napríklad logo realitky na fotke alebo reklamný štýl textu. AI inzeráty nepresúva, je to len pomôcka. Keď ide naozaj o realitku, klikni na Je to RK.')
) as x(nazov, popis)
where not exists (select 1 from public.novinky n where n.nazov = x.nazov);

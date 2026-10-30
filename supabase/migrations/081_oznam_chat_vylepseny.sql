-- =====================================================================
-- Vylepšený chat (fotky a súbory, chat v telefóne, kto videl správu):
-- 1) novinky do Pomoc → Čo je nové (všetci, tlačidlo vedie do Chatu)
-- 2) oznam celému tímu od Martina Augustiňáka – vyskočí každému pri najbližšom otvorení Týpka
--    (rovnako ako Makléri → Nastavenia tímu → Poslať oznam všetkým)
-- =====================================================================
insert into public.novinky (nazov, popis, ciel, pre_koho, vytvorene)
select x.nazov, x.popis, 'chat', 'vsetci', now() - x.posun
from (values
  ('Fotky a súbory v chate',
   'Cez spinku vedľa smajlíka pošleš fotky, PDF, Word, Excel aj PowerPoint celému tímu alebo len jednému kolegovi. Na počítači stačí súbor potiahnuť do chatu alebo vložiť cez Ctrl + V. Fotku otvoríš na celú obrazovku a priblížiš. Všetko, čo ste si v konverzácii poslali, nájdeš hore pod ikonou spinky – Fotky a súbory.',
   interval '0 seconds'),
  ('Kto videl správu v chate tímu',
   'Pod správou vidíš malé fotky kolegov, ktorí ju už videli. Ťukni na správu a ukáže sa, kto ju videl a kto ešte nie.',
   interval '1 second'),
  ('Chat v telefóne na celú obrazovku',
   'V telefóne má chat viac miesta na správy a pri písaní sa drží tesne nad klávesnicou. Kôš pri správe sa ukáže, až keď na správu ťukneš.',
   interval '2 seconds')
) as x(nazov, popis, posun)
where not exists (select 1 from public.novinky n where n.nazov = x.nazov);

insert into public.pochvaly (komu, od, text, typ)
select m.id, a.id,
  'Ahojte, chat v Týpkovi je vylepšený. Cez spinku vedľa smajlíka pošlete fotky aj dokumenty (PDF, Word, Excel) celému tímu alebo len jednému kolegovi. V telefóne je chat na celú obrazovku a po ťuknutí na správu v chate tímu uvidíte, kto ju videl. Viac nájdete v menu Pomoc → Čo je nové.',
  'oznam'
from public.makleri m
left join public.makleri a on lower(a.email) = 'augustinak@alphareality.sk'
where m.aktivny and m.id is distinct from a.id;

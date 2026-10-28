-- =====================================================================
-- Oznamy v „Čo je nové“ k novinkám zo stránky ponuky a Vzhľadu kancelárie
-- =====================================================================
insert into public.novinky (nazov, popis, ciel, pre_koho)
select x.nazov, x.popis, x.ciel, x.pre_koho
from (values
  ('Termín obhliadky priamo zo stránky ponuky',
   'Klient si na stránke ponuky vyberie deň a čas obhliadky. Ukážu sa mu len časy, keď máš v kalendári voľno. V Kalendári ti pribudne návrh obhliadky s čiarkovaným okrajom – klikni na Potvrdiť termín a klientovi pošli potvrdenie zo zvončeka jedným ťuknutím.',
   'kalendar', 'vsetci'),
  ('Pripomenutie kontaktu bez odpovede',
   'Keď ti klient napíše cez web a do 2 hodín mu neodpovieš, Týpek ti to pripomenie. Po 24 hodinách sa to dozvie aj administrátor. Stačí v zvončeku kliknúť na Zavolať, SMS, WhatsApp alebo e-mail, prípadne dať Hotovo. Pripomína sa len cez deň od 8:00 do 20:00.',
   'upozornenia', 'vsetci'),
  ('Ponuka hypotéky na stránke ponuky',
   'Pod hypotekárnou kalkulačkou na stránke ponuky je tlačidlo Chcem ponuku hypotéky. Kontakt ti príde do zvončeka aj s číslami z výpočtu – cena, vlastné zdroje, úver, doba splácania a splátka.',
   'nehnutelnosti', 'vsetci'),
  ('Záujem v reporte pre majiteľa',
   'Report pre majiteľa ukazuje aj to, koľko ľudí napísalo cez stránku ponuky – celkovo aj za posledný týždeň. Majiteľ vidí, že sa okolo jeho nehnuteľnosti niečo deje, a tebe to pomôže aj v rozhovore o cene.',
   'nehnutelnosti', 'vsetci'),
  ('Doplň si telefón a fotku',
   'Klienti tvoj telefón a fotku vidia pri ponukách, na letáku aj na tvojom webe. Bez telefónu ti nemôžu zavolať ani napísať na WhatsApp a s fotkou ti viac dôverujú. Kým ich nemáš vyplnené, na Domove ti to Týpek pripomenie.',
   'profil', 'vsetci'),
  ('Údaje kancelárie na verejných stránkach',
   'Názov, obchodné meno, web a región na stránke ponuky, letáku, reporte pre majiteľa a stránke makléra sa berú zo Vzhľadu kancelárie, takže každá kancelária vidí seba. Údaje Alpha Reality sú už vyplnené – stačí ich skontrolovať.',
   'vzhlad', 'admin'),
  ('Meranie Google Analytics a Meta Pixel',
   'Vo Vzhľade kancelárie môžeš vyplniť Google Analytics a Meta Pixel. Na stránkach ponúk sa zapnú až po súhlase návštevníka s cookies a merajú pozretie ponuky aj odoslaný formulár. Hodí sa to na reklamu na Facebooku a Instagrame.',
   'vzhlad', 'admin')
) as x(nazov, popis, ciel, pre_koho)
where not exists (select 1 from public.novinky n where n.nazov = x.nazov);

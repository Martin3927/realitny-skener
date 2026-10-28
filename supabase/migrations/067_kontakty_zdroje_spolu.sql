-- Dve zmeny z toho istého dňa (066_kontakty_report_hypoteka a 066_web_kancelarie) nastavovali zoznam formulárov
-- každá po svojom. Tu je spoločný zoznam, aby fungovali všetky: hypotéka zo stránky ponuky aj výkup a kariéra z webu kancelárie.
alter table public.web_kontakty drop constraint if exists web_kontakty_zdroj_check;
alter table public.web_kontakty add constraint web_kontakty_zdroj_check
  check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt', 'podobna', 'hypoteka', 'vykup', 'kariera'));

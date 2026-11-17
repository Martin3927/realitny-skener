-- Rýchlosť a poriadok v databáze (17. 11. 2026):
--  • Pravidlá čítania veľkých tabuliek skenera overovali „je maklér aktívny“ pri každom riadku zvlášť
--    (tabuľka maklérov sa tak čítala tisíce ráz na jeden dotaz). Pri záťaži dotazy prekročili limit 8 s
--    a maklér videl chybu namiesto telefónov, kontaktov alebo AI označení. Teraz sa overenie urobí raz na dotaz.
--    Kto čo vidí, sa nemení – overené na živých údajoch (rovnaké počty riadkov, dotaz 11× rýchlejší).
--  • Záznam behov plánovaných úloh (cron.job_run_details) sa nikdy nečistil – za mesiac 266 000 riadkov
--    a tretina databázy. Každú noc sa zmažú záznamy staršie ako 7 dní.

alter policy inzeraty_citat on public.inzeraty using ((select public.ja_aktivny()));
alter policy archiv_citat on public.archiv using ((select public.ja_aktivny()));
alter policy odhady_citat on public.odhady using ((select public.ja_vidim_podhodnotene()));
alter policy inzeraty_ai_citanie on public.inzeraty_ai using ((select public.ma_pristup('inzeraty')));

select cron.schedule('upratat-zaznam-uloh', '23 2 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

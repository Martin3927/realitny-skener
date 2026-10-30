-- =====================================================================
-- 080: AI je pre nových maklérov predvolene vypnutá
--  * právo „asistent“ (prepínač „Používa AI“ v Makléri) zapína všetku AI: asistenta, ✨ Doladiť s AI,
--    ✨ Návrh hovoru a hodnotenie AI v skeneri; administrátor ju má vždy
--  * noví makléri ho už nedostanú automaticky – zapne im ho administrátor; existujúcim sa nič nemení
-- =====================================================================
alter table public.makleri alter column pristup set default '{inzeraty,schrankovanie,nehnutelnosti,klienti,chat,matterport,kalendar,mapa,kataster,web,recenzie,provizie}';

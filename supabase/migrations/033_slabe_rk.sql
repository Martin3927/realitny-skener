-- =====================================================================
-- Jednorazové preradenie: Bazoš inzeráty, ktoré skener dal medzi RK len pre slovo
-- „ponúkame“ / „máme pre vás“ (píšu to aj rodiny – „predáme“), idú medzi „Asi súkromný“.
-- Od tejto verzie to tak robí aj skener; pri nočnej plnej kontrole sa označenie spresní
-- (ak má predajca na Bazoši viac realitných inzerátov, vráti sa medzi RK).
-- Ručné označenia maklérov (tabuľka oznacenia) sa nemenia.
-- =====================================================================
update public.inzeraty i
set predajca_typ = 'asi_sukromny',
    predajca_dovod = 'v texte „' || substring(i.predajca_dovod from '„([^“]*)“') || '“ – možno RK'
where i.portal = 'bazos'
  and i.predajca_typ = 'rk'
  and i.predajca_dovod ~ '^v texte: „(ponukame( vam)?( na predaj)?|pnukame|mame pre vas)“$'
  and i.predajca !~* '(realit|reality|real\M|s\.\s?r\.\s?o|a\.s\.|estate|invest|home|\mrk\M|makl|group|property|consulting|servis|partner|\.sk\M)';

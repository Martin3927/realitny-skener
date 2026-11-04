-- Odhad hodnoty: funkcie pre aplikáciu len pre prihlásených (Supabase dáva novým funkciám právo aj pre anon;
-- funkcie by bez prihlásenia aj tak skončili chybou „účet nie je aktívny“ – toto je poistka navyše).
revoke execute on function public.odhad_podklad(bigint), public.odhad_ulozit(bigint, jsonb),
  public.odhad_poslat(bigint, integer, integer, text), public.odhad_priradit(bigint, uuid) from anon;

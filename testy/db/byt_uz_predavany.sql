-- Databázový test: „Tento byt sa už predával“ – odtlačky fotiek, zhoda so starším zmiznutým inzerátom.
\set ON_ERROR_STOP on
insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(extensions.digest('testkluc', 'sha256'), 'hex'))
  on conflict (kluc) do update set hodnota = excluded.hodnota;
insert into inzeraty (id, portal, portaly, url, nazov, typ, izby, cena, plocha, cena_m2, obec, okres, predajca, predajca_typ, popis, prvy_krat, naposledy, aktivny) values
  ('bazos:stary', 'bazos', '{bazos}', 'https://x/stary', 'Byt Mier 3i', 'byt', 3, 135000, 68, 1985, 'Spišská Nová Ves', 'Spišská Nová Ves', 'RK Domov', 'rk', 'x', now() - interval '90 days', now() - interval '40 days', false),
  ('bazos:iny', 'bazos', '{bazos}', 'https://x/iny', 'Iný byt', 'byt', 3, 120000, 68, 1764, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Jano', 'sukromny', 'x', now() - interval '80 days', now() - interval '30 days', false),
  ('nehnutelnosti:novy', 'nehnutelnosti', '{nehnutelnosti}', 'https://x/novy', 'Predám 3-izbový byt Mier', 'byt', 3, 119000, 67, 1776, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Peter', 'sukromny', 'x', now() - interval '2 days', now(), true);
insert into archiv (inzerat_id, popis, fotky) values ('bazos:stary', 'x', '{a/1.jpg,a/2.jpg,a/3.jpg}'), ('bazos:iny', 'x', '{b/1.jpg}'), ('nehnutelnosti:novy', 'x', '{c/1.jpg,c/2.jpg}');
-- skener: zoznam na odtlačky
do $$ begin assert jsonb_array_length(skener_fotky_na_odtlacky('testkluc', 50)) >= 3, 'tri archívy na odtlačky'; end $$;
do $$ begin begin perform skener_fotky_na_odtlacky('zlykluc', 5); assert false, 'zlý kľúč prešiel'; exception when insufficient_privilege then null; end; end $$;
-- odtlačky: nový inzerát má dve fotky takmer rovnaké ako starý (líšia sa o 2 a 3 bity), iný byt má úplne inú fotku
select skener_ulozit_odtlacky('testkluc', '[{"id":"bazos:stary","h":["1000","2000","3000"]},{"id":"bazos:iny","h":["-9000000000000000000"]},
  {"id":"nehnutelnosti:novy","h":["1003","2007"]}]');
do $$ begin assert skener_prepocitaj_predtym('testkluc') = 1, 'jeden aktívny inzerát so zhodou'; end $$;
do $$ declare z jsonb := (select zhody from inzeraty_predtym where inzerat_id = 'nehnutelnosti:novy');
begin
  assert jsonb_array_length(z) = 1 and z -> 0 ->> 'id' = 'bazos:stary', 'zhoda so starým bytom: ' || z::text;
  assert (z -> 0 ->> 'fotiek')::int = 2 and (z -> 0 ->> 'rk')::boolean and (z -> 0 ->> 'cena')::int = 135000, 'údaje zhody';
end $$;
-- jedna fotka bez zhody parametrov nestačí
update archiv_odtlacky set odtlacky = '{1003}' where inzerat_id = 'nehnutelnosti:novy';
update inzeraty set plocha = 80 where id = 'nehnutelnosti:novy';
select skener_prepocitaj_predtym('testkluc', true);
do $$ begin assert jsonb_array_length((select zhody from inzeraty_predtym where inzerat_id = 'nehnutelnosti:novy')) = 0, 'jedna fotka a iná plocha – nie'; end $$;
-- maklér zhody číta, anonym nie
begin; set local role anon;
do $$ begin begin perform count(*) from inzeraty_predtym; assert false, 'anon číta'; exception when insufficient_privilege then null; end; end $$;
commit;
select 'byt_uz_predavany OK';

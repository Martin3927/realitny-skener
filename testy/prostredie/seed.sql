-- testovací makléri a vymyslené inzeráty (žiadne skutočné údaje)
insert into auth.users (id, email, encrypted_password) values
 ('11111111-1111-1111-1111-111111111111', 'admin@test.sk', extensions.crypt('Test12345', extensions.gen_salt('bf'))),
 ('22222222-2222-2222-2222-222222222222', 'jana@test.sk', extensions.crypt('Test12345', extensions.gen_salt('bf'))),
 ('33333333-3333-3333-3333-333333333333', 'peter@test.sk', extensions.crypt('Test12345', extensions.gen_salt('bf')))
on conflict do nothing;
insert into makleri (id, meno, email, rola, sprievodca_videny, pohlavie) values
 ('11111111-1111-1111-1111-111111111111', 'Martin Testovací', 'admin@test.sk', 'admin', now(), 'muz'),
 ('22222222-2222-2222-2222-222222222222', 'Jana Nováková', 'jana@test.sk', 'makler', now(), 'zena'),
 ('33333333-3333-3333-3333-333333333333', 'Peter Kováč', 'peter@test.sk', 'makler', now(), 'muz')
on conflict do nothing;

insert into inzeraty (id, portal, portaly, url, nazov, typ, izby, cena, plocha, cena_m2, obec, okres, predajca, predajca_typ, popis, prvy_krat, naposledy, aktivny) values
 ('bazos:a1', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/a1/', 'Predám 3-izbový byt Mier', 'byt', 3, 135000, 68, 1985, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Ján Testovací', 'sukromny', 'Byt po rekonštrukcii, volajte 0905 111 222.', now() - interval '120 days', now() - interval '90 days', false),
 ('bazos:a2', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/a2/', 'Predám garáž Tarča', 'garaz', null, 15000, 18, 833, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Ján', 'sukromny', 'Garáž, tel. +421 905 111 222', now() - interval '40 days', now() - interval '1 day', true),
 ('nehnutelnosti:a3', 'nehnutelnosti', '{nehnutelnosti}', 'https://www.nehnutelnosti.sk/a3', 'Rodinný dom Smižany', 'dom', 4, 210000, 140, 1500, 'Smižany', 'Spišská Nová Ves', 'Ján T.', 'sukromny', 'Predám dom. 0905111222', now() - interval '2 hours', now(), true),
 ('bazos:b1', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/b1/', 'Pozemok Levoča', 'pozemok', null, 45000, 900, 50, 'Levoča', 'Levoča', 'Eva', 'sukromny', 'Stavebný pozemok.', now() - interval '10 days', now(), true),
 ('bazos:b2', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/b2/', '2-izbový byt Levoča', 'byt', 2, 98000, 52, 1885, 'Levoča', 'Levoča', 'Eva', 'sukromny', 'Byt, číslo 0907 333 444', now() - interval '3 days', now(), true),
 ('bazos:c1', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/c1/', 'Byt 1+1 SNV', 'byt', 1, 79000, 38, 2078, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Peter', 'sukromny', '0911 555 666', now() - interval '5 days', now(), true),
 ('bazos:c2', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/c2/', 'Byt 2+1 SNV Západ', 'byt', 2, 99000, 55, 1800, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Peter', 'sukromny', '0911 555 666', now() - interval '5 days', now(), true),
 ('bazos:c3', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/c3/', 'Dom Spišské Vlachy', 'dom', 4, 159000, 120, 1325, 'Spišské Vlachy', 'Spišská Nová Ves', 'Peter', 'sukromny', '0911 555 666', now() - interval '4 days', now(), true),
 ('bazos:d1', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/d1/', 'Chata Novoveská Huta', 'chata', null, 65000, 60, 1083, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Mária', 'sukromny', 'Chata pri lese.', now() - interval '1 day', now(), true),
 ('reality:r1', 'reality', '{reality}', 'https://www.reality.sk/r1', 'Byt realitka', 'byt', 3, 140000, 70, 2000, 'Spišská Nová Ves', 'Spišská Nová Ves', 'RK Vzor', 'rk', 'RK ponuka', now() - interval '1 day', now(), true)
on conflict do nothing;

insert into archiv (inzerat_id, popis, parametre, telefon) values
 ('bazos:a1', 'Byt po rekonštrukcii, volajte 0905 111 222.', '{"poschodie":"3"}', '0905 111 222'),
 ('bazos:a2', 'Garáž, tel. +421 905 111 222', '{}', '0905 111 222'),
 ('nehnutelnosti:a3', 'Predám dom. 0905111222', '{}', '0905 111 222'),
 ('bazos:b2', 'Byt, číslo 0907 333 444', '{}', '0907 333 444'),
 ('bazos:c1', '0911 555 666', '{}', '0911 555 666'),
 ('bazos:c2', '0911 555 666', '{}', '0911 555 666'),
 ('bazos:c3', '0911 555 666', '{}', '0911 555 666'),
 ('bazos:d1', 'Chata pri lese.', '{}', null),
 ('reality:r1', 'RK ponuka', '{}', '0944 000 111')
on conflict do nothing;
-- číslo zadané maklérom (iný zápis toho istého čísla)
insert into telefony (inzerat_id, telefon, zadal, zadane) values ('bazos:b1', '+421907333444', '22222222-2222-2222-2222-222222222222', now() - interval '9 days') on conflict do nothing;

-- história práce
insert into prevzatia (inzerat_id, makler_id, prevzate, posledny_vysledok, posledna_poznamka, posledny_hovor, pocet_hovorov, upravene) values
 ('bazos:a1', null, null, 'Nemá záujem o RK', 'Predáva sám, skúsiť o 3 mesiace', now() - interval '100 days', 2, now() - interval '100 days'),
 ('bazos:b1', '22222222-2222-2222-2222-222222222222', now() - interval '9 days', 'Záujem – stretnutie dohodnuté', 'Obhliadka v piatok', now() - interval '8 days', 1, now() - interval '8 days')
on conflict do nothing;
insert into aktivity (inzerat_id, makler_id, typ, vysledok, poznamka, vytvorene) values
 ('bazos:a1', '22222222-2222-2222-2222-222222222222', 'prevzatie', null, null, now() - interval '101 days'),
 ('bazos:a1', '22222222-2222-2222-2222-222222222222', 'hovor', 'Nedvíha', null, now() - interval '101 days'),
 ('bazos:a1', '22222222-2222-2222-2222-222222222222', 'hovor', 'Nemá záujem o RK', 'Predáva sám, skúsiť o 3 mesiace', now() - interval '100 days'),
 ('bazos:a1', '22222222-2222-2222-2222-222222222222', 'uvolnenie', null, null, now() - interval '99 days'),
 ('bazos:b1', '22222222-2222-2222-2222-222222222222', 'prevzatie', null, null, now() - interval '9 days'),
 ('bazos:b1', '22222222-2222-2222-2222-222222222222', 'hovor', 'Záujem – stretnutie dohodnuté', 'Obhliadka v piatok', now() - interval '8 days');

-- hlavný správca (platforma) a stav skenera – ako v ostrej prevádzke
insert into hlavni_spravcovia (user_id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into stav_skenera (id, meta) values (1, jsonb_build_object('posledna_kontrola', now()::text, 'chyby', '[]'::jsonb))
on conflict (id) do update set meta = excluded.meta;

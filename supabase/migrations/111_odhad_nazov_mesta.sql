-- Odhad hodnoty: mestské časti Bratislavy a Košíc v názve žiadosti s mestom („Košice – Juh“, „Bratislava – Petržalka“),
-- nie „Juh (okres Košice IV)“. Stránka ich vo vyhľadávaní ukazuje rovnako, takže klient nájde aj „Košice“.
create or replace function public._odhad_nazov(p_typ text, p_izby text, p_druh text, p_popis text, p_plocha numeric, p_pozemok numeric, p_obec text, p_okres text)
returns text language sql immutable set search_path = public as $$
  select concat_ws(', ',
    case p_typ
      when 'byt' then case when p_izby ~ '^[1-4]$' then p_izby || '-izbový byt' when p_izby is not null then '5 a viac izbový byt' else 'Byt' end
      when 'dom' then 'Rodinný dom' || case when p_izby is not null then ' (' || p_izby || case when p_izby in ('3', '4') or p_izby like '2%' then ' izby' else ' izieb' end || ')' else '' end
      when 'pozemok' then case p_druh when 'Stavebný' then 'Stavebný pozemok' when 'Záhrada' then 'Záhrada' when 'Orná pôda alebo lúka' then 'Orná pôda alebo lúka' else 'Pozemok' end
      else coalesce(p_popis, 'Iná nehnuteľnosť') end,
    case when p_plocha is not null then _cislo_sk(p_plocha) || ' m²' end,
    case when p_typ = 'dom' and p_pozemok > 0 then 'pozemok ' || _cislo_sk(p_pozemok) || ' m²' end,
    case when p_okres ~ '^(Bratislava|Košice) [IV]+$' then split_part(p_okres, ' ', 1) || ' – ' || p_obec
         else p_obec || case when p_okres is not null and p_okres <> p_obec and p_okres not like p_obec || ' %' then ' (okres ' || p_okres || ')' else '' end end)
$$;
revoke execute on function public._odhad_nazov(text, text, text, text, numeric, numeric, text, text) from public, anon, authenticated;

-- už uložené žiadosti z mestských častí
update public.odhady_hodnoty
   set nazov = _odhad_nazov(typ, izby, druh_pozemku, popis, plocha, pozemok, obec, okres)
 where okres ~ '^(Bratislava|Košice) [IV]+$';

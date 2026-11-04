-- Strážca dostupnosti: GitHub (dostupnost.yml) každých 10 minút skúša predajný web, aplikáciu, portál a databázu
-- a výsledok nahlási sem. Po 2. zlyhaní po sebe dostane hlavný správca upozornenie do mobilu (a e-mail z GitHubu),
-- pri trvajúcej poruche znova najskôr o 3 hodiny, po oprave správu „opäť funguje“. Overuje sa kľúčom skenera.

create table if not exists public.dostupnost (
  sluzba text primary key,
  zlyhania int not null default 0,
  prve_zlyhanie timestamptz,
  posledne_zlyhanie timestamptz,
  posledna_chyba text,
  upozornene timestamptz,
  posledny_uspech timestamptz,
  posledna_kontrola timestamptz
);
alter table public.dostupnost enable row level security;
revoke all on public.dostupnost from public, anon, authenticated;
grant select on public.dostupnost to authenticated;
drop policy if exists dostupnost_spravca on public.dostupnost;
create policy dostupnost_spravca on public.dostupnost for select to authenticated using (je_hlavny_spravca());

-- p_stav: [{"sluzba": "Predajný web", "ok": true}, {"sluzba": "Aplikácia", "ok": false, "chyba": "HTTP 503"}, …]
-- vráti, komu a čo treba poslať aj e-mailom z GitHubu: {"upozornit": ["Aplikácia: HTTP 503 (od 12:40)"], "obnovene": ["Portál"]}
create or replace function public.dostupnost_hlasenie(p_kluc text, p_stav jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb; r dostupnost; v_sluzba text; v_ok boolean; v_chyba text;
  v_kto uuid[]; v_upoz text[] := '{}'; v_obn text[] := '{}';
  v_hod int := extract(hour from now() at time zone 'Europe/Bratislava')::int;
begin
  perform _over_skener(p_kluc);
  select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto
    from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;
  for s in select * from jsonb_array_elements(coalesce(p_stav, '[]'::jsonb)) loop
    v_sluzba := left(coalesce(s ->> 'sluzba', '?'), 60);
    v_ok := coalesce((s ->> 'ok')::boolean, false);
    v_chyba := left(coalesce(nullif(btrim(s ->> 'chyba'), ''), 'neznáma chyba'), 300);
    insert into dostupnost (sluzba) values (v_sluzba) on conflict do nothing;
    if v_ok then
      select * into r from dostupnost where sluzba = v_sluzba for update;
      update dostupnost set zlyhania = 0, prve_zlyhanie = null, upozornene = null, posledny_uspech = now(), posledna_kontrola = now()
       where sluzba = v_sluzba;
      if r.upozornene is not null then
        v_obn := v_obn || (v_sluzba || ' (porucha od ' || to_char(r.prve_zlyhanie at time zone 'Europe/Bratislava', 'FMDD. FMMM. HH24:MI') || ')');
      end if;
    else
      update dostupnost set zlyhania = zlyhania + 1, prve_zlyhanie = coalesce(prve_zlyhanie, now()),
        posledne_zlyhanie = now(), posledna_chyba = v_chyba, posledna_kontrola = now()
       where sluzba = v_sluzba returning * into r;
      if r.zlyhania >= 2 and (r.upozornene is null or r.upozornene < now() - interval '3 hours') then
        update dostupnost set upozornene = now() where sluzba = v_sluzba;
        v_upoz := v_upoz || (v_sluzba || ': ' || v_chyba || ' (od ' || to_char(r.prve_zlyhanie at time zone 'Europe/Bratislava', 'FMDD. FMMM. HH24:MI') || ')');
      end if;
    end if;
  end loop;

  if cardinality(v_kto) > 0 and cardinality(v_upoz) > 0 then
    begin
      perform _push_zaradit(v_kto, 'kontakty', '⚠️ Týpek: ' || case when cardinality(v_upoz) = 1 then split_part(v_upoz[1], ':', 1) || ' nefunguje' else 'výpadok' end,
        array_to_string(v_upoz, E'\n'), './#zvoncek', 'typek-dostupnost');
    exception when others then null;
    end;
    -- do zvončeka; e-mail posiela GitHub a upozornenie do mobilu je už zaradené, preto sú obe označené ako vybavené
    insert into pripomienky (makler_id, cas, poznamka, druh, email_odoslany, push_odoslany)
    select k, now(), left('Výpadok: ' || array_to_string(v_upoz, ' · '), 500), 'pripomienka', now(), now() from unnest(v_kto) k;
  end if;
  if cardinality(v_kto) > 0 and cardinality(v_obn) > 0 then
    begin
      perform _push_zaradit(v_kto, 'kontakty', '✅ Týpek: opäť funguje', array_to_string(v_obn, E'\n'), './#zvoncek', 'typek-dostupnost');
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('upozornit', to_jsonb(v_upoz), 'obnovene', to_jsonb(v_obn), 'noc', v_hod < 6 or v_hod >= 22);
end $$;
revoke execute on function public.dostupnost_hlasenie(text, jsonb) from public, authenticated;
grant execute on function public.dostupnost_hlasenie(text, jsonb) to anon;

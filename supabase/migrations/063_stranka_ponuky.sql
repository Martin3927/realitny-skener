-- =====================================================================
-- Verejná stránka ponuky (ponuka.html)
--  * formulár „Mám záujem / Chcem obhliadku / Zavolajte mi“ priamo pri ponuke → kontakt v Týpkovi
--    (zvonček s odpoveďou jedným klikom + upozornenie do mobilu ako pri webe makléra)
--  * pri predanej a rezervovanej ponuke „Hľadáte podobnú?“ → kontakt aj nový dopyt klienta
--  * štítok „Znížená cena“ (posledná zmena ceny v histórii bola zníženie, najviac pred 90 dňami)
-- =====================================================================

-- kontakty zo stránky ponuky nepatria k osobnému webu (web_id ostáva prázdne)
alter table public.web_kontakty alter column web_id drop not null;
alter table public.web_kontakty drop constraint if exists web_kontakty_zdroj_check;
alter table public.web_kontakty add constraint web_kontakty_zdroj_check
  check (zdroj in ('odhad', 'strazca', 'obhliadka', 'callback', 'dotaznik', 'ebook', 'kontakt', 'podobna'));
create index if not exists web_kontakty_ponuka_cas on public.web_kontakty (makler_id, vytvorene desc) where web_id is null;

-- bola posledná zmena ceny zníženie? (chybný zápis v histórii nikdy nezhodí stránku)
create or replace function public._cena_znizena(h jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare n int;
begin
  if h is null or jsonb_typeof(h) <> 'array' then return false; end if;
  n := jsonb_array_length(h);
  if n < 2 then return false; end if;
  return (h->(n - 1)->>1)::numeric < (h->(n - 2)->>1)::numeric
     and (h->(n - 1)->>0)::date > current_date - 90;
exception when others then return false;
end $$;

create or replace function public._verejna(n nehnutelnosti) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id, 'kancelaria', n.kancelaria, 'cislo', n.cislo, 'stav', n.stav, 'transakcia', n.transakcia,
    'kategoria', n.kategoria, 'typ', n.typ, 'nazov', n.nazov, 'intro', n.intro, 'popis', n.popis,
    'kraj', n.kraj, 'okres', n.okres, 'obec', n.obec, 'cast_obce', n.cast_obce, 'ulica', n.ulica,
    'lat', case when n.zobrazit_mapu then n.lat end, 'lon', case when n.zobrazit_mapu then n.lon end,
    'cena', case when n.zobrazit_cenu then n.cena end, 'typ_ceny', n.typ_ceny, 'text_k_cene', n.text_k_cene,
    'cena_energie', n.cena_energie, 'zobrazit_cenu', n.zobrazit_cenu,
    'znizena', n.zobrazit_cenu and n.cena is not null and _cena_znizena(n.historia_cien),
    'plocha_uzitkova', n.plocha_uzitkova, 'plocha_zastavana', n.plocha_zastavana, 'plocha_pozemku', n.plocha_pozemku,
    'izby', n.izby, 'poschodie', n.poschodie, 'pocet_podlazi', n.pocet_podlazi, 'rok_vystavby', n.rok_vystavby,
    'vlastnictvo', n.vlastnictvo, 'stav_objektu', n.stav_objektu, 'konstrukcia', n.konstrukcia,
    'energ_certifikat', n.energ_certifikat, 'kurenie', n.kurenie, 'orientacia', to_jsonb(n.orientacia),
    'vybavenie', to_jsonb(n.vybavenie), 'specialne', to_jsonb(n.specialne), 'exkluzivne', n.exkluzivne,
    'vhodne_pre_studentov', n.vhodne_pre_studentov, 'virtualna_prehliadka', n.virtualna_prehliadka, 'video', n.video,
    'fotky', n.fotky, 'vytvorene', n.vytvorene, 'upravene', n.upravene,
    'makler', (select jsonb_build_object('id', m.id, 'meno', m.meno, 'meno_cele', _meno_cele(m.titul_pred, m.meno, m.titul_za),
                                         'email', m.email, 'telefon', m.telefon,
                                         'foto', case when m.foto like 'data:%' then m.foto end, 'pohlavie', m.pohlavie)
               from makleri m where m.id = n.makler_id))
$$;
revoke execute on function public._cena_znizena(jsonb) from public, anon, authenticated;

-- formulár na stránke ponuky; ochrana proti robotom rovnaká ako pri webe makléra
-- (skryté pole, výpočtová úloha v prehliadači – adresa je „ponuka-ID“, každé riešenie raz, limity na hodinu)
create or replace function public.ponuka_kontakt(p_id bigint, p_zdroj text, p_kontakt text, p_meno text default null,
                                                  p_co text default null, p_overenie jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  n nehnutelnosti;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_odkial text := _klient_odtlacok();
  v_ts bigint; v_nonce text; v_hash text;
  v_email boolean; v_id bigint; v_dopyt bigint; v_nazov text;
  NAZVY constant jsonb := '{"obhliadka":"Chce obhliadku","kontakt":"Otázka k ponuke","callback":"Zavolať späť","podobna":"Hľadá podobnú"}';
begin
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|ponuka-' || coalesce(p_id, 0) || '|' || coalesce(p_zdroj, '') || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;

  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  select * into n from nehnutelnosti where id = p_id and stav in ('aktivne', 'rezervovane', 'predane');
  if not found or n.makler_id is null or not exists (select 1 from makleri where id = n.makler_id and aktivny) then
    raise exception 'Ponuka už nie je dostupná.' using errcode = '22023';
  end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;
  if p_zdroj = 'callback' and v_email then raise exception 'Na zavolanie napíšte telefónne číslo.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918274, hashtext(n.makler_id::text));
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id is null and makler_id = n.makler_id and vytvorene > now() - interval '1 hour') >= 30 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;

  v_nazov := coalesce(nullif(n.nazov, ''), concat_ws(', ', coalesce(n.typ, 'Nehnuteľnosť'), n.obec));

  -- hľadá podobnú → aj dopyt klienta (rovnaký druh, obec, cena do +15 %), aby ho Týpek ponúkol pri ďalších ponukách
  if p_zdroj = 'podobna' and (select count(*) from web_kontakty where web_id is null and makler_id = n.makler_id and dopyt_id is not null
                                and vytvorene > now() - interval '30 days') < 60 then
    insert into dopyty (kancelaria, makler_id, transakcia, kategorie, obce, okresy, cena_do, popis)
    values (n.kancelaria, n.makler_id, n.transakcia,
            case when n.kategoria is not null then array[n.kategoria] else '{}' end,
            case when n.obec is not null then array[n.obec] else '{}' end, '{}',
            case when n.zobrazit_cenu and n.cena > 0 then round(n.cena * 1.15, -3) end,
            left('Hľadá podobnú ako ' || v_nazov || coalesce(' (č. ' || n.cislo || ')', '') || ' – zo stránky ponuky.' ||
                 case when v_co <> '' then ' ' || v_co else '' end, 1000))
    returning id into v_dopyt;
    insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
    values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (null, n.makler_id, p_zdroj, v_meno, v_kontakt, v_co, n.id, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (n.makler_id, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || coalesce(' (č. ' || n.cislo || ')', '') || ': ' ||
          coalesce(v_meno || ', ', '') || v_kontakt || case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', n.id, v_id);
  return 'ok';
end $$;
revoke execute on function public.ponuka_kontakt(bigint, text, text, text, text, jsonb) from public;
grant execute on function public.ponuka_kontakt(bigint, text, text, text, text, jsonb) to anon, authenticated;

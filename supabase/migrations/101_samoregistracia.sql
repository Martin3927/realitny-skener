-- Samoregistrácia na skúšobnú dobu (rozhodnutia používateľa 3. 11. 2026):
--  * kto vyplní skúšobnú verziu na realitnytypek.sk, dostane e-mail s odkazom „Dokončiť registráciu“ (platí 7 dní);
--    sám si nastaví heslo, telefón, názov kancelárie a najviac 3 okresy skenera – skúšobná doba 14 dní začne hneď
--  * hlavnému správcovi príde upozornenie (zvonček, mobil, e-mail)
--  * maklér vidí len to, čo si objednal (+ kalendár a chat); po skončení skúšobnej doby bez platby sa mu Týpek zamkne
--  * v Správe zákazníkov: kontaktovaný (dátum + poznámka), poslať odkaz na registráciu znova
-- Alpha Reality (vlastná kancelária Týpka) má všetky sekcie bez obmedzenia – pre ňu sa nič nemení.

-- ---------------------------------------------------------------- stĺpce
alter table public.zakaznici
  add column if not exists registracia_hash text,          -- sha256 odkazu z e-mailu (samotný odkaz sa neukladá)
  add column if not exists registracia_do timestamptz,     -- do kedy odkaz platí
  add column if not exists registracia_poslat timestamptz, -- čaká na odoslanie e-mailu s odkazom (od kedy)
  add column if not exists registracia_email timestamptz,  -- kedy naposledy odišiel e-mail s odkazom
  add column if not exists registrovany timestamptz,       -- kedy dokončil registráciu
  add column if not exists kontaktovany timestamptz,       -- kedy ho hlavný správca kontaktoval (ponuka na predĺženie)
  add column if not exists kontakt_poznamka text;
create unique index if not exists zakaznici_registracia_hash on public.zakaznici (registracia_hash) where registracia_hash is not null;

-- sekcie aplikácie, ktoré kancelária má (null = všetky – vlastná kancelária Týpka)
alter table public.kancelarie add column if not exists sekcie text[];

-- nový druh pripomienky: nový zákazník (registrácia) – pre hlavného správcu
alter table public.pripomienky drop constraint if exists pripomienky_druh_chk;
alter table public.pripomienky add constraint pripomienky_druh_chk
  check (druh in ('pripomienka', 'uvolnenie', 'cena', 'zmluva', 'zhoda', 'obhliadka', 'udalost', 'web', 'volat', 'zakaznik'));

-- ---------------------------------------------------------------- sekcie podľa objednaných modulov
-- vždy: kalendár a chat; skener → Realitný skener; osobný web → web, ponuky, recenzie, AI (v cene webu);
-- správa ponúk → ponuky; klienti a AML → klienti; AI → AI asistent;
-- kancelária komplet → všetko okrem schránkovania a Matterportu (tie sú len pre Alpha Reality) a skenera (ten sa objednáva zvlášť)
create or replace function public._sekcie_z_modulov(p_moduly text[])
returns text[] language sql immutable set search_path = public as $$
  select array(select distinct s from unnest(
    array['kalendar', 'chat']
    || case when 'skener' = any(p_moduly) then array['inzeraty'] else '{}'::text[] end
    || case when 'web' = any(p_moduly) then array['web', 'nehnutelnosti', 'recenzie', 'asistent'] else '{}'::text[] end
    || case when 'ponuky' = any(p_moduly) then array['nehnutelnosti'] else '{}'::text[] end
    || case when 'klienti_aml' = any(p_moduly) then array['klienti'] else '{}'::text[] end
    || case when 'ai' = any(p_moduly) then array['asistent'] else '{}'::text[] end
    || case when 'kancelaria' = any(p_moduly)
         then array['nehnutelnosti', 'klienti', 'mapa', 'kataster', 'asistent', 'web', 'recenzie', 'provizie'] else '{}'::text[] end
  ) s order by s)
$$;

-- platí kancelárii prístup? vlastná a platiaca áno, skúšobná do konca skúšobnej doby, ostatné (záujemca, pozastavený, zrušený) nie
create or replace function public._kancelaria_platna(p_kancelaria bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select k.aktivna and case
      when z.id is null then true
      when z.stav in ('vlastna', 'aktivny') then true
      when z.stav = 'skusobna' then z.skusobna_do is null or z.skusobna_do >= (now() at time zone 'Europe/Bratislava')::date
      else false end
    from kancelarie k left join zakaznici z on z.id = k.zakaznik_id
    where k.id = p_kancelaria), false)
$$;
revoke execute on function public._kancelaria_platna(bigint) from public, anon, authenticated;

-- prístup k sekcii: maklér (admin alebo zapnutá sekcia) a kancelária ju má a platí; hlavný správca Týpka bez obmedzenia kancelárie
create or replace function public.ma_pristup(p_sekcia text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from makleri m left join kancelarie k on k.id = m.kancelaria_id
    where m.id = auth.uid() and m.aktivny and (m.rola = 'admin' or p_sekcia = any(m.pristup))
      and (k.id is null
           or exists (select 1 from hlavni_spravcovia h where h.user_id = m.id)
           or (_kancelaria_platna(k.id) and (k.sekcie is null or p_sekcia = any(k.sekcie)))))
$$;
grant execute on function public.ma_pristup(text) to authenticated;

-- licencia prihláseného makléra pre aplikáciu (sekcie, skúšobná doba, zamknutie)
create or replace function public.moja_licencia() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('platna', _kancelaria_platna(k.id), 'typ', k.typ, 'sekcie', to_jsonb(k.sekcie), 'kancelaria', k.nazov,
           'stav', z.stav, 'skusobna_do', z.skusobna_do, 'zaplatene_do', z.zaplatene_do)
  from makleri m join kancelarie k on k.id = m.kancelaria_id left join zakaznici z on z.id = k.zakaznik_id
  where m.id = auth.uid() and m.aktivny
$$;
revoke execute on function public.moja_licencia() from public, anon;
grant execute on function public.moja_licencia() to authenticated;

-- zákazník → kancelária: okresy, počet webov a teraz aj sekcie podľa modulov (vlastná kancelária = všetko)
create or replace function public._zakaznik_okresy_kancelarii()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- okresy: prázdny zoznam sa neprenesie, aby kancelária omylom neprišla o všetky inzeráty
  if cardinality(coalesce(new.okresy, '{}')) > 0 then
    update kancelarie set okresy = new.okresy where zakaznik_id = new.id and okresy is distinct from new.okresy;
  end if;
  update kancelarie set pocet_webov = case when new.stav = 'vlastna' then null else new.pocet_webov end
  where zakaznik_id = new.id
    and pocet_webov is distinct from case when new.stav = 'vlastna' then null else new.pocet_webov end;
  update kancelarie set sekcie = case when new.stav = 'vlastna' then null else _sekcie_z_modulov(new.moduly) end
  where zakaznik_id = new.id
    and sekcie is distinct from case when new.stav = 'vlastna' then null else _sekcie_z_modulov(new.moduly) end;
  return null;
end $$;
drop trigger if exists zakaznik_okresy_kancelarii on public.zakaznici;
create trigger zakaznik_okresy_kancelarii after update of okresy, pocet_webov, stav, moduly on public.zakaznici
  for each row execute function public._zakaznik_okresy_kancelarii();

-- ---------------------------------------------------------------- e-mail s odkazom na registráciu
-- nový záujemca z webu → e-mail s odkazom (posiela funkcia pripomienky, pri chybe skúša znova 3 dni)
create or replace function public._zakaznik_registracia_novy() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(btrim(new.email), '') <> '' then new.registracia_poslat := now(); end if;
  return new;
end $$;
revoke execute on function public._zakaznik_registracia_novy() from public, anon, authenticated;
drop trigger if exists zakaznik_registracia_novy on public.zakaznici;
create trigger zakaznik_registracia_novy before insert on public.zakaznici
  for each row when (new.zdroj = 'web') execute function public._zakaznik_registracia_novy();

-- funkcia pripomienky sa zavolá aj vtedy, keď čaká e-mail s odkazom na registráciu
create or replace function public.odoslat_pripomienky() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  if not exists (select 1 from pripomienky where hotovo is null and zrusena is null and email_odoslany is null and cas <= now())
     and not exists (select 1 from zakaznici where zdroj = 'web' and web_oznamene is null)
     and not exists (select 1 from zakaznici where registracia_poslat > now() - interval '3 days')
     and extract(minute from now())::int % 5 <> 0 then
    return;
  end if;
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  if v_kluc is null then return; end if;
  -- odoslanie e-mailov trvá pár sekúnd – dlhší čas na odpoveď, nech sa beh nezapisuje ako chyba
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/pripomienky',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    timeout_milliseconds := 30000);
end $$;
revoke execute on function public.odoslat_pripomienky() from public, anon, authenticated;

-- hlavný správca: poslať odkaz na registráciu (znova) – starý odkaz prestane platiť
create or replace function public.poslat_registraciu(p_zakaznik bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not je_hlavny_spravca() then raise exception 'Odkaz na registráciu posiela len hlavný správca Týpka.' using errcode = '42501'; end if;
  if exists (select 1 from kancelarie where zakaznik_id = p_zakaznik) then
    raise exception 'Zákazník už má prístup do Realitného týpka.' using errcode = '22023';
  end if;
  update zakaznici set registracia_poslat = now()
   where id = p_zakaznik and registrovany is null and coalesce(btrim(email), '') <> '' and stav not in ('vlastna', 'zruseny');
  if not found then raise exception 'Zákazník nemá e-mail, je zrušený alebo je už zaregistrovaný.' using errcode = '22023'; end if;
  begin
    perform odoslat_pripomienky();
  exception when others then null;   -- e-mail odíde pri najbližšom behu
  end;
end $$;
revoke execute on function public.poslat_registraciu(bigint) from public, anon;
grant execute on function public.poslat_registraciu(bigint) to authenticated;

-- ---------------------------------------------------------------- dokončenie registrácie (volá funkcia registracia so service role)
-- účet v auth.users už vytvorila funkcia registracia; tu vznikne kancelária, maklér (administrátor), skúšobná doba a upozornenie
create or replace function public._registracia_dokoncit(p_hash text, p_user uuid, p_meno text, p_telefon text, p_nazov text, p_okresy text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  z zakaznici;
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  v_tel text := nullif(left(btrim(regexp_replace(coalesce(p_telefon, ''), '[^0-9+ ()/-]', '', 'g')), 30), '');
  v_nazov text;
  v_okr text[] := '{}';
  v_dnes date := (now() at time zone 'Europe/Bratislava')::date;
  v_do date := (now() at time zone 'Europe/Bratislava')::date + 14;
  v_k bigint;
  v_kto uuid[];
  v_text text;
begin
  select * into z from zakaznici
   where registracia_hash = p_hash and registracia_do > now() and registrovany is null and stav not in ('vlastna', 'zruseny')
   for update;
  if not found then raise exception 'neplatny_odkaz' using errcode = '22023'; end if;
  if exists (select 1 from kancelarie where zakaznik_id = z.id) then raise exception 'neplatny_odkaz' using errcode = '22023'; end if;
  if v_meno is null or length(v_meno) < 3 then raise exception 'meno' using errcode = '22023'; end if;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 9 then raise exception 'telefon' using errcode = '22023'; end if;

  -- okresy skenera: len skutočné okresy SR, bez opakovania, v poradí výberu, najviac 3
  if 'skener' = any(z.moduly) then
    select coalesce(array_agg(o order by i), '{}') into v_okr from (
      select distinct on (o) o, i from (select btrim(x) o, i from unnest(coalesce(p_okresy, '{}')) with ordinality u(x, i)) a
      where exists (select 1 from lokality l where l.okres = a.o)
      order by o, i) t;
    if cardinality(v_okr) = 0 then raise exception 'okresy' using errcode = '22023'; end if;
    if cardinality(v_okr) > 3 then raise exception 'okresy_max' using errcode = '22023'; end if;
  end if;

  v_nazov := case when z.typ = 'kancelaria'
                  then coalesce(nullif(left(btrim(regexp_replace(coalesce(p_nazov, ''), '[[:cntrl:]]+', ' ', 'g')), 160), ''),
                                nullif(btrim(z.nazov), ''), v_meno)
                  else v_meno end;

  insert into kancelarie (nazov, typ, zakaznik_id, okresy, sekcie, pocet_webov)
  values (v_nazov, z.typ, z.id, v_okr, _sekcie_z_modulov(z.moduly), z.pocet_webov)
  returning id into v_k;

  insert into makleri (id, meno, email, telefon, rola, aktivny, vidi_podhodnotene, kancelaria_id)
  values (p_user, v_meno, lower(btrim(z.email)), v_tel, 'admin', true, true, v_k);

  -- názov a kontakt kancelárie pre verejné stránky a export
  perform _nk_ulozit('vzhlad', jsonb_build_object('nazov', v_nazov)::text, v_k);
  perform _nk_ulozit('kancelaria', jsonb_build_object('nazov', v_nazov, 'telefon', v_tel, 'email', lower(btrim(z.email)))::text, v_k);

  update zakaznici set
    stav = 'skusobna', skusobna_od = v_dnes, skusobna_do = v_do,
    okresy = case when cardinality(v_okr) > 0 then v_okr else okresy end,
    nazov = case when z.typ = 'kancelaria' then v_nazov else coalesce(nullif(btrim(nazov), ''), v_meno) end,
    kontakt_meno = v_meno, telefon = v_tel,
    registrovany = now(), registracia_hash = null, registracia_do = null, registracia_poslat = null
  where id = z.id;

  -- upozornenie hlavnému správcovi: zvonček + e-mail (pripomienka) a mobil
  select coalesce(array_agg(m.id order by h.vytvorene), '{}') into v_kto
    from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny;
  v_text := case when z.typ = 'kancelaria' then 'Kancelária ' || v_nazov || ' (' || v_meno || ')' else v_meno end
         || ' sa zaregistroval' || case when z.typ = 'kancelaria' then 'a' else '' end
         || ' – skúšobná doba do ' || to_char(v_do, 'FMDD. FMMM. YYYY')
         || case when cardinality(v_okr) > 0 then ' · okresy: ' || array_to_string(v_okr, ', ') else '' end
         || ' · ' || v_tel;
  if cardinality(v_kto) > 0 then
    insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id)
    select k, now(), left('Nová registrácia na skúšobnú dobu: ' || v_text, 500), 'zakaznik', z.id from unnest(v_kto) k;
    begin
      perform _push_zaradit(v_kto, 'kontakty', '🎉 Nová registrácia na skúšobnú dobu', v_text,
                            'sprava.html#z/' || z.id, 'typek-registracia-' || z.id);
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('kancelaria', v_k, 'skusobna_do', v_do, 'email', lower(btrim(z.email)));
end $$;
revoke execute on function public._registracia_dokoncit(text, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public._registracia_dokoncit(text, uuid, text, text, text, text[]) to service_role;

-- ---------------------------------------------------------------- verejný profil makléra s kanceláriou
-- stránky makléra a recenzie ukážu logo, farby a názov jeho kancelárie (nie Alpha Reality)
create or replace function public.verejny_makler(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id, 'meno', m.meno, 'meno_cele', _meno_cele(m.titul_pred, m.meno, m.titul_za),
    'email', m.email, 'telefon', m.telefon, 'pohlavie', m.pohlavie,
    'foto', case when m.foto like 'data:%' then m.foto end,
    'kancelaria_id', m.kancelaria_id, 'kanc', _kancelaria_verejne(m.kancelaria_id))
  from makleri m where m.id = p_id and m.aktivny
$$;
grant execute on function public.verejny_makler(uuid) to anon, authenticated;

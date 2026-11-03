-- =====================================================================
-- Oddelenie kancelárií – 3. krok: skener po kanceláriách
--  * prevzatia, telefóny, označenia „je to RK/súkromník“ a predávajúci (adresár podľa telefónu) má každá
--    kancelária vlastné – kľúč (inzerát/telefón, kancelária); doteraz jeden riadok pre celý Týpek
--  * kancelária vidí len inzeráty zo svojich okresov (kancelarie.okresy) – aj odhady, archív a AI posúdenie
--  * upozornenia na nové inzeráty len maklérom kancelárií, ktoré majú okres
--  * skener_okresy: okresy, ktoré má skener prehľadávať (kancelárie + zákazníci so skenerom v Správe zákazníkov)
-- V funkciách s prihláseným maklérom sa kancelária berie z aktivna_kancelaria() (v režime podpory zvolená kancelária)
-- a zapisovať sa dá len k inzerátom z okresov kancelárie.
-- =====================================================================

-- ---------------------------------------------------------------- kľúče
alter table public.prevzatia drop constraint prevzatia_pkey, add constraint prevzatia_pkey primary key (inzerat_id, kancelaria_id);
alter table public.telefony drop constraint telefony_pkey, add constraint telefony_pkey primary key (inzerat_id, kancelaria_id);
alter table public.oznacenia drop constraint oznacenia_pkey, add constraint oznacenia_pkey primary key (inzerat_id, kancelaria_id);
alter table public.predajcovia drop constraint predajcovia_pkey, add constraint predajcovia_pkey primary key (telefon, kancelaria_id);

-- ---------------------------------------------------------------- okresy
create or replace function public.moje_okresy()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select okresy from kancelarie where id = aktivna_kancelaria()), '{}')
$$;
revoke execute on function public.moje_okresy() from public, anon;
grant execute on function public.moje_okresy() to authenticated, service_role;

-- okresy aktívnych kancelárií a zákazníkov so skenerom (platiaci alebo skúšobná doba, ktorá neskončila pred viac ako 7 dňami)
create or replace function public._skener_okresy()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct o order by o), '{}') from (
    select unnest(okresy) o from kancelarie where aktivna
    union all
    select unnest(okresy) from zakaznici
    where 'skener' = any(moduly)
      and (stav = 'aktivny' or (stav = 'skusobna' and coalesce(skusobna_do, current_date) >= current_date - 7))
  ) x where nullif(trim(o), '') is not null
$$;
revoke execute on function public._skener_okresy() from public, anon, authenticated;
grant execute on function public._skener_okresy() to service_role;

create or replace function public.skener_okresy(p_kluc text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return to_jsonb(_skener_okresy());
end $$;
revoke execute on function public.skener_okresy(text) from public, authenticated;
grant execute on function public.skener_okresy(text) to anon, service_role;

-- čítanie: len inzeráty z okresov kancelárie (inzeraty_zoznam a zmeny_inzeratov bežia s právami makléra – filter dostanú samé)
do $$ begin
  create policy kancelaria_okresy on public.inzeraty as restrictive for select to authenticated
    using (okres in (select unnest(moje_okresy())));
exception when duplicate_object then null; end $$;
do $$
declare t text;
begin
  foreach t in array array['odhady', 'archiv', 'inzeraty_ai'] loop
    begin
      execute format('create policy kancelaria_okresy on public.%I as restrictive for select to authenticated
        using (exists (select 1 from inzeraty i where i.id = inzerat_id and i.okres in (select unnest(moje_okresy()))))', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------- telefóny predajcov
-- číslo zadané maklérom kancelárie má prednosť pred číslom z textu inzerátu (archív je spoločný pre celý Týpek)
drop function if exists public._telefony_inzeratov();
create or replace function public._telefony_inzeratov(p_kancelaria bigint default null)
 returns table(inzerat_id text, tel text, zobraz text, zdroj text)
 language sql stable security definer set search_path = public as $$
  with k as (select coalesce(p_kancelaria, aktivna_kancelaria()) as id)
  select x.inzerat_id, _tel_norm(c), trim(c), x.zdroj
  from (
    select t.inzerat_id, t.telefon, 'makler'::text as zdroj from telefony t, k where t.kancelaria_id = k.id and trim(t.telefon) <> ''
    union all
    select a.inzerat_id, a.telefon, 'text' from archiv a, k
     where coalesce(trim(a.telefon), '') <> ''
       and not exists (select 1 from telefony t where t.inzerat_id = a.inzerat_id and t.kancelaria_id = k.id)
  ) x
  cross join lateral regexp_split_to_table(x.telefon, '\s*[,;]\s*') c
  where _tel_norm(c) is not null
$$;
revoke execute on function public._telefony_inzeratov(bigint) from public, anon, authenticated;
grant execute on function public._telefony_inzeratov(bigint) to service_role;

-- koľkokrát po sebe predajca nedvíhal – len hovory kancelárie
drop function if exists public._pokusy_nedviha(text, timestamptz);
create or replace function public._pokusy_nedviha(p_inzerat text, p_do timestamptz default now(), p_kancelaria bigint default null)
 returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from aktivity a
  where a.inzerat_id = p_inzerat and a.typ = 'hovor' and a.vysledok = 'Nedvíha' and a.vytvorene <= p_do
    and (p_kancelaria is null or a.kancelaria_id = p_kancelaria)
    and a.vytvorene > coalesce((select max(b.vytvorene) from aktivity b where b.inzerat_id = p_inzerat and b.typ = 'hovor'
                                and (p_kancelaria is null or b.kancelaria_id = p_kancelaria)
                                and b.vysledok <> 'Nedvíha' and b.vytvorene <= p_do), '-infinity')
$$;
revoke execute on function public._pokusy_nedviha(text, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public._pokusy_nedviha(text, timestamptz, bigint) to service_role;

create or replace function public._oznacit_telefon_rk(p_tel text, p_rk boolean)
 returns integer language plpgsql security definer set search_path = public as $$
declare v_ids text[]; n int; k bigint := aktivna_kancelaria();
begin
  select coalesce(array_agg(distinct inzerat_id), '{}') into v_ids from _telefony_inzeratov(k) where tel = p_tel;
  n := cardinality(v_ids);
  if p_rk then
    insert into predajcovia (telefon, kancelaria_id, rk, rk_oznacil, rk_oznacene, upravil, upravene)
    values (p_tel, k, true, auth.uid(), now(), auth.uid(), now())
    on conflict (telefon, kancelaria_id) do update set rk = true, rk_oznacil = auth.uid(), rk_oznacene = now();
    insert into oznacenia (inzerat_id, kancelaria_id, predajca_typ, oznacil, oznacene)
    select x, k, 'rk', auth.uid(), now() from unnest(v_ids) x
    on conflict (inzerat_id, kancelaria_id) do update set predajca_typ = 'rk', oznacil = auth.uid(), oznacene = now();
  else
    update predajcovia set rk = false, rk_oznacil = null, rk_oznacene = null where telefon = p_tel and kancelaria_id = k;
    delete from predajcovia where telefon = p_tel and kancelaria_id = k and not rk and not nevolat and meno is null and poznamka is null and makler_id is null;
    delete from oznacenia where predajca_typ = 'rk' and kancelaria_id = k and inzerat_id = any(v_ids);
  end if;
  return n;
end $$;

-- telefón predajcu, ktorý kancelária vedie ako RK → inzerát sa v kancelárii označí ako RK
-- (spúšťač na telefony: číslo zadané v kancelárii; na archiv: číslo z textu inzerátu – každá kancelária, ktorá ho vedie
--  ako RK a nemá k inzerátu vlastné číslo)
create or replace function public._rk_podla_telefonu()
 returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'telefony' then
    insert into oznacenia (inzerat_id, kancelaria_id, predajca_typ, oznacil, oznacene)
    select new.inzerat_id, new.kancelaria_id, 'rk', p.rk_oznacil, now()
    from regexp_split_to_table(coalesce(new.telefon, ''), '\s*[,;]\s*') c
    join predajcovia p on p.telefon = _tel_norm(c) and p.rk and p.kancelaria_id = new.kancelaria_id
    limit 1
    on conflict (inzerat_id, kancelaria_id) do update set predajca_typ = 'rk', oznacil = excluded.oznacil, oznacene = now()
      where oznacenia.predajca_typ is null;
  else
    insert into oznacenia (inzerat_id, kancelaria_id, predajca_typ, oznacil, oznacene)
    select distinct on (p.kancelaria_id) new.inzerat_id, p.kancelaria_id, 'rk', p.rk_oznacil, now()
    from regexp_split_to_table(coalesce(new.telefon, ''), '\s*[,;]\s*') c
    join predajcovia p on p.telefon = _tel_norm(c) and p.rk
    where not exists (select 1 from telefony t where t.inzerat_id = new.inzerat_id and t.kancelaria_id = p.kancelaria_id)
    on conflict (inzerat_id, kancelaria_id) do update set predajca_typ = 'rk', oznacil = excluded.oznacil, oznacene = now()
      where oznacenia.predajca_typ is null;
  end if;
  return null;
end $$;

create or replace function public.ulozit_telefon(p_inzerat text, p_telefon text)
 returns void language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_telefon, '')); k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat and okres = any(moje_okresy())) then raise exception 'Inzerát neexistuje.'; end if;
  if v <> '' and length(regexp_replace(v, '\D', '', 'g')) < 9 then
    raise exception 'Telefónne číslo musí mať aspoň 9 číslic.';
  end if;
  insert into telefony (inzerat_id, kancelaria_id, telefon, zadal, zadane) values (p_inzerat, k, v, auth.uid(), now())
  on conflict (inzerat_id, kancelaria_id) do update set telefon = excluded.telefon, zadal = excluded.zadal, zadane = now();
end $$;

-- vymazanie predajcu: číslo sa skryje v kancelárii (prázdny telefón prekryje číslo z textu inzerátu);
-- spoločný archív inzerátov ostáva – ostatné kancelárie to neovplyvní
create or replace function public.vymazat_predajcu(p_telefon text)
 returns integer language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon); v_ids text[]; n int; k bigint := aktivna_kancelaria();
begin
  perform _over_admin();
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  select array_agg(distinct inzerat_id) into v_ids from _telefony_inzeratov(k) where tel = v_tel;
  n := coalesce(cardinality(v_ids), 0);
  if n > 0 then
    insert into telefony (inzerat_id, kancelaria_id, telefon, zadal, zadane) select x, k, '', auth.uid(), now() from unnest(v_ids) x
    on conflict (inzerat_id, kancelaria_id) do update set telefon = '', zadal = auth.uid(), zadane = now();
  end if;
  delete from predajcovia where telefon = v_tel and kancelaria_id = k;
  return n;
end $$;

create or replace function public.priradit_predajcu(p_telefon text, p_makler uuid)
 returns void language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon); v_teraz uuid; k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  select makler_id into v_teraz from predajcovia where telefon = v_tel and kancelaria_id = k;
  if not ja_admin() then
    if p_makler is not null and p_makler <> auth.uid() then raise exception 'Predávajúceho môžete priradiť len sebe.'; end if;
    if p_makler is null and v_teraz is distinct from auth.uid() then raise exception 'Zrušiť môžete len svoje priradenie.'; end if;
    if p_makler is not null and v_teraz is not null and v_teraz <> auth.uid() then
      raise exception 'Predávajúci už patrí maklérovi %.', _meno(v_teraz);
    end if;
  end if;
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler and kancelaria_id = k) then raise exception 'Maklér neexistuje.'; end if;
  insert into predajcovia (telefon, kancelaria_id, makler_id, upravil, upravene) values (v_tel, k, p_makler, auth.uid(), now())
  on conflict (telefon, kancelaria_id) do update set makler_id = excluded.makler_id, upravil = excluded.upravil, upravene = now();
  delete from predajcovia where telefon = v_tel and kancelaria_id = k and not rk and not nevolat and meno is null and poznamka is null and makler_id is null;
end $$;

create or replace function public.ulozit_predajcu(p_telefon text, p_meno text, p_poznamka text, p_nevolat boolean)
 returns void language plpgsql security definer set search_path = public as $$
declare v_tel text := _tel_norm(p_telefon); k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  if v_tel is null then raise exception 'Neplatné telefónne číslo.'; end if;
  if length(coalesce(p_meno, '')) > 120 then raise exception 'Meno je príliš dlhé.'; end if;
  if length(coalesce(p_poznamka, '')) > 2000 then raise exception 'Poznámka je príliš dlhá.'; end if;
  insert into predajcovia (telefon, kancelaria_id, meno, poznamka, nevolat, upravil, upravene)
  values (v_tel, k, nullif(trim(p_meno), ''), nullif(trim(p_poznamka), ''), coalesce(p_nevolat, false), auth.uid(), now())
  on conflict (telefon, kancelaria_id) do update set meno = excluded.meno, poznamka = excluded.poznamka, nevolat = excluded.nevolat,
    upravil = excluded.upravil, upravene = now();
  delete from predajcovia where telefon = v_tel and kancelaria_id = k and not rk and not nevolat and meno is null and poznamka is null and makler_id is null;
end $$;

create or replace function public.oznacit_predajcu(p_inzerat text, p_typ text)
 returns void language plpgsql security definer set search_path = public as $$
declare v_tel text; k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if p_typ is not null and p_typ not in ('rk', 'sukromny') then raise exception 'Neplatné označenie.'; end if;
  if not exists (select 1 from inzeraty where id = p_inzerat and okres = any(moje_okresy())) then raise exception 'Inzerát neexistuje.'; end if;
  insert into oznacenia (inzerat_id, kancelaria_id, predajca_typ, oznacil, oznacene) values (p_inzerat, k, p_typ, auth.uid(), now())
  on conflict (inzerat_id, kancelaria_id) do update set predajca_typ = excluded.predajca_typ, oznacil = excluded.oznacil, oznacene = now();
  for v_tel in select distinct tel from _telefony_inzeratov(k) where inzerat_id = p_inzerat loop
    if p_typ = 'rk' then
      perform _oznacit_telefon_rk(v_tel, true);
    elsif p_typ is null and exists (select 1 from predajcovia where telefon = v_tel and kancelaria_id = k and rk) then
      perform _oznacit_telefon_rk(v_tel, false);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- prevzatia
create or replace function public.prevziat(p_inzerat text)
 returns void language plpgsql security definer set search_path = public as $$
declare v_majitel uuid; k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat and okres = any(moje_okresy())) then
    raise exception 'Inzerát neexistuje.';
  end if;
  insert into prevzatia (inzerat_id, kancelaria_id) values (p_inzerat, k) on conflict do nothing;
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  if v_majitel is not null and v_majitel <> auth.uid() then
    raise exception 'Inzerát už má prevzatý %.', _meno(v_majitel);
  end if;
  if v_majitel is null then
    update prevzatia set makler_id = auth.uid(), prevzate = now(), upravene = now() where inzerat_id = p_inzerat and kancelaria_id = k;
    insert into aktivity (inzerat_id, makler_id, typ, kancelaria_id) values (p_inzerat, auth.uid(), 'prevzatie', k);
  end if;
end $$;

create or replace function public.prevziat_ak_volny(p_inzerat text)
 returns void language plpgsql security definer set search_path = public as $$
declare k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  if not exists (select 1 from inzeraty where id = p_inzerat and okres = any(moje_okresy())) then
    raise exception 'Inzerát neexistuje.';
  end if;
  insert into prevzatia (inzerat_id, kancelaria_id) values (p_inzerat, k) on conflict do nothing;
  if exists (select 1 from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k and makler_id is null) then
    perform prevziat(p_inzerat);
  end if;
end $$;

create or replace function public._moj_alebo_prevezmi(p_inzerat text)
 returns void language plpgsql security definer set search_path = public as $$
declare v_majitel uuid;
begin
  perform prevziat_ak_volny(p_inzerat);
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = aktivna_kancelaria() for update;
  if v_majitel is not null and v_majitel <> auth.uid() and not ja_admin() then
    raise exception 'Inzerát má prevzatý %. Zapisovať môže len on alebo administrátor.', _meno(v_majitel);
  end if;
end $$;

create or replace function public.uvolnit(p_inzerat text)
 returns void language plpgsql security definer set search_path = public as $$
declare v_majitel uuid; k bigint := aktivna_kancelaria();
begin
  perform _over_aktivny();
  select makler_id into v_majitel from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  if v_majitel is null then return; end if;
  if v_majitel <> auth.uid() and not ja_admin() then
    raise exception 'Uvoľniť môže len %, alebo administrátor.', _meno(v_majitel);
  end if;
  update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'uvolnenie', 'od: ' || _meno(v_majitel), k);
end $$;

create or replace function public.presunut(p_inzerat text, p_makler uuid)
 returns void language plpgsql security definer set search_path = public as $$
declare v_povodny uuid; k bigint := aktivna_kancelaria();
begin
  perform _over_admin();
  if p_makler is not null and not exists (select 1 from makleri where id = p_makler and aktivny and kancelaria_id = k) then
    raise exception 'Maklér neexistuje alebo nie je aktívny.';
  end if;
  insert into prevzatia (inzerat_id, kancelaria_id) values (p_inzerat, k) on conflict do nothing;
  select makler_id into v_povodny from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k for update;
  update prevzatia set makler_id = p_makler, prevzate = case when p_makler is null then null else now() end,
    upravene = now() where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'presun',
            coalesce(_meno(v_povodny), 'voľný') || ' → ' || coalesce(_meno(p_makler), 'voľný'), k);
end $$;

create or replace function public.oznacit_kontakt(p_inzerat text, p_typ text, p_stav boolean)
 returns void language plpgsql security definer set search_path = public as $$
declare k bigint := aktivna_kancelaria();
begin
  if p_typ not in ('sms', 'email') then raise exception 'Neznámy typ.'; end if;
  perform _moj_alebo_prevezmi(p_inzerat);
  if p_typ = 'sms' then
    update prevzatia set sms = case when p_stav then now() end, sms_kto = case when p_stav then auth.uid() end,
      upravene = now() where inzerat_id = p_inzerat and kancelaria_id = k;
  else
    update prevzatia set email = case when p_stav then now() end, email_kto = case when p_stav then auth.uid() end,
      upravene = now() where inzerat_id = p_inzerat and kancelaria_id = k;
  end if;
  insert into aktivity (inzerat_id, makler_id, typ, kancelaria_id)
    values (p_inzerat, auth.uid(), case when p_stav then p_typ when p_typ = 'sms' then 'sms_zrusena' else 'email_zruseny' end, k);
end $$;

create or replace function public.zapisat_hovor(p_inzerat text, p_vysledok text, p_poznamka text)
 returns jsonb language plpgsql security definer set search_path = public as $$
declare m makleri; z inzeraty; v_nehn text; v_cas timestamptz; v_pokus int; v_ma uuid; k bigint := aktivna_kancelaria();
begin
  perform _moj_alebo_prevezmi(p_inzerat);
  -- komu inzerát patrí (admin môže zapísať hovor za makléra, ktorému ho pridelil)
  select makler_id into v_ma from prevzatia where inzerat_id = p_inzerat and kancelaria_id = k;
  v_ma := coalesce(v_ma, auth.uid());
  if coalesce(trim(p_vysledok), '') = '' then
    raise exception 'Vyberte, ako dopadol hovor.';
  end if;
  update prevzatia set posledny_vysledok = p_vysledok, posledna_poznamka = nullif(trim(p_poznamka), ''),
    posledny_hovor = now(), pocet_hovorov = pocet_hovorov + 1, upravene = now()
  where inzerat_id = p_inzerat and kancelaria_id = k;
  insert into aktivity (inzerat_id, makler_id, typ, vysledok, poznamka, kancelaria_id)
    values (p_inzerat, auth.uid(), 'hovor', p_vysledok, nullif(trim(p_poznamka), ''), k);
  -- nový hovor → staršie „Znova zavolať“ k tomuto inzerátu už netreba (len v tejto kancelárii)
  update pripomienky set zrusena = now()
  where inzerat_id = p_inzerat and druh = 'volat' and hotovo is null and zrusena is null and kancelaria_id = k;
  select * into z from inzeraty where id = p_inzerat;
  if p_vysledok = 'Nedvíha' then
    v_cas := _cas_volat_znova(now());
    v_pokus := _pokusy_nedviha(p_inzerat, now(), k);
    insert into pripomienky (makler_id, vytvoril, inzerat_id, cas, poznamka, druh, email_odoslany, kancelaria_id)
    values (v_ma, auth.uid(), p_inzerat, v_cas,
            left('Znova zavolať: ' || coalesce(_nazov_inzeratu(z), 'inzerát') || ' – predajca nedvíhal (' ||
                 to_char(now() at time zone 'Europe/Bratislava', 'FMDD. FMMM. "o" HH24:MI') || ', ' || v_pokus || '. pokus)', 500),
            'volat', now(), k);   -- e-mail sa pri tejto pripomienke neposiela
    return jsonb_build_object('volat_znova', v_cas, 'pokus', v_pokus);
  end if;
  if p_vysledok = 'Získaný do ponuky' then
    select * into m from makleri where id = v_ma;
    v_nehn := case z.typ when 'byt' then coalesce(z.izby || '-izbový byt', 'byt') when 'dom' then 'rodinný dom' when 'pozemok' then 'pozemok'
                         when 'chata' then 'chatu' when 'garaz' then 'garáž' else 'nehnuteľnosť' end;
    insert into spravy (makler_id, text, typ, kluc, kancelaria_id)
    values (null, '🎉 ' || _osl(m) || case when _rod(m) = 'zena' then ' získala' else ' získal' end || ' do ponuky ' || v_nehn ||
                  coalesce(', ' || nullif(z.obec, ''), '') || '! Gratulujeme 👏', 'uspech', 'uspech:' || p_inzerat || ':' || v_ma, k)
    on conflict do nothing;
  end if;
  return '{}'::jsonb;
end $$;

-- ---------------------------------------------------------------- plánovač a spúšťače (bez prihláseného makléra)
-- znížená cena → pripomienka každému maklérovi, ktorý inzerát drží (v ktorejkoľvek kancelárii)
create or replace function public._znizena_cena()
 returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cena is null or old.cena is null or old.cena <= 0 or new.cena >= old.cena * 0.995 then return new; end if;
  insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
  select p.makler_id, new.id, now(),
         'Znížená cena z ' || _eur(old.cena) || ' na ' || _eur(new.cena) ||
         ' (−' || round((1 - new.cena::numeric / old.cena) * 100) || ' %): ' || left(new.nazov, 90), 'cena', p.kancelaria_id
  from prevzatia p where p.inzerat_id = new.id and p.makler_id is not null;
  return new;
end $$;

create or replace function public.auto_uvolnit()
 returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.inzerat_id, p.makler_id, p.kancelaria_id, i.nazov
    from prevzatia p join inzeraty i on i.id = p.inzerat_id
    where p.makler_id is not null
      and p.upravene < now() - interval '24 hours'
      and coalesce(p.posledny_vysledok, '') not in ('Záujem – stretnutie dohodnuté', 'Získaný do ponuky')
      and not exists (select 1 from pripomienky x
                      where x.inzerat_id = p.inzerat_id and x.makler_id = p.makler_id and x.druh = 'pripomienka'
                        and x.hotovo is null and x.zrusena is null and x.cas > now())
    for update of p skip locked
  loop
    update prevzatia set makler_id = null, prevzate = null, upravene = now() where inzerat_id = r.inzerat_id and kancelaria_id = r.kancelaria_id;
    insert into aktivity (inzerat_id, makler_id, typ, poznamka, kancelaria_id)
      values (r.inzerat_id, r.makler_id, 'uvolnenie', 'automaticky – 24 hodín bez zápisu', r.kancelaria_id);
    insert into pripomienky (makler_id, inzerat_id, cas, poznamka, druh, kancelaria_id)
      values (r.makler_id, r.inzerat_id, now(),
              'Inzerát sa automaticky uvoľnil – 24 hodín ste pri ňom nič nezapísali: ' || left(r.nazov, 90) ||
              '. Ak ho chcete, prevezmite si ho znova.', 'uvolnenie', r.kancelaria_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- skener (archív, obnova, upozornenia)
-- súkromný = niektorá kancelária ho označila ako súkromný, inak RK podľa označenia, inak podľa skenera;
-- prevzatý alebo volaný v ktorejkoľvek kancelárii → archív stiahne aj fotky
create or replace function public.skener_na_archiv(p_kluc text, p_pocet integer default 40)
 returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_vzor text := _vzor_kancelarie();
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(y) from (
      select x.id, x.portal, x.url,
        (x.sukr or x.prevzaty or x.volany or (v_vzor is not null and x.predajca ilike v_vzor)) as fotky,
        x.sukr as sukromny
      from (
        select i.id, i.portal, i.url, i.predajca, i.duplikat_z, i.prvy_krat,
          coalesce(case when o.s then 'sukromny' when o.r then 'rk' end, i.predajca_typ) <> 'rk' as sukr,
          coalesce(p.prevzaty, false) as prevzaty, coalesce(p.hovory, 0) > 0 as volany
        from inzeraty i
        left join lateral (select bool_or(predajca_typ = 'sukromny') s, bool_or(predajca_typ = 'rk') r
                           from oznacenia where inzerat_id = i.id) o on true
        left join lateral (select bool_or(makler_id is not null) prevzaty, max(pocet_hovorov) hovory
                           from prevzatia where inzerat_id = i.id) p on true
        where i.aktivny and i.url is not null
      ) x
      left join archiv a on a.inzerat_id = x.id
      where a.inzerat_id is null
         or (cardinality(a.fotky) = 0 and cardinality(a.fotky_portal) > 0 and coalesce(a.aktualizovane, a.ulozene) < now() - interval '6 hours'
             and (x.sukr or x.prevzaty or (v_vzor is not null and x.predajca ilike v_vzor and x.duplikat_z is null)))
      order by (a.inzerat_id is null) desc,
               (x.sukr or x.prevzaty or (v_vzor is not null and x.predajca ilike v_vzor)) desc, x.prvy_krat desc
      limit p_pocet
    ) y), '[]'::jsonb);
end $$;

create or replace function public.skener_na_obnovu(p_kluc text, p_pocet integer default 150)
 returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_skener(p_kluc);
  return coalesce((
    select jsonb_agg(x) from (
      select i.id, i.portal, i.url, cardinality(coalesce(a.fotky, '{}')) = 0 as fotky
      from inzeraty i
      join archiv a on a.inzerat_id = i.id
      left join lateral (select bool_or(predajca_typ = 'sukromny') s, bool_or(predajca_typ = 'rk') r
                         from oznacenia where inzerat_id = i.id) o on true
      left join lateral (select bool_or(makler_id is not null) prevzaty from prevzatia where inzerat_id = i.id) p on true
      where i.aktivny and i.url is not null
        and (coalesce(case when o.s then 'sukromny' when o.r then 'rk' end, i.predajca_typ) <> 'rk' or coalesce(p.prevzaty, false))
        and coalesce(a.aktualizovane, a.ulozene) < now() - interval '20 hours'
      order by coalesce(a.aktualizovane, a.ulozene)
      limit p_pocet
    ) x), '[]'::jsonb);
end $$;

-- nový súkromný inzerát → upozornenie maklérom kancelárií, ktoré majú jeho okres; označenie RK a telefóny
-- „RK / nevolať“ sa berú z kancelárie makléra
create or replace function public.skener_push_ciele(p_kluc text, p_ids text[])
 returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_skener(p_kluc);
  with i as (
    select z.* from inzeraty z
    where z.id = any(p_ids) and z.aktivny and z.duplikat_z is null
      and z.prvy_krat > now() - interval '1 day'
      and (z.publikovane is null or z.publikovane >= current_date - 3)
  ), blok as (
    select distinct k.id as kancelaria_id, t.inzerat_id
    from kancelarie k cross join lateral _telefony_inzeratov(k.id) t
    join predajcovia p on p.telefon = t.tel and p.kancelaria_id = k.id and (p.rk or p.nevolat)
    where k.aktivna and t.inzerat_id = any(p_ids)
  ), ciel as (
    select i.id as inzerat_id, m.id as makler_id
    from i join makleri m on m.aktivny and (m.rola = 'admin' or 'inzeraty' = any(m.pristup))
                         and _chce_upozornenie(m.upozornenia, 'inzeraty')
    join kancelarie k on k.id = m.kancelaria_id and k.aktivna and i.okres = any(k.okresy)
    left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = m.kancelaria_id
    where coalesce(o.predajca_typ, i.predajca_typ, 'sukromny') <> 'rk'
      and not exists (select 1 from blok b where b.inzerat_id = i.id and b.kancelaria_id = m.kancelaria_id)
      and exists (select 1 from push_odbery s where s.makler_id = m.id)
      and (cardinality(coalesce(m.obce, '{}')) = 0
           or i.obec = any(m.obce)
           or (i.obec is null and exists (select 1 from lokality l where l.nazov = any(m.obce) and l.okres = i.okres)))
      and not exists (select 1 from push_odoslane x where x.inzerat_id = i.id and x.makler_id = m.id)
  ), zapis as (
    insert into push_odoslane (inzerat_id, makler_id) select inzerat_id, makler_id from ciel
    on conflict do nothing returning inzerat_id, makler_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'inzerat', jsonb_build_object('id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres,
                                    'cena', i.cena, 'plocha', i.plocha, 'portal', i.portal),
      'odbery', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                 from zapis z join push_odbery s on s.makler_id = z.makler_id where z.inzerat_id = i.id))), '[]'::jsonb)
    into v
  from i where exists (select 1 from zapis z where z.inzerat_id = i.id);
  return v;
end $$;

create or replace function public.skener_push_ciele_obnovene(p_kluc text, p_ids text[])
 returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_skener(p_kluc);
  with i as (
    select z.*, 'obnova:' || z.id || ':' || to_char(z.obnovene at time zone 'Europe/Bratislava', 'YYYY-MM-DD') as kluc
    from inzeraty z
    where z.id = any(p_ids) and z.aktivny and z.duplikat_z is null
      and z.obnovene > now() - interval '1 day'
  ), blok as (
    select distinct k.id as kancelaria_id, t.inzerat_id
    from kancelarie k cross join lateral _telefony_inzeratov(k.id) t
    join predajcovia p on p.telefon = t.tel and p.kancelaria_id = k.id and (p.rk or p.nevolat)
    where k.aktivna and t.inzerat_id = any(p_ids)
  ), ciel as (
    select i.id as inzerat_id, i.kluc, m.id as makler_id
    from i join makleri m on m.aktivny and (m.rola = 'admin' or 'inzeraty' = any(m.pristup))
                         and _chce_upozornenie(m.upozornenia, 'inzeraty')
    join kancelarie k on k.id = m.kancelaria_id and k.aktivna and i.okres = any(k.okresy)
    left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = m.kancelaria_id
    where coalesce(o.predajca_typ, i.predajca_typ, 'sukromny') <> 'rk'
      and not exists (select 1 from blok b where b.inzerat_id = i.id and b.kancelaria_id = m.kancelaria_id)
      and exists (select 1 from push_odbery s where s.makler_id = m.id)
      and (cardinality(coalesce(m.obce, '{}')) = 0
           or i.obec = any(m.obce)
           or (i.obec is null and exists (select 1 from lokality l where l.nazov = any(m.obce) and l.okres = i.okres)))
      and not exists (select 1 from push_odoslane x where x.inzerat_id = i.kluc and x.makler_id = m.id)
  ), zapis as (
    insert into push_odoslane (inzerat_id, makler_id) select kluc, makler_id from ciel
    on conflict do nothing returning inzerat_id, makler_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'inzerat', jsonb_build_object('id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres,
                                    'cena', i.cena, 'plocha', i.plocha, 'portal', i.portal, 'historia_cien', i.historia_cien),
      'odbery', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                 from zapis z join push_odbery s on s.makler_id = z.makler_id where z.inzerat_id = i.kluc))), '[]'::jsonb)
    into v
  from i where exists (select 1 from zapis z where z.inzerat_id = i.kluc);
  return v;
end $$;

-- ---------------------------------------------------------------- upravené z doterajších definícií (len vyznačené miesta)

-- „Znova zavolať“: prevzatie a počet pokusov v kancelárii pripomienky
CREATE OR REPLACE FUNCTION public._volat_znova()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; n int := 0; v_vcera boolean; v_txt text;
begin
  if not pg_try_advisory_xact_lock(510071) then return 0; end if;
  for p in
    select r.*, z.cena, _nazov_inzeratu(z) as nazov,
           exists (select 1 from prevzatia v where v.inzerat_id = r.inzerat_id and v.makler_id = r.makler_id
                   and v.kancelaria_id = r.kancelaria_id) as stale_moj
    from pripomienky r join inzeraty z on z.id = r.inzerat_id
    where r.druh = 'volat' and r.hotovo is null and r.zrusena is null and r.push_odoslany is null
      and r.cas <= now() and r.cas > now() - interval '12 hours'
    order by r.cas limit 100
  loop
    if not p.stale_moj then   -- inzerát sa uvoľnil alebo ho prevzal iný maklér
      update pripomienky set zrusena = now() where id = p.id;
      continue;
    end if;
    v_vcera := (p.vytvorene at time zone 'Europe/Bratislava')::date < (now() at time zone 'Europe/Bratislava')::date;
    v_txt := coalesce(p.nazov, 'Inzerát') || coalesce(' · ' || replace(to_char(p.cena, 'FM999,999,999'), ',', ' ') || ' €', '') || E'\n' ||
      case when v_vcera
        then 'Dobré ráno! Predajca včera o ' || to_char(p.vytvorene at time zone 'Europe/Bratislava', 'HH24:MI') || ' nedvíhal – skús mu zavolať teraz.'
        else 'Predajca o ' || to_char(p.vytvorene at time zone 'Europe/Bratislava', 'HH24:MI') || ' nedvíhal – teraz je dobrý čas skúsiť to znova.' end ||
      case when _pokusy_nedviha(p.inzerat_id, p.vytvorene, p.kancelaria_id) >= 2 then ' Ak nedvíha ani teraz, pošli SMS.' else '' end;
    perform _push_zaradit(array[p.makler_id], 'pripomienky', '📞 Skús znova zavolať', v_txt, './#inzeraty/' || p.inzerat_id,
                          'typek-volat-' || p.inzerat_id);
    update pripomienky set push_odoslany = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

-- výkon: označenia len aktívnej kancelárie (inak by sa inzerát s označeniami viacerých kancelárií rátal viackrát; zvyšok v 2. kroku b)
CREATE OR REPLACE FUNCTION public._vykon(p_od timestamp with time zone, p_do timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'od', p_od, 'do', p_do,
    'nove_sukromne', (select count(*) from inzeraty i left join oznacenia o on o.inzerat_id = i.id and o.kancelaria_id = coalesce(aktivna_kancelaria(), 1)
                      where i.prvy_krat >= p_od and i.prvy_krat < p_do and i.duplikat_z is null
                        and coalesce(o.predajca_typ, i.predajca_typ) <> 'rk'),
    'makleri', coalesce((
      select jsonb_agg(r order by r->>'meno') from (
        select jsonb_build_object(
          'id', m.id, 'meno', coalesce(nullif(m.meno, ''), m.email), 'aktivny', m.aktivny, 'rola', m.rola,
          'prevzate', count(a.id) filter (where a.typ = 'prevzatie'),
          'hovory', count(a.id) filter (where a.typ = 'hovor'),
          'sms', count(a.id) filter (where a.typ = 'sms'),
          'emaily', count(a.id) filter (where a.typ = 'email'),
          'uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and coalesce(a.poznamka, '') not like 'automaticky%'),
          'auto_uvolnene', count(a.id) filter (where a.typ = 'uvolnenie' and a.poznamka like 'automaticky%'),
          'vysledky', coalesce((select jsonb_object_agg(v.vysledok, v.n) from (
                         select coalesce(vysledok, 'Iné') vysledok, count(*) n from aktivity
                         where makler_id = m.id and typ = 'hovor' and vytvorene >= p_od and vytvorene < p_do
                         group by 1) v), '{}'::jsonb),
          'schrankovanie', (select count(*) from schrankovanie s
                            where s.vytvoril = m.id and s.vytvorene >= p_od and s.vytvorene < p_do),
          'drzi', (select count(*) from prevzatia p where p.makler_id = m.id),
          'posledna', max(a.vytvorene)
        ) r
        from makleri m
        left join aktivity a on a.makler_id = m.id and a.vytvorene >= p_od and a.vytvorene < p_do
        group by m.id
      ) x), '[]'::jsonb)
  )
$function$;

-- adresár predávajúcich: telefóny, označenia, prevzatia, hovory a ponuky len z kancelárie, inzeráty len z jej okresov
CREATE OR REPLACE FUNCTION public.kontakty_predajcov()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k bigint := aktivna_kancelaria(); v_okresy text[] := moje_okresy();
begin
  perform _over_aktivny();
  if not ma_pristup('inzeraty') then raise exception 'Nemáte prístup k Realitnému skeneru.'; end if;
  return coalesce((
    with t as (
      select distinct on (ti.inzerat_id, ti.tel) ti.* from _telefony_inzeratov(k) ti
    ), i as (
      select t.tel, t.zobraz, t.zdroj, z.*, coalesce(o.predajca_typ, z.predajca_typ, 'sukromny') as ptyp,
             p.makler_id as prevzal, p.posledny_vysledok,
             (select n.id from nehnutelnosti n where n.zdroj_inzerat = z.id and n.kancelaria_id = k order by n.id desc limit 1) as nehnutelnost_id
      from t join inzeraty z on z.id = t.inzerat_id and z.okres = any(v_okresy)
      left join oznacenia o on o.inzerat_id = z.id and o.kancelaria_id = k
      left join prevzatia p on p.inzerat_id = z.id and p.kancelaria_id = k
      where z.duplikat_z is null
    ), g as (
      select i.tel,
        (array_agg(i.zobraz order by i.prvy_krat desc))[1] as zobraz,
        (array_agg(nullif(trim(i.predajca), '') order by (i.ptyp <> 'rk') desc, i.prvy_krat desc) filter (where nullif(trim(i.predajca), '') is not null))[1] as meno_portal,
        bool_or(i.ptyp <> 'rk') as sukromny,
        count(*) as pocet,
        count(*) filter (where i.aktivny) as aktivnych,
        max(i.prvy_krat) as najnovsi,
        jsonb_agg(jsonb_build_object(
          'id', i.id, 'nazov', i.nazov, 'typ', i.typ, 'izby', i.izby, 'obec', i.obec, 'okres', i.okres, 'cena', i.cena,
          'plocha', i.plocha, 'url', i.url, 'portal', i.portal, 'aktivny', i.aktivny, 'prvy_krat', i.prvy_krat,
          'naposledy', i.naposledy, 'foto', i.foto, 'ptyp', i.ptyp, 'prevzal', i.prevzal,
          'posledny_vysledok', i.posledny_vysledok, 'nehnutelnost_id', i.nehnutelnost_id, 'zdroj', i.zdroj
        ) order by i.prvy_krat desc) as inzeraty,
        array_agg(i.id) as ids,
        coalesce(array_agg(distinct i.prevzal) filter (where i.prevzal is not null), '{}') as prevzali
      from i group by i.tel
    ), v as (
      select coalesce(g.tel, pr.telefon) as tel,
             coalesce(g.zobraz, substr(pr.telefon, 1, 4) || ' ' || substr(pr.telefon, 5, 3) || ' ' || substr(pr.telefon, 8)) as zobraz,
             g.meno_portal, coalesce(g.sukromny, true) as sukromny, coalesce(g.pocet, 0) as pocet, coalesce(g.aktivnych, 0) as aktivnych,
             coalesce(g.najnovsi, pr.upravene) as najnovsi, coalesce(g.inzeraty, '[]'::jsonb) as inzeraty,
             coalesce(g.ids, '{}') as ids, coalesce(g.prevzali, '{}') as prevzali, pr
      from g full join (select * from predajcovia where kancelaria_id = k) pr on pr.telefon = g.tel
      where g.tel is not null or pr.makler_id is not null
    )
    select jsonb_agg(jsonb_build_object(
      'tel', v.tel, 'telefon', v.zobraz,
      'meno', coalesce(nullif(trim((v.pr).meno), ''), v.meno_portal), 'meno_vlastne', nullif(trim((v.pr).meno), ''), 'meno_portal', v.meno_portal,
      'poznamka', (v.pr).poznamka, 'nevolat', coalesce((v.pr).nevolat, false), 'upravil', (v.pr).upravil, 'upravene', (v.pr).upravene,
      'rk', coalesce((v.pr).rk, false), 'rk_oznacil', (v.pr).rk_oznacil, 'rk_oznacene', (v.pr).rk_oznacene,
      'makler_id', (v.pr).makler_id, 'prevzali', to_jsonb(v.prevzali),
      'sukromny', v.sukromny, 'pocet', v.pocet, 'aktivnych', v.aktivnych, 'najnovsi', v.najnovsi,
      'asi_rk', v.aktivnych >= 3 or v.pocet >= 5,
      'inzeraty', v.inzeraty,
      'hovorov', (select count(*) from aktivity a where a.inzerat_id = any(v.ids) and a.kancelaria_id = k and a.typ = 'hovor'),
      'posledny_kontakt', (select jsonb_build_object('typ', a.typ, 'vysledok', a.vysledok, 'poznamka', a.poznamka, 'makler_id', a.makler_id,
                                                     'vytvorene', a.vytvorene, 'inzerat_id', a.inzerat_id)
                           from aktivity a where a.inzerat_id = any(v.ids) and a.kancelaria_id = k and a.typ in ('hovor', 'sms', 'email')
                           order by a.vytvorene desc limit 1),
      'aktivity', coalesce((select jsonb_agg(x order by x.vytvorene desc) from (
                    select a.inzerat_id, a.makler_id, a.typ, a.vysledok, a.poznamka, a.vytvorene from aktivity a
                    where a.inzerat_id = any(v.ids) and a.kancelaria_id = k order by a.vytvorene desc limit 40) x), '[]'::jsonb)
    ) order by v.najnovsi desc)
    from v
  ), '[]'::jsonb);
end $function$;

-- radar Bazoša: nové inzeráty zo všetkých sledovaných okresov (radar hľadá okolo Spišskej Novej Vsi)
CREATE OR REPLACE FUNCTION public.radar_tik()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_t timestamp := now() at time zone 'Europe/Bratislava';
  m radar_meta; r record; v_bloky int; v_netop int; v_prvy_top boolean; v_seed boolean;
begin
  select * into m from radar_meta where id = 1 for update;
  if extract(hour from v_t) < 6 or extract(hour from v_t) >= 23 then
    delete from radar_poziadavky;
    return;
  end if;
  if m.pauza_do > now() then return; end if;
  v_seed := m.spusteny > now() - interval '5 minutes';

  -- odpovede
  for r in select p.*, h.status_code, h.content, h.timed_out, h.error_msg
           from radar_poziadavky p join net._http_response h on h.id = p.id loop
    delete from radar_poziadavky where id = r.id;
    if r.status_code in (403, 429, 503) then
      update radar_meta set pauza_do = now() + interval '2 hours', chyba = 'Bazoš obmedzil prístup (' || r.status_code || ') – radar 2 hodiny čaká',
        chyba_kedy = now() where id = 1;
      delete from radar_poziadavky;
      return;
    end if;
    if coalesce(r.status_code, 0) <> 200 or r.content is null then
      update radar_meta set chyba = 'Bazoš neodpovedal' || coalesce(' (' || r.status_code || ')', '') || coalesce(': ' || r.error_msg, ''), chyba_kedy = now() where id = 1;
      continue;
    end if;
    select count(*), count(*) filter (where not b.top), bool_or(b.top and b.poradie = 0)
      into v_bloky, v_netop, v_prvy_top from _radar_bloky(r.content) b;
    if v_bloky = 0 then
      update radar_meta set chyba = 'Bazoš vrátil stránku bez inzerátov (zmena vzhľadu?)', chyba_kedy = now() where id = 1;
      continue;
    end if;
    update radar_meta set posledny_ok = now() where id = 1;

    -- posun hranice: celá stránka topovaná → ďalej; stránka začína netopovaným → overiť predchádzajúcu (najviac raz za 10 min)
    if r.druh = 'hranica' then
      if v_netop = 0 and r.ofs < 200 then
        update radar_stav set ofs = r.ofs + 20, spat_overene = now() where kat = r.kat;
        perform _radar_poziadaj(r.kat, r.ofs + 20, 'hranica');
      elsif not coalesce(v_prvy_top, false) and r.ofs > 0
            and not exists (select 1 from radar_stav where kat = r.kat and spat_overene > now() - interval '10 minutes') then
        perform _radar_poziadaj(r.kat, r.ofs - 20, 'spat');
      end if;
    elsif r.druh = 'spat' then
      if v_netop > 0 then
        update radar_stav set ofs = r.ofs, spat_overene = null where kat = r.kat;   -- hranica je skôr
      else
        update radar_stav set spat_overene = now() where kat = r.kat;               -- hranica sedí
      end if;
    end if;

    -- nové inzeráty z našich okresov, ktoré skener ešte nepozná
    insert into radar_videne (pid, kat, okres, top, vybavene)
    select b.pid, r.kat, b.okres, b.top, case when v_seed then now() end
    from _radar_bloky(r.content) b
    where (r.druh = 'prva' or not b.top)
      and b.okres = any(_skener_okresy() || array['Spišská Nová Ves', 'Levoča'])
      and not exists (select 1 from inzeraty i where i.id = 'bazos:' || b.pid)
    on conflict (pid) do nothing;
  end loop;

  -- požiadavky bez odpovede dlhšie ako 2 minúty zahodíme
  delete from radar_poziadavky where vytvorene < now() - interval '2 minutes';

  -- nový inzerát → rýchla kontrola skenera (najviac raz za 3 minúty, každý inzerát najviac 3-krát)
  if exists (select 1 from radar_videne where vybavene is null and pokusy < 3 and videne > now() - interval '2 hours')
     and (m.posledne_spustenie is null or m.posledne_spustenie < now() - interval '3 minutes') then
    if _spustit_skener('rychly') is not null then
      update radar_videne set pokusy = pokusy + 1 where vybavene is null and pokusy < 3 and videne > now() - interval '2 hours';
    end if;
  end if;

  -- nová dávka každé 2 minuty
  if (m.posledna_davka is null or m.posledna_davka < now() - interval '115 seconds')
     and not exists (select 1 from radar_poziadavky) then
    for r in select * from radar_stav where aktivna order by kat loop
      perform _radar_poziadaj(r.kat, r.ofs, 'hranica');
      if r.prva and r.ofs > 0 and (m.posledna_prva is null or m.posledna_prva < now() - interval '355 seconds') then
        perform _radar_poziadaj(r.kat, 0, 'prva');
      end if;
    end loop;
    update radar_meta set posledna_davka = now(),
      posledna_prva = case when posledna_prva is null or posledna_prva < now() - interval '355 seconds' then now() else posledna_prva end
    where id = 1;
  end if;
end $function$;

-- kontakt z Týpkových nehnuteľností: predávajúci v kancelárii makléra (kanceláriu doplní spúšťač podľa makler_id)
CREATE OR REPLACE FUNCTION public.portal_predaj(p_typ text, p_meno text, p_kontakt text, p_udaje jsonb DEFAULT NULL::jsonb, p_overenie jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  DRUHY constant jsonb := '{"byt":"Byt","dom":"Rodinný dom","pozemok":"Pozemok","chata":"Chata alebo chalupa","ine":"Iná nehnuteľnosť"}';
  STAVY constant jsonb := '{"novostavba":"novostavba","rekonstrukcia":"po rekonštrukcii","povodny":"pôvodný stav"}';
  KEDY constant jsonb := '{"hned":"chce predať čo najskôr","mesiace":"chce predať do pár mesiacov","neviem":"ešte sa rozhoduje"}';
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_druh text := case when DRUHY ? coalesce(p_udaje->>'druh', '') then p_udaje->>'druh' end;
  v_obec text := nullif(left(btrim(regexp_replace(coalesce(p_udaje->>'obec', ''), '\s+', ' ', 'g')), 60), '');
  v_okres_z text := nullif(left(btrim(coalesce(p_udaje->>'okres', '')), 60), '');
  v_m2 numeric := case when replace(coalesce(p_udaje->>'m2', ''), ',', '.') ~ '^\d{1,6}(\.\d{1,2})?$' then replace(p_udaje->>'m2', ',', '.')::numeric end;
  v_izby int := case when coalesce(p_udaje->>'izby', '') ~ '^[1-9]$' then (p_udaje->>'izby')::int end;
  v_stav text := STAVY->>coalesce(p_udaje->>'stav', '');
  v_kedy text := KEDY->>coalesce(p_udaje->>'kedy', '');
  v_pozn text := left(btrim(coalesce(p_udaje->>'pozn', '')), 600);
  v_odkial text := _klient_odtlacok();
  v_hodina int;
  v_okres text; v_obec_ok text; v_email boolean; v_komu uuid; v_odhad jsonb; v_popis text; v_text text; v_id bigint; v_nazov text;
begin
  if coalesce(p_overenie->>'med', '') <> '' then return jsonb_build_object('ok', true); end if;
  if p_typ is null or p_typ not in ('odhad', 'predat') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  -- pri náraste podaní (napríklad útok robotov) sa vyžaduje ťažšie overenie; skutoční ľudia počkajú pár sekúnd navyše
  select count(*) into v_hodina from web_kontakty where portal and zdroj in ('odhad', 'predaj') and vytvorene > now() - interval '1 hour';
  if v_hodina >= 200 then raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000'; end if;
  perform _portal_overenie2('portal-' || p_typ, p_typ, p_overenie, case when v_hodina >= 20 then 5 else 4 end);
  if v_druh is null then raise exception 'Vyberte, čo chcete predať.' using errcode = '22023'; end if;
  if v_obec is null then raise exception 'Napíšte obec, kde je nehnuteľnosť.' using errcode = '22023'; end if;
  if v_m2 is not null and (v_m2 < 5 or v_m2 > 500000) then v_m2 := null; end if;
  if length(v_kontakt) < 5 then raise exception 'Napíšte telefón alebo e-mail, aby sa vám maklér mohol ozvať.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023';
  else
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;

  select x.nazov, x.okres into v_obec_ok, v_okres from lokality x
   where x.typ = 'obec' and _bez_diakritiky(x.nazov) = _bez_diakritiky(v_obec)
   order by (x.okres = v_okres_z) is true desc, (x.nazov = v_obec) desc, x.mesto desc limit 1;
  v_obec := coalesce(v_obec_ok, v_obec);

  v_komu := _portal_makler_oblasti(v_obec, v_okres);
  if v_komu is null then raise exception 'Formulár je dočasne nedostupný. Skúste to neskôr.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918276, hashtext(coalesce(v_odkial, '-')));
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu.' using errcode = '54000';
  end if;

  if p_typ = 'odhad' and v_druh in ('byt', 'dom', 'pozemok', 'chata') then v_odhad := _odhad_ceny(v_druh, v_obec, v_m2); end if;
  v_popis := concat_ws(', ', DRUHY->>v_druh, v_obec || case when v_okres is not null and v_okres <> v_obec then ' (okres ' || v_okres || ')' else '' end,
                       case when v_m2 is not null then _cislo_sk(v_m2) || ' m²' end,
                       case when v_izby is not null then v_izby || case when v_izby = 1 then ' izba' when v_izby < 5 then ' izby' else ' izieb' end end, v_stav);
  v_nazov := case when p_typ = 'odhad' then 'Odhad ceny' else 'Chce predať' end;
  v_text := concat_ws('. ', v_nazov || ': ' || v_popis, case when v_kedy is not null then upper(left(v_kedy, 1)) || substr(v_kedy, 2) end,
                      nullif(v_pozn, ''), case when v_odhad is not null then _odhad_text(v_odhad) end);

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, odkial, portal)
  values (null, v_komu, case when p_typ = 'odhad' then 'odhad' else 'predaj' end, v_meno, v_kontakt, left(v_text, 1500), v_odkial, true)
  returning id into v_id;

  if not v_email and v_kontakt ~ '^0\d{8,10}$' then
    insert into predajcovia (telefon, meno, poznamka, makler_id, upravene)
    values (v_kontakt, v_meno, left('Z Týpkových nehnuteľností – ' || v_nazov || ': ' || v_popis || case when v_kedy is not null then '. ' || v_kedy else '' end ||
            case when v_pozn <> '' then '. ' || v_pozn else '' end, 2000), v_komu, now())
    on conflict (telefon, kancelaria_id) do update set
      makler_id = coalesce(predajcovia.makler_id, excluded.makler_id),
      meno = coalesce(predajcovia.meno, excluded.meno),
      poznamka = left(coalesce(predajcovia.poznamka || E'\n', '') || excluded.poznamka, 2000),
      upravene = now();
  end if;

  insert into pripomienky (makler_id, cas, poznamka, druh, web_kontakt_id)
  values (v_komu, now(), left('Nový kontakt z Týpkových nehnuteľností – ' || v_nazov || ': ' || coalesce(v_meno || ', ', '') || v_kontakt || '. ' ||
          v_popis || case when v_kedy is not null then '. ' || upper(left(v_kedy, 1)) || substr(v_kedy, 2) else '' end ||
          case when v_pozn <> '' then '. ' || v_pozn else '' end, 500), 'web', v_id);
  update push_fronta set titul = case when p_typ = 'odhad' then '🏡 Odhad ceny z Týpkových nehnuteľností' else '🏡 Chce predať – Týpkove nehnuteľnosti' end
   where odoslane is null and tag in (select 'typek-kontakt-' || id from pripomienky where web_kontakt_id = v_id);

  return jsonb_build_object('ok', true, 'obec', v_obec,
    'makler', (select jsonb_strip_nulls(jsonb_build_object('meno', _meno_cele(m.titul_pred, m.meno, m.titul_za), 'telefon', m.telefon,
                 'foto', case when m.foto like 'data:image/%' then m.foto end)) from makleri m where m.id = v_komu));
end $function$;

-- kontakt z webu kancelárie: predávajúci v kancelárii makléra
CREATE OR REPLACE FUNCTION public.web_kontakt(p_adresa text, p_zdroj text, p_kontakt text, p_meno text DEFAULT NULL::text, p_co text DEFAULT NULL::text, p_ponuka bigint DEFAULT NULL::bigint, p_dopyt jsonb DEFAULT NULL::jsonb, p_overenie jsonb DEFAULT NULL::jsonb, p_komu uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w weby;
  v_kontakt text := left(btrim(coalesce(p_kontakt, '')), 120);
  v_meno text := nullif(left(btrim(regexp_replace(coalesce(p_meno, ''), '\s+', ' ', 'g')), 80), '');
  v_co text := left(btrim(coalesce(p_co, '')), 1500);
  v_odkial text := _klient_odtlacok();
  v_ts bigint; v_nonce text; v_hash text;
  v_dopyt bigint; v_id bigint; v_email boolean;
  v_kat text[]; v_obce text[]; v_cena numeric;
  v_ciel uuid; v_kanc boolean; v_ucel text; v_odhad jsonb;
  NAZVY constant jsonb := '{"odhad":"Odhad ceny","strazca":"Strážca ponúk","obhliadka":"Obhliadka","callback":"Zavolať späť","dotaznik":"Dotazník","ebook":"E-book","kontakt":"Správa z webu","vykup":"Výkup nehnuteľnosti","kariera":"Záujem o prácu"}';
begin
  -- pasca na roboty: skryté pole vyplní len robot → tváriť sa ako úspech, nič neuložiť
  if coalesce(p_overenie->>'med', '') <> '' then return 'ok'; end if;
  -- výpočtová úloha z prehliadača: sha256 začína štyrmi nulami, čas nie starší ako 30 minút, každé riešenie raz
  v_ts := case when (p_overenie->>'ts') ~ '^\d{9,11}$' then (p_overenie->>'ts')::bigint end;
  v_nonce := coalesce(p_overenie->>'n', '');
  if v_ts is null or v_nonce !~ '^[0-9a-z]{1,40}$' then raise exception 'Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  if v_ts < extract(epoch from now()) - 1800 or v_ts > extract(epoch from now()) + 300 then
    raise exception 'Formulár bol otvorený pridlho. Obnovte stránku a skúste to znova.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest('typek1|' || lower(btrim(coalesce(p_adresa, ''))) || '|' || coalesce(p_zdroj, '') || '|' || v_ts || '|' || v_nonce, 'sha256'), 'hex');
  if left(v_hash, 4) <> '0000' then raise exception 'Formulár sa nepodarilo overiť. Obnovte stránku a skúste to znova.' using errcode = '22023'; end if;
  insert into web_overenia (hash) values (v_hash) on conflict do nothing;
  if not found then raise exception 'Formulár už bol odoslaný. Obnovte stránku, ak chcete poslať ďalšiu správu.' using errcode = '22023'; end if;
  if random() < 0.05 then delete from web_overenia where cas < now() - interval '2 hours'; end if;

  w := _web_podla(p_adresa);
  if w.id is null or w.zverejnene is null then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  v_kanc := w.kancelaria;
  if not v_kanc and not exists (select 1 from makleri where id = w.makler_id and aktivny) then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  if p_zdroj is null or not (NAZVY ? p_zdroj) then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if not v_kanc and p_zdroj in ('vykup', 'kariera') then raise exception 'Neznámy formulár.' using errcode = '22023'; end if;
  if length(v_kontakt) < 5 then raise exception 'Doplňte telefón alebo e-mail.' using errcode = '22023'; end if;
  v_email := v_kontakt ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$';
  if v_email then v_kontakt := lower(v_kontakt);
  elsif position('@' in v_kontakt) > 0 then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if p_zdroj = 'ebook' and not v_email then raise exception 'Skontrolujte e-mailovú adresu.' using errcode = '22023'; end if;
  if not v_email then
    v_kontakt := _tel_norm(v_kontakt);
    if v_kontakt is null then raise exception 'Skontrolujte telefón alebo e-mail.' using errcode = '22023'; end if;
  end if;
  if p_zdroj = 'callback' and v_email then raise exception 'Na zavolanie napíšte telefónne číslo.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(918273, w.id::int);
  if v_odkial is not null and (select count(*) from web_kontakty where odkial = v_odkial and vytvorene > now() - interval '1 hour') >= 6 then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;
  if (select count(*) from web_kontakty where web_id = w.id and vytvorene > now() - interval '1 hour') >= (case when v_kanc then 60 else 30 end) then
    raise exception 'Príliš veľa správ naraz. Skúste to o chvíľu alebo zavolajte.' using errcode = '54000';
  end if;

  -- komu kontakt patrí
  if v_kanc then
    if p_ponuka is not null then
      select n.makler_id into v_ciel from nehnutelnosti n join makleri m on m.id = n.makler_id and m.aktivny
      where n.id = p_ponuka and n.stav in ('aktivne', 'rezervovane', 'predane') and n.web_kancelarie;
      if v_ciel is null then p_ponuka := null; end if;
    end if;
    if v_ciel is null and p_komu is not null and p_zdroj <> 'kariera'
       and exists (select 1 from makleri where id = p_komu and aktivny)
       and coalesce(w.zverejnene->'team'->(p_komu::text)->>'on', 'true') <> 'false' then
      v_ciel := p_komu;
    end if;
    if v_ciel is null then v_ciel := _web_kancelarie_komu(w, p_zdroj); end if;
    if v_ciel is null then raise exception 'Web neexistuje.' using errcode = '22023'; end if;
  else
    v_ciel := w.makler_id;
    if p_ponuka is not null and not exists (select 1 from nehnutelnosti where id = p_ponuka and makler_id = w.makler_id) then p_ponuka := null; end if;
  end if;

  -- strážca ponúk = dopyt klienta (automaticky sa páruje s novými ponukami a inzerátmi)
  if p_zdroj = 'strazca' and p_dopyt is not null then
    if jsonb_typeof(p_dopyt) <> 'object' then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    v_kat := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'kategorie') = 'array' then p_dopyt->'kategorie' else '[]' end) x
                        where x in ('byty', 'domy', 'pozemky', 'chaty')), '{}');
    v_obce := coalesce((select array_agg(distinct left(btrim(x), 60)) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_dopyt->'obce') = 'array' then p_dopyt->'obce' else '[]' end) x limit 10) t
                        where btrim(x) <> ''), '{}');
    v_cena := case when (p_dopyt->>'cena_do') ~ '^\d{3,9}(\.\d{1,2})?$' then (p_dopyt->>'cena_do')::numeric end;
    if cardinality(v_kat) = 0 and cardinality(v_obce) = 0 and v_cena is null then raise exception 'Vyberte, čo hľadáte.' using errcode = '22023'; end if;
    if (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < (case when v_kanc then 120 else 60 end) then
      insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do, popis)
      values (v_ciel, case when coalesce((p_dopyt->>'prenajom') = 'true', false) then 'prenajom' else 'predaj' end, v_kat, v_obce, v_cena,
              case when v_kanc then 'Strážca ponúk z webu kancelárie.' else 'Strážca ponúk z webu.' end)
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
      -- s e-mailom: klientovi príde e-mail s odkazom na potvrdenie; až po potvrdení mu chodia nové zhodné ponuky
      if v_email and not exists (select 1 from web_strazcovia where web_id = w.id and email = v_kontakt and potvrdeny is null
                                   and odhlaseny is null and vytvorene > now() - interval '24 hours') then
        insert into web_strazcovia (dopyt_id, web_id, makler_id, email, meno, token)
        values (v_dopyt, w.id, v_ciel, v_kontakt, v_meno, encode(extensions.gen_random_bytes(20), 'hex'));
      end if;
    end if;
  end if;

  -- web kancelárie: kupujúci → dopyt v Klientoch, predávajúci s telefónom → Klienti → Predávajúci
  if v_kanc and p_zdroj in ('kontakt', 'odhad', 'vykup', 'callback') then
    v_ucel := case when p_zdroj in ('odhad', 'vykup') then 'predat' else coalesce(p_dopyt->>'ucel', '') end;
    if v_ucel in ('kupit', 'prenajat') and v_dopyt is null
       and (select count(*) from web_kontakty where web_id = w.id and dopyt_id is not null and vytvorene > now() - interval '30 days') < 120 then
      insert into dopyty (makler_id, transakcia, popis)
      values (v_ciel, case when v_ucel = 'prenajat' then 'prenajom' else 'predaj' end,
              left('Z webu kancelárie. ' || coalesce(nullif(v_co, ''), 'Hľadá nehnuteľnosť.'), 1000))
      returning id into v_dopyt;
      insert into dopyty_kontakty (dopyt_id, meno, telefon, email, poznamka)
      values (v_dopyt, v_meno, case when v_email then null else v_kontakt end, case when v_email then v_kontakt end, nullif(v_co, ''));
    elsif v_ucel = 'predat' and not v_email and v_kontakt ~ '^0\d{8,10}$' then
      insert into predajcovia (telefon, meno, poznamka, makler_id, upravene)
      values (v_kontakt, v_meno, left('Z webu kancelárie – ' || (NAZVY->>p_zdroj) || case when v_co <> '' then ': ' || v_co else '.' end, 2000), v_ciel, now())
      on conflict (telefon, kancelaria_id) do update set
        makler_id = coalesce(predajcovia.makler_id, excluded.makler_id),
        meno = coalesce(predajcovia.meno, excluded.meno),
        poznamka = left(coalesce(predajcovia.poznamka || E'\n', '') || excluded.poznamka, 2000),
        upravene = now();
    end if;
  end if;

  -- odhad hodnoty: k údajom o nehnuteľnosti sa pripojí orientačný odhad podľa inzerátov zo skenera (len pre makléra, klient ho nevidí)
  if p_zdroj = 'odhad' and jsonb_typeof(p_dopyt->'odhad') = 'object' then
    v_odhad := _odhad_ceny(p_dopyt->'odhad'->>'typ', p_dopyt->'odhad'->>'obec',
                 case when replace(coalesce(p_dopyt->'odhad'->>'m2', ''), ',', '.') ~ '^\d{1,6}(\.\d{1,2})?$' then replace(p_dopyt->'odhad'->>'m2', ',', '.')::numeric end);
    if v_odhad is not null then v_co := left(v_co || '. ' || _odhad_text(v_odhad), 1500); end if;
  end if;

  insert into web_kontakty (web_id, makler_id, zdroj, meno, kontakt, co, nehnutelnost_id, dopyt_id, odkial)
  values (w.id, v_ciel, p_zdroj, v_meno, v_kontakt, v_co, p_ponuka, v_dopyt, v_odkial) returning id into v_id;

  insert into pripomienky (makler_id, cas, poznamka, druh, nehnutelnost_id, web_kontakt_id)
  values (v_ciel, now(), left('Nový kontakt z webu – ' || (NAZVY->>p_zdroj) || case when v_kanc then ' (web kancelárie)' else '' end || ': ' ||
          coalesce(v_meno || ', ', '') || v_kontakt || case when v_co <> '' then '. ' || v_co else '' end, 500), 'web', p_ponuka, v_id);

  if p_zdroj = 'ebook' then return coalesce(nullif(w.zverejnene->'dl'->>'url', ''), 'ok'); end if;
  return 'ok';
end $function$;

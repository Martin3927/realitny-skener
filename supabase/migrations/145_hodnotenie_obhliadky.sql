-- =====================================================================
-- 145: Hodnotenie obhliadky od kupujúceho
--  * maklér pošle kupujúcemu po obhliadke odkaz (WhatsApp/SMS) na stránku hodnotenie.html?t=… – hviezdičky, čo sa páčilo a čo nie
--  * hodnotenie príde maklérovi a administrátorovi do zvončeka; do reportu majiteľa ide AŽ PO SCHVÁLENÍ administrátorom
--    (a len keď má predávajúci v klientskej zóne zapnutú spätnú väzbu)
-- =====================================================================
create table if not exists public.obhliadky_hodnotenia (
  id bigint generated always as identity primary key,
  obhliadka_id bigint not null unique references public.obhliadky(id) on delete cascade,
  kancelaria_id bigint not null references public.kancelarie(id) on delete cascade,
  token text not null unique check (length(token) >= 32),
  hviezdy int check (hviezdy between 1 and 5),
  pacilo text check (pacilo is null or length(pacilo) <= 1000),
  nepacilo text check (nepacilo is null or length(nepacilo) <= 1000),
  vytvoril uuid,
  vytvorene timestamptz not null default now(),
  vyplnene timestamptz,
  schvalene timestamptz,
  schvalil uuid,
  zamietnute timestamptz
);
alter table public.obhliadky_hodnotenia enable row level security;
drop policy if exists hodnotenia_citat on public.obhliadky_hodnotenia;
create policy hodnotenia_citat on public.obhliadky_hodnotenia for select to authenticated using (
  kancelaria_id = (select aktivna_kancelaria()) and (select ja_aktivny()) and (select ma_pristup('nehnutelnosti')));
revoke all on public.obhliadky_hodnotenia from anon, authenticated;
grant select on public.obhliadky_hodnotenia to authenticated;

-- maklér obhliadky / ponuky alebo administrátor si vypýta odkaz (opakovane vráti ten istý)
create or replace function public.hodnotenie_obhliadky_odkaz(p_obhliadka bigint) returns text
language plpgsql security definer set search_path = public as $$
declare o obhliadky; n nehnutelnosti; t text;
begin
  perform _over_aktivny();
  select * into o from obhliadky where id = p_obhliadka and zrusena is null;
  if not found or o.kancelaria_id <> aktivna_kancelaria() then raise exception 'Obhliadka sa nenašla.'; end if;
  select * into n from nehnutelnosti where id = o.nehnutelnost_id;
  if not (ja_admin() or o.makler_id = auth.uid() or n.makler_id = auth.uid()) then raise exception 'O hodnotenie môže požiadať maklér obhliadky alebo administrátor.' using errcode = '42501'; end if;
  if o.cas > now() + interval '2 hours' then raise exception 'Obhliadka ešte neprebehla.'; end if;
  select token into t from obhliadky_hodnotenia where obhliadka_id = o.id;
  if t is null then
    t := encode(extensions.gen_random_bytes(18), 'hex');
    insert into obhliadky_hodnotenia (obhliadka_id, kancelaria_id, token, vytvoril) values (o.id, o.kancelaria_id, t, auth.uid());
  end if;
  return t;
end $$;
revoke execute on function public.hodnotenie_obhliadky_odkaz(bigint) from public, anon;
grant execute on function public.hodnotenie_obhliadky_odkaz(bigint) to authenticated;

-- verejná stránka: čo kupujúci hodnotí (bez mien a telefónov)
create or replace function public.hodnotenie_obhliadky_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h obhliadky_hodnotenia; o obhliadky; n nehnutelnosti;
begin
  if length(coalesce(p_token, '')) < 32 then return null; end if;
  select * into h from obhliadky_hodnotenia where token = p_token;
  if not found then return null; end if;
  select * into o from obhliadky where id = h.obhliadka_id;
  select * into n from nehnutelnosti where id = o.nehnutelnost_id;
  return jsonb_build_object('nazov', coalesce(nullif(n.nazov, ''), concat_ws(', ', n.typ, n.obec)), 'obec', n.obec, 'cas', o.cas,
    'makler', coalesce(o.makler_id, n.makler_id), 'vyplnene', h.vyplnene is not null,
    'vyprsalo', h.vyplnene is null and o.cas < now() - interval '30 days',
    'kanc', _kancelaria_verejne(h.kancelaria_id), 'kancelaria_id', h.kancelaria_id);
end $$;
revoke execute on function public.hodnotenie_obhliadky_info(text) from public;
grant execute on function public.hodnotenie_obhliadky_info(text) to anon, authenticated;

-- verejná stránka: kupujúci odošle hodnotenie (raz, do 30 dní od obhliadky)
create or replace function public.hodnotenie_obhliadky_ulozit(p_token text, p_hviezdy int, p_pacilo text, p_nepacilo text) returns void
language plpgsql security definer set search_path = public as $$
declare h obhliadky_hodnotenia; o obhliadky; n nehnutelnosti; v_txt text;
begin
  if length(coalesce(p_token, '')) < 32 then raise exception 'Odkaz nie je platný.'; end if;
  select * into h from obhliadky_hodnotenia where token = p_token for update;
  if not found then raise exception 'Odkaz nie je platný.'; end if;
  if h.vyplnene is not null then raise exception 'Hodnotenie ste už poslali – ďakujeme.'; end if;
  select * into o from obhliadky where id = h.obhliadka_id;
  if o.cas < now() - interval '30 days' then raise exception 'Odkaz už vypršal.'; end if;
  if p_hviezdy is null or p_hviezdy not between 1 and 5 then raise exception 'Vyberte počet hviezdičiek.'; end if;
  if length(coalesce(p_pacilo, '')) > 1000 or length(coalesce(p_nepacilo, '')) > 1000 then raise exception 'Text je príliš dlhý.'; end if;
  update obhliadky_hodnotenia set hviezdy = p_hviezdy, pacilo = nullif(left(trim(coalesce(p_pacilo, '')), 1000), ''),
    nepacilo = nullif(left(trim(coalesce(p_nepacilo, '')), 1000), ''), vyplnene = now() where id = h.id;
  -- maklérovi a administrátorom do zvončeka (a mobilu)
  select * into n from nehnutelnosti where id = o.nehnutelnost_id;
  v_txt := left('⭐ Kupujúci ohodnotil obhliadku (' || p_hviezdy || '/5): ' || coalesce(nullif(n.nazov, ''), n.typ, 'ponuka') ||
                '. Do reportu majiteľa pôjde až po schválení administrátorom.', 500);
  insert into pripomienky (makler_id, nehnutelnost_id, cas, poznamka, druh, kancelaria_id)
  select m.id, n.id, now(), v_txt, 'pripomienka', h.kancelaria_id from makleri m
  where m.aktivny and m.kancelaria_id = h.kancelaria_id and (m.id = coalesce(o.makler_id, n.makler_id) or m.rola = 'admin');
end $$;
revoke execute on function public.hodnotenie_obhliadky_ulozit(text, int, text, text) from public;
grant execute on function public.hodnotenie_obhliadky_ulozit(text, int, text, text) to anon, authenticated;

-- administrátor schváli (pôjde do reportu majiteľa) alebo nezobrazí
create or replace function public.hodnotenie_obhliadky_schvalit(p_id bigint, p_schvalit boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  update obhliadky_hodnotenia set
    schvalene = case when p_schvalit then now() end, schvalil = case when p_schvalit then auth.uid() end,
    zamietnute = case when p_schvalit then null else now() end
  where id = p_id and kancelaria_id = aktivna_kancelaria() and vyplnene is not null;
  if not found then raise exception 'Hodnotenie sa nenašlo.'; end if;
end $$;
revoke execute on function public.hodnotenie_obhliadky_schvalit(bigint, boolean) from public, anon;
grant execute on function public.hodnotenie_obhliadky_schvalit(bigint, boolean) to authenticated;

-- report pre majiteľa: k obhliadke aj schválené hodnotenie kupujúceho (len so zapnutou spätnou väzbou)
create or replace function public.report_majitela(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i nehnutelnosti_interne; n nehnutelnosti; z jsonb; v jsonb;
begin
  if length(coalesce(p_token, '')) < 20 then return null; end if;
  select * into i from nehnutelnosti_interne where report_token = p_token;
  if not found then return null; end if;
  select * into n from nehnutelnosti where id = i.nehnutelnost_id;
  z := _kz_ponuky(i.zona, n.kancelaria_id);
  if not (z ->> 'zapnute')::boolean then
    return jsonb_build_object('vypnute', true, 'ponuka', jsonb_build_object('makler', _verejna(n) -> 'makler'),
                              'kanc', _kancelaria_verejne(n.kancelaria_id), 'kancelaria_id', n.kancelaria_id);
  end if;
  select jsonb_build_object(
    'ponuka', _verejna(n),
    'majitel', i.majitel_meno,
    'zmluva_do', i.zmluva_do,
    'cena', n.cena,
    'historia_cien', case when (z ->> 'cena')::boolean then n.historia_cien end,
    'dni_v_ponuke', greatest(0, current_date - n.vytvorene::date),
    'obhliadky', case when (z ->> 'obhliadky')::boolean then
       coalesce((select jsonb_agg(jsonb_build_object(
                          'cas', o.cas,
                          'vysledok', case when (z ->> 'spatna_vazba')::boolean then o.vysledok end,
                          'spatna_vazba', case when (z ->> 'spatna_vazba')::boolean then o.spatna_vazba end,
                          'hodnotenie', case when (z ->> 'spatna_vazba')::boolean then
                             (select jsonb_build_object('hviezdy', h.hviezdy, 'pacilo', h.pacilo, 'nepacilo', h.nepacilo)
                                from obhliadky_hodnotenia h where h.obhliadka_id = o.id and h.schvalene is not null and h.vyplnene is not null) end,
                          'klient', case when o.klient_meno is not null then left(o.klient_meno, 1) || '.' end) order by o.cas desc)
                 from obhliadky o where o.nehnutelnost_id = n.id and o.zrusena is null
                  and ((z ->> 'terminy')::boolean or o.cas <= now())), '[]'::jsonb) end,
    'zobrazenia', case when (z ->> 'zobrazenia')::boolean then coalesce((select sum(pocet) from zobrazenia_ponuk x where x.nehnutelnost_id = n.id), 0) end,
    'zobrazenia_7', case when (z ->> 'zobrazenia')::boolean then coalesce((select sum(pocet) from zobrazenia_ponuk x where x.nehnutelnost_id = n.id and x.den > current_date - 7), 0) end,
    'zaujemcovia', case when (z ->> 'kupujuci')::boolean then (select count(*) from dopyty d where d.kancelaria_id = n.kancelaria_id and _sedi_ponuka(d, n)) end,
    'kontakty', case when (z ->> 'kontakty')::boolean then (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca')) end,
    'kontakty_7', case when (z ->> 'kontakty')::boolean then (select count(*) from web_kontakty k where k.nehnutelnost_id = n.id and k.zdroj not in ('ebook', 'strazca') and k.vytvorene > now() - interval '7 days') end,
    'zona', z,
    'kanc', _kancelaria_verejne(n.kancelaria_id), 'kancelaria_id', n.kancelaria_id,
    'vygenerovane', now()) into v;
  return v;
end $$;

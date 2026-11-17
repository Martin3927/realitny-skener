-- 133: web kancelárie – potvrdenie klientovi e-mailom po odoslaní formulára; odkazy na recenzie (Google, Facebook) pre prosbu o recenziu

-- ---------------------------------------------------------------- potvrdenie klientovi
alter table public.web_kontakty
  add column if not exists email_klienta text,
  add column if not exists potvrdenie_odoslane timestamptz,
  add column if not exists potvrdenie_pokusy integer not null default 0;

-- e-mail klienta: buď je priamo kontaktom, alebo ho formulár pripísal k správe („e-mail: …“), keď klient uviedol aj telefón
create or replace function public._web_kontakt_email() returns trigger
language plpgsql set search_path = public as $$
declare v text;
begin
  if new.email_klienta is null then
    if position('@' in coalesce(new.kontakt, '')) > 0 then v := new.kontakt;
    else v := (regexp_match(coalesce(new.co, ''), 'e-mail: ([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})'))[1];
    end if;
    new.email_klienta := lower(nullif(left(btrim(coalesce(v, '')), 120), ''));
  end if;
  return new;
end $$;

drop trigger if exists aa_email_klienta on public.web_kontakty;
create trigger aa_email_klienta before insert on public.web_kontakty for each row execute function public._web_kontakt_email();

create index if not exists web_kontakty_potvrdenie_idx on public.web_kontakty (vytvorene) where email_klienta is not null and potvrdenie_odoslane is null;
create index if not exists web_kontakty_email_klienta_idx on public.web_kontakty (email_klienta, potvrdenie_odoslane) where email_klienta is not null;

-- čo treba poslať: kontakty z webu kancelárie s e-mailom, ktorým ešte neprišlo potvrdenie (volá funkcia pripomienky každú minútu)
-- Do e-mailu nejde text, ktorý klient napísal – formulár sa tak nedá zneužiť na posielanie cudzieho obsahu.
create or replace function public._web_potvrdenia(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_out jsonb := '[]'::jsonb; w weby; v_mk jsonb; n nehnutelnosti; v_pon jsonb;
  NAZVY constant jsonb := '{"odhad":"odhad ceny nehnuteľnosti","obhliadka":"záujem o ponuku","callback":"žiadosť o zavolanie","kontakt":"správu","vykup":"žiadosť o výkup nehnuteľnosti","kariera":"záujem o prácu u nás","dotaznik":"správu"}';
begin
  if not pg_try_advisory_xact_lock(510132) then return v_out; end if;
  for r in select k.* from web_kontakty k join weby x on x.id = k.web_id
           where k.email_klienta is not null and k.potvrdenie_odoslane is null and k.potvrdenie_pokusy < 3
             and k.vytvorene > now() - interval '6 hours' and (NAZVY ? k.zdroj) and not coalesce(k.portal, false)
             and x.kancelaria and x.zverejnene is not null and coalesce(x.zverejnene->>'potvrdenie', 'on') = 'on'
           order by k.vytvorene limit greatest(1, least(coalesce(p_limit, 20), 50)) for update of k skip locked loop
    update web_kontakty set potvrdenie_odoslane = now() where id = r.id;
    -- jednej adrese najviac 3 potvrdenia za deň
    if (select count(*) from web_kontakty where email_klienta = r.email_klienta and id <> r.id and potvrdenie_odoslane > now() - interval '24 hours') >= 3 then continue; end if;
    select * into w from weby where id = r.web_id;
    v_mk := verejny_makler(r.makler_id);
    v_pon := null;
    if r.nehnutelnost_id is not null then
      select * into n from nehnutelnosti where id = r.nehnutelnost_id and stav in ('aktivne', 'rezervovane') and web_kancelarie;
      if found then v_pon := jsonb_build_object('id', n.id, 'nazov', n.nazov, 'slug', _slug_ponuky(n)); end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'email', r.email_klienta, 'zdroj', r.zdroj, 'co', NAZVY->>r.zdroj,
      'meno', case when r.meno ~ '^[[:alpha:] .''-]{2,40}$' then r.meno end,
      'adresa', w.adresa, 'domena', case when w.domena_pripojena is not null then w.domena end,
      'makler', case when v_mk is null then null else jsonb_build_object('meno', coalesce(v_mk->>'meno_cele', v_mk->>'meno'), 'telefon', v_mk->>'telefon', 'email', v_mk->>'email') end,
      'web', jsonb_build_object('name', w.zverejnene->'k'->>'name', 'tel', w.zverejnene->'k'->>'tel', 'mail', w.zverejnene->'k'->>'mail'),
      'ponuka', v_pon));
  end loop;
  return v_out;
end $$;

create or replace function public._web_potvrdenie_chyba(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update web_kontakty set potvrdenie_pokusy = potvrdenie_pokusy + 1,
         potvrdenie_odoslane = case when potvrdenie_pokusy + 1 >= 3 then potvrdenie_odoslane end
   where id = p_id;
$$;

revoke execute on function public._web_potvrdenia(integer), public._web_potvrdenie_chyba(bigint), public._web_kontakt_email() from public, anon, authenticated;

-- ---------------------------------------------------------------- odkazy na recenzie (Google, Facebook)
-- Vlastný odkaz nastaví administrátor; inak sa Google vezme z napojeného Google profilu a Facebook zo sociálnych sietí webu kancelárie.
create or replace function public.odkazy_recenzii() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k bigint; g text; f text; ga text; fa text; j jsonb; v_fb text; v_meno text;
begin
  perform _over_aktivny();
  k := aktivna_kancelaria();
  g := nullif(_nk('recenzie_google'), ''); f := nullif(_nk('recenzie_facebook'), '');
  begin j := _nk('google_recenzie')::jsonb; exception when others then j := null; end;
  if j is not null and jsonb_typeof(j) = 'object' and (j->>'place_id') ~ '^[A-Za-z0-9_-]{10,200}$' then
    ga := 'https://search.google.com/local/writereview?placeid=' || (j->>'place_id');
  end if;
  select nullif(btrim(coalesce(w.zverejnene, w.koncept)->'k'->'soc'->>'fb'), '') into v_fb from weby w where w.kancelaria and w.kancelaria_id = k limit 1;
  if v_fb is not null then
    v_meno := (regexp_match(v_fb, '^(?:https?://)?(?:www\.|m\.)?(?:facebook|fb)\.com/([A-Za-z0-9.]{3,80})/?(?:$|[?#])', 'i'))[1];
    if v_meno is not null and lower(v_meno) not in ('profile.php', 'pages', 'people', 'groups') then fa := 'https://www.facebook.com/' || v_meno || '/reviews'; end if;
  end if;
  return jsonb_build_object('google', coalesce(g, ga), 'facebook', coalesce(f, fa),
    'google_vlastny', g, 'facebook_vlastny', f, 'google_auto', ga, 'facebook_auto', fa);
end $$;

create or replace function public.ulozit_odkazy_recenzii(p_google text, p_facebook text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g text := btrim(coalesce(p_google, '')); f text := btrim(coalesce(p_facebook, ''));
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Odkazy na recenzie nastavuje administrátor.'; end if;
  if length(g) > 400 or length(f) > 400 then raise exception 'Odkaz je príliš dlhý.'; end if;
  if g <> '' and g !~* '^https://([a-z0-9-]+\.)*(google\.[a-z.]{2,6}|goo\.gl|g\.page)/' then
    raise exception 'Odkaz na Google recenzie má začínať https:// a viesť na Google (napr. g.page/r/…/review).';
  end if;
  if f <> '' and f !~* '^https://([a-z0-9-]+\.)?(facebook\.com|fb\.com|fb\.me)/' then
    raise exception 'Odkaz na Facebook má začínať https:// a viesť na Facebook stránku kancelárie.';
  end if;
  perform _nk_ulozit('recenzie_google', g);
  perform _nk_ulozit('recenzie_facebook', f);
  return odkazy_recenzii();
end $$;

revoke execute on function public.odkazy_recenzii(), public.ulozit_odkazy_recenzii(text, text) from public, anon;
grant execute on function public.odkazy_recenzii(), public.ulozit_odkazy_recenzii(text, text) to authenticated;

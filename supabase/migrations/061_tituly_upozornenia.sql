-- 1) Tituly makléra: titul pred menom a za menom v samostatných stĺpcoch.
--    Meno ostáva len „Meno Priezvisko“ – z neho sú iniciály, oslovenie aj rod.
-- 2) Upozornenia do mobilu pre každého makléra zvlášť (nastavuje admin): správy, nové inzeráty zo skenera, nové kontakty z webu.
--    Správy a kontakty idú cez frontu push_fronta a funkciu „upozornenia“, nové inzeráty naďalej posiela skener.

-- ---------------------------------------------------------------- 1) tituly
alter table public.makleri add column if not exists titul_pred text;
alter table public.makleri add column if not exists titul_za text;

-- tituly, ktoré sú dnes zapísané priamo v mene, presunieme do nových stĺpcov
-- („Mgr. Martina Macejová, RSc“ → „Mgr.“ + „Martina Macejová“ + „RSc“)
do $$
declare r record; t text[]; v_pred text[]; v_za text[]; v_hlavna text; v_zvysok text;
begin
  for r in select id, meno from makleri where titul_pred is null and titul_za is null and meno ~ '[.,]' loop
    v_pred := '{}'; v_za := '{}';
    v_hlavna := split_part(r.meno, ',', 1);
    v_zvysok := nullif(btrim(substr(r.meno, length(v_hlavna) + 2)), '');
    t := regexp_split_to_array(btrim(v_hlavna), '\s+');
    while cardinality(t) > 2 and t[1] ~ '^[[:alpha:]][[:alpha:].]*[[:alpha:]]\.$' loop
      v_pred := v_pred || t[1]; t := t[2:];
    end loop;
    while cardinality(t) > 2 and t[cardinality(t)] ~ '^[[:alpha:]][[:alpha:].]*[[:alpha:]]\.$' loop
      v_za := t[cardinality(t)] || v_za; t := t[1:cardinality(t) - 1];
    end loop;
    if cardinality(v_pred) > 0 or cardinality(v_za) > 0 or v_zvysok is not null then
      update makleri set meno = array_to_string(t, ' '),
        titul_pred = nullif(array_to_string(v_pred, ' '), ''),
        titul_za = nullif(concat_ws(', ', nullif(array_to_string(v_za, ' '), ''), v_zvysok), '')
      where id = r.id;
    end if;
  end loop;
end $$;

-- celé meno s titulmi: „Mgr. Martina Macejová, RSc“
create or replace function public._meno_cele(p_pred text, p_meno text, p_za text) returns text
language sql immutable as $$
  select concat_ws(', ', nullif(concat_ws(' ', nullif(btrim(p_pred), ''), nullif(btrim(p_meno), '')), ''), nullif(btrim(p_za), ''))
$$;

create or replace function public.nastavit_tituly_maklera(p_id uuid, p_pred text, p_za text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if length(coalesce(p_pred, '')) > 40 or length(coalesce(p_za, '')) > 40 then raise exception 'Titul môže mať najviac 40 znakov.'; end if;
  update makleri set titul_pred = nullif(btrim(regexp_replace(coalesce(p_pred, ''), '\s+', ' ', 'g')), ''),
    titul_za = nullif(btrim(regexp_replace(coalesce(p_za, ''), '^[\s,]+|\s+', ' ', 'g')), '')
  where id = p_id;
end $$;
revoke execute on function public.nastavit_tituly_maklera(uuid, text, text) from public, anon;
grant execute on function public.nastavit_tituly_maklera(uuid, text, text) to authenticated;

-- verejná ponuka a verejný profil: navyše celé meno s titulmi (meno_cele)
create or replace function public._verejna(n nehnutelnosti) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id, 'kancelaria', n.kancelaria, 'cislo', n.cislo, 'stav', n.stav, 'transakcia', n.transakcia,
    'kategoria', n.kategoria, 'typ', n.typ, 'nazov', n.nazov, 'intro', n.intro, 'popis', n.popis,
    'kraj', n.kraj, 'okres', n.okres, 'obec', n.obec, 'cast_obce', n.cast_obce, 'ulica', n.ulica,
    'lat', case when n.zobrazit_mapu then n.lat end, 'lon', case when n.zobrazit_mapu then n.lon end,
    'cena', case when n.zobrazit_cenu then n.cena end, 'typ_ceny', n.typ_ceny, 'text_k_cene', n.text_k_cene,
    'cena_energie', n.cena_energie, 'zobrazit_cenu', n.zobrazit_cenu,
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

create or replace function public.verejny_makler(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id, 'meno', m.meno, 'meno_cele', _meno_cele(m.titul_pred, m.meno, m.titul_za),
    'email', m.email, 'telefon', m.telefon, 'pohlavie', m.pohlavie,
    'foto', case when m.foto like 'data:%' then m.foto end)
  from makleri m where m.id = p_id and m.aktivny
$$;
grant execute on function public.verejny_makler(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- 2) upozornenia pre každého makléra
alter table public.makleri add column if not exists upozornenia jsonb not null
  default '{"spravy": true, "inzeraty": true, "kontakty": true}'::jsonb;

create or replace function public._chce_upozornenie(p_upozornenia jsonb, p_druh text) returns boolean
language sql immutable as $$
  select coalesce((p_upozornenia ->> p_druh)::boolean, true)
$$;

-- admin zapne alebo vypne jeden druh upozornení jednému maklérovi
create or replace function public.nastavit_upozornenie_maklera(p_id uuid, p_druh text, p_zapnute boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if p_druh not in ('spravy', 'inzeraty', 'kontakty') then raise exception 'Neznámy druh upozornení.'; end if;
  update makleri set upozornenia = coalesce(upozornenia, '{}'::jsonb) || jsonb_build_object(p_druh, coalesce(p_zapnute, true))
  where id = p_id;
end $$;
revoke execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) from public, anon;
grant execute on function public.nastavit_upozornenie_maklera(uuid, text, boolean) to authenticated;

-- admin: na koľkých zariadeniach má kto zapnuté upozornenia (každý vidí sám len svoje odbery)
create or replace function public.push_zariadenia_maklerov() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_admin();
  return coalesce((select jsonb_object_agg(makler_id, n) from (select makler_id, count(*) as n from push_odbery group by makler_id) x), '{}'::jsonb);
end $$;
revoke execute on function public.push_zariadenia_maklerov() from public, anon;
grant execute on function public.push_zariadenia_maklerov() to authenticated;

-- nové inzeráty zo skenera: len maklérom, ktorí ich majú zapnuté (inak rovnaké ako doteraz)
create or replace function public.skener_push_ciele(p_kluc text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform _over_skener(p_kluc);
  with i as (
    select z.* from inzeraty z
    left join oznacenia o on o.inzerat_id = z.id
    where z.id = any(p_ids) and z.aktivny and z.duplikat_z is null
      and coalesce(o.predajca_typ, z.predajca_typ, 'sukromny') <> 'rk'
      and z.prvy_krat > now() - interval '1 day'
      and (z.publikovane is null or z.publikovane >= current_date - 3)
      and not exists (select 1 from _telefony_inzeratov() t join predajcovia p on p.telefon = t.tel
                      where t.inzerat_id = z.id and (p.rk or p.nevolat))
  ), ciel as (
    select i.id as inzerat_id, m.id as makler_id
    from i join makleri m on m.aktivny and (m.rola = 'admin' or 'inzeraty' = any(m.pristup))
                         and _chce_upozornenie(m.upozornenia, 'inzeraty')
    where exists (select 1 from push_odbery s where s.makler_id = m.id)
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

-- fronta upozornení na správy a kontakty
create table if not exists public.push_fronta (
  id bigint generated always as identity primary key,
  makler_id uuid not null references public.makleri(id) on delete cascade,
  druh text not null,
  titul text not null,
  text text,
  url text,
  tag text,
  vytvorene timestamptz not null default now(),
  odoslane timestamptz
);
create index if not exists push_fronta_cakajuce on public.push_fronta (id) where odoslane is null;
alter table public.push_fronta enable row level security;
revoke all on public.push_fronta from public, anon, authenticated;

-- zavolá funkciu „upozornenia“ (nečaká na odpoveď; chyba nikdy nezastaví uloženie správy)
create or replace function public._push_spustit() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_kluc text;
begin
  select decrypted_secret into v_kluc from vault.decrypted_secrets where name = 'pripomienky_kluc';
  if v_kluc is null then return; end if;
  perform net.http_post(
    url := 'https://uwxziqapghlyktwpipjd.supabase.co/functions/v1/upozornenia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kluc', v_kluc),
    body := '{}'::jsonb);
exception when others then null;
end $$;
revoke execute on function public._push_spustit() from public, anon, authenticated;

-- zaradí upozornenie maklérom, ktorí ho majú zapnuté a majú aspoň jedno zariadenie
create or replace function public._push_zaradit(p_makleri uuid[], p_druh text, p_titul text, p_text text, p_url text, p_tag text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into push_fronta (makler_id, druh, titul, text, url, tag)
  select m.id, p_druh, left(p_titul, 120), left(p_text, 300), p_url, p_tag
  from makleri m
  where m.id = any(p_makleri) and m.aktivny and _chce_upozornenie(m.upozornenia, p_druh)
    and exists (select 1 from push_odbery s where s.makler_id = m.id);
  get diagnostics n = row_count;
  if n > 0 then perform _push_spustit(); end if;
  return n;
end $$;
revoke execute on function public._push_zaradit(uuid[], text, text, text, text, text) from public, anon, authenticated;

-- nová správa v tímovom chate → všetkým s prístupom k chatu okrem autora
create or replace function public._push_tim_sprava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.typ <> 'sprava' or new.makler_id is null or new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.aktivny and m.id <> new.makler_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ ' || _meno(new.makler_id) || ' · tímový chat', new.text, './#chat', 'typek-chat');
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_tim_sprava on public.spravy;
create trigger push_tim_sprava after insert on public.spravy for each row execute function public._push_tim_sprava();

-- nová súkromná správa → príjemcovi
create or replace function public._push_sukromna_sprava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.id = new.komu_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ Správa od: ' || _meno(new.od_id), new.text, './#chat/' || new.od_id, 'typek-dm-' || new.od_id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_sukromna_sprava on public.sukromne_spravy;
create trigger push_sukromna_sprava after insert on public.sukromne_spravy for each row execute function public._push_sukromna_sprava();

-- nový kontakt z webu (pripomienka „web“ s kontaktom) → maklérovi
create or replace function public._push_kontakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.druh, '') <> 'web' or new.web_kontakt_id is null then return new; end if;
  perform _push_zaradit(array[new.makler_id], 'kontakty', '💬 Nový kontakt z webu',
    regexp_replace(coalesce(new.poznamka, ''), '^Nový kontakt z webu – ', ''), './#zvoncek', 'typek-kontakt-' || new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_kontakt on public.pripomienky;
create trigger push_kontakt after insert on public.pripomienky for each row execute function public._push_kontakt();

-- pre funkciu „upozornenia“ (len služobný kľúč): zoberie čakajúce upozornenia aj s odbermi a kľúčmi VAPID
create or replace function public._push_na_odoslanie(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  delete from push_fronta where vytvorene < now() - interval '2 days';
  with z as (
    update push_fronta f set odoslane = now()
    where f.id in (select id from push_fronta where odoslane is null and vytvorene > now() - interval '30 minutes'
                   order by id limit greatest(coalesce(p_limit, 200), 1) for update skip locked)
    returning f.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', z.id,
      'sprava', jsonb_build_object('title', z.titul, 'body', coalesce(z.text, ''), 'url', z.url, 'tag', z.tag, 'druh', z.druh),
      'odbery', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                 from push_odbery s where s.makler_id = z.makler_id)) order by z.id), '[]'::jsonb)
    into v from z;
  return jsonb_build_object('spravy', v,
    'vapid', case when jsonb_array_length(v) > 0 then jsonb_build_object(
      'public', (select hodnota from nastavenia where kluc = 'vapid_public'),
      'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private')) end);
end $$;
revoke execute on function public._push_na_odoslanie(int) from public, anon, authenticated;

create or replace function public._push_vysledok(p_ok bigint[], p_zrusit bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  update push_odbery set naposledy_ok = now() where id = any(coalesce(p_ok, '{}'));
  delete from push_odbery where id = any(coalesce(p_zrusit, '{}'));
end $$;
revoke execute on function public._push_vysledok(bigint[], bigint[]) from public, anon, authenticated;

-- záloha: ak sa niečo nestihlo odoslať, každú minútu to skúsime znova
create or replace function public._push_tik() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from push_fronta where odoslane is null and vytvorene > now() - interval '30 minutes') then
    perform _push_spustit();
  end if;
end $$;
revoke execute on function public._push_tik() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('push-fronta');
exception when others then null; end $$;
select cron.schedule('push-fronta', '* * * * *', 'select public._push_tik()');

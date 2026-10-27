-- =====================================================================
-- Chat: prílohy – fotky, Word, Excel, PDF a iné dokumenty.
-- Súbory sú v súkromnom úložisku chat-prilohy (nie sú verejné na internete):
--   tim/<id>.<prípona>                 → spoločný chat, vidí celý tím s prístupom k chatu
--   dm/<odosielateľ>/<príjemca>/<id>…  → súkromná správa, vidia len títo dvaja
-- Fotky majú aj malý náhľad (<id>-n.jpg), aby sa chat v mobile načítal rýchlo.
-- Súbor môže k správe pripojiť len ten, kto ho nahral. Pri zmazaní správy zmizne aj súbor.
-- Nič staré sa nemaže: pôvodné funkcie na správy bez príloh ostávajú, pribudnú nové s prílohami.
-- (Súbor sa dá spustiť aj viackrát – nič sa nezdvojí.)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-prilohy', 'chat-prilohy', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet', 'text/csv',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- nahrať: do spoločného chatu (tim/) alebo do súkromnej konverzácie, kde som odosielateľ (dm/<ja>/<kolega>/)
do $$ begin
  create policy chat_prilohy_nahrat on storage.objects for insert to authenticated
    with check (bucket_id = 'chat-prilohy' and public.ma_pristup('chat') and (
      ((storage.foldername(name))[1] = 'tim' and array_length(storage.foldername(name), 1) = 1)
      or ((storage.foldername(name))[1] = 'dm' and array_length(storage.foldername(name), 1) = 3
          and (storage.foldername(name))[2] = (select auth.uid())::text
          and (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$')));
exception when duplicate_object then null; end $$;

-- čítať: spoločný chat celý tím, súkromné len odosielateľ a príjemca
do $$ begin
  create policy chat_prilohy_citat on storage.objects for select to authenticated
    using (bucket_id = 'chat-prilohy' and public.ma_pristup('chat') and (
      (storage.foldername(name))[1] = 'tim'
      or ((storage.foldername(name))[1] = 'dm'
          and (select auth.uid())::text in ((storage.foldername(name))[2], (storage.foldername(name))[3]))));
exception when duplicate_object then null; end $$;

-- zmazať: kto súbor nahral; v spoločnom chate aj administrátor (keď zmaže cudziu správu)
do $$ begin
  create policy chat_prilohy_zmazat on storage.objects for delete to authenticated
    using (bucket_id = 'chat-prilohy' and (
      owner_id = (select auth.uid())::text
      or ((storage.foldername(name))[1] = 'tim' and public.ja_admin())));
exception when duplicate_object then null; end $$;

alter table public.spravy add column if not exists prilohy jsonb;
alter table public.sukromne_spravy add column if not exists prilohy jsonb;

-- overí prílohy od aplikácie: súbor musí byť naozaj nahratý, patriť odosielateľovi a ležať v správnom priečinku.
-- Vráti očistený zoznam (názov, typ, veľkosť, rozmery fotky, náhľad) alebo null, ak príloh niet.
create or replace function public._chat_prilohy(p_prilohy jsonb, p_predpona text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]'::jsonb; x jsonb; md jsonb; cesta text; nahl text; nazov text; w int; h int;
begin
  if p_prilohy is null or jsonb_typeof(p_prilohy) = 'null' then return null; end if;
  if jsonb_typeof(p_prilohy) <> 'array' then raise exception 'Prílohy majú nesprávny tvar.'; end if;
  if jsonb_array_length(p_prilohy) = 0 then return null; end if;
  if jsonb_array_length(p_prilohy) > 10 then raise exception 'Naraz môžete poslať najviac 10 súborov.'; end if;
  for x in select e from jsonb_array_elements(p_prilohy) e loop
    if jsonb_typeof(x) <> 'object' then raise exception 'Prílohy majú nesprávny tvar.'; end if;
    cesta := coalesce(x->>'cesta', '');
    if left(cesta, length(p_predpona)) <> p_predpona or substr(cesta, length(p_predpona) + 1) !~ '^[0-9a-f-]{36}\.[a-z0-9]{1,5}$' then
      raise exception 'Príloha nepatrí do tejto konverzácie.';
    end if;
    select o.metadata into md from storage.objects o
      where o.bucket_id = 'chat-prilohy' and o.name = cesta and o.owner_id = auth.uid()::text;
    if not found then raise exception 'Súbor sa nenahral celý – skúste ho poslať znova.'; end if;
    nahl := nullif(x->>'nahlad', '');
    if nahl is not null then
      if left(nahl, length(p_predpona)) <> p_predpona or substr(nahl, length(p_predpona) + 1) !~ '^[0-9a-f-]{36}-n\.jpg$'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-prilohy' and o.name = nahl and o.owner_id = auth.uid()::text) then
        nahl := null;
      end if;
    end if;
    nazov := left(trim(regexp_replace(coalesce(x->>'nazov', ''), '[[:cntrl:]]', '', 'g')), 180);
    if nazov = '' then nazov := 'súbor'; end if;
    w := case when coalesce(x->>'w', '') ~ '^\d{1,5}$' then (x->>'w')::int end;
    h := case when coalesce(x->>'h', '') ~ '^\d{1,5}$' then (x->>'h')::int end;
    v := v || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'cesta', cesta, 'nazov', nazov, 'typ', coalesce(md->>'mimetype', 'application/octet-stream'),
      'velkost', nullif(md->>'size', '')::bigint, 'w', w, 'h', h, 'nahlad', nahl)));
  end loop;
  return v;
end $$;
revoke execute on function public._chat_prilohy(jsonb, text) from public, anon, authenticated;

-- krátky popis príloh do upozornení a náhľadov: „📷 Fotka“, „📎 zmluva.pdf“, „📷 3 fotky“, „📎 4 súbory“
create or replace function public._chat_nahlad(p_text text, p_prilohy jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare n int; f int; t text;
begin
  if p_prilohy is null or jsonb_typeof(p_prilohy) <> 'array' or jsonb_array_length(p_prilohy) = 0 then return coalesce(p_text, ''); end if;
  n := jsonb_array_length(p_prilohy);
  select count(*) into f from jsonb_array_elements(p_prilohy) e where e->>'typ' like 'image/%';
  t := case
    when n = 1 and f = 1 then '📷 Fotka'
    when n = 1 then '📎 ' || coalesce(p_prilohy->0->>'nazov', 'Súbor')
    when f = n then '📷 ' || n || case when n <= 4 then ' fotky' else ' fotiek' end
    else '📎 ' || n || case when n <= 4 then ' súbory' else ' súborov' end end;
  return concat_ws(' · ', nullif(trim(coalesce(p_text, '')), ''), t);
end $$;
revoke execute on function public._chat_nahlad(text, jsonb) from public, anon, authenticated;

-- spoločný chat: správa s textom, prílohami alebo oboma
-- (pôvodná poslat_spravu(text) ostáva pre správy bez príloh; táto má prílohy povinne ako druhý údaj)
create or replace function public.poslat_spravu(p_text text, p_prilohy jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, '')); v_id bigint; v_pr jsonb;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  v_pr := _chat_prilohy(p_prilohy, 'tim/');
  if v = '' and v_pr is null then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into spravy (makler_id, text, prilohy) values (auth.uid(), v, v_pr) returning id into v_id;
  update makleri set chat_precitane = now() where id = auth.uid();
  return v_id;
end $$;
revoke execute on function public.poslat_spravu(text, jsonb) from public, anon;
grant execute on function public.poslat_spravu(text, jsonb) to authenticated;

-- súkromná správa kolegovi: text, prílohy alebo oboje (pôvodná bez príloh ostáva)
create or replace function public.poslat_sukromnu_spravu(p_komu uuid, p_text text, p_prilohy jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_text, '')); v_id bigint; v_pr jsonb;
begin
  perform _over_aktivny();
  if not ma_pristup('chat') then raise exception 'Nemáte prístup k chatu.'; end if;
  if p_komu is null or p_komu = auth.uid() then raise exception 'Vyberte kolegu, ktorému správu posielate.'; end if;
  if not exists (select 1 from makleri where id = p_komu and aktivny and (rola = 'admin' or 'chat' = any(pristup))) then
    raise exception 'Tento kolega nemá prístup k chatu.';
  end if;
  v_pr := _chat_prilohy(p_prilohy, 'dm/' || auth.uid()::text || '/' || p_komu::text || '/');
  if v = '' and v_pr is null then raise exception 'Správa je prázdna.'; end if;
  if length(v) > 2000 then raise exception 'Správa je príliš dlhá (max. 2000 znakov).'; end if;
  insert into sukromne_spravy (od_id, komu_id, text, prilohy) values (auth.uid(), p_komu, v, v_pr) returning id into v_id;
  update sukromne_spravy set precitane = now() where komu_id = auth.uid() and od_id = p_komu and precitane is null;
  return v_id;
end $$;
revoke execute on function public.poslat_sukromnu_spravu(uuid, text, jsonb) from public, anon;
grant execute on function public.poslat_sukromnu_spravu(uuid, text, jsonb) to authenticated;

-- zmazanie správy: zmizne text aj zoznam príloh (súbory v úložisku zmaže aplikácia hneď potom)
create or replace function public.zmazat_spravu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  perform _over_aktivny();
  select makler_id into v_autor from spravy where id = p_id;
  if not found then return; end if;
  if v_autor is distinct from auth.uid() and not ja_admin() then raise exception 'Zmazať môžete len svoju správu.'; end if;
  update spravy set zmazane = now(), text = '', prilohy = null where id = p_id;
end $$;

create or replace function public.zmazat_sukromnu_spravu(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  perform _over_aktivny();
  select od_id into v_autor from sukromne_spravy where id = p_id;
  if not found then return; end if;
  if v_autor is distinct from auth.uid() then raise exception 'Zmazať môžete len svoju správu.'; end if;
  update sukromne_spravy set zmazane = now(), text = '', prilohy = null where id = p_id;
end $$;

-- upozornenia do mobilu: pri správe len s fotkou alebo dokumentom ukážeme, čo prišlo
create or replace function public._push_tim_sprava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.typ <> 'sprava' or new.makler_id is null or new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.aktivny and m.id <> new.makler_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ ' || _meno(new.makler_id) || ' · tímový chat', _chat_nahlad(new.text, new.prilohy), './#chat', 'typek-chat');
  return new;
exception when others then return new;
end $$;

create or replace function public._push_sukromna_sprava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.zmazane is not null then return new; end if;
  perform _push_zaradit(
    (select array_agg(m.id) from makleri m where m.id = new.komu_id and (m.rola = 'admin' or 'chat' = any(m.pristup))),
    'spravy', '✉️ Správa od: ' || _meno(new.od_id), _chat_nahlad(new.text, new.prilohy), './#chat/' || new.od_id, 'typek-dm-' || new.od_id);
  return new;
exception when others then return new;
end $$;

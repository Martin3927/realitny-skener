-- 17. 11. 2026 (druhá dávka opráv):
--  • Obnova zabudnutého hesla e-mailom – tabuľka pokusov (ochrana pred zneužitím; píše do nej len funkcia makleri).
--  • Záznam chýb, ktoré vidia makléri v aplikácii – číta ho len hlavný správca Týpka v Správe zákazníkov.
--  • Zvyšné pravidlá prístupu overujú makléra raz na dotaz (nie pri každom riadku) – rovnaká úprava ako v 129,
--    teraz pre všetky tabuľky. Kto čo vidí, sa nemení: overené na živých údajoch pre každého makléra, cudzí účet
--    aj neprihláseného návštevníka (630 porovnaní počtu riadkov pred a po, bez rozdielu).

-- ---------------------------------------------------------------- obnova hesla
create table if not exists public.obnova_hesla_pokusy (
  id bigint generated always as identity primary key,
  cas timestamptz not null default now(),
  email text not null,
  ip text
);
create index if not exists obnova_hesla_pokusy_cas on public.obnova_hesla_pokusy (cas);
alter table public.obnova_hesla_pokusy enable row level security;
revoke all on public.obnova_hesla_pokusy from anon, authenticated;

-- ---------------------------------------------------------------- chyby v aplikácii
create table if not exists public.chyby_aplikacie (
  id bigint generated always as identity primary key,
  cas timestamptz not null default now(),
  makler_id uuid,
  kancelaria_id bigint,
  sprava text not null,
  kde text,
  zariadenie text,
  verzia text
);
create index if not exists chyby_aplikacie_cas on public.chyby_aplikacie (cas desc);
create index if not exists chyby_aplikacie_makler on public.chyby_aplikacie (makler_id, cas desc);
alter table public.chyby_aplikacie enable row level security;
revoke all on public.chyby_aplikacie from anon, authenticated;

-- zápis chyby z aplikácie; najviac 40 za hodinu od jedného makléra (aby sa záznam nedal zahltiť)
create or replace function public.zapis_chybu(p_sprava text, p_kde text default null, p_zariadenie text default null, p_verzia text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ja uuid := auth.uid();
begin
  if v_ja is null or coalesce(btrim(p_sprava), '') = '' then return; end if;
  if (select count(*) from chyby_aplikacie where makler_id = v_ja and cas > now() - interval '1 hour') >= 40 then return; end if;
  insert into chyby_aplikacie (makler_id, kancelaria_id, sprava, kde, zariadenie, verzia)
  values (v_ja, (select kancelaria_id from makleri where id = v_ja), left(p_sprava, 500), left(p_kde, 120), left(p_zariadenie, 200), left(p_verzia, 30));
end $$;
revoke all on function public.zapis_chybu(text, text, text, text) from public, anon;
grant execute on function public.zapis_chybu(text, text, text, text) to authenticated;

-- prehľad pre hlavného správcu Týpka (Správa zákazníkov → Chyby v aplikácii)
create or replace function public.chyby_prehlad(p_dni int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not je_hlavny_spravca() then raise exception 'Chyby vidí len hlavný správca.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by x.cas desc) from (
      select c.id, c.cas, c.sprava, c.kde, c.zariadenie, c.verzia,
             coalesce(m.meno, m.email, '—') as makler, coalesce(k.nazov, '—') as kancelaria
      from chyby_aplikacie c
      left join makleri m on m.id = c.makler_id
      left join kancelarie k on k.id = c.kancelaria_id
      where c.cas > now() - make_interval(days => least(greatest(coalesce(p_dni, 7), 1), 30))
      order by c.cas desc limit 300) x), '[]'::jsonb);
end $$;
revoke all on function public.chyby_prehlad(int) from public, anon;
grant execute on function public.chyby_prehlad(int) to authenticated;

select cron.schedule('upratat-chyby-aplikacie', '27 2 * * *',
  $$delete from public.chyby_aplikacie where cas < now() - interval '30 days'$$);

-- ---------------------------------------------------------------- pravidlá prístupu: overenie raz na dotaz
do $$
declare r record; q text; w text;
  f text := '(?:public\.)?(?:ja_aktivny|ja_admin|je_hlavny_spravca|moja_kancelaria|aktivna_kancelaria|ja_vidim_podhodnotene)\(\)|auth\.uid\(\)|(?:public\.)?ma_pristup\(''[a-z_]+''::text\)';
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    -- už zabalené volania sa najprv rozbalia, potom sa zabalia všetky rovnako: (select funkcia())
    q := regexp_replace(regexp_replace(r.qual, '\( SELECT (' || f || ') AS \w+\)', '\1', 'g'), '(?<![\w.])(' || f || ')', '(select \1)', 'g');
    w := regexp_replace(regexp_replace(r.with_check, '\( SELECT (' || f || ') AS \w+\)', '\1', 'g'), '(?<![\w.])(' || f || ')', '(select \1)', 'g');
    if q is not distinct from r.qual and w is not distinct from r.with_check then continue; end if;
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || case when q is not null then ' using (' || q || ')' else '' end
      || case when w is not null then ' with check (' || w || ')' else '' end;
  end loop;
end $$;

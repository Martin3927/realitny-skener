-- OCHRANA ÚČTU HLAVNÉHO SPRÁVCU (audit 18. 11. 2026, bod 1)
-- Hlavný správca Týpka má účet v kancelárii 1 (Alpha Reality). Strážca maklérov doteraz kontroloval len kanceláriu,
-- takže iný administrátor Alpha mohol hlavnému správcovi zobrať rolu, deaktivovať ho alebo mu zmeniť prístup k sekciám.
-- Po novom: účet hlavného správcu mení len hlavný správca (on sám alebo iný hlavný správca).
-- Výnimka: hromadné úpravy tímu, ktoré robí administrátor kancelárie a účet neohrozujú –
--   farby (nastavit_farby_timu s prepísaním) a sprievodca_videny (obnovit_sprievodcu).
-- Zmenu hesla stráži osobitne edge funkcia makleri (heslo sa mení cez prihlasovanie Supabase, nie cez túto tabuľku).
create or replace function public._straz_maklera() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ja uuid := auth.uid();
begin
  if v_ja is null or not exists (select 1 from makleri where id = v_ja) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.id <> v_ja
     and not (old.kancelaria_id = any(array[aktivna_kancelaria(), moja_kancelaria()])) then
    raise exception 'Tento maklér patrí inej kancelárii.' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.id <> v_ja
     and exists (select 1 from hlavni_spravcovia h where h.user_id = old.id)
     and not je_hlavny_spravca()
     and (tg_op = 'DELETE'
          or (to_jsonb(new) - array['farby', 'sprievodca_videny']) is distinct from (to_jsonb(old) - array['farby', 'sprievodca_videny'])) then
    raise exception 'Účet hlavného správcu môže meniť len hlavný správca.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not (new.kancelaria_id = any(array[aktivna_kancelaria(), moja_kancelaria()])) then
    raise exception 'Makléra sa nedá pridať do inej kancelárie.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.kancelaria_id is distinct from old.kancelaria_id and not je_hlavny_spravca() then
    raise exception 'Makléra sa nedá presunúť do inej kancelárie.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public._straz_maklera() from public, anon, authenticated;

-- =====================================================================
-- 141: ToDo List sa zapína maklérom v Makléroch (právo „todo“, ako „Používa AI“)
--  * administrátor ho má vždy, maklér len keď mu ho administrátor zapne (predvolene vypnutý)
--  * úlohy makléra sa pri vypnutí nemažú – len ich v aplikácii nevidí
-- =====================================================================
create or replace function public.nastavit_pristup_maklera(p_id uuid, p_pristup text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _over_admin();
  if exists (select 1 from unnest(coalesce(p_pristup, '{}')) x
             where x not in ('inzeraty', 'schrankovanie', 'nehnutelnosti', 'klienti', 'chat', 'matterport', 'kalendar', 'mapa', 'kataster', 'asistent', 'web',
                             'recenzie', 'provizie', 'siete', 'odhady', 'kontakty', 'todo')) then
    raise exception 'Neznáma sekcia.';
  end if;
  update makleri set pristup = coalesce(p_pristup, '{}') where id = p_id;
end $$;

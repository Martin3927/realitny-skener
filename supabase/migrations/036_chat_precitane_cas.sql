-- =====================================================================
-- Chat: „prečítané“ sa zapisuje podľa času poslednej videnej správy (čas servera),
-- nie podľa hodín v počítači makléra – inak pri zle nastavených hodinách
-- nevyskočilo okno s obálkou pri novej správe v spoločnom chate.
-- =====================================================================
create or replace function public.chat_precitane_do(p_cas timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _over_aktivny();
  update makleri set chat_precitane = greatest(coalesce(chat_precitane, '-infinity'::timestamptz), least(coalesce(p_cas, now()), now()))
  where id = auth.uid();
end $$;
revoke execute on function public.chat_precitane_do(timestamptz) from public, anon;
grant execute on function public.chat_precitane_do(timestamptz) to authenticated;

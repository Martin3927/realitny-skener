-- =====================================================================
-- Administrátor zapne maklérovi (alebo všetkým) prehliadku aplikácie znova –
-- spustí sa pri najbližšom otvorení aplikácie.
-- =====================================================================
create or replace function public.obnovit_sprievodcu(p_id uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform _over_admin();
  update makleri set sprievodca_videny = null
   where aktivny and (case when p_id is null then id <> auth.uid() else id = p_id end);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.obnovit_sprievodcu(uuid) from public, anon;
grant execute on function public.obnovit_sprievodcu(uuid) to authenticated;

insert into public.novinky (nazov, popis, ciel, pre_koho) values
  ('Zmena hesla jedným klikom', 'Hore v lište je zlaté tlačidlo s kľúčom. Ťukneš naň a hneď si zmeníš heslo.', 'heslo', 'vsetci'),
  ('Prehliadku zapneš maklérovi znova', 'V Makléroch pri maklérovi klikneš na Zapnúť prehliadku znova – spustí sa mu pri najbližšom otvorení aplikácie. V Nastaveniach tímu ju zapneš aj všetkým naraz.', 'makleri', 'admin');

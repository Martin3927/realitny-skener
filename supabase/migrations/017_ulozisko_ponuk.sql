-- =====================================================================
-- Úložisko pre ponuky: fotky (verejné) a dokumenty (súkromné)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ponuky', 'ponuky', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('ponuky-dokumenty', 'ponuky-dokumenty', false, 20971520)
on conflict (id) do nothing;

-- fotky: nahrávať môže každý aktívny maklér, čítať ktokoľvek (sú verejné na webe)
do $$ begin
  create policy ponuky_fotky_nahrat on storage.objects for insert to authenticated
    with check (bucket_id = 'ponuky' and public.ja_aktivny());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ponuky_fotky_citat on storage.objects for select to anon, authenticated
    using (bucket_id = 'ponuky');
exception when duplicate_object then null; end $$;

-- dokumenty: každý maklér do svojho priečinka (prvý priečinok = jeho id), číta on a administrátor
do $$ begin
  create policy ponuky_dok_nahrat on storage.objects for insert to authenticated
    with check (bucket_id = 'ponuky-dokumenty' and public.ja_aktivny() and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ponuky_dok_citat on storage.objects for select to authenticated
    using (bucket_id = 'ponuky-dokumenty' and public.ja_aktivny() and ((storage.foldername(name))[1] = auth.uid()::text or public.ja_admin()));
exception when duplicate_object then null; end $$;

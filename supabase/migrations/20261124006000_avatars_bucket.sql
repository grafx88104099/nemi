-- Хэрэглэгчийн бүртгэлийн зураг (profiles.avatar_url). Агентын зарын картын зураг (agents.avatar_url) тусдаа.
--
-- Нийтийн bucket: зураг /storage/v1/object/public/avatars/... холбоосоор RLS-гүй уншигдана
-- (Topbar, чат). Жагсаалт/хайлтыг нийтэд нээхгүй — SELECT бодлого зөвхөн өөрийн хавтсанд
-- (storage-ийн remove() устгахын өмнө мөрөө уншдаг тул хэрэгтэй).
-- Зам: <auth.uid()>/<файл> — хэрэглэгч зөвхөн өөрийн хавтсанд бичиж, устгана.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_own_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

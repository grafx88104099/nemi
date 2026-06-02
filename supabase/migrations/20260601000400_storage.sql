-- ============================================================
-- Storage: зарын зургийн bucket (Phase 6)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('listings', 'listings', true)
on conflict (id) do nothing;

-- Нийтэд унших
create policy "listings_public_read"
  on storage.objects for select
  using (bucket_id = 'listings');

-- Нэвтэрсэн хэрэглэгч (агент) upload хийнэ
create policy "listings_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listings');

-- Зөвхөн эзэмшигч засах/устгах
create policy "listings_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'listings' and owner = auth.uid());

create policy "listings_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listings' and owner = auth.uid());

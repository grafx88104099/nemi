-- ============================================================
-- Оффисын баялаг профайл (олон улсын best-practice)
-- лого/ковер зураг, лиценз, сошл, тусгай чиглэл, үйлчлэх бүс
-- ============================================================
alter table public.offices
  add column if not exists logo_url text,
  add column if not exists cover_url text,
  add column if not exists license_no text,
  add column if not exists facebook text,
  add column if not exists instagram text,
  add column if not exists specialties text[] not null default '{}',
  add column if not exists service_areas text[] not null default '{}';

-- ---------- Storage: оффисын зургийн bucket ----------
insert into storage.buckets (id, name, public)
values ('office-assets', 'office-assets', true)
on conflict (id) do nothing;

create policy "office_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'office-assets');

create policy "office_assets_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'office-assets');

create policy "office_assets_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'office-assets' and owner = auth.uid());

create policy "office_assets_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'office-assets' and owner = auth.uid());

-- ============================================================
-- Мобайл аппын дэмжлэг (v1.0):
--   app_config        — нэг мөртэй тохиргоо (min version kill switch)
--   analytics_events  — insert-only аналитик sink (anon insert зөвшөөрнө)
-- SELECT/удирдлага нь service-role only (шаардлагатай policy-г зориуд бичээгүй).
-- ============================================================

-- ---------- app_config ----------
-- Нэг мөртэй хүснэгт: id нь үргэлж true (check-ээр хоёр дахь мөрийг хаана).
create table public.app_config (
  id                    boolean primary key default true check (id),
  min_supported_version text not null default '1.0.0',
  updated_at            timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Апп launch бүрт уншина — anon ч уншиж чадах ёстой.
create policy app_config_select on public.app_config for select
  using (true);
-- INSERT/UPDATE/DELETE policy зориуд байхгүй — зөвхөн service-role бичнэ.

insert into public.app_config (id, min_supported_version) values (true, '1.0.0');

-- ---------- analytics_events ----------
create table public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  props      jsonb not null default '{}',
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index analytics_events_event_idx on public.analytics_events (event, created_at);

alter table public.analytics_events enable row level security;

-- Insert-only: anon хайлтын лог (user_id null) болон нэвтэрсэн хэрэглэгчийн
-- өөрийн event-ийг зөвшөөрнө. SELECT/UPDATE/DELETE policy байхгүй — service-role only.
create policy analytics_events_insert on public.analytics_events for insert
  with check (user_id is null or user_id = auth.uid());

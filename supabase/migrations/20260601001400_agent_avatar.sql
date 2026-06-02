-- ============================================================
-- Агентын профайл зураг (фото). avatar нь товчлол хэвээр (fallback).
-- Зургийг office-assets bucket-д хадгална.
-- ============================================================
alter table public.agents
  add column if not exists avatar_url text;

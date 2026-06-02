-- ============================================================
-- Оффисын нэмэлт талбарууд (тайлбар, холбоо барих)
-- ============================================================
alter table public.offices
  add column if not exists description text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text;

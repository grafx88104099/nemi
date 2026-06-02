-- ============================================================
-- Оффисын танилцуулга талбарууд
-- ============================================================
alter table public.offices
  add column if not exists about text,        -- дэлгэрэнгүй танилцуулга
  add column if not exists website text,       -- вэбсайт
  add column if not exists founded_year int;   -- байгуулагдсан он

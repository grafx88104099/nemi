-- ============================================================
-- Аудитын засварууд:
-- 1) ai_valuations-д INSERT policy (өмнө байгаагүй тул эзэмшигчийн
--    бичилт чимээгүй амжилтгүй болдог байсан)
-- 2) viewings хүснэгтэд индекс (agent_id, scheduled_at) — дашборд
--    болгон .eq(agent_id).order(scheduled_at) ажиллуулдаг
-- ============================================================

-- 1) ai_valuations INSERT — зөвхөн тухайн зарыг удирдах эрхтэй хүн.
create policy ai_valuations_insert on public.ai_valuations for insert
  with check (public.can_manage_listing(listing_id));

-- 2) viewings индексүүд.
create index if not exists viewings_agent_idx on public.viewings (agent_id, scheduled_at);

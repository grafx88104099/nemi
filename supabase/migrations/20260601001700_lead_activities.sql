-- ============================================================
-- CRM Phase 1 — Дуудлага/ярианы лог (activity timeline)
-- Лид бүрд хийсэн дуудлага, уулзалт, тэмдэглэлийг товч агуулгатайгаар
-- хөтөлнө. Шинэ лог нэмэхэд leads.last_activity_at автомат шинэчлэгдэнэ.
-- ============================================================

create type activity_kind as enum ('call', 'meeting', 'message', 'note', 'viewing', 'email');

create table public.lead_activities (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents(id) on delete cascade,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  kind          activity_kind not null default 'call',
  summary       text not null,                 -- ярианы товч агуулга
  outcome       text,                          -- үр дүн / дараагийн алхам
  duration_min  int,                           -- дуудлагын урт (минут)
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index lead_activities_lead_idx  on public.lead_activities (lead_id, occurred_at desc);
create index lead_activities_agent_idx on public.lead_activities (agent_id);

-- Лидэд «сүүлд холбогдсон» огноо (лог нэмэхэд автомат шинэчилнэ).
alter table public.leads add column last_activity_at timestamptz;

create or replace function public.bump_lead_last_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.leads
     set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
   where id = new.lead_id;
  return new;
end; $$;

create trigger lead_activities_bump
  after insert on public.lead_activities
  for each row execute function public.bump_lead_last_activity();

-- RLS — лидийн адил агент/оффис scoping.
alter table public.lead_activities enable row level security;
create policy lead_activities_all on public.lead_activities for all
  using (public.can_manage_agent(agent_id))
  with check (public.can_manage_agent(agent_id));

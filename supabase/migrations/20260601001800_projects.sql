-- ============================================================
-- CRM Phase 3 — Төсөл (үйлчлүүлэгчийн гэрээ/ажиллагаа)
-- Нэг үйлчлүүлэгчийн худалдан авах/зарах ажиллагааг эхнээс
-- хаах хүртэл дагаж, холбоотой лид, дуудлага, төсөв, эцсийн
-- хугацааг нэг дор хадгална.
-- ============================================================

create type project_type as enum ('buy', 'sell', 'rent_out', 'rent_in');
create type project_status as enum ('active', 'won', 'lost', 'on_hold');

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references public.agents(id) on delete cascade,
  title            text not null,
  client_name      text,
  client_phone     text,
  type             project_type not null default 'buy',
  status           project_status not null default 'active',
  budget_min       bigint,
  budget_max       bigint,
  target_area      text,
  deadline         date,
  note             text,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index projects_agent_idx on public.projects (agent_id, status);

-- Лидийг төсөлд холбоно.
alter table public.leads add column project_id uuid references public.projects(id) on delete set null;
create index leads_project_idx on public.leads (project_id);

-- Үйл явдлыг лид ЭСВЭЛ төсөлд хавсаргаж болохоор.
alter table public.lead_activities alter column lead_id drop not null;
alter table public.lead_activities add column project_id uuid references public.projects(id) on delete cascade;
alter table public.lead_activities add constraint activity_target_chk
  check (lead_id is not null or project_id is not null);
create index lead_activities_project_idx on public.lead_activities (project_id, occurred_at desc);

-- «Сүүлд холбогдсон»-г лид ба төсөл хоёуланд нь шинэчилнэ.
create or replace function public.bump_lead_last_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    update public.leads set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.lead_id;
  end if;
  if new.project_id is not null then
    update public.projects set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.project_id;
  end if;
  return new;
end; $$;

-- RLS — лидийн адил агент/оффис scoping.
alter table public.projects enable row level security;
create policy projects_all on public.projects for all
  using (public.can_manage_agent(agent_id))
  with check (public.can_manage_agent(agent_id));

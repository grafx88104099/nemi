-- ════════════════════════════════════════════════════════════
-- U7 crm-weekly-cycle (PMC-CRM-PRO-001 v2.1 §5 RACI, §6.19–§6.25, §6.30,
-- §9.1, §9.5, §9.6)
--   • crm_weekly_plans (+ зорилт, шилдэг хэлцэл / тэргүүлэх ажил / саад,
--     амлалтын түүх) — агент бөглөнө, багийн ахлагч батална.
--   • crm_weekly_reviews — Баасан гарагийн дүн шинжилгээ (§6.24, §9.6).
--   • crm_weekly_actuals, crm_weekly_scores, crm_agent_daily_stats — ЗӨВХӨН
--     систем бичнэ (service role). Хэрэглэгчид бичих эрх, policy байхгүй:
--     гүйцэтгэлийг гараар засах зам хаалттай (§6.30).
--   • crm_next_step_log — дараагийн үйлдлийн огнооны түүх (§6.25.5
--     «хугацаандаа» хувь, §6.19.13 хугацаа хэтэрсэн эргэн холбогдолт).
--   • crm_sales_meetings, crm_meeting_decisions — хурлын горим (§6.30, §9.5).
--   • crm_properties.activated_at — «Шинэ листинг» (§6.19.7).
--   • Тохиргоо 'weekly_cycle' (Ш5, Ш7, Ш8, Ш9-ийн анхдагч санал).
-- Хамаарал: 20261107001750.
-- ════════════════════════════════════════════════════════════

-- ── 1. Тохиргоо ──

do $$
declare o record; v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;
    if not exists (select 1 from public.crm_settings
                   where office_id = o.office_id and key = 'weekly_cycle' and valid_to is null) then
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, 'weekly_cycle',
        '{"meeting": {"weekday": 1, "time": "10:00", "duration_min": 60},
          "review": {"weekday": 5, "time": "16:00"},
          "final_lock_offset_hours": 0,
          "plan_reminder_hours": 16,
          "meeting_reminder_min": 30,
          "default_targets": {"outbound_contacts": 25, "meaningful_conversations": 10,
                              "qualified_leads": 3, "showings": 3, "offers": 1,
                              "stage_advances": 5, "closed_deals": 1},
          "outbound_channels": ["call", "chat", "email"],
          "conversation_channels": ["call", "chat", "meeting"],
          "na_policy": "rescale",
          "new_agent": {"enabled": false, "days": 90,
                        "weights": {"activity": 25, "pipeline": 25, "progress": 20,
                                    "closing": 10, "followup": 10, "quality": 10}},
          "coaching": {"overdue_followups_min": 5, "consecutive_weeks": 2,
                       "score_below": 50, "task_due_days": 3},
          "anomaly": {"score_below": 50, "overdue_min": 5, "gap_pct": 50},
          "agenda": [{"key": "dashboard", "minutes": 10}, {"key": "agents", "minutes": 25},
                     {"key": "pipeline", "minutes": 15}, {"key": "coaching", "minutes": 10}],
          "agent_slot_min": 3, "agent_slot_max": 5,
          "approver_fallback_roles": ["sales_director"]}'::jsonb,
        v_creator, 'PRO-001 v2.1 §6.19–§6.25, §6.30 — долоо хоногийн мөчлөг (Ш5, Ш7, Ш8, Ш9)');
    end if;
  end loop;
end $$;

-- БХЗ мөчлөгийн тохиргоог засна (өмнөх жагсаалт + weekly_cycle).
create or replace function public.crm_setting_writable(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sysadmin', 'ops_qc')
      or (public.has_crm_role('sales_director') and p_key in (
            'lead_score_weights', 'lead_score_factors', 'lead_grade_thresholds',
            'inactivity_thresholds', 'recycle_thresholds', 'recontact_frequency', 'recontact_ranges',
            'automation_thresholds', 'sla_policy', 'sla_first_contact_min',
            'lead_assignment', 'lead_accept', 'pool_settings', 'lead_dispute',
            'match_weights', 'match_thresholds', 'weekly_targets', 'agent_score_weights',
            'kpi_targets', 'kpi_scope', 'weekly_cycle'))
      or (public.has_crm_role('marketing') and p_key in ('marketing_costs', 'campaign_costs'));
$$;

-- ── 2. «Шинэ листинг»: идэвхжсэн мөч ──

alter table public.crm_properties add column if not exists activated_at timestamptz;

create or replace function public.crm_property_activated()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.activated_at is not null then
      new.activated_at := old.activated_at; -- анх идэвхжсэн мөч өөрчлөгдөхгүй
      return new;
    end if;
    if old.status = 'active' then
      return new;
    end if;
  end if;
  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists crm_properties_activated on public.crm_properties;
create trigger crm_properties_activated before insert or update of status, activated_at on public.crm_properties
  for each row execute function public.crm_property_activated();

alter table public.crm_properties disable trigger crm_properties_updated_at;
update public.crm_properties p
set activated_at = coalesce(
  (select min(a.created_at) from public.crm_audit_log a
   where a.entity = 'crm_properties' and a.entity_id = p.id and a.field = 'status'
     and a.new_value::text like '%active%'),
  p.created_at)
where p.activated_at is null and p.status in ('active', 'reserved', 'sold', 'rented');
alter table public.crm_properties enable trigger crm_properties_updated_at;

create index if not exists crm_properties_activated_idx on public.crm_properties (office_id, activated_at)
  where activated_at is not null;

-- ── 3. Хандалтын туслахууд ──

-- Харах эрх: өөрөө, багийн ахлагч, БХЗ, ҮАМ, CEO, админ (§5 RACI).
create or replace function public.crm_weekly_can_view(p_agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_agent is not null and (
    p_agent = auth.uid()
    or public.crm_is_team_of(p_agent)
    or (public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'sysadmin')
        and exists (select 1 from public.crm_staff s
                    where s.profile_id = p_agent and s.office_id = public.crm_office_id()))
  );
$$;

-- Батлах эрх (§5: багийн ахлагч A). Өөрийн картыг хэн ч батлахгүй. Багт өөр
-- ахлагч байхгүй (эсвэл агент өөрөө ахлагч — Ш9) бол тохиргооны нөөц дүр (БХЗ).
create or replace function public.crm_weekly_can_approve(p_agent uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_staff record; v_has_lead boolean; v_fallback boolean;
begin
  if p_agent is null or auth.uid() is null or p_agent = auth.uid() then return false; end if;
  select s.office_id, s.team_id into v_staff
  from public.crm_staff s where s.profile_id = p_agent and s.office_id = public.crm_office_id() limit 1;
  if not found then return false; end if;
  if public.crm_is_team_of(p_agent) then return true; end if;
  v_has_lead := v_staff.team_id is not null and exists (
    select 1 from public.crm_staff t
    where t.office_id = v_staff.office_id and t.team_id = v_staff.team_id and t.is_active
      and 'team_lead' = any(t.roles) and t.profile_id <> p_agent);
  if v_has_lead then return false; end if;
  select exists (
    select 1 from jsonb_array_elements_text(
      coalesce(public.crm_setting_at(v_staff.office_id, 'weekly_cycle') -> 'approver_fallback_roles',
               '["sales_director"]'::jsonb)) r
    where r = any(public.crm_my_roles()::text[])) into v_fallback;
  return coalesce(v_fallback, false);
end $$;

-- Эцсийн түгжээ: Ням 24:00 (УБ) + тохиргооны цаг (Ш8).
create or replace function public.crm_weekly_final_lock_at(p_office uuid, p_week date)
returns timestamptz language sql stable security definer set search_path = public as $$
  select ((p_week + 7)::timestamp at time zone 'Asia/Ulaanbaatar')
         + make_interval(hours => public.crm_setting_num(p_office, 'weekly_cycle',
                                                          array['final_lock_offset_hours'], 0)::int);
$$;

-- ── 4. Дараагийн үйлдлийн түүх ──

create table if not exists public.crm_next_step_log (
  id bigserial primary key,
  office_id uuid not null references public.offices(id) on delete restrict,
  entity text not null,
  entity_id uuid not null,
  owner_id uuid references public.profiles(id),
  due_on date not null,
  set_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  constraint crm_nsl_entity check (entity in ('lead', 'opportunity')),
  constraint crm_nsl_resolution check (resolution is null or resolution in ('done', 'late', 'rescheduled', 'closed')),
  constraint crm_nsl_resolved check ((resolved_at is null) = (resolution is null))
);
create unique index if not exists crm_next_step_log_open
  on public.crm_next_step_log (entity, entity_id) where resolved_at is null;
create index if not exists crm_next_step_log_owner_due
  on public.crm_next_step_log (office_id, owner_id, due_on);

-- Огноо солигдох / бүртгэл хаагдах бүрд өмнөх алхмыг шийднэ:
--  done — алхам тавигдсанаас хойш утга бүхий холболт бүртгэгдэж, огноондоо;
--  late — огноо өнгөрсний дараа шийдэгдсэн;
--  rescheduled — огнооноос өмнө холболтгүйгээр хойшлуулсан (хуваагчид орохгүй);
--  closed — огнооноос өмнө бүртгэл хаагдсан (хуваагчид орохгүй).
create or replace function public.crm_next_step_log_sync(
  p_office uuid, p_entity text, p_id uuid, p_owner uuid, p_due date, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_done boolean; v_today date := public.crm_ub_today();
begin
  select * into r from public.crm_next_step_log
  where entity = p_entity and entity_id = p_id and resolved_at is null
  for update;
  if found then
    if p_open and p_due is not distinct from r.due_on then
      if r.owner_id is distinct from p_owner then
        update public.crm_next_step_log set owner_id = p_owner where id = r.id;
      end if;
      return;
    end if;
    select exists (
      select 1 from public.crm_activities a
      where a.is_meaningful and a.created_at >= r.set_at
        and ((p_entity = 'lead' and a.lead_id = p_id) or (p_entity = 'opportunity' and a.opportunity_id = p_id))
    ) into v_done;
    update public.crm_next_step_log
    set resolved_at = now(),
        resolution = case
          when v_today > r.due_on then 'late'
          when v_done then 'done'
          when not p_open then 'closed'
          else 'rescheduled' end
    where id = r.id;
  end if;
  if p_open and p_due is not null then
    insert into public.crm_next_step_log (office_id, entity, entity_id, owner_id, due_on)
    values (p_office, p_entity, p_id, p_owner, p_due);
  end if;
end $$;

create or replace function public.crm_lead_next_step_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.crm_next_step_log_sync(new.office_id, 'lead', new.id, new.owner_id, new.next_step_date,
                                        new.status::text in ('new', 'active'));
  return null;
end $$;

create or replace function public.crm_opportunity_next_step_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.crm_next_step_log_sync(new.office_id, 'opportunity', new.id, new.owner_id, new.next_step_date,
                                        new.state::text = 'open');
  return null;
end $$;

drop trigger if exists crm_leads_next_step_log on public.crm_leads;
create trigger crm_leads_next_step_log after insert or update of next_step_date, status, owner_id on public.crm_leads
  for each row execute function public.crm_lead_next_step_log();
drop trigger if exists crm_opportunities_next_step_log on public.crm_opportunities;
create trigger crm_opportunities_next_step_log after insert or update of next_step_date, state, owner_id on public.crm_opportunities
  for each row execute function public.crm_opportunity_next_step_log();

-- Одоо нээлттэй алхмуудыг эхлэлийн түүх болгоно.
insert into public.crm_next_step_log (office_id, entity, entity_id, owner_id, due_on, set_at)
select l.office_id, 'lead', l.id, l.owner_id, l.next_step_date, coalesce(l.updated_at, l.created_at)
from public.crm_leads l
where l.next_step_date is not null and l.status::text in ('new', 'active')
  and not exists (select 1 from public.crm_next_step_log x where x.entity = 'lead' and x.entity_id = l.id and x.resolved_at is null);
insert into public.crm_next_step_log (office_id, entity, entity_id, owner_id, due_on, set_at)
select o.office_id, 'opportunity', o.id, o.owner_id, o.next_step_date, coalesce(o.updated_at, o.created_at)
from public.crm_opportunities o
where o.next_step_date is not null and o.state::text = 'open'
  and not exists (select 1 from public.crm_next_step_log x where x.entity = 'opportunity' and x.entity_id = o.id and x.resolved_at is null);

-- ── 5. Долоо хоногийн төлөвлөгөө (§6.19, §6.21) ──

create table if not exists public.crm_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  branch_id uuid references public.crm_branches(id),
  team_id uuid references public.crm_teams(id),
  week_start date not null,
  status text not null default 'draft',
  last_week_summary text,
  support_needed text,
  commitment text,
  prefilled_from uuid references public.crm_weekly_plans(id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  returned_by uuid references public.profiles(id),
  returned_at timestamptz,
  return_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_wp_monday check (extract(isodow from week_start) = 1),
  constraint crm_wp_status check (status in ('draft', 'submitted', 'approved', 'returned')),
  constraint crm_wp_uniq unique (office_id, agent_id, week_start)
);
create index if not exists crm_weekly_plans_week on public.crm_weekly_plans (office_id, week_start);

create table if not exists public.crm_weekly_plan_targets (
  plan_id uuid not null references public.crm_weekly_plans(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete restrict,
  metric_code text not null,
  target numeric(16,2),
  review_note text,
  next_action text,
  updated_at timestamptz not null default now(),
  primary key (plan_id, metric_code),
  constraint crm_wpt_code check (metric_code in (
    'outbound_contacts', 'meaningful_conversations', 'new_leads', 'qualified_leads',
    'owner_meetings', 'buyer_meetings', 'new_listings', 'showings', 'offers', 'negotiations',
    'closed_deals', 'expected_net_fee', 'overdue_followups', 'hot_contacts', 'revenue',
    'followup_on_time_pct', 'crm_completeness_pct', 'stage_advances')),
  constraint crm_wpt_target check (target is null or target >= 0)
);

create table if not exists public.crm_weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  plan_id uuid not null references public.crm_weekly_plans(id) on delete cascade,
  kind text not null,
  position smallint not null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  obstacle_id uuid references public.crm_lookups(id),
  text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_wpi_kind check (kind in ('top_deal', 'priority', 'obstacle', 'carry')),
  constraint crm_wpi_pos check (position between 1 and 6 and (kind = 'obstacle' or position <= 3)),
  constraint crm_wpi_content check (opportunity_id is not null or obstacle_id is not null or nullif(btrim(text), '') is not null),
  constraint crm_wpi_uniq unique (plan_id, kind, position)
);

-- Амлалтын түүх (§6.30 мөр 1015, §9(11)): агент, ахлагч audit_log-д хандахгүй тул тусдаа.
create table if not exists public.crm_weekly_commitment_log (
  id bigserial primary key,
  office_id uuid not null references public.offices(id) on delete restrict,
  plan_id uuid not null references public.crm_weekly_plans(id) on delete cascade,
  source text not null default 'plan',
  old_text text,
  new_text text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  constraint crm_wcl_source check (source in ('plan', 'meeting'))
);
create index if not exists crm_weekly_commitment_log_plan on public.crm_weekly_commitment_log (plan_id, changed_at);

-- ── 6. Баасан гарагийн дүн шинжилгээ (§6.24, §9.6) ──

create table if not exists public.crm_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  plan_id uuid not null unique references public.crm_weekly_plans(id) on delete cascade,
  agent_id uuid not null references public.profiles(id),
  week_start date not null,
  status text not null default 'draft',
  achieved_note text,
  missed_note text,
  conversion_note text,
  movement_note text,
  overdue_reason text,
  recovery_action text,
  lost_note text,
  revenue_note text,
  lessons text,
  coaching_need text,
  coaching_at timestamptz,
  coaching_task_id uuid references public.tasks(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  returned_by uuid references public.profiles(id),
  returned_at timestamptz,
  return_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_wr_status check (status in ('draft', 'submitted', 'approved', 'returned'))
);
create index if not exists crm_weekly_reviews_week on public.crm_weekly_reviews (office_id, week_start);

-- ── 7. Системийн бичлэг (гүйцэтгэл, оноо, өдрийн агшин зураг) ──

create table if not exists public.crm_weekly_actuals (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  week_start date not null,
  kind text not null,
  metrics jsonb not null default '{}'::jsonb,
  moves jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  constraint crm_wa_kind check (kind in ('preliminary', 'final')),
  constraint crm_wa_monday check (extract(isodow from week_start) = 1),
  constraint crm_wa_uniq unique (office_id, agent_id, week_start, kind)
);

create table if not exists public.crm_weekly_scores (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  week_start date not null,
  kind text not null,
  plan_id uuid references public.crm_weekly_plans(id) on delete set null,
  profile text not null default 'standard',
  weights jsonb not null,
  targets jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  total numeric(5,1) not null,
  computed_at timestamptz not null default now(),
  constraint crm_ws_kind check (kind in ('preliminary', 'final')),
  constraint crm_ws_profile check (profile in ('standard', 'new_agent')),
  constraint crm_ws_total check (total between 0 and 100),
  constraint crm_ws_uniq unique (office_id, agent_id, week_start, kind)
);
create index if not exists crm_weekly_scores_week on public.crm_weekly_scores (office_id, week_start);

create table if not exists public.crm_agent_daily_stats (
  office_id uuid not null references public.offices(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  day date not null,
  overdue_followups integer not null default 0,
  hot_contacts integer not null default 0,
  expected_net_fee numeric(16,2) not null default 0,
  completeness_pct numeric(5,1),
  computed_at timestamptz not null default now(),
  primary key (office_id, agent_id, day)
);

-- ── 8. Хурал (§6.30, §9.5) ──

create table if not exists public.crm_sales_meetings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  kind text not null,
  week_start date not null,
  branch_id uuid references public.crm_branches(id),
  team_id uuid references public.crm_teams(id),
  facilitator_id uuid not null references public.profiles(id),
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  sections jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_sm_kind check (kind in ('monday', 'friday')),
  constraint crm_sm_status check (status in ('in_progress', 'done')),
  constraint crm_sm_monday check (extract(isodow from week_start) = 1)
);
create index if not exists crm_sales_meetings_week on public.crm_sales_meetings (office_id, week_start);

create table if not exists public.crm_meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  meeting_id uuid not null references public.crm_sales_meetings(id) on delete cascade,
  plan_id uuid references public.crm_weekly_plans(id) on delete set null,
  agent_id uuid references public.profiles(id),
  kind text not null,
  text text not null,
  owner_id uuid references public.profiles(id),
  due_on date,
  status text not null default 'open',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_md_kind check (kind in ('decision', 'commitment', 'coaching', 'obstacle')),
  constraint crm_md_status check (status in ('open', 'done')),
  constraint crm_md_text check (length(btrim(text)) >= 3)
);
create index if not exists crm_meeting_decisions_plan on public.crm_meeting_decisions (plan_id);
create index if not exists crm_meeting_decisions_meeting on public.crm_meeting_decisions (meeting_id);

-- ── 9. Хамгаалалт (trigger) ──

create or replace function public.crm_weekly_plan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner boolean; v_locked boolean; v_content boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then return new; end if;
    if new.agent_id <> auth.uid() then
      raise exception 'CRM_WEEK: долоо хоногийн картыг агент өөрөө үүсгэнэ';
    end if;
    if new.status <> 'draft' then raise exception 'CRM_WEEK: шинэ карт ноорог төлөвтэй эхэлнэ'; end if;
    if now() >= public.crm_weekly_final_lock_at(new.office_id, new.week_start) then
      raise exception 'CRM_WEEK: энэ долоо хоног түгжигдсэн тул карт үүсгэхгүй';
    end if;
    select s.branch_id, s.team_id into new.branch_id, new.team_id
    from public.crm_staff s where s.profile_id = new.agent_id and s.office_id = new.office_id limit 1;
    new.submitted_at := null; new.approved_by := null; new.approved_at := null;
    new.returned_by := null; new.returned_at := null; new.return_note := null;
    return new;
  end if;

  -- UPDATE
  if new.office_id is distinct from old.office_id or new.agent_id is distinct from old.agent_id
     or new.week_start is distinct from old.week_start or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'CRM_WEEK: картын агент, долоо хоног өөрчлөгдөхгүй';
  end if;
  new.updated_at := now();
  if auth.uid() is null then return new; end if;

  v_owner := auth.uid() = old.agent_id;
  v_locked := now() >= public.crm_weekly_final_lock_at(old.office_id, old.week_start);
  new.branch_id := old.branch_id; new.team_id := old.team_id; new.prefilled_from := old.prefilled_from;
  v_content := new.last_week_summary is distinct from old.last_week_summary
            or new.support_needed is distinct from old.support_needed
            or new.commitment is distinct from old.commitment;
  if v_content then
    if not v_owner then raise exception 'CRM_WEEK: картыг зөвхөн агент өөрөө бөглөнө'; end if;
    if old.status not in ('draft', 'returned') then
      raise exception 'CRM_WEEK: илгээсэн картыг засахгүй — ахлагч буцаасны дараа засна';
    end if;
    if v_locked then raise exception 'CRM_WEEK: долоо хоног түгжигдсэн'; end if;
  end if;

  if new.status is distinct from old.status then
    if old.status in ('draft', 'returned') and new.status = 'submitted' then
      if not v_owner then raise exception 'CRM_WEEK: картыг агент өөрөө илгээнэ'; end if;
      if v_locked then raise exception 'CRM_WEEK: долоо хоног түгжигдсэн'; end if;
      new.submitted_at := now();
      new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
    elsif (old.status = 'submitted' and new.status in ('approved', 'returned'))
       or (old.status = 'approved' and new.status = 'returned') then
      if not public.crm_weekly_can_approve(old.agent_id) then
        raise exception 'CRM_WEEK: батлах эрхгүй — агентын багийн ахлагч батална (өөрийн картыг батлахгүй)';
      end if;
      new.submitted_at := old.submitted_at;
      if new.status = 'approved' then
        new.approved_by := auth.uid(); new.approved_at := now();
        new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
      else
        if coalesce(btrim(new.return_note), '') = '' or new.return_note is not distinct from old.return_note then
          raise exception 'CRM_WEEK: буцаах шалтгааныг бичнэ үү';
        end if;
        new.returned_by := auth.uid(); new.returned_at := now();
        new.approved_by := null; new.approved_at := null;
      end if;
    else
      raise exception 'CRM_WEEK: картын төлөвийн шилжилт буруу';
    end if;
  else
    new.submitted_at := old.submitted_at;
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
  end if;
  return new;
end $$;

drop trigger if exists crm_weekly_plans_guard on public.crm_weekly_plans;
create trigger crm_weekly_plans_guard before insert or update on public.crm_weekly_plans
  for each row execute function public.crm_weekly_plan_guard();

create or replace function public.crm_weekly_plan_commitment_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and nullif(btrim(new.commitment), '') is not null)
     or (tg_op = 'UPDATE' and new.commitment is distinct from old.commitment) then
    insert into public.crm_weekly_commitment_log (office_id, plan_id, source, old_text, new_text, changed_by)
    values (new.office_id, new.id, 'plan', case when tg_op = 'UPDATE' then old.commitment end, new.commitment,
            coalesce(auth.uid(), new.agent_id));
  end if;
  return null;
end $$;

drop trigger if exists crm_weekly_plans_commitment on public.crm_weekly_plans;
create trigger crm_weekly_plans_commitment after insert or update of commitment on public.crm_weekly_plans
  for each row execute function public.crm_weekly_plan_commitment_log();

-- Картын нэг мөрийн засвар: зорилт/жагсаалт — карт ноорог эсвэл буцаагдсан үед;
-- дүн шинжилгээний тайлбар, шилжих ажил — дүн шинжилгээ засагдах боломжтой үед.
create or replace function public.crm_weekly_review_open(p_plan uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_weekly_plans p
    left join public.crm_weekly_reviews r on r.plan_id = p.id
    where p.id = p_plan
      and coalesce(r.status, 'draft') in ('draft', 'returned')
      and now() >= ((p.week_start)::timestamp at time zone 'Asia/Ulaanbaatar')
      and now() < public.crm_weekly_final_lock_at(p.office_id, p.week_start));
$$;

create or replace function public.crm_weekly_line_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan record; v_row record; v_plan_part boolean; v_review_part boolean; v_locked boolean;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  select * into v_plan from public.crm_weekly_plans where id = v_row.plan_id;
  if not found then raise exception 'CRM_WEEK: карт олдсонгүй'; end if;
  if tg_op <> 'DELETE' then new.office_id := v_plan.office_id; new.updated_at := now(); end if;
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if auth.uid() <> v_plan.agent_id then
    raise exception 'CRM_WEEK: картыг зөвхөн агент өөрөө бөглөнө';
  end if;
  v_locked := now() >= public.crm_weekly_final_lock_at(v_plan.office_id, v_plan.week_start);

  if tg_table_name = 'crm_weekly_plan_targets' then
    if tg_op = 'UPDATE' then
      v_plan_part := new.target is distinct from old.target;
      v_review_part := new.review_note is distinct from old.review_note
                       or new.next_action is distinct from old.next_action;
    elsif tg_op = 'INSERT' then
      v_review_part := nullif(btrim(new.review_note), '') is not null or nullif(btrim(new.next_action), '') is not null;
      -- Зөвхөн тайлбартай шинэ мөр (зорилтгүй) нь дүн шинжилгээний хэсэг.
      v_plan_part := not v_review_part or new.target is not null;
    else
      v_plan_part := true;
      v_review_part := false;
    end if;
  else
    v_plan_part := v_row.kind <> 'carry';
    v_review_part := v_row.kind = 'carry';
    if tg_op <> 'DELETE' then
      if new.opportunity_id is not null and not exists (
           select 1 from public.crm_opportunities o
           where o.id = new.opportunity_id and o.office_id = v_plan.office_id and o.owner_id = v_plan.agent_id) then
        raise exception 'CRM_WEEK: зөвхөн өөрийн боломжийг сонгоно';
      end if;
      if new.obstacle_id is not null and not exists (
           select 1 from public.crm_lookups k where k.id = new.obstacle_id and k.kind = 'sales_obstacle') then
        raise exception 'CRM_WEEK: саадын ангилал буруу';
      end if;
      if new.kind = 'obstacle' and new.obstacle_id is null then
        raise exception 'CRM_WEEK: саадын ангиллыг сонгоно уу';
      end if;
    end if;
  end if;

  if v_plan_part and (v_plan.status not in ('draft', 'returned') or v_locked) then
    raise exception 'CRM_WEEK: илгээсэн эсвэл түгжигдсэн картын зорилт, жагсаалтыг засахгүй';
  end if;
  if v_review_part and not public.crm_weekly_review_open(v_plan.id) then
    raise exception 'CRM_WEEK: дүн шинжилгээг засах хугацаа дууссан эсвэл илгээгдсэн';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists crm_weekly_plan_targets_guard on public.crm_weekly_plan_targets;
create trigger crm_weekly_plan_targets_guard before insert or update or delete on public.crm_weekly_plan_targets
  for each row execute function public.crm_weekly_line_guard();
drop trigger if exists crm_weekly_plan_items_guard on public.crm_weekly_plan_items;
create trigger crm_weekly_plan_items_guard before insert or update or delete on public.crm_weekly_plan_items
  for each row execute function public.crm_weekly_line_guard();

create or replace function public.crm_weekly_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan record; v_owner boolean; v_locked boolean; v_content boolean; v_coach boolean;
begin
  select * into v_plan from public.crm_weekly_plans where id = new.plan_id;
  if not found then raise exception 'CRM_WEEK: карт олдсонгүй'; end if;
  new.office_id := v_plan.office_id; new.agent_id := v_plan.agent_id; new.week_start := v_plan.week_start;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if auth.uid() is null then return new; end if;
    if auth.uid() <> v_plan.agent_id then raise exception 'CRM_WEEK: дүн шинжилгээг агент өөрөө бөглөнө'; end if;
    if new.status <> 'draft' then raise exception 'CRM_WEEK: дүн шинжилгээ ноорог төлөвтэй эхэлнэ'; end if;
    if not public.crm_weekly_review_open(v_plan.id) then
      raise exception 'CRM_WEEK: дүн шинжилгээг засах хугацаа дууссан';
    end if;
    new.coaching_need := null; new.coaching_at := null; new.coaching_task_id := null;
    new.submitted_at := null; new.approved_by := null; new.approved_at := null;
    new.returned_by := null; new.returned_at := null; new.return_note := null;
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id or new.created_by is distinct from old.created_by then
    raise exception 'CRM_WEEK: дүн шинжилгээний карт өөрчлөгдөхгүй';
  end if;
  if auth.uid() is null then return new; end if;
  v_owner := auth.uid() = old.agent_id;
  v_locked := now() >= public.crm_weekly_final_lock_at(old.office_id, old.week_start);
  v_content := row(new.achieved_note, new.missed_note, new.conversion_note, new.movement_note, new.overdue_reason,
                   new.recovery_action, new.lost_note, new.revenue_note, new.lessons)
               is distinct from
               row(old.achieved_note, old.missed_note, old.conversion_note, old.movement_note, old.overdue_reason,
                   old.recovery_action, old.lost_note, old.revenue_note, old.lessons);
  v_coach := new.coaching_need is distinct from old.coaching_need or new.coaching_at is distinct from old.coaching_at;
  if v_content then
    if not v_owner then raise exception 'CRM_WEEK: дүн шинжилгээг зөвхөн агент өөрөө бөглөнө'; end if;
    if old.status not in ('draft', 'returned') or v_locked then
      raise exception 'CRM_WEEK: илгээсэн эсвэл түгжигдсэн дүн шинжилгээг засахгүй';
    end if;
  end if;
  if v_coach and not public.crm_weekly_can_approve(old.agent_id) then
    raise exception 'CRM_WEEK: дадлагажуулалтын хэрэгцээг багийн ахлагч тэмдэглэнэ';
  end if;
  if new.coaching_task_id is distinct from old.coaching_task_id and not public.crm_weekly_can_approve(old.agent_id) then
    new.coaching_task_id := old.coaching_task_id;
  end if;

  if new.status is distinct from old.status then
    if old.status in ('draft', 'returned') and new.status = 'submitted' then
      if not v_owner then raise exception 'CRM_WEEK: дүн шинжилгээг агент өөрөө илгээнэ'; end if;
      if v_locked then raise exception 'CRM_WEEK: долоо хоног түгжигдсэн'; end if;
      new.submitted_at := now();
      new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
    elsif (old.status = 'submitted' and new.status in ('approved', 'returned'))
       or (old.status = 'approved' and new.status = 'returned') then
      if not public.crm_weekly_can_approve(old.agent_id) then
        raise exception 'CRM_WEEK: батлах эрхгүй — агентын багийн ахлагч батална';
      end if;
      new.submitted_at := old.submitted_at;
      if new.status = 'approved' then
        new.approved_by := auth.uid(); new.approved_at := now();
        new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
      else
        if coalesce(btrim(new.return_note), '') = '' or new.return_note is not distinct from old.return_note then
          raise exception 'CRM_WEEK: буцаах шалтгааныг бичнэ үү';
        end if;
        if v_locked then raise exception 'CRM_WEEK: долоо хоног түгжигдсэн тул буцаахгүй — тайлбарыг хурлаар өгнө'; end if;
        new.returned_by := auth.uid(); new.returned_at := now();
        new.approved_by := null; new.approved_at := null;
      end if;
    else
      raise exception 'CRM_WEEK: дүн шинжилгээний төлөвийн шилжилт буруу';
    end if;
  else
    new.submitted_at := old.submitted_at;
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.returned_by := old.returned_by; new.returned_at := old.returned_at; new.return_note := old.return_note;
  end if;
  return new;
end $$;

drop trigger if exists crm_weekly_reviews_guard on public.crm_weekly_reviews;
create trigger crm_weekly_reviews_guard before insert or update on public.crm_weekly_reviews
  for each row execute function public.crm_weekly_review_guard();

-- Хурлын шийдвэр: текст бичсэн хүн л засна, хариуцагч төлөвийг л өөрчилнө.
-- Хурлын амлалт картын амлалтын түүхэнд бичигдэнэ (§6.30).
create or replace function public.crm_meeting_decision_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_meeting record;
begin
  select * into v_meeting from public.crm_sales_meetings where id = new.meeting_id;
  if not found then raise exception 'CRM_WEEK: хурал олдсонгүй'; end if;
  new.office_id := v_meeting.office_id;
  new.updated_at := now();
  if new.plan_id is not null then
    select p.agent_id into new.agent_id from public.crm_weekly_plans p
    where p.id = new.plan_id and p.office_id = v_meeting.office_id;
    if new.agent_id is null then raise exception 'CRM_WEEK: карт олдсонгүй'; end if;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() <> old.created_by then
    if row(new.kind, new.text, new.plan_id, new.agent_id, new.owner_id, new.due_on, new.meeting_id)
       is distinct from row(old.kind, old.text, old.plan_id, old.agent_id, old.owner_id, old.due_on, old.meeting_id) then
      raise exception 'CRM_WEEK: хурлын шийдвэрийн текстийг тэмдэглэсэн хүн л засна';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_meeting_decisions_guard on public.crm_meeting_decisions;
create trigger crm_meeting_decisions_guard before insert or update on public.crm_meeting_decisions
  for each row execute function public.crm_meeting_decision_guard();

create or replace function public.crm_meeting_commitment_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'commitment' and new.plan_id is not null then
    insert into public.crm_weekly_commitment_log (office_id, plan_id, source, old_text, new_text, changed_by)
    values (new.office_id, new.plan_id, 'meeting', null, new.text, coalesce(auth.uid(), new.created_by));
  end if;
  return null;
end $$;

drop trigger if exists crm_meeting_decisions_commitment on public.crm_meeting_decisions;
create trigger crm_meeting_decisions_commitment after insert on public.crm_meeting_decisions
  for each row execute function public.crm_meeting_commitment_log();

-- ── 10. RLS ──

create or replace function public.crm_weekly_plan_visible(p_plan uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_weekly_plans p
                 where p.id = p_plan and p.office_id = public.crm_office_id()
                   and public.crm_weekly_can_view(p.agent_id));
$$;

create or replace function public.crm_weekly_plan_owned(p_plan uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_weekly_plans p
                 where p.id = p_plan and p.agent_id = auth.uid() and p.office_id = public.crm_office_id());
$$;

alter table public.crm_weekly_plans enable row level security;
drop policy if exists crm_weekly_plans_select on public.crm_weekly_plans;
create policy crm_weekly_plans_select on public.crm_weekly_plans for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_view(agent_id)));
drop policy if exists crm_weekly_plans_insert on public.crm_weekly_plans;
create policy crm_weekly_plans_insert on public.crm_weekly_plans for insert
  with check (office_id = (select public.crm_office_id())
              and agent_id = (select auth.uid()) and created_by = (select auth.uid())
              and (select public.crm_my_staff_id()) is not null);
drop policy if exists crm_weekly_plans_update on public.crm_weekly_plans;
create policy crm_weekly_plans_update on public.crm_weekly_plans for update
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_approve(agent_id)))
  with check (office_id = (select public.crm_office_id()));

alter table public.crm_weekly_plan_targets enable row level security;
drop policy if exists crm_weekly_plan_targets_select on public.crm_weekly_plan_targets;
create policy crm_weekly_plan_targets_select on public.crm_weekly_plan_targets for select
  using (public.crm_weekly_plan_visible(plan_id));
drop policy if exists crm_weekly_plan_targets_insert on public.crm_weekly_plan_targets;
create policy crm_weekly_plan_targets_insert on public.crm_weekly_plan_targets for insert
  with check (public.crm_weekly_plan_owned(plan_id));
drop policy if exists crm_weekly_plan_targets_update on public.crm_weekly_plan_targets;
create policy crm_weekly_plan_targets_update on public.crm_weekly_plan_targets for update
  using (public.crm_weekly_plan_owned(plan_id)) with check (public.crm_weekly_plan_owned(plan_id));
drop policy if exists crm_weekly_plan_targets_delete on public.crm_weekly_plan_targets;
create policy crm_weekly_plan_targets_delete on public.crm_weekly_plan_targets for delete
  using (public.crm_weekly_plan_owned(plan_id));

alter table public.crm_weekly_plan_items enable row level security;
drop policy if exists crm_weekly_plan_items_select on public.crm_weekly_plan_items;
create policy crm_weekly_plan_items_select on public.crm_weekly_plan_items for select
  using (public.crm_weekly_plan_visible(plan_id));
drop policy if exists crm_weekly_plan_items_insert on public.crm_weekly_plan_items;
create policy crm_weekly_plan_items_insert on public.crm_weekly_plan_items for insert
  with check (public.crm_weekly_plan_owned(plan_id));
drop policy if exists crm_weekly_plan_items_update on public.crm_weekly_plan_items;
create policy crm_weekly_plan_items_update on public.crm_weekly_plan_items for update
  using (public.crm_weekly_plan_owned(plan_id)) with check (public.crm_weekly_plan_owned(plan_id));
drop policy if exists crm_weekly_plan_items_delete on public.crm_weekly_plan_items;
create policy crm_weekly_plan_items_delete on public.crm_weekly_plan_items for delete
  using (public.crm_weekly_plan_owned(plan_id));

alter table public.crm_weekly_commitment_log enable row level security;
drop policy if exists crm_weekly_commitment_log_select on public.crm_weekly_commitment_log;
create policy crm_weekly_commitment_log_select on public.crm_weekly_commitment_log for select
  using (public.crm_weekly_plan_visible(plan_id));

alter table public.crm_weekly_reviews enable row level security;
drop policy if exists crm_weekly_reviews_select on public.crm_weekly_reviews;
create policy crm_weekly_reviews_select on public.crm_weekly_reviews for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_view(agent_id)));
drop policy if exists crm_weekly_reviews_insert on public.crm_weekly_reviews;
create policy crm_weekly_reviews_insert on public.crm_weekly_reviews for insert
  with check (office_id = (select public.crm_office_id())
              and agent_id = (select auth.uid()) and created_by = (select auth.uid())
              and public.crm_weekly_plan_owned(plan_id));
drop policy if exists crm_weekly_reviews_update on public.crm_weekly_reviews;
create policy crm_weekly_reviews_update on public.crm_weekly_reviews for update
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_approve(agent_id)))
  with check (office_id = (select public.crm_office_id()));

-- Системийн бичлэг: зөвхөн унших (бичих policy байхгүй + эрхийг хураана).
alter table public.crm_weekly_actuals enable row level security;
drop policy if exists crm_weekly_actuals_select on public.crm_weekly_actuals;
create policy crm_weekly_actuals_select on public.crm_weekly_actuals for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_view(agent_id)));

alter table public.crm_weekly_scores enable row level security;
drop policy if exists crm_weekly_scores_select on public.crm_weekly_scores;
create policy crm_weekly_scores_select on public.crm_weekly_scores for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_view(agent_id)));

alter table public.crm_agent_daily_stats enable row level security;
drop policy if exists crm_agent_daily_stats_select on public.crm_agent_daily_stats;
create policy crm_agent_daily_stats_select on public.crm_agent_daily_stats for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or public.crm_weekly_can_view(agent_id)));

alter table public.crm_next_step_log enable row level security;
drop policy if exists crm_next_step_log_select on public.crm_next_step_log;
create policy crm_next_step_log_select on public.crm_next_step_log for select
  using (office_id = (select public.crm_office_id())
         and (owner_id = (select auth.uid()) or public.crm_weekly_can_view(owner_id)));

revoke insert, update, delete, truncate on public.crm_weekly_actuals from anon, authenticated;
revoke insert, update, delete, truncate on public.crm_weekly_scores from anon, authenticated;
revoke insert, update, delete, truncate on public.crm_agent_daily_stats from anon, authenticated;
revoke insert, update, delete, truncate on public.crm_next_step_log from anon, authenticated;
revoke insert, update, delete, truncate on public.crm_weekly_commitment_log from anon, authenticated;

alter table public.crm_sales_meetings enable row level security;
drop policy if exists crm_sales_meetings_select on public.crm_sales_meetings;
create policy crm_sales_meetings_select on public.crm_sales_meetings for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
drop policy if exists crm_sales_meetings_insert on public.crm_sales_meetings;
create policy crm_sales_meetings_insert on public.crm_sales_meetings for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid()) and facilitator_id = (select auth.uid())
              and (select public.has_crm_role('team_lead', 'sales_director', 'ceo', 'sysadmin')));
drop policy if exists crm_sales_meetings_update on public.crm_sales_meetings;
create policy crm_sales_meetings_update on public.crm_sales_meetings for update
  using (office_id = (select public.crm_office_id())
         and (facilitator_id = (select auth.uid()) or (select public.has_crm_role('sales_director', 'ceo', 'sysadmin'))))
  with check (office_id = (select public.crm_office_id()));

alter table public.crm_meeting_decisions enable row level security;
drop policy if exists crm_meeting_decisions_select on public.crm_meeting_decisions;
create policy crm_meeting_decisions_select on public.crm_meeting_decisions for select
  using (office_id = (select public.crm_office_id())
         and (agent_id = (select auth.uid()) or owner_id = (select auth.uid()) or created_by = (select auth.uid())
              or (agent_id is not null and public.crm_weekly_can_view(agent_id))
              or (select public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'ceo', 'sysadmin'))));
drop policy if exists crm_meeting_decisions_insert on public.crm_meeting_decisions;
create policy crm_meeting_decisions_insert on public.crm_meeting_decisions for insert
  with check (office_id = (select public.crm_office_id()) and created_by = (select auth.uid())
              and (select public.has_crm_role('team_lead', 'sales_director', 'ceo', 'sysadmin')));
drop policy if exists crm_meeting_decisions_update on public.crm_meeting_decisions;
create policy crm_meeting_decisions_update on public.crm_meeting_decisions for update
  using (office_id = (select public.crm_office_id())
         and (created_by = (select auth.uid()) or owner_id = (select auth.uid())
              or (select public.has_crm_role('sales_director', 'ceo'))))
  with check (office_id = (select public.crm_office_id()));

revoke execute on function public.crm_next_step_log_sync(uuid, text, uuid, uuid, date, boolean) from anon, public, authenticated;
grant execute on function public.crm_weekly_can_view(uuid) to authenticated;
grant execute on function public.crm_weekly_can_approve(uuid) to authenticated;
grant execute on function public.crm_weekly_final_lock_at(uuid, date) to authenticated;

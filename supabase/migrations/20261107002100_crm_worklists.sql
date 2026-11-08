-- U8 crm-mobile-growth (8а, 8б) — Өнөөдрийн дараалал, ажлын жагсаалт, ажлын цуваа, тэргүүлэгчид.
--   • crm_today_snoozes   — Өнөөдрийн дараалалд «Хойшлуулах» (аудитад бичигдэнэ; SLA мөрийг хойшлуулахгүй).
--   • crm_track_templates / crm_track_enrollments / crm_track_tasks — ажлын цуваа (R13):
--       алхам бүр даалгавар; утга бүхий холболт, шат солигдох, сэжим/боломж хаагдахад зогсоно.
--   • crm_leaderboard(p_from, p_to) — шалгагдах үр дүнгийн тоо (R22). Шимтгэл гаргахгүй.
--   • Тохиргоо (crm_settings): today_queue, daily_rhythm, daily_norms, worklists, leaderboard, tracks,
--     push_defaults. БХЗ засах эрхтэй (crm_setting_writable өргөтгөл).
-- Журмын холбоо: §6.22, §6.23, §8.3; судалгаа R13, R15, R16, R20, R22.

-- ── 1. Хойшлуулалт ──────────────────────────────────────────────

create table if not exists public.crm_today_snoozes (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_kind text not null,
  item_id uuid not null,
  until timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint crm_today_snoozes_kind check (item_kind in ('task', 'lead_step', 'opp_step', 'feedback', 'showing', 'meeting')),
  constraint crm_today_snoozes_until check (until > created_at and until <= created_at + interval '7 days')
);

create index if not exists crm_today_snoozes_profile_idx on public.crm_today_snoozes (profile_id, until);

alter table public.crm_today_snoozes enable row level security;

drop policy if exists crm_today_snoozes_select on public.crm_today_snoozes;
create policy crm_today_snoozes_select on public.crm_today_snoozes for select
  using (profile_id = auth.uid()
         or (office_id = (select public.crm_office_id()) and (select public.crm_is_manager())));

drop policy if exists crm_today_snoozes_insert on public.crm_today_snoozes;
create policy crm_today_snoozes_insert on public.crm_today_snoozes for insert
  with check (profile_id = auth.uid() and office_id = (select public.crm_office_id()));

drop policy if exists crm_today_snoozes_delete on public.crm_today_snoozes;
create policy crm_today_snoozes_delete on public.crm_today_snoozes for delete
  using (profile_id = auth.uid());

-- Хойшлуулалт бүр аудитын бүртгэлд (хэтрэлтийг нуухгүй — алхмын огноо өөрчлөгдөхгүй).
create or replace function public.crm_today_snooze_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (new.office_id, new.profile_id, 'crm_today_snoozes', new.item_id, 'snooze', new.item_kind,
          null, to_jsonb(new.until), nullif(new.reason, ''));
  return new;
end $$;

drop trigger if exists crm_today_snoozes_audit on public.crm_today_snoozes;
create trigger crm_today_snoozes_audit after insert on public.crm_today_snoozes
  for each row execute function public.crm_today_snooze_audit();

-- ── 2. Ажлын цуваа (R13) ────────────────────────────────────────

create table if not exists public.crm_track_templates (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  code text not null,
  name text not null,
  description text,
  target text not null default 'lead',
  steps jsonb not null,
  stop_on text[] not null default array['reply', 'stage_change', 'closed'],
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_track_templates_code unique (office_id, code),
  constraint crm_track_templates_target check (target in ('lead', 'opportunity', 'any')),
  constraint crm_track_templates_steps check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 10),
  constraint crm_track_templates_stop check (stop_on <@ array['reply', 'stage_change', 'closed'])
);

alter table public.crm_track_templates enable row level security;

drop policy if exists crm_track_templates_select on public.crm_track_templates;
create policy crm_track_templates_select on public.crm_track_templates for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);

drop policy if exists crm_track_templates_write on public.crm_track_templates;
create policy crm_track_templates_write on public.crm_track_templates for all
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sales_director', 'ops_qc', 'sysadmin')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('sales_director', 'ops_qc', 'sysadmin')));

create table if not exists public.crm_track_enrollments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  template_id uuid not null references public.crm_track_templates(id),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id),
  owner_id uuid not null references public.profiles(id),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text,
  created_by uuid not null references public.profiles(id),
  constraint crm_track_enrollments_target check ((lead_id is not null) <> (opportunity_id is not null)),
  constraint crm_track_enrollments_status check (status in ('active', 'stopped', 'completed')),
  constraint crm_track_enrollments_stop check (status = 'active' or stopped_at is not null),
  constraint crm_track_enrollments_reason check (stop_reason is null or stop_reason in ('reply', 'stage_change', 'closed', 'manual', 'completed'))
);

create unique index if not exists crm_track_enrollments_one_lead
  on public.crm_track_enrollments (lead_id) where status = 'active' and lead_id is not null;
create unique index if not exists crm_track_enrollments_one_opp
  on public.crm_track_enrollments (opportunity_id) where status = 'active' and opportunity_id is not null;
create index if not exists crm_track_enrollments_owner_idx on public.crm_track_enrollments (owner_id, status);
create index if not exists crm_track_enrollments_contact_idx on public.crm_track_enrollments (contact_id) where status = 'active';

alter table public.crm_track_enrollments enable row level security;

-- Бичилт зөвхөн RPC-ээр (crm_track_enroll / crm_track_stop) — policy зөвхөн уншилт.
drop policy if exists crm_track_enrollments_select on public.crm_track_enrollments;
create policy crm_track_enrollments_select on public.crm_track_enrollments for select
  using (office_id = (select public.crm_office_id())
         and (owner_id = auth.uid() or created_by = auth.uid()
              or public.crm_is_team_of(owner_id) or (select public.crm_is_manager())));

create table if not exists public.crm_track_tasks (
  enrollment_id uuid not null references public.crm_track_enrollments(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  step_index int not null,
  primary key (enrollment_id, step_index)
);

create index if not exists crm_track_tasks_task_idx on public.crm_track_tasks (task_id);

alter table public.crm_track_tasks enable row level security;

drop policy if exists crm_track_tasks_select on public.crm_track_tasks;
create policy crm_track_tasks_select on public.crm_track_tasks for select
  using (exists (select 1 from public.crm_track_enrollments e where e.id = crm_track_tasks.enrollment_id));

-- Цуваа зогсооход дуусаагүй алхмын даалгаврыг «Хойшлуулсан» болгоно (устгахгүй — түүх хадгалагдана).
create or replace function public.crm_track_close(p_enrollment uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_track_enrollments
     set status = p_status, stopped_at = now(), stop_reason = p_reason
   where id = p_enrollment and status = 'active';
  if not found then
    return;
  end if;
  if p_status = 'stopped' then
    update public.tasks t
       set status = 'deferred', updated_at = now()
      from public.crm_track_tasks tt
     where tt.enrollment_id = p_enrollment and tt.task_id = t.id
       and t.status in ('pending', 'in_progress');
  end if;
end $$;

create or replace function public.crm_track_enroll(p_template uuid, p_lead uuid default null, p_opportunity uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_tpl public.crm_track_templates%rowtype;
  v_owner uuid;
  v_contact uuid;
  v_enr uuid;
  v_hour int;
  v_today date := (now() at time zone 'Asia/Ulaanbaatar')::date;
  v_step jsonb;
  v_idx int := 0;
  v_day int;
  v_due timestamptz;
  v_task uuid;
  v_cfg jsonb;
begin
  if auth.uid() is null or public.crm_my_staff_id() is null then
    raise exception 'CRM: ажлын цуваа эхлүүлэх эрхгүй байна.';
  end if;
  if (p_lead is null) = (p_opportunity is null) then
    raise exception 'CRM: сэжим эсвэл боломжийн аль нэгийг сонгоно уу.';
  end if;
  select * into v_tpl from public.crm_track_templates
   where id = p_template and office_id = v_office and is_active;
  if not found then
    raise exception 'CRM: ажлын цувааны загвар олдсонгүй.';
  end if;
  if p_lead is not null then
    if v_tpl.target = 'opportunity' then
      raise exception 'CRM: энэ загвар зөвхөн боломжид зориулагдсан.';
    end if;
    select owner_id, contact_id into v_owner, v_contact from public.crm_leads
     where id = p_lead and office_id = v_office and status in ('new', 'active');
  else
    if v_tpl.target = 'lead' then
      raise exception 'CRM: энэ загвар зөвхөн сэжимд зориулагдсан.';
    end if;
    select owner_id, contact_id into v_owner, v_contact from public.crm_opportunities
     where id = p_opportunity and office_id = v_office and state = 'open';
  end if;
  if v_contact is null then
    raise exception 'CRM: нээлттэй сэжим эсвэл боломж олдсонгүй.';
  end if;
  if v_owner is null then
    raise exception 'CRM: эзэмшигчгүй бүртгэлд ажлын цуваа эхлүүлэхгүй.';
  end if;
  if not (v_owner = auth.uid() or public.crm_is_team_of(v_owner) or public.crm_is_manager()) then
    raise exception 'CRM: зөвхөн эзэмшигч, түүний багийн ахлагч эсвэл удирдлага цуваа эхлүүлнэ.';
  end if;
  if exists (select 1 from public.crm_track_enrollments
              where status = 'active'
                and ((p_lead is not null and lead_id = p_lead)
                     or (p_opportunity is not null and opportunity_id = p_opportunity))) then
    raise exception 'CRM: энэ бүртгэлд идэвхтэй ажлын цуваа байна. Эхлээд түүнийг зогсооно уу.';
  end if;

  v_cfg := public.crm_setting_at(v_office, 'tracks');
  v_hour := coalesce((v_cfg ->> 'task_hour')::int, 10);
  if v_hour < 0 or v_hour > 23 then v_hour := 10; end if;

  insert into public.crm_track_enrollments (office_id, template_id, lead_id, opportunity_id, contact_id, owner_id, created_by)
  values (v_office, v_tpl.id, p_lead, p_opportunity, v_contact, v_owner, auth.uid())
  returning id into v_enr;

  for v_step in select value from jsonb_array_elements(v_tpl.steps) loop
    v_day := greatest(coalesce((v_step ->> 'day')::int, 0), 0);
    v_due := ((v_today + v_day)::timestamp + make_interval(hours => v_hour)) at time zone 'Asia/Ulaanbaatar';
    if v_due < now() + interval '30 minutes' then
      v_due := now() + interval '30 minutes';
    end if;
    insert into public.tasks (office_id, created_by, responsible_id, title, description, status, priority, deadline, tags)
    values (v_office, auth.uid(), v_owner,
            left(coalesce(nullif(v_step ->> 'title', ''), 'Ажлын цувааны алхам'), 200),
            left(concat_ws(E'\n', v_tpl.name || ' — ' || (v_idx + 1) || '/' || jsonb_array_length(v_tpl.steps),
                           nullif(v_step ->> 'hint', '')), 1000),
            'pending', 'normal', v_due, array['crm', 'track'])
    returning id into v_task;
    insert into public.crm_task_links (task_id, entity, entity_id, rule_code)
    values (v_task, case when p_lead is not null then 'lead' else 'opportunity' end,
            coalesce(p_lead, p_opportunity), 'track');
    insert into public.crm_track_tasks (enrollment_id, task_id, step_index) values (v_enr, v_task, v_idx);
    v_idx := v_idx + 1;
  end loop;
  return v_enr;
end $$;

create or replace function public.crm_track_stop(p_enrollment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.crm_track_enrollments
   where id = p_enrollment and office_id = public.crm_office_id() and status = 'active';
  if v_owner is null then
    raise exception 'CRM: идэвхтэй ажлын цуваа олдсонгүй.';
  end if;
  if not (v_owner = auth.uid() or public.crm_is_team_of(v_owner) or public.crm_is_manager()) then
    raise exception 'CRM: зөвхөн эзэмшигч, түүний багийн ахлагч эсвэл удирдлага цуваа зогсооно.';
  end if;
  perform public.crm_track_close(p_enrollment, 'stopped', 'manual');
end $$;

-- Хариу (утга бүхий холболт) ирэхэд цуваа зогсоно.
create or replace function public.crm_track_on_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not coalesce(new.is_meaningful, false) then
    return new;
  end if;
  for r in
    select e.id from public.crm_track_enrollments e
      join public.crm_track_templates t on t.id = e.template_id
     where e.status = 'active' and 'reply' = any (t.stop_on)
       and ((new.lead_id is not null and e.lead_id = new.lead_id)
            or (new.opportunity_id is not null and e.opportunity_id = new.opportunity_id)
            or (new.lead_id is null and new.opportunity_id is null and e.contact_id = new.contact_id))
  loop
    perform public.crm_track_close(r.id, 'stopped', 'reply');
  end loop;
  return new;
end $$;

drop trigger if exists crm_activities_track_stop on public.crm_activities;
create trigger crm_activities_track_stop after insert on public.crm_activities
  for each row execute function public.crm_track_on_activity();

create or replace function public.crm_track_on_opportunity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_reason text;
begin
  if new.state is distinct from old.state and new.state <> 'open' then
    v_reason := 'closed';
  elsif new.stage_id is distinct from old.stage_id then
    v_reason := 'stage_change';
  else
    return new;
  end if;
  for r in
    select e.id from public.crm_track_enrollments e
      join public.crm_track_templates t on t.id = e.template_id
     where e.status = 'active' and e.opportunity_id = new.id
       and (v_reason = any (t.stop_on) or v_reason = 'closed')
  loop
    perform public.crm_track_close(r.id, 'stopped', v_reason);
  end loop;
  return new;
end $$;

drop trigger if exists crm_opportunities_track_stop on public.crm_opportunities;
create trigger crm_opportunities_track_stop after update of stage_id, state on public.crm_opportunities
  for each row execute function public.crm_track_on_opportunity();

create or replace function public.crm_track_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.status is not distinct from old.status and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;
  if new.status in ('new', 'active') and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;
  for r in select e.id from public.crm_track_enrollments e
            where e.status = 'active' and e.lead_id = new.id loop
    perform public.crm_track_close(r.id, 'stopped', 'closed');
  end loop;
  return new;
end $$;

drop trigger if exists crm_leads_track_stop on public.crm_leads;
create trigger crm_leads_track_stop after update of status, owner_id on public.crm_leads
  for each row execute function public.crm_track_on_lead();

-- Сүүлийн алхам дуусахад цуваа «Дууссан».
create or replace function public.crm_track_on_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_enr uuid;
begin
  if new.status is not distinct from old.status or new.status <> 'completed' then
    return new;
  end if;
  select tt.enrollment_id into v_enr from public.crm_track_tasks tt where tt.task_id = new.id;
  if v_enr is null then
    return new;
  end if;
  if not exists (select 1 from public.crm_track_tasks tt join public.tasks t on t.id = tt.task_id
                  where tt.enrollment_id = v_enr and t.status in ('pending', 'in_progress')) then
    perform public.crm_track_close(v_enr, 'completed', 'completed');
  end if;
  return new;
end $$;

drop trigger if exists tasks_crm_track_done on public.tasks;
create trigger tasks_crm_track_done after update of status on public.tasks
  for each row execute function public.crm_track_on_task();

revoke execute on function public.crm_track_close(uuid, text, text) from anon, public, authenticated;
revoke execute on function public.crm_track_enroll(uuid, uuid, uuid) from anon, public;
revoke execute on function public.crm_track_stop(uuid) from anon, public;
grant execute on function public.crm_track_enroll(uuid, uuid, uuid) to authenticated;
grant execute on function public.crm_track_stop(uuid) to authenticated;

-- ── 3. Тэргүүлэгчид (R22) — зөвхөн шалгагдах үр дүн ────────────

create or replace function public.crm_leaderboard(p_from date, p_to date)
returns table (
  agent_id uuid,
  agent_name text,
  team_id uuid,
  branch_id uuid,
  meaningful_contacts int,
  showings_done int,
  offers int,
  contracts int,
  closed_won int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_from timestamptz := (p_from::timestamp) at time zone 'Asia/Ulaanbaatar';
  v_to timestamptz := ((p_to + 1)::timestamp) at time zone 'Asia/Ulaanbaatar';
begin
  if auth.uid() is null or public.crm_my_staff_id() is null or v_office is null then
    raise exception 'CRM: тэргүүлэгчдийг харах эрхгүй байна.';
  end if;
  if p_to < p_from or p_to - p_from > 92 then
    raise exception 'CRM: хугацааны муж буруу байна.';
  end if;
  return query
  with agents as (
    select s.profile_id, s.team_id, s.branch_id
      from public.crm_staff s
     where s.office_id = v_office and s.is_active and not s.offboarding and 'agent' = any (s.roles)
  )
  select a.profile_id,
         coalesce(nullif(p.full_name, ''), 'Нэргүй'),
         a.team_id,
         a.branch_id,
         (select count(*)::int from public.crm_activities x
           where x.office_id = v_office and x.owner_id = a.profile_id and x.is_meaningful
             and x.occurred_at >= v_from and x.occurred_at < v_to),
         (select count(*)::int from public.crm_showings sh
           where sh.office_id = v_office and sh.agent_id = a.profile_id and sh.status = 'done'
             and sh.done_at >= v_from and sh.done_at < v_to),
         (select count(*)::int from public.crm_offers o
            join public.crm_opportunities op on op.id = o.opportunity_id
           where o.office_id = v_office and op.owner_id = a.profile_id and o.parent_offer_id is null
             and o.created_at >= v_from and o.created_at < v_to),
         (select count(*)::int from public.crm_transactions t
            join public.crm_opportunities op on op.id = t.opportunity_id
           where t.office_id = v_office and op.owner_id = a.profile_id and t.status <> 'cancelled'
             and t.contracted_on between p_from and p_to),
         (select count(*)::int from public.crm_transactions t
            join public.crm_opportunities op on op.id = t.opportunity_id
           where t.office_id = v_office and op.owner_id = a.profile_id and t.status = 'closed'
             and t.closed_on between p_from and p_to)
    from agents a
    left join public.profiles p on p.id = a.profile_id;
end $$;

revoke execute on function public.crm_leaderboard(date, date) from anon, public;
grant execute on function public.crm_leaderboard(date, date) to authenticated;

-- ── 4. Тохиргооны анхны утга ─────────────────────────────────────

do $$
declare
  o record;
  v_creator uuid;
  v_key text;
  v_val jsonb;
  v_defaults jsonb := jsonb_build_object(
    'today_queue', '{"sla_warn_min":10,"snooze_hours":[1,3,24],"snooze_max_per_day":10,
                     "conversion_days":90,"day_close_hour":17}'::jsonb,
    'daily_rhythm', '{"1":["Долоо хоногийн хурал","Урсгалын цэвэрлэгээ","Идэвхтэй хайлт","Уулзалт товлох"],
                      "2":["Идэвхтэй хайлт","Өмчлөгч, худалдан авагчтай уулзалт","Листинг"],
                      "3":["Идэвхтэй хайлт","Үзлэг","Эргэн холбогдолт","Хэлэлцээр"],
                      "4":["Урсгалын хөрвөлт","Үзлэг","Үнийн санал","Листинг"],
                      "5":["Хаалтын шат","Хугацаа хэтэрсэн эргэн холбогдолт","Долоо хоногийн дүн шинжилгээ"],
                      "6":["Үзлэг","Нээлттэй үзлэг","CRM-ийн шинэчлэл"],
                      "7":["Үзлэг","Нээлттэй үзлэг","CRM-ийн шинэчлэл"]}'::jsonb,
    'daily_norms', '{"prospecting_new_opps":1,"client_meaningful_contacts":8,"client_meetings":1,
                     "property_showings":1,"property_listings":0,"closing_actions":1}'::jsonb,
    'worklists', '{"hot_stale_days":3,"warm_stale_days":7,"few_attempts_max":3,"few_attempts_window_days":14,
                   "showing_no_feedback_hours":24,"vitals_warn":3,"vitals_alert":6,"disabled":[]}'::jsonb,
    'leaderboard', '{"weights":{"meaningful_contact":1,"showing_done":3,"offer":5,"contract":8,"closed_won":13},
                     "tv_refresh_sec":120,"show_zero":false}'::jsonb,
    'tracks', '{"task_hour":10}'::jsonb,
    'push_defaults', '{"events":["lead_assigned","lead_sla_breach","lead_retry_due","lead_no_contact_48h",
                       "hot_lead_inactive","showing_feedback_due","showing_feedback_overdue","offer_expiring",
                       "match_found","next_step_overdue"]}'::jsonb
  );
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator from public.crm_settings
     where office_id = o.office_id order by created_at limit 1;
    for v_key, v_val in select key, value from jsonb_each(v_defaults) loop
      if exists (select 1 from public.crm_settings
                  where office_id = o.office_id and key = v_key and valid_to is null) then
        continue;
      end if;
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, v_key, v_val, v_creator, 'PRO-001 v2.1 — гар утас, ажлын жагсаалтын анхны утга');
    end loop;
  end loop;
end $$;

-- Ажлын цувааны 4 бэлэн загвар (оффис бүрд, байхгүй бол).
do $$
declare
  o record;
  v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator from public.crm_settings
     where office_id = o.office_id order by created_at limit 1;
    insert into public.crm_track_templates (office_id, code, name, description, target, steps, sort_order, created_by)
    values
      (o.office_id, 'new_no_answer', 'Шинэ сэжим — хариу өгөхгүй',
       'Эхний холболт амжаагүй сэжимд оролдлогыг хуваарийн дагуу давтана.', 'lead',
       '[{"day":0,"title":"Дахин залгах","hint":"Өөр цагт залгаж, хариу өгөхгүй бол богино зурвас үлдээнэ."},
         {"day":1,"title":"Зурвас илгээх","hint":"Хэрэгцээг тодруулах богино асуулттай зурвас."},
         {"day":3,"title":"Дахин залгах","hint":"Өдрийн өөр цагт."},
         {"day":7,"title":"Сүүлийн оролдлого","hint":"Хариугүй бол ангиллыг дахин үнэлнэ."}]'::jsonb, 1, v_creator),
      (o.office_id, 'post_showing', 'Үзлэгийн дараах эргэн холбогдолт',
       'Үзлэгийн дараа санал авах, дараагийн алхмыг тохирох.', 'opportunity',
       '[{"day":0,"title":"Үзлэгийн эргэх холбоо авах","hint":"Таалагдсан, таалагдаагүй зүйлийг ангилж бүртгэнэ."},
         {"day":2,"title":"Нэмэлт сонголт илгээх","hint":"Эргэх холбоонд тулгуурласан 2–3 сонголт."},
         {"day":5,"title":"Залгаж дараагийн алхмыг тохирох","hint":"Давтан үзлэг эсвэл үнийн санал."}]'::jsonb, 2, v_creator),
      (o.office_id, 'nurture', 'Ургуулах — тогтмол холбоо',
       'Ойрын хугацаанд шийдэхгүй харилцагчтай холбоо тасрахгүй байлгах.', 'lead',
       '[{"day":0,"title":"Тохирох сонголт илгээх","hint":"Хэрэгцээний профайлд тохирох шинэ листинг."},
         {"day":14,"title":"Зах зээлийн мэдээ хуваалцах","hint":"Бүсийн үнийн өөрчлөлт, шинэ төсөл."},
         {"day":30,"title":"Залгаж хэрэгцээг шинэчлэх","hint":"Хугацаа, төсөв өөрчлөгдсөн эсэх."}]'::jsonb, 3, v_creator),
      (o.office_id, 'owner_followup', 'Өмчлөгчтэй уулзалтын дараа',
       'Листингийн гэрээ байгуулах хүртэлх алхмууд.', 'opportunity',
       '[{"day":1,"title":"Үнийн дүн шинжилгээ илгээх","hint":"Жишиг гүйлгээ, санал болгох үнийн муж."},
         {"day":3,"title":"Залгаж асуултад хариулах","hint":"Үйлчилгээний нөхцөл, хугацаа."},
         {"day":7,"title":"Листингийн гэрээний санал","hint":"Гэрээний загварыг танилцуулна."}]'::jsonb, 4, v_creator)
    on conflict (office_id, code) do nothing;
  end loop;
end $$;

-- ── 5. Тохиргооны бичих эрх: шинэ түлхүүрүүд БХЗ-д ────────────────

create or replace function public.crm_setting_writable(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sysadmin', 'ops_qc')
      or (public.has_crm_role('sales_director') and p_key in (
            'lead_score_weights', 'lead_score_factors', 'lead_grade_thresholds',
            'inactivity_thresholds', 'recycle_thresholds', 'recontact_frequency', 'recontact_ranges',
            'automation_thresholds', 'sla_policy', 'sla_first_contact_min',
            'lead_assignment', 'lead_accept', 'pool_settings', 'lead_dispute',
            'match_weights', 'match_thresholds', 'weekly_targets', 'agent_score_weights',
            'kpi_targets', 'kpi_scope', 'weekly_cycle',
            'today_queue', 'daily_rhythm', 'daily_norms', 'worklists', 'leaderboard', 'tracks',
            'push_defaults', 'public_links'))
      or (public.has_crm_role('marketing') and p_key in ('marketing_costs', 'campaign_costs'));
$$;

-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U5 crm-agent-core), 1/2.
-- Үйл ажиллагааны бүртгэлийн стандарт (§6.11, §6.4, §6.15, §6.19.2, §6.26):
--
--   • reached (U2 000500-д нэмэгдсэн) дээр суурилсан is_meaningful —
--     утга бүхий холболт = даалгавар биш, «Холбогдож чадаагүй» биш бүртгэл
--     (Ш3). Тайлан, долоо хоногийн үзүүлэлт энэ баганыг тоолно.
--   • next_step_code — дараагийн үйлдлийн хаалттай жагсаалт; next_step_at —
--     цагтай товлолт (огноо next_step_date хэвээр заавал).
--   • meeting_party — уулзалт хэнтэй болсон (худалдан авагч / өмчлөгч …).
--   • showing_interest + feedback_at — үзлэгийн дүн ба эргэх холбоо
--     бүртгэгдсэн мөч (24 цагийн хэмжүүрт). feedback_at-ыг аудитын логоос
--     нөхөж бөглөнө.
--   • crm_activity_properties — ярилцсан үл хөдлөх (олон).
--   • Insert guard: болсон огноо ирээдүйд (5 минутаас илүү) байж болохгүй;
--     идэвхтэй сэжимд дараагийн үйлдэл, огноо заавал (хэвээр).
--   • Сэжимийн сүүлийн холболт = greatest(хуучин, энэ бүртгэл) — зөвхөн
--     холбогдсон бүртгэлээр; дараагийн үйлдэл сэжимд синк; эхний
--     холболтын (Д-01) даалгавар утга бүхий холболтоор хаагдана.
-- ============================================================

-- ── Баганууд ──

alter table public.crm_activities
  add column if not exists reached boolean;

alter table public.crm_activities
  add column if not exists next_step_code text,
  add column if not exists next_step_at timestamptz,
  add column if not exists meeting_party text,
  add column if not exists showing_interest text,
  add column if not exists feedback_at timestamptz,
  add column if not exists quick_log boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_activities_next_step_code') then
    alter table public.crm_activities add constraint crm_activities_next_step_code check
      (next_step_code is null
       or next_step_code in ('call', 'send_options', 'showing', 'offer', 'documents', 'meeting', 'repeat_showing', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_activities_meeting_party') then
    alter table public.crm_activities add constraint crm_activities_meeting_party check
      (meeting_party is null or meeting_party in ('buyer', 'seller', 'tenant', 'landlord', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_activities_showing_interest') then
    alter table public.crm_activities add constraint crm_activities_showing_interest check
      (showing_interest is null or showing_interest in ('interested', 'maybe', 'not_fit'));
  end if;
end $$;

-- Утга бүхий холболт (Ш3): даалгавар биш, холбогдож чадаагүй биш.
alter table public.crm_activities
  add column if not exists is_meaningful boolean
  generated always as (channel <> 'task'::crm_activity_channel and coalesce(reached, true)) stored;

comment on column public.crm_activities.is_meaningful is
  '§6.19.2 утга бүхий холболт: даалгавар биш бөгөөд reached is distinct from false';
comment on column public.crm_activities.next_step_code is
  '§6.11 дараагийн үйлдлийн хаалттай жагсаалт';
comment on column public.crm_activities.feedback_at is
  '§6.15 үзлэгийн эргэх холбоо бүртгэгдсэн мөч (24 цагийн хэмжүүр)';

create index if not exists crm_activities_meaningful_idx
  on public.crm_activities (office_id, owner_id, occurred_at desc) where is_meaningful;

-- feedback_at нөхөн бөглөлт: аудитын логийн эхний feedback_category бичилт,
-- байхгүй бол бүртгэлийн огноо.
update public.crm_activities a
set feedback_at = coalesce(
      (select min(l.created_at) from public.crm_audit_log l
        where l.entity = 'crm_activities' and l.entity_id = a.id and l.field = 'feedback_category'),
      a.created_at)
where a.feedback_category is not null and a.feedback_at is null;

-- ── Ярилцсан үл хөдлөх (§6.11) ──

create table if not exists public.crm_activity_properties (
  activity_id uuid not null references public.crm_activities(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  office_id   uuid not null references public.offices(id) on delete restrict,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (activity_id, property_id)
);
create index if not exists crm_activity_properties_property_idx
  on public.crm_activity_properties (property_id);

alter table public.crm_activity_properties enable row level security;

drop policy if exists crm_activity_properties_select on public.crm_activity_properties;
create policy crm_activity_properties_select on public.crm_activity_properties for select
  using (
    office_id = (select public.crm_office_id())
    and exists (
      select 1 from public.crm_activities a
      where a.id = activity_id and public.crm_can_view_contact(a.contact_id)
    )
  );

drop policy if exists crm_activity_properties_insert on public.crm_activity_properties;
create policy crm_activity_properties_insert on public.crm_activity_properties for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and exists (
      select 1 from public.crm_activities a
      where a.id = activity_id and a.owner_id = auth.uid()
    )
  );

grant select, insert on public.crm_activity_properties to authenticated;

-- Хуучин нэг FK-тэй бүртгэлийг холбоост нөхөж оруулна.
insert into public.crm_activity_properties (activity_id, property_id, office_id, created_by, created_at)
select a.id, a.property_id, a.office_id, a.owner_id, a.created_at
from public.crm_activities a
where a.property_id is not null
on conflict do nothing;

-- ── Insert guard ──

create or replace function public.crm_activity_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status crm_lifecycle;
begin
  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'CRM: үйл ажиллагааны огноо ирээдүйд байж болохгүй';
  end if;
  new.backdated := new.occurred_at::date < current_date;
  if new.feedback_category is not null and new.feedback_at is null then
    new.feedback_at := now();
  end if;
  if new.lead_id is not null then
    select status into v_status from public.crm_leads where id = new.lead_id;
    if v_status = 'active'
       and (nullif(new.next_step, '') is null or new.next_step_date is null) then
      raise exception 'CRM: идэвхтэй сэжимд дараагийн үйлдэл, огноо заавал';
    end if;
  end if;
  return new;
end $$;

-- Эргэх холбоо хожим бүртгэгдэхэд мөчийг тавина (нэг удаа).
create or replace function public.crm_activity_feedback_at()
returns trigger language plpgsql as $$
begin
  if new.feedback_category is not null and old.feedback_category is null and new.feedback_at is null then
    new.feedback_at := now();
  end if;
  if old.feedback_at is not null and new.feedback_at is distinct from old.feedback_at then
    new.feedback_at := old.feedback_at;
  end if;
  return new;
end $$;

drop trigger if exists crm_activities_feedback_at on public.crm_activities;
create trigger crm_activities_feedback_at
  before update of feedback_category, feedback_at on public.crm_activities
  for each row execute function public.crm_activity_feedback_at();

-- ── Сэжимд синк: сүүлийн холболт (greatest), дараагийн үйлдэл, Д-01 хаалт ──

create or replace function public.crm_activity_lead_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_meaningful boolean := new.channel <> 'task' and coalesce(new.reached, true);
begin
  if new.lead_id is null then return new; end if;
  select id, status, last_contact_at, next_step_task_id
    into v_lead
    from public.crm_leads where id = new.lead_id;
  if not found then return new; end if;

  update public.crm_leads
     set last_contact_at = case
           when v_meaningful
             then greatest(coalesce(last_contact_at, '-infinity'::timestamptz), least(new.occurred_at, now()))
           else last_contact_at end,
         next_step = case
           when status in ('new', 'active') and nullif(new.next_step, '') is not null and new.next_step_date is not null
             then new.next_step else next_step end,
         next_step_date = case
           when status in ('new', 'active') and nullif(new.next_step, '') is not null and new.next_step_date is not null
             then new.next_step_date else next_step_date end
   where id = new.lead_id;

  -- Утга бүхий холболтоор эхний холболтын (болон хоёр дахь оролдлогын)
  -- даалгавар хаагдана.
  if v_meaningful then
    update public.tasks t
       set status = 'completed', completed_at = now()
     where t.status <> 'completed'
       and (t.id = v_lead.next_step_task_id
            or t.id in (select tl.task_id from public.crm_task_links tl
                         where tl.entity = 'lead' and tl.entity_id = new.lead_id
                           and tl.rule_code in ('D-01', 'D-03')));
  end if;
  return new;
end $$;

revoke execute on function public.crm_activity_lead_touch() from public, anon, authenticated;

drop trigger if exists crm_activities_lead_touch on public.crm_activities;
create trigger crm_activities_lead_touch
  after insert on public.crm_activities
  for each row execute function public.crm_activity_lead_touch();

-- ════════════════════════════════════════════════════════════
-- U4 crm-ownership-governance (PMC-CRM-PRO-001 v2.1 §6.26, §6.27)
--   • Дахин хуваарилалт нотолгоонд үндэслэнэ: шалтгаан бүрт DB-ийн
--     нотолгоо (SLA хоцролт, идэвхгүйн босго, чөлөө, гарах төлөв),
--     тэмдэглэл заавал, «Харилцагч өөр агент хүссэн»-ийг зөвхөн БХЗ/ҮАМ,
--     Системийн админ шилжүүлэхгүй; нээлттэй даалгавар шинэ эзэмшигч рүү,
--     эхний холболтын хугацаа дахин тооцогдоно.
--   • Эргэлт: хянан үзэх (босго хэтэрсэн нотолгоо + тайлбар), санд буцаах.
--   • Эргэлтийн сан + захирлын/ахлагчийн зөвшөөрлөөр авах (R3).
--   • Хүлээн авах хугацаатай хуваарилалт (R2): хугацаандаа хүлээн
--     аваагүй сэжим дараалалд буцаж, дараагийн агентад очно.
--   • Чөлөө: ажилтны чөлөөний хугацаа, орлон ажиллагч.
--   Босго, хугацаа бүгд crm_settings-д (БХЗ өөрчилнө).
-- ════════════════════════════════════════════════════════════

-- ── Баганууд ──

alter table public.crm_staff
  add column if not exists on_leave_from date,
  add column if not exists on_leave_to date,
  add column if not exists leave_substitute_id uuid references public.profiles(id),
  add column if not exists leave_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_staff_leave_range') then
    alter table public.crm_staff add constraint crm_staff_leave_range
      check (on_leave_from is null or on_leave_to is null or on_leave_from <= on_leave_to);
  end if;
end $$;

alter table public.crm_leads
  add column if not exists owner_assigned_at timestamptz,
  add column if not exists accept_due_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists recycled_at timestamptz,
  add column if not exists recycled_by uuid references public.profiles(id),
  add column if not exists recycle_reason text;

-- Нөхөн бөглөлт: одоогийн эзэмшигчтэй сэжим хүлээн авсанд тооцогдоно.
update public.crm_leads l
   set owner_assigned_at = coalesce(
         (select max(h.created_at) from public.crm_ownership_history h
          where h.entity = 'lead' and h.entity_id = l.id),
         l.created_at),
       accepted_at = coalesce(l.accepted_at, l.created_at)
 where l.owner_id is not null and l.owner_assigned_at is null;

create index if not exists crm_leads_pool_idx on public.crm_leads (office_id, recycled_at desc)
  where status = 'recycled' and owner_id is null;
create index if not exists crm_leads_accept_due_idx on public.crm_leads (accept_due_at)
  where accepted_at is null and accept_due_at is not null;

create table if not exists public.crm_pool_claims (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  requester_id uuid not null references public.profiles(id),
  note text not null,
  status text not null default 'requested',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint crm_pool_claims_status check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  constraint crm_pool_claims_note check (length(trim(note)) >= 5),
  constraint crm_pool_claims_decided check (status = 'requested' or status = 'cancelled' or decided_by is not null),
  constraint crm_pool_claims_not_self check (decided_by is null or decided_by <> requester_id)
);
create index if not exists crm_pool_claims_office_idx on public.crm_pool_claims (office_id, status, created_at desc);
create unique index if not exists crm_pool_claims_one_pending
  on public.crm_pool_claims (lead_id, requester_id) where status = 'requested';

alter table public.crm_pool_claims enable row level security;
create policy crm_pool_claims_select on public.crm_pool_claims for select
  using (
    office_id = (select public.crm_office_id())
    and (requester_id = (select auth.uid())
         or (select public.has_crm_role('sales_director', 'ops_qc', 'ceo'))
         or public.crm_is_team_of(requester_id))
  );

drop trigger if exists crm_pool_claims_audit on public.crm_pool_claims;
create trigger crm_pool_claims_audit
  after insert or update on public.crm_pool_claims
  for each row execute function public.crm_audit_config_change();

-- ── Анхны тохиргоо (байгаа нээлттэй хувилбарыг дарахгүй) ──

do $$
declare
  o record;
  v_creator uuid;
  k record;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;
    for k in
      select * from (values
        ('lead_accept',        '{"enabled": true, "window_min": 15}'::jsonb,
                               'Хүлээн авах хугацаа (минут) — хугацаандаа хүлээн аваагүй бол дараагийн агентад'),
        ('recycle_thresholds', '{"a": 14, "b": 30, "c": 60, "d": 90, "new_no_contact_days": 3}'::jsonb,
                               'Эргэлтэд оруулах босго (холболтгүй хоног, ангиллаар)'),
        ('pool_settings',      '{"max_pending_claims": 3}'::jsonb,
                               'Эргэлтийн сан: агентын нэг зэрэг хүлээгдэж буй хүсэлтийн дээд тоо'),
        ('lead_dispute',       '{"appeal_days": 5, "response_days": 2}'::jsonb,
                               'Эзэмшлийн маргаан: хариу өгөх, давж заалдах хугацаа (хоног)')
      ) as t(key, value, note)
    loop
      if not exists (select 1 from public.crm_settings
                     where office_id = o.office_id and key = k.key and valid_to is null) then
        insert into public.crm_settings (office_id, key, value, created_by, note)
        values (o.office_id, k.key, k.value, v_creator, 'PRO-001 v2.1 — ' || k.note);
      end if;
    end loop;
  end loop;
end $$;

-- ── Туслахууд ──

create or replace function public.crm_ub_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Ulaanbaatar')::date;
$$;

create or replace function public.crm_staff_on_leave(p_profile uuid, p_office uuid, p_day date default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_staff s
    where s.profile_id = p_profile and s.office_id = p_office and s.is_active
      and s.on_leave_from is not null
      and s.on_leave_from <= coalesce(p_day, public.crm_ub_today())
      and (s.on_leave_to is null or s.on_leave_to >= coalesce(p_day, public.crm_ub_today()))
  );
$$;

-- Тохиргооны тоон утга (service role ч дуудна; оффисын шалгалтыг crm_setting_at хийнэ).
create or replace function public.crm_setting_num(p_office uuid, p_key text, p_path text[], p_default numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  v := public.crm_setting_at(p_office, p_key) #>> p_path;
  if v is null or v !~ '^-?[0-9]+(\.[0-9]+)?$' then return p_default; end if;
  return v::numeric;
end $$;

-- Сэжим идэвхгүйн босгыг давсан эсэх (эргэлт, дахин хуваарилалтын нотолгоо).
create or replace function public.crm_lead_inactive_evidence(p_lead uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare l public.crm_leads; v_days numeric; v_last timestamptz;
begin
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null then return false; end if;
  if l.unprotected then return true; end if;
  if l.status = 'new' and l.last_contact_at is null then
    v_days := public.crm_setting_num(l.office_id, 'recycle_thresholds', '{new_no_contact_days}', 3);
    return l.created_at < now() - make_interval(days => v_days::int);
  end if;
  v_days := coalesce(
    public.crm_setting_num(l.office_id, 'recycle_thresholds', array[coalesce(l.grade::text, 'c')], null),
    public.crm_setting_num(l.office_id, 'inactivity_thresholds', array[coalesce(l.grade::text, 'c')], 30));
  v_last := greatest(coalesce(l.last_contact_at, l.created_at),
                     coalesce((select max(a.occurred_at) from public.crm_activities a
                               where a.lead_id = l.id and a.owner_id = l.owner_id), l.created_at));
  return v_last < now() - make_interval(days => v_days::int);
end $$;

-- SLA хоцролтын нотолгоо: эхний холболтгүй, хугацаа хэтэрсэн эсвэл сануулга гарсан.
create or replace function public.crm_lead_sla_evidence(p_lead uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare l public.crm_leads; v_first timestamptz;
begin
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null then return false; end if;
  v_first := (to_jsonb(l) ->> 'first_contact_at')::timestamptz;
  if v_first is not null then return false; end if;
  return (l.first_contact_due_at is not null and l.first_contact_due_at < now())
      or exists (select 1 from public.crm_rule_runs r
                 where r.entity = 'crm_leads' and r.entity_id = l.id
                   and r.rule_code in ('D-02', 'D-03', 'D-04')
                   and r.ran_at >= coalesce(l.owner_assigned_at, l.created_at));
end $$;

-- Даалгавруудыг шинэ эзэмшигч рүү шилжүүлэх (дотоод).
create or replace function public.crm_lead_move_tasks(p_lead uuid, p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_task uuid;
begin
  if p_to is null then return; end if;
  update public.tasks t set responsible_id = p_to
   where t.id in (select tl.task_id from public.crm_task_links tl where tl.entity = 'lead' and tl.entity_id = p_lead)
     and t.status in ('pending', 'in_progress')
     and t.responsible_id is not distinct from p_from;
  select next_step_task_id into v_task from public.crm_leads where id = p_lead;
  if v_task is not null then
    update public.tasks set responsible_id = p_to
     where id = v_task and status in ('pending', 'in_progress') and responsible_id is not distinct from p_from;
  end if;
end $$;

-- ── Эзэмшигч солигдох trigger (дахин бичив): түүх + хүлээн авах хугацаа ──

create or replace function public.crm_lead_owner_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reason text;
  v_window numeric;
  v_enabled boolean;
begin
  if new.owner_id is not distinct from old.owner_id then return new; end if;
  reason := nullif(current_setting('crm.reason', true), '');
  if old.owner_id is null then
    reason := coalesce(reason, 'initial');
  elsif coalesce(current_setting('crm.reassign', true), '') <> '1' then
    if auth.uid() is null then
      reason := coalesce(reason, 'inactivity');
    else
      raise exception 'CRM: эзэмшигчийг зөвхөн шилжүүлэлтийн үйлдлээр (шалтгаантай) солино';
    end if;
  end if;

  new.owner_assigned_at := now();
  if new.owner_id is null then
    new.accept_due_at := null;
    new.accepted_at := null;
  else
    v_enabled := coalesce((public.crm_setting_at(new.office_id, 'lead_accept') ->> 'enabled')::boolean, true);
    v_window := public.crm_setting_num(new.office_id, 'lead_accept', '{window_min}', 15);
    if v_enabled and new.status = 'new' and new.owner_id is distinct from auth.uid()
       and (to_jsonb(new) ->> 'first_contact_at') is null
       and coalesce(reason, '') not in ('dispute', 'pool_claim', 'leave_return') then
      new.accepted_at := null;
      new.accept_due_at := now() + make_interval(mins => v_window::int);
    else
      new.accepted_at := now();
      new.accept_due_at := null;
    end if;
  end if;

  insert into public.crm_ownership_history
    (office_id, entity, entity_id, old_owner_id, new_owner_id, reason_code, note, decided_by)
  values
    (new.office_id, 'lead', new.id, old.owner_id, new.owner_id,
     coalesce(reason, 'initial'), nullif(current_setting('crm.reason_note', true), ''), auth.uid());
  return new;
end $$;

-- Шинэ сэжим: өөрөө бүртгэсэн бол шууд хүлээн авсан, бусдад оноосон бол хугацаатай.
create or replace function public.crm_lead_owner_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_window numeric; v_enabled boolean;
begin
  if new.owner_id is null then return new; end if;
  new.owner_assigned_at := coalesce(new.owner_assigned_at, now());
  v_enabled := coalesce((public.crm_setting_at(new.office_id, 'lead_accept') ->> 'enabled')::boolean, true);
  if v_enabled and new.status = 'new' and new.owner_id is distinct from coalesce(auth.uid(), new.created_by)
     and new.owner_id is distinct from new.created_by then
    v_window := public.crm_setting_num(new.office_id, 'lead_accept', '{window_min}', 15);
    new.accepted_at := null;
    new.accept_due_at := now() + make_interval(mins => v_window::int);
  else
    new.accepted_at := coalesce(new.accepted_at, now());
    new.accept_due_at := null;
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_owner_insert on public.crm_leads;
create trigger crm_leads_owner_insert
  before insert on public.crm_leads
  for each row execute function public.crm_lead_owner_insert();

-- Утга бүхий холболт бүртгэгдмэгц хүлээн авсанд тооцно.
create or replace function public.crm_lead_accept_on_contact()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) ->> 'first_contact_at') is not null and new.accepted_at is null and new.owner_id is not null then
    new.accepted_at := now();
    new.accept_due_at := null;
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_accept_on_contact on public.crm_leads;
create trigger crm_leads_accept_on_contact
  before update on public.crm_leads
  for each row execute function public.crm_lead_accept_on_contact();

-- ── Амьдралын мөчлөгийн guard (дахин бичив): эргэлт, сангаас авах, нэргүйжүүлэх ──

create or replace function public.crm_lifecycle_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  o text := (to_jsonb(old) ->> col);
  n text := (to_jsonb(new) ->> col);
  allowed boolean := false;
begin
  if o = n then return new; end if;
  if n = 'archived' and (coalesce(current_setting('crm.merge', true), '') = '1'
                         or coalesce(current_setting('crm.anonymize', true), '') = '1') then
    return new;
  end if;
  if auth.uid() is null then
    allowed := true;
  elsif o = 'new'      and n = 'active'   then allowed := (select public.crm_my_staff_id()) is not null;
  -- Эргэлт зөвхөн хянан үзэх RPC-ээр (нотолгоо + дүгнэлт, crm_recycle_lead).
  elsif o in ('new', 'active') and n = 'recycled' then
    allowed := coalesce(current_setting('crm.recycle', true), '') = '1'
               and public.has_crm_role('team_lead', 'sales_director');
  elsif o = 'recycled' and n = 'active'   then allowed := public.has_crm_role('team_lead', 'sales_director');
  elsif o = 'recycled' and n = 'new'      then
    allowed := coalesce(current_setting('crm.pool_claim', true), '') = '1';
  elsif o = 'active'   and n = 'inactive' then allowed := (select public.crm_my_staff_id()) is not null;
  elsif o = 'inactive' and n = 'archived' then allowed := public.has_crm_role('ops_qc');
  elsif o = 'inactive' and n = 'active'   then allowed := (select public.crm_my_staff_id()) is not null;
  elsif o = 'new'      and n = 'inactive' then allowed := public.has_crm_role('team_lead', 'sales_director', 'ops_qc');
  else allowed := false;
  end if;
  if not allowed then
    raise exception 'CRM: энэ төлөвийн шилжилт зөвшөөрөгдөөгүй';
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
  values (new.office_id, auth.uid(), tg_table_name, new.id, 'status', col, to_jsonb(o), to_jsonb(n));
  return new;
end $$;

-- ── Дахин хуваарилалт (нотолгоотой) ──
-- Нийтийн шалтгаан: sla_breach, inactivity, client_request, zoning, offboarding,
-- on_leave, leave_return. Дотоод (зөвхөн service role): initial, not_accepted.

create or replace function public.crm_reassign_lead(
  p_lead uuid, p_new_owner uuid, p_reason text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  l public.crm_leads;
  v_me uuid := auth.uid();
  v_sd boolean;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_min numeric;
  v_last record;
begin
  if p_reason is null or p_reason not in (
       'sla_breach', 'inactivity', 'client_request', 'zoning', 'offboarding', 'on_leave', 'leave_return',
       'initial', 'not_accepted') then
    raise exception 'CRM: шилжүүлэлтийн шалтгаан буруу';
  end if;
  if v_me is not null and p_reason in ('initial', 'not_accepted') then
    raise exception 'CRM: энэ шалтгаанаар зөвхөн систем шилжүүлнэ';
  end if;
  if v_me is not null and not public.has_crm_role('team_lead', 'sales_director', 'ops_qc') then
    raise exception 'CRM: танд сэжим шилжүүлэх эрх алга';
  end if;
  v_sd := v_me is null or public.has_crm_role('sales_director', 'ops_qc');

  select * into l from public.crm_leads where id = p_lead for update;
  if l.id is null then raise exception 'CRM: сэжим олдсонгүй'; end if;
  if v_me is not null and l.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if l.owner_id is not distinct from p_new_owner then
    raise exception 'CRM: сэжим аль хэдийн энэ ажилтных';
  end if;
  if l.status not in ('new', 'active', 'recycled') then
    raise exception 'CRM: хаагдсан сэжмийг шилжүүлэхгүй';
  end if;

  -- Багийн ахлагч зөвхөн багийнхаа сэжмийг, зөвхөн нотолгоот шалтгаанаар.
  if v_me is not null and not v_sd then
    if l.owner_id is not null and not public.crm_is_team_of(l.owner_id) then
      raise exception 'CRM: Багийн ахлагч зөвхөн өөрийн багийн сэжмийг шилжүүлнэ';
    end if;
    if p_reason in ('client_request', 'zoning') then
      raise exception 'CRM: энэ шалтгаанаар Борлуулалт хариуцсан захирал эсвэл Үйл ажиллагаа-ЧМТ шилжүүлнэ';
    end if;
  end if;

  if v_me is not null and v_note is null then
    raise exception 'CRM: шилжүүлэх үндэслэлийг тэмдэглэлд бичнэ үү';
  end if;
  if p_reason in ('client_request', 'zoning') and length(coalesce(v_note, '')) < 10 then
    raise exception 'CRM: харилцагчийн хүсэлт / бүсчлэлийн үндэслэлийг дэлгэрэнгүй бичнэ үү';
  end if;

  -- Нотолгоо
  if v_me is not null then
    if p_reason = 'sla_breach' and not public.crm_lead_sla_evidence(p_lead) then
      raise exception 'CRM: эхний холболтын хугацаа хэтэрсэн нотолгоо алга';
    elsif p_reason = 'inactivity' and not public.crm_lead_inactive_evidence(p_lead) then
      raise exception 'CRM: идэвхгүйн босго хэтрээгүй — бодит үйл ажиллагаа бүртгэгдсэн байна';
    elsif p_reason = 'offboarding' and not exists (
            select 1 from public.crm_staff s
            where s.profile_id = l.owner_id and s.office_id = l.office_id and (s.offboarding or not s.is_active)) then
      raise exception 'CRM: эзэмшигч гарах урсгалд ороогүй байна';
    elsif p_reason = 'on_leave' and not public.crm_staff_on_leave(l.owner_id, l.office_id) then
      raise exception 'CRM: эзэмшигч чөлөөтэй гэж бүртгэгдээгүй байна';
    elsif p_reason = 'leave_return' then
      select h.reason_code, h.old_owner_id into v_last
      from public.crm_ownership_history h
      where h.entity = 'lead' and h.entity_id = p_lead
      order by h.created_at desc limit 1;
      if v_last.reason_code is distinct from 'on_leave' or v_last.old_owner_id is distinct from p_new_owner then
        raise exception 'CRM: энэ сэжим чөлөөний хугацаанд түр шилжүүлэгдээгүй';
      end if;
    end if;
  end if;

  -- Шинэ эзэмшигч идэвхтэй, гарах урсгалд ороогүй, чөлөөгүй байна.
  if not exists (
    select 1 from public.crm_staff s
    where s.profile_id = p_new_owner and s.office_id = l.office_id and s.is_active and not s.offboarding
  ) then
    raise exception 'CRM: шинэ эзэмшигч идэвхтэй CRM ажилтан биш эсвэл гарах урсгалд байна';
  end if;
  if public.crm_staff_on_leave(p_new_owner, l.office_id) then
    raise exception 'CRM: шинэ эзэмшигч чөлөөтэй байна';
  end if;

  perform set_config('crm.reassign', '1', true);
  perform set_config('crm.reason', p_reason, true);
  perform set_config('crm.reason_note', coalesce(v_note, ''), true);
  update public.crm_leads set owner_id = p_new_owner where id = p_lead;
  perform set_config('crm.reassign', '', true);
  perform set_config('crm.reason', '', true);
  perform set_config('crm.reason_note', '', true);

  perform public.crm_lead_move_tasks(p_lead, l.owner_id, p_new_owner);

  -- §6.27: эхний холболт хийгдээгүй бол хугацааг шинэ эзэмшигчээс тоолно
  -- (апп ажлын цагийн хуанлиар дахин нарийвчилна).
  if (to_jsonb(l) ->> 'first_contact_at') is null and l.status = 'new' then
    v_min := public.crm_setting_num(l.office_id, 'sla_first_contact_min', '{}', 15);
    update public.crm_leads
       set first_contact_due_at = now() + make_interval(mins => v_min::int)
     where id = p_lead;
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (l.office_id, v_me, 'crm_leads', p_lead, 'reassign', 'owner_id',
          to_jsonb(l.owner_id), to_jsonb(p_new_owner), p_reason || coalesce(': ' || v_note, ''));
end $$;

-- ── Эргэлт: хянан үзэх, санд буцаах ──

create or replace function public.crm_recycle_lead(
  p_lead uuid, p_reason text, p_note text, p_release boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; v_me uuid := auth.uid();
begin
  if v_me is null or not public.has_crm_role('team_lead', 'sales_director') then
    raise exception 'CRM: эргэлтэд оруулах эрх Багийн ахлагч, Борлуулалт хариуцсан захиралд бий';
  end if;
  if p_reason not in ('inactivity', 'unreachable', 'not_ready', 'other') then
    raise exception 'CRM: эргэлтийн шалтгаан буруу';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'CRM: хянан үзсэн дүгнэлтээ дэлгэрэнгүй бичнэ үү';
  end if;
  select * into l from public.crm_leads where id = p_lead for update;
  if l.id is null or l.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: сэжим олдсонгүй';
  end if;
  if l.status not in ('new', 'active') then
    raise exception 'CRM: зөвхөн шинэ эсвэл идэвхтэй сэжмийг эргэлтэд оруулна';
  end if;
  if not public.has_crm_role('sales_director') and l.owner_id is not null and not public.crm_is_team_of(l.owner_id) then
    raise exception 'CRM: Багийн ахлагч зөвхөн өөрийн багийн сэжмийг эргэлтэд оруулна';
  end if;
  if not public.crm_lead_inactive_evidence(p_lead) then
    raise exception 'CRM: эргэлтийн босго хэтрээгүй — бодит үйл ажиллагаа хугацаандаа бүртгэгдсэн байна';
  end if;

  perform set_config('crm.recycle', '1', true);
  update public.crm_leads
     set status = 'recycled', recycled_at = now(), recycled_by = v_me, recycle_reason = p_reason
   where id = p_lead;
  perform set_config('crm.recycle', '', true);

  if p_release and l.owner_id is not null then
    perform set_config('crm.reassign', '1', true);
    perform set_config('crm.reason', 'recycle', true);
    perform set_config('crm.reason_note', trim(p_note), true);
    update public.crm_leads set owner_id = null where id = p_lead;
    perform set_config('crm.reassign', '', true);
    perform set_config('crm.reason', '', true);
    perform set_config('crm.reason_note', '', true);
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (l.office_id, v_me, 'crm_leads', p_lead, 'recycle', 'status',
          to_jsonb(l.status), jsonb_build_object('status', 'recycled', 'released', p_release),
          p_reason || ': ' || trim(p_note));
end $$;

-- ── Эргэлтийн сан: авах хүсэлт ба шийдвэр (R3) ──

create or replace function public.crm_request_pool_claim(p_lead uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; v_me uuid := auth.uid(); v_max numeric; v_open int; v_id uuid;
begin
  if v_me is null or public.crm_my_staff_id() is null then
    raise exception 'CRM: та CRM-д бүртгэгдээгүй байна';
  end if;
  select * into l from public.crm_leads where id = p_lead;
  if l.id is null or l.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: сэжим олдсонгүй';
  end if;
  if l.status <> 'recycled' or l.owner_id is not null then
    raise exception 'CRM: энэ сэжим эргэлтийн санд байхгүй';
  end if;
  if exists (select 1 from public.crm_staff s
             where s.profile_id = v_me and s.office_id = l.office_id and (s.offboarding or not s.is_active)) then
    raise exception 'CRM: гарах урсгалд байгаа ажилтан сангаас авахгүй';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'CRM: юу хийхээ товч бичнэ үү';
  end if;
  v_max := public.crm_setting_num(l.office_id, 'pool_settings', '{max_pending_claims}', 3);
  select count(*) into v_open from public.crm_pool_claims
   where requester_id = v_me and office_id = l.office_id and status = 'requested';
  if v_open >= v_max then
    raise exception 'CRM: хүлээгдэж буй хүсэлт дээд хэмжээнд (%) хүрсэн', v_max::int;
  end if;
  if exists (select 1 from public.crm_pool_claims where lead_id = p_lead and requester_id = v_me and status = 'requested') then
    raise exception 'CRM: энэ сэжмийг авах хүсэлт аль хэдийн илгээсэн';
  end if;
  insert into public.crm_pool_claims (office_id, lead_id, requester_id, note)
  values (l.office_id, p_lead, v_me, trim(p_note))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.crm_decide_pool_claim(p_claim uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.crm_pool_claims; l public.crm_leads; v_me uuid := auth.uid(); v_min numeric;
begin
  select * into c from public.crm_pool_claims where id = p_claim for update;
  if c.id is null or c.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if c.status <> 'requested' then raise exception 'CRM: хүсэлт аль хэдийн шийдвэрлэгдсэн'; end if;
  if v_me = c.requester_id then raise exception 'CRM: өөрийн хүсэлтийг өөрөө шийдэхгүй'; end if;
  if not (public.has_crm_role('sales_director')
          or (public.has_crm_role('team_lead') and public.crm_is_team_of(c.requester_id))) then
    raise exception 'CRM: сангаас авах хүсэлтийг тухайн агентын Багийн ахлагч эсвэл Борлуулалт хариуцсан захирал шийднэ';
  end if;

  if not p_approve then
    if length(trim(coalesce(p_note, ''))) < 5 then
      raise exception 'CRM: татгалзсан шалтгаанаа бичнэ үү';
    end if;
    update public.crm_pool_claims
       set status = 'rejected', decided_by = v_me, decided_at = now(), decision_note = trim(p_note)
     where id = p_claim;
    return;
  end if;

  select * into l from public.crm_leads where id = c.lead_id for update;
  if l.status <> 'recycled' or l.owner_id is not null then
    raise exception 'CRM: сэжим сангаас аль хэдийн гарсан';
  end if;
  if not exists (select 1 from public.crm_staff s
                 where s.profile_id = c.requester_id and s.office_id = c.office_id and s.is_active and not s.offboarding) then
    raise exception 'CRM: хүсэлт гаргагч идэвхтэй ажилтан биш байна';
  end if;

  perform set_config('crm.pool_claim', '1', true);
  perform set_config('crm.reassign', '1', true);
  perform set_config('crm.reason', 'pool_claim', true);
  perform set_config('crm.reason_note', coalesce(nullif(trim(coalesce(p_note, '')), ''), c.note), true);
  v_min := public.crm_setting_num(l.office_id, 'sla_first_contact_min', '{}', 15);
  update public.crm_leads
     set owner_id = c.requester_id,
         status = 'new',
         unprotected = false,
         recycled_at = null, recycled_by = null, recycle_reason = null,
         first_contact_due_at = case when (to_jsonb(l) ->> 'first_contact_at') is null
                                     then now() + make_interval(mins => v_min::int)
                                     else first_contact_due_at end
   where id = c.lead_id;
  perform set_config('crm.pool_claim', '', true);
  perform set_config('crm.reassign', '', true);
  perform set_config('crm.reason', '', true);
  perform set_config('crm.reason_note', '', true);

  update public.crm_pool_claims
     set status = 'approved', decided_by = v_me, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_claim;
  update public.crm_pool_claims
     set status = 'rejected', decided_by = v_me, decided_at = now(), decision_note = 'Сэжмийг өөр агентад олгосон'
   where lead_id = c.lead_id and status = 'requested' and id <> p_claim and requester_id <> v_me;
  update public.crm_pool_claims
     set status = 'cancelled'
   where lead_id = c.lead_id and status = 'requested' and id <> p_claim;
end $$;

create or replace function public.crm_cancel_pool_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_pool_claims set status = 'cancelled'
   where id = p_claim and requester_id = auth.uid() and status = 'requested';
  if not found then raise exception 'CRM: хүсэлт олдсонгүй'; end if;
end $$;

-- Эргэлтийн сангийн жагсаалт: оффисын бүх идэвхтэй ажилтан масктай харна
-- (эзэмшигчгүй сэжмийг RLS агентад харуулдаггүй).
create or replace function public.crm_pool_leads()
returns table (
  lead_id uuid,
  grade text,
  recycled_at timestamptz,
  recycle_reason text,
  source_label text,
  branch_name text,
  masked_name text,
  contact_types text[],
  last_contact_at timestamptz,
  created_at timestamptz,
  pending_claims int,
  my_claim_id uuid
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_office uuid := public.crm_office_id(); v_me uuid := auth.uid();
begin
  if v_me is null or public.crm_my_staff_id() is null then
    raise exception 'CRM: та CRM-д бүртгэгдээгүй байна';
  end if;
  return query
  select
    l.id,
    l.grade::text,
    l.recycled_at,
    l.recycle_reason,
    src.label,
    br.name,
    case when public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'ceo')
         then c.display_name else public.crm_mask_name(c.display_name) end,
    c.contact_types::text[],
    l.last_contact_at,
    l.created_at,
    (select count(*)::int from public.crm_pool_claims pc where pc.lead_id = l.id and pc.status = 'requested'),
    (select pc.id from public.crm_pool_claims pc
      where pc.lead_id = l.id and pc.requester_id = v_me and pc.status = 'requested' limit 1)
  from public.crm_leads l
  join public.crm_contacts c on c.id = l.contact_id
  left join public.crm_lookups src on src.id = l.source_id
  left join public.crm_branches br on br.id = l.branch_id
  where l.office_id = v_office and l.status = 'recycled' and l.owner_id is null
    and c.merged_into_id is null
  order by l.recycled_at desc nulls last, l.created_at desc
  limit 200;
end $$;

-- ── Хүлээн авах (R2) ──

create or replace function public.crm_accept_lead(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm_leads
     set accepted_at = now(), accept_due_at = null
   where id = p_lead and owner_id = auth.uid() and accepted_at is null;
  if not found then
    raise exception 'CRM: хүлээн авах сэжим олдсонгүй (хугацаа дууссан эсвэл аль хэдийн хүлээн авсан)';
  end if;
end $$;

-- Хугацаандаа хүлээн аваагүй сэжмийг дараалалд буцаана (pg_cron 5 минут).
create or replace function public.crm_requeue_unaccepted_leads()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select l.id, l.office_id, l.owner_id
    from public.crm_leads l
    where l.accepted_at is null
      and l.accept_due_at is not null
      and l.accept_due_at < now()
      and l.status = 'new'
      and l.owner_id is not null
      and (to_jsonb(l) ->> 'first_contact_at') is null
    for update skip locked
  loop
    if not coalesce((public.crm_setting_at(r.office_id, 'lead_accept') ->> 'enabled')::boolean, true) then
      continue;
    end if;
    perform set_config('crm.reassign', '1', true);
    perform set_config('crm.reason', 'not_accepted', true);
    perform set_config('crm.reason_note', 'Хүлээн авах хугацаа дууссан', true);
    update public.crm_leads set owner_id = null, first_contact_due_at = null where id = r.id;
    perform set_config('crm.reassign', '', true);
    perform set_config('crm.reason', '', true);
    perform set_config('crm.reason_note', '', true);

    insert into public.crm_assignment_state as st (office_id, scope, queue)
    values (r.office_id, 'default', jsonb_build_array(r.id))
    on conflict (office_id, scope) do update
      set queue = case
        when st.queue @> jsonb_build_array(r.id) then st.queue
        else st.queue || jsonb_build_array(r.id) end;

    insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
    values (r.office_id, 'lead_accept_expired', 'crm_leads', r.id, 'ok',
            jsonb_build_object('previous_owner', r.owner_id));
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'crm-accept-expire-5min') then
      perform cron.unschedule('crm-accept-expire-5min');
    end if;
    perform cron.schedule('crm-accept-expire-5min', '*/5 * * * *', 'select public.crm_requeue_unaccepted_leads()');
  end if;
end $$;

-- ── Grant ──

revoke execute on function public.crm_ub_today() from anon, public;
revoke execute on function public.crm_staff_on_leave(uuid, uuid, date) from anon, public;
revoke execute on function public.crm_setting_num(uuid, text, text[], numeric) from anon, public;
revoke execute on function public.crm_lead_inactive_evidence(uuid) from anon, public;
revoke execute on function public.crm_lead_sla_evidence(uuid) from anon, public;
revoke execute on function public.crm_lead_move_tasks(uuid, uuid, uuid) from anon, public, authenticated;
revoke execute on function public.crm_reassign_lead(uuid, uuid, text, text) from anon, public;
revoke execute on function public.crm_recycle_lead(uuid, text, text, boolean) from anon, public;
revoke execute on function public.crm_request_pool_claim(uuid, text) from anon, public;
revoke execute on function public.crm_decide_pool_claim(uuid, boolean, text) from anon, public;
revoke execute on function public.crm_cancel_pool_claim(uuid) from anon, public;
revoke execute on function public.crm_accept_lead(uuid) from anon, public;
revoke execute on function public.crm_pool_leads() from anon, public;
revoke execute on function public.crm_requeue_unaccepted_leads() from anon, public, authenticated;

grant execute on function public.crm_ub_today() to authenticated;
grant execute on function public.crm_staff_on_leave(uuid, uuid, date) to authenticated;
grant execute on function public.crm_setting_num(uuid, text, text[], numeric) to authenticated;
grant execute on function public.crm_lead_inactive_evidence(uuid) to authenticated;
grant execute on function public.crm_lead_sla_evidence(uuid) to authenticated;
grant execute on function public.crm_reassign_lead(uuid, uuid, text, text) to authenticated;
grant execute on function public.crm_recycle_lead(uuid, text, text, boolean) to authenticated;
grant execute on function public.crm_request_pool_claim(uuid, text) to authenticated;
grant execute on function public.crm_decide_pool_claim(uuid, boolean, text) to authenticated;
grant execute on function public.crm_cancel_pool_claim(uuid) to authenticated;
grant execute on function public.crm_accept_lead(uuid) to authenticated;
grant execute on function public.crm_pool_leads() to authenticated;

-- ============================================================
-- PMC CRM — Суурь (Foundation, U1).
-- Дүр/ажилтан, салбар/баг, лавлах, хувилбартай тохиргоо, хуанли,
-- дугаарлалт, бүсийн лавлах, урсгал/шат/шилжилт/гейт, аудит лог,
-- жижүүр/хуваарилалтын төлөв, автоматжуулалтын дүрэм + гүйцэтгэлийн
-- лог, мэдэгдлийн матриц/сонголт, суурь RLS helper-үүд.
--
-- Гол шийдвэрүүд (docs/crm/DESIGN.md):
--  * D4 — тохиргоо = өгөгдөл, хувилбартай (valid_from/valid_to);
--  * D5 — бүх crm_ хүснэгт office_id + RLS суурь нөхцөл crm_office_id();
--  * D7 — МУТСТ тусгаарлалт (хүснэгтүүд нь 000500-д, helper-үүд энд);
--  * D9 — hard delete policy ҮГҮЙ, FK-ууд restrict;
--  * §1.1 — эрхийн тэлэлтийн хаалт: crm_staff.panel_admin +
--    crm_is_panel_admin() + CRM-ээс гадуурх бичих policy-уудын нарийсалт;
--  * ГАЖИЛТ: crm_* хүснэгтийг supabase_realtime-д НЭМЭХГҮЙ (санаатай).
-- ============================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ── Enum-ууд (DESIGN §2.1 — хаалттай жагсаалтууд; «админ өргөтгөнө» → crm_lookups) ──

create type crm_role as enum (
  'agent',            -- Агент
  'team_lead',        -- Багийн ахлагч
  'sales_director',   -- Борлуулалтын захирал
  'ops_qc',           -- Үйл ажиллагаа/ЧМТ-ийн зохицуулагч
  'marketing',        -- Маркетингийн мэргэжилтэн
  'property_manager', -- ҮХХ менежментийн мэргэжилтэн
  'finance',          -- Санхүү (Нягтлан бодогч)
  'aml_officer',      -- МУТСТ-ийн хяналт тавих ажилтан
  'ceo',              -- Ерөнхий захирал
  'sysadmin'          -- Системийн админ (тохиргоо; арилжааны өгөгдөлд давуу эрхгүй)
);

create type crm_contact_kind      as enum ('person','company');
create type crm_contact_type      as enum ('buyer','seller','tenant','landlord','investor','applicant');
create type crm_lifecycle         as enum ('new','active','recycled','inactive','archived');
create type crm_lead_grade        as enum ('a','b','c','d');
create type crm_consent_status    as enum ('granted','not_asked','declined');
create type crm_profile_status    as enum ('active','paused','fulfilled','lost');
create type crm_service_kind      as enum ('sale','standard_rental','managed_rental');
create type crm_property_status   as enum ('draft','active','reserved','sold','rented','withdrawn');
create type crm_occupancy_status  as enum ('vacant','occupied','make_ready','notice_given');
create type crm_property_role     as enum ('sourcing','photo','contract');
create type crm_activity_channel  as enum ('call','chat','email','meeting','showing','task');
create type crm_activity_outcome  as enum ('open','advanced','lost','won');
create type crm_match_response    as enum ('interested','maybe','not_fit','no_response');
create type crm_opp_state         as enum ('open','won','lost');
create type crm_txn_type          as enum ('sale','standard_rental','managed_rental','international_sale','replacement');
create type crm_txn_status        as enum ('draft','contract','payment','closed','cancelled');
create type crm_kyc_status        as enum ('pending','verified','edd','suspended');
create type crm_aml_risk          as enum ('low','medium','high','prohibited');
create type crm_aml_case_status   as enum ('open','investigating','str_sent','closed');
create type crm_gate_code         as enum ('g0','g1','g2','g3','g4','g5','g6');
create type crm_lease_status      as enum ('draft','active','renewed','terminated','expired');
create type crm_invoice_type      as enum ('mgmt_fee','brokerage_fee','extra_service');
create type crm_invoice_status    as enum ('planned','sent','partially_paid','paid','cancelled');
create type crm_payment_kind      as enum ('income','control');
create type crm_maintenance_status as enum ('new','pending_approval','assigned','in_progress','closed','rejected');
create type crm_urgency           as enum ('urgent','normal','planned');
create type crm_commission_status as enum ('calculated','reviewed','approved','paid','partially_paid','hold','cancelled');
create type crm_commission_role   as enum ('sourcing','listing','photo','contract','selling','seller_side','buyer_side','intl_lead_gen','deal_manager','pm_team');
create type crm_party_role        as enum ('seller','buyer','lessor','lessee');
create type crm_expense_bearer    as enum ('tenant','landlord','pmc');
create type crm_inspection_kind   as enum ('move_in','move_out','periodic');
create type crm_doc_category      as enum ('contract','payment_proof','ownership','identity','photo','act','aml','other');

-- ── Салбар, баг, ажилтан (§1.1) ──

create table public.crm_branches (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  code       text not null,          -- 'central' | 'yarmag' | ...
  name       text not null,          -- «Төв», «Яармаг-Нисэх»
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, code),
  unique (id, office_id)              -- tenant-нийцэлтэй composite FK-ийн зорилтот (§2.4)
);

create table public.crm_teams (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  branch_id  uuid not null,
  name       text not null,
  lead_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (id, office_id),
  foreign key (branch_id, office_id) references public.crm_branches (id, office_id) on delete restrict
);

create table public.crm_staff (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete restrict,
  profile_id  uuid not null references public.profiles(id) on delete restrict,
  branch_id   uuid,
  team_id     uuid,
  roles       crm_role[] not null default '{agent}',
  is_active   boolean not null default true,
  offboarding boolean not null default false,  -- P-10 гарах төлөв
  panel_admin boolean not null default false,  -- §1.1 эрхийн тэлэлтийн хаалт: «жинхэнэ» оффис админ
  created_at  timestamptz not null default now(),
  unique (office_id, profile_id),
  foreign key (branch_id, office_id) references public.crm_branches (id, office_id),
  foreign key (team_id, office_id)   references public.crm_teams (id, office_id)
);
create index crm_staff_profile_idx on public.crm_staff (profile_id);
create index crm_staff_office_idx  on public.crm_staff (office_id, is_active);

-- ── «Админ өргөтгөнө» лавлахууд (§2.1) ──

create table public.crm_lookups (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  kind       text not null,   -- 'lead_source'|'lost_reason'|'objection'|'maintenance_category'|'tag'|'goal'|'blocker'|'decision_maker'|'condition'|...
  code       text not null,
  label      text not null,
  requires_note boolean not null default false, -- «Бусад» сонговол тайлбар заавал (F-104)
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, kind, code),
  unique (id, office_id)
);
create index crm_lookups_kind_idx on public.crm_lookups (office_id, kind, sort_order);

-- ── Хувилбартай тохиргоо, хуанли, дугаарлалт (§2.2) ──

create table public.crm_settings (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  key        text not null,           -- 'lead_score_weights'|'match_weights'|'sla_first_contact_min'|'arrears_ladder'|'aml_threshold_mnt'|...
  value      jsonb not null,
  valid_from timestamptz not null default now(),
  valid_to   timestamptz,             -- null = одоогийн хүчинтэй
  created_by uuid not null references public.profiles(id),
  note       text,
  created_at timestamptz not null default now()
);
create index crm_settings_key_idx on public.crm_settings (office_id, key, valid_from desc);

create table public.crm_calendar_days (   -- F-604 ажлын өдрийн хуанли
  office_id uuid not null references public.offices(id) on delete restrict,
  day       date not null,
  is_workday boolean not null,
  note      text,
  primary key (office_id, day)
);

create table public.crm_sequences (       -- F-401/F-518 race-гүй автомат дугаарлалт
  office_id uuid not null references public.offices(id) on delete restrict,
  kind      text not null,   -- 'contact'|'property'|'txn_sale'|...|'invoice'|'lease'
  prefix    text not null,
  next_no   bigint not null default 1,
  pad       int not null default 5,
  primary key (office_id, kind)
);

-- ── Бүсийн лавлах (F-207 — crm_properties.zone_id-ийн зорилтот, 000300-аас ӨМНӨ) ──

create table public.crm_zone_directory (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  district text not null, khoroo text, complex text,
  branch_id uuid not null,
  decided_by uuid references public.profiles(id), decided_at timestamptz, rationale text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (branch_id, office_id) references public.crm_branches (id, office_id) on delete restrict
);
create index crm_zone_directory_idx on public.crm_zone_directory (office_id, district, khoroo);

-- ── Урсгал, шат, шилжилт, гейт (§2.3 — бүгд өгөгдөл, PL-1…PL-6 seed-ээр) ──

create table public.crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  code       text not null,            -- 'PL-1'…'PL-6'
  name       text not null,
  restricted boolean not null default false, -- PL-6: зөвхөн 5 дүр (RLS)
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, code),
  unique (id, office_id)
);

create table public.crm_stages (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete restrict,
  pipeline_id uuid not null,
  code        text not null,           -- 'new','qualified','contract',…
  name        text not null,
  sort_order  int not null,
  probability numeric(5,2) not null default 0,   -- F-353 жинлэсэн төсөөлөл
  gate_code   crm_gate_code,           -- энэ шатанд ОРОХЫН өмнө шалгагдах гейт (F-354)
  is_terminal boolean not null default false,
  terminal_state crm_opp_state,        -- won/lost терминал шатанд
  is_closing_direction boolean not null default false, -- Д-12/F-360: AML hold үед орохыг хориглох чиглэл
  created_at  timestamptz not null default now(),
  unique (pipeline_id, code),
  unique (id, office_id),
  foreign key (pipeline_id, office_id) references public.crm_pipelines (id, office_id) on delete restrict
);
create index crm_stages_pipeline_idx on public.crm_stages (pipeline_id, sort_order);

-- Зөвшөөрөгдсөн шилжилтүүд (0.2): урагш дараалсан; буцаалт шалтгаантай; алгасалт зөвхөн sales_director.
create table public.crm_stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  pipeline_id   uuid not null,
  from_stage_id uuid not null,
  to_stage_id   uuid not null,
  kind          text not null default 'forward',  -- 'forward'|'backward'|'skip'
  allowed_roles crm_role[] not null default '{agent,team_lead,sales_director}',
  requires_reason boolean not null default false,
  unique (from_stage_id, to_stage_id),
  foreign key (pipeline_id, office_id)   references public.crm_pipelines (id, office_id) on delete restrict,
  foreign key (from_stage_id, office_id) references public.crm_stages (id, office_id) on delete restrict,
  foreign key (to_stage_id, office_id)   references public.crm_stages (id, office_id) on delete restrict
);
create index crm_stage_transitions_idx on public.crm_stage_transitions (pipeline_id, from_stage_id);

-- Гейтийн шаардлагууд (G0–G6, F-354/F-416) — checker_kind нь кодод хэрэгжсэн цөөн примитив.
create table public.crm_gate_requirements (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  gate_code  crm_gate_code not null,
  pipeline_id uuid,                    -- null = бүх урсгалд
  checker_kind text not null, -- 'need_profile_complete'|'owner_set'|'next_step_set'|'kyc_verified'|'docs_complete'|'role_evidence'|'payment_proof'|'handover_done'|'listing_agreement'|'offer_recorded'|'aml_not_held'|'post_sale_tasks'
  params     jsonb not null default '{}',
  is_active  boolean not null default true,
  foreign key (pipeline_id, office_id) references public.crm_pipelines (id, office_id) on delete restrict
);
create index crm_gate_requirements_idx on public.crm_gate_requirements (office_id, gate_code) where is_active;

-- ── Аудит лог (§2.4 — зөвхөн нэмэгдэх горим, SEC-08) ──

create table public.crm_audit_log (
  id         bigint generated always as identity primary key,
  office_id  uuid not null,
  actor_id   uuid,                       -- null = систем/cron
  entity     text not null,              -- хүснэгтийн нэр
  entity_id  uuid not null,
  action     text not null,              -- 'insert'|'update'|'status'|'merge'|'export'|'view_restricted'|'view_aml_case'|...
  field      text,
  old_value  jsonb,
  new_value  jsonb,
  reason     text,
  created_at timestamptz not null default now()
);
create index crm_audit_entity_idx on public.crm_audit_log (entity, entity_id, created_at);
create index crm_audit_office_idx on public.crm_audit_log (office_id, created_at desc);

-- ── Сэжим хуваарилалтын тохиргоо (§2.2а — F-126, Д-01) ──

create table public.crm_duty_shifts (          -- жижүүрийн ээлжийн хуваарь
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  branch_id uuid,
  profile_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint crm_duty_shift_range check (starts_at < ends_at),
  foreign key (branch_id, office_id) references public.crm_branches (id, office_id)
);
create index crm_duty_shifts_idx on public.crm_duty_shifts (office_id, starts_at, ends_at);

create table public.crm_assignment_state (     -- round-robin cursor + ажлын бус цагийн дараалал
  office_id uuid not null references public.offices(id) on delete restrict,
  scope text not null default 'default',
  last_assigned_profile_id uuid references public.profiles(id),
  queue jsonb not null default '[]',           -- FIFO (lead_id жагсаалт)
  updated_at timestamptz not null default now(),
  primary key (office_id, scope)
);

-- ── Автоматжуулалтын дүрэм + гүйцэтгэлийн лог (F-600–603; U2+ runRule-д хэрэглэнэ) ──

create table public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  code text not null,                            -- 'D-01'…'D-30' + шинэ дүрэм
  name text not null,
  trigger_kind text not null,                    -- 'event:<entity>.<change>' | 'cron:daily' | 'cron:monthly'
  condition jsonb not null default '{}',
  actions jsonb not null,                        -- [{kind:'create_task'|'notify'|'set_field'|'transition'|'create_record'|'block', params}]
  is_active boolean not null default true,
  dry_run boolean not null default false,        -- F-601 туршилтын горим
  created_at timestamptz not null default now(),
  unique (office_id, code)
);

create table public.crm_rule_runs (              -- F-602 гүйцэтгэлийн лог + async queue
  id bigint generated always as identity primary key,
  office_id uuid not null,
  rule_code text not null,
  entity text, entity_id uuid,
  status text not null default 'ok',             -- 'ok'|'error'|'skipped'|'dry_run'|'pending'
  result jsonb, error text,
  ran_at timestamptz not null default now()
);
create index crm_rule_runs_idx on public.crm_rule_runs (office_id, rule_code, ran_at desc);
create index crm_rule_runs_pending_idx on public.crm_rule_runs (office_id, status) where status = 'pending';

-- ── Мэдэгдлийн матриц, хувийн сонголт (F-651/652) ──

create table public.crm_notification_matrix (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  event_code text not null,                      -- 'lead_assigned'|'next_step_overdue'|'arrears_step'|...
  recipient_roles crm_role[] not null,
  channels text[] not null default '{app}',      -- app|push|email|sms (email/sms = INT- заглушка)
  mandatory boolean not null default false,      -- F-652: хаах боломжгүй ангилал
  quiet_hours_exempt boolean not null default false,
  escalation jsonb,                              -- F-655 гинж
  unique (office_id, event_code)
);

create table public.crm_notification_prefs (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  office_id uuid not null,
  event_code text not null,
  channels text[] not null,
  primary key (profile_id, event_code)
);

-- ════════════════════════════════════════════════════════════
-- RLS HELPER-үүд (security definer, stable, search_path = public)
-- ════════════════════════════════════════════════════════════

-- Дуудагчийн оффис (profiles → agents fallback, my_task_office_id загвар).
create or replace function public.crm_office_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select office_id from public.profiles where id = auth.uid()),
    (select office_id from public.agents where profile_id = auth.uid() limit 1)
  );
$$;

-- Идэвхтэй crm_staff мөрийн id (байхгүй бол null → «CRM-д бүртгэгдээгүй»).
create or replace function public.crm_my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.crm_staff
  where profile_id = auth.uid() and is_active
  limit 1;
$$;

create or replace function public.crm_my_roles()
returns crm_role[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select roles from public.crm_staff where profile_id = auth.uid() and is_active limit 1),
    '{}'::crm_role[]
  );
$$;

create or replace function public.has_crm_role(variadic r crm_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_my_roles() && r;
$$;

create or replace function public.crm_is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sales_director', 'ops_qc', 'ceo');
$$;

create or replace function public.crm_my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.crm_staff
  where profile_id = auth.uid() and is_active
  limit 1;
$$;

create or replace function public.crm_same_office(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select o = public.crm_office_id();
$$;

-- p_profile миний багийнх мөн үү (team_lead-ийн багийн хүрээ).
create or replace function public.crm_is_team_of(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('team_lead')
     and public.crm_my_team() is not null
     and exists (
       select 1 from public.crm_staff s
       where s.profile_id = p_profile
         and s.office_id = public.crm_office_id()
         and s.team_id = public.crm_my_team()
         and s.is_active
     );
$$;

-- PL-6 (restricted) урсгалыг зөвхөн 5 дүр харна.
create or replace function public.crm_can_view_pl6(p_pipeline uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not p.restricted from public.crm_pipelines p where p.id = p_pipeline), false)
      or public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'ceo', 'sysadmin');
$$;

-- Оффис CRM-тэй юу (bootstrap шалгалт — эхний crm_staff мөрийг оффис админ өөртөө үүсгэнэ).
create or replace function public.crm_office_has_staff(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_staff where office_id = o and is_active);
$$;

-- §1.1 эрхийн тэлэлтийн хаалт: crm_staff мөргүй хэрэглэгч → хуучин зан төлөв (true),
-- мөртэй бол panel_admin утга. Платформ админ үргэлж true.
create or replace function public.crm_is_panel_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    else coalesce(
      (select s.panel_admin from public.crm_staff s where s.profile_id = auth.uid() and s.is_active limit 1),
      true
    )
  end;
$$;

-- Тухайн мөчид хүчинтэй тохиргооны утга (§2.2; definer RPC-ийн аюулгүйн дүрэм:
-- authenticated дуудагч зөвхөн ӨӨРИЙН оффисын утгыг авна; service role (auth.uid() null) чөлөөтэй).
create or replace function public.crm_setting_at(p_office uuid, p_key text, p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and p_office is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  return (
    select value from public.crm_settings
    where office_id = p_office and key = p_key
      and valid_from <= p_at and (valid_to is null or valid_to > p_at)
    order by valid_from desc limit 1
  );
end $$;

-- Ажлын өдрийн хуанли (F-604): МУТСТ 5 өдөр, SLA бүгд эндээс.
create or replace function public.crm_add_business_days(p_office uuid, p_from date, p_days int)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_from; n int := 0;
begin
  if auth.uid() is not null and p_office is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  while n < p_days loop
    d := d + 1;
    if coalesce((select is_workday from public.crm_calendar_days where office_id = p_office and day = d),
                extract(isodow from d) < 6) then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Автомат дугаарлалт (F-401/F-518) — race-гүй; зөвхөн trigger/service-role дуудна
-- (authenticated-аас execute доор хураагдана).
create or replace function public.crm_next_number(p_office uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update public.crm_sequences set next_no = next_no + 1
   where office_id = p_office and kind = p_kind
   returning prefix, next_no - 1 as no, pad into r;
  if r is null then raise exception 'crm_sequences: % тохируулагдаагүй', p_kind; end if;
  return r.prefix || lpad(r.no::text, r.pad, '0');
end $$;

-- Аудит бичих нийтлэг definer helper (trigger/action-уудад; SEC-06/07).
create or replace function public.crm_write_audit(
  p_office uuid, p_entity text, p_entity_id uuid, p_action text,
  p_field text default null, p_old jsonb default null, p_new jsonb default null, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and p_office is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (p_office, auth.uid(), p_entity, p_entity_id, p_action, p_field, p_old, p_new, p_reason);
end $$;

-- ── Нийтлэг trigger функцууд ──

-- updated_at автомат (§2.4 house style — updated_at-тай хүснэгт бүрд залгана).
create or replace function public.crm_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Immutable талбар хамгаалагч (F-106/F-401/F-417, ACC-24) — баганы нэрс TG_ARGV-ээр.
create or replace function public.crm_protect_immutable()
returns trigger language plpgsql as $$
declare col text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if n->col is distinct from o->col then
      raise exception 'CRM: өөрчлөх хориотой талбар (%)', col;
    end if;
  end loop;
  return new;
end $$;

-- Тохиргооны өөрчлөлт бүр аудитад (SEC-06 «тохиргооны өөрчлөлт», ACC-26).
create or replace function public.crm_audit_config_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, new_value)
  values (
    coalesce(new.office_id, old.office_id),
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end $$;

-- Тохиргооны хувилбар засагдахгүй — зөвхөн valid_to хаана (+note); шинэ утга = шинэ мөр (D4, F-453).
create or replace function public.crm_settings_update_guard()
returns trigger language plpgsql as $$
begin
  if new.office_id  is distinct from old.office_id
     or new.key        is distinct from old.key
     or new.value      is distinct from old.value
     or new.valid_from is distinct from old.valid_from
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'CRM: тохиргооны хувилбар засагдахгүй — шинэ хувилбар үүсгэнэ (зөвхөн valid_to хаагдана)';
  end if;
  return new;
end $$;

-- P-10: нээлттэй эзэмшилтэй бичлэгтэй ажилтныг идэвхгүй болгохыг хориглоно.
-- (crm_leads/crm_opportunities хожмын миграцид үүсэх тул to_regclass guard + dynamic SQL.)
create or replace function public.crm_staff_deactivate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n bigint := 0; c bigint;
begin
  if old.is_active and not new.is_active then
    if to_regclass('public.crm_leads') is not null then
      execute 'select count(*) from public.crm_leads where owner_id = $1 and status in (''new'',''active'')'
        into c using new.profile_id;
      n := n + coalesce(c, 0);
    end if;
    if to_regclass('public.crm_opportunities') is not null then
      execute 'select count(*) from public.crm_opportunities where owner_id = $1 and state = ''open'''
        into c using new.profile_id;
      n := n + coalesce(c, 0);
    end if;
    if n > 0 then
      raise exception 'CRM: хүлээлцэх дуусаагүй — энэ ажилтанд % нээлттэй бичлэг байна', n;
    end if;
  end if;
  return new;
end $$;

-- F-652: mandatory event-ийн мэдэгдлийг хувийн сонголтоор хаахыг хориглоно
-- (cross-table CHECK боломжгүй тул trigger).
create or replace function public.crm_notification_prefs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare m_mandatory boolean;
begin
  select mandatory into m_mandatory
  from public.crm_notification_matrix
  where office_id = new.office_id and event_code = new.event_code;
  if coalesce(m_mandatory, false)
     and (new.channels is null or coalesce(array_length(new.channels, 1), 0) = 0 or not (new.channels @> array['app'])) then
    raise exception 'CRM: энэ мэдэгдэл заавал ангилалд багтдаг тул хаах боломжгүй';
  end if;
  return new;
end $$;

-- ── Trigger залгалтууд ──

create trigger crm_staff_immutable
  before update on public.crm_staff
  for each row execute function public.crm_protect_immutable('office_id', 'profile_id', 'created_at');
create trigger crm_staff_deactivate
  before update of is_active on public.crm_staff
  for each row execute function public.crm_staff_deactivate_guard();
create trigger crm_staff_audit
  after insert or update on public.crm_staff
  for each row execute function public.crm_audit_config_change();

create trigger crm_settings_guard
  before update on public.crm_settings
  for each row execute function public.crm_settings_update_guard();
create trigger crm_settings_audit
  after insert or update on public.crm_settings
  for each row execute function public.crm_audit_config_change();

create trigger crm_zone_directory_audit
  after insert or update on public.crm_zone_directory
  for each row execute function public.crm_audit_config_change();
create trigger crm_pipelines_audit
  after insert or update on public.crm_pipelines
  for each row execute function public.crm_audit_config_change();
create trigger crm_stages_audit
  after insert or update on public.crm_stages
  for each row execute function public.crm_audit_config_change();
create trigger crm_stage_transitions_audit
  after insert or update on public.crm_stage_transitions
  for each row execute function public.crm_audit_config_change();
create trigger crm_gate_requirements_audit
  after insert or update on public.crm_gate_requirements
  for each row execute function public.crm_audit_config_change();
create trigger crm_automation_rules_audit
  after insert or update on public.crm_automation_rules
  for each row execute function public.crm_audit_config_change();
create trigger crm_notification_matrix_audit
  after insert or update on public.crm_notification_matrix
  for each row execute function public.crm_audit_config_change();

create trigger crm_assignment_state_touch
  before update on public.crm_assignment_state
  for each row execute function public.crm_set_updated_at();

create trigger crm_notification_prefs_check
  before insert or update on public.crm_notification_prefs
  for each row execute function public.crm_notification_prefs_guard();

-- ════════════════════════════════════════════════════════════
-- RLS (бүх policy-ийн урьдчилсан нөхцөл: office_id = crm_office_id();
--  ГАЖИЛТ: supabase_realtime publication-д crm_* хүснэгт НЭМЭХГҮЙ)
-- ════════════════════════════════════════════════════════════

alter table public.crm_branches            enable row level security;
alter table public.crm_teams               enable row level security;
alter table public.crm_staff               enable row level security;
alter table public.crm_lookups             enable row level security;
alter table public.crm_settings            enable row level security;
alter table public.crm_calendar_days       enable row level security;
alter table public.crm_sequences           enable row level security;
alter table public.crm_zone_directory      enable row level security;
alter table public.crm_pipelines           enable row level security;
alter table public.crm_stages              enable row level security;
alter table public.crm_stage_transitions   enable row level security;
alter table public.crm_gate_requirements   enable row level security;
alter table public.crm_audit_log           enable row level security;
alter table public.crm_duty_shifts         enable row level security;
alter table public.crm_assignment_state    enable row level security;
alter table public.crm_automation_rules    enable row level security;
alter table public.crm_rule_runs           enable row level security;
alter table public.crm_notification_matrix enable row level security;
alter table public.crm_notification_prefs  enable row level security;

-- Лавлагаа өгөгдөл: оффисын бүх идэвхтэй staff уншина; бичих sysadmin + ops_qc (ACC-17 хоёр хүний зарчим).
create policy crm_branches_select on public.crm_branches for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_branches_insert on public.crm_branches for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_branches_update on public.crm_branches for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_teams_select on public.crm_teams for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_teams_insert on public.crm_teams for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_teams_update on public.crm_teams for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- crm_staff (ToR §7.1 «Хэрэглэгч»): агент өөрийн мөр; team_lead багийнх; бусад дүр компанийн; бичих sysadmin (+SD засах).
create policy crm_staff_select on public.crm_staff for select
  using (
    office_id = (select public.crm_office_id())
    and (
      profile_id = auth.uid()
      or ((select public.has_crm_role('team_lead')) and team_id is not distinct from (select public.crm_my_team()) and team_id is not null)
      or (select public.has_crm_role('sales_director', 'ops_qc', 'marketing', 'property_manager', 'finance', 'aml_officer', 'ceo', 'sysadmin'))
    )
  );
create policy crm_staff_insert on public.crm_staff for insert
  with check (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sysadmin'))
      -- bootstrap: CRM-гүй оффисын админ ЭХНИЙ мөрөө өөртөө үүсгэнэ
      or ((select public.jwt_role()) = 'office_admin'
          and profile_id = auth.uid()
          and not public.crm_office_has_staff(office_id))
    )
  );
create policy crm_staff_update on public.crm_staff for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'sales_director')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'sales_director')));

create policy crm_lookups_select on public.crm_lookups for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_lookups_insert on public.crm_lookups for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_lookups_update on public.crm_lookups for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Тохиргоо (ToR: харах SD/ops_qc/ceo/sysadmin; бичих sysadmin+ops_qc; finance хандахгүй —
-- программын уншилт crm_setting_at() definer RPC-ээр бүх staff-д хүрнэ).
create policy crm_settings_select on public.crm_settings for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'sysadmin')));
create policy crm_settings_insert on public.crm_settings for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_settings_update on public.crm_settings for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_calendar_days_select on public.crm_calendar_days for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_calendar_days_insert on public.crm_calendar_days for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_calendar_days_update on public.crm_calendar_days for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Дугаарлалт: зөвхөн sysadmin харна; бичилт зөвхөн service/seed (policy үгүй), олголт crm_next_number()-ээр.
create policy crm_sequences_select on public.crm_sequences for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin')));

create policy crm_zone_directory_select on public.crm_zone_directory for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_zone_directory_insert on public.crm_zone_directory for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_zone_directory_update on public.crm_zone_directory for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Урсгал/шат/шилжилт: staff уншина (PL-6 нь restricted шүүлттэй); бичих sysadmin+ops_qc.
create policy crm_pipelines_select on public.crm_pipelines for select
  using (office_id = (select public.crm_office_id())
         and (select public.crm_my_staff_id()) is not null
         and public.crm_can_view_pl6(id));
create policy crm_pipelines_insert on public.crm_pipelines for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_pipelines_update on public.crm_pipelines for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_stages_select on public.crm_stages for select
  using (office_id = (select public.crm_office_id())
         and (select public.crm_my_staff_id()) is not null
         and public.crm_can_view_pl6(pipeline_id));
create policy crm_stages_insert on public.crm_stages for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_stages_update on public.crm_stages for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_stage_transitions_select on public.crm_stage_transitions for select
  using (office_id = (select public.crm_office_id())
         and (select public.crm_my_staff_id()) is not null
         and public.crm_can_view_pl6(pipeline_id));
create policy crm_stage_transitions_insert on public.crm_stage_transitions for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_stage_transitions_update on public.crm_stage_transitions for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_gate_requirements_select on public.crm_gate_requirements for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_gate_requirements_insert on public.crm_gate_requirements for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_gate_requirements_update on public.crm_gate_requirements for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Аудит лог (SEC-09): sysadmin/ops_qc/ceo бүрэн; SD/finance хүрээндээ (AML-аас бусад);
-- AML entity-ийн мөр зөвхөн aml_officer + ceo. update/delete policy ОГТ ҮГҮЙ (SEC-08).
create policy crm_audit_log_select on public.crm_audit_log for select
  using (
    office_id = (select public.crm_office_id())
    and case
      when entity in ('crm_aml_cases', 'crm_aml_holds', 'crm_aml_alerts', 'crm_contact_aml')
        then (select public.has_crm_role('aml_officer', 'ceo'))
      else (select public.has_crm_role('sysadmin', 'ops_qc', 'ceo', 'sales_director', 'finance'))
    end
  );

create policy crm_duty_shifts_select on public.crm_duty_shifts for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_duty_shifts_insert on public.crm_duty_shifts for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('sysadmin', 'ops_qc', 'sales_director')));
create policy crm_duty_shifts_update on public.crm_duty_shifts for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sysadmin', 'ops_qc', 'sales_director')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('sysadmin', 'ops_qc', 'sales_director')));
create policy crm_duty_shifts_delete on public.crm_duty_shifts for delete
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sysadmin', 'ops_qc', 'sales_director')));

-- Хуваарилалтын төлөв: зөвхөн service role бичнэ; sysadmin/ops_qc харна.
create policy crm_assignment_state_select on public.crm_assignment_state for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_automation_rules_select on public.crm_automation_rules for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_automation_rules_insert on public.crm_automation_rules for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_automation_rules_update on public.crm_automation_rules for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

create policy crm_rule_runs_select on public.crm_rule_runs for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc', 'ceo')));

create policy crm_notification_matrix_select on public.crm_notification_matrix for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_notification_matrix_insert on public.crm_notification_matrix for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_notification_matrix_update on public.crm_notification_matrix for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Мэдэгдлийн хувийн сонголт: зөвхөн өөрийн мөр (mandatory guard trigger дээр).
create policy crm_notification_prefs_select on public.crm_notification_prefs for select
  using (profile_id = auth.uid());
create policy crm_notification_prefs_insert on public.crm_notification_prefs for insert
  with check (profile_id = auth.uid() and office_id = (select public.crm_office_id()));
create policy crm_notification_prefs_update on public.crm_notification_prefs for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and office_id = (select public.crm_office_id()));
create policy crm_notification_prefs_delete on public.crm_notification_prefs for delete
  using (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- §1.1 Эрхийн тэлэлтийн ХААЛТ — panel_admin биш CRM ажилтан
-- (finance/marketing/aml_officer г.м. user_role='office_admin' болсон ч)
-- оффис панелийн CRM-ээс ГАДУУРХ бичих эрхгүй.
-- ════════════════════════════════════════════════════════════

alter policy offices_write on public.offices
  using (public.is_admin()
         or (public.jwt_role() = 'office_admin' and id = public.my_office_id() and public.crm_is_panel_admin()))
  with check (public.is_admin()
              or (public.jwt_role() = 'office_admin' and id = public.my_office_id() and public.crm_is_panel_admin()));

-- can_manage_agent-ийн office_admin салаанд panel_admin шалгалт нэмнэ —
-- agents_update/delete, listings_*, listing_photos_write, leads_all, projects_all бүгд үүгээр нарийсна.
create or replace function public.can_manage_agent(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.agents ag
    where ag.id = a
      and (ag.profile_id = auth.uid()
           or (ag.office_id = public.my_office_id()
               and public.jwt_role() = 'office_admin'
               and public.crm_is_panel_admin()))
  );
$$;

alter policy agents_insert on public.agents
  with check (
    public.is_admin()
    or profile_id = auth.uid()
    or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin' and public.crm_is_panel_admin())
  );
alter policy agents_delete on public.agents
  using (public.is_admin()
         or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin' and public.crm_is_panel_admin()));

alter policy office_invites_insert on public.office_invites
  with check (public.is_admin()
              or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin' and public.crm_is_panel_admin()));
alter policy office_invites_delete on public.office_invites
  using (public.is_admin()
         or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin' and public.crm_is_panel_admin()));

-- ════════════════════════════════════════════════════════════
-- Definer функцүүдийн grant/revoke (§2.2 ЗААВАЛ дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_office_id() from anon, public;
revoke execute on function public.crm_my_staff_id() from anon, public;
revoke execute on function public.crm_my_roles() from anon, public;
revoke execute on function public.has_crm_role(variadic crm_role[]) from anon, public;
revoke execute on function public.crm_is_manager() from anon, public;
revoke execute on function public.crm_my_team() from anon, public;
revoke execute on function public.crm_same_office(uuid) from anon, public;
revoke execute on function public.crm_is_team_of(uuid) from anon, public;
revoke execute on function public.crm_can_view_pl6(uuid) from anon, public;
revoke execute on function public.crm_office_has_staff(uuid) from anon, public;
revoke execute on function public.crm_is_panel_admin() from anon, public;
revoke execute on function public.crm_setting_at(uuid, text, timestamptz) from anon, public;
revoke execute on function public.crm_add_business_days(uuid, date, int) from anon, public;
revoke execute on function public.crm_write_audit(uuid, text, uuid, text, text, jsonb, jsonb, text) from anon, public;

grant execute on function public.crm_office_id() to authenticated;
grant execute on function public.crm_my_staff_id() to authenticated;
grant execute on function public.crm_my_roles() to authenticated;
grant execute on function public.has_crm_role(variadic crm_role[]) to authenticated;
grant execute on function public.crm_is_manager() to authenticated;
grant execute on function public.crm_my_team() to authenticated;
grant execute on function public.crm_same_office(uuid) to authenticated;
grant execute on function public.crm_is_team_of(uuid) to authenticated;
grant execute on function public.crm_can_view_pl6(uuid) to authenticated;
grant execute on function public.crm_office_has_staff(uuid) to authenticated;
grant execute on function public.crm_is_panel_admin() to authenticated;
grant execute on function public.crm_setting_at(uuid, text, timestamptz) to authenticated;
grant execute on function public.crm_add_business_days(uuid, date, int) to authenticated;
grant execute on function public.crm_write_audit(uuid, text, uuid, text, text, jsonb, jsonb, text) to authenticated;

-- Зөвхөн trigger/service-role: authenticated-аас ч хураана.
revoke execute on function public.crm_next_number(uuid, text) from anon, public, authenticated;

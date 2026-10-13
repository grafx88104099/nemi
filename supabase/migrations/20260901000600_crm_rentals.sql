-- ============================================================
-- PMC CRM — Түрээсийн менежмент (U6, M8: F-500–599).
-- Менежментийн гэрээ, түрээсийн гэрээ (exclusion — нэг объект дээр
-- нэг мөчид НЭГ идэвхтэй гэрээ), нэхэмжлэх, төлбөр (Д-25 босго,
-- AML hold түгжээ №3), барьцаа/суутгал (нотолгоо заавал F-542),
-- засварын хүсэлт (SLA, өмчлөгчийн зөвшөөрөл F-548), сарын
-- менежментийн бүртгэл (журмын 9.2 маягт, F-559 hold), өмчлөгчийн
-- тайлан (орлого−зардал−хөлс=цэвэр олголт F-561), орох/гарах үзлэг,
-- хоцролтын шатлал (F-535–539).
--
-- Гол шийдвэрүүд (docs/crm/DESIGN.md §2.10):
--  • Статусын машин бүгд DB trigger guard (D6) — UI = давхар шалгалт;
--  • Нэхэмжлэхийн төлөв төлбөрөөс АВТОМАТ (F-519/528) — гараар
--    partially_paid/paid тавихыг GUC 'crm.invoice_sync'-гүйгээр хориглоно;
--  • Д-25: төлбөр орох бүрд босго шалгаад crm_aml_alerts-д insert —
--    кейс/тоолуур/мэдэгдлийг 000500-ийн crm_aml_alert_after үргэлжлүүлнэ;
--  • Hold түгжээ №3: идэвхтэй AML hold-той хэлцэлтэй холбоотой
--    орлогын төлбөр/нэхэмжлэх илгээлт хориотой;
--  • Төгсгөлд циркуляр FK-ууд: crm_transactions.lease_id,
--    crm_properties.active_lease_id/management_agreement_id,
--    crm_need_profiles.fulfilled_txn_id (§2 хүснэгтийн дүрэм);
--  • ГАЖИЛТ: supabase_realtime-д НЭМЭХГҮЙ (санаатай, U1 конвенц).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД
-- ════════════════════════════════════════════════════════════

create table public.crm_management_agreements (  -- F-510–514 (өмчлөгчтэй)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  owner_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  start_on date not null,
  end_on date,
  fee_pct numeric(5,2) not null,                 -- гэрээ тус бүрийн хувь (F-510)
  reporting_frequency text not null default 'monthly',
  inspection_rights text,
  inspection_frequency text,
  notice_days int not null default 30,
  repair_approval_limit numeric(14,2) not null,  -- F-513 → F-548
  status text not null default 'active',         -- draft|active|terminated
  renewal_reminder_days int,                     -- F-512 (Lease-ээс тусдаа)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_mgmt_agr_status check (status in ('draft', 'active', 'terminated')),
  constraint crm_mgmt_agr_fee check (fee_pct >= 0 and fee_pct <= 100)
);
create index crm_mgmt_agr_owner_idx  on public.crm_management_agreements (owner_contact_id);
create index crm_mgmt_agr_office_idx on public.crm_management_agreements (office_id, status);
create index crm_mgmt_agr_end_idx    on public.crm_management_agreements (office_id, end_on) where status = 'active';

create table public.crm_management_agreement_properties ( -- 1 гэрээ — N объект (F-511)
  agreement_id uuid not null references public.crm_management_agreements(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  terms jsonb,
  primary key (agreement_id, property_id)
);
create index crm_mgmt_agr_props_prop_idx on public.crm_management_agreement_properties (property_id);

create table public.crm_leases (                 -- F-500–509
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  tenant_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  landlord_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  transaction_id uuid references public.crm_transactions(id),
  start_on date not null,
  end_on date not null,
  monthly_rent numeric(14,2) not null,
  payment_day int not null check (payment_day between 1 and 31),
  grace_days int not null default 0,
  deposit_amount numeric(14,2) not null,
  deposit_holder crm_expense_bearer,             -- landlord|pmc (F-540)
  deposit_received_on date,
  deposit_returned_on date,
  deposit_returned_amount numeric(14,2),
  is_managed boolean not null default false,
  management_agreement_id uuid references public.crm_management_agreements(id),
  duration_tier text,                            -- F-502: trigger тооцно (settings 'rental_fee_tiers')
  indexation jsonb,                              -- F-508
  status crm_lease_status not null default 'draft',
  previous_lease_id uuid references public.crm_leases(id), -- сунгалтын гинж (F-504)
  termination_reason text,
  termination_docs jsonb,
  signed_doc_id uuid references public.crm_documents(id),  -- F-507
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_lease_dates check (start_on < end_on),
  constraint crm_lease_rent check (monthly_rent > 0),
  constraint crm_lease_deposit check (deposit_amount >= 0),
  -- ⭐ Нэг объект дээр нэг мөчид НЭГ идэвхтэй гэрээ (§2.2.3).
  -- '[)' хагас нээлттэй муж: сунгалтын шинэ гэрээ хуучны end_on өдрөөс эхэлж болно:
  constraint crm_leases_one_active exclude using gist (
    property_id with =,
    daterange(start_on, end_on, '[)') with &&
  ) where (status = 'active')
);
create index crm_leases_property_idx on public.crm_leases (property_id, status);
create index crm_leases_tenant_idx   on public.crm_leases (tenant_contact_id);
create index crm_leases_landlord_idx on public.crm_leases (landlord_contact_id);
create index crm_leases_end_idx      on public.crm_leases (office_id, end_on) where status = 'active';
create index crm_leases_prev_idx     on public.crm_leases (previous_lease_id);
-- renewLease бичилтийн дараалал (exclusion constraint immediate тул): ЭХЛЭЭД шинэ гэрээг
-- draft-аар insert, ДАРАА НЬ хуучныг status='renewed', ТЭГЭЭД шинийг active болгоно
-- (lib/actions/crm-leases.ts renewLease — §6.2).

create table public.crm_lease_expense_lines (    -- F-505
  lease_id uuid not null references public.crm_leases(id) on delete cascade,
  expense_type text not null,                    -- electricity|water|heating|hoa|internet|other
  bearer crm_expense_bearer not null,
  primary key (lease_id, expense_type),
  constraint crm_lease_expense_type check (
    expense_type in ('electricity', 'water', 'heating', 'hoa', 'internet', 'other')
  )
);

create table public.crm_invoices (               -- F-515–524
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,
  type crm_invoice_type not null,
  lease_id uuid references public.crm_leases(id),
  transaction_id uuid references public.crm_transactions(id),
  recipient_contact_id uuid not null references public.crm_contacts(id),
  period_month date,                             -- сарын нэхэмжлэхэд (сар бүр НЭГ)
  issued_on date not null default current_date,
  due_on date not null,
  amount numeric(14,2) not null,
  status crm_invoice_status not null default 'planned',
  approval_doc_id uuid references public.crm_documents(id), -- F-523 нэмэлт үйлчилгээнд заавал
  corrected_invoice_id uuid references public.crm_invoices(id), -- F-522 залруулгын гинж
  cancel_reason text,
  cancelled_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (office_id, number),
  unique (lease_id, type, period_month),         -- Д-13: сар бүр нэг л сарын нэхэмжлэх
  constraint crm_invoice_amount check (amount > 0),
  constraint crm_invoice_link check (lease_id is not null or transaction_id is not null or type = 'extra_service')
);
create index crm_invoices_due_idx   on public.crm_invoices (office_id, status, due_on);
create index crm_invoices_lease_idx on public.crm_invoices (lease_id, period_month);
create index crm_invoices_recipient_idx on public.crm_invoices (recipient_contact_id);

create table public.crm_payments (               -- F-525–534
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  kind crm_payment_kind not null,                -- income | control (зөвхөн income шимтгэлийн суурь F-526)
  invoice_id uuid references public.crm_invoices(id),
  schedule_line_id uuid references public.crm_payment_schedule_lines(id),
  transaction_id uuid references public.crm_transactions(id),
  lease_id uuid references public.crm_leases(id),
  paid_on date not null,
  amount numeric(14,2) not null,
  currency text not null default 'MNT',
  fx_rate numeric(14,6) not null default 1,
  amount_mnt numeric(14,2) generated always as (amount * fx_rate) stored,
  method text not null,                          -- bank|cash|foreign|virtual|other
  doc_id uuid references public.crm_documents(id),
  finance_verified_by uuid references public.profiles(id),
  finance_verified_at timestamptz,               -- F-527
  correction_of_id uuid references public.crm_payments(id), -- F-530
  refund_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_payment_link check (
    invoice_id is not null or schedule_line_id is not null or transaction_id is not null or lease_id is not null
  ),
  constraint crm_payment_amount check (amount <> 0),
  constraint crm_payment_fx check (fx_rate > 0),
  constraint crm_payment_method check (method in ('bank', 'cash', 'foreign', 'virtual', 'other'))
);
create index crm_payments_invoice_idx  on public.crm_payments (invoice_id);
create index crm_payments_schedule_idx on public.crm_payments (schedule_line_id);
create index crm_payments_txn_idx      on public.crm_payments (transaction_id);
create index crm_payments_lease_idx    on public.crm_payments (lease_id);
create index crm_payments_office_idx   on public.crm_payments (office_id, paid_on desc);

create table public.crm_vendors (                -- F-550 гүйцэтгэгчийн лавлах
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  name text not null,
  phone text,
  specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index crm_vendors_office_idx on public.crm_vendors (office_id, is_active);

create table public.crm_maintenance_requests (   -- F-545–554
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  source text not null,                          -- tenant|inspection|owner|pm_team
  category_id uuid references public.crm_lookups(id),
  urgency crm_urgency not null default 'normal',
  description text not null,
  status crm_maintenance_status not null default 'new',
  owner_approval_needed boolean not null default false, -- F-548: дүн > agreement.repair_approval_limit → trigger
  owner_approved_at timestamptz,
  owner_approval_doc_id uuid references public.crm_documents(id),
  emergency_bypass boolean not null default false,      -- F-549 (дараа нөхөн баталгаажна)
  vendor_id uuid references public.crm_vendors(id),
  assigned_to uuid references public.profiles(id),
  estimate_amount numeric(14,2),
  actual_amount numeric(14,2),
  cost_bearer crm_expense_bearer,
  sla_respond_by timestamptz,
  sla_resolve_by timestamptz,                    -- settings 'maintenance_sla' (trigger)
  completed_on date,
  completion_doc_id uuid references public.crm_documents(id), -- F-553 нотолгоогүй хаалт хориотой
  reject_reason text,
  complaint_id uuid,                             -- FK 000800-д (crm_complaints)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_maint_source check (source in ('tenant', 'inspection', 'owner', 'pm_team'))
);
create index crm_maint_status_idx   on public.crm_maintenance_requests (office_id, status, urgency);
create index crm_maint_property_idx on public.crm_maintenance_requests (property_id, created_at desc);
create index crm_maint_lease_idx    on public.crm_maintenance_requests (lease_id);
create index crm_maint_sla_idx      on public.crm_maintenance_requests (office_id, sla_resolve_by)
  where status in ('new', 'pending_approval', 'assigned', 'in_progress');

create table public.crm_monthly_records (        -- F-555–559 (журмын 9.2 маягт)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agreement_id uuid not null references public.crm_management_agreements(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  month date not null,                           -- сарын 1-ний огноо
  data jsonb not null default '{}',              -- маягтын 17 талбар (autofill талбарууд cron бөглөнө)
  completeness_pct numeric(5,2) not null default 0,
  net_income numeric(14,2),
  commission_hold boolean not null default false,-- F-559 → F-461
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, property_id, month)      -- сар бүрд НЭГ бүртгэл
);
create index crm_monthly_office_idx on public.crm_monthly_records (office_id, month desc);
create index crm_monthly_lease_idx  on public.crm_monthly_records (lease_id);

create table public.crm_owner_statements (       -- F-560–564
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  agreement_id uuid not null references public.crm_management_agreements(id) on delete restrict,
  owner_contact_id uuid not null references public.crm_contacts(id),
  period_start date not null,
  period_end date not null,
  income numeric(14,2) not null default 0,
  expenses numeric(14,2) not null default 0,
  mgmt_fee numeric(14,2) not null default 0,
  net_payout numeric(14,2) generated always as (income - expenses - mgmt_fee) stored, -- F-561
  detail jsonb not null default '{}',
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, period_start),
  constraint crm_statement_period check (period_start <= period_end)
);
create index crm_statements_office_idx on public.crm_owner_statements (office_id, period_start desc);

create table public.crm_inspections (            -- F-575–579
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  lease_id uuid references public.crm_leases(id),
  kind crm_inspection_kind not null,
  inspected_on date not null,
  confirmed_by_tenant boolean not null default false,
  confirmed_by_staff uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_inspections_lease_idx    on public.crm_inspections (lease_id, kind);
create index crm_inspections_property_idx on public.crm_inspections (property_id, inspected_on desc);

create table public.crm_inspection_items (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  inspection_id uuid not null references public.crm_inspections(id) on delete cascade,
  room text,
  item text not null,
  condition text not null,
  note text,
  photo_doc_id uuid references public.crm_documents(id),
  matched_item_id uuid references public.crm_inspection_items(id), -- move-out ↔ move-in зэрэгцүүлэлт (F-576)
  discrepancy boolean not null default false
);
create index crm_inspection_items_idx on public.crm_inspection_items (inspection_id);

create table public.crm_deposit_deductions (     -- F-541–544
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  lease_id uuid not null references public.crm_leases(id) on delete restrict,
  category text not null,                        -- damage|unpaid_rent|utility_debt
  amount numeric(14,2) not null,
  rationale text not null,
  evidence_inspection_item_id uuid not null references public.crm_inspection_items(id), -- F-542 нотолгоо ЗААВАЛ
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_deduction_category check (category in ('damage', 'unpaid_rent', 'utility_debt')),
  constraint crm_deduction_amount check (amount > 0)
);
create index crm_deductions_lease_idx on public.crm_deposit_deductions (lease_id);

create table public.crm_arrears_escalations (    -- F-535–539 хоцролтын шатлал
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  invoice_id uuid not null references public.crm_invoices(id) on delete restrict,
  lease_id uuid not null references public.crm_leases(id) on delete restrict,
  step int not null,                             -- 1..N (settings 'arrears_ladder')
  assigned_role crm_role not null,
  task_id uuid references public.tasks(id),
  escalated_at timestamptz not null default now(),
  unique (invoice_id, step)
);
create index crm_arrears_lease_idx on public.crm_arrears_escalations (lease_id, escalated_at desc);
create index crm_arrears_office_idx on public.crm_arrears_escalations (office_id, escalated_at desc);

-- ── Хойшлогдсон циркуляр FK-ууд (§2 хүснэгтийн дүрэм — энд Л) ──

alter table public.crm_transactions
  add constraint crm_transactions_lease_fkey
  foreign key (lease_id) references public.crm_leases(id);

alter table public.crm_properties
  add constraint crm_properties_active_lease_fkey
  foreign key (active_lease_id) references public.crm_leases(id);

alter table public.crm_properties
  add constraint crm_properties_mgmt_agreement_fkey
  foreign key (management_agreement_id) references public.crm_management_agreements(id);

alter table public.crm_need_profiles
  add constraint crm_need_profiles_fulfilled_txn_fkey
  foreign key (fulfilled_txn_id) references public.crm_transactions(id);

alter table public.crm_owner_profiles
  add constraint crm_owner_profiles_fulfilled_txn_fkey
  foreign key (fulfilled_txn_id) references public.crm_transactions(id);

-- ════════════════════════════════════════════════════════════
-- HELPER ФУНКЦУУД (RLS — §3.2 «эзэмшигч агент/PM/менежер/finance»)
-- ════════════════════════════════════════════════════════════

-- Түрээсийн гэрээг харах эрх (ACC: agent Х-ө, team_lead Х-б, SD/ops_qc/finance/aml/ceo Х-к, PM ХҮЗ-т).
create or replace function public.crm_can_view_lease(l uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare lease public.crm_leases;
begin
  select * into lease from public.crm_leases where id = l;
  if lease.id is null or lease.office_id is distinct from public.crm_office_id() then
    return false;
  end if;
  if public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo', 'aml_officer') then
    return true;
  end if;
  if lease.created_by = auth.uid() or public.crm_is_team_of(lease.created_by) then
    return true;
  end if;
  -- Объектын роль бүхий агент (гэрээ хийсэн/листингийн агент) өөрийн объектын гэрээг харна.
  return exists (
    select 1 from public.crm_property_roles r
    where r.property_id = lease.property_id and r.agent_profile_id = auth.uid()
  );
end $$;

-- Түрээсийн гэрээг засах эрх: PM + finance (ACC-10 — агент засахгүй);
-- статусын шилжилтийн нарийн дүрийг crm_lease_status_guard давхар шалгана.
create or replace function public.crm_can_edit_lease(l uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_office uuid;
begin
  select office_id into v_office from public.crm_leases where id = l;
  if v_office is distinct from public.crm_office_id() then return false; end if;
  return public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc');
end $$;

-- Менежментийн гэрээг харах эрх (ACC: agent Х-ө, SD/finance/ceo Х-к, PM ХҮЗ-т).
create or replace function public.crm_can_view_mgmt_agreement(a uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare agr public.crm_management_agreements;
begin
  select * into agr from public.crm_management_agreements where id = a;
  if agr.id is null or agr.office_id is distinct from public.crm_office_id() then
    return false;
  end if;
  return agr.created_by = auth.uid()
      or public.has_crm_role('property_manager', 'finance', 'sales_director', 'ceo');
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Менежментийн гэрээ
-- ════════════════════════════════════════════════════════════

create or replace function public.crm_mgmt_agreement_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(new.number, '') is null then
    new.number := public.crm_next_number(new.office_id, 'mgmt_agreement');
  end if;
  return new;
end $$;

create or replace function public.crm_mgmt_agreement_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, new_value)
  values (new.office_id, auth.uid(), 'crm_management_agreements', new.id, lower(tg_op),
          case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status, 'fee_pct', old.fee_pct, 'end_on', old.end_on) end,
          jsonb_build_object('status', new.status, 'fee_pct', new.fee_pct, 'end_on', new.end_on));
  return new;
end $$;

-- F-514: гэрээг цуцлахад идэвхтэй Lease үлдсэн бол хориглоно (эхлээд хүлээлцэх урсгал).
create or replace function public.crm_mgmt_agreement_terminate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if old.status <> 'terminated' and new.status = 'terminated' then
    select count(*) into n
    from public.crm_leases l
    where l.management_agreement_id = new.id and l.status = 'active';
    if n > 0 then
      raise exception 'CRM_LEASE: менежментийн гэрээн доор % идэвхтэй түрээсийн гэрээ байна — эхлээд хаах/шилжүүлэх (F-514)', n;
    end if;
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Түрээсийн гэрээ
-- ════════════════════════════════════════════════════════════

-- F-502: хугацааны шатлалын ангилал (settings 'rental_fee_tiers' — {tiers:[{code,min_months,fee_pct}]}).
create or replace function public.crm_lease_duration_tier(p_office uuid, p_start date, p_end date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  months numeric;
  tier record;
  best_code text;
  best_min numeric := -1;
  cfg jsonb;
begin
  months := (extract(year from age(p_end, p_start)) * 12 + extract(month from age(p_end, p_start)))::numeric;
  cfg := public.crm_setting_at(p_office, 'rental_fee_tiers');
  if cfg is null then return null; end if;
  for tier in select * from jsonb_to_recordset(cfg -> 'tiers') as t(code text, min_months numeric, fee_pct numeric)
  loop
    if months >= coalesce(tier.min_months, 0) and coalesce(tier.min_months, 0) > best_min then
      best_min := coalesce(tier.min_months, 0);
      best_code := tier.code;
    end if;
  end loop;
  return best_code;
end $$;

create or replace function public.crm_lease_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(new.number, '') is null then
    new.number := public.crm_next_number(new.office_id, 'lease');
  end if;
  new.duration_tier := public.crm_lease_duration_tier(new.office_id, new.start_on, new.end_on);
  if new.status not in ('draft', 'active') then
    raise exception 'CRM_LEASE: шинэ гэрээ зөвхөн Ноорог эсвэл Идэвхтэй төлөвтэй үүснэ (F-501)';
  end if;
  if new.status = 'active' then
    if new.signed_doc_id is null then
      raise exception 'CRM_LEASE: идэвхжүүлэхэд гарын үсэгтэй хувь хавсрагдсан байх ёстой (F-507)';
    end if;
    if new.is_managed and new.management_agreement_id is null then
      raise exception 'CRM_LEASE: менежменттэй гэрээнд менежментийн гэрээний холбоос заавал (F-510)';
    end if;
  end if;
  return new;
end $$;

-- F-501 статусын машин: draft→active|terminated; active→renewed|terminated|expired.
create or replace function public.crm_lease_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Огноо өөрчлөгдвөл шатлал дахин тооцно (F-502).
  if new.start_on is distinct from old.start_on or new.end_on is distinct from old.end_on then
    new.duration_tier := public.crm_lease_duration_tier(new.office_id, new.start_on, new.end_on);
  end if;

  if new.status = old.status then
    -- F-507: идэвхтэй гэрээний шийдвэрлэх талбар зөвхөн нэмэлт гэрээ/залруулгаар —
    -- шууд UPDATE-аар үндсэн нөхцөл өөрчлөхийг хориглоно.
    if old.status in ('active', 'renewed', 'terminated', 'expired') and (
      new.monthly_rent is distinct from old.monthly_rent
      or new.start_on is distinct from old.start_on
      or new.end_on is distinct from old.end_on
      or new.deposit_amount is distinct from old.deposit_amount
      or new.payment_day is distinct from old.payment_day
      or new.tenant_contact_id is distinct from old.tenant_contact_id
      or new.landlord_contact_id is distinct from old.landlord_contact_id
      or new.property_id is distinct from old.property_id
    ) then
      raise exception 'CRM_LEASE: идэвхтэй/хаагдсан гэрээний шийдвэрлэх талбар шууд өөрчлөгдөхгүй — сунгалт/залруулгаар (F-507)';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'draft'  and new.status in ('active', 'terminated')) or
    (old.status = 'active' and new.status in ('renewed', 'terminated', 'expired'))
  ) then
    raise exception 'CRM_LEASE: % → % шилжилт зөвшөөрөгдөөгүй (F-501)', old.status, new.status;
  end if;

  if old.status = 'draft' and new.status = 'active' then
    -- ҮХХ мен. баг / түрээс хариуцсан агент (бүртгэсэн).
    if auth.uid() is not null
       and not (public.has_crm_role('property_manager', 'sales_director', 'ops_qc')
                or new.created_by = auth.uid()) then
      raise exception 'CRM_LEASE: идэвхжүүлэх эрхгүй — ҮХХ баг эсвэл хариуцсан агент (F-501)';
    end if;
    if new.signed_doc_id is null then
      raise exception 'CRM_LEASE: идэвхжүүлэхэд гарын үсэгтэй хувь хавсрагдсан байх ёстой (F-507)';
    end if;
    if new.is_managed and new.management_agreement_id is null then
      raise exception 'CRM_LEASE: менежменттэй гэрээнд менежментийн гэрээний холбоос заавал (F-510)';
    end if;
  end if;

  if old.status = 'draft' and new.status = 'terminated' then
    if nullif(new.termination_reason, '') is null then
      raise exception 'CRM_LEASE: цуцлалтад үндэслэл заавал (F-501)';
    end if;
  end if;

  if old.status = 'active' and new.status = 'renewed' then
    if auth.uid() is not null and not public.has_crm_role('property_manager', 'sales_director', 'ops_qc') then
      raise exception 'CRM_LEASE: сунгалтын бүртгэлийг ҮХХ баг хийнэ (F-501)';
    end if;
  end if;

  if old.status = 'active' and new.status = 'terminated' then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ops_qc') then
      raise exception 'CRM_LEASE: идэвхтэй гэрээний цуцлалтыг Борлуулалтын захирал / ҮА-ЧМТ шийдвэрлэнэ (F-501)';
    end if;
    if nullif(new.termination_reason, '') is null then
      raise exception 'CRM_LEASE: цуцлалтад шалтгаан + нотолгооны бүрдэл заавал (F-573)';
    end if;
  end if;

  if old.status = 'active' and new.status = 'expired' then
    -- Зөвхөн систем (cron, service role — auth.uid() null).
    if auth.uid() is not null then
      raise exception 'CRM_LEASE: «Дууссан» төлөвийг систем автоматаар тавьдаг (F-501)';
    end if;
  end if;

  return new;
end $$;

-- AFTER: аудит + объектын ашиглалтын синк + Д-23/Д-24 rule_runs.
create or replace function public.crm_lease_status_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      update public.crm_properties
         set active_lease_id = new.id, occupancy = 'occupied'
       where id = new.property_id;
    end if;
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (new.office_id, auth.uid(), 'crm_leases', new.id, 'insert',
            jsonb_build_object('number', new.number, 'status', new.status));
    return new;
  end if;

  if new.status = old.status then return new; end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (new.office_id, auth.uid(), 'crm_leases', new.id, 'status', 'status',
          to_jsonb(old.status), to_jsonb(new.status), new.termination_reason);

  if new.status = 'active' then
    update public.crm_properties
       set active_lease_id = new.id, occupancy = 'occupied'
     where id = new.property_id;
  end if;

  if new.status in ('terminated', 'expired') then
    update public.crm_properties
       set active_lease_id = null, occupancy = 'vacant'
     where id = new.property_id and active_lease_id = new.id;
    -- Д-23: барьцааны тооцоо хийгдээгүй бол хяналтын дараалалд.
    if new.deposit_returned_on is null then
      insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
      values (new.office_id, 'D-23', 'crm_leases', new.id, 'pending',
              jsonb_build_object('deposit_amount', new.deposit_amount));
    end if;
  end if;

  if new.status = 'renewed' then
    update public.crm_properties
       set active_lease_id = null
     where id = new.property_id and active_lease_id = new.id;
    insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
    values (new.office_id, 'D-24', 'crm_leases', new.id, 'ok', '{"chained": true}'::jsonb);
  end if;

  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Нэхэмжлэх
-- ════════════════════════════════════════════════════════════

create or replace function public.crm_invoice_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(new.number, '') is null then
    new.number := public.crm_next_number(new.office_id, 'invoice');
  end if;
  if new.type = 'extra_service' and new.approval_doc_id is null then
    raise exception 'CRM_INVOICE: нэмэлт үйлчилгээний нэхэмжлэхэд бичгэн зөвшөөрлийн баримт заавал (F-523)';
  end if;
  if new.due_on < new.issued_on then
    raise exception 'CRM_INVOICE: эцсийн хугацаа үүсгэсэн огнооноос өмнө байж болохгүй';
  end if;
  if new.status not in ('planned', 'sent') then
    raise exception 'CRM_INVOICE: шинэ нэхэмжлэх зөвхөн Төлөвлөсөн/Илгээсэн төлөвтэй үүснэ (F-519)';
  end if;
  if new.status = 'sent' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end $$;

-- Холбоотой хэлцэлд идэвхтэй AML hold бий эсэх (нэхэмжлэх/төлбөрийн түгжээ №3).
create or replace function public.crm_invoice_txn_on_hold(p_invoice public.crm_invoices)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_txn uuid;
begin
  v_txn := p_invoice.transaction_id;
  if v_txn is null and p_invoice.lease_id is not null then
    select transaction_id into v_txn from public.crm_leases where id = p_invoice.lease_id;
  end if;
  if v_txn is null then return false; end if;
  return public.crm_txn_on_hold(v_txn);
end $$;

create or replace function public.crm_invoice_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Шийдвэрлэх талбар immutable (залруулга = шинэ нэхэмжлэх F-522).
  if new.number is distinct from old.number
     or new.type is distinct from old.type
     or new.lease_id is distinct from old.lease_id
     or new.transaction_id is distinct from old.transaction_id
     or new.period_month is distinct from old.period_month
     or new.recipient_contact_id is distinct from old.recipient_contact_id then
    raise exception 'CRM_INVOICE: нэхэмжлэхийн үндсэн талбар өөрчлөгдөхгүй — залруулгын нэхэмжлэхээр (F-522)';
  end if;
  if new.amount is distinct from old.amount and old.status <> 'planned' then
    raise exception 'CRM_INVOICE: илгээгдсэн нэхэмжлэхийн дүн өөрчлөгдөхгүй — залруулгын нэхэмжлэхээр (F-522)';
  end if;

  if new.status = old.status then return new; end if;

  if not (
    (old.status = 'planned' and new.status in ('sent', 'cancelled')) or
    (old.status = 'sent' and new.status in ('partially_paid', 'paid', 'cancelled')) or
    (old.status = 'partially_paid' and new.status in ('paid', 'cancelled')) or
    -- залруулгын төлбөр (буцаалт) үлдэгдэл сэргээж болно:
    (old.status = 'paid' and new.status = 'partially_paid')
  ) then
    raise exception 'CRM_INVOICE: % → % шилжилт зөвшөөрөгдөөгүй (F-519/522)', old.status, new.status;
  end if;

  -- Төлөгдсөн/хэсэгчлэн төлөгдсөн — зөвхөн төлбөрийн тулгалтын систем тавина (F-519).
  if new.status in ('partially_paid', 'paid')
     and coalesce(current_setting('crm.invoice_sync', true), '') <> '1' then
    raise exception 'CRM_INVOICE: төлбөрийн төлөв төлбөрийн бүртгэлээс автомат шинэчлэгдэнэ — гараар тавихгүй (F-519)';
  end if;
  if old.status = 'paid' and coalesce(current_setting('crm.invoice_sync', true), '') <> '1' then
    raise exception 'CRM_INVOICE: төлөгдсөн нэхэмжлэх өөрчлөгдөхгүй (F-522)';
  end if;

  if new.status = 'sent' then
    if public.crm_invoice_txn_on_hold(new) then
      raise exception 'CRM_INVOICE: холбоотой хэлцэл МУТСТ түгжээтэй — нэхэмжлэх илгээхийг хориглоно (§7.5)';
    end if;
    new.sent_at := coalesce(new.sent_at, now());
  end if;

  if new.status = 'cancelled' then
    if auth.uid() is not null and not public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc') then
      raise exception 'CRM_INVOICE: хүчингүй болгох эрхгүй (F-522)';
    end if;
    if nullif(new.cancel_reason, '') is null then
      raise exception 'CRM_INVOICE: хүчингүй болгоход үндэслэлийн тэмдэглэл заавал (F-522)';
    end if;
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;

  return new;
end $$;

create or replace function public.crm_invoice_status_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_invoices', new.id, 'status', 'status',
            to_jsonb(old.status), to_jsonb(new.status), new.cancel_reason);
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Төлбөр
-- ════════════════════════════════════════════════════════════

-- BEFORE INSERT: hold түгжээ №3 (орлогын төлбөр), холбоосын оффис нийцэл.
create or replace function public.crm_payment_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_txn uuid; inv public.crm_invoices;
begin
  if new.kind = 'income' then
    v_txn := new.transaction_id;
    if v_txn is null and new.invoice_id is not null then
      select * into inv from public.crm_invoices where id = new.invoice_id;
      v_txn := inv.transaction_id;
      if v_txn is null and inv.lease_id is not null then
        select transaction_id into v_txn from public.crm_leases where id = inv.lease_id;
      end if;
    end if;
    if v_txn is null and new.lease_id is not null then
      select transaction_id into v_txn from public.crm_leases where id = new.lease_id;
    end if;
    if v_txn is null and new.schedule_line_id is not null then
      select transaction_id into v_txn from public.crm_payment_schedule_lines where id = new.schedule_line_id;
    end if;
    if v_txn is not null and public.crm_txn_on_hold(v_txn) then
      raise exception 'CRM_PAYMENT: хэлцэл МУТСТ түгжээтэй — орлогын төлбөр бүртгэхийг хориглоно (§7.5-3)';
    end if;
  end if;

  if new.invoice_id is not null and new.lease_id is null then
    select lease_id into new.lease_id from public.crm_invoices where id = new.invoice_id;
  end if;
  if new.schedule_line_id is not null and new.transaction_id is null then
    select transaction_id into new.transaction_id
    from public.crm_payment_schedule_lines where id = new.schedule_line_id;
  end if;
  return new;
end $$;

-- AFTER INSERT: (1) нэхэмжлэхийн үлдэгдэл→төлөв (F-519/528); (2) хуваарийн мөрийн
-- paid_amount (F-406); (3) Д-25 босго → crm_aml_alerts; (4) аудит.
create or replace function public.crm_payment_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.crm_invoices;
  v_paid numeric;
  v_threshold numeric;
  v_contact uuid;
  v_status crm_invoice_status;
begin
  -- (1) Нэхэмжлэхийн тулгалт — зөвхөн орлогын төлбөр үлдэгдэлд тооцогдоно (F-526).
  if new.invoice_id is not null and new.kind = 'income' then
    select * into inv from public.crm_invoices where id = new.invoice_id;
    select coalesce(sum(p.amount_mnt), 0) into v_paid
    from public.crm_payments p
    where p.invoice_id = new.invoice_id and p.kind = 'income';
    v_status := case
      when v_paid >= inv.amount then 'paid'::crm_invoice_status
      when v_paid > 0 then 'partially_paid'::crm_invoice_status
      else inv.status
    end;
    if inv.status in ('sent', 'partially_paid', 'paid') and v_status is distinct from inv.status then
      perform set_config('crm.invoice_sync', '1', true);
      update public.crm_invoices set status = v_status where id = new.invoice_id;
      perform set_config('crm.invoice_sync', '', true);
    end if;
  end if;

  -- (2) Хэлцлийн төлбөрийн хуваарийн гүйцэтгэл (F-406).
  if new.schedule_line_id is not null and new.kind = 'income' then
    update public.crm_payment_schedule_lines s
       set paid_amount = (
         select coalesce(sum(p.amount_mnt), 0)
         from public.crm_payments p
         where p.schedule_line_id = s.id and p.kind = 'income'
       )
     where s.id = new.schedule_line_id;
  end if;

  -- (3) Д-25: бэлэн/гадаад/виртуал арга + ₮ дүйцэл ≥ босго → автомат дохио.
  -- Кейс, 5 ажлын өдрийн тоолуур, officer мэдэгдлийг crm_aml_alert_after (000500) үүсгэнэ.
  if new.method in ('cash', 'foreign', 'virtual') then
    v_threshold := coalesce((public.crm_setting_at(new.office_id, 'aml_threshold_mnt')) #>> '{}', '20000000')::numeric;
    if abs(new.amount_mnt) >= v_threshold then
      v_contact := null;
      if new.invoice_id is not null then
        select recipient_contact_id into v_contact from public.crm_invoices where id = new.invoice_id;
      end if;
      if v_contact is null and new.lease_id is not null then
        select tenant_contact_id into v_contact from public.crm_leases where id = new.lease_id;
      end if;
      insert into public.crm_aml_alerts
        (office_id, contact_id, transaction_id, payment_id, alert_kind, reported_by,
         category, observed, amount_mnt, payment_method)
      values
        (new.office_id, v_contact, new.transaction_id, new.id, 'threshold', new.created_by,
         'threshold', 'Босго хэтэрсэн төлбөрийн автомат илрүүлэлт (Д-25)', new.amount_mnt, new.method);
    end if;
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
  values (new.office_id, auth.uid(), 'crm_payments', new.id, 'insert',
          jsonb_build_object('kind', new.kind, 'amount_mnt', new.amount_mnt, 'method', new.method));

  return new;
end $$;

-- F-534: засвар/устгал аудитад (RLS зөвхөн finance-д нээлттэй).
create or replace function public.crm_payment_change_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value)
    values (old.office_id, auth.uid(), 'crm_payments', old.id, 'delete', to_jsonb(old) - 'created_at');
    -- Устгасны дараа нэхэмжлэх/хуваарийн үлдэгдлийг дахин тооцно.
    if old.invoice_id is not null then
      perform public.crm_resync_invoice_status(old.invoice_id);
    end if;
    if old.schedule_line_id is not null then
      update public.crm_payment_schedule_lines s
         set paid_amount = (
           select coalesce(sum(p.amount_mnt), 0)
           from public.crm_payments p
           where p.schedule_line_id = s.id and p.kind = 'income'
         )
       where s.id = old.schedule_line_id;
    end if;
    return old;
  end if;

  -- Шийдвэрлэх талбарууд immutable (залруулга = сөрөг мөр F-530).
  if new.amount is distinct from old.amount
     or new.kind is distinct from old.kind
     or new.invoice_id is distinct from old.invoice_id
     or new.fx_rate is distinct from old.fx_rate then
    raise exception 'CRM_PAYMENT: төлбөрийн дүн/төрөл өөрчлөгдөхгүй — залруулгын бүртгэлээр (F-530)';
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, new_value)
  values (new.office_id, auth.uid(), 'crm_payments', new.id, 'update',
          jsonb_build_object('finance_verified_at', old.finance_verified_at, 'refund_note', old.refund_note),
          jsonb_build_object('finance_verified_at', new.finance_verified_at, 'refund_note', new.refund_note));
  return new;
end $$;

-- Нэхэмжлэхийн төлөвийг төлбөрүүдээс дахин тооцох (устгал/залруулгын дараа).
create or replace function public.crm_resync_invoice_status(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare inv public.crm_invoices; v_paid numeric; v_status crm_invoice_status;
begin
  select * into inv from public.crm_invoices where id = p_invoice;
  if inv.id is null or inv.status in ('planned', 'cancelled') then return; end if;
  select coalesce(sum(p.amount_mnt), 0) into v_paid
  from public.crm_payments p where p.invoice_id = p_invoice and p.kind = 'income';
  v_status := case
    when v_paid >= inv.amount then 'paid'::crm_invoice_status
    when v_paid > 0 then 'partially_paid'::crm_invoice_status
    else 'sent'::crm_invoice_status
  end;
  if v_status is distinct from inv.status then
    perform set_config('crm.invoice_sync', '1', true);
    update public.crm_invoices set status = v_status where id = p_invoice;
    perform set_config('crm.invoice_sync', '', true);
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Барьцааны суутгал
-- ════════════════════════════════════════════════════════════

-- F-542: нотолгооны мөр гарах үзлэгийнх, ижил гэрээнийх байх ёстой;
-- F-543: батламжийг зөвхөн эрх бүхий түвшин (агент дангаар шийдэхгүй).
create or replace function public.crm_deduction_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare insp public.crm_inspections;
begin
  select i.* into insp
  from public.crm_inspection_items it
  join public.crm_inspections i on i.id = it.inspection_id
  where it.id = new.evidence_inspection_item_id;
  if insp.id is null then
    raise exception 'CRM_DEPOSIT: суутгалын мөр гарах үзлэгийн нотолгоотой заавал холбогдоно (F-542)';
  end if;
  if insp.kind <> 'move_out' or insp.lease_id is distinct from new.lease_id then
    raise exception 'CRM_DEPOSIT: нотолгоо энэ гэрээний ГАРАХ үзлэгийн мөр байх ёстой (F-542)';
  end if;

  if tg_op = 'UPDATE' and new.approved_by is not null and old.approved_by is null then
    -- F-543: агент/ҮХХ мен. дангаар шийдэхгүй — зөвхөн менежер/Санхүү батална (§3.2).
    if auth.uid() is not null
       and not public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'finance') then
      raise exception 'CRM_DEPOSIT: суутгалыг зөвхөн менежер/Санхүү батална — агент дангаар шийдэхгүй (F-543)';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_deposit_deductions', new.id, 'approve',
            jsonb_build_object('amount', new.amount, 'category', new.category), new.rationale);
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Засварын хүсэлт
-- ════════════════════════════════════════════════════════════

-- INSERT: SLA хугацаа (settings 'maintenance_sla'), өмчлөгчийн зөвшөөрлийн туг (F-548).
create or replace function public.crm_maintenance_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sla jsonb;
  respond_h numeric;
  resolve_h numeric;
  v_limit numeric;
begin
  sla := public.crm_setting_at(new.office_id, 'maintenance_sla');
  if sla is not null then
    respond_h := nullif(sla #>> array[new.urgency::text, 'respond_hours'], '')::numeric;
    resolve_h := nullif(sla #>> array[new.urgency::text, 'resolve_hours'], '')::numeric;
    if respond_h is not null then new.sla_respond_by := coalesce(new.sla_respond_by, now() + make_interval(hours => respond_h::int)); end if;
    if resolve_h is not null then new.sla_resolve_by := coalesce(new.sla_resolve_by, now() + make_interval(hours => resolve_h::int)); end if;
  end if;

  v_limit := public.crm_maintenance_approval_limit(new.property_id, new.lease_id);
  if new.estimate_amount is not null and v_limit is not null and new.estimate_amount > v_limit then
    new.owner_approval_needed := true;
  end if;
  return new;
end $$;

-- Менежментийн гэрээний засварын зөвшөөрлийн босго (F-513).
create or replace function public.crm_maintenance_approval_limit(p_property uuid, p_lease uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_agr uuid; v_limit numeric;
begin
  if p_lease is not null then
    select management_agreement_id into v_agr from public.crm_leases where id = p_lease;
  end if;
  if v_agr is null and p_property is not null then
    select management_agreement_id into v_agr from public.crm_properties where id = p_property;
  end if;
  if v_agr is null then return null; end if;
  select repair_approval_limit into v_limit from public.crm_management_agreements where id = v_agr;
  return v_limit;
end $$;

-- F-547 статусын машин + F-548/549/553 нөхцөлүүд.
create or replace function public.crm_maintenance_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit numeric;
begin
  -- Төсөвт дүн өөрчлөгдөхөд босго дахин шалгана (F-548).
  if new.estimate_amount is distinct from old.estimate_amount then
    v_limit := public.crm_maintenance_approval_limit(new.property_id, new.lease_id);
    if new.estimate_amount is not null and v_limit is not null and new.estimate_amount > v_limit
       and new.owner_approved_at is null then
      new.owner_approval_needed := true;
    end if;
  end if;

  if new.status = old.status then return new; end if;

  if not (
    (old.status = 'new' and new.status in ('pending_approval', 'assigned', 'rejected')) or
    (old.status = 'pending_approval' and new.status in ('assigned', 'rejected')) or
    (old.status = 'assigned' and new.status in ('in_progress', 'rejected')) or
    (old.status = 'in_progress' and new.status = 'closed')
  ) then
    raise exception 'CRM_MAINT: % → % шилжилт зөвшөөрөгдөөгүй (F-547)', old.status, new.status;
  end if;

  -- F-548: зөвшөөрөл шаардлагатай бол оноохын өмнө өмчлөгчийн зөвшөөрөл эсвэл яаралтай bypass (F-549).
  if new.status = 'assigned' and new.owner_approval_needed
     and new.owner_approved_at is null and not new.emergency_bypass then
    raise exception 'CRM_MAINT: өмчлөгчийн зөвшөөрөл бүртгэгдээгүй — босгоос дээш дүнтэй засвар (F-548); яаралтай бол bypass тэмдэглэнэ (F-549)';
  end if;

  if new.status = 'rejected' and nullif(new.reject_reason, '') is null then
    raise exception 'CRM_MAINT: татгалзахад шалтгаан заавал';
  end if;

  -- F-553: гүйцэтгэлийн нотолгоогүй хаалт хориотой.
  if new.status = 'closed' then
    if new.completion_doc_id is null then
      raise exception 'CRM_MAINT: хаахад гүйцэтгэлийн нотолгоо (зураг, акт) заавал (F-553)';
    end if;
    new.completed_on := coalesce(new.completed_on, current_date);
  end if;

  return new;
end $$;

create or replace function public.crm_maintenance_status_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_maintenance_requests', new.id, 'status', 'status',
            to_jsonb(old.status), to_jsonb(new.status), new.reject_reason);
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Сарын менежментийн бүртгэл
-- ════════════════════════════════════════════════════════════

-- Журмын 9.2 маягтын 17 талбарын бөглөлт (F-555/558).
create or replace function public.crm_monthly_completeness(p_data jsonb)
returns numeric language plpgsql immutable as $$
declare
  keys text[] := array[
    'unit', 'owner_name', 'tenant_name', 'monthly_rent', 'service_fee', 'payment_day',
    'rent_paid', 'rent_paid_date', 'utility_status', 'usage_issues', 'complaints_repairs',
    'actions_taken', 'agent_issues', 'owner_notified', 'crm_updated', 'net_income', 'bonus_approved'
  ];
  k text;
  filled int := 0;
  v jsonb;
begin
  foreach k in array keys loop
    v := p_data -> k;
    if k = 'rent_paid_date' and (p_data ->> 'rent_paid') = 'false' then
      filled := filled + 1;          -- түрээс төлөгдөөгүй сард огноо шаардахгүй
    elsif v is not null and jsonb_typeof(v) <> 'null'
          and (jsonb_typeof(v) <> 'string' or btrim(p_data ->> k) <> '') then
      filled := filled + 1;
    end if;
  end loop;
  return round(filled::numeric * 100 / array_length(keys, 1), 2);
end $$;

create or replace function public.crm_monthly_record_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.month := date_trunc('month', new.month)::date;
  new.completeness_pct := public.crm_monthly_completeness(new.data);
  new.net_income := nullif(new.data ->> 'net_income', '')::numeric;
  -- F-559: бүрэн бус бүртгэл → тухайн сарын урамшууллын hold нөхцөл автомат.
  new.commission_hold := new.completeness_pct < 100;
  if new.completeness_pct >= 100 then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create or replace function public.crm_monthly_record_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.data is distinct from old.data then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_monthly_records', new.id, 'update', 'data',
            jsonb_build_object('completeness_pct', old.completeness_pct),
            jsonb_build_object('completeness_pct', new.completeness_pct, 'commission_hold', new.commission_hold));
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Өмчлөгчийн тайлан
-- ════════════════════════════════════════════════════════════

-- Илгээсэн тайлан өөрчлөгдөхгүй (илгээлт/хүлээн авалтын огнооноос бусад).
create or replace function public.crm_statement_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.sent_at is not null and (
    new.income is distinct from old.income
    or new.expenses is distinct from old.expenses
    or new.mgmt_fee is distinct from old.mgmt_fee
    or new.detail is distinct from old.detail
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
  ) then
    raise exception 'CRM_STATEMENT: илгээсэн тайлангийн агуулга өөрчлөгдөхгүй — шинэ тайлан үүсгэнэ (F-562)';
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ЗАЛГАЛТУУД
-- ════════════════════════════════════════════════════════════

create trigger crm_mgmt_agr_t1_defaults
  before insert on public.crm_management_agreements
  for each row execute function public.crm_mgmt_agreement_insert_defaults();
create trigger crm_mgmt_agr_t2_immutable
  before update on public.crm_management_agreements
  for each row execute function public.crm_protect_immutable('office_id', 'number', 'owner_contact_id', 'created_by', 'created_at');
create trigger crm_mgmt_agr_t3_terminate
  before update of status on public.crm_management_agreements
  for each row execute function public.crm_mgmt_agreement_terminate_guard();
create trigger crm_mgmt_agr_t4_audit
  after insert or update on public.crm_management_agreements
  for each row execute function public.crm_mgmt_agreement_audit();

create trigger crm_leases_t1_defaults
  before insert on public.crm_leases
  for each row execute function public.crm_lease_insert_defaults();
create trigger crm_leases_t2_immutable
  before update on public.crm_leases
  for each row execute function public.crm_protect_immutable('office_id', 'number', 'created_by', 'created_at');
create trigger crm_leases_t3_status
  before update on public.crm_leases
  for each row execute function public.crm_lease_status_guard();
create trigger crm_leases_t4_updated
  before update on public.crm_leases
  for each row execute function public.crm_set_updated_at();
create trigger crm_leases_t5_after
  after insert or update on public.crm_leases
  for each row execute function public.crm_lease_status_after();

create trigger crm_invoices_t1_insert
  before insert on public.crm_invoices
  for each row execute function public.crm_invoice_insert_guard();
create trigger crm_invoices_t2_update
  before update on public.crm_invoices
  for each row execute function public.crm_invoice_update_guard();
create trigger crm_invoices_t3_after
  after update on public.crm_invoices
  for each row execute function public.crm_invoice_status_after();

create trigger crm_payments_t1_insert
  before insert on public.crm_payments
  for each row execute function public.crm_payment_insert_guard();
create trigger crm_payments_t2_after
  after insert on public.crm_payments
  for each row execute function public.crm_payment_after_insert();
create trigger crm_payments_t3_change
  before update or delete on public.crm_payments
  for each row execute function public.crm_payment_change_audit();

create trigger crm_deductions_guard
  before insert or update on public.crm_deposit_deductions
  for each row execute function public.crm_deduction_guard();

create trigger crm_maint_t1_defaults
  before insert on public.crm_maintenance_requests
  for each row execute function public.crm_maintenance_insert_defaults();
create trigger crm_maint_t2_status
  before update on public.crm_maintenance_requests
  for each row execute function public.crm_maintenance_status_guard();
create trigger crm_maint_t3_after
  after update on public.crm_maintenance_requests
  for each row execute function public.crm_maintenance_status_after();

create trigger crm_monthly_t1_sync
  before insert or update on public.crm_monthly_records
  for each row execute function public.crm_monthly_record_sync();
create trigger crm_monthly_t2_audit
  after update on public.crm_monthly_records
  for each row execute function public.crm_monthly_record_audit();

create trigger crm_statements_guard
  before update on public.crm_owner_statements
  for each row execute function public.crm_statement_guard();

-- ════════════════════════════════════════════════════════════
-- RLS (§3.2 — бүх policy-д office_id урьдчилсан нөхцөл, initplan боолт)
-- ════════════════════════════════════════════════════════════

alter table public.crm_management_agreements          enable row level security;
alter table public.crm_management_agreement_properties enable row level security;
alter table public.crm_leases                enable row level security;
alter table public.crm_lease_expense_lines   enable row level security;
alter table public.crm_invoices              enable row level security;
alter table public.crm_payments              enable row level security;
alter table public.crm_vendors               enable row level security;
alter table public.crm_maintenance_requests  enable row level security;
alter table public.crm_monthly_records       enable row level security;
alter table public.crm_owner_statements      enable row level security;
alter table public.crm_inspections           enable row level security;
alter table public.crm_inspection_items      enable row level security;
alter table public.crm_deposit_deductions    enable row level security;
alter table public.crm_arrears_escalations   enable row level security;

-- Менежментийн гэрээ (ACC: PM ХҮЗ-т; SD/finance/ceo Х-к; agent Х-ө).
create policy crm_mgmt_agr_select on public.crm_management_agreements for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_mgmt_agreement(id));
create policy crm_mgmt_agr_insert on public.crm_management_agreements for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')));
create policy crm_mgmt_agr_update on public.crm_management_agreements for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')));

create policy crm_mgmt_agr_props_select on public.crm_management_agreement_properties for select
  using (public.crm_can_view_mgmt_agreement(agreement_id));
create policy crm_mgmt_agr_props_insert on public.crm_management_agreement_properties for insert
  with check ((select public.has_crm_role('property_manager', 'sales_director', 'ops_qc'))
              and public.crm_can_view_mgmt_agreement(agreement_id));
create policy crm_mgmt_agr_props_delete on public.crm_management_agreement_properties for delete
  using ((select public.has_crm_role('property_manager', 'sales_director', 'ops_qc'))
         and public.crm_can_view_mgmt_agreement(agreement_id));

-- Түрээсийн гэрээ (§3.2: харах — эзэмшигч агент/PM/менежер/finance; бичих PM+agent; засах guard-тай).
create policy crm_leases_select on public.crm_leases for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_lease(id));
create policy crm_leases_insert on public.crm_leases for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and (select public.crm_my_staff_id()) is not null
              and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')));
create policy crm_leases_update on public.crm_leases for update
  using (office_id = (select public.crm_office_id())
         and (public.crm_can_edit_lease(id) or created_by = auth.uid()))
  with check (office_id = (select public.crm_office_id())
              and (public.crm_can_edit_lease(id) or created_by = auth.uid()));

create policy crm_lease_expense_select on public.crm_lease_expense_lines for select
  using (public.crm_can_view_lease(lease_id));
create policy crm_lease_expense_insert on public.crm_lease_expense_lines for insert
  with check (public.crm_can_edit_lease(lease_id)
              or exists (select 1 from public.crm_leases l
                         where l.id = lease_id and l.created_by = auth.uid() and l.status = 'draft'));
create policy crm_lease_expense_update on public.crm_lease_expense_lines for update
  using (public.crm_can_edit_lease(lease_id))
  with check (public.crm_can_edit_lease(lease_id));
create policy crm_lease_expense_delete on public.crm_lease_expense_lines for delete
  using (public.crm_can_edit_lease(lease_id));

-- Нэхэмжлэх (ACC-11: finance Б-к; PM ХҮЗ-т; agent ХТ-ө — өөрийн гэрээний л).
create policy crm_invoices_select on public.crm_invoices for select
  using (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo', 'aml_officer'))
      or (lease_id is not null and public.crm_can_view_lease(lease_id))
      or (transaction_id is not null and public.crm_can_view_txn(transaction_id))
    )
  );
create policy crm_invoices_insert on public.crm_invoices for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'finance')));
create policy crm_invoices_update on public.crm_invoices for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc')));

-- Төлбөр (F-534: засвар/устгал ЗӨВХӨН finance; Д-25 trigger).
create policy crm_payments_select on public.crm_payments for select
  using (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo', 'aml_officer'))
      or created_by = auth.uid()
      or (lease_id is not null and public.crm_can_view_lease(lease_id))
      or (transaction_id is not null and public.crm_can_view_txn(transaction_id))
    )
  );
create policy crm_payments_insert on public.crm_payments for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and (select public.has_crm_role('property_manager', 'finance')));
create policy crm_payments_update on public.crm_payments for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('finance')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('finance')));
create policy crm_payments_delete on public.crm_payments for delete
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('finance')));

create policy crm_vendors_select on public.crm_vendors for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_vendors_insert on public.crm_vendors for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'ops_qc', 'sysadmin')));
create policy crm_vendors_update on public.crm_vendors for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'ops_qc', 'sysadmin')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'ops_qc', 'sysadmin')));

-- Засварын хүсэлт (ACC: agent ХҮ-ө; team_lead Х-б; PM ХҮЗ-т; SD/ops/finance/ceo Х-к).
create policy crm_maint_select on public.crm_maintenance_requests for select
  using (
    office_id = (select public.crm_office_id())
    and (
      created_by = auth.uid()
      or assigned_to = auth.uid()
      or public.crm_is_team_of(created_by)
      or (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc', 'finance', 'ceo'))
    )
  );
create policy crm_maint_insert on public.crm_maintenance_requests for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and (select public.crm_my_staff_id()) is not null);
create policy crm_maint_update on public.crm_maintenance_requests for update
  using (
    office_id = (select public.crm_office_id())
    and (assigned_to = auth.uid()
         or (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')))
  )
  with check (
    office_id = (select public.crm_office_id())
    and (assigned_to = auth.uid()
         or (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')))
  );

-- Сарын бүртгэл (§3.2: PM/менежер/finance харна; cron + PM бичнэ).
create policy crm_monthly_select on public.crm_monthly_records for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo')));
create policy crm_monthly_insert on public.crm_monthly_records for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager')));
create policy crm_monthly_update on public.crm_monthly_records for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager')));

-- Өмчлөгчийн тайлан (ACC: PM ХҮЗ-т; finance ХЗ-к; SD/ops/ceo Х-к).
create policy crm_statements_select on public.crm_owner_statements for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo')));
create policy crm_statements_insert on public.crm_owner_statements for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'finance')));
create policy crm_statements_update on public.crm_owner_statements for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'finance')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'finance')));

-- Үзлэг (§3.2: lease-ийн эрх дагана; объект дундын сан тул staff уншина).
create policy crm_inspections_select on public.crm_inspections for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_inspections_insert on public.crm_inspections for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')));
create policy crm_inspections_update on public.crm_inspections for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')));

create policy crm_inspection_items_select on public.crm_inspection_items for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_inspection_items_insert on public.crm_inspection_items for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')));
create policy crm_inspection_items_update on public.crm_inspection_items for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'agent', 'team_lead', 'sales_director', 'ops_qc')));

-- Барьцааны суутгал (F-543: батлах — guard; харах lease эрхээр; PM бүртгэнэ).
create policy crm_deductions_select on public.crm_deposit_deductions for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_lease(lease_id));
create policy crm_deductions_insert on public.crm_deposit_deductions for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'sales_director', 'ops_qc')));
create policy crm_deductions_update on public.crm_deposit_deductions for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('property_manager', 'finance', 'sales_director', 'ops_qc', 'ceo')));

-- Хоцролтын шатлал: бичилт зөвхөн service role (Д-16 cron — insert policy үгүй); харах эрх lease-ийн дагуу.
create policy crm_arrears_select on public.crm_arrears_escalations for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_lease(lease_id));

-- ════════════════════════════════════════════════════════════
-- Definer функцүүдийн grant/revoke (§2.2 ЗААВАЛ дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_can_view_lease(uuid) from anon, public;
revoke execute on function public.crm_can_edit_lease(uuid) from anon, public;
revoke execute on function public.crm_can_view_mgmt_agreement(uuid) from anon, public;
revoke execute on function public.crm_lease_duration_tier(uuid, date, date) from anon, public;
revoke execute on function public.crm_maintenance_approval_limit(uuid, uuid) from anon, public;
revoke execute on function public.crm_monthly_completeness(jsonb) from anon, public;
revoke execute on function public.crm_invoice_txn_on_hold(public.crm_invoices) from anon, public;

grant execute on function public.crm_can_view_lease(uuid) to authenticated;
grant execute on function public.crm_can_edit_lease(uuid) to authenticated;
grant execute on function public.crm_can_view_mgmt_agreement(uuid) to authenticated;
grant execute on function public.crm_lease_duration_tier(uuid, date, date) to authenticated;
grant execute on function public.crm_maintenance_approval_limit(uuid, uuid) to authenticated;
grant execute on function public.crm_monthly_completeness(jsonb) to authenticated;

-- Зөвхөн trigger/service-role:
revoke execute on function public.crm_resync_invoice_status(uuid) from anon, public, authenticated;

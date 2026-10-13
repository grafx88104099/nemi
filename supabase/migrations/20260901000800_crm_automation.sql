-- ============================================================
-- PMC CRM — Автоматжуулалт, дараах үйлчилгээ (U8, crm-automation-notify).
-- NPS (F-751), реферал (F-752/753), гомдол, гарах ажилтны хүлээлцэх акт
-- (P-10/Д-11), хаагдсан хэлцлийн залруулгын бүртгэл (F-417),
-- integrity view-үүд (F-105/125/127).
--
-- Гол шийдвэрүүд (docs/crm/DESIGN.md §2.12):
--  * rules/notify суурь хүснэгтүүд (automation_rules, rule_runs,
--    notification_matrix/prefs) 000100-д — энд ЗӨВХӨН өргөтгөл;
--  * crm_complaints-д transaction_id багана НЭМСЭН (дизайны DDL-ээс гажилт):
--    U7-ийн F-461 гомдлын hold шалгалт (lib/actions/crm-commissions.ts)
--    transaction_id/severity/resolved_at багануудыг таамагладаг;
--  * crm_txn_corrections баганууд U5-ийн crm_apply_txn_correction RPC-ийн
--    insert-тэй яг таарна (office_id, transaction_id, changes, rationale,
--    approved_by, applied_at) — 000500-ийн to_regclass guard эндээс нээгдэнэ;
--  * crm_maintenance_requests.complaint_id-ийн FK энд (000600-д хойшлуулсан);
--  * D9 — hard delete policy ҮГҮЙ; realtime publication-д НЭМЭХГҮЙ.
-- ============================================================

-- ── NPS асуулга (F-751) ──

create table public.crm_nps_surveys (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  sent_at timestamptz,
  score int check (score between 0 and 10),
  comment text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (transaction_id, contact_id)            -- идемпотент илгээлт (cron F-751)
);
create index crm_nps_office_idx  on public.crm_nps_surveys (office_id, created_at desc);
create index crm_nps_contact_idx on public.crm_nps_surveys (contact_id);

-- ── Реферал — хоёр чиглэлийн холбоос (F-752/753) ──

create table public.crm_referrals (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  referrer_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (referrer_contact_id, lead_id)
);
create index crm_referrals_office_idx   on public.crm_referrals (office_id, created_at desc);
create index crm_referrals_referrer_idx on public.crm_referrals (referrer_contact_id);
create index crm_referrals_lead_idx     on public.crm_referrals (lead_id);

-- ── Гомдол (NPS доогуур / гар / засвараас) ──

create table public.crm_complaints (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  -- ГАЖИЛТ (санаатай): U7 F-461 hold шалгалт хэлцэлтэй холбогдсон ноцтой
  -- гомдлыг transaction_id-аар хайдаг тул дизайны DDL дээр нэмэв.
  transaction_id uuid references public.crm_transactions(id) on delete restrict,
  source text not null check (source in ('nps', 'manual', 'maintenance')),
  severity text not null default 'normal' check (severity in ('normal', 'serious')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  resolved_at timestamptz,
  resolution text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_complaints_office_idx  on public.crm_complaints (office_id, status, created_at desc);
create index crm_complaints_contact_idx on public.crm_complaints (contact_id);
create index crm_complaints_txn_idx     on public.crm_complaints (transaction_id) where transaction_id is not null;

-- Гомдлын төлөвийн guard: шийдвэрлэхэд resolution заавал, resolved_at автомат;
-- буцаан нээхэд цэвэрлэнэ.
create or replace function public.crm_complaint_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'resolved' then
    if coalesce(trim(new.resolution), '') = '' then
      raise exception 'CRM: гомдлыг шийдвэрлэхэд шийдвэрлэлтийн тайлбар заавал';
    end if;
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  else
    new.resolved_at := null;
  end if;
  return new;
end $$;

create trigger crm_complaints_guard
  before insert or update on public.crm_complaints
  for each row execute function public.crm_complaint_guard();
create trigger crm_complaints_immutable
  before update on public.crm_complaints
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'created_by', 'created_at');
create trigger crm_complaints_audit
  after insert or update on public.crm_complaints
  for each row execute function public.crm_audit_config_change();

-- ── Гарах ажилтны хүлээлцэх акт (P-10, Д-11) ──

create table public.crm_handover_acts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  staff_id uuid not null references public.crm_staff(id) on delete restrict,
  items jsonb not null,                          -- шилжүүлсэн бичлэгүүдийн жагсаалт (снапшот + шилжилтийн төлөв)
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  clients_notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_handover_acts_office_idx on public.crm_handover_acts (office_id, created_at desc);
create index crm_handover_acts_staff_idx  on public.crm_handover_acts (staff_id);

-- Батлагдсан акт өөрчлөгдөхгүй (хожмын урамшуулал/маргааны нотолгоо, P-10 5-р алхам);
-- батлахад approved_by заавал хамт бичигдэнэ.
create or replace function public.crm_handover_act_guard()
returns trigger language plpgsql as $$
begin
  if old.approved_at is not null then
    raise exception 'CRM: батлагдсан хүлээлцэх акт өөрчлөгдөхгүй';
  end if;
  if new.approved_at is not null and new.approved_by is null then
    raise exception 'CRM: актыг батлахад баталсан этгээд заавал';
  end if;
  return new;
end $$;

create trigger crm_handover_acts_guard
  before update on public.crm_handover_acts
  for each row execute function public.crm_handover_act_guard();
create trigger crm_handover_acts_immutable
  before update on public.crm_handover_acts
  for each row execute function public.crm_protect_immutable('office_id', 'staff_id', 'created_at');
create trigger crm_handover_acts_audit
  after insert or update on public.crm_handover_acts
  for each row execute function public.crm_audit_config_change();

-- ── Хаагдсан хэлцлийн залруулгын бүртгэл (F-417) ──
-- Бичилт ЗӨВХӨН crm_apply_txn_correction definer RPC-ээр (000500) — тэр
-- энэ хүснэгтийг to_regclass-аар шалгаад одооноос эхлэн автоматаар бичнэ.

create table public.crm_txn_corrections (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  changes jsonb not null,
  rationale text not null,
  approved_by uuid not null references public.profiles(id),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index crm_txn_corrections_txn_idx on public.crm_txn_corrections (transaction_id, created_at desc);

-- ── 000600-ийн хойшлогдсон FK: засварын хүсэлт ↔ гомдол ──

alter table public.crm_maintenance_requests
  add constraint crm_maintenance_requests_complaint_fk
  foreign key (complaint_id) references public.crm_complaints(id) on delete restrict;

-- ════════════════════════════════════════════════════════════
-- Integrity view-үүд (F-105/125/127 — өдөр тутмын шалгалт + самбар).
-- security_invoker = underlying RLS дуудагчийн эрхээр (§8.1 хэв).
-- ════════════════════════════════════════════════════════════

-- F-125: алтан дүрмийн 5 бүрдлийн зөрчилтэй идэвхтэй сэжим (DB CHECK-ийг
-- тойрсон түүхэн/гар засварын мөр илрүүлэх давхар шалгалт).
create view public.crm_v_golden_rule_violations
with (security_invoker = on) as
select
  l.id,
  l.office_id,
  l.contact_id,
  l.owner_id,
  l.grade,
  l.last_contact_at,
  l.next_step,
  l.next_step_date,
  array_remove(array[
    case when l.owner_id is null then 'owner' end,
    case when l.grade is null then 'grade' end,
    case when l.last_contact_at is null then 'last_contact' end,
    case when coalesce(trim(l.next_step), '') = '' then 'next_step' end,
    case when l.next_step_date is null then 'next_step_date' end
  ], null) as missing
from public.crm_leads l
where l.status = 'active'
  and (l.owner_id is null or l.grade is null or l.last_contact_at is null
       or coalesce(trim(l.next_step), '') = '' or l.next_step_date is null);

-- F-127: хамгаалалтгүй тэмдэглэгээтэй буюу дараагийн алхам нь хэтэрсэн сэжим.
create view public.crm_v_lead_hygiene
with (security_invoker = on) as
select
  l.id,
  l.office_id,
  l.owner_id,
  l.grade,
  l.status,
  l.unprotected,
  l.inactivity_days,
  l.next_step_date,
  (l.next_step_date is not null and l.next_step_date < current_date) as next_step_overdue
from public.crm_leads l
where l.status in ('new', 'active')
  and (l.unprotected
       or (l.next_step_date is not null and l.next_step_date < current_date));

revoke select on public.crm_v_golden_rule_violations from anon, public;
revoke select on public.crm_v_lead_hygiene from anon, public;
grant select on public.crm_v_golden_rule_violations to authenticated;
grant select on public.crm_v_lead_hygiene to authenticated;

-- ════════════════════════════════════════════════════════════
-- RLS (§3.2: nps/referrals/complaints — contact эрх дагана + marketing ○ (nps);
-- insert staff/cron; update эзэмшигч/ops_qc; delete policy ҮГҮЙ)
-- ════════════════════════════════════════════════════════════

alter table public.crm_nps_surveys     enable row level security;
alter table public.crm_referrals       enable row level security;
alter table public.crm_complaints      enable row level security;
alter table public.crm_handover_acts   enable row level security;
alter table public.crm_txn_corrections enable row level security;

create policy crm_nps_surveys_select on public.crm_nps_surveys for select
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_view_contact(contact_id)
         or (select public.has_crm_role('marketing', 'sysadmin')))
  );
create policy crm_nps_surveys_insert on public.crm_nps_surveys for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_nps_surveys_update on public.crm_nps_surveys for update
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_view_contact(contact_id) or (select public.has_crm_role('ops_qc', 'marketing')))
  )
  with check (
    office_id = (select public.crm_office_id())
    and (public.crm_can_view_contact(contact_id) or (select public.has_crm_role('ops_qc', 'marketing')))
  );

create policy crm_referrals_select on public.crm_referrals for select
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_view_contact(referrer_contact_id)
         or (select public.has_crm_role('marketing', 'sysadmin')))
  );
create policy crm_referrals_insert on public.crm_referrals for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );

create policy crm_complaints_select on public.crm_complaints for select
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_view_contact(contact_id) or created_by = auth.uid())
  );
create policy crm_complaints_insert on public.crm_complaints for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_complaints_update on public.crm_complaints for update
  using (
    office_id = (select public.crm_office_id())
    and (created_by = auth.uid() or (select public.has_crm_role('ops_qc', 'sales_director', 'ceo')))
  )
  with check (
    office_id = (select public.crm_office_id())
    and (created_by = auth.uid() or (select public.has_crm_role('ops_qc', 'sales_director', 'ceo')))
  );

-- Хүлээлцэх акт: удирдлага + гарч буй ажилтан өөрөө уншина; бичих SD/sysadmin.
create policy crm_handover_acts_select on public.crm_handover_acts for select
  using (
    office_id = (select public.crm_office_id())
    and (
      (select public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'sysadmin'))
      or exists (
        select 1 from public.crm_staff s
        where s.id = crm_handover_acts.staff_id and s.profile_id = auth.uid()
      )
    )
  );
create policy crm_handover_acts_insert on public.crm_handover_acts for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.has_crm_role('sales_director', 'sysadmin'))
  );
create policy crm_handover_acts_update on public.crm_handover_acts for update
  using (
    office_id = (select public.crm_office_id())
    and (select public.has_crm_role('sales_director', 'sysadmin'))
  )
  with check (
    office_id = (select public.crm_office_id())
    and (select public.has_crm_role('sales_director', 'sysadmin'))
  );

-- Залруулгын бүртгэл: унших финанс/удирдлага; бичих ЗӨВХӨН definer RPC
-- (crm_apply_txn_correction) — insert/update policy санаатай ҮГҮЙ.
create policy crm_txn_corrections_select on public.crm_txn_corrections for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo', 'sysadmin'))
  );

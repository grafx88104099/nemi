-- ============================================================
-- PMC CRM — Хэлцэл, хавтас/зөвшөөрөл, МУТСТ хязгаарлагдмал бүс, баримт (U5).
-- DESIGN.md §2.9, §2.12 (documents), §3.3 (D7 тусгаарлалт), §7.5 Hold;
-- F-400–421, F-700–709, Д-08/Д-09(урьдач)/Д-12/Д-25/Д-26.
--
-- Дараалал: transactions + дэд хүснэгтүүд → checklist_templates →
-- aml_cases/holds/alerts → documents/links → ALTER (aml_case_id FK) →
-- helpers → триггерүүд → RPC → RLS → grants → storage bucket 'crm-docs'.
--
-- Гол шийдвэрүүд:
--  • Хэлцлийн төлөвийн машин (F-420) БҮХЭЛДЭЭ DB guard — UI/action алгасаж чадахгүй.
--  • Hold-ийн 5 түгжээ (§7.5): (1) төлөв урагшлуулах, (2) гэрээ бүртгэх,
--    (3) орлогын төлбөр/нэхэмжлэх (crm_payments — 000600, U6 triggers),
--    (4) шимтгэл (000700, U7), (5) хүлээлцэх баталгаажуулалт — (1)(2)(5) энд.
--  • МУТСТ бүс: cases/holds — зөвхөн aml_officer бичнэ, ceo нэмж УНШИНА
--    (DESIGN §1.2 тайлбар 5); alerts — бүх staff INSERT (SELECT-гүй, tipping-off).
--  • Хаагдсан хэлцэл immutable (F-417) — залруулга зөвхөн
--    crm_apply_txn_correction RPC-ээр (crm_txn_corrections хүснэгт 000800-д
--    үүсэх тул to_regclass guard-тай бичнэ; аудит үргэлж бичигдэнэ).
--  • crm_check_gate_rec-ийн payment_proof checker-ийг 000600-ийн бодит
--    баганад (finance_verified_at) тааруулж create or replace хийв
--    (U4-ийн followup-д зөвшөөрсөн засвар).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД — Хэлцэл (M6, F-400–421)
-- ════════════════════════════════════════════════════════════

create table public.crm_transactions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  number text not null,                      -- төрлийн угтвартай (crm_next_number('txn_'||type)), immutable
  type crm_txn_type not null,
  status crm_txn_status not null default 'draft',
  opportunity_id uuid not null references public.crm_opportunities(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  amount numeric(14,2) not null,
  currency text not null default 'MNT',
  fx_rate numeric(14,6) not null default 1,
  fx_rate_source text not null default 'auto',   -- 'auto'|'manual' (manual → шалтгаан + audit заавал)
  amount_mnt numeric(14,2) generated always as (amount * fx_rate) stored,  -- F-419, Д-25 босго үүн дээр
  opened_on date not null default current_date,
  contracted_on date,
  closed_on date,
  lease_id uuid,                             -- FK 000600-д ALTER-ээр (circular)
  aml_case_id uuid,                          -- FK доор ALTER-ээр (cases-ийн дараа)
  original_transaction_id uuid references public.crm_transactions(id), -- Replacement (F-413)
  file_completeness_pct numeric(5,2) not null default 0,               -- F-409
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  zero_fee_note text,                        -- F-414 «Хөлс 0₮, урамшуулал 0» автомат тэмдэглэл
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_txn_replacement check (type <> 'replacement' or original_transaction_id is not null),
  constraint crm_txn_fx_positive check (fx_rate > 0),
  constraint crm_txn_fx_source check (fx_rate_source in ('auto', 'manual'))
);
-- Боломж→Хэлцэл 1:1, гэхдээ цуцлагдсаны дараа ижил боломж дээр ШИНЭ хэлцэл болно:
create unique index crm_txn_opp_active_uq on public.crm_transactions (opportunity_id) where status <> 'cancelled';
create index crm_txn_status_idx on public.crm_transactions (office_id, status, type);
create index crm_txn_property_idx on public.crm_transactions (property_id);

create table public.crm_transaction_parties (      -- F-402 талууд
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  role crm_party_role not null,
  unique (transaction_id, contact_id, role)
);
create index crm_txn_parties_txn_idx on public.crm_transaction_parties (transaction_id);
create index crm_txn_parties_contact_idx on public.crm_transaction_parties (contact_id);

create table public.crm_transaction_agent_roles (  -- F-402/451 үүргийн бүртгэл = урамшууллын нотолгооны эх
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  agent_profile_id uuid not null references public.profiles(id),
  role crm_commission_role not null,
  split_pct numeric(5,2),                    -- F-458 хамтарсан үүргийн хуваарилалт (хаалтын ӨМНӨ)
  unique (transaction_id, agent_profile_id, role),
  constraint crm_txn_agent_split check (split_pct is null or (split_pct > 0 and split_pct <= 100))
);
create index crm_txn_agent_roles_txn_idx on public.crm_transaction_agent_roles (transaction_id);
create index crm_txn_agent_roles_agent_idx on public.crm_transaction_agent_roles (agent_profile_id);

create table public.crm_transaction_contracts (    -- F-403 (1 хэлцэл — N гэрээ)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  contract_type text not null,
  number text not null,
  signed_on date,
  valid_from date,
  valid_to date,
  doc_id uuid,                               -- гарын үсэгтэй хавсралт (crm_documents)
  created_at timestamptz not null default now()
);
create index crm_txn_contracts_txn_idx on public.crm_transaction_contracts (transaction_id);

create table public.crm_payment_schedule_lines (   -- F-405/406
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  due_on date not null,
  amount numeric(14,2) not null,
  kind text not null,
  note text,
  paid_amount numeric(14,2) not null default 0,    -- payments тулгалтаас trigger шинэчилнэ (000600)
  created_at timestamptz not null default now()
);
create index crm_schedule_txn_idx on public.crm_payment_schedule_lines (transaction_id, due_on);

create table public.crm_handover_items (           -- F-407 (checklist template-ээс clone)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_on date,
  responsible_id uuid references public.profiles(id),
  sort_order int not null default 0
);
create index crm_handover_txn_idx on public.crm_handover_items (transaction_id, sort_order);

create table public.crm_transaction_approvals (    -- F-410–412 Transaction Approval
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  rationale text not null,
  fee_change text not null,                  -- 'discount'|'waiver'|'special'
  approved_amount numeric(14,2),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  doc_id uuid,
  created_at timestamptz not null default now(),
  constraint crm_txn_approval_fee_change check (fee_change in ('discount', 'waiver', 'special'))
);
create index crm_txn_approvals_txn_idx on public.crm_transaction_approvals (transaction_id);

create table public.crm_checklist_templates (      -- F-407/F-400 төрөл бүрийн шалгах хуудас (тохиргоо)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  scope text not null,                       -- 'handover_sale'|'handover_rental'|'replacement_evidence'|'closing'|'post_sale'|'required_docs_<type>'
  items jsonb not null,                      -- [{label, required, doc_category?}]
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index crm_checklist_tpl_idx on public.crm_checklist_templates (office_id, scope) where is_active;

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД — МУТСТ хязгаарлагдмал бүс (M9, §7.5–7.6)
-- ════════════════════════════════════════════════════════════

create table public.crm_aml_cases (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  transaction_id uuid references public.crm_transactions(id),
  status crm_aml_case_status not null default 'open',
  gate_checks jsonb not null default '{}',       -- §7.3-ын 12(+2) талбарын снапшот гейт бүрд
  str_due_at timestamptz,                        -- Д-26: 24 цагийн тоолуур (СГТ шийдвэрээс)
  threshold_due_on date,                         -- Д-25: ажлын 5 өдөр (crm_add_business_days)
  decision text,
  decision_rationale text,
  officer_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_aml_cases_status_idx on public.crm_aml_cases (office_id, status);
create index crm_aml_cases_contact_idx on public.crm_aml_cases (contact_id);
create index crm_aml_cases_txn_idx on public.crm_aml_cases (transaction_id);

create table public.crm_aml_holds (              -- §7.5 Hold — 5 үйлдлийн түгжээ
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  placed_by uuid not null references public.profiles(id),
  placed_at timestamptz not null default now(),
  rationale text not null,
  released_by uuid references public.profiles(id),
  released_at timestamptz,
  release_rationale text
);
create index crm_aml_holds_txn_idx on public.crm_aml_holds (transaction_id) where released_at is null;

create table public.crm_aml_alerts (             -- §7.6 дотоод дохиоллын маягт (Маягт 1)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid references public.crm_contacts(id),
  transaction_id uuid references public.crm_transactions(id),
  payment_id uuid,                               -- FK-гүй (crm_payments 000600-д)
  alert_kind text not null,                      -- 'manual'|'threshold' (Д-25 автомат)
  detected_at timestamptz not null default now(),
  reported_by uuid not null references public.profiles(id),
  category text,
  observed text,
  amount_mnt numeric(14,2),
  payment_method text,
  parties jsonb,
  urgent boolean not null default false,
  case_id uuid references public.crm_aml_cases(id),
  created_at timestamptz not null default now(),
  constraint crm_aml_alert_kind check (alert_kind in ('manual', 'threshold'))
);
create index crm_aml_alerts_case_idx on public.crm_aml_alerts (case_id);
create index crm_aml_alerts_office_idx on public.crm_aml_alerts (office_id, created_at desc);

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД — Баримт (M10, F-700–709)
-- ════════════════════════════════════════════════════════════

create table public.crm_documents (              -- Storage: private bucket 'crm-docs'
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  category crm_doc_category not null,            -- ангилал = хандалтын эрхийн үндэс (F-701/706)
  title text not null,
  storage_path text not null,                    -- crm-docs/{office_id}/{uuid}
  mime text,
  size_bytes bigint,
  version int not null default 1,
  parent_document_id uuid references public.crm_documents(id), -- F-702 хувилбар гинж
  retention_until date,                          -- F-707: aml → үүсгэхэд +5 жил (тохиргоо)
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_documents_office_idx on public.crm_documents (office_id, category, created_at desc);
create index crm_documents_parent_idx on public.crm_documents (parent_document_id);

create table public.crm_document_links (         -- нэг файл — олон объект (M:N)
  document_id uuid not null references public.crm_documents(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  is_cover boolean not null default false,
  sort_order int not null default 0,
  primary key (document_id, entity, entity_id)
);
create index crm_doc_links_entity_idx on public.crm_document_links (entity, entity_id);

-- ── Хойшлогдсон FK: transactions.aml_case_id → aml_cases ──
alter table public.crm_transactions
  add constraint crm_transactions_aml_case_fkey
  foreign key (aml_case_id) references public.crm_aml_cases(id);

-- ════════════════════════════════════════════════════════════
-- HELPER ФУНКЦУУД
-- ════════════════════════════════════════════════════════════

-- Идэвхтэй AML hold байгаа эсэх (§3.1 — 000500-д, хэрэглэгдэх миграцидаа).
create or replace function public.crm_txn_on_hold(t uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select exists (
    select 1 from public.crm_aml_holds h
    where h.transaction_id = t and h.released_at is null
  ) into ok;
  return ok;
end $$;

-- Хэлцлийг харах эрх: боломжийн эрх дагана (§3.2 — finance ●, aml ○ нь
-- crm_can_view_opportunity дотор аль хэдийн орсон).
create or replace function public.crm_can_view_txn(t uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select public.crm_can_view_opportunity(x.opportunity_id)
    into ok
  from public.crm_transactions x
  where x.id = t and x.office_id = public.crm_office_id();
  return coalesce(ok, false);
end $$;

-- Хэлцлийг засах эрх: боломжийн эзэмшигч/баг/менежер + finance (F-419 fx, F-527).
create or replace function public.crm_can_edit_txn(t uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select (public.crm_can_edit_opportunity(x.opportunity_id) or public.has_crm_role('finance'))
    into ok
  from public.crm_transactions x
  where x.id = t and x.office_id = public.crm_office_id();
  return coalesce(ok, false);
end $$;

-- Баримтыг харах эрх — ангилалд суурилсан (F-701/706, §3.2/§3.3):
--  aml → зөвхөн aml_officer; ownership/identity → эрх бүхий (холбоос дагасан);
--  бусад → холбоотой объектын эрх / uploaded_by / менежер / finance.
create or replace function public.crm_can_view_document(d uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  doc public.crm_documents;
  lnk record;
  restricted boolean;
begin
  select * into doc from public.crm_documents where id = d;
  if doc.id is null or doc.office_id is distinct from public.crm_office_id() then
    return false;
  end if;
  if doc.category = 'aml' then
    return public.has_crm_role('aml_officer');
  end if;
  if doc.uploaded_by = auth.uid()
     or public.crm_is_manager()
     or public.has_crm_role('finance', 'aml_officer') then
    return true;
  end if;
  restricted := doc.category in ('ownership', 'identity');
  for lnk in
    select entity, entity_id from public.crm_document_links where document_id = d
  loop
    case lnk.entity
      when 'transaction' then
        if public.crm_can_view_txn(lnk.entity_id) then return true; end if;
      when 'opportunity' then
        if public.crm_can_view_opportunity(lnk.entity_id) then return true; end if;
      when 'contact' then
        if public.crm_can_view_contact(lnk.entity_id) then return true; end if;
      when 'property' then
        -- Объектын сан — staff бүгд уншина; хязгаарлагдмал ангилалд зөвхөн засах эрхтэй нь.
        if restricted then
          if public.crm_can_edit_property(lnk.entity_id) then return true; end if;
        else
          if public.crm_my_staff_id() is not null then return true; end if;
        end if;
      else
        -- lease/maintenance г.м. хожмын нэгжийн entity — аюулгүй тал руу (false).
        null;
    end case;
  end loop;
  return false;
end $$;

-- Хавтасны бүрэн байдлын УТГА (F-409) — шаардлагатай баримтын ангиллын
-- жагсаалт: crm_checklist_templates scope='required_docs_<type>' (items-ийн
-- required=true, doc_category), байхгүй бол төрлөөр default.
create or replace function public.crm_txn_completeness_value(p_txn uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  txn public.crm_transactions;
  req text[] := '{}';
  have text[] := '{}';
  tpl jsonb;
  item jsonb;
  total int;
  got int := 0;
  c text;
begin
  select * into txn from public.crm_transactions where id = p_txn;
  if txn.id is null then return 0; end if;

  select items into tpl
  from public.crm_checklist_templates
  where office_id = txn.office_id and scope = 'required_docs_' || txn.type::text and is_active
  order by created_at desc limit 1;

  if tpl is not null then
    for item in select * from jsonb_array_elements(tpl) loop
      if coalesce((item ->> 'required')::boolean, true) and nullif(item ->> 'doc_category', '') is not null then
        req := req || (item ->> 'doc_category');
      end if;
    end loop;
  end if;
  if coalesce(array_length(req, 1), 0) = 0 then
    req := case
      when txn.type in ('sale', 'international_sale') then array['contract', 'payment_proof', 'ownership', 'identity']
      else array['contract', 'payment_proof', 'identity']
    end;
  end if;

  select coalesce(array_agg(distinct dd.category::text), '{}'::text[]) into have
  from public.crm_document_links l
  join public.crm_documents dd on dd.id = l.document_id
  where l.entity = 'transaction' and l.entity_id = p_txn;

  total := array_length(req, 1);
  foreach c in array req loop
    if c = any (have) then got := got + 1; end if;
  end loop;
  return round(got::numeric * 100 / total, 2);
end $$;

-- Бүрэн байдлыг дахин тооцож хадгална (баримт нэмэгдэх/хасагдахад trigger, RPC).
create or replace function public.crm_recompute_txn_completeness(p_txn uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric; st crm_txn_status; v_office uuid;
begin
  select status, office_id into st, v_office from public.crm_transactions where id = p_txn;
  if st is null then return null; end if;
  if auth.uid() is not null and v_office is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  v := public.crm_txn_completeness_value(p_txn);
  if st <> 'closed' then      -- хаагдсан хэлцэл immutable (F-417)
    update public.crm_transactions set file_completeness_pct = v where id = p_txn;
  end if;
  return v;
end $$;

-- ── crm_check_gate_rec ЗАСВАР (U4-ийн followup): payment_proof checker-ийг
-- 000600-ийн бодит баганад (finance_verified_at) тааруулав. Бусад нь U4-ийн
-- 000400 дахь хувилбартай ижил. ──
create or replace function public.crm_check_gate_rec(o public.crm_opportunities, p_gate crm_gate_code)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  req record;
  missing text[] := '{}';
  ok boolean;
  v_pct numeric;
  v_min numeric;
  v_kyc crm_kyc_status;
  v_label text;
begin
  for req in
    select checker_kind, params
    from public.crm_gate_requirements
    where office_id = o.office_id
      and gate_code = p_gate
      and is_active
      and (pipeline_id is null or pipeline_id = o.pipeline_id)
  loop
    ok := false;

    case req.checker_kind

      when 'owner_set' then
        ok := o.owner_id is not null;

      when 'next_step_set' then
        ok := exists (
                select 1 from public.crm_activities a
                where a.contact_id = o.contact_id
                  and nullif(a.next_step, '') is not null
                  and a.next_step_date is not null
                  and a.next_step_date >= current_date
              )
           or exists (
                select 1 from public.crm_leads l
                where l.contact_id = o.contact_id
                  and l.status in ('new', 'active')
                  and nullif(l.next_step, '') is not null
                  and l.next_step_date is not null
                  and l.next_step_date >= current_date
              );

      when 'need_profile_complete' then
        v_min := coalesce((req.params ->> 'min_pct')::numeric, 100);
        select max(coalesce(np.completeness_pct, 0)) into v_pct
        from public.crm_need_profiles np
        where (o.need_profile_id is not null and np.id = o.need_profile_id)
           or (o.need_profile_id is null and np.contact_id = o.contact_id and np.status = 'active');
        if v_pct is null and exists (
             select 1 from public.crm_owner_profiles op2
             where op2.contact_id = o.contact_id and op2.status = 'active'
           ) then
          v_pct := 100;
        end if;
        ok := coalesce(v_pct, 0) >= v_min;

      when 'kyc_verified' then
        select kyc_public_status into v_kyc from public.crm_contacts where id = o.contact_id;
        ok := v_kyc = 'verified';

      when 'aml_not_held' then
        ok := not o.aml_hold
          and not exists (
            select 1 from public.crm_aml_holds h
            join public.crm_transactions t on t.id = h.transaction_id
            where t.opportunity_id = o.id and h.released_at is null
          );

      when 'docs_complete' then
        v_min := coalesce((req.params ->> 'min_pct')::numeric, 100);
        -- Хадгалагдсан pct биш — бодит тооцоолол (нэг эх үнэн, stale-аас сэргийлнэ).
        select max(public.crm_txn_completeness_value(t.id)) into v_pct
        from public.crm_transactions t
        where t.opportunity_id = o.id and t.status <> 'cancelled';
        ok := coalesce(v_pct, 0) >= v_min;

      when 'role_evidence' then
        ok := exists (
          select 1 from public.crm_transaction_agent_roles r
          join public.crm_transactions t on t.id = r.transaction_id
          where t.opportunity_id = o.id and t.status <> 'cancelled'
        );

      when 'payment_proof' then
        ok := false;
        if to_regclass('public.crm_payments') is not null then
          begin
            execute 'select exists (
                       select 1 from public.crm_payments p
                       join public.crm_transactions t on t.id = p.transaction_id
                       where t.opportunity_id = $1
                         and p.kind = ''income'' and p.finance_verified_at is not null)'
              into ok using o.id;
            ok := coalesce(ok, false);
          exception when others then
            ok := false;
          end;
        end if;
        -- F-414: боломжийн бүх идэвхтэй хэлцэл replacement (0₮) бол орлогын
        -- нотолгоо шаардахгүй (0 дүнтэй төлбөр бүртгэх боломжгүй).
        if not ok
           and exists (
             select 1 from public.crm_transactions t
             where t.opportunity_id = o.id and t.status <> 'cancelled'
           )
           and not exists (
             select 1 from public.crm_transactions t
             where t.opportunity_id = o.id and t.status <> 'cancelled' and t.type <> 'replacement'
           ) then
          ok := true;
        end if;

      when 'handover_done' then
        select coalesce(bool_and(h.done), false) into ok
        from public.crm_handover_items h
        join public.crm_transactions t on t.id = h.transaction_id
        where t.opportunity_id = o.id and t.status <> 'cancelled';
        ok := coalesce(ok, false);

      when 'listing_agreement' then
        ok := o.property_id is not null and exists (
          select 1 from public.crm_listing_agreements la
          where la.property_id = o.property_id
            and la.signed_on <= current_date
            and la.expires_on >= current_date
        );

      when 'offer_recorded' then
        ok := exists (select 1 from public.crm_offers f where f.opportunity_id = o.id);

      when 'post_sale_tasks' then
        ok := exists (
          select 1 from public.crm_task_links tl
          where tl.entity = 'opportunity' and tl.entity_id = o.id and tl.rule_code = 'D-09'
        )
        or exists (
          select 1 from public.crm_task_links tl
          join public.crm_transactions t
            on tl.entity = 'transaction' and tl.entity_id = t.id
          where t.opportunity_id = o.id and tl.rule_code = 'D-09'
        );

      else
        ok := false; -- үл мэдэх checker — аюулгүй тал руу (дутуу)
    end case;

    if not ok then
      v_label := case req.checker_kind
        when 'need_profile_complete' then 'Хэрэгцээний профайл бүрэн'
        when 'owner_set'             then 'Эзэмшигч оноогдсон'
        when 'next_step_set'         then 'Дараагийн алхам огноотой'
        when 'kyc_verified'          then 'KYC баталгаажсан'
        when 'docs_complete'         then 'Баримтын бүрдэл 100%'
        when 'role_evidence'         then 'Үүргийн нотолгоо бүртгэгдсэн'
        when 'payment_proof'         then 'Төлбөрийн баримт баталгаажсан'
        when 'handover_done'         then 'Хүлээлцэх дууссан'
        when 'listing_agreement'     then 'Идэвхтэй листингийн гэрээ'
        when 'offer_recorded'        then 'Санал бүртгэгдсэн'
        when 'aml_not_held'          then 'МУТСТ түгжээгүй'
        when 'post_sale_tasks'       then 'Хэлцлийн дараах даалгавар үүссэн'
        else req.checker_kind
      end;
      missing := missing || v_label;
    end if;
  end loop;

  select coalesce(array_agg(distinct m), '{}'::text[]) into missing from unnest(missing) as m;
  return missing;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Хэлцэл
-- ════════════════════════════════════════════════════════════

-- INSERT: дугаар авто (F-401), replacement-ийн 0₮ тэмдэглэл (F-414),
-- original ижил оффис, боломжийн property-той нийцэл.
create or replace function public.crm_txn_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare orig public.crm_transactions;
begin
  if nullif(new.number, '') is null then
    new.number := public.crm_next_number(new.office_id, 'txn_' || new.type::text);
  end if;
  if new.type = 'replacement' then
    select * into orig from public.crm_transactions where id = new.original_transaction_id;
    if orig.id is null or orig.office_id <> new.office_id then
      raise exception 'CRM_TXN: Replacement хэлцэлд анхны хэлцлийн холбоос заавал (F-413)';
    end if;
    new.zero_fee_note := coalesce(new.zero_fee_note,
      'Хөлс чөлөөлөгдсөн — 0₮, урамшуулал — 0 (Replacement, F-414). Анхны хэлцэл: ' || orig.number);
  end if;
  new.status := 'draft';
  return new;
end $$;

-- Хаагдсан хэлцэл immutable (F-417) — залруулга зөвхөн тусгай урсгалаар (GUC).
create or replace function public.crm_protect_closed_txn()
returns trigger language plpgsql as $$
begin
  if old.status = 'closed'
     and coalesce(current_setting('crm.txn_correction', true), '') <> '1' then
    raise exception 'CRM_TXN: хаагдсан хэлцэл өөрчлөгдөхгүй — залруулга зөвхөн тусгай урсгалаар (F-417)';
  end if;
  return new;
end $$;

-- Төлөвийн машин (F-420) + Hold түгжээ №1 (§7.5) + бүрдлийн шалгалтууд.
create or replace function public.crm_txn_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  missing text[];
  v numeric;
  need_a crm_party_role;
  need_b crm_party_role;
begin
  if new.status = old.status then
    return new;
  end if;

  -- Зөвшөөрөгдсөн шилжилтүүд (F-420 хүснэгт).
  if not (
    (old.status = 'draft'    and new.status in ('contract', 'cancelled')) or
    (old.status = 'contract' and new.status in ('payment', 'cancelled')) or
    (old.status = 'payment'  and new.status in ('closed', 'cancelled'))
  ) then
    raise exception 'CRM_TXN: % → % шилжилт зөвшөөрөгдөөгүй (F-420)', old.status, new.status;
  end if;

  -- Hold түгжээ №1: хаалтын чиглэлд ахиулахыг хориглоно (§7.5, Д-12).
  if new.status in ('contract', 'payment', 'closed') and public.crm_txn_on_hold(new.id) then
    raise exception 'CRM_TXN: МУТСТ түгжээтэй — хэлцлийг урагшлуулахыг хориглоно (Д-12)';
  end if;

  if new.status = 'contract' then
    -- Талууд: төрлөөр (худалдагч/авагч эсвэл түрээслүүлэгч/түрээслэгч).
    if new.type in ('sale', 'international_sale') then
      need_a := 'seller'; need_b := 'buyer';
    else
      need_a := 'lessor'; need_b := 'lessee';
    end if;
    if not exists (select 1 from public.crm_transaction_parties p where p.transaction_id = new.id and p.role = need_a)
       or not exists (select 1 from public.crm_transaction_parties p where p.transaction_id = new.id and p.role = need_b) then
      raise exception 'CRM_TXN: талуудын бүртгэл дутуу — % ба % хоёул заавал (F-402)', need_a, need_b;
    end if;
    if not exists (select 1 from public.crm_transaction_agent_roles r where r.transaction_id = new.id) then
      raise exception 'CRM_TXN: агентын үүргийн бүртгэл дутуу (F-402/451)';
    end if;
    missing := public.crm_check_gate(new.opportunity_id, 'g4');
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
    new.contracted_on := coalesce(new.contracted_on, current_date);
  end if;

  if new.status = 'payment' then
    if not exists (
      select 1 from public.crm_transaction_contracts c
      where c.transaction_id = new.id and c.doc_id is not null
    ) then
      raise exception 'CRM_TXN: гарын үсэгтэй хавсралт бүхий гэрээний бүртгэл дутуу (F-403)';
    end if;
    if not exists (select 1 from public.crm_payment_schedule_lines s where s.transaction_id = new.id) then
      raise exception 'CRM_TXN: төлбөрийн хуваарь үүсээгүй байна (F-405)';
    end if;
  end if;

  if new.status = 'closed' then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ceo') then
      raise exception 'CRM_TXN: хаалтыг зөвхөн Борлуулалтын захирал баталгаажуулна (F-420)';
    end if;
    v := public.crm_txn_completeness_value(new.id);
    new.file_completeness_pct := v;
    if v < 100 then
      raise exception 'CRM_TXN: хавтасны бүрэн байдал 100%% биш (одоо: %) — хаалт хориглоно (F-408/409)', v;
    end if;
    missing := public.crm_check_gate(new.opportunity_id, 'g5');
    if coalesce(array_length(missing, 1), 0) > 0 then
      raise exception 'CRM_GATE:%', array_to_string(missing, '|');
    end if;
    -- Санхүүгийн орлого баталгаажилт (§7.4) — crm_payments 000600-д (guard-тай).
    -- F-414: replacement (дахин түрээслүүлэлт) хөлс 0₮ тул орлогын төлбөр
    -- шаардахгүй (0 дүнтэй төлбөр crm_payment_amount CHECK amount<>0-д тээглэнэ).
    if new.type <> 'replacement' then
      if to_regclass('public.crm_payments') is not null then
        declare ok boolean := false;
        begin
          execute 'select exists (select 1 from public.crm_payments p
                   where p.transaction_id = $1 and p.kind = ''income'' and p.finance_verified_at is not null)'
            into ok using new.id;
          if not coalesce(ok, false) then
            raise exception 'CRM_TXN: Санхүү орлогын төлбөр баталгаажуулаагүй байна (§7.4)';
          end if;
        end;
      else
        raise exception 'CRM_TXN: төлбөрийн бүртгэлийн модуль суугаагүй — орлого баталгаажуулах боломжгүй';
      end if;
    end if;
    -- Д-09-ийн урьдач: post-sale даалгавар үүссэн байх (action үүсгэнэ).
    if not exists (
      select 1 from public.crm_task_links tl
      where tl.rule_code = 'D-09'
        and ((tl.entity = 'transaction' and tl.entity_id = new.id)
          or (tl.entity = 'opportunity' and tl.entity_id = new.opportunity_id))
    ) then
      raise exception 'CRM_TXN: борлуулалтын дараах даалгавар үүсээгүй байна (Д-09, §7.4)';
    end if;
    new.closed_on := coalesce(new.closed_on, current_date);
  end if;

  if new.status = 'cancelled' then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ceo') then
      raise exception 'CRM_TXN: цуцлалтыг зөвхөн Борлуулалтын захирал шийдвэрлэнэ (F-420)';
    end if;
    if nullif(new.cancellation_reason, '') is null then
      raise exception 'CRM_TXN: цуцлалтад шалтгааны ангилал заавал (F-415)';
    end if;
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;

  return new;
end $$;

-- AFTER: аудит + Д-08 (Гэрээ шатанд хүлээлцэх checklist авто) + F-462 rollback job.
create or replace function public.crm_txn_status_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tpl jsonb;
  item jsonb;
  i int := 0;
  scope_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (new.office_id, auth.uid(), 'crm_transactions', new.id, 'status', 'status',
          to_jsonb(old.status), to_jsonb(new.status), new.cancellation_reason);

  -- Д-08: «Гэрээ» шатанд орсны дараа хүлээлцэх checklist автомат үүснэ.
  if new.status = 'contract'
     and not exists (select 1 from public.crm_handover_items h where h.transaction_id = new.id) then
    scope_name := case
      when new.type in ('sale', 'international_sale') then 'handover_sale'
      else 'handover_rental'
    end;
    select items into tpl
    from public.crm_checklist_templates
    where office_id = new.office_id and scope = scope_name and is_active
    order by created_at desc limit 1;
    if tpl is not null then
      for item in select * from jsonb_array_elements(tpl) loop
        i := i + 1;
        insert into public.crm_handover_items (office_id, transaction_id, label, sort_order)
        values (new.office_id, new.id, coalesce(item ->> 'label', 'Алхам ' || i), i);
      end loop;
    else
      insert into public.crm_handover_items (office_id, transaction_id, label, sort_order) values
        (new.office_id, new.id, 'Түлхүүр хүлээлгэн өгсөн', 1),
        (new.office_id, new.id, 'Тоолуурын заалт бүртгэсэн', 2),
        (new.office_id, new.id, 'Эд хогшлын жагсаалт үйлдсэн', 3),
        (new.office_id, new.id, 'Хүлээлцэх акт гарын үсэгтэй хавсрагдсан', 4);
    end if;
  end if;

  -- F-462/463: цуцлалт → шимтгэлийн буцаалтын job (U7 cron/action уншина).
  if new.status = 'cancelled' then
    insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
    values (new.office_id, 'F-462', 'crm_transactions', new.id, 'pending',
            jsonb_build_object('reason', new.cancellation_reason));
  end if;

  return new;
end $$;

-- Дэд хүснэгтийн бичилт: хаагдсан/цуцлагдсан хэлцэлд өөрчлөлт хориотой
-- (F-417; залруулгын GUC-тай үед нээлттэй).
create or replace function public.crm_txn_children_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare st crm_txn_status; v_txn uuid;
begin
  if tg_op = 'DELETE' then
    v_txn := old.transaction_id;
  else
    v_txn := new.transaction_id;
  end if;
  select status into st from public.crm_transactions where id = v_txn;
  if st in ('closed', 'cancelled')
     and coalesce(current_setting('crm.txn_correction', true), '') <> '1' then
    raise exception 'CRM_TXN: хаагдсан/цуцлагдсан хэлцлийн бүртгэл өөрчлөгдөхгүй (F-417)';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Hold түгжээ №2: гэрээ бүртгэхийг хориглоно (§7.5).
create or replace function public.crm_contract_hold_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.crm_txn_on_hold(new.transaction_id) then
    raise exception 'CRM_TXN: МУТСТ түгжээтэй — шинэ гэрээ бүртгэхийг хориглоно (§7.5)';
  end if;
  return new;
end $$;

-- Hold түгжээ №5: хүлээлцэх баталгаажуулалтыг хориглоно (§7.5).
create or replace function public.crm_handover_hold_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done and public.crm_txn_on_hold(new.transaction_id) then
    raise exception 'CRM_TXN: МУТСТ түгжээтэй — хүлээлцэх баталгаажуулахыг хориглоно (§7.5)';
  end if;
  if new.done and not old.done then
    new.done_on := coalesce(new.done_on, current_date);
    new.responsible_id := coalesce(new.responsible_id, auth.uid());
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — МУТСТ
-- ════════════════════════════════════════════════════════════

-- Кейсийн төлөвийн машин (F-421) + Д-26 (СГТ шийдвэр → 24ц тоолуур).
create or replace function public.crm_aml_case_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'open'          and new.status in ('investigating', 'closed')) or
      (old.status = 'investigating' and new.status in ('str_sent', 'closed')) or
      (old.status = 'str_sent'      and new.status = 'closed')
    ) then
      raise exception 'CRM_AML: кейсийн % → % шилжилт зөвшөөрөгдөөгүй (F-421)', old.status, new.status;
    end if;
    if new.status = 'closed' and (nullif(new.decision, '') is null or nullif(new.decision_rationale, '') is null) then
      raise exception 'CRM_AML: кейс хаахад шийдвэр + үндэслэл заавал (§7.6-5)';
    end if;
  end if;
  -- Д-26: СГТ илгээх шийдвэр гармагц 24 цагийн хуулийн тоолуур.
  if new.decision = 'str' and (old.decision is distinct from 'str') and new.str_due_at is null then
    new.str_due_at := now() + interval '24 hours';
  end if;
  return new;
end $$;

-- Кейсийн өөрчлөлт бүр аудитад (SEC-09 — зөвхөн aml_officer/ceo харна).
create or replace function public.crm_aml_case_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, new_value)
  values (
    coalesce(new.office_id, old.office_id), auth.uid(), 'crm_aml_cases',
    coalesce(new.id, old.id), lower(tg_op),
    case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status, 'decision', old.decision) end,
    jsonb_build_object('status', new.status, 'decision', new.decision)
  );
  return new;
end $$;

-- Hold ↔ денормал синк (crm_opportunities.aml_hold) + аудит (§7.5).
create or replace function public.crm_aml_hold_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_opp uuid; v_office uuid; active boolean;
begin
  select opportunity_id, office_id into v_opp, v_office
  from public.crm_transactions where id = new.transaction_id;

  if tg_op = 'INSERT' then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_aml_holds', new.id, 'hold_placed',
            jsonb_build_object('transaction_id', new.transaction_id), new.rationale);
  elsif new.released_at is not null and old.released_at is null then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_aml_holds', new.id, 'hold_released',
            jsonb_build_object('transaction_id', new.transaction_id), new.release_rationale);
  end if;

  if v_opp is not null then
    select exists (
      select 1 from public.crm_aml_holds h
      join public.crm_transactions t on t.id = h.transaction_id
      where t.opportunity_id = v_opp and t.status <> 'cancelled' and h.released_at is null
    ) into active;
    update public.crm_opportunities set aml_hold = active where id = v_opp;
  end if;
  return new;
end $$;

-- Hold суллалтад үндэслэл заавал; сулласныг дахин засахгүй.
create or replace function public.crm_aml_hold_guard()
returns trigger language plpgsql as $$
begin
  if old.released_at is not null then
    raise exception 'CRM_AML: сулласан hold дахин өөрчлөгдөхгүй';
  end if;
  if new.released_at is not null and nullif(new.release_rationale, '') is null then
    raise exception 'CRM_AML: hold суллахад үндэслэл заавал (§7.5)';
  end if;
  if new.released_at is not null then
    new.released_by := coalesce(new.released_by, auth.uid());
  end if;
  return new;
end $$;

-- Дохио → кейс авто холбох/үүсгэх + Д-25 тоолуур + officer мэдэгдэл.
-- Definer ЗААВАЛ: агентын insert үед cases-д бичих эрх дуудагчид байхгүй (§2.9).
create or replace function public.crm_aml_alert_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
  v_case uuid;
  v_due date;
  v_days int;
  r record;
begin
  v_contact := new.contact_id;
  if v_contact is null and new.transaction_id is not null then
    select contact_id into v_contact
    from public.crm_transaction_parties
    where transaction_id = new.transaction_id
    order by role limit 1;
  end if;

  if new.case_id is null and v_contact is not null then
    select id into v_case
    from public.crm_aml_cases
    where office_id = new.office_id and contact_id = v_contact
      and (transaction_id is not distinct from new.transaction_id)
      and status in ('open', 'investigating')
    order by created_at desc limit 1;

    if v_case is null then
      if new.alert_kind = 'threshold' then
        v_days := coalesce((public.crm_setting_at(new.office_id, 'aml_report_business_days')) #>> '{}', '5')::int;
        v_due := public.crm_add_business_days(new.office_id, current_date, v_days);
      end if;
      insert into public.crm_aml_cases (office_id, contact_id, transaction_id, status, threshold_due_on)
      values (new.office_id, v_contact, new.transaction_id, 'open', v_due)
      returning id into v_case;
      if new.transaction_id is not null then
        update public.crm_transactions
           set aml_case_id = v_case
         where id = new.transaction_id and aml_case_id is null and status <> 'closed';
      end if;
    end if;
    update public.crm_aml_alerts set case_id = v_case where id = new.id;
  end if;

  if new.alert_kind = 'threshold' then
    insert into public.crm_rule_runs (office_id, rule_code, entity, entity_id, status, result)
    values (new.office_id, 'D-25', 'crm_aml_alerts', new.id, 'ok',
            jsonb_build_object('case_id', coalesce(new.case_id, v_case), 'amount_mnt', new.amount_mnt));
  end if;

  -- Хяналт тавих ажилтанд мэдэгдэл (агуулга ерөнхий — tipping-off хамгаалалт).
  for r in
    select s.profile_id from public.crm_staff s
    where s.office_id = new.office_id and s.is_active and 'aml_officer' = any (s.roles)
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (r.profile_id, 'crm_aml_alert', 'МУТСТ дохио ирлээ',
            case when new.alert_kind = 'threshold' then 'Босго хэтэрсэн гүйлгээний автомат дохио.' else 'Дотоод дохиоллын маягт илгээгдлээ.' end,
            '/office/crm/aml');
  end loop;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
  values (new.office_id, auth.uid(), 'crm_aml_alerts', new.id, 'insert',
          jsonb_build_object('alert_kind', new.alert_kind, 'urgent', new.urgent));

  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД — Баримт
-- ════════════════════════════════════════════════════════════

-- F-707: МУТСТ баримтад хадгалалтын хугацаа автомат (+5 жил, тохиргоогоор).
create or replace function public.crm_document_insert_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare yrs int;
begin
  if new.category = 'aml' and new.retention_until is null then
    yrs := coalesce((public.crm_setting_at(new.office_id, 'aml_doc_retention_years')) #>> '{}', '5')::int;
    new.retention_until := (current_date + make_interval(years => yrs))::date;
  end if;
  if new.parent_document_id is not null and new.version = 1 then
    select version + 1 into new.version from public.crm_documents where id = new.parent_document_id;
  end if;
  return new;
end $$;

-- F-707: хадгалалтын хугацаа дуусаагүй баримт устгагдахгүй.
create or replace function public.crm_document_delete_guard()
returns trigger language plpgsql as $$
begin
  if old.retention_until is not null and old.retention_until > current_date then
    raise exception 'CRM_DOC: хадгалалтын хугацаа (%) дуусаагүй — устгах хориотой (F-707)', old.retention_until;
  end if;
  return old;
end $$;

-- Баримтын холбоос өөрчлөгдөхөд хэлцлийн бүрэн байдал дахин тооцогдоно (F-409).
create or replace function public.crm_doc_link_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entity text; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_entity := old.entity; v_id := old.entity_id;
  else
    v_entity := new.entity; v_id := new.entity_id;
  end if;
  if v_entity = 'transaction' then
    perform public.crm_recompute_txn_completeness(v_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ЗАЛГАЛТУУД
-- ════════════════════════════════════════════════════════════

create trigger crm_transactions_insert_defaults
  before insert on public.crm_transactions
  for each row execute function public.crm_txn_insert_defaults();
-- BEFORE UPDATE дараалал (нэрийн цагаан толгойгоор): closed → immutable → status → updated.
create trigger crm_transactions_t1_closed
  before update on public.crm_transactions
  for each row execute function public.crm_protect_closed_txn();
create trigger crm_transactions_t2_immutable
  before update on public.crm_transactions
  for each row execute function public.crm_protect_immutable('number', 'type', 'office_id', 'opportunity_id', 'created_by', 'created_at');
create trigger crm_transactions_t3_status_guard
  before update of status on public.crm_transactions
  for each row execute function public.crm_txn_status_guard();
create trigger crm_transactions_t4_updated
  before update on public.crm_transactions
  for each row execute function public.crm_set_updated_at();
create trigger crm_transactions_t5_status_after
  after update of status on public.crm_transactions
  for each row execute function public.crm_txn_status_after();

create trigger crm_txn_parties_guard
  before insert or update or delete on public.crm_transaction_parties
  for each row execute function public.crm_txn_children_guard();
create trigger crm_txn_agent_roles_guard
  before insert or update or delete on public.crm_transaction_agent_roles
  for each row execute function public.crm_txn_children_guard();
create trigger crm_txn_contracts_guard
  before insert or update on public.crm_transaction_contracts
  for each row execute function public.crm_txn_children_guard();
create trigger crm_txn_contracts_hold
  before insert on public.crm_transaction_contracts
  for each row execute function public.crm_contract_hold_guard();
create trigger crm_schedule_lines_guard
  before insert or update on public.crm_payment_schedule_lines
  for each row execute function public.crm_txn_children_guard();
create trigger crm_handover_items_hold
  before update on public.crm_handover_items
  for each row execute function public.crm_handover_hold_guard();

create trigger crm_checklist_templates_audit
  after insert or update on public.crm_checklist_templates
  for each row execute function public.crm_audit_config_change();

create trigger crm_aml_cases_guard
  before update on public.crm_aml_cases
  for each row execute function public.crm_aml_case_guard();
create trigger crm_aml_cases_updated
  before update on public.crm_aml_cases
  for each row execute function public.crm_set_updated_at();
create trigger crm_aml_cases_audit
  after insert or update on public.crm_aml_cases
  for each row execute function public.crm_aml_case_audit();

create trigger crm_aml_holds_guard
  before update on public.crm_aml_holds
  for each row execute function public.crm_aml_hold_guard();
create trigger crm_aml_holds_sync
  after insert or update on public.crm_aml_holds
  for each row execute function public.crm_aml_hold_sync();

create trigger crm_aml_alerts_after
  after insert on public.crm_aml_alerts
  for each row execute function public.crm_aml_alert_after();

create trigger crm_documents_insert_defaults
  before insert on public.crm_documents
  for each row execute function public.crm_document_insert_defaults();
create trigger crm_documents_immutable
  before update on public.crm_documents
  for each row execute function public.crm_protect_immutable('office_id', 'storage_path', 'category', 'uploaded_by', 'created_at');
create trigger crm_documents_delete_guard
  before delete on public.crm_documents
  for each row execute function public.crm_document_delete_guard();
create trigger crm_doc_links_recompute
  after insert or delete on public.crm_document_links
  for each row execute function public.crm_doc_link_recompute();

-- ════════════════════════════════════════════════════════════
-- RPC-ууд
-- ════════════════════════════════════════════════════════════

-- §3.3-5 (ToR §7.6.5): AML кейсийн дэлгэцийн хандалт БҮР аудитад.
-- aml_officer бүрэн, ceo зөвхөн УНШИНА (§1.2 тайлбар 5).
create or replace function public.crm_get_aml_cases(p_status text default null)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_crm_role('aml_officer', 'ceo') then
    raise exception 'CRM_AML: хандах эрхгүй';
  end if;
  -- Жагсаалтын үзэлт — нэг аудит мөр (entity_id = оффис).
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action)
  values (public.crm_office_id(), auth.uid(), 'crm_aml_cases', public.crm_office_id(), 'view_aml_cases');

  return query
  select jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'contact_id', c.contact_id,
    'contact_name', ct.display_name,
    'kyc_public_status', ct.kyc_public_status,
    'transaction_id', c.transaction_id,
    'transaction_number', t.number,
    'transaction_status', t.status,
    'amount_mnt', t.amount_mnt,
    'str_due_at', c.str_due_at,
    'threshold_due_on', c.threshold_due_on,
    'decision', c.decision,
    'officer_id', c.officer_id,
    'alert_count', (select count(*) from public.crm_aml_alerts a where a.case_id = c.id),
    'on_hold', (c.transaction_id is not null and public.crm_txn_on_hold(c.transaction_id)),
    'created_at', c.created_at,
    'updated_at', c.updated_at
  )
  from public.crm_aml_cases c
  join public.crm_contacts ct on ct.id = c.contact_id
  left join public.crm_transactions t on t.id = c.transaction_id
  where c.office_id = public.crm_office_id()
    and (p_status is null or c.status::text = p_status)
  order by c.created_at desc;
end $$;

create or replace function public.crm_get_aml_case(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.crm_aml_cases; result jsonb;
begin
  if not public.has_crm_role('aml_officer', 'ceo') then
    raise exception 'CRM_AML: хандах эрхгүй';
  end if;
  select * into c from public.crm_aml_cases where id = p_id and office_id = public.crm_office_id();
  if c.id is null then return null; end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action)
  values (c.office_id, auth.uid(), 'crm_aml_cases', c.id, 'view_aml_case');

  select jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'gate_checks', c.gate_checks,
    'str_due_at', c.str_due_at,
    'threshold_due_on', c.threshold_due_on,
    'decision', c.decision,
    'decision_rationale', c.decision_rationale,
    'officer_id', c.officer_id,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'contact', (
      select jsonb_build_object('id', ct.id, 'display_name', ct.display_name,
                                'kyc_public_status', ct.kyc_public_status, 'kind', ct.kind)
      from public.crm_contacts ct where ct.id = c.contact_id
    ),
    'contact_aml', (
      select to_jsonb(ca.*) from public.crm_contact_aml ca where ca.contact_id = c.contact_id
    ),
    'transaction', (
      select jsonb_build_object('id', t.id, 'number', t.number, 'type', t.type,
                                'status', t.status, 'amount_mnt', t.amount_mnt,
                                'on_hold', public.crm_txn_on_hold(t.id))
      from public.crm_transactions t where t.id = c.transaction_id
    ),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'alert_kind', a.alert_kind, 'detected_at', a.detected_at,
        'category', a.category, 'observed', a.observed, 'amount_mnt', a.amount_mnt,
        'payment_method', a.payment_method, 'parties', a.parties, 'urgent', a.urgent,
        'reported_by', a.reported_by, 'created_at', a.created_at
      ) order by a.created_at desc)
      from public.crm_aml_alerts a where a.case_id = c.id
    ), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'transaction_id', h.transaction_id, 'placed_at', h.placed_at,
        'placed_by', h.placed_by, 'rationale', h.rationale,
        'released_at', h.released_at, 'release_rationale', h.release_rationale
      ) order by h.placed_at desc)
      from public.crm_aml_holds h
      where h.transaction_id = c.transaction_id or exists (
        select 1 from public.crm_aml_alerts a where a.case_id = c.id and a.transaction_id = h.transaction_id
      )
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- F-709: хязгаарлагдмал баримтын үзэлт бүр аудитад.
create or replace function public.crm_log_doc_view(p_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare doc public.crm_documents;
begin
  select * into doc from public.crm_documents where id = p_doc;
  if doc.id is null or not public.crm_can_view_document(p_doc) then
    raise exception 'CRM_DOC: баримт олдсонгүй эсвэл хандах эрхгүй';
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
  values (doc.office_id, auth.uid(), 'crm_documents', doc.id, 'view_restricted',
          jsonb_build_object('category', doc.category, 'title', doc.title));
end $$;

-- F-417: хаагдсан хэлцлийн залруулгын тусгай урсгал. crm_txn_corrections
-- хүснэгт 000800-д (U8) — байвал бүртгэнэ, аудит үргэлж бичигдэнэ.
create or replace function public.crm_apply_txn_correction(
  p_txn uuid, p_changes jsonb, p_rationale text
) returns void language plpgsql security definer set search_path = public as $$
declare
  txn public.crm_transactions;
  allowed text[] := array['amount', 'currency', 'fx_rate', 'contracted_on', 'closed_on', 'zero_fee_note'];
  k text;
  sets text := '';
begin
  if auth.uid() is not null and not public.has_crm_role('sales_director', 'ops_qc', 'ceo') then
    raise exception 'CRM_TXN: залруулга хийх эрхгүй (F-417)';
  end if;
  if nullif(p_rationale, '') is null then
    raise exception 'CRM_TXN: залруулгад үндэслэл заавал (F-417)';
  end if;
  select * into txn from public.crm_transactions where id = p_txn;
  if txn.id is null then raise exception 'CRM_TXN: хэлцэл олдсонгүй'; end if;
  if auth.uid() is not null and txn.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if txn.status <> 'closed' then
    raise exception 'CRM_TXN: залруулгын урсгал зөвхөн хаагдсан хэлцэлд — бусад төлөвт шууд засна';
  end if;

  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any (allowed)) then
      raise exception 'CRM_TXN: «%» талбар залруулгаар өөрчлөгдөхгүй', k;
    end if;
    sets := sets || format('%I = %L, ', k, p_changes ->> k);
  end loop;
  if sets = '' then raise exception 'CRM_TXN: өөрчлөлт хоосон байна'; end if;

  perform set_config('crm.txn_correction', '1', true);
  execute 'update public.crm_transactions set ' || left(sets, -2) || ' where id = $1' using p_txn;
  perform set_config('crm.txn_correction', '', true);

  if to_regclass('public.crm_txn_corrections') is not null then
    begin
      execute 'insert into public.crm_txn_corrections (office_id, transaction_id, changes, rationale, approved_by, applied_at)
               values ($1, $2, $3, $4, $5, now())'
        using txn.office_id, p_txn, p_changes, p_rationale, coalesce(auth.uid(), txn.created_by);
    exception when others then null;
    end;
  end if;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, old_value, new_value, reason)
  values (txn.office_id, auth.uid(), 'crm_transactions', p_txn, 'correction',
          (select jsonb_object_agg(kk, to_jsonb(txn) -> kk) from jsonb_object_keys(p_changes) kk),
          p_changes, p_rationale);
end $$;

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════

alter table public.crm_transactions          enable row level security;
alter table public.crm_transaction_parties   enable row level security;
alter table public.crm_transaction_agent_roles enable row level security;
alter table public.crm_transaction_contracts enable row level security;
alter table public.crm_payment_schedule_lines enable row level security;
alter table public.crm_handover_items        enable row level security;
alter table public.crm_transaction_approvals enable row level security;
alter table public.crm_checklist_templates   enable row level security;
alter table public.crm_aml_cases             enable row level security;
alter table public.crm_aml_holds             enable row level security;
alter table public.crm_aml_alerts            enable row level security;
alter table public.crm_documents             enable row level security;
alter table public.crm_document_links        enable row level security;

-- Хэлцэл: боломжийн эрх дагана (finance/aml select нь can_view_opportunity дотор).
create policy crm_transactions_select on public.crm_transactions for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_opportunity(opportunity_id)
  );
create policy crm_transactions_insert on public.crm_transactions for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_opportunity(opportunity_id)
  );
create policy crm_transactions_update on public.crm_transactions for update
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_edit_opportunity(opportunity_id) or (select public.has_crm_role('finance')))
  )
  with check (office_id = (select public.crm_office_id()));

-- Дэд хүснэгтүүд: эцгийн эрх дагана; delete зөвхөн НООРОГ хэлцэлд
-- (талууд/үүргийн андуурал засах цонх — хаалтын өмнөх нотолгоо хөндөгдөхгүй).
create policy crm_txn_parties_select on public.crm_transaction_parties for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_txn_parties_insert on public.crm_transaction_parties for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_txn(transaction_id)
  );
create policy crm_txn_parties_update on public.crm_transaction_parties for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_txn(transaction_id))
  with check (office_id = (select public.crm_office_id()));
create policy crm_txn_parties_delete on public.crm_transaction_parties for delete
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_edit_txn(transaction_id)
    and exists (select 1 from public.crm_transactions t where t.id = transaction_id and t.status = 'draft')
  );

create policy crm_txn_agent_roles_select on public.crm_transaction_agent_roles for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_txn_agent_roles_insert on public.crm_transaction_agent_roles for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_txn(transaction_id)
  );
create policy crm_txn_agent_roles_update on public.crm_transaction_agent_roles for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_txn(transaction_id))
  with check (office_id = (select public.crm_office_id()));
create policy crm_txn_agent_roles_delete on public.crm_transaction_agent_roles for delete
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_edit_txn(transaction_id)
    and exists (select 1 from public.crm_transactions t where t.id = transaction_id and t.status = 'draft')
  );

create policy crm_txn_contracts_select on public.crm_transaction_contracts for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_txn_contracts_insert on public.crm_transaction_contracts for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_txn(transaction_id)
  );
create policy crm_txn_contracts_update on public.crm_transaction_contracts for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_txn(transaction_id))
  with check (office_id = (select public.crm_office_id()));

create policy crm_schedule_lines_select on public.crm_payment_schedule_lines for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_schedule_lines_insert on public.crm_payment_schedule_lines for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_txn(transaction_id)
  );
create policy crm_schedule_lines_update on public.crm_payment_schedule_lines for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_txn(transaction_id))
  with check (office_id = (select public.crm_office_id()));

create policy crm_handover_items_select on public.crm_handover_items for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_handover_items_insert on public.crm_handover_items for insert
  with check (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_txn(transaction_id)
  );
create policy crm_handover_items_update on public.crm_handover_items for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_txn(transaction_id))
  with check (office_id = (select public.crm_office_id()));

-- Зөвшөөрөл (F-410–412): хүсэлт — staff; батлах — SD/CEO.
create policy crm_txn_approvals_select on public.crm_transaction_approvals for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_txn(transaction_id));
create policy crm_txn_approvals_insert on public.crm_transaction_approvals for insert
  with check (
    office_id = (select public.crm_office_id())
    and requested_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_view_txn(transaction_id)
  );
create policy crm_txn_approvals_update on public.crm_transaction_approvals for update
  using (
    office_id = (select public.crm_office_id())
    and (select public.has_crm_role('sales_director', 'ceo'))
  )
  with check (office_id = (select public.crm_office_id()));

-- Шалгах хуудасны загвар — тохиргооны хэв (§3.2 эхний мөр).
create policy crm_checklist_templates_select on public.crm_checklist_templates for select
  using (office_id = (select public.crm_office_id()) and (select public.crm_my_staff_id()) is not null);
create policy crm_checklist_templates_insert on public.crm_checklist_templates for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_checklist_templates_update on public.crm_checklist_templates for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id()));

-- ── МУТСТ хатуу тусгаарлалт (D7, §3.3): aml_officer бичих + ceo унших ──
create policy crm_aml_cases_select on public.crm_aml_cases for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer', 'ceo')));
create policy crm_aml_cases_insert on public.crm_aml_cases for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')));
create policy crm_aml_cases_update on public.crm_aml_cases for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')))
  with check (office_id = (select public.crm_office_id()));

create policy crm_aml_holds_select on public.crm_aml_holds for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer', 'ceo')));
create policy crm_aml_holds_insert on public.crm_aml_holds for insert
  with check (
    office_id = (select public.crm_office_id())
    and placed_by = auth.uid()
    and (select public.has_crm_role('aml_officer'))
  );
create policy crm_aml_holds_update on public.crm_aml_holds for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')))
  with check (office_id = (select public.crm_office_id()));

-- Дохио: бүх staff INSERT — SELECT policy-д ороогүй тул үүсгэсэн мөрөө ч харахгүй
-- (tipping-off, §3.3-3). Officer + ceo уншина, officer шинэчилнэ.
create policy crm_aml_alerts_select on public.crm_aml_alerts for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer', 'ceo')));
create policy crm_aml_alerts_insert on public.crm_aml_alerts for insert
  with check (
    office_id = (select public.crm_office_id())
    and reported_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_aml_alerts_update on public.crm_aml_alerts for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')))
  with check (office_id = (select public.crm_office_id()));

-- Баримт: ангилалд суурилсан хандалт (F-701/706); aml insert зөвхөн officer.
create policy crm_documents_select on public.crm_documents for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_document(id));
create policy crm_documents_insert on public.crm_documents for insert
  with check (
    office_id = (select public.crm_office_id())
    and uploaded_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and (category <> 'aml' or (select public.has_crm_role('aml_officer')))
  );
create policy crm_documents_update on public.crm_documents for update
  using (
    office_id = (select public.crm_office_id())
    and (uploaded_by = auth.uid() or (select public.crm_is_manager()))
    and (category <> 'aml' or (select public.has_crm_role('aml_officer')))
  )
  with check (office_id = (select public.crm_office_id()));
create policy crm_documents_delete on public.crm_documents for delete
  using (
    office_id = (select public.crm_office_id())
    and (uploaded_by = auth.uid() or (select public.crm_is_manager()))
    and (category <> 'aml' or (select public.has_crm_role('aml_officer')))
  );

create policy crm_doc_links_select on public.crm_document_links for select
  using (public.crm_can_view_document(document_id));
create policy crm_doc_links_insert on public.crm_document_links for insert
  with check (
    (select public.crm_my_staff_id()) is not null
    and public.crm_can_view_document(document_id)
  );
create policy crm_doc_links_delete on public.crm_document_links for delete
  using (
    public.crm_can_view_document(document_id)
    and exists (
      select 1 from public.crm_documents dd
      where dd.id = document_id
        and (dd.uploaded_by = auth.uid() or (select public.crm_is_manager()))
    )
  );

-- ════════════════════════════════════════════════════════════
-- GRANT / REVOKE (§2.2 definer дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_txn_on_hold(uuid) from anon, public;
revoke execute on function public.crm_can_view_txn(uuid) from anon, public;
revoke execute on function public.crm_can_edit_txn(uuid) from anon, public;
revoke execute on function public.crm_can_view_document(uuid) from anon, public;
revoke execute on function public.crm_txn_completeness_value(uuid) from anon, public;
revoke execute on function public.crm_recompute_txn_completeness(uuid) from anon, public;
revoke execute on function public.crm_get_aml_cases(text) from anon, public;
revoke execute on function public.crm_get_aml_case(uuid) from anon, public;
revoke execute on function public.crm_log_doc_view(uuid) from anon, public;
revoke execute on function public.crm_apply_txn_correction(uuid, jsonb, text) from anon, public;

grant execute on function public.crm_txn_on_hold(uuid) to authenticated;
grant execute on function public.crm_can_view_txn(uuid) to authenticated;
grant execute on function public.crm_can_edit_txn(uuid) to authenticated;
grant execute on function public.crm_can_view_document(uuid) to authenticated;
grant execute on function public.crm_recompute_txn_completeness(uuid) to authenticated;
grant execute on function public.crm_get_aml_cases(text) to authenticated;
grant execute on function public.crm_get_aml_case(uuid) to authenticated;
grant execute on function public.crm_log_doc_view(uuid) to authenticated;
grant execute on function public.crm_apply_txn_correction(uuid, jsonb, text) to authenticated;

-- Дотоод тооцооллын функц — зөвхөн trigger/definer wrapper дуудна.
revoke execute on function public.crm_txn_completeness_value(uuid) from authenticated;

-- ════════════════════════════════════════════════════════════
-- STORAGE — private bucket 'crm-docs' (F-700–709)
-- ════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('crm-docs', 'crm-docs', false)
on conflict (id) do nothing;

-- Зам: {office_id}/{uuid}.{ext} — эхний хавтас = оффис. Клиентээс шууд уншилт
-- ХААЛТТАЙ (select policy үгүй) — үзэлт зөвхөн server-ийн signed URL-ээр
-- (service role + crm_log_doc_view аудит). Upload — CRM staff, өөрийн оффисын
-- хавтаст (server action admin-ээр хийдэг ч давхар хамгаалалт).
create policy crm_docs_staff_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crm-docs'
    and (storage.foldername(name))[1] = public.crm_office_id()::text
    and public.crm_my_staff_id() is not null
  );

-- ГАЖИЛТ: supabase_realtime publication-д crm_* хүснэгт НЭМЭХГҮЙ (foundation-тай ижил;
-- ялангуяа crm_aml_* — D7 тусгаарлалт).

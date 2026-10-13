-- ============================================================
-- CRM U7 — Шимтгэлийн хөдөлгүүр (M7, F-450–474)
-- 20260901000700_crm_commissions.sql
--
-- Дараалал: 000100 (foundation) → 000200 → 000250 → 000300 → 000400 →
--           000500 (transactions) → 000600 (rentals) → ЭНЭ ФАЙЛ.
--
-- Гол шийдвэрүүд:
--  • 5 хүснэгт — дизайны §2.11 DDL-ийг өөрчлөлгүй (нэмэлт guard/индекстэй).
--  • Төлөвийн урсгал (F-460) БҮХЭЛДЭЭ DB guard: Тооцоолсон → Хянасан
--    (SD/ЧМТ + бүрэн байдал 100% + splits) → Баталгаажсан (CEO) →
--    Олгосон/Хэсэгчлэн (Санхүү); шат алгасах хориотой; hold/цуцлалт тусдаа.
--  • МУТСТ hold-ийн түгжээ №4 (§7.5): insert + урсгал хоёуланд crm_txn_on_hold.
--  • Тооцооны мөр insert — ЗӨВХӨН service role / definer (RLS insert policy
--    үгүй): тооцооллыг lib/actions/crm-commissions.ts-ийн хөдөлгүүр л бичнэ.
--  • Config versions: select finance/SD/ops_qc/ceo/sysadmin; INSERT зөвхөн
--    sysadmin+ops_qc (DESIGN §1.2 тайлбар 3 — finance БИШ); update зөвхөн
--    valid_to хаах (F-453 хувилбаржилт).
--  • F-411: журмын хувиас зөрсөн (evidence->'rate_override') мөр батлагдсан
--    crm_transaction_approvals мөргүй бол insert унана.
--  • F-414: replacement төрлийн хэлцэлд amount=0, rate=0 хатуу шалгалт.
--  • Түүх/аудит: бүх insert + төлөв/олголтын өөрчлөлт AFTER trigger-ээр.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД (§2.11)
-- ════════════════════════════════════════════════════════════

create table public.crm_commission_config_versions ( -- F-452/453: 5 журмын бүтэц versioned
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  policy_code text not null,                 -- 'PMC-SAL-POL-001'|'PMC-SAL-BR-POL-001'|'PMC-INT-SAL-POL-001'|'PMC-RENT-POL-001'|'PMC-PM-POL-001'
  payload jsonb not null,                    -- үүрэг/хувь/босго/оператор(>|>=)/stacking/дээд хязгаар/шатлал
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_comm_cfg_policy check (policy_code in (
    'PMC-SAL-POL-001', 'PMC-SAL-BR-POL-001', 'PMC-INT-SAL-POL-001',
    'PMC-RENT-POL-001', 'PMC-PM-POL-001')),
  constraint crm_comm_cfg_valid check (valid_to is null or valid_to > valid_from)
);
create index crm_comm_cfg_idx on public.crm_commission_config_versions (office_id, policy_code, valid_from desc);

create table public.crm_commission_records (   -- F-450–474
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  source_type text not null,                   -- 'transaction'|'lease_monthly'
  transaction_id uuid references public.crm_transactions(id),
  lease_id uuid references public.crm_leases(id),
  monthly_record_id uuid references public.crm_monthly_records(id),
  recipient_type text not null default 'agent',-- agent|team|company
  recipient_profile_id uuid references public.profiles(id),
  role crm_commission_role not null,
  applied_rate_pct numeric(7,4) not null,
  base_amount numeric(14,2) not null,          -- F-455 татварын дараах, Санхүү баталгаажуулсан цэвэр орлого
  amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,-- F-464 хэсэгчилсэн
  status crm_commission_status not null default 'calculated',
  hold_reason text,
  config_version_id uuid not null references public.crm_commission_config_versions(id),
  evidence jsonb not null default '{}',        -- F-451 нотолгооны снапшот {kind: ref_id/ok}
  created_at timestamptz not null default now(),
  constraint crm_comm_source check (
    (source_type = 'transaction' and transaction_id is not null)
    or (source_type = 'lease_monthly' and lease_id is not null and monthly_record_id is not null)),
  constraint crm_comm_recipient_type check (recipient_type in ('agent', 'team', 'company')),
  constraint crm_comm_recipient check (recipient_type <> 'agent' or recipient_profile_id is not null),
  constraint crm_comm_rate check (applied_rate_pct >= 0),
  constraint crm_comm_amounts check (amount >= 0 and base_amount >= 0),
  constraint crm_comm_paid check (paid_amount >= 0)
);
create index crm_comm_recipient_idx on public.crm_commission_records (office_id, recipient_profile_id, status);
create index crm_comm_txn_idx on public.crm_commission_records (transaction_id);
create index crm_comm_lease_idx on public.crm_commission_records (lease_id);
create index crm_comm_monthly_idx on public.crm_commission_records (monthly_record_id);

create table public.crm_commission_status_history (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  record_id uuid not null references public.crm_commission_records(id) on delete cascade,
  from_status crm_commission_status, to_status crm_commission_status not null,
  decided_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index crm_comm_hist_record_idx on public.crm_commission_status_history (record_id, created_at desc);

create table public.crm_commission_clawbacks (   -- F-462/463 (автоматаар хэрэгжихгүй)
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  record_id uuid not null references public.crm_commission_records(id) on delete restrict,
  amount numeric(14,2) not null,               -- сөрөг гүйлгээ
  reason_category text not null,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_comm_clawback_negative check (amount < 0)
);
create index crm_comm_clawback_record_idx on public.crm_commission_clawbacks (record_id);

create table public.crm_commission_disputes (    -- F-474
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  transaction_id uuid not null references public.crm_transactions(id) on delete restrict,
  content text not null, evidence jsonb, decision text, rationale text,
  decided_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_comm_dispute_txn_idx on public.crm_commission_disputes (transaction_id);

-- ════════════════════════════════════════════════════════════
-- GUARD / TRIGGER функцууд
-- ════════════════════════════════════════════════════════════

-- Insert guard: F-454 (зөвхөн хаагдсан хэлцэл), hold түгжээ №4 (§7.5),
-- F-414 (replacement → 0), F-411 (зөрүүтэй тооцоонд батлагдсан зөвшөөрөл).
create or replace function public.crm_commission_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  if new.source_type = 'transaction' then
    select id, office_id, status, type into t
    from public.crm_transactions where id = new.transaction_id;
    if t.id is null then
      raise exception 'CRM_COMM: хэлцэл олдсонгүй';
    end if;
    if t.office_id <> new.office_id then
      raise exception 'CRM_COMM: оффисын зөрчил — хэлцэл өөр оффисынх';
    end if;
    if public.crm_txn_on_hold(new.transaction_id) then
      raise exception 'CRM_COMM: МУТСТ түгжээтэй хэлцэлд шимтгэл тооцохыг хориглоно (§7.5 түгжээ №4)';
    end if;
    if t.status <> 'closed' then
      raise exception 'CRM_COMM: зөвхөн амжилттай хаагдсан хэлцлээс тооцоо үүснэ (F-454)';
    end if;
    if t.type = 'replacement' and (new.amount <> 0 or new.applied_rate_pct <> 0) then
      raise exception 'CRM_COMM: дахин түрээслүүлэлтэд хөлс 0₮, урамшуулал 0 (F-414)';
    end if;
    -- F-411: журмын стандартаас зөрсөн мөр — батлагдсан approval мөргүй бол хадгалагдахгүй.
    if new.evidence ? 'rate_override'
       and not exists (
         select 1 from public.crm_transaction_approvals a
         where a.transaction_id = new.transaction_id and a.approved_at is not null
       ) then
      raise exception 'CRM_COMM: стандартаас зөрсөн тооцоонд батлагдсан зөвшөөрлийн мөр шаардлагатай (F-411)';
    end if;
  else
    -- lease_monthly: сарын бүртгэл ↔ гэрээ ↔ оффис тохирч байх ёстой.
    if not exists (
      select 1 from public.crm_monthly_records m
      where m.id = new.monthly_record_id
        and m.office_id = new.office_id
        and m.lease_id = new.lease_id
    ) then
      raise exception 'CRM_COMM: сарын менежментийн бүртгэл олдсонгүй эсвэл гэрээтэй тохирохгүй (F-466)';
    end if;
  end if;

  if new.status not in ('calculated', 'hold') then
    raise exception 'CRM_COMM: шинэ тооцоо зөвхөн «Тооцоолсон» эсвэл «Түдгэлзүүлсэн» төлөвтэй үүснэ (F-454/461)';
  end if;
  if new.status = 'hold' and nullif(new.hold_reason, '') is null then
    raise exception 'CRM_COMM: түдгэлзүүлэх шалтгаан заавал (F-461)';
  end if;
  if new.paid_amount <> 0 then
    raise exception 'CRM_COMM: шинэ тооцооны олгосон дүн 0 байна (F-464)';
  end if;
  return new;
end $$;

-- Төлөвийн урсгалын guard (F-460/461/464): шат алгасахыг хориглоно,
-- шат бүрд дүрийн шалгалт (service role = auth.uid() is null → систем).
create or replace function public.crm_commission_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_user boolean := auth.uid() is not null;
  v numeric;
  bad int;
begin
  -- Төлөв өөрчлөгдөөгүй: зөвхөн paid_amount/hold_reason хөдөлж болно.
  if new.status = old.status then
    if new.paid_amount is distinct from old.paid_amount then
      if is_user and not public.has_crm_role('finance') then
        raise exception 'CRM_COMM: олголтын дүнг зөвхөн Санхүү бүртгэнэ (F-460/464)';
      end if;
      if new.paid_amount < old.paid_amount then
        raise exception 'CRM_COMM: олгосон дүнг бууруулахгүй — буцаалт clawback-аар (F-462)';
      end if;
    end if;
    return new;
  end if;

  -- Зөвшөөрөгдсөн шилжилтүүд (F-460 — шат алгасах хориотой).
  if not (
    (old.status = 'calculated'     and new.status in ('reviewed', 'hold', 'cancelled')) or
    (old.status = 'reviewed'       and new.status in ('approved', 'hold', 'cancelled')) or
    (old.status = 'approved'       and new.status in ('paid', 'partially_paid', 'hold', 'cancelled')) or
    (old.status = 'partially_paid' and new.status in ('paid', 'hold', 'cancelled')) or
    (old.status = 'paid'           and new.status = 'cancelled') or -- F-463 rollback (clawback дагалдана)
    (old.status = 'hold'           and new.status in ('calculated', 'reviewed', 'approved', 'partially_paid', 'cancelled'))
  ) then
    raise exception 'CRM_COMM: % → % шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой (F-460)', old.status, new.status;
  end if;

  -- МУТСТ hold түгжээ №4: урсгалыг урагшлуулахыг хориглоно (§7.5, Д-12).
  if new.transaction_id is not null
     and new.status in ('reviewed', 'approved', 'paid', 'partially_paid')
     and public.crm_txn_on_hold(new.transaction_id) then
    raise exception 'CRM_COMM: МУТСТ түгжээтэй хэлцэл — шимтгэлийн урсгал хориглогдоно (§7.5 түгжээ №4)';
  end if;

  if new.status = 'cancelled' then
    if is_user and not public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'finance') then
      raise exception 'CRM_COMM: цуцлалтыг удирдлага/Санхүү хийнэ (F-462/463)';
    end if;
    if nullif(current_setting('crm.comm_note', true), '') is null then
      raise exception 'CRM_COMM: цуцлалтад үндэслэл заавал (F-463/473)';
    end if;
    return new;
  end if;

  if old.status = 'hold' then
    -- Hold-оос сэргээлт — зөвхөн удирдлагын шийдвэрээр (F-461).
    if is_user and not public.has_crm_role('sales_director', 'ops_qc', 'ceo') then
      raise exception 'CRM_COMM: түдгэлзүүлэлтийг зөвхөн удирдлагын шийдвэрээр нээнэ (F-461)';
    end if;
    return new;
  end if;

  if new.status = 'reviewed' then
    if is_user and not public.has_crm_role('sales_director', 'ops_qc') then
      raise exception 'CRM_COMM: «Хянасан» руу зөвхөн Борлуулалтын захирал / ҮА-ЧМТ шилжүүлнэ (F-460)';
    end if;
    if new.source_type = 'transaction' then
      v := public.crm_txn_completeness_value(new.transaction_id);
      if coalesce(v, 0) < 100 then
        raise exception 'CRM_COMM: хавтасны бүрэн байдал 100%% биш (одоо: %) — «Хянасан» хориглоно (F-409/416)', coalesce(v, 0);
      end if;
      -- F-458: нэг үүргийг олон агент гүйцэтгэсэн бол split заавал бүртгэгдсэн байх.
      select count(*) into bad
      from public.crm_transaction_agent_roles r
      where r.transaction_id = new.transaction_id
        and r.split_pct is null
        and exists (
          select 1 from public.crm_transaction_agent_roles r2
          where r2.transaction_id = r.transaction_id and r2.role = r.role and r2.id <> r.id
        );
      if bad > 0 then
        raise exception 'CRM_COMM: хамтарсан үүргийн хуваарилалт бүртгэгдээгүй — «Хянасан» хориглоно (F-458)';
      end if;
      if new.evidence ? 'missing_split' then
        raise exception 'CRM_COMM: тооцооны нотолгоонд хуваарилалт дутуу — дахин тооцоолсны дараа хянана (F-458)';
      end if;
    else
      if exists (
        select 1 from public.crm_monthly_records m
        where m.id = new.monthly_record_id
          and (m.completeness_pct < 100 or m.commission_hold)
      ) then
        raise exception 'CRM_COMM: сарын менежментийн бүртгэл дутуу/түдгэлзүүлсэн — «Хянасан» хориглоно (F-559/461)';
      end if;
    end if;
  end if;

  if new.status = 'approved' and is_user and not public.has_crm_role('ceo') then
    raise exception 'CRM_COMM: баталгаажуулалтыг зөвхөн Ерөнхий захирал (эрх шилжүүлсэн этгээд) хийнэ (F-460)';
  end if;

  if new.status in ('paid', 'partially_paid') then
    if is_user and not public.has_crm_role('finance') then
      raise exception 'CRM_COMM: олголтыг зөвхөн Санхүү бүртгэнэ (F-460)';
    end if;
    if new.status = 'paid' and new.paid_amount + 0.005 < new.amount then
      raise exception 'CRM_COMM: «Олгосон» төлөвт бүрэн дүн шаардлагатай (олгосон %, нийт %) (F-464)', new.paid_amount, new.amount;
    end if;
    if new.status = 'partially_paid' and (new.paid_amount <= 0 or new.paid_amount + 0.005 >= new.amount) then
      raise exception 'CRM_COMM: хэсэгчилсэн олголтын дүн 0-ээс их, нийт дүнгээс бага байх ёстой (F-464)';
    end if;
  end if;

  if new.status = 'hold' then
    if is_user and not public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'finance') then
      raise exception 'CRM_COMM: түдгэлзүүлэлтийг удирдлага/Санхүү хийнэ (F-461)';
    end if;
    if nullif(new.hold_reason, '') is null then
      raise exception 'CRM_COMM: түдгэлзүүлэх шалтгаан заавал (F-461)';
    end if;
  end if;

  return new;
end $$;

-- AFTER insert/update: түүх + аудит (F-460 «шат бүрд огноо+шийдвэрлэгч», F-473).
create or replace function public.crm_commission_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(current_setting('crm.comm_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.crm_commission_status_history (office_id, record_id, from_status, to_status, decided_by, note)
    values (new.office_id, new.id, null, new.status, auth.uid(), coalesce(v_note, new.hold_reason));
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (new.office_id, auth.uid(), 'crm_commission_records', new.id, 'insert',
            jsonb_build_object('role', new.role, 'amount', new.amount, 'rate', new.applied_rate_pct,
                               'status', new.status, 'source_type', new.source_type));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.crm_commission_status_history (office_id, record_id, from_status, to_status, decided_by, note)
    values (new.office_id, new.id, old.status, new.status, auth.uid(),
            coalesce(v_note, case when new.status = 'hold' then new.hold_reason end));
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_commission_records', new.id, 'status', 'status',
            to_jsonb(old.status), to_jsonb(new.status), coalesce(v_note, new.hold_reason));
  end if;

  if new.paid_amount is distinct from old.paid_amount then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_commission_records', new.id, 'payout', 'paid_amount',
            to_jsonb(old.paid_amount), to_jsonb(new.paid_amount), v_note);
  end if;

  return new;
end $$;

-- Config versions: зөвхөн valid_to-г хаах update зөвшөөрнө (F-453 хувилбаржилт).
create or replace function public.crm_commission_config_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.policy_code is distinct from old.policy_code
     or new.payload is distinct from old.payload
     or new.valid_from is distinct from old.valid_from
     or new.office_id is distinct from old.office_id
     or new.created_by is distinct from old.created_by then
    raise exception 'CRM_COMM: тохиргооны хувилбар өөрчлөгдөхгүй — шинэ хувилбар үүсгэнэ (F-453)';
  end if;
  if old.valid_to is not null then
    raise exception 'CRM_COMM: хаагдсан хувилбар дахин өөрчлөгдөхгүй (F-453)';
  end if;
  return new;
end $$;

-- Clawback guard (F-462): сөрөг дүн; үүсгэхдээ батлагдахгүй; баталгаажуулалт
-- зөвхөн эрх бүхий удирдлага (CEO/Борлуулалтын захирал); батлагдсаны дараа immutable.
create or replace function public.crm_commission_clawback_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'CRM_COMM: буцаалт үүсгэхдээ шууд батлагдахгүй — хяналтын дараа тусдаа батална (F-462)';
    end if;
    return new;
  end if;

  if new.amount is distinct from old.amount
     or new.record_id is distinct from old.record_id
     or new.reason_category is distinct from old.reason_category
     or new.office_id is distinct from old.office_id then
    raise exception 'CRM_COMM: буцаалтын мөр өөрчлөгдөхгүй — зөвхөн баталгаажуулалт (F-462)';
  end if;
  if old.approved_at is not null then
    raise exception 'CRM_COMM: буцаалт аль хэдийн батлагдсан (F-462)';
  end if;
  if auth.uid() is not null and not public.has_crm_role('ceo', 'sales_director') then
    raise exception 'CRM_COMM: буцаалтыг эрх бүхий удирдлага батална (F-462)';
  end if;
  new.approved_by := coalesce(new.approved_by, auth.uid());
  new.approved_at := coalesce(new.approved_at, now());
  return new;
end $$;

create or replace function public.crm_commission_clawback_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_commission_clawbacks', new.id, 'insert',
            jsonb_build_object('record_id', new.record_id, 'amount', new.amount), new.reason_category);
  elsif new.approved_at is not null and old.approved_at is null then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
    values (new.office_id, auth.uid(), 'crm_commission_clawbacks', new.id, 'approval_granted',
            jsonb_build_object('record_id', new.record_id, 'amount', new.amount));
  end if;
  return new;
end $$;

-- Маргаан (F-474): шийдвэрийг зөвхөн удирдлага; шийдвэрлэгч автомат.
create or replace function public.crm_commission_dispute_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.content is distinct from old.content
     or new.transaction_id is distinct from old.transaction_id
     or new.created_by is distinct from old.created_by
     or new.office_id is distinct from old.office_id then
    raise exception 'CRM_COMM: маргааны агуулга өөрчлөгдөхгүй — шийдвэр/үндэслэл л бүртгэнэ (F-474)';
  end if;
  if old.decision is not null then
    raise exception 'CRM_COMM: маргаан аль хэдийн шийдвэрлэгдсэн (F-474)';
  end if;
  if new.decision is not null then
    if auth.uid() is not null and not public.has_crm_role('sales_director', 'ops_qc', 'ceo') then
      raise exception 'CRM_COMM: маргааныг удирдлага шийдвэрлэнэ (F-474)';
    end if;
    if nullif(new.rationale, '') is null then
      raise exception 'CRM_COMM: шийдвэрт үндэслэл заавал (F-474/473)';
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_commission_disputes', new.id, 'decision',
            to_jsonb(new.decision), new.rationale);
  end if;
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER-үүд
-- ════════════════════════════════════════════════════════════

create trigger crm_comm_t1_insert_guard
  before insert on public.crm_commission_records
  for each row execute function public.crm_commission_insert_guard();

-- Тооцооллын талбарууд immutable (F-473 — залруулга = шинэ мөр/clawback).
create trigger crm_comm_t2_immutable
  before update on public.crm_commission_records
  for each row execute function public.crm_protect_immutable(
    'source_type', 'transaction_id', 'lease_id', 'monthly_record_id',
    'recipient_type', 'recipient_profile_id', 'role', 'applied_rate_pct',
    'base_amount', 'amount', 'config_version_id', 'evidence', 'created_at');

create trigger crm_comm_t3_status_guard
  before update on public.crm_commission_records
  for each row execute function public.crm_commission_status_guard();

create trigger crm_comm_t4_after
  after insert or update on public.crm_commission_records
  for each row execute function public.crm_commission_after_write();

create trigger crm_comm_cfg_t1_guard
  before update on public.crm_commission_config_versions
  for each row execute function public.crm_commission_config_guard();

create trigger crm_comm_cfg_t2_audit
  after insert or update on public.crm_commission_config_versions
  for each row execute function public.crm_audit_config_change();

create trigger crm_comm_clawback_t1_guard
  before insert or update on public.crm_commission_clawbacks
  for each row execute function public.crm_commission_clawback_guard();

create trigger crm_comm_clawback_t2_after
  after insert or update on public.crm_commission_clawbacks
  for each row execute function public.crm_commission_clawback_after();

create trigger crm_comm_dispute_t1_guard
  before update on public.crm_commission_disputes
  for each row execute function public.crm_commission_dispute_guard();

-- ════════════════════════════════════════════════════════════
-- RPC (security INVOKER — RLS+guard дуудагчийн эрхээр, канбаны «ижил босго» хэв)
-- ════════════════════════════════════════════════════════════

-- Төлөв шилжүүлэлт: note-г GUC-ээр guard/түүхэнд дамжуулна (F-473).
create or replace function public.crm_commission_set_status(
  p_id uuid, p_to crm_commission_status, p_note text default null
) returns void language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('crm.comm_note', coalesce(p_note, ''), true);
  update public.crm_commission_records
     set status = p_to,
         hold_reason = case when p_to = 'hold' then coalesce(nullif(p_note, ''), hold_reason) else hold_reason end
   where id = p_id;
  if not found then
    raise exception 'CRM_COMM: тооцоо олдсонгүй эсвэл танд эрх алга';
  end if;
end $$;

-- Hold суллах: түүхээс өмнөх төлөвийг сэргээнэ (F-461 «удирдлагын шийдвэрээр нээнэ»).
create or replace function public.crm_commission_release_hold(
  p_id uuid, p_note text default null
) returns crm_commission_status language plpgsql security invoker set search_path = public as $$
declare
  prev crm_commission_status;
begin
  select h.from_status into prev
  from public.crm_commission_status_history h
  where h.record_id = p_id and h.to_status = 'hold' and h.from_status is not null
  order by h.created_at desc limit 1;
  if prev is null or prev = 'hold' then
    prev := 'calculated';
  end if;
  perform set_config('crm.comm_note', coalesce(nullif(p_note, ''), 'Түдгэлзүүлэлтийг удирдлагын шийдвэрээр нээв'), true);
  update public.crm_commission_records
     set status = prev
   where id = p_id and status = 'hold';
  if not found then
    raise exception 'CRM_COMM: түдгэлзүүлсэн тооцоо олдсонгүй эсвэл танд эрх алга';
  end if;
  return prev;
end $$;

-- Олголт бүртгэх (F-464): хэсэгчилсэн бол төлөв автомат «Хэсэгчлэн олгосон»,
-- бүрэн бол «Олгосон» — Санхүү (RLS + guard давхар шалгана).
create or replace function public.crm_commission_record_payout(
  p_id uuid, p_amount numeric, p_note text default null
) returns crm_commission_status language plpgsql security invoker set search_path = public as $$
declare
  rec record;
  new_paid numeric;
  new_status crm_commission_status;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'CRM_COMM: олголтын дүн 0-ээс их байна (F-464)';
  end if;
  select id, status, amount, paid_amount into rec
  from public.crm_commission_records where id = p_id;
  if rec.id is null then
    raise exception 'CRM_COMM: тооцоо олдсонгүй эсвэл танд эрх алга';
  end if;
  if rec.status not in ('approved', 'partially_paid') then
    raise exception 'CRM_COMM: олголт зөвхөн баталгаажсан тооцоонд бүртгэгдэнэ (F-460)';
  end if;
  new_paid := rec.paid_amount + p_amount;
  if new_paid > rec.amount + 0.005 then
    raise exception 'CRM_COMM: олголт нийт дүнгээс хэтэрч байна (нийт %, өмнө олгосон %) (F-464)', rec.amount, rec.paid_amount;
  end if;
  new_status := case when new_paid + 0.005 >= rec.amount then 'paid'::crm_commission_status
                     else 'partially_paid'::crm_commission_status end;
  perform set_config('crm.comm_note', coalesce(p_note, ''), true);
  update public.crm_commission_records
     set paid_amount = new_paid, status = new_status
   where id = p_id;
  return new_status;
end $$;

-- ════════════════════════════════════════════════════════════
-- RLS (§3.2)
-- ════════════════════════════════════════════════════════════

alter table public.crm_commission_config_versions enable row level security;
alter table public.crm_commission_records         enable row level security;
alter table public.crm_commission_status_history  enable row level security;
alter table public.crm_commission_clawbacks       enable row level security;
alter table public.crm_commission_disputes        enable row level security;

-- Config versions: select finance/SD/ops/ceo (+sysadmin — тохиргоог удирддаг);
-- INSERT зөвхөн sysadmin+ops_qc (§1.2 тайлбар 3 — finance БИШ); update = зөвхөн хаах (guard).
create policy crm_comm_cfg_select on public.crm_commission_config_versions for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo', 'sysadmin')));
create policy crm_comm_cfg_insert on public.crm_commission_config_versions for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and (select public.has_crm_role('sysadmin', 'ops_qc')));
create policy crm_comm_cfg_update on public.crm_commission_config_versions for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sysadmin', 'ops_qc')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('sysadmin', 'ops_qc')));

-- Тооцооны мөр: агент өөрийн мөрөө БҮРЭН харна (F-471); finance/SD/ops/ceo бүгдийг;
-- PM баг өөрийн pm_team мөрийг. INSERT policy ҮГҮЙ — зөвхөн service/definer.
create policy crm_comm_select on public.crm_commission_records for select
  using (
    office_id = (select public.crm_office_id())
    and (
      recipient_profile_id = (select auth.uid())
      or (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo'))
      or (role = 'pm_team' and (select public.has_crm_role('property_manager')))
    )
  );
create policy crm_comm_update on public.crm_commission_records for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo')));

-- Түүх: тооцооны мөрийг харж чадвал түүхийг нь харна (RLS давхарга дагана);
-- бичилт зөвхөн definer trigger — insert policy үгүй.
create policy crm_comm_hist_select on public.crm_commission_status_history for select
  using (office_id = (select public.crm_office_id())
         and exists (select 1 from public.crm_commission_records r where r.id = record_id));

-- Clawback: харах — тооцооны мөр дагана (агент өөрийн буцаалтыг харна, F-471);
-- үүсгэх — Санхүү/Борлуулалт/ЧМТ; батлах — guard (CEO/SD).
create policy crm_comm_clawback_select on public.crm_commission_clawbacks for select
  using (office_id = (select public.crm_office_id())
         and exists (select 1 from public.crm_commission_records r where r.id = record_id));
create policy crm_comm_clawback_insert on public.crm_commission_clawbacks for insert
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('finance', 'sales_director', 'ops_qc')));
create policy crm_comm_clawback_update on public.crm_commission_clawbacks for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ceo', 'sales_director')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('ceo', 'sales_director')));

-- Маргаан (F-474): гаргагч + удирдлага/Санхүү харна; staff бүр гаргана; шийдвэр удирдлага.
create policy crm_comm_dispute_select on public.crm_commission_disputes for select
  using (
    office_id = (select public.crm_office_id())
    and (created_by = (select auth.uid())
         or (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo')))
  );
create policy crm_comm_dispute_insert on public.crm_commission_disputes for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and (select public.crm_my_staff_id()) is not null);
create policy crm_comm_dispute_update on public.crm_commission_disputes for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('sales_director', 'ops_qc', 'ceo')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('sales_director', 'ops_qc', 'ceo')));

-- ════════════════════════════════════════════════════════════
-- Definer/invoker функцүүдийн grant/revoke (§2.2 ЗААВАЛ дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_commission_set_status(uuid, crm_commission_status, text) from anon, public;
revoke execute on function public.crm_commission_release_hold(uuid, text) from anon, public;
revoke execute on function public.crm_commission_record_payout(uuid, numeric, text) from anon, public;

grant execute on function public.crm_commission_set_status(uuid, crm_commission_status, text) to authenticated;
grant execute on function public.crm_commission_release_hold(uuid, text) to authenticated;
grant execute on function public.crm_commission_record_payout(uuid, numeric, text) to authenticated;

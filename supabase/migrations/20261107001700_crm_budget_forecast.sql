-- ════════════════════════════════════════════════════════════
-- U6 crm-quality-kpi (PMC-CRM-PRO-001 v2.1 §5 RACI, §6.31, §8.5, §9(12))
--   • crm_budgets — сарын орлогын төсөв (оффис эсвэл салбараар).
--   • crm_forecast_snapshots — сарын эхний төсөөллийн агшин зураг,
--     Борлуулалт хариуцсан захирал батална; төсөөллийн нарийвчлалын эх.
--   • crm_mgmt_reviews — хяналтын самбарын удирдлагын дүгнэлт, шийдвэр.
--   • crm_staff.hired_on / left_on — агентын тогтвортой ажиллалт (§8.5(10)).
--   • Урамшууллын маргаан: шийдвэр гаргагчийн ашиг сонирхлын зөрчлийг DB
--     түвшинд хаана, оролцогч агентууд харна, хоёр тал нотолгоо нэмнэ.
--   • Тохиргоо: kpi_targets (§8.1 жишиг), crm_setting_writable өргөтгөл.
-- Хамаарал: 20261107001600.
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
                   where office_id = o.office_id and key = 'kpi_targets' and valid_to is null) then
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, 'kpi_targets',
        '{"next_step_coverage_pct":100,
          "overdue_max_pct":5,
          "showing_feedback_hours":24,
          "showing_feedback_pct":95,
          "offer_followup_pct":100,
          "hot_lead_frequency_pct":100,
          "same_day_logging_pct":95,
          "sufficient_pipeline_mnt":null}'::jsonb,
        v_creator, 'PRO-001 v2.1 §8.1, §8.5 — KPI-ийн жишиг түвшин');
    end if;
    if not exists (select 1 from public.crm_settings
                   where office_id = o.office_id and key = 'campaign_costs' and valid_to is null) then
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, 'campaign_costs', '{}'::jsonb, v_creator,
              'PRO-001 v2.1 §5 — аяны зардал (аяны код: дүн)');
    end if;
  end loop;
end $$;

create or replace function public.crm_setting_writable(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('sysadmin', 'ops_qc')
      or (public.has_crm_role('sales_director') and p_key in (
            'lead_score_weights', 'lead_score_factors', 'lead_grade_thresholds',
            'inactivity_thresholds', 'recycle_thresholds', 'recontact_frequency', 'recontact_ranges',
            'automation_thresholds', 'sla_policy', 'sla_first_contact_min',
            'lead_assignment', 'lead_accept', 'pool_settings', 'lead_dispute',
            'match_weights', 'match_thresholds', 'weekly_targets', 'agent_score_weights',
            'kpi_targets', 'kpi_scope'))
      or (public.has_crm_role('marketing') and p_key in ('marketing_costs', 'campaign_costs'));
$$;

-- Валютын ханш (settings 'fx_rates' = {огноо: {USD: 3450}}): тухайн өдрөөс өмнөх сүүлийн ханш.
create or replace function public.crm_fx_rate(p_office uuid, p_currency text, p_on date default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v jsonb; k text; r text;
begin
  if p_currency is null or upper(p_currency) = 'MNT' then return 1; end if;
  v := (select value from public.crm_settings
        where office_id = p_office and key = 'fx_rates'
          and valid_from <= now() and (valid_to is null or valid_to > now())
        order by valid_from desc limit 1);
  if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
  select max(key) into k from jsonb_object_keys(v) as key
  where key ~ '^\d{4}-\d{2}-\d{2}$' and key <= coalesce(p_on, public.crm_ub_today())::text
    and (v -> key) ? upper(p_currency);
  if k is null then return null; end if;
  r := v -> k ->> upper(p_currency);
  if r is null or r !~ '^[0-9]+(\.[0-9]+)?$' then return null; end if;
  return r::numeric;
end $$;

-- ── 2. Төсөв ──

create table if not exists public.crm_budgets (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  month date not null,
  branch_id uuid references public.crm_branches(id),
  metric text not null default 'revenue',
  amount numeric(16,2) not null,
  note text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_budget_month check (month = date_trunc('month', month)::date),
  constraint crm_budget_metric check (metric in ('revenue', 'closed_deals')),
  constraint crm_budget_amount check (amount >= 0)
);
create unique index if not exists crm_budgets_uniq
  on public.crm_budgets (office_id, month, metric, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.crm_budget_touch()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.office_id is distinct from old.office_id or new.month is distinct from old.month
       or new.branch_id is distinct from old.branch_id or new.metric is distinct from old.metric
       or new.created_by is distinct from old.created_by then
      raise exception 'CRM_BUDGET: төсвийн хүрээ өөрчлөгдөхгүй — шинэ мөр үүсгэнэ үү';
    end if;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists crm_budgets_touch on public.crm_budgets;
create trigger crm_budgets_touch before update on public.crm_budgets
  for each row execute function public.crm_budget_touch();
drop trigger if exists crm_budgets_audit on public.crm_budgets;
create trigger crm_budgets_audit after insert or update on public.crm_budgets
  for each row execute function public.crm_audit_config_change();

alter table public.crm_budgets enable row level security;
drop policy if exists crm_budgets_select on public.crm_budgets;
create policy crm_budgets_select on public.crm_budgets for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ceo', 'finance', 'sales_director', 'ops_qc', 'sysadmin')));
drop policy if exists crm_budgets_insert on public.crm_budgets;
create policy crm_budgets_insert on public.crm_budgets for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and (select public.has_crm_role('ceo', 'finance', 'sales_director')));
drop policy if exists crm_budgets_update on public.crm_budgets;
create policy crm_budgets_update on public.crm_budgets for update
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ceo', 'finance', 'sales_director')))
  with check (office_id = (select public.crm_office_id())
              and (select public.has_crm_role('ceo', 'finance', 'sales_director')));

-- ── 3. Төсөөллийн агшин зураг ──

create table if not exists public.crm_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  month date not null,
  kind text not null default 'month_start',
  taken_at timestamptz not null default now(),
  open_count int not null default 0,
  total_amount_mnt numeric(18,2) not null default 0,
  weighted_amount_mnt numeric(18,2) not null default 0,
  expected_fee_mnt numeric(18,2) not null default 0,
  weighted_fee_mnt numeric(18,2) not null default 0,
  month_weighted_fee_mnt numeric(18,2) not null default 0,
  month_weighted_amount_mnt numeric(18,2) not null default 0,
  unconverted_count int not null default 0,
  by_stage jsonb not null default '[]',
  by_agent jsonb not null default '[]',
  status text not null default 'draft',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  approval_note text,
  created_by uuid references public.profiles(id),
  constraint crm_fc_month check (month = date_trunc('month', month)::date),
  constraint crm_fc_kind check (kind in ('month_start', 'manual')),
  constraint crm_fc_status check (status in ('draft', 'approved'))
);
create unique index if not exists crm_fc_month_start_uniq
  on public.crm_forecast_snapshots (office_id, month) where kind = 'month_start';
create index if not exists crm_fc_office_idx on public.crm_forecast_snapshots (office_id, month desc);

create or replace function public.crm_forecast_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'approved' then
    raise exception 'CRM_FORECAST: батлагдсан төсөөлөл өөрчлөгдөхгүй';
  end if;
  if (to_jsonb(new) - array['status', 'approved_by', 'approved_at', 'approval_note'])
     is distinct from (to_jsonb(old) - array['status', 'approved_by', 'approved_at', 'approval_note']) then
    raise exception 'CRM_FORECAST: төсөөллийн тоо өөрчлөгдөхгүй — шинэ агшин зураг авна уу';
  end if;
  return new;
end $$;

drop trigger if exists crm_fc_guard on public.crm_forecast_snapshots;
create trigger crm_fc_guard before update on public.crm_forecast_snapshots
  for each row execute function public.crm_forecast_guard();

alter table public.crm_forecast_snapshots enable row level security;
drop policy if exists crm_forecast_snapshots_select on public.crm_forecast_snapshots;
create policy crm_forecast_snapshots_select on public.crm_forecast_snapshots for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ceo', 'sales_director', 'finance', 'ops_qc', 'sysadmin')));

-- Агшин зураг: борлуулалтын урсгалын нээлттэй боломж; дүн ₮-өөр (ханшгүй бол тусад тоолно);
-- сарын төсөөлөл = тухайн сард хаагдах хүлээгдэж буй боломжийн хөлс × шатны магадлал.
create or replace function public.crm_take_forecast_snapshot(
  p_office uuid, p_month date, p_kind text default 'manual')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_next date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_id uuid;
  t record;
  v_stage jsonb;
  v_agent jsonb;
begin
  if auth.uid() is not null then
    if p_office is distinct from public.crm_office_id() then
      raise exception 'CRM_FORECAST: оффисын эрхгүй';
    end if;
    if not public.has_crm_role('sales_director', 'ceo', 'sysadmin') then
      raise exception 'CRM_FORECAST: төсөөллийг Борлуулалт хариуцсан захирал бүртгэнэ';
    end if;
  end if;
  if coalesce(p_kind, '') not in ('month_start', 'manual') then
    raise exception 'CRM_FORECAST: төрөл буруу';
  end if;
  if p_kind = 'month_start' then
    select id into v_id from public.crm_forecast_snapshots
    where office_id = p_office and month = v_month and kind = 'month_start';
    if v_id is not null then return v_id; end if;
  end if;

  create temporary table if not exists crm_fc_tmp (
    owner_id uuid, pipeline_code text, stage_code text, stage_name text, sort_order int,
    amount_mnt numeric, weighted_mnt numeric, fee numeric, weighted_fee numeric,
    in_month boolean, unconverted boolean
  ) on commit drop;
  delete from crm_fc_tmp;

  insert into crm_fc_tmp
  select o.owner_id, p.code, s.code, s.name, s.sort_order,
         x.amount_mnt,
         coalesce(x.amount_mnt, 0) * s.probability / 100,
         coalesce(o.expected_fee_mnt, 0),
         coalesce(o.expected_fee_mnt, 0) * s.probability / 100,
         (o.expected_close_on >= v_month and o.expected_close_on < v_next),
         (o.amount is not null and x.amount_mnt is null)
  from public.crm_opportunities o
  join public.crm_stages s on s.id = o.stage_id
  join public.crm_pipelines p on p.id = o.pipeline_id
  cross join lateral (
    select o.amount * public.crm_fx_rate(o.office_id, o.currency, public.crm_ub_today()) as amount_mnt
  ) x
  where o.office_id = p_office and o.state = 'open' and not s.is_terminal
    and public.crm_kpi_pipeline_in(p_office, p.code);

  select count(*)::int as n,
         coalesce(sum(amount_mnt), 0) as total_amount,
         coalesce(sum(weighted_mnt), 0) as weighted_amount,
         coalesce(sum(fee), 0) as fee,
         coalesce(sum(weighted_fee), 0) as weighted_fee,
         coalesce(sum(weighted_fee) filter (where in_month), 0) as month_fee,
         coalesce(sum(weighted_mnt) filter (where in_month), 0) as month_amount,
         count(*) filter (where unconverted)::int as unconverted
  into t from crm_fc_tmp;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pipeline', pipeline_code, 'stage', stage_code, 'name', stage_name, 'count', n,
           'amount_mnt', round(amt), 'weighted_fee_mnt', round(wfee)) order by pipeline_code, sort_order), '[]'::jsonb)
  into v_stage
  from (select pipeline_code, stage_code, stage_name, min(sort_order) as sort_order, count(*) as n,
               coalesce(sum(amount_mnt), 0) as amt, coalesce(sum(weighted_fee), 0) as wfee
        from crm_fc_tmp group by pipeline_code, stage_code, stage_name) z;

  select coalesce(jsonb_agg(jsonb_build_object(
           'agent_id', owner_id, 'count', n, 'weighted_fee_mnt', round(wfee),
           'month_weighted_fee_mnt', round(mfee))), '[]'::jsonb)
  into v_agent
  from (select owner_id, count(*) as n, coalesce(sum(weighted_fee), 0) as wfee,
               coalesce(sum(weighted_fee) filter (where in_month), 0) as mfee
        from crm_fc_tmp group by owner_id) z;

  insert into public.crm_forecast_snapshots (
    office_id, month, kind, open_count, total_amount_mnt, weighted_amount_mnt, expected_fee_mnt,
    weighted_fee_mnt, month_weighted_fee_mnt, month_weighted_amount_mnt, unconverted_count,
    by_stage, by_agent, created_by)
  values (p_office, v_month, p_kind, t.n, round(t.total_amount, 2), round(t.weighted_amount, 2), round(t.fee, 2),
          round(t.weighted_fee, 2), round(t.month_fee, 2), round(t.month_amount, 2), t.unconverted,
          v_stage, v_agent, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- §5 RACI: хэлцлийн урсгал, төсөөллийн эцсийн хариуцагч — Борлуулалт хариуцсан захирал.
create or replace function public.crm_approve_forecast_snapshot(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select * into f from public.crm_forecast_snapshots where id = p_id;
  if f.id is null or f.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM_FORECAST: төсөөлөл олдсонгүй';
  end if;
  if not public.has_crm_role('sales_director') then
    raise exception 'CRM_FORECAST: төсөөллийг Борлуулалт хариуцсан захирал батална';
  end if;
  if f.status = 'approved' then
    raise exception 'CRM_FORECAST: аль хэдийн батлагдсан';
  end if;
  update public.crm_forecast_snapshots
  set status = 'approved', approved_by = auth.uid(), approved_at = now(), approval_note = nullif(btrim(p_note), '')
  where id = p_id;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, reason)
  values (f.office_id, auth.uid(), 'crm_forecast_snapshots', p_id, 'approve', nullif(btrim(p_note), ''));
end $$;

-- ── 4. Удирдлагын дүн шинжилгээ (§5, §9(12)) ──

create table if not exists public.crm_mgmt_reviews (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  period_kind text not null,
  period_start date not null,
  kpi_snapshot jsonb not null default '{}',
  findings text not null,
  decisions text,
  reviewed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_mr_kind check (period_kind in ('week', 'month', 'quarter')),
  constraint crm_mr_findings check (length(btrim(findings)) >= 10)
);
create index if not exists crm_mr_office_idx on public.crm_mgmt_reviews (office_id, period_start desc);

alter table public.crm_mgmt_reviews enable row level security;
drop policy if exists crm_mgmt_reviews_select on public.crm_mgmt_reviews;
create policy crm_mgmt_reviews_select on public.crm_mgmt_reviews for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ceo', 'sales_director', 'finance', 'ops_qc', 'sysadmin')));
drop policy if exists crm_mgmt_reviews_insert on public.crm_mgmt_reviews;
create policy crm_mgmt_reviews_insert on public.crm_mgmt_reviews for insert
  with check (office_id = (select public.crm_office_id())
              and reviewed_by = (select auth.uid())
              and (select public.has_crm_role('sales_director', 'ceo')));

-- ── 5. Агентын ажилд орсон / гарсан огноо ──

alter table public.crm_staff add column if not exists hired_on date;
alter table public.crm_staff add column if not exists left_on date;

update public.crm_staff set hired_on = (created_at at time zone 'Asia/Ulaanbaatar')::date where hired_on is null;
update public.crm_staff set left_on = public.crm_ub_today() where not is_active and left_on is null;

create or replace function public.crm_staff_employment_dates()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.hired_on := coalesce(new.hired_on, public.crm_ub_today());
  elsif old.is_active and not new.is_active then
    new.left_on := coalesce(new.left_on, public.crm_ub_today());
  elsif not old.is_active and new.is_active then
    new.left_on := null;
  end if;
  return new;
end $$;

drop trigger if exists crm_staff_employment_dates on public.crm_staff;
create trigger crm_staff_employment_dates before insert or update on public.crm_staff
  for each row execute function public.crm_staff_employment_dates();

-- ── 6. Урамшууллын маргаан: ашиг сонирхлын зөрчил, оролцогчийн хандалт, нотолгоо (§6.31, §7) ──

create or replace function public.crm_commission_dispute_conflict(p_dispute uuid, p_profile uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.crm_commission_disputes where id = p_dispute;
  if d.id is null or p_profile is null then return null; end if;
  if d.created_by = p_profile then
    return 'маргааныг өөрөө гаргасан';
  end if;
  if exists (select 1 from public.crm_transaction_agent_roles r
             where r.transaction_id = d.transaction_id and r.agent_profile_id = p_profile) then
    return 'хэлцлийн урамшууллын үүрэгт оролцогч';
  end if;
  if exists (select 1 from public.crm_transactions t join public.crm_opportunities o on o.id = t.opportunity_id
             where t.id = d.transaction_id and o.owner_id = p_profile) then
    return 'хэлцлийн эзэмшигч агент';
  end if;
  if exists (select 1 from public.crm_transaction_approvals a
             where a.transaction_id = d.transaction_id and a.approved_by = p_profile) then
    return 'хэлцлийн хөлсний өөрчлөлтийг баталсан';
  end if;
  if exists (select 1 from public.crm_commission_status_history h
             join public.crm_commission_records c on c.id = h.record_id
             where c.transaction_id = d.transaction_id and h.decided_by = p_profile
               and h.to_status in ('reviewed', 'approved')) then
    return 'энэ хэлцлийн урамшууллын тооцоог хянаж эсвэл баталсан';
  end if;
  if exists (select 1 from public.crm_coi_declarations c
             where c.profile_id = p_profile and c.revoked_at is null and c.office_id = d.office_id
               and (c.related_profile_id = d.created_by
                    or c.related_profile_id in (select r.agent_profile_id from public.crm_transaction_agent_roles r
                                                where r.transaction_id = d.transaction_id)
                    or c.contact_id in (select tp.contact_id from public.crm_transaction_parties tp
                                        where tp.transaction_id = d.transaction_id))) then
    return 'ашиг сонирхлын зөрчил мэдүүлсэн';
  end if;
  return null;
end $$;

-- Хэрэглэгч тухайн хэлцлийн урамшууллын үүрэгт оролцогч эсвэл тэдний багийн ахлагч эсэх.
create or replace function public.crm_commission_txn_party(p_txn uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_transaction_agent_roles r
    where r.transaction_id = p_txn
      and (r.agent_profile_id = auth.uid() or public.crm_is_team_of(r.agent_profile_id))
  );
$$;

create or replace function public.crm_commission_dispute_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conflict text;
begin
  if new.content is distinct from old.content
     or new.transaction_id is distinct from old.transaction_id
     or new.created_by is distinct from old.created_by
     or new.office_id is distinct from old.office_id then
    raise exception 'CRM_COMM: маргааны агуулга өөрчлөгдөхгүй — шийдвэр, үндэслэл л бүртгэнэ';
  end if;
  if old.decision is not null then
    raise exception 'CRM_COMM: маргаан аль хэдийн шийдвэрлэгдсэн';
  end if;
  if new.decision is not null then
    if auth.uid() is not null then
      if not public.has_crm_role('sales_director', 'ops_qc', 'ceo') then
        raise exception 'CRM_COMM: маргааныг удирдлага шийдвэрлэнэ';
      end if;
      v_conflict := public.crm_commission_dispute_conflict(new.id, auth.uid());
      if v_conflict is not null then
        raise exception 'CRM_COMM: та энэ маргааныг шийдэх боломжгүй (%) — өөр удирдлага шийдвэрлэнэ', v_conflict;
      end if;
    end if;
    if nullif(btrim(new.rationale), '') is null then
      raise exception 'CRM_COMM: шийдвэрт үндэслэл заавал';
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_commission_disputes', new.id, 'decision',
            to_jsonb(new.decision), new.rationale);
  end if;
  return new;
end $$;

drop policy if exists crm_comm_dispute_select on public.crm_commission_disputes;
create policy crm_comm_dispute_select on public.crm_commission_disputes for select
  using (
    office_id = (select public.crm_office_id())
    and (created_by = (select auth.uid())
         or (select public.has_crm_role('finance', 'sales_director', 'ops_qc', 'ceo'))
         or public.crm_commission_txn_party(transaction_id))
  );

create table if not exists public.crm_commission_dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  dispute_id uuid not null references public.crm_commission_disputes(id) on delete cascade,
  content text not null,
  doc_id uuid references public.crm_documents(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_cde_content check (length(btrim(content)) >= 5)
);
create index if not exists crm_cde_dispute_idx on public.crm_commission_dispute_evidence (dispute_id, created_at);

create or replace function public.crm_commission_dispute_can_add(p_dispute uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_commission_disputes d
    where d.id = p_dispute and d.decision is null
      and d.office_id = public.crm_office_id()
      and (d.created_by = auth.uid()
           or exists (select 1 from public.crm_transaction_agent_roles r
                      where r.transaction_id = d.transaction_id and r.agent_profile_id = auth.uid())
           or public.has_crm_role('sales_director', 'ops_qc', 'ceo', 'finance'))
  );
$$;

alter table public.crm_commission_dispute_evidence enable row level security;
drop policy if exists crm_comm_dispute_evidence_select on public.crm_commission_dispute_evidence;
create policy crm_comm_dispute_evidence_select on public.crm_commission_dispute_evidence for select
  using (office_id = (select public.crm_office_id())
         and exists (select 1 from public.crm_commission_disputes d where d.id = dispute_id));
drop policy if exists crm_comm_dispute_evidence_insert on public.crm_commission_dispute_evidence;
create policy crm_comm_dispute_evidence_insert on public.crm_commission_dispute_evidence for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and public.crm_commission_dispute_can_add(dispute_id));

-- ── Grant ──

revoke execute on function public.crm_fx_rate(uuid, text, date) from anon, public;
revoke execute on function public.crm_take_forecast_snapshot(uuid, date, text) from anon, public;
revoke execute on function public.crm_approve_forecast_snapshot(uuid, text) from anon, public;
revoke execute on function public.crm_commission_dispute_conflict(uuid, uuid) from anon, public;
revoke execute on function public.crm_commission_txn_party(uuid) from anon, public;
revoke execute on function public.crm_commission_dispute_can_add(uuid) from anon, public;
grant execute on function public.crm_fx_rate(uuid, text, date) to authenticated;
grant execute on function public.crm_take_forecast_snapshot(uuid, date, text) to authenticated;
grant execute on function public.crm_approve_forecast_snapshot(uuid, text) to authenticated;
grant execute on function public.crm_commission_dispute_conflict(uuid, uuid) to authenticated;
grant execute on function public.crm_commission_txn_party(uuid) to authenticated;
grant execute on function public.crm_commission_dispute_can_add(uuid) to authenticated;

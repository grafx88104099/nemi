-- ============================================================
-- PMC CRM — Тайлан/KPI view-үүд (U9 crm-reports-uat, DESIGN §8.1).
--
-- Бүх view `with (security_invoker = on)` — underlying хүснэгтүүдийн RLS
-- ДУУДАГЧИЙН эрхээр ажиллана: агент өөрийн мөрөө, багийн ахлагч багаа,
-- удирдлага оффисын түвшинг харна (R-19). Тоон утга бүр CRM бүртгэлээс
-- автомат тооцогдоно — гараар оруулсан дүн харагдах зам байхгүй (зарчим 9).
--
-- Анхаар: crm_v_golden_rule_violations, crm_v_lead_hygiene view-үүд
-- 20260901000800_crm_automation.sql-д АЛЬ ХЭДИЙН үүссэн (U8) — энд
-- давхардуулж үүсгэхгүй; §8.1-ийн үлдсэн 8 view энд.
--
-- Хамаарал: 000100…000800 бүгд хэрэглэгдсэн байх ёстой.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- R-01: Агентын өдрийн товчоо — агент (owner) бүрээр нэгтгэсэн тоолуур.
-- Дэлгэрэнгүй жагсаалтууд (даалгаврын мөр, сэжимийн мөр) query давхаргад;
-- энэ view багийн ахлагч/удирдлагын нэгтгэлд + R-01 толгойн тоонд.
-- ────────────────────────────────────────────────────────────
create view public.crm_v_agent_today
with (security_invoker = on) as
with lead_agg as (
  select
    l.office_id,
    l.owner_id,
    count(*) filter (where l.status = 'new')                                          as new_leads,
    count(*) filter (where l.status = 'active' and l.next_step_date = current_date)   as steps_today,
    count(*) filter (where l.status = 'active' and l.next_step_date < current_date)   as steps_overdue,
    count(*) filter (where l.status = 'active' and l.grade = 'a')                     as hot_leads,
    count(*) filter (where l.status = 'active')                                       as active_leads
  from public.crm_leads l
  where l.owner_id is not null and l.status in ('new', 'active')
  group by l.office_id, l.owner_id
),
task_agg as (
  select
    t.office_id,
    t.responsible_id as owner_id,
    count(*) filter (where t.deadline >= date_trunc('day', now())
                       and t.deadline <  date_trunc('day', now()) + interval '1 day') as tasks_today,
    count(*) filter (where t.deadline < now())                                        as tasks_overdue
  from public.tasks t
  where t.status in ('pending', 'in_progress')
  group by t.office_id, t.responsible_id
),
act_agg as (
  select
    a.office_id,
    a.owner_id,
    count(*) filter (where a.channel = 'showing'
                       and a.occurred_at >= date_trunc('day', now())
                       and a.occurred_at <  date_trunc('day', now()) + interval '1 day') as showings_today,
    count(*) filter (where a.channel = 'showing'
                       and a.feedback_category is null
                       and a.occurred_at >= now() - interval '72 hours'
                       and a.occurred_at <= now())                                       as pending_feedback
  from public.crm_activities a
  group by a.office_id, a.owner_id
),
opp_agg as (
  select
    o.office_id,
    o.owner_id,
    count(*)                                                                           as open_opps,
    coalesce(sum(round(coalesce(o.amount, 0) * s.probability / 100)), 0)::numeric(14,2) as weighted_amount,
    count(*) filter (where s.code in ('offer'))                                        as offer_opps,
    count(*) filter (where s.is_closing_direction)                                     as closing_opps
  from public.crm_opportunities o
  join public.crm_stages s on s.id = o.stage_id
  where o.state = 'open'
  group by o.office_id, o.owner_id
),
keys as (
  select office_id, owner_id from lead_agg
  union select office_id, owner_id from task_agg
  union select office_id, owner_id from act_agg
  union select office_id, owner_id from opp_agg
)
select
  k.office_id,
  k.owner_id,
  coalesce(la.new_leads, 0)        as new_leads,
  coalesce(la.steps_today, 0)      as steps_today,
  coalesce(la.steps_overdue, 0)    as steps_overdue,
  coalesce(la.hot_leads, 0)        as hot_leads,
  coalesce(la.active_leads, 0)     as active_leads,
  coalesce(ta.tasks_today, 0)      as tasks_today,
  coalesce(ta.tasks_overdue, 0)    as tasks_overdue,
  coalesce(aa.showings_today, 0)   as showings_today,
  coalesce(aa.pending_feedback, 0) as pending_feedback,
  coalesce(oa.open_opps, 0)        as open_opps,
  coalesce(oa.weighted_amount, 0)  as weighted_amount,
  coalesce(oa.offer_opps, 0)       as offer_opps,
  coalesce(oa.closing_opps, 0)     as closing_opps
from keys k
left join lead_agg la on la.office_id = k.office_id and la.owner_id = k.owner_id
left join task_agg ta on ta.office_id = k.office_id and ta.owner_id = k.owner_id
left join act_agg  aa on aa.office_id = k.office_id and aa.owner_id = k.owner_id
left join opp_agg  oa on oa.office_id = k.office_id and oa.owner_id = k.owner_id;

-- ────────────────────────────────────────────────────────────
-- Сэжимийн юүлүүр + эх сурвалжийн хамаарал + SLA (R-06/R-11).
-- Мөр = (оффис, сар, эх сурвалж). won_amount = тухайн эх сурвалжийн
-- сэжимээс үүссэн, амжилттай хаагдсан боломжийн дүн (R-11 орлого).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_lead_funnel
with (security_invoker = on) as
with l2 as (
  select
    l.*,
    exists (select 1 from public.crm_opportunities o where o.lead_id = l.id)                    as has_opp,
    exists (select 1 from public.crm_opportunities o where o.lead_id = l.id and o.state = 'won') as has_won,
    (select coalesce(sum(o.amount), 0) from public.crm_opportunities o
      where o.lead_id = l.id and o.state = 'won')                                               as won_amount
  from public.crm_leads l
)
select
  l.office_id,
  date_trunc('month', l.created_at)::date                            as month,
  coalesce(src.code, 'unknown')                                      as source_code,
  coalesce(src.label, 'Тодорхойгүй')                                 as source_label,
  count(*)                                                           as leads_total,
  count(*) filter (where l.status = 'new')                           as leads_new,
  count(*) filter (where l.status = 'active')                        as leads_active,
  count(*) filter (where l.status = 'recycled')                      as leads_recycled,
  count(*) filter (where l.has_opp)                                  as leads_qualified,
  count(*) filter (where l.has_won)                                  as leads_won,
  coalesce(sum(l.won_amount), 0)::numeric(14,2)                      as won_amount,
  count(*) filter (where l.first_contact_due_at is not null
                     and l.last_contact_at is not null
                     and l.last_contact_at <= l.first_contact_due_at) as sla_met,
  count(*) filter (where l.first_contact_due_at is not null
                     and (l.last_contact_at is not null or l.first_contact_due_at < now())) as sla_total
from l2 l
left join public.crm_lookups src on src.id = l.source_id
group by l.office_id, date_trunc('month', l.created_at), src.code, src.label;

-- ────────────────────────────────────────────────────────────
-- Жинлэсэн урсгал + 30/60/90 хоногийн төсөөлөл (R-06, нэгдсэн
-- тодорхойлолт §6): Σ(amount × stage.probability). Мөр = (оффис,
-- урсгал, эзэмшигч, салбар) — агент/баг/салбар/компанийн түвшинд нэгтгэнэ.
-- ────────────────────────────────────────────────────────────
create view public.crm_v_pipeline_forecast
with (security_invoker = on) as
select
  o.office_id,
  p.id                                             as pipeline_id,
  p.code                                           as pipeline_code,
  p.name                                           as pipeline_name,
  o.owner_id,
  o.branch_id,
  count(*)                                         as open_count,
  coalesce(sum(coalesce(o.amount, 0)), 0)::numeric(14,2) as total_amount,
  coalesce(sum(coalesce(o.amount, 0) * s.probability / 100), 0)::numeric(14,2) as weighted_amount,
  coalesce(sum(coalesce(o.amount, 0) * s.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= current_date + 30), 0)::numeric(14,2) as weighted_30,
  coalesce(sum(coalesce(o.amount, 0) * s.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= current_date + 60), 0)::numeric(14,2) as weighted_60,
  coalesce(sum(coalesce(o.amount, 0) * s.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= current_date + 90), 0)::numeric(14,2) as weighted_90,
  count(*) filter (where o.aml_hold)               as aml_held_count
from public.crm_opportunities o
join public.crm_stages    s on s.id = o.stage_id
join public.crm_pipelines p on p.id = o.pipeline_id
where o.state = 'open'
group by o.office_id, p.id, p.code, p.name, o.owner_id, o.branch_id;

-- ────────────────────────────────────────────────────────────
-- R-09: Түрээсийн авлагын насжилт — мөр = төлөгдөөгүй нэхэмжлэх.
-- Бүлэг 1–3/4–7/8+ (PMC-PM-POL-001 6.4-тэй ижил); grace_days багана
-- дагалдана (шатлалын босго тохиргоотой уялдана — F-535/603).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_arrears_aging
with (security_invoker = on) as
with pay as (
  select p.invoice_id, coalesce(sum(p.amount_mnt), 0) as paid
  from public.crm_payments p
  where p.invoice_id is not null and p.kind = 'income'
  group by p.invoice_id
),
esc as (
  select e.invoice_id, max(e.step) as last_step, max(e.escalated_at) as last_escalated_at
  from public.crm_arrears_escalations e
  group by e.invoice_id
)
select
  i.office_id,
  i.id                                   as invoice_id,
  i.number,
  i.type,
  i.lease_id,
  ls.number                              as lease_number,
  ls.property_id,
  ls.tenant_contact_id,
  ls.grace_days,
  i.recipient_contact_id,
  i.due_on,
  i.amount,
  coalesce(p.paid, 0)::numeric(14,2)     as paid_amount,
  (i.amount - coalesce(p.paid, 0))::numeric(14,2) as balance,
  greatest(0, current_date - i.due_on)   as overdue_days,
  case
    when current_date <= i.due_on then 'upcoming'
    when current_date - i.due_on <= 3 then 'd1_3'
    when current_date - i.due_on <= 7 then 'd4_7'
    else 'd8_plus'
  end                                    as bucket,
  e.last_step,
  e.last_escalated_at,
  i.status
from public.crm_invoices i
left join public.crm_leases ls on ls.id = i.lease_id
left join pay p on p.invoice_id = i.id
left join esc e on e.invoice_id = i.id
where i.status in ('sent', 'partially_paid');

-- ────────────────────────────────────────────────────────────
-- R-08: Дүүргэлт, сул зогсолт — мөр = (оффис, салбар). Менежменттэй
-- объектын дүүргэлт %, сул хоног, түрээслүүлэх дундаж хоног (F-565–567).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_occupancy
with (security_invoker = on) as
with vac as (
  select
    v.property_id,
    sum(case when v.ended_on is null then current_date - v.started_on
             else v.ended_on - v.started_on end)                 as vacant_days,
    avg(v.ended_on - v.started_on) filter (where v.ended_on is not null) as avg_days_to_rent
  from public.crm_vacancy_periods v
  group by v.property_id
)
select
  p.office_id,
  p.branch_id,
  count(*)                                                        as managed_count,
  count(*) filter (where p.occupancy = 'occupied')                as occupied_count,
  count(*) filter (where p.occupancy = 'vacant')                  as vacant_count,
  count(*) filter (where p.occupancy = 'make_ready')              as make_ready_count,
  count(*) filter (where p.occupancy = 'notice_given')            as notice_given_count,
  round(100.0 * count(*) filter (where p.occupancy = 'occupied')
        / nullif(count(*), 0), 1)                                 as occupancy_pct,
  coalesce(sum(v.vacant_days), 0)                                 as vacant_days_total,
  round(avg(v.avg_days_to_rent)::numeric, 1)                      as avg_days_to_rent
from public.crm_properties p
left join vac v on v.property_id = p.id
where p.management_agreement_id is not null
group by p.office_id, p.branch_id;

-- ────────────────────────────────────────────────────────────
-- R-07/R-10: Сарын бүртгэлийн бөглөлт (F-558) + өмчлөгчийн тайлангийн
-- хугацааны биелэлт (F-564). Мөр = (оффис, сар). «Хугацаандаа» =
-- тайлант үе дууссанаас 10 хоногийн дотор илгээсэн (жишиг; тохиргоо
-- 'statement_due_days'-ээр query давхаргад нарийсгаж болно).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_monthly_compliance
with (security_invoker = on) as
with recs as (
  select
    r.office_id,
    r.month,
    count(*)                                              as records_total,
    count(*) filter (where r.completeness_pct >= 100)     as records_complete,
    round(avg(r.completeness_pct), 1)                     as avg_completeness,
    count(*) filter (where r.commission_hold)             as hold_count
  from public.crm_monthly_records r
  group by r.office_id, r.month
),
stmts as (
  select
    s.office_id,
    date_trunc('month', s.period_start)::date             as month,
    count(*)                                              as statements_total,
    count(*) filter (where s.sent_at is not null)         as statements_sent,
    count(*) filter (where s.sent_at is not null
                       and s.sent_at::date <= s.period_end + 10) as statements_on_time,
    count(*) filter (where s.acknowledged_at is not null) as statements_acknowledged
  from public.crm_owner_statements s
  group by s.office_id, date_trunc('month', s.period_start)
),
keys as (
  select office_id, month from recs
  union select office_id, month from stmts
)
select
  k.office_id,
  k.month,
  coalesce(r.records_total, 0)            as records_total,
  coalesce(r.records_complete, 0)         as records_complete,
  round(100.0 * coalesce(r.records_complete, 0) / nullif(r.records_total, 0), 1) as completion_pct,
  coalesce(r.avg_completeness, 0)         as avg_completeness,
  coalesce(r.hold_count, 0)               as hold_count,
  coalesce(s.statements_total, 0)         as statements_total,
  coalesce(s.statements_sent, 0)          as statements_sent,
  coalesce(s.statements_on_time, 0)       as statements_on_time,
  coalesce(s.statements_acknowledged, 0)  as statements_acknowledged,
  round(100.0 * coalesce(s.statements_on_time, 0) / nullif(s.statements_total, 0), 1) as on_time_pct
from keys k
left join recs  r on r.office_id = k.office_id and r.month = k.month
left join stmts s on s.office_id = k.office_id and s.month = k.month;

-- ────────────────────────────────────────────────────────────
-- Шимтгэлийн нэгтгэл (R-10/агентын товчоо): мөр = (оффис, сар, төлөв).
-- Агентад RLS-ээр өөрийн мөр л нэгтгэгдэнэ (F-471).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_commission_summary
with (security_invoker = on) as
select
  c.office_id,
  date_trunc('month', c.created_at)::date as month,
  c.status,
  count(*)                                as cnt,
  coalesce(sum(c.amount), 0)::numeric(14,2)      as total_amount,
  coalesce(sum(c.paid_amount), 0)::numeric(14,2) as total_paid,
  count(*) filter (where c.hold_reason is not null) as with_hold_reason
from public.crm_commission_records c
group by c.office_id, date_trunc('month', c.created_at), c.status;

-- ────────────────────────────────────────────────────────────
-- R-14: KPI-ийн нэгдсэн сарын тайлан — мөр = (оффис, сар). §6.7-ийн
-- жагсаалтын автомат хэмжигдэх KPI-ууд нэг мөрөнд; хувь (%) query
-- давхаргад тоологч/хуваагчаас тооцогдоно (R-24 зорилт settings-ээс).
-- ────────────────────────────────────────────────────────────
create view public.crm_v_kpi_monthly
with (security_invoker = on) as
with txn as (
  select
    t2.office_id,
    t2.month,
    count(*)                               as closed_txn_count,
    coalesce(sum(t2.amount_mnt), 0)        as closed_amount_mnt,
    count(*) filter (where t2.is_repeat)   as repeat_txn_count
  from (
    select
      t.office_id,
      date_trunc('month', t.closed_on)::date as month,
      t.amount_mnt,
      coalesce(c.is_repeat, false) as is_repeat
    from public.crm_transactions t
    left join public.crm_opportunities o on o.id = t.opportunity_id
    left join public.crm_contacts      c on c.id = o.contact_id
    where t.status = 'closed' and t.closed_on is not null
  ) t2
  group by t2.office_id, t2.month
),
income as (
  select
    p.office_id,
    date_trunc('month', p.paid_on)::date   as month,
    coalesce(sum(p.amount_mnt), 0)         as verified_income_mnt
  from public.crm_payments p
  where p.kind = 'income' and p.finance_verified_at is not null
  group by p.office_id, date_trunc('month', p.paid_on)
),
leadm as (
  select
    l.office_id,
    date_trunc('month', l.created_at)::date as month,
    count(*)                                as new_leads,
    count(*) filter (where l.source_id is not null) as leads_with_source,
    count(*) filter (where l.first_contact_due_at is not null
                       and l.last_contact_at is not null
                       and l.last_contact_at <= l.first_contact_due_at) as sla_met,
    count(*) filter (where l.first_contact_due_at is not null
                       and (l.last_contact_at is not null or l.first_contact_due_at < now())) as sla_total
  from public.crm_leads l
  group by l.office_id, date_trunc('month', l.created_at)
),
act as (
  select
    a.office_id,
    date_trunc('month', a.occurred_at)::date as month,
    count(*)                                 as material_activities,
    count(*) filter (where a.occurred_at::date = a.created_at::date) as same_day_logged,
    count(*) filter (where a.channel = 'showing')                    as showings,
    count(*) filter (where a.channel = 'showing'
                       and a.feedback_category is not null)          as showings_with_feedback
  from public.crm_activities a
  group by a.office_id, date_trunc('month', a.occurred_at)
),
nps as (
  select
    n.office_id,
    date_trunc('month', n.answered_at)::date as month,
    count(*)                                 as nps_count,
    round(avg(n.score), 1)                   as nps_avg,
    (count(*) filter (where n.score >= 9) - count(*) filter (where n.score <= 6)) as nps_net
  from public.crm_nps_surveys n
  where n.answered_at is not null and n.score is not null
  group by n.office_id, date_trunc('month', n.answered_at)
),
ref as (
  select
    r.office_id,
    date_trunc('month', r.created_at)::date as month,
    count(*)                                as referral_count
  from public.crm_referrals r
  group by r.office_id, date_trunc('month', r.created_at)
),
lost as (
  select
    o.office_id,
    date_trunc('month', o.updated_at)::date as month,
    count(*)                                as lost_opps,
    count(*) filter (where o.lost_reason_id is not null) as lost_with_reason
  from public.crm_opportunities o
  where o.state = 'lost'
  group by o.office_id, date_trunc('month', o.updated_at)
),
escs as (
  select
    e.office_id,
    date_trunc('month', e.escalated_at)::date as month,
    count(*)                                  as escalation_count
  from public.crm_arrears_escalations e
  group by e.office_id, date_trunc('month', e.escalated_at)
),
recur as (
  select
    i.office_id,
    i.period_month                            as month,
    coalesce(sum(i.amount), 0)                as recurring_revenue
  from public.crm_invoices i
  where i.type = 'mgmt_fee' and i.status <> 'cancelled' and i.period_month is not null
  group by i.office_id, i.period_month
),
keys as (
  select office_id, month from txn
  union select office_id, month from income
  union select office_id, month from leadm
  union select office_id, month from act
  union select office_id, month from nps
  union select office_id, month from ref
  union select office_id, month from lost
  union select office_id, month from escs
  union select office_id, month from recur
)
select
  k.office_id,
  k.month,
  coalesce(t.closed_txn_count, 0)     as closed_txn_count,
  coalesce(t.closed_amount_mnt, 0)::numeric(16,2) as closed_amount_mnt,
  coalesce(t.repeat_txn_count, 0)     as repeat_txn_count,
  coalesce(i.verified_income_mnt, 0)::numeric(16,2) as verified_income_mnt,
  coalesce(l.new_leads, 0)            as new_leads,
  coalesce(l.leads_with_source, 0)    as leads_with_source,
  coalesce(l.sla_met, 0)              as sla_met,
  coalesce(l.sla_total, 0)            as sla_total,
  coalesce(a.material_activities, 0)  as material_activities,
  coalesce(a.same_day_logged, 0)      as same_day_logged,
  coalesce(a.showings, 0)             as showings,
  coalesce(a.showings_with_feedback, 0) as showings_with_feedback,
  n.nps_avg,
  coalesce(n.nps_count, 0)            as nps_count,
  case when coalesce(n.nps_count, 0) > 0
       then round(100.0 * n.nps_net / n.nps_count, 0) end as nps_score,
  coalesce(r.referral_count, 0)       as referral_count,
  coalesce(ls.lost_opps, 0)           as lost_opps,
  coalesce(ls.lost_with_reason, 0)    as lost_with_reason,
  coalesce(e.escalation_count, 0)     as escalation_count,
  coalesce(rc.recurring_revenue, 0)::numeric(16,2) as recurring_revenue
from keys k
left join txn    t  on t.office_id  = k.office_id and t.month  = k.month
left join income i  on i.office_id  = k.office_id and i.month  = k.month
left join leadm  l  on l.office_id  = k.office_id and l.month  = k.month
left join act    a  on a.office_id  = k.office_id and a.month  = k.month
left join nps    n  on n.office_id  = k.office_id and n.month  = k.month
left join ref    r  on r.office_id  = k.office_id and r.month  = k.month
left join lost   ls on ls.office_id = k.office_id and ls.month = k.month
left join escs   e  on e.office_id  = k.office_id and e.month  = k.month
left join recur  rc on rc.office_id = k.office_id and rc.month = k.month;

-- ────────────────────────────────────────────────────────────
-- Эрхийн бүрдэл: security_invoker тул underlying RLS үйлчилнэ;
-- anon-д огт нээхгүй (нийтийн сайтын хэрэглэгч CRM тоо харахгүй).
-- ────────────────────────────────────────────────────────────
revoke select on public.crm_v_agent_today        from anon, public;
revoke select on public.crm_v_lead_funnel        from anon, public;
revoke select on public.crm_v_pipeline_forecast  from anon, public;
revoke select on public.crm_v_arrears_aging      from anon, public;
revoke select on public.crm_v_occupancy          from anon, public;
revoke select on public.crm_v_monthly_compliance from anon, public;
revoke select on public.crm_v_commission_summary from anon, public;
revoke select on public.crm_v_kpi_monthly        from anon, public;

grant select on public.crm_v_agent_today        to authenticated;
grant select on public.crm_v_lead_funnel        to authenticated;
grant select on public.crm_v_pipeline_forecast  to authenticated;
grant select on public.crm_v_arrears_aging      to authenticated;
grant select on public.crm_v_occupancy          to authenticated;
grant select on public.crm_v_monthly_compliance to authenticated;
grant select on public.crm_v_commission_summary to authenticated;
grant select on public.crm_v_kpi_monthly        to authenticated;

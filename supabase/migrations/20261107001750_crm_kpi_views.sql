-- ════════════════════════════════════════════════════════════
-- U6 crm-quality-kpi (PMC-CRM-PRO-001 v2.1 §8.1, §8.2, §8.4, §8.5, R1)
-- Бүх функц security invoker — дуудагчийн RLS үйлчилнэ (агент өөрийн,
-- ахлагч багийн, удирдлага оффисын тоог авна). Хүрээ нь тохиргооны
-- 'kpi_scope' урсгалын жагсаалт (горилогчийн урсгал орохгүй).
-- Огноо бүр Улаанбаатарын цагаар. Хувь, зорилттой харьцуулалтыг
-- lib/crm/quality.ts тооцно (тоологч, хуваагчийг эндээс авна).
-- Хамаарал: 20261107001700.
-- ════════════════════════════════════════════════════════════

-- §8.2 шатлалын алхам: шатны код → 1…10 (Сэжим=1 … Хаалт=10).
create or replace function public.crm_kpi_stage_step(p_code text)
returns int language sql immutable as $$
  select case p_code
    when 'contacted' then 2
    when 'qualified' then 3
    when 'matched' then 4
    when 'showing' then 5
    when 'showings' then 5
    when 'interested' then 6
    when 'offer' then 7
    when 'negotiation' then 8
    when 'contract' then 9
    when 'payment_closing' then 9
    when 'closing' then 9
    when 'closed_won' then 10
  end;
$$;

-- §8.1 Эргэн холбогдох ажиллагааны KPI — агент бүрийн тоологч/хуваагч.
create or replace function public.crm_kpi_followup(p_from date, p_to date)
returns table (
  office_id uuid, agent_id uuid,
  active_leads bigint, leads_with_next_step bigint,
  steps_total bigint, steps_overdue bigint,
  showings_total bigint, showings_feedback_ok bigint,
  offers_open bigint, offers_followed bigint,
  hot_leads bigint, hot_leads_on_freq bigint,
  material_total bigint, material_same_day bigint)
language sql stable security invoker set search_path = public as $$
  with
  today as (select public.crm_ub_today() as d),
  lead_agg as (
    select l.office_id, l.owner_id as agent_id,
           count(*) as active_leads,
           count(*) filter (where l.next_step_date is not null and nullif(btrim(l.next_step), '') is not null) as with_next,
           count(*) filter (where l.next_step_date is not null) as steps_total,
           count(*) filter (where l.next_step_date < (select d from today)) as steps_overdue,
           count(*) filter (where l.status = 'active' and l.grade = 'a') as hot,
           count(*) filter (where l.status = 'active' and l.grade = 'a'
                              and l.last_contact_at >= now() - make_interval(days =>
                                    public.crm_setting_num(l.office_id, 'recontact_frequency', array['a'], 3)::int)) as hot_ok
    from public.crm_leads l
    where l.status in ('new', 'active') and l.owner_id is not null
    group by l.office_id, l.owner_id
  ),
  opp_agg as (
    select o.office_id, o.owner_id as agent_id,
           count(*) filter (where o.next_step_date is not null) as steps_total,
           count(*) filter (where o.next_step_date < (select d from today)) as steps_overdue
    from public.crm_opportunities o
    join public.crm_pipelines p on p.id = o.pipeline_id
    where o.state = 'open' and o.owner_id is not null and public.crm_kpi_pipeline_in(o.office_id, p.code)
    group by o.office_id, o.owner_id
  ),
  show_agg as (
    select a.office_id, a.owner_id as agent_id,
           count(*) as total,
           count(*) filter (where a.feedback_at is not null and a.feedback_at <= a.occurred_at + make_interval(hours => h.hours::int)) as ok
    from public.crm_activities a
    cross join lateral (
      select public.crm_setting_num(a.office_id, 'kpi_targets', array['showing_feedback_hours'], 24) as hours
    ) h
    where a.channel = 'showing' and coalesce(a.reached, true) and a.owner_id is not null
      and (a.occurred_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
      and (a.feedback_at is not null or a.occurred_at + make_interval(hours => h.hours::int) <= now())
    group by a.office_id, a.owner_id
  ),
  offer_agg as (
    select o.office_id, o.owner_id as agent_id,
           count(*) as total,
           count(*) filter (where f.next_step_date is not null and f.next_step_date >= (select d from today)) as ok
    from public.crm_offers f
    join public.crm_opportunities o on o.id = f.opportunity_id
    join public.crm_pipelines p on p.id = o.pipeline_id
    where f.status in ('open', 'countered') and o.state = 'open' and o.owner_id is not null
      and public.crm_kpi_pipeline_in(o.office_id, p.code)
    group by o.office_id, o.owner_id
  ),
  act_agg as (
    select a.office_id, a.owner_id as agent_id,
           count(*) as total,
           count(*) filter (where (a.created_at at time zone 'Asia/Ulaanbaatar')::date
                                  <= (a.occurred_at at time zone 'Asia/Ulaanbaatar')::date) as ok
    from public.crm_activities a
    where a.is_meaningful and a.owner_id is not null
      and (a.occurred_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
    group by a.office_id, a.owner_id
  ),
  keys as (
    select office_id, agent_id from lead_agg
    union select office_id, agent_id from opp_agg
    union select office_id, agent_id from show_agg
    union select office_id, agent_id from offer_agg
    union select office_id, agent_id from act_agg
  )
  select k.office_id, k.agent_id,
         coalesce(l.active_leads, 0), coalesce(l.with_next, 0),
         coalesce(l.steps_total, 0) + coalesce(o.steps_total, 0),
         coalesce(l.steps_overdue, 0) + coalesce(o.steps_overdue, 0),
         coalesce(s.total, 0), coalesce(s.ok, 0),
         coalesce(f.total, 0), coalesce(f.ok, 0),
         coalesce(l.hot, 0), coalesce(l.hot_ok, 0),
         coalesce(a.total, 0), coalesce(a.ok, 0)
  from keys k
  left join lead_agg l on l.office_id = k.office_id and l.agent_id = k.agent_id
  left join opp_agg o on o.office_id = k.office_id and o.agent_id = k.agent_id
  left join show_agg s on s.office_id = k.office_id and s.agent_id = k.agent_id
  left join offer_agg f on f.office_id = k.office_id and f.agent_id = k.agent_id
  left join act_agg a on a.office_id = k.office_id and a.agent_id = k.agent_id;
$$;

-- §8.2 10 шатлалын хөрвөлт — тухайн хугацаанд ирсэн сэжмийн хамгийн хол хүрсэн алхам.
-- Шат алгассан бол өмнөх алхмыг давсанд тооцно (s_k = k-аас дээш хүрсэн сэжим).
create or replace function public.crm_kpi_funnel(p_from date, p_to date)
returns table (
  office_id uuid, owner_id uuid, branch_id uuid, source_id uuid, campaign_code text,
  s1 bigint, s2 bigint, s3 bigint, s4 bigint, s5 bigint,
  s6 bigint, s7 bigint, s8 bigint, s9 bigint, s10 bigint)
language sql stable security invoker set search_path = public as $$
  with lead_steps as (
    select l.office_id, l.owner_id, l.branch_id, l.source_id, nullif(btrim(l.campaign_code), '') as campaign_code,
           greatest(
             case when l.first_contact_at is not null
                    or exists (select 1 from public.crm_activities a where a.lead_id = l.id and a.is_meaningful)
                  then 2 else 1 end,
             coalesce((
               select max(public.crm_kpi_stage_step(st.code))
               from public.crm_opportunities o
               join public.crm_pipelines p on p.id = o.pipeline_id
               cross join lateral (
                 select s.code from public.crm_stages s where s.id = o.stage_id
                 union
                 select s.code from public.crm_stage_history h
                 join public.crm_stages s on s.id = h.to_stage_id
                 where h.opportunity_id = o.id
               ) st
               where o.lead_id = l.id and public.crm_kpi_pipeline_in(o.office_id, p.code, 'funnel_pipelines')
             ), 0)
           ) as step
    from public.crm_leads l
    where (coalesce(l.received_at, l.created_at) at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
  )
  select office_id, owner_id, branch_id, source_id, campaign_code,
         count(*),
         count(*) filter (where step >= 2), count(*) filter (where step >= 3),
         count(*) filter (where step >= 4), count(*) filter (where step >= 5),
         count(*) filter (where step >= 6), count(*) filter (where step >= 7),
         count(*) filter (where step >= 8), count(*) filter (where step >= 9),
         count(*) filter (where step >= 10)
  from lead_steps
  group by office_id, owner_id, branch_id, source_id, campaign_code;
$$;

-- §8.4(4)(5), §8.5(2) Шат × дүн × агент: нээлттэй боломж ₮-өөр, жинлэсэн дүн/хөлс,
-- энэ долоо хоног, сард хаагдах хүлээгдэж буй.
create or replace function public.crm_kpi_pipeline_stages()
returns table (
  office_id uuid, pipeline_code text, pipeline_name text, stage_code text, stage_name text,
  sort_order int, probability numeric, owner_id uuid, branch_id uuid,
  open_count bigint, amount_mnt numeric, weighted_mnt numeric, fee_mnt numeric, weighted_fee_mnt numeric,
  unconverted_count bigint,
  close_week_count bigint, close_week_weighted_fee numeric,
  close_month_count bigint, close_month_weighted_fee numeric,
  overdue_close_count bigint)
language sql stable security invoker set search_path = public as $$
  with
  d as (select public.crm_ub_today() as t),
  w as (select t, t - (extract(isodow from t)::int - 1) as wk, date_trunc('month', t)::date as mo from d),
  o as (
    select o.office_id, o.owner_id, o.branch_id, o.amount, o.expected_fee_mnt, o.expected_close_on,
           p.code as pcode, p.name as pname, s.code as scode, s.name as sname, s.sort_order, s.probability,
           o.amount * public.crm_fx_rate(o.office_id, o.currency, (select t from d)) as amount_mnt
    from public.crm_opportunities o
    join public.crm_stages s on s.id = o.stage_id
    join public.crm_pipelines p on p.id = o.pipeline_id
    where o.state = 'open' and not s.is_terminal and public.crm_kpi_pipeline_in(o.office_id, p.code)
  )
  select o.office_id, o.pcode, o.pname, o.scode, o.sname, o.sort_order, o.probability, o.owner_id, o.branch_id,
         count(*),
         coalesce(sum(o.amount_mnt), 0),
         coalesce(sum(o.amount_mnt * o.probability / 100), 0),
         coalesce(sum(o.expected_fee_mnt), 0),
         coalesce(sum(coalesce(o.expected_fee_mnt, 0) * o.probability / 100), 0),
         count(*) filter (where o.amount is not null and o.amount_mnt is null),
         count(*) filter (where o.expected_close_on between w.wk and w.wk + 6),
         coalesce(sum(coalesce(o.expected_fee_mnt, 0) * o.probability / 100)
                    filter (where o.expected_close_on between w.wk and w.wk + 6), 0),
         count(*) filter (where o.expected_close_on >= w.mo and o.expected_close_on < (w.mo + interval '1 month')::date),
         coalesce(sum(coalesce(o.expected_fee_mnt, 0) * o.probability / 100)
                    filter (where o.expected_close_on >= w.mo and o.expected_close_on < (w.mo + interval '1 month')::date), 0),
         count(*) filter (where o.expected_close_on < w.t)
  from o cross join w
  group by o.office_id, o.pcode, o.pname, o.scode, o.sname, o.sort_order, o.probability, o.owner_id, o.branch_id;
$$;

-- §8.4(7)(8)(9), §8.5(1)(4)(6)(7)(9) Хугацааны үзүүлэлт: орлого (Санхүү баталгаажуулсан
-- зуучлалын орлого), хаагдсан хэлцэл, алдсан шалтгаан, гомдол — сараар, хэмжээсээр.
create or replace function public.crm_kpi_period_metrics(p_from date, p_to date)
returns table (
  office_id uuid, metric text, period_month date, owner_id uuid, branch_id uuid, source_id uuid,
  campaign_code text, pipeline_code text, dim_code text, dim_label text, cnt bigint, value numeric)
language sql stable security invoker set search_path = public as $$
  -- Орлого
  select p.office_id, 'revenue'::text, date_trunc('month', p.paid_on)::date,
         o.owner_id, coalesce(o.branch_id, pr.branch_id), l.source_id, nullif(btrim(l.campaign_code), ''),
         pl.code, null::text, null::text,
         count(*), coalesce(sum(p.amount_mnt), 0)
  from public.crm_payments p
  join public.crm_transactions t on t.id = p.transaction_id
  left join public.crm_opportunities o on o.id = t.opportunity_id
  left join public.crm_pipelines pl on pl.id = o.pipeline_id
  left join public.crm_leads l on l.id = o.lead_id
  left join public.crm_properties pr on pr.id = t.property_id
  where p.kind = 'income' and p.finance_verified_at is not null and p.correction_of_id is null
    and p.paid_on between p_from and p_to
    and (pl.code is null or public.crm_kpi_pipeline_in(p.office_id, pl.code))
  group by p.office_id, date_trunc('month', p.paid_on), o.owner_id, coalesce(o.branch_id, pr.branch_id),
           l.source_id, nullif(btrim(l.campaign_code), ''), pl.code
  union all
  -- Хаагдсан хэлцэл
  select t.office_id, 'closed', date_trunc('month', t.closed_on)::date,
         o.owner_id, coalesce(o.branch_id, pr.branch_id), l.source_id, nullif(btrim(l.campaign_code), ''),
         pl.code, null, null,
         count(*), coalesce(sum(t.amount_mnt), 0)
  from public.crm_transactions t
  left join public.crm_opportunities o on o.id = t.opportunity_id
  left join public.crm_pipelines pl on pl.id = o.pipeline_id
  left join public.crm_leads l on l.id = o.lead_id
  left join public.crm_properties pr on pr.id = t.property_id
  where t.status = 'closed' and t.closed_on between p_from and p_to
    and (pl.code is null or public.crm_kpi_pipeline_in(t.office_id, pl.code))
  group by t.office_id, date_trunc('month', t.closed_on), o.owner_id, coalesce(o.branch_id, pr.branch_id),
           l.source_id, nullif(btrim(l.campaign_code), ''), pl.code
  union all
  -- Алдсан шалтгаан (амжилтгүй хаагдсан огноогоор)
  select x.office_id, 'lost', date_trunc('month', x.closed_on)::date,
         x.owner_id, x.branch_id, x.source_id, x.campaign_code, x.pcode,
         coalesce(x.reason_code, 'unknown'), coalesce(x.reason_label, 'Бүртгэгдээгүй'),
         count(*), 0
  from (
    select o.office_id, o.owner_id, o.branch_id, l.source_id, nullif(btrim(l.campaign_code), '') as campaign_code,
           p.code as pcode, lr.code as reason_code, lr.label as reason_label,
           (coalesce((select max(h.entered_at) from public.crm_stage_history h
                      join public.crm_stages ts on ts.id = h.to_stage_id
                      where h.opportunity_id = o.id and ts.terminal_state = 'lost'), o.updated_at)
             at time zone 'Asia/Ulaanbaatar')::date as closed_on
    from public.crm_opportunities o
    join public.crm_pipelines p on p.id = o.pipeline_id
    left join public.crm_lookups lr on lr.id = o.lost_reason_id
    left join public.crm_leads l on l.id = o.lead_id
    where o.state = 'lost' and public.crm_kpi_pipeline_in(o.office_id, p.code)
  ) x
  where x.closed_on between p_from and p_to
  group by x.office_id, date_trunc('month', x.closed_on), x.owner_id, x.branch_id, x.source_id, x.campaign_code,
           x.pcode, x.reason_code, x.reason_label
  union all
  -- Гомдол (ноцтой эсэхээр; value = шийдэгдсэн тоо)
  select c.office_id, 'complaints', date_trunc('month', (c.created_at at time zone 'Asia/Ulaanbaatar'))::date,
         null, null, null, null, null, c.severity,
         case c.severity when 'serious' then 'Ноцтой' else 'Энгийн' end,
         count(*), count(*) filter (where c.resolved_at is not null)
  from public.crm_complaints c
  where (c.created_at at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
  group by c.office_id, date_trunc('month', (c.created_at at time zone 'Asia/Ulaanbaatar')), c.severity;
$$;

-- R1: эхний холболтын хурд минутаар — агент, эх сурвалж, долоо хоногоор (§6.4, §7(1)).
create or replace function public.crm_kpi_response_time(p_from date, p_to date)
returns table (
  office_id uuid, owner_id uuid, source_id uuid, week_start date,
  contacted bigint, avg_min numeric, median_min numeric, within_sla bigint, sla_total bigint)
language sql stable security invoker set search_path = public as $$
  with x as (
    select l.office_id, l.owner_id, l.source_id,
           (coalesce(l.received_at, l.created_at) at time zone 'Asia/Ulaanbaatar')::date as d,
           case when l.first_contact_at is not null
                then greatest(0, extract(epoch from (l.first_contact_at - coalesce(l.received_at, l.created_at))) / 60)
           end as minutes,
           l.first_contact_due_at, l.first_contact_at
    from public.crm_leads l
    where (coalesce(l.received_at, l.created_at) at time zone 'Asia/Ulaanbaatar')::date between p_from and p_to
  )
  select office_id, owner_id, source_id, d - (extract(isodow from d)::int - 1),
         count(minutes),
         round(avg(minutes)::numeric, 1),
         round((percentile_cont(0.5) within group (order by minutes))::numeric, 1),
         count(*) filter (where first_contact_due_at is not null and first_contact_at is not null
                            and first_contact_at <= first_contact_due_at),
         count(*) filter (where first_contact_due_at is not null
                            and (first_contact_at is not null or first_contact_due_at < now()))
  from x
  group by office_id, owner_id, source_id, d - (extract(isodow from d)::int - 1);
$$;

-- §8.4(10) Салбар хоорондын хэлцэл: боломж, үл хөдлөх, урамшууллын үүрэгт оролцогчдын салбар зөрүүтэй.
create or replace view public.crm_v_cross_branch_deals
with (security_invoker = on) as
select t.office_id, t.id as transaction_id, t.number, t.status, t.amount_mnt, t.closed_on, t.opportunity_id,
       o.owner_id, o.branch_id as opp_branch_id, pr.branch_id as property_branch_id,
       br.branch_ids, br.agent_count,
       (select count(*) from public.crm_commission_disputes d
         where d.transaction_id = t.id and d.decision is null) as open_disputes
from public.crm_transactions t
left join public.crm_opportunities o on o.id = t.opportunity_id
left join public.crm_properties pr on pr.id = t.property_id
cross join lateral (
  select array(
           select distinct b from unnest(
             array_cat(
               coalesce((select array_agg(s.branch_id)
                         from public.crm_transaction_agent_roles r
                         join public.crm_staff s on s.profile_id = r.agent_profile_id and s.office_id = r.office_id
                         where r.transaction_id = t.id), '{}'::uuid[]),
               array[o.branch_id, pr.branch_id])) as b
           where b is not null) as branch_ids,
         (select count(distinct r.agent_profile_id) from public.crm_transaction_agent_roles r
           where r.transaction_id = t.id) as agent_count
) br
where t.status <> 'cancelled' and cardinality(br.branch_ids) > 1;

revoke select on public.crm_v_cross_branch_deals from anon, public;
grant select on public.crm_v_cross_branch_deals to authenticated;

revoke execute on function public.crm_kpi_stage_step(text) from anon, public;
revoke execute on function public.crm_kpi_followup(date, date) from anon, public;
revoke execute on function public.crm_kpi_funnel(date, date) from anon, public;
revoke execute on function public.crm_kpi_pipeline_stages() from anon, public;
revoke execute on function public.crm_kpi_period_metrics(date, date) from anon, public;
revoke execute on function public.crm_kpi_response_time(date, date) from anon, public;
grant execute on function public.crm_kpi_stage_step(text) to authenticated;
grant execute on function public.crm_kpi_followup(date, date) to authenticated;
grant execute on function public.crm_kpi_funnel(date, date) to authenticated;
grant execute on function public.crm_kpi_pipeline_stages() to authenticated;
grant execute on function public.crm_kpi_period_metrics(date, date) to authenticated;
grant execute on function public.crm_kpi_response_time(date, date) to authenticated;

-- ── §6.19/§6.24 хүрээ, §8.5(2): одоо байгаа самбарын view-үүдийг борлуулалтын
-- урсгалаар хязгаарлаж, огноог УБ-аар, дүнг ₮-өөр (ханшгүй дүн орохгүй) тооцно.
-- Баганын нэр, төрөл хэвээр (create or replace) — уншдаг код өөрчлөгдөхгүй.

create or replace view public.crm_v_pipeline_forecast
with (security_invoker = on) as
with o as (
  select o.*, p.code as pcode, p.name as pname, s.probability,
         coalesce(o.amount * public.crm_fx_rate(o.office_id, o.currency, public.crm_ub_today()), 0) as amount_mnt
  from public.crm_opportunities o
  join public.crm_stages    s on s.id = o.stage_id
  join public.crm_pipelines p on p.id = o.pipeline_id
  where o.state = 'open' and not s.is_terminal and public.crm_kpi_pipeline_in(o.office_id, p.code)
)
select
  o.office_id,
  o.pipeline_id,
  o.pcode                                          as pipeline_code,
  o.pname                                          as pipeline_name,
  o.owner_id,
  o.branch_id,
  count(*)                                         as open_count,
  coalesce(sum(o.amount_mnt), 0)::numeric(14,2)    as total_amount,
  coalesce(sum(o.amount_mnt * o.probability / 100), 0)::numeric(14,2) as weighted_amount,
  coalesce(sum(o.amount_mnt * o.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= public.crm_ub_today() + 30), 0)::numeric(14,2) as weighted_30,
  coalesce(sum(o.amount_mnt * o.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= public.crm_ub_today() + 60), 0)::numeric(14,2) as weighted_60,
  coalesce(sum(o.amount_mnt * o.probability / 100)
    filter (where o.expected_close_on is not null
              and o.expected_close_on <= public.crm_ub_today() + 90), 0)::numeric(14,2) as weighted_90,
  count(*) filter (where o.aml_hold)               as aml_held_count
from o
group by o.office_id, o.pipeline_id, o.pcode, o.pname, o.owner_id, o.branch_id;

create or replace view public.crm_v_agent_today
with (security_invoker = on) as
with
today as (select public.crm_ub_today() as d),
lead_agg as (
  select
    l.office_id,
    l.owner_id,
    count(*) filter (where l.status = 'new')                                                    as new_leads,
    count(*) filter (where l.status = 'active' and l.next_step_date = (select d from today))    as steps_today,
    count(*) filter (where l.status in ('new', 'active') and l.next_step_date < (select d from today)) as steps_overdue,
    count(*) filter (where l.status = 'active' and l.grade = 'a')                               as hot_leads,
    count(*) filter (where l.status = 'active')                                                 as active_leads
  from public.crm_leads l
  where l.owner_id is not null and l.status in ('new', 'active')
  group by l.office_id, l.owner_id
),
task_agg as (
  select
    t.office_id,
    t.responsible_id as owner_id,
    count(*) filter (where (t.deadline at time zone 'Asia/Ulaanbaatar')::date = (select d from today)) as tasks_today,
    count(*) filter (where t.deadline < now())                                                         as tasks_overdue
  from public.tasks t
  where t.status in ('pending', 'in_progress')
  group by t.office_id, t.responsible_id
),
act_agg as (
  select
    a.office_id,
    a.owner_id,
    count(*) filter (where a.channel = 'showing'
                       and (a.occurred_at at time zone 'Asia/Ulaanbaatar')::date = (select d from today)) as showings_today,
    count(*) filter (where a.channel = 'showing'
                       and coalesce(a.reached, true)
                       and a.feedback_category is null
                       and a.occurred_at >= now() - interval '72 hours'
                       and a.occurred_at <= now())                                                   as pending_feedback
  from public.crm_activities a
  group by a.office_id, a.owner_id
),
opp_agg as (
  select
    o.office_id,
    o.owner_id,
    count(*)                                                                           as open_opps,
    coalesce(sum(round(coalesce(o.amount * public.crm_fx_rate(o.office_id, o.currency, (select d from today)), 0)
                       * s.probability / 100)), 0)::numeric(14,2)                       as weighted_amount,
    count(*) filter (where s.code in ('offer', 'negotiation'))                         as offer_opps,
    count(*) filter (where s.is_closing_direction)                                     as closing_opps
  from public.crm_opportunities o
  join public.crm_stages s on s.id = o.stage_id
  join public.crm_pipelines p on p.id = o.pipeline_id
  where o.state = 'open' and not s.is_terminal and public.crm_kpi_pipeline_in(o.office_id, p.code)
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
  coalesce(oa.weighted_amount, 0)::numeric as weighted_amount,
  coalesce(oa.offer_opps, 0)       as offer_opps,
  coalesce(oa.closing_opps, 0)     as closing_opps
from keys k
left join lead_agg la on la.office_id = k.office_id and la.owner_id = k.owner_id
left join task_agg ta on ta.office_id = k.office_id and ta.owner_id = k.owner_id
left join act_agg  aa on aa.office_id = k.office_id and aa.owner_id = k.owner_id
left join opp_agg  oa on oa.office_id = k.office_id and oa.owner_id = k.owner_id;

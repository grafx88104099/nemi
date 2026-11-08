-- ════════════════════════════════════════════════════════════
-- U6 crm-quality-kpi (PMC-CRM-PRO-001 v2.1 §5, §6.29, §6.25.6, §8.5(8))
--   • CRM-ийн чанарын 12 шалгуурын автомат шалгалт (crm_v_quality_checks)
--     ба агент бүрийн өгөгдлийн чанарын хувь (crm_v_agent_data_quality).
--   • Чанарын аудит: Үйл ажиллагаа-ЧМТ түүвэр үүсгэж, мөр бүрийг гараар
--     баталж, оноо гаргана; дутуу мөрт засах даалгавар оноогдоно.
--   • crm_leads.grade_reviewed_at — ангилал шинэчлэгдсэн огноо (§6.29.4).
--   • Тохиргоо: quality_audit (түүврийн хэмжээ, хоног, босго), kpi_scope
--     (борлуулалтын үзүүлэлтэд орох урсгал). Тоон босго бүгд crm_settings-д.
-- Хамаарал: 20261107000100 … 001500.
-- ════════════════════════════════════════════════════════════

-- ── 1. Тохиргоо (оффис бүрд нэг удаа) ──

do $$
declare o record; v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;

    if not exists (select 1 from public.crm_settings
                   where office_id = o.office_id and key = 'quality_audit' and valid_to is null) then
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, 'quality_audit',
        '{"sample_per_criterion":10,
          "grade_review_days":30,
          "profile_complete_pct":100,
          "showing_note_hours":48,
          "consent_grace_days":7,
          "fix_due_days":3,
          "pass_score":90,
          "commission_quality_min_pct":80}'::jsonb,
        v_creator, 'PRO-001 v2.1 §6.29, §6.31 — чанарын аудитын анхны тохиргоо');
    end if;

    if not exists (select 1 from public.crm_settings
                   where office_id = o.office_id and key = 'kpi_scope' and valid_to is null) then
      insert into public.crm_settings (office_id, key, value, created_by, note)
      values (o.office_id, 'kpi_scope',
        '{"sales_pipelines":["PL-1","PL-2","PL-3","PL-4","PL-5"],
          "funnel_pipelines":["PL-1","PL-3","PL-4","PL-5"]}'::jsonb,
        v_creator, 'PRO-001 v2.1 §6.19, §6.24, §8.2 — борлуулалтын үзүүлэлтэд орох урсгал');
    end if;
  end loop;
end $$;

-- Борлуулалтын урсгалын хүрээ (§6.19/§6.24): тохиргооны жагсаалтад байгаа эсэх.
create or replace function public.crm_kpi_pipeline_in(p_office uuid, p_code text, p_list text default 'sales_pipelines')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  v := (select value from public.crm_settings
        where office_id = p_office and key = 'kpi_scope'
          and valid_from <= now() and (valid_to is null or valid_to > now())
        order by valid_from desc limit 1) -> p_list;
  if v is null or jsonb_typeof(v) <> 'array' then
    -- Тохиргоо алга: горилогчийн урсгалаас бусад бүх урсгал.
    return p_code is distinct from 'PL-6';
  end if;
  return v ? p_code;
end $$;

-- ── 2. Ангилал шинэчлэгдсэн огноо (§6.29.4) ──

alter table public.crm_leads add column if not exists grade_reviewed_at timestamptz;

create or replace function public.crm_leads_grade_reviewed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.grade is not null then
      new.grade_reviewed_at := coalesce(new.grade_reviewed_at, now());
    end if;
  elsif new.grade is distinct from old.grade
     or new.grade_override_reason is distinct from old.grade_override_reason then
    new.grade_reviewed_at := now();
  elsif new.grade_reviewed_at is distinct from old.grade_reviewed_at then
    -- Агент ангиллыг өөрчлөхгүйгээр баталгаажуулсан: зөвхөн урагш.
    if new.grade_reviewed_at is null or (old.grade_reviewed_at is not null and new.grade_reviewed_at < old.grade_reviewed_at) then
      new.grade_reviewed_at := old.grade_reviewed_at;
    elsif new.grade_reviewed_at > now() then
      new.grade_reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_grade_reviewed on public.crm_leads;
create trigger crm_leads_grade_reviewed
  before insert or update on public.crm_leads
  for each row execute function public.crm_leads_grade_reviewed();

-- Нөхөн бөглөлт: аудитын бүртгэл дэх сүүлийн ангиллын өөрчлөлт, эсвэл үүссэн огноо.
update public.crm_leads l
set grade_reviewed_at = coalesce(
  (select max(a.created_at) from public.crm_audit_log a
    where a.entity = 'crm_leads' and a.entity_id = l.id and a.field = 'grade'),
  l.created_at)
where l.grade is not null and l.grade_reviewed_at is null;

-- ── 3. 12 шалгуурын автомат шалгалт (§6.29) ──
-- Мөр бүр = нэг бүртгэлийн нэг шалгуур. result: pass|fail. occurred_on нь
-- үйл явдлын огноо (үзлэг, санал, алдсан, хэлцэл); төлөвийн шалгалтад null.
-- security_invoker — агент өөрийн, ахлагч багийн, удирдлага оффисын мөрийг харна.

create or replace view public.crm_v_quality_checks
with (security_invoker = on) as
with
cfg as (
  select x.office_id,
    public.crm_setting_num(x.office_id, 'quality_audit', array['grade_review_days'], 30)    as grade_days,
    public.crm_setting_num(x.office_id, 'quality_audit', array['profile_complete_pct'], 100) as profile_pct,
    public.crm_setting_num(x.office_id, 'quality_audit', array['showing_note_hours'], 48)   as showing_hours,
    public.crm_setting_num(x.office_id, 'quality_audit', array['consent_grace_days'], 7)    as consent_days
  from (select distinct office_id from public.crm_staff) x
),
contact_name as (
  select c.id, c.office_id, c.branch_id, c.created_by, c.consent, c.consent_at, c.created_at, c.lifecycle,
         coalesce(nullif(c.display_name, ''), nullif(concat_ws(' ', c.last_name, c.first_name), ''), c.org_name, c.number) as name,
         (select l.owner_id from public.crm_leads l
           where l.contact_id = c.id and l.status in ('new', 'active') and l.owner_id is not null
           order by l.created_at desc limit 1) as lead_owner
  from public.crm_contacts c
  where c.merged_into_id is null
),
-- 1. Давхардсан бүртгэл
q_dup as (
  select c.office_id, 'duplicates'::text as criterion, 'crm_contacts'::text as entity, c.id as entity_id,
         coalesce(c.lead_owner, c.created_by) as agent_id, c.branch_id, null::date as occurred_on,
         case when d.n > 0 then 'fail' else 'pass' end as result,
         case when d.n > 0 then 'Ижил утас/и-мэйлтэй ' || d.n || ' бүртгэл нэгтгэгдээгүй' end as reason,
         c.name as label
  from contact_name c
  cross join lateral (
    select count(distinct other.id) as n
    from (
      select p2.contact_id as id
      from public.crm_contact_phones p
      join public.crm_contact_phones p2
        on p2.office_id = p.office_id and p2.normalized = p.normalized and p2.contact_id <> p.contact_id
      where p.contact_id = c.id and nullif(p.normalized, '') is not null
      union
      select e2.contact_id
      from public.crm_contact_emails e
      join public.crm_contact_emails e2
        on e2.office_id = e.office_id and lower(e2.email) = lower(e.email) and e2.contact_id <> e.contact_id
      where e.contact_id = c.id and nullif(e.email, '') is not null
    ) other
    join public.crm_contacts c2 on c2.id = other.id and c2.merged_into_id is null
  ) d
  where c.lifecycle in ('new', 'active')
),
lead_base as (
  select l.*, cn.name as contact_label, src.requires_note as src_requires_note
  from public.crm_leads l
  left join contact_name cn on cn.id = l.contact_id
  left join public.crm_lookups src on src.id = l.source_id
  where l.status in ('new', 'active')
),
opp_base as (
  select o.*, p.code as pipeline_code, s.code as stage_code, s.sort_order as stage_sort,
         s.gate_code as stage_gate, s.is_terminal,
         coalesce(cn.name, '') || ' · ' || p.code as opp_label
  from public.crm_opportunities o
  join public.crm_pipelines p on p.id = o.pipeline_id
  join public.crm_stages s on s.id = o.stage_id
  left join contact_name cn on cn.id = o.contact_id
  where public.crm_kpi_pipeline_in(o.office_id, p.code)
),
-- 2. Эзэмшигч агент
q_owner as (
  select l.office_id, 'owner', 'crm_leads', l.id, l.owner_id, l.branch_id, null::date,
         case when l.owner_id is null then 'fail' else 'pass' end,
         case when l.owner_id is null then 'Эзэмшигч агент оноогоогүй' end,
         l.contact_label
  from lead_base l
  union all
  select o.office_id, 'owner', 'crm_opportunities', o.id, o.owner_id, o.branch_id, null::date,
         case when o.owner_id is null then 'fail' else 'pass' end,
         case when o.owner_id is null then 'Эзэмшигч агент оноогоогүй' end,
         o.opp_label
  from opp_base o where o.state = 'open'
),
-- 3. Сэжимийн эх сурвалж
q_source as (
  select l.office_id, 'source', 'crm_leads', l.id, l.owner_id, l.branch_id, null::date,
         case when l.source_id is null then 'fail'
              when coalesce(l.src_requires_note, false) and nullif(btrim(l.source_detail), '') is null then 'fail'
              else 'pass' end,
         case when l.source_id is null then 'Эх сурвалж бүртгэгдээгүй'
              when coalesce(l.src_requires_note, false) and nullif(btrim(l.source_detail), '') is null
                then 'Эх сурвалжийн тайлбар дутуу' end,
         l.contact_label
  from lead_base l
),
-- 4. Сэжимийн ангилал шинэчлэгдсэн
q_grade as (
  select l.office_id, 'grade', 'crm_leads', l.id, l.owner_id, l.branch_id, null::date,
         case when l.grade is null then 'fail'
              when coalesce(l.grade_reviewed_at, l.created_at) < now() - make_interval(days => cfg.grade_days::int) then 'fail'
              else 'pass' end,
         case when l.grade is null then 'Ангилал тогтоогоогүй'
              when coalesce(l.grade_reviewed_at, l.created_at) < now() - make_interval(days => cfg.grade_days::int)
                then 'Ангилал ' || cfg.grade_days::int || ' хоногоос дээш шинэчлэгдээгүй' end,
         l.contact_label
  from lead_base l join cfg on cfg.office_id = l.office_id
  where l.status = 'active'
),
-- 5. Шалгуур хангасан харилцагчийн хэрэгцээний профайл бүрэн
q_profile as (
  select o.office_id, 'need_profile', 'crm_opportunities', o.id, o.owner_id, o.branch_id, null::date,
         case when np.id is null or coalesce(np.completeness_pct, 0) < cfg.profile_pct then 'fail' else 'pass' end,
         case when np.id is null then 'Хэрэгцээний профайл холбогдоогүй'
              when coalesce(np.completeness_pct, 0) < cfg.profile_pct
                then 'Хэрэгцээний профайл ' || round(coalesce(np.completeness_pct, 0)) || '% бөглөгдсөн' end,
         o.opp_label
  from opp_base o
  join cfg on cfg.office_id = o.office_id
  join public.crm_stages qs on qs.pipeline_id = o.pipeline_id and qs.code = 'qualified'
  left join public.crm_need_profiles np on np.id = o.need_profile_id
  where o.state = 'open' and not o.is_terminal and o.stage_sort >= qs.sort_order
),
-- 6. Сүүлийн холболт шинэчлэгдсэн (ангиллын идэвхгүй байдлын босгоор)
q_contact as (
  select l.office_id, 'last_contact', 'crm_leads', l.id, l.owner_id, l.branch_id, null::date,
         case when l.last_contact_at is null then 'fail'
              when l.last_contact_at < now() - make_interval(days => t.days::int) then 'fail'
              else 'pass' end,
         case when l.last_contact_at is null then 'Холболт бүртгэгдээгүй'
              when l.last_contact_at < now() - make_interval(days => t.days::int)
                then 'Сүүлийн холболт ' || t.days::int || ' хоногоос хуучирсан' end,
         l.contact_label
  from lead_base l
  cross join lateral (
    select public.crm_setting_num(l.office_id, 'inactivity_thresholds', array[coalesce(l.grade::text, 'c')], 30) as days
  ) t
  where l.status = 'active'
),
-- 7. Дараагийн үйлдэл, огноо
q_next as (
  select l.office_id, 'next_step', 'crm_leads', l.id, l.owner_id, l.branch_id, null::date,
         case when l.next_step_date is null or nullif(btrim(l.next_step), '') is null then 'fail' else 'pass' end,
         case when l.next_step_date is null or nullif(btrim(l.next_step), '') is null
              then 'Дараагийн үйлдэл, огноо бүртгэгдээгүй' end,
         l.contact_label
  from lead_base l
  union all
  select o.office_id, 'next_step', 'crm_opportunities', o.id, o.owner_id, o.branch_id, null::date,
         case when o.next_step_date is null or nullif(btrim(o.next_step), '') is null then 'fail' else 'pass' end,
         case when o.next_step_date is null or nullif(btrim(o.next_step), '') is null
              then 'Дараагийн үйлдэл, огноо бүртгэгдээгүй' end,
         o.opp_label
  from opp_base o where o.state = 'open'
),
-- 8. Шат нотолгоотойгоо тохирсон (одоогийн шатны шилжих шалгуур одоо ч хангагдсан)
q_stage as (
  select o.office_id, 'stage_evidence', 'crm_opportunities', o.id, o.owner_id, o.branch_id, null::date,
         case when coalesce(array_length(m.missing, 1), 0) = 0 then 'pass' else 'fail' end,
         case when coalesce(array_length(m.missing, 1), 0) > 0
              then 'Шатны нотолгоо дутуу: ' || array_to_string(m.missing, '; ') end,
         o.opp_label
  from opp_base o
  join public.crm_opportunities oo on oo.id = o.id
  cross join lateral (select public.crm_check_gate_rec(oo, o.stage_gate) as missing) m
  where o.state = 'open' and not o.is_terminal and o.stage_gate is not null
),
-- 9. Үзлэг, үнийн саналын тэмдэглэл бүрэн
q_notes as (
  select a.office_id, 'showing_offer_notes', 'crm_activities', a.id, a.owner_id, cn.branch_id,
         (a.occurred_at at time zone 'Asia/Ulaanbaatar')::date,
         case when a.feedback_category is null or nullif(btrim(a.summary), '') is null then 'fail' else 'pass' end,
         case when a.feedback_category is null then 'Үзлэгийн эргэх холбоо бүртгэгдээгүй'
              when nullif(btrim(a.summary), '') is null then 'Үзлэгийн тэмдэглэл хоосон' end,
         coalesce(cn.name, '') || ' · үзлэг'
  from public.crm_activities a
  join cfg on cfg.office_id = a.office_id
  left join contact_name cn on cn.id = a.contact_id
  where a.channel = 'showing' and coalesce(a.reached, true)
    and a.occurred_at <= now() - make_interval(hours => cfg.showing_hours::int)
  union all
  select f.office_id, 'showing_offer_notes', 'crm_offers', f.id, o.owner_id, o.branch_id,
         (f.created_at at time zone 'Asia/Ulaanbaatar')::date,
         case when f.amount is null or f.valid_until is null or nullif(btrim(f.position), '') is null
                   or nullif(btrim(f.payment_terms), '') is null
                   or (f.status in ('open', 'countered') and f.next_step_date is null) then 'fail'
              else 'pass' end,
         case when f.amount is null then 'Саналын дүн бүртгэгдээгүй'
              when f.valid_until is null then 'Саналын хүчинтэй хугацаа бүртгэгдээгүй'
              when nullif(btrim(f.position), '') is null then 'Талуудын байр суурь бүртгэгдээгүй'
              when nullif(btrim(f.payment_terms), '') is null then 'Төлбөрийн нөхцөл бүртгэгдээгүй'
              when f.status in ('open', 'countered') and f.next_step_date is null
                then 'Саналын дараагийн алхмын огноо бүртгэгдээгүй' end,
         o.opp_label || ' · үнийн санал'
  from public.crm_offers f
  join opp_base o on o.id = f.opportunity_id
),
-- 10. Алдсан шалтгаан
q_lost as (
  select o.office_id, 'lost_reason', 'crm_opportunities', o.id, o.owner_id, o.branch_id,
         (coalesce(h.closed_at, o.updated_at) at time zone 'Asia/Ulaanbaatar')::date,
         case when o.lost_reason_id is null then 'fail'
              when coalesce(lr.requires_note, false) and nullif(btrim(o.lost_note), '') is null then 'fail'
              else 'pass' end,
         case when o.lost_reason_id is null then 'Алдсан шалтгаан бүртгэгдээгүй'
              when coalesce(lr.requires_note, false) and nullif(btrim(o.lost_note), '') is null
                then 'Алдсан шалтгааны тайлбар дутуу' end,
         o.opp_label
  from opp_base o
  left join public.crm_lookups lr on lr.id = o.lost_reason_id
  left join lateral (
    select max(sh.entered_at) as closed_at
    from public.crm_stage_history sh join public.crm_stages ts on ts.id = sh.to_stage_id
    where sh.opportunity_id = o.id and ts.terminal_state = 'lost'
  ) h on true
  where o.state = 'lost'
),
-- 11. Хэлцлийн оролцогчдын үүрэг бүрэн
q_roles as (
  select t.office_id, 'txn_roles', 'crm_transactions', t.id, o.owner_id, o.branch_id,
         coalesce(t.contracted_on, t.opened_on, (t.created_at at time zone 'Asia/Ulaanbaatar')::date),
         case when r.agent_roles = 0 or r.parties = 0 or r.bad_split > 0 then 'fail' else 'pass' end,
         case when r.agent_roles = 0 then 'Агентын урамшууллын үүрэг бүртгэгдээгүй'
              when r.parties = 0 then 'Хэлцлийн талууд бүртгэгдээгүй'
              when r.bad_split > 0 then 'Хамтарсан үүргийн хуваарилалт 100% биш' end,
         t.number
  from public.crm_transactions t
  left join opp_base o on o.id = t.opportunity_id
  cross join lateral (
    select
      (select count(*) from public.crm_transaction_agent_roles ar where ar.transaction_id = t.id) as agent_roles,
      (select count(*) from public.crm_transaction_parties tp where tp.transaction_id = t.id) as parties,
      (select count(*) from (
         select ar.role
         from public.crm_transaction_agent_roles ar
         where ar.transaction_id = t.id
         group by ar.role
         having count(*) > 1
            and (bool_or(ar.split_pct is null) or abs(coalesce(sum(ar.split_pct), 0) - 100) > 0.01)
       ) bad) as bad_split
  ) r
  where t.status in ('contract', 'payment', 'closed')
),
-- 12. Харилцагчийн мэдээллийн ашиглалт бодлогод нийцсэн
q_data as (
  select c.office_id, 'data_use', 'crm_contacts', c.id, coalesce(c.lead_owner, c.created_by), c.branch_id, null::date,
         case when c.consent = 'declined' and u.after_decline > 0 then 'fail'
              when c.consent = 'not_asked' and c.created_at < now() - make_interval(days => cfg.consent_days::int) then 'fail'
              else 'pass' end,
         case when c.consent = 'declined' and u.after_decline > 0
                then 'Татгалзсаны дараа ' || u.after_decline || ' удаа санал, зурвас илгээсэн'
              when c.consent = 'not_asked' and c.created_at < now() - make_interval(days => cfg.consent_days::int)
                then 'Мэдээлэл ашиглах зөвшөөрөл асуугаагүй' end,
         c.name
  from contact_name c
  join cfg on cfg.office_id = c.office_id
  cross join lateral (
    select count(*) as after_decline
    from public.crm_activities a
    where a.contact_id = c.id and a.channel in ('chat', 'email')
      and c.consent_at is not null and a.occurred_at > c.consent_at
  ) u
  where c.lifecycle in ('new', 'active')
)
select * from q_dup
union all select * from q_owner
union all select * from q_source
union all select * from q_grade
union all select * from q_profile
union all select * from q_contact
union all select * from q_next
union all select * from q_stage
union all select * from q_notes
union all select * from q_lost
union all select * from q_roles
union all select * from q_data;

-- Агент бүрийн өгөгдлийн чанарын хувь (§6.25.6, §6.31, §8.3 «Чанар»).
create or replace view public.crm_v_agent_data_quality
with (security_invoker = on) as
with per as (
  select office_id, agent_id, criterion,
         count(*) as checked,
         count(*) filter (where result = 'pass') as passed
  from public.crm_v_quality_checks
  where agent_id is not null
  group by office_id, agent_id, criterion
)
select office_id, agent_id,
       sum(checked)::int as checked,
       sum(passed)::int as passed,
       round(100.0 * sum(passed) / nullif(sum(checked), 0), 1) as quality_pct,
       jsonb_object_agg(criterion, jsonb_build_object('checked', checked, 'passed', passed)) as by_criterion
from per
group by office_id, agent_id;

-- Оффис/салбарын шалгуур бүрийн дүн (§8.5(8) «CRM-ийн нийцэл»; эзэмшигчгүй мөр ч орно).
create or replace view public.crm_v_quality_summary
with (security_invoker = on) as
select office_id, branch_id, criterion,
       count(*)::int as total,
       count(*) filter (where result = 'pass')::int as passed
from public.crm_v_quality_checks
group by office_id, branch_id, criterion;

revoke select on public.crm_v_quality_checks from anon, public;
revoke select on public.crm_v_agent_data_quality from anon, public;
revoke select on public.crm_v_quality_summary from anon, public;
grant select on public.crm_v_quality_checks to authenticated;
grant select on public.crm_v_agent_data_quality to authenticated;
grant select on public.crm_v_quality_summary to authenticated;

-- ── 4. Чанарын аудит ──

create table if not exists public.crm_quality_audits (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  scope text not null default 'office',
  branch_id uuid references public.crm_branches(id),
  agent_id uuid references public.profiles(id),
  status text not null default 'in_review',
  sample_per_criterion int not null,
  population jsonb not null default '{}',
  score numeric(5,1),
  checked_count int,
  passed_count int,
  summary text,
  cancel_reason text,
  auditor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint crm_qa_period check (period_end >= period_start),
  constraint crm_qa_scope check (scope in ('office', 'branch', 'agent')),
  constraint crm_qa_scope_ref check (
    (scope <> 'branch' or branch_id is not null) and (scope <> 'agent' or agent_id is not null)),
  constraint crm_qa_status check (status in ('in_review', 'completed', 'cancelled')),
  constraint crm_qa_sample check (sample_per_criterion between 1 and 200),
  constraint crm_qa_score check (score is null or (score >= 0 and score <= 100))
);
create index if not exists crm_qa_office_idx on public.crm_quality_audits (office_id, created_at desc);

create table if not exists public.crm_quality_audit_items (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  audit_id uuid not null references public.crm_quality_audits(id) on delete cascade,
  criterion text not null,
  entity text not null,
  entity_id uuid not null,
  agent_id uuid references public.profiles(id),
  label text,
  auto_result text not null,
  auto_reason text,
  result text,
  note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  fix_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_qai_criterion check (criterion in (
    'duplicates', 'owner', 'source', 'grade', 'need_profile', 'last_contact', 'next_step',
    'stage_evidence', 'showing_offer_notes', 'lost_reason', 'txn_roles', 'data_use')),
  constraint crm_qai_auto check (auto_result in ('pass', 'fail')),
  constraint crm_qai_result check (result is null or result in ('pass', 'fail', 'na'))
);
create index if not exists crm_qai_audit_idx on public.crm_quality_audit_items (audit_id, criterion);
create index if not exists crm_qai_agent_idx on public.crm_quality_audit_items (office_id, agent_id);

-- Хаагдсан аудит өөрчлөгдөхгүй; мөрийн дүнг зөвхөн хянаж буй аудитад.
create or replace function public.crm_quality_audit_guard()
returns trigger language plpgsql as $$
begin
  if old.status <> 'in_review' then
    raise exception 'CRM_QA: аудит хаагдсан тул өөрчлөхгүй';
  end if;
  if new.office_id is distinct from old.office_id or new.auditor_id is distinct from old.auditor_id
     or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
     or new.scope is distinct from old.scope or new.population is distinct from old.population then
    raise exception 'CRM_QA: аудитын хүрээ, түүвэр өөрчлөгдөхгүй';
  end if;
  return new;
end $$;

drop trigger if exists crm_qa_guard on public.crm_quality_audits;
create trigger crm_qa_guard before update on public.crm_quality_audits
  for each row execute function public.crm_quality_audit_guard();

create or replace function public.crm_quality_item_guard()
returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from public.crm_quality_audits where id = old.audit_id;
  if new.audit_id is distinct from old.audit_id or new.entity_id is distinct from old.entity_id
     or new.criterion is distinct from old.criterion or new.auto_result is distinct from old.auto_result
     or new.agent_id is distinct from old.agent_id then
    raise exception 'CRM_QA: түүврийн мөр өөрчлөгдөхгүй';
  end if;
  if v_status <> 'in_review'
     and (new.result is distinct from old.result or new.note is distinct from old.note) then
    raise exception 'CRM_QA: аудит хаагдсан тул дүнг өөрчлөхгүй';
  end if;
  return new;
end $$;

drop trigger if exists crm_qai_guard on public.crm_quality_audit_items;
create trigger crm_qai_guard before update on public.crm_quality_audit_items
  for each row execute function public.crm_quality_item_guard();

alter table public.crm_quality_audits enable row level security;
alter table public.crm_quality_audit_items enable row level security;

-- Харах: Үйл ажиллагаа-ЧМТ, Борлуулалт хариуцсан захирал, CEO, Системийн админ
-- бүгдийг; агент, багийн ахлагч өөрийн/багийнхаа мөрийг (RACI: C). Бичих — RPC.
drop policy if exists crm_quality_audits_select on public.crm_quality_audits;
create policy crm_quality_audits_select on public.crm_quality_audits for select
  using (office_id = (select public.crm_office_id())
         and ((select public.has_crm_role('ops_qc', 'sales_director', 'ceo', 'sysadmin'))
              or exists (select 1 from public.crm_quality_audit_items i
                         where i.audit_id = crm_quality_audits.id
                           and (i.agent_id = (select auth.uid()) or public.crm_is_team_of(i.agent_id)))));

drop policy if exists crm_quality_audit_items_select on public.crm_quality_audit_items;
create policy crm_quality_audit_items_select on public.crm_quality_audit_items for select
  using (office_id = (select public.crm_office_id())
         and ((select public.has_crm_role('ops_qc', 'sales_director', 'ceo', 'sysadmin'))
              or agent_id = (select auth.uid())
              or (agent_id is not null and public.crm_is_team_of(agent_id))));

-- Аудит эхлүүлэх: хүрээний бүх бүртгэлийн автомат дүн + шалгуур бүрээс санамсаргүй түүвэр.
create or replace function public.crm_quality_audit_start(
  p_period_start date, p_period_end date, p_scope text default 'office',
  p_branch uuid default null, p_agent uuid default null, p_sample int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_sample int;
  v_pop jsonb;
  v_id uuid;
begin
  if auth.uid() is null or v_office is null then
    raise exception 'CRM_QA: нэвтэрнэ үү';
  end if;
  if not public.has_crm_role('ops_qc', 'sysadmin') then
    raise exception 'CRM_QA: чанарын аудитыг Үйл ажиллагаа-ЧМТ хийнэ';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'CRM_QA: аудитын хугацаа буруу';
  end if;
  if coalesce(p_scope, '') not in ('office', 'branch', 'agent') then
    raise exception 'CRM_QA: аудитын хүрээ буруу';
  end if;
  if p_scope = 'branch' and not exists (
       select 1 from public.crm_branches b where b.id = p_branch and b.office_id = v_office) then
    raise exception 'CRM_QA: салбар сонгоно уу';
  end if;
  if p_scope = 'agent' and not exists (
       select 1 from public.crm_staff s where s.profile_id = p_agent and s.office_id = v_office) then
    raise exception 'CRM_QA: агент сонгоно уу';
  end if;
  if exists (
       select 1 from public.crm_quality_audits a
       where a.office_id = v_office and a.status = 'in_review' and a.scope = p_scope
         and a.branch_id is not distinct from (case when p_scope = 'branch' then p_branch end)
         and a.agent_id is not distinct from (case when p_scope = 'agent' then p_agent end)) then
    raise exception 'CRM_QA: ижил хүрээний хянагдаж буй аудит бий — эхлээд түүнийг дуусгана уу';
  end if;

  v_sample := coalesce(p_sample,
    public.crm_setting_num(v_office, 'quality_audit', array['sample_per_criterion'], 10)::int);
  v_sample := greatest(1, least(200, v_sample));

  select coalesce(jsonb_object_agg(criterion, jsonb_build_object('total', total, 'passed', passed)), '{}'::jsonb)
  into v_pop
  from (
    select q.criterion, count(*) as total, count(*) filter (where q.result = 'pass') as passed
    from public.crm_v_quality_checks q
    where q.office_id = v_office
      and (p_scope <> 'branch' or q.branch_id = p_branch)
      and (p_scope <> 'agent' or q.agent_id = p_agent)
      and (q.occurred_on is null or q.occurred_on between p_period_start and p_period_end)
    group by q.criterion
  ) x;

  insert into public.crm_quality_audits (office_id, period_start, period_end, scope, branch_id, agent_id,
                                         sample_per_criterion, population, auditor_id)
  values (v_office, p_period_start, p_period_end, p_scope,
          case when p_scope = 'branch' then p_branch end,
          case when p_scope = 'agent' then p_agent end,
          v_sample, v_pop, auth.uid())
  returning id into v_id;

  insert into public.crm_quality_audit_items (office_id, audit_id, criterion, entity, entity_id, agent_id,
                                              label, auto_result, auto_reason)
  select v_office, v_id, s.criterion, s.entity, s.entity_id, s.agent_id, left(s.label, 200), s.result, s.reason
  from (
    select q.*, row_number() over (partition by q.criterion order by random()) as rn
    from public.crm_v_quality_checks q
    where q.office_id = v_office
      and (p_scope <> 'branch' or q.branch_id = p_branch)
      and (p_scope <> 'agent' or q.agent_id = p_agent)
      and (q.occurred_on is null or q.occurred_on between p_period_start and p_period_end)
  ) s
  where s.rn <= v_sample;

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value)
  values (v_office, auth.uid(), 'crm_quality_audits', v_id, 'start',
          jsonb_build_object('scope', p_scope, 'period_start', p_period_start, 'period_end', p_period_end,
                             'sample', v_sample));
  return v_id;
end $$;

-- Мөрийг гараар батлах: автомат дүнгээс өөр шийдвэрт тайлбар заавал.
create or replace function public.crm_quality_audit_review(p_item uuid, p_result text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select it.id, it.auto_result, a.office_id, a.status
  into i
  from public.crm_quality_audit_items it join public.crm_quality_audits a on a.id = it.audit_id
  where it.id = p_item;
  if i.id is null or i.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM_QA: аудитын мөр олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc', 'sysadmin') then
    raise exception 'CRM_QA: аудитын дүнг Үйл ажиллагаа-ЧМТ батална';
  end if;
  if i.status <> 'in_review' then
    raise exception 'CRM_QA: аудит хаагдсан';
  end if;
  if coalesce(p_result, '') not in ('pass', 'fail', 'na') then
    raise exception 'CRM_QA: дүн буруу';
  end if;
  if p_result <> i.auto_result and nullif(btrim(p_note), '') is null then
    raise exception 'CRM_QA: автомат шалгалтаас өөр дүнд тайлбар заавал';
  end if;
  update public.crm_quality_audit_items
  set result = p_result, note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_item;
end $$;

-- Аудит дуусгах: оноо = тэнцсэн / (тэнцсэн + тэнцээгүй) × 100; «Хамааралгүй» тооцохгүй.
create or replace function public.crm_quality_audit_complete(p_audit uuid, p_summary text, p_accept_rest boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare a record; v_open int; v_pass int; v_fail int; v_score numeric;
begin
  select * into a from public.crm_quality_audits where id = p_audit;
  if a.id is null or a.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM_QA: аудит олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc', 'sysadmin') then
    raise exception 'CRM_QA: аудитыг Үйл ажиллагаа-ЧМТ дуусгана';
  end if;
  if a.status <> 'in_review' then
    raise exception 'CRM_QA: аудит аль хэдийн хаагдсан';
  end if;
  if nullif(btrim(p_summary), '') is null then
    raise exception 'CRM_QA: аудитын дүгнэлт заавал';
  end if;
  if p_accept_rest then
    update public.crm_quality_audit_items
    set result = auto_result, reviewed_by = auth.uid(), reviewed_at = now()
    where audit_id = p_audit and result is null;
  end if;
  select count(*) filter (where result is null),
         count(*) filter (where result = 'pass'),
         count(*) filter (where result = 'fail')
  into v_open, v_pass, v_fail
  from public.crm_quality_audit_items where audit_id = p_audit;
  if v_open > 0 then
    raise exception 'CRM_QA: % мөр хянагдаагүй байна', v_open;
  end if;
  v_score := case when v_pass + v_fail > 0 then round(100.0 * v_pass / (v_pass + v_fail), 1) end;
  update public.crm_quality_audits
  set status = 'completed', score = v_score, checked_count = v_pass + v_fail, passed_count = v_pass,
      summary = btrim(p_summary), completed_at = now()
  where id = p_audit;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, new_value, reason)
  values (a.office_id, auth.uid(), 'crm_quality_audits', p_audit, 'complete',
          jsonb_build_object('score', v_score, 'passed', v_pass, 'failed', v_fail), btrim(p_summary));
  return v_score;
end $$;

create or replace function public.crm_quality_audit_cancel(p_audit uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.crm_quality_audits where id = p_audit;
  if a.id is null or a.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM_QA: аудит олдсонгүй';
  end if;
  if not public.has_crm_role('ops_qc', 'sysadmin') then
    raise exception 'CRM_QA: аудитыг Үйл ажиллагаа-ЧМТ цуцална';
  end if;
  if a.status <> 'in_review' then
    raise exception 'CRM_QA: аудит аль хэдийн хаагдсан';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'CRM_QA: цуцлах шалтгаан заавал';
  end if;
  update public.crm_quality_audits set status = 'cancelled', cancel_reason = btrim(p_reason), completed_at = now()
  where id = p_audit;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, reason)
  values (a.office_id, auth.uid(), 'crm_quality_audits', p_audit, 'cancel', btrim(p_reason));
end $$;

revoke execute on function public.crm_kpi_pipeline_in(uuid, text, text) from anon, public;
revoke execute on function public.crm_quality_audit_start(date, date, text, uuid, uuid, int) from anon, public;
revoke execute on function public.crm_quality_audit_review(uuid, text, text) from anon, public;
revoke execute on function public.crm_quality_audit_complete(uuid, text, boolean) from anon, public;
revoke execute on function public.crm_quality_audit_cancel(uuid, text) from anon, public;
grant execute on function public.crm_kpi_pipeline_in(uuid, text, text) to authenticated;
grant execute on function public.crm_quality_audit_start(date, date, text, uuid, uuid, int) to authenticated;
grant execute on function public.crm_quality_audit_review(uuid, text, text) to authenticated;
grant execute on function public.crm_quality_audit_complete(uuid, text, boolean) to authenticated;
grant execute on function public.crm_quality_audit_cancel(uuid, text) to authenticated;

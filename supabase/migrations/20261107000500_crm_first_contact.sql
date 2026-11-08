-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U2 crm-sla-automation), 1/3.
-- Эхний утга бүхий холболт (§6.4, §6.26, §7(1)):
--
--   • crm_activities.reached — холбогдсон эсэх (Ш3: «утга бүхий холболт» =
--     хариу авсан бүртгэл). null = хуучин бүртгэл / тодорхойгүй → холбогдсон
--     гэж тооцно (буцаах нийцэл). false = «Холбогдож чадаагүй» — SLA зогсохгүй.
--   • crm_leads.first_contact_at — анхны утга бүхий холболтын мөч, НЭГ удаа
--     (trigger тавина, дараа нь өөрчлөгдөхгүй). SLA биелэлтийг үүгээр хэмжинэ;
--     last_contact_at дараагийн холболт бүрд дарагддаг тул хэмжүүрт тохирохгүй.
--   • Утга бүхий холболт бүртгэгдэхэд эзэмшлийн хамгаалалт сэргэнэ (§6.26).
--   • crm_v_lead_funnel — sla_met/sla_total first_contact_at-аар,
--     first_contact_avg_min (R1: хариу өгөх хурд, минутаар) нэмэгдсэн.
--   • crm_v_kpi_monthly — sla_met/sla_total first_contact_at-аар.
--   • Ажлын бус цагийн дарааллыг нэг удаа цэвэрлэнэ: эзэмшигчгүй нээлттэй
--     сэжим бүр дараалалд, хоцрогдсон мөр дарааллаас хасагдана.
-- ============================================================

-- ── Баганууд ──

alter table public.crm_activities
  add column if not exists reached boolean;
comment on column public.crm_activities.reached is
  '§6.4 холбогдсон эсэх: true = утга бүхий холболт, false = холбогдож чадаагүй, null = тодорхойгүй (холбогдсон гэж тооцно)';

alter table public.crm_leads
  add column if not exists first_contact_at timestamptz;
comment on column public.crm_leads.first_contact_at is
  '§6.4/§7(1) анхны утга бүхий холболтын мөч — нэг удаа тавигдана (crm_activity_first_contact trigger)';

create index if not exists crm_leads_first_contact_idx
  on public.crm_leads (office_id, first_contact_due_at)
  where first_contact_at is null and status in ('new', 'active');

-- ── Нөхөн бөглөлт: хамгийн эртний (даалгавар биш) үйл ажиллагаа, эсвэл хуучин
--    «эхний холболт» товчоор тавигдсан last_contact_at ──

update public.crm_leads l
set first_contact_at = coalesce(
      (select min(a.occurred_at)
         from public.crm_activities a
        where a.lead_id = l.id
          and a.channel <> 'task'
          and a.reached is distinct from false),
      l.last_contact_at)
where l.first_contact_at is null
  and (l.last_contact_at is not null
       or exists (select 1 from public.crm_activities a
                   where a.lead_id = l.id and a.channel <> 'task'));

-- ── Trigger: утга бүхий холболт → first_contact_at (нэг удаа) + хамгаалалт ──

create or replace function public.crm_activity_first_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is null or new.channel = 'task' or new.reached is false then
    return new;
  end if;
  update public.crm_leads
     set first_contact_at = coalesce(first_contact_at, least(new.occurred_at, now())),
         unprotected = false
   where id = new.lead_id
     and (first_contact_at is null or unprotected);
  return new;
end $$;

revoke execute on function public.crm_activity_first_contact() from public, anon, authenticated;

drop trigger if exists crm_activities_first_contact on public.crm_activities;
create trigger crm_activities_first_contact
  after insert on public.crm_activities
  for each row execute function public.crm_activity_first_contact();

-- first_contact_at тавигдсаны дараа өөрчлөгдөхгүй (хэмжүүрийг гараар засах замгүй).
create or replace function public.crm_lead_first_contact_guard()
returns trigger language plpgsql as $$
begin
  if old.first_contact_at is not null
     and new.first_contact_at is distinct from old.first_contact_at then
    raise exception 'CRM: эхний холболтын огноо нэг удаа бүртгэгдэнэ, засах боломжгүй';
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_first_contact_guard on public.crm_leads;
create trigger crm_leads_first_contact_guard
  before update of first_contact_at on public.crm_leads
  for each row execute function public.crm_lead_first_contact_guard();

-- ── Тайлангийн view: SLA биелэлт first_contact_at-аар ──

create or replace view public.crm_v_lead_funnel
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
                     and l.first_contact_at is not null
                     and l.first_contact_at <= l.first_contact_due_at) as sla_met,
  count(*) filter (where l.first_contact_due_at is not null
                     and (l.first_contact_at is not null or l.first_contact_due_at < now())) as sla_total,
  round(avg(extract(epoch from (l.first_contact_at - coalesce(l.received_at, l.created_at))) / 60.0)
          filter (where l.first_contact_at is not null
                    and l.first_contact_at >= coalesce(l.received_at, l.created_at)), 1)
                                                                     as first_contact_avg_min
from l2 l
left join public.crm_lookups src on src.id = l.source_id
group by l.office_id, date_trunc('month', l.created_at), src.code, src.label;

-- crm_v_kpi_monthly — зөвхөн leadm хэсгийн 2 мөрийг солино (бусад тодорхойлолт
-- хэвээр). Хэв загвар олдохгүй бол алдаа өгч, migration буцна.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_viewdef('public.crm_v_kpi_monthly'::regclass);
  v_new := replace(v_def,
    '(l_1.last_contact_at IS NOT NULL) AND (l_1.last_contact_at <= l_1.first_contact_due_at)',
    '(l_1.first_contact_at IS NOT NULL) AND (l_1.first_contact_at <= l_1.first_contact_due_at)');
  v_new := replace(v_new,
    '((l_1.last_contact_at IS NOT NULL) OR (l_1.first_contact_due_at < now()))',
    '((l_1.first_contact_at IS NOT NULL) OR (l_1.first_contact_due_at < now()))');
  v_new := regexp_replace(v_new, ';\s*$', '');
  if v_new = regexp_replace(v_def, ';\s*$', '') or position('last_contact_at' in v_new) > 0 then
    raise exception 'crm_v_kpi_monthly: SLA хэсгийн хэв загвар олдсонгүй — тодорхойлолтыг гараар шалгана уу';
  end if;
  execute 'create or replace view public.crm_v_kpi_monthly with (security_invoker = on) as ' || v_new;
end $$;

revoke select on public.crm_v_lead_funnel from anon, public;
revoke select on public.crm_v_kpi_monthly from anon, public;
grant select on public.crm_v_lead_funnel to authenticated;
grant select on public.crm_v_kpi_monthly to authenticated;

-- ── Ажлын бус цагийн дарааллыг нэг удаа цэвэрлэх ──
-- Хүчинтэй мөр (эзэмшигчгүй, нээлттэй) дарааллын эрэмбээрээ үлдэж, дараалалд
-- ороогүй эзэмшигчгүй нээлттэй сэжим бүртгэлийн дарааллаар араас нь нэмэгдэнэ.
-- Хугацааг cron хуваарилахдаа дахин тооцно.

insert into public.crm_assignment_state (office_id, scope, queue)
select distinct l.office_id, 'default', '[]'::jsonb
from public.crm_leads l
where l.owner_id is null and l.status in ('new', 'active')
on conflict (office_id, scope) do nothing;

update public.crm_assignment_state s
set queue = coalesce((
      select jsonb_agg(to_jsonb(x.id::text) order by x.ord, x.created_at)
      from (
        select l.id,
               coalesce(min(q.ord), 9223372036854775807) as ord,
               l.created_at
        from public.crm_leads l
        left join jsonb_array_elements_text(s.queue) with ordinality as q(id, ord)
          on q.id = l.id::text
        where l.office_id = s.office_id and l.owner_id is null and l.status in ('new', 'active')
        group by l.id, l.created_at
      ) x
    ), '[]'::jsonb)
where s.scope = 'default';

update public.crm_leads
set first_contact_due_at = null
where owner_id is null and status in ('new', 'active') and first_contact_at is null;

-- ── Автоматжуулалтын босго (§6.15, §6.16, §6.26, §6.28) — БХЗ дараа нь
--    тохиргооны хувилбараар өөрчилнө; байгаа нээлттэй мөрийг дарахгүй ──

do $$
declare
  o record;
  v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    if exists (select 1 from public.crm_settings
               where office_id = o.office_id and key = 'automation_thresholds' and valid_to is null) then
      continue;
    end if;
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;
    insert into public.crm_settings (office_id, key, value, created_by, note)
    values (o.office_id, 'automation_thresholds',
      '{"lead_protection":{"new_no_contact_days":3,"warn_before_days":1},
        "hot_lead_inactive_days":3,
        "showing_feedback_hours":24,
        "showing_feedback_escalate_hours":48,
        "offer_followup_days":1,
        "offer_expiring_days":2,
        "next_step_overdue_escalate_days":3}'::jsonb,
      v_creator, 'PRO-001 v2.1 — автоматжуулалтын анхны босго');
  end loop;
end $$;

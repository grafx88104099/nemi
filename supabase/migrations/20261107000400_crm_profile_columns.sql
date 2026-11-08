-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U1 crm-foundation), 4/4.
-- Хэрэгцээний профайлын шинэ баганууд (§6.7, §6.9), сэжимийн мэдээлэл
-- хүлээн авсан цаг (§6.4), профайлын бүрэн байдал ба нээлттэй сэжимийн
-- оноог шинэ загвараар нэг удаа дахин тооцох (§6.6, §6.7).
--
-- Тооцооны томьёо lib/crm/scoring.ts-тэй ижил (needProfileCompleteness,
-- computeLeadScore — profile дамжуулсан зам). Цаашид апп/cron TS-ээр тооцно.
-- ============================================================

-- ── Багана ──

alter table public.crm_need_profiles
  add column if not exists rooms_target int,
  add column if not exists area_target numeric(10,2),
  add column if not exists decision_maker_id uuid references public.crm_lookups(id),
  add column if not exists decision_maker_involved boolean,
  add column if not exists blocker_id uuid references public.crm_lookups(id),
  add column if not exists blocker_note text,
  add column if not exists budget_overrun_approved boolean not null default false,
  add column if not exists budget_overrun_max numeric(14,2);

comment on column public.crm_need_profiles.rooms_target is '§6.7 сонирхсон өрөөний тоо (rooms_min = наад зах)';
comment on column public.crm_need_profiles.area_target is '§6.7 сонирхсон талбай (area_min = наад зах)';
comment on column public.crm_need_profiles.decision_maker_id is '§6.7 шийдвэр гаргагч (лавлах decision_maker); decision_maker = нэр/тайлбар';
comment on column public.crm_need_profiles.decision_maker_involved is '§6.6 шийдвэр гаргагч оролцсон эсэх';
comment on column public.crm_need_profiles.blocker_id is '§6.7 одоогийн саад (лавлах blocker)';
comment on column public.crm_need_profiles.budget_overrun_approved is '§6.9 дээд төсвөөс хэтрэхийг харилцагч зөвшөөрсөн';
comment on column public.crm_need_profiles.budget_overrun_max is '§6.9 зөвшөөрсөн хэтрэлтийн дээд дүн';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_need_rooms_target') then
    alter table public.crm_need_profiles add constraint crm_need_rooms_target
      check (rooms_target is null or rooms_min is null or rooms_target >= rooms_min);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_need_area_target') then
    alter table public.crm_need_profiles add constraint crm_need_area_target
      check (area_target is null or area_min is null or area_target >= area_min);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_need_budget_order') then
    alter table public.crm_need_profiles add constraint crm_need_budget_order
      check ((budget_min is null or budget_target is null or budget_min <= budget_target)
         and (budget_target is null or budget_target <= budget_max));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_need_budget_overrun') then
    alter table public.crm_need_profiles add constraint crm_need_budget_overrun
      check ((not budget_overrun_approved and budget_overrun_max is null)
          or (budget_overrun_approved and budget_overrun_max is not null and budget_overrun_max >= budget_max));
  end if;
end $$;

create index if not exists crm_need_decision_maker_idx on public.crm_need_profiles (decision_maker_id);
create index if not exists crm_need_blocker_idx on public.crm_need_profiles (blocker_id);

-- §6.4: реферал, хувийн сүлжээний сэжимийг «мэдээлэл авсан өдөрт» бүртгэх
-- хэмжилтийн эх. null = бүртгэсэн мөч (created_at).
alter table public.crm_leads add column if not exists received_at timestamptz;
comment on column public.crm_leads.received_at is '§6.4 сэжимийн мэдээллийг хүлээн авсан мөч (бүртгэлээс өмнө байж болно)';

-- ── Профайлын бүрэн байдал (§6.7: 3+ заавал шаардлага, доод/зорилтот/дээд төсөв) ──

update public.crm_need_profiles np
set completeness_pct = round(100.0 * c.got / 100.0, 1)
from (
  select np2.id,
      (case when np2.goal_id is not null then 8 else 0 end)
    + (case when jsonb_typeof(np2.locations) = 'array' and jsonb_array_length(np2.locations) > 0 then 12 else 0 end)
    + (case when coalesce(cardinality(np2.property_types), 0) > 0 then 10 else 0 end)
    + (case when np2.budget_max > 0 then 10 else 0 end)
    + (case when coalesce(np2.budget_target, 0) > 0 then 4 else 0 end)
    + (case when coalesce(np2.budget_min, 0) > 0 then 4 else 0 end)
    + (case when nullif(trim(np2.financing), '') is not null then 10 else 0 end)
    + (case when coalesce(np2.rooms_min, 0) > 0 or coalesce(np2.area_min, 0) > 0 then 6 else 0 end)
    + (case when nullif(trim(np2.timeline), '') is not null then 10 else 0 end)
    + 12.0 * least(case when jsonb_typeof(np2.must_haves) = 'array' then jsonb_array_length(np2.must_haves) else 0 end, 3) / 3
    + (case when jsonb_typeof(np2.deal_breakers) = 'array' and jsonb_array_length(np2.deal_breakers) > 0 then 4 else 0 end)
    + (case when np2.decision_maker_id is not null or nullif(trim(np2.decision_maker), '') is not null then 6 else 0 end)
    + (case when np2.blocker_id is not null or nullif(trim(np2.blocker), '') is not null then 2 else 0 end)
    + (case when np2.profile_type <> 'tenant' or np2.move_in_date is not null then 2 else 0 end) as got
  from public.crm_need_profiles np2
) c
where c.id = np.id;

-- ── Нээлттэй сэжимийн оноо (§6.6: 6 шалгуур 20/25/20/15/10/10) ──
-- Жинг оффисын хүчинтэй lead_score_weights хувилбараас уншина.

with w as (
  select s.office_id,
         coalesce((s.value ->> 'need_clarity')::numeric, 20)     as w_need,
         coalesce((s.value ->> 'budget_financing')::numeric, 25) as w_budget,
         coalesce((s.value ->> 'timeline')::numeric, 20)         as w_time,
         coalesce((s.value ->> 'decision_maker')::numeric, 15)   as w_dm,
         coalesce((s.value ->> 'engagement')::numeric, 10)       as w_eng,
         coalesce((s.value ->> 'match_readiness')::numeric, 10)  as w_match
  from public.crm_settings s
  where s.key = 'lead_score_weights' and s.valid_to is null
),
prof as (
  select distinct on (np.contact_id) np.*
  from public.crm_need_profiles np
  where np.status = 'active'
  order by np.contact_id, np.created_at desc
),
f as (
  select l.id, l.office_id,
    -- Хэрэгцээ тодорхой: зорилго, төрөл, хэмжээ, 3+ шаардлага, байршил
    case when p.id is null then 0 else (
        (case when p.goal_id is not null then 1 else 0 end)
      + (case when coalesce(cardinality(p.property_types), 0) > 0 then 1 else 0 end)
      + (case when coalesce(p.rooms_min, 0) > 0 or coalesce(p.area_min, 0) > 0 then 1 else 0 end)
      + least(case when jsonb_typeof(p.must_haves) = 'array' then jsonb_array_length(p.must_haves) else 0 end, 3) / 3.0
      + (case when jsonb_typeof(p.locations) = 'array' and jsonb_array_length(p.locations) > 0 then 1 else 0 end)
    ) / 5.0 end as f_need,
    -- Төсөв (0.5) + санхүүжилт (0.5)
    case when p.id is null then 0 else
        0.5 * (case when p.budget_max > 0 then (case when coalesce(p.budget_target, 0) > 0 then 1 else 0.6 end) else 0 end)
      + 0.5 * (case p.financing when 'cash' then 1 when 'mixed' then 0.8 when 'loan' then 0.6 when 'not_ready' then 0.1 else 0 end)
    end as f_budget,
    case p.timeline when '0_30' then 1 when '1_3m' then 0.75 when '3_12m' then 0.4 when '12m_plus' then 0.15 else 0 end as f_time,
    case when p.id is null then 0
         when p.decision_maker_involved then 1
         when p.decision_maker_id is not null or nullif(trim(p.decision_maker), '') is not null then 0.5
         else 0 end as f_dm,
    (
      least(1.0, (select count(*) from public.crm_activities a
                  where a.lead_id = l.id and a.created_at >= now() - interval '30 days') / 8.0)
      + case when l.last_contact_at is null then 0
             else greatest(0.0, least(1.0, 1 - greatest(0, floor(extract(epoch from now() - l.last_contact_at) / 86400) - 3) / 27.0))
        end
    ) / 2.0 as f_eng,
    -- Тохируулгад бэлэн: байршил, төрөл, дээд төсөв, хэмжээ
    case when p.id is null then 0 else (
        (case when jsonb_typeof(p.locations) = 'array' and jsonb_array_length(p.locations) > 0 then 1 else 0 end)
      + (case when coalesce(cardinality(p.property_types), 0) > 0 then 1 else 0 end)
      + (case when p.budget_max > 0 then 1 else 0 end)
      + (case when coalesce(p.rooms_min, 0) > 0 or coalesce(p.area_min, 0) > 0 then 1 else 0 end)
    ) / 4.0 end as f_match
  from public.crm_leads l
  left join prof p on p.contact_id = l.contact_id
  where l.status in ('new', 'active')
),
b as (
  select f.id,
    round(w.w_need * f.f_need, 1)     as need_clarity,
    round(w.w_budget * f.f_budget, 1) as budget_financing,
    round(w.w_time * f.f_time, 1)     as timeline,
    round(w.w_dm * f.f_dm, 1)         as decision_maker,
    round(w.w_eng * f.f_eng, 1)       as engagement,
    round(w.w_match * f.f_match, 1)   as match_readiness
  from f join w on w.office_id = f.office_id
)
update public.crm_leads l
set score = round(b.need_clarity + b.budget_financing + b.timeline + b.decision_maker + b.engagement + b.match_readiness, 1),
    score_breakdown = jsonb_build_object(
      'need_clarity', b.need_clarity,
      'budget_financing', b.budget_financing,
      'timeline', b.timeline,
      'decision_maker', b.decision_maker,
      'engagement', b.engagement,
      'match_readiness', b.match_readiness)
from b
where b.id = l.id;

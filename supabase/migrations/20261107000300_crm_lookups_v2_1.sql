-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U1 crm-foundation), 3/4.
-- Лавлах (§6.3, §6.7, §6.8, §6.11, §6.18, §6.20.5), онооны загварын
-- тохиргооны шинэ хувилбар (§6.6), SLA/эргэн холбогдох давтамжийн бодлого
-- (§6.4, §6.5), шинэ мэдэгдлийн event (§6.28).
--
-- Бүх оффист (crm_lookups-тэй) үйлчилнэ. Хуучин кодыг устгахгүй —
-- is_active=false болгож, харилцагч/сэжим/профайлын холбоосыг шинэ код
-- руу буулгана (FK хэвээр). Дахин тавихад аюулгүй.
-- ============================================================

-- ── Багана ──

alter table public.crm_lookups add column if not exists tag_group text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_lookups_tag_group') then
    alter table public.crm_lookups add constraint crm_lookups_tag_group check (
      tag_group is null
      or tag_group in ('location', 'type', 'price', 'goal', 'financing', 'timeline', 'special')
    );
  end if;
end $$;
comment on column public.crm_lookups.tag_group is
  'kind=tag үед §6.8-ын шошгын бүлэг: location|type|price|goal|financing|timeline|special';

-- Эх сурвалжийн тайлбар сэжимийн түвшинд (§6.3 «Бусад», дижитал сувгийн нарийвчлал).
alter table public.crm_leads add column if not exists source_detail text;

-- ── Лавлахын утгууд ──

create temp table _crm_v21_lookups (
  kind text not null,
  code text not null,
  label text not null,
  requires_note boolean not null default false,
  sort int not null,
  active boolean not null default true,
  tag_group text
) on commit drop;

insert into _crm_v21_lookups (kind, code, label, requires_note, sort, active, tag_group) values
  -- §6.3 Эх сурвалж (10)
  ('lead_source', 'digital',             'Дижитал суваг',                false, 0, true, null),
  ('lead_source', 'referral',            'Санал болголт (реферал)',      false, 1, true, null),
  ('lead_source', 'prospecting',         'Идэвхтэй хайлт',               false, 2, true, null),
  ('lead_source', 'walk_in',             'Оффисоор ирсэн',               false, 3, true, null),
  ('lead_source', 'open_house',          'Нээлттэй үзлэг / арга хэмжээ', false, 4, true, null),
  ('lead_source', 'listing_inquiry',     'Листингийн лавлагаа',          false, 5, true, null),
  ('lead_source', 'personal_network',    'Хувийн сүлжээ',                false, 6, true, null),
  ('lead_source', 'partner',             'Олон улс / түнш',              false, 7, true, null),
  ('lead_source', 'property_management', 'ҮХХ менежмент',                false, 8, true, null),
  ('lead_source', 'other',               'Бусад',                        true,  9, true, null),
  ('lead_source', 'website',             'Цахим хуудас',                 false, 20, false, null),
  ('lead_source', 'facebook',            'Facebook',                     false, 21, false, null),
  ('lead_source', 'instagram',           'Instagram',                    false, 22, false, null),
  ('lead_source', 'phone',               'Утсаар',                       false, 23, false, null),

  -- §6.18 Амжилтгүй хаагдсаны шалтгаан (11)
  ('lost_reason', 'price',              'Үнэ',                          false, 0, true, null),
  ('lost_reason', 'location',           'Байршил',                      false, 1, true, null),
  ('lost_reason', 'property_condition', 'Үл хөдлөхийн нөхцөл байдал',   false, 2, true, null),
  ('lost_reason', 'financing',          'Санхүүжилт',                   false, 3, true, null),
  ('lost_reason', 'postponed',          'Хугацаа',                      false, 4, true, null),
  ('lost_reason', 'competitor',         'Өрсөлдөгч',                    false, 5, true, null),
  ('lost_reason', 'owner_decision',     'Өмчлөгчийн шийдвэр',           false, 6, true, null),
  ('lost_reason', 'no_contact',         'Хариу өгөхгүй болсон',         false, 7, true, null),
  ('lost_reason', 'service_issue',      'Агент, үйлчилгээний асуудал',  false, 8, true, null),
  ('lost_reason', 'needs_changed',      'Шаардлага өөрчлөгдсөн',        false, 9, true, null),
  ('lost_reason', 'other',              'Бусад',                        true, 10, true, null),

  -- §6.11 Эсэргүүцэл
  ('objection', 'price_high', 'Үнэ',           false, 0, true, null),
  ('objection', 'location',   'Байршил',       false, 1, true, null),
  ('objection', 'financing',  'Санхүүжилт',    false, 2, true, null),
  ('objection', 'condition',  'Нөхцөл байдал', false, 3, true, null),
  ('objection', 'timing',     'Хугацаа',       false, 4, true, null),
  ('objection', 'other',      'Бусад',         true,  5, true, null),

  -- §6.7 Зорилго (5)
  ('goal', 'live',       'Өөрөө амьдрах',          false, 0, true, null),
  ('goal', 'invest',     'Хөрөнгө оруулалт',       false, 1, true, null),
  ('goal', 'upgrade',    'Орон сууцаа сайжруулах', false, 2, true, null),
  ('goal', 'first_home', 'Анхны орон сууц',        false, 3, true, null),
  ('goal', 'other',      'Бусад',                  true,  4, true, null),
  ('goal', 'business',   'Бизнесийн зориулалт',    false, 20, false, null),

  -- §6.7 Одоогийн саад (6) + «Саад байхгүй» (профайлын бүрэн байдалд хариулт болгоно)
  ('blocker', 'none',       'Саад байхгүй',                      false, 0, true, null),
  ('blocker', 'price',      'Үнэ',                               false, 1, true, null),
  ('blocker', 'financing',  'Санхүүжилт',                        false, 2, true, null),
  ('blocker', 'timing',     'Хугацаа',                           false, 3, true, null),
  ('blocker', 'family',     'Гэр бүл',                           false, 4, true, null),
  ('blocker', 'sale_first', 'Эхлээд өөрийн хөрөнгөө худалдах',   false, 5, true, null),
  ('blocker', 'other',      'Бусад',                             true,  6, true, null),
  ('blocker', 'loan',       'Зээл хүлээгдэж буй',                false, 20, false, null),
  ('blocker', 'docs',       'Бичиг баримт дутуу',                false, 21, false, null),

  -- §6.7 Шийдвэр гаргагч
  ('decision_maker', 'self',    'Өөрөө',                false, 0, true, null),
  ('decision_maker', 'spouse',  'Гэр бүл хамт',         false, 1, true, null),
  ('decision_maker', 'company', 'Байгууллагын шийдвэр', false, 2, true, null),
  ('decision_maker', 'other',   'Бусад',                true,  3, true, null),

  -- §6.7 Нөхцөл байдал
  ('condition', 'new_build', 'Шинэ',              false, 0, true, null),
  ('condition', 'resale',    'Хуучин',            false, 1, true, null),
  ('condition', 'furnished', 'Тавилгатай',        false, 2, true, null),
  ('condition', 'parking',   'Зогсоолтой',        false, 3, true, null),
  ('condition', 'pet_ok',    'Амьтан зөвшөөрнө',  false, 4, true, null),
  ('condition', 'balcony',   'Тагттай',           false, 5, true, null),

  -- §6.20.5 Даваагийн хурлын саад (6)
  ('sales_obstacle', 'price',        'Үнэ',                         false, 0, true, null),
  ('sales_obstacle', 'owner',        'Өмчлөгч',                     false, 1, true, null),
  ('sales_obstacle', 'financing',    'Санхүүжилт',                  false, 2, true, null),
  ('sales_obstacle', 'documents',    'Баримт бичиг',                false, 3, true, null),
  ('sales_obstacle', 'marketing',    'Маркетинг',                   false, 4, true, null),
  ('sales_obstacle', 'cross_branch', 'Салбар хоорондын дэмжлэг',    false, 5, true, null),

  -- §6.8 Хэрэгцээний шошго (7 бүлэг)
  ('tag', 'loc_yarmag',          'Яармаг',                  false,  0, true, 'location'),
  ('tag', 'loc_nisekh',          'Нисэх',                   false,  1, true, 'location'),
  ('tag', 'loc_khan_uul',        'Хан-Уул',                 false,  2, true, 'location'),
  ('tag', 'loc_bayanzurkh',      'Баянзүрх',                false,  3, true, 'location'),
  ('tag', 'loc_center',          'Төв',                     false,  4, true, 'location'),
  ('tag', 'type_2room',          '2 өрөө',                  false, 10, true, 'type'),
  ('tag', 'type_3room',          '3 өрөө',                  false, 11, true, 'type'),
  ('tag', 'type_house',          'Хашаа байшин',            false, 12, true, 'type'),
  ('tag', 'type_office',         'Оффис',                   false, 13, true, 'type'),
  ('tag', 'type_retail',         'Худалдааны талбай',       false, 14, true, 'type'),
  ('tag', 'price_300_500',       '300–500 сая',             false, 20, true, 'price'),
  ('tag', 'price_500_700',       '500–700 сая',             false, 21, true, 'price'),
  ('tag', 'price_700_1000',      '700 сая–1 тэрбум',        false, 22, true, 'price'),
  ('tag', 'price_1000_plus',     '1 тэрбумаас дээш',        false, 23, true, 'price'),
  ('tag', 'goal_live',           'Өөрөө амьдрах',           false, 30, true, 'goal'),
  ('tag', 'investor',            'Хөрөнгө оруулалт',        false, 31, true, 'goal'),
  ('tag', 'goal_rental_income',  'Түрээсийн орлого',        false, 32, true, 'goal'),
  ('tag', 'goal_business',       'Бизнес',                  false, 33, true, 'goal'),
  ('tag', 'fin_cash',            'Бэлэн мөнгө',             false, 40, true, 'financing'),
  ('tag', 'fin_mortgage',        'Ипотекийн зээл',          false, 41, true, 'financing'),
  ('tag', 'fin_corporate',       'Байгууллага',             false, 42, true, 'financing'),
  ('tag', 'time_0_30',           '0–30 хоног',              false, 50, true, 'timeline'),
  ('tag', 'time_1_3m',           '1–3 сар',                 false, 51, true, 'timeline'),
  ('tag', 'time_3_12m',          '3–12 сар',                false, 52, true, 'timeline'),
  ('tag', 'intl',                'Олон улс',                false, 60, true, 'special'),
  ('tag', 'special_project',     'Төслийн борлуулалт',      false, 61, true, 'special'),
  ('tag', 'special_pm',          'ҮХХ менежмент',           false, 62, true, 'special'),
  ('tag', 'special_high_value',  'Өндөр үнийн дүнтэй',      false, 63, true, 'special'),
  ('tag', 'vip',                 'VIP',                     false, 90, false, null),
  ('tag', 'repeat',              'Давтан үйлчлүүлэгч',      false, 91, false, null);

insert into public.crm_lookups (office_id, kind, code, label, requires_note, sort_order, is_active, tag_group)
select o.office_id, v.kind, v.code, v.label, v.requires_note, v.sort, v.active, v.tag_group
from (select distinct office_id from public.crm_lookups) o
cross join _crm_v21_lookups v
on conflict (office_id, kind, code) do update set
  label = excluded.label,
  requires_note = excluded.requires_note,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  tag_group = excluded.tag_group;

-- ── Хуучин кодын холбоосыг буулгах ──

-- Эх сурвалж: website/facebook/instagram → «Дижитал суваг» (тайлбарт хуучин суваг),
-- phone → «Бусад» (тайлбар «Утсаар», Ш4).
create temp table _crm_v21_src_map on commit drop as
select lo.id as old_id, ln.id as new_id,
       case lo.code
         when 'website' then 'Цахим хуудас'
         when 'facebook' then 'Facebook'
         when 'instagram' then 'Instagram'
         when 'phone' then 'Утсаар'
       end as detail
from public.crm_lookups lo
join public.crm_lookups ln
  on ln.office_id = lo.office_id and ln.kind = 'lead_source'
 and ln.code = case when lo.code = 'phone' then 'other' else 'digital' end
where lo.kind = 'lead_source' and lo.code in ('website', 'facebook', 'instagram', 'phone');

update public.crm_contacts c
set source_id = m.new_id,
    source_detail = coalesce(nullif(trim(c.source_detail), ''), m.detail)
from _crm_v21_src_map m
where c.source_id = m.old_id;

update public.crm_leads l
set source_id = m.new_id,
    source_detail = coalesce(nullif(trim(l.source_detail), ''), m.detail)
from _crm_v21_src_map m
where l.source_id = m.old_id;

-- Зорилго: «Бизнесийн зориулалт» → «Бусад»
update public.crm_need_profiles np
set goal_id = ln.id
from public.crm_lookups lo
join public.crm_lookups ln on ln.office_id = lo.office_id and ln.kind = 'goal' and ln.code = 'other'
where lo.kind = 'goal' and lo.code = 'business' and np.goal_id = lo.id;

-- Шошго: VIP → «Өндөр үнийн дүнтэй»
insert into public.crm_contact_tags (office_id, contact_id, lookup_id)
select t.office_id, t.contact_id, ln.id
from public.crm_contact_tags t
join public.crm_lookups lo on lo.id = t.lookup_id and lo.kind = 'tag' and lo.code = 'vip'
join public.crm_lookups ln on ln.office_id = lo.office_id and ln.kind = 'tag' and ln.code = 'special_high_value'
on conflict do nothing;
delete from public.crm_contact_tags t
using public.crm_lookups lo
where lo.id = t.lookup_id and lo.kind = 'tag' and lo.code = 'vip';

-- ── Тохиргоо: онооны загварын шинэ хувилбар (§6.6) ──
-- Хувилбар засагдахгүй (crm_settings_update_guard) — хуучныг valid_to-оор
-- хааж, шинэ мөр нэмнэ.

create temp table _crm_v21_settings (key text primary key, value jsonb not null, replace_open boolean not null)
on commit drop;

insert into _crm_v21_settings (key, value, replace_open) values
  ('lead_score_weights',
   '{"need_clarity":20,"budget_financing":25,"timeline":20,"decision_maker":15,"engagement":10,"match_readiness":10}',
   true),
  ('lead_score_factors',
   '{"timeline":{"0_30":1,"1_3m":0.75,"3_12m":0.4,"12m_plus":0.15},
     "financing":{"cash":1,"mixed":0.8,"loan":0.6,"not_ready":0.1},
     "budget":{"max_and_target":1,"max_only":0.6},
     "budget_financing_split":{"budget":0.5,"financing":0.5},
     "engagement":{"full_activity_count":8,"fresh_days":3,"stale_days":30},
     "decision_maker":{"involved":1,"known":0.5},
     "must_haves_min":3}',
   false),
  ('sla_policy',
   '{"work_hours":{"start":9,"end":18},
     "by_source":{"default":{"kind":"minutes","minutes":15},
                  "referral":{"kind":"same_day"},
                  "personal_network":{"kind":"same_day"}}}',
   false),
  ('recontact_ranges',
   '{"a":{"min_days":1,"max_days":3,"default_days":3,
          "stage_days":{"interested":2,"offer":1,"negotiation":1,"contract":1,"payment_closing":1,"closing":1}},
     "b":{"min_days":7,"max_days":7,"default_days":7},
     "c":{"min_days":14,"max_days":28,"default_days":21},
     "d":{"min_days":30,"max_days":90,"default_days":60,"via_campaign":true}}',
   false);

do $$
declare
  o record;
  s record;
  v_creator uuid;
  v_open uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    select created_by into v_creator
    from public.crm_settings where office_id = o.office_id
    order by created_at limit 1;

    for s in select * from _crm_v21_settings loop
      select id into v_open
      from public.crm_settings
      where office_id = o.office_id and key = s.key and valid_to is null
      order by valid_from desc limit 1;

      if v_open is null then
        insert into public.crm_settings (office_id, key, value, created_by, note)
        values (o.office_id, s.key, s.value, v_creator, 'PRO-001 v2.1 — анхны утга');
      elsif s.replace_open and (select value from public.crm_settings where id = v_open) is distinct from s.value then
        update public.crm_settings set valid_to = now()
        where office_id = o.office_id and key = s.key and valid_to is null;
        insert into public.crm_settings (office_id, key, value, created_by, note)
        values (o.office_id, s.key, s.value, v_creator, 'PRO-001 v2.1 §6.6 — 6 шалгууртай загвар');
      end if;
    end loop;
  end loop;
end $$;

-- ── Шинэ мэдэгдлийн event (§6.4, §6.15, §6.16, §6.19–6.29) ──
-- Хүлээн авагчийг оффис дараа нь тохируулна; байгаа мөрийг дарахгүй.

insert into public.crm_notification_matrix (office_id, event_code, recipient_roles, channels, mandatory, quiet_hours_exempt)
select o.office_id, e.code, e.roles::public.crm_role[], '{app}', e.mandatory, false
from (select distinct office_id from public.crm_notification_matrix) o
cross join (values
  ('lead_retry_due',           '{agent}',                          true),
  ('lead_no_contact_48h',      '{agent,team_lead}',                true),
  ('hot_lead_inactive',        '{agent,team_lead,sales_director}', true),
  ('lead_unprotected',         '{agent,team_lead}',                false),
  ('showing_feedback_overdue', '{agent,team_lead}',                true),
  ('offer_followup_due',       '{agent}',                          false),
  ('offer_expiring',           '{agent,team_lead}',                true),
  ('payment_verify_due',       '{finance}',                        false),
  ('lead_dispute_opened',      '{team_lead,sales_director,ops_qc}', true),
  ('lead_dispute_decided',     '{agent,team_lead}',                true),
  ('lead_claim_requested',     '{team_lead,sales_director}',       false),
  ('export_requested',         '{ops_qc,sales_director}',          true),
  ('weekly_plan_due',          '{agent}',                          true),
  ('weekly_plan_submitted',    '{team_lead}',                      false),
  ('weekly_plan_returned',     '{agent}',                          true),
  ('weekly_review_due',        '{agent,team_lead}',                true),
  ('sales_meeting_reminder',   '{agent,team_lead,sales_director}', false),
  ('coaching_assigned',        '{agent,team_lead}',                false),
  ('quality_audit_due',        '{ops_qc}',                         false),
  ('quality_fix_assigned',     '{agent,team_lead}',                true)
) as e(code, roles, mandatory)
on conflict (office_id, event_code) do nothing;

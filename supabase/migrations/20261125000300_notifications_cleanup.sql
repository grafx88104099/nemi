-- CRM1-ийн «үхсэн» мэдэгдлүүдийг уншсан болгох (УСТГАХГҮЙ).
--
-- 2026-11-13-нд CRM2 руу шилжсэнээс хойш эдгээр төрлийг ямар ч функц, апп үүсгэдэггүй
-- (pg_proc.prosrc ба app/lib/components-д хайж шалгасан). Хуучин мөрүүдийн холбоос
-- (/agent/crm/leads/<id>, /agent/crm/pipeline/<id>, /office/crm/deals/<id> …) CRM2-т
-- байхгүй бичлэг рүү заадаг ч хонхны уншаагүй тоонд орсоор — уншаагүйн ~47%.
-- 2026-11-25-ны байдлаар уншаагүй: crm_next_step_overdue 30, crm_lead_sla_breach 4,
-- crm_hot_lead_inactive 3, crm_lead_unprotected 3, crm_lead_assigned 1 — нийт 41
-- (бусад CRM1 төрөл аль хэдийн уншигдсан). Хамгийн сүүлийнх 2026-11-13 10:14 (УБ).
--
-- crm_team_added / crm_team_lead нь CRM2-ийн ИДЭВХТЭЙ төрөл (lib/actions/crm-teams.ts,
-- crm_staff_team_sync) — энд ОРОХГҮЙ.
-- Апп талд эдгээрийн холбоосыг lib/crm/notify.ts legacyCrmLink CRM2 руу тааруулна
-- (LEGACY_CRM_NOTIFICATION_TYPES — ижил жагсаалт).
--
-- Давтан ажиллуулахад аюулгүй: зөвхөн read_at IS NULL мөрийг хөндөнө (2 дахь удаад 0 мөр).
-- created_at < 2026-11-25 — энэ миграц бичигдсэнээс хойш үүссэн (хэрэв нэрийг дахин
-- ашиглавал) мөрийг хөндөхгүй.
-- notifications хүснэгтэд trigger байхгүй (шалгасан) — UPDATE өөр үйлдэл өдөөхгүй.

set local lock_timeout = '5s';

-- 1) Эхлээд тоолно (миграцийн логт харагдана).
do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from public.notifications
   where read_at is null
     and created_at < timestamptz '2026-11-25 00:00:00+08'
     and type = any (array[
       'crm_next_step_overdue', 'crm_lead_sla_breach', 'crm_hot_lead_inactive',
       'crm_lead_unprotected', 'crm_lead_assigned', 'crm_offer_followup_due',
       'crm_aml_threshold_due', 'crm_arrears_step', 'crm_monthly_record_due'
     ]);
  raise notice 'notifications_cleanup: CRM1-ийн уншаагүй мэдэгдэл % мөрийг уншсан болгоно', v_n;
end $$;

-- 2) Уншсан болгоно (мөр, холбоос, бичвэр хэвээр — түүх хадгалагдана).
update public.notifications
   set read_at = now()
 where read_at is null
   and created_at < timestamptz '2026-11-25 00:00:00+08'
   and type = any (array[
     'crm_next_step_overdue', 'crm_lead_sla_breach', 'crm_hot_lead_inactive',
     'crm_lead_unprotected', 'crm_lead_assigned', 'crm_offer_followup_due',
     'crm_aml_threshold_due', 'crm_arrears_step', 'crm_monthly_record_due'
   ]);

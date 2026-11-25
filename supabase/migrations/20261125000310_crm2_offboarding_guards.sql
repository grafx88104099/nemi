-- CRM2-ийн «гарах урсгал» (crm_staff.offboarding)-ыг бодитоор мөрдөх.
--
-- Өмнө: offboarding тугийг зөвхөн CRM1-ийн функцууд уншдаг байсан; crm2_* огт
-- хардаггүй тул гарч буй хүнд шинэ харилцагч, хэлцэл, ажил оноож болдог байв.
-- Хүлээлцэх шалгалт (crm_offboarding_blockers) зөвхөн нээлттэй хэлцэл ба
-- хөрөнгийн үүргийг тоолдог — хариуцсан харилцагч, нээлттэй ажил, шийдвэрлээгүй
-- хүсэлт үлдсэн хүнийг идэвхгүй болгож болдог байв.
--
-- 1) crm2_assert_work_staff — CRM2 «хэнд оноож болох»-ыг шийддэг ганц цэг
--    (crm2_transfer_contact/deal, crm2_apply_contact/deal_transfer,
--    crm2_request_transfer_with_call, crm2_tasks_guard). Гарах урсгалд орсон хүнд
--    БУСАД хүн шинэ ажил/харилцагч/хэлцэл оноохгүй. Үл хамаарах:
--      * өөрөө өөртөө (auth.uid() = p_profile) — гарахаас өмнөх өдрүүдэд өөрийн
--        хэлцэлд дуудлага, дараагийн алхам бүртгэсээр байна;
--      * систем (auth.uid() null — cron/maintenance) — шөнийн ажил унахгүй.
--    Анхаар: менежер гарч буй хүний НЭЭЛТТЭЙ хэлцэлд «дараагийн алхам»-тай дуудлага
--    бүртгэвэл (ажил хэлцлийн хариуцагчид очдог) татгалзана — эхлээд хэлцлийг шилжүүлнэ.
--
-- 2) crm_offboarding_blockers — шинэ түлхүүр (хуучин түлхүүрүүд хэвээр):
--      contacts          — хариуцсан идэвхтэй харилцагч
--      open_tasks        — оноогдсон нээлттэй CRM2 ажил
--      pending_requests  — өөрөө гаргасан, эсвэл түүнд/түүнээс шилжүүлэх шийдвэрлээгүй хүсэлт
--    Апп (lib/crm2/offboarding.ts offboardingBlockMessage) эдгээрийг «Идэвхгүй болгох»,
--    оффисын «Идэвхгүй», нэвтрэлт хаахын өмнө хориг болгон уншина.
--    crm_staff_deactivate_guard (DB trigger)-ийн нийлбэрт ЗОРИУДААР нэмээгүй: оффисын
--    «Хасах» (office_remove_agent) мөн is_active=false болгодог бөгөөд түүний шалгалт
--    (office_agent_removal_check) эдгээрийг жагсаадаггүй — нэмбэл «Хасах» тайлбаргүй унана.
--
-- Хоёулаа CREATE OR REPLACE — гарын үсэг, буцаах төрөл, эрх (grant) өөрчлөгдөхгүй.

set local lock_timeout = '5s';

create or replace function public.crm2_assert_work_staff(p_profile uuid, p_office uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offboarding boolean;
begin
  if p_profile is not null then
    select s.offboarding into v_offboarding
      from public.crm_staff s
     where s.profile_id = p_profile and s.office_id = p_office and s.is_active
       and (s.roles && public.crm2_setting_roles('roles.work', p_office)
            or s.roles && array['sales_director', 'ops_qc', 'ceo']::public.crm_role[]);
  end if;
  -- offboarding NOT NULL тул null = мөр олдсонгүй.
  if p_profile is null or v_offboarding is null then
    raise exception 'CRM: сонгосон хүн хариуцагч болох идэвхтэй агент биш';
  end if;
  if v_offboarding and auth.uid() is not null and auth.uid() <> p_profile then
    raise exception 'CRM: сонгосон хүн гарах урсгалд байгаа тул шинэ ажил, харилцагч, хэлцэл хүлээн авахгүй';
  end if;
end $$;

create or replace function public.crm_offboarding_blockers(p_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  v_deals int := 0;
  v_roles int := 0;
  v_contacts int := 0;
  v_tasks int := 0;
  v_requests int := 0;
begin
  if auth.uid() is not null
     and not public.crm_offboarding_blockers_internal_ok()
     and not public.has_crm_role('sales_director', 'ops_qc', 'sysadmin', 'ceo')
     and not public.is_admin()
     and coalesce(public.jwt_role()::text, '') <> 'office_admin' then
    raise exception 'CRM: танд энэ мэдээллийг харах эрх алга';
  end if;
  select * into s from public.crm_staff where profile_id = p_profile order by is_active desc limit 1;
  if s.id is null then
    return jsonb_build_object('has_staff', false);
  end if;
  if auth.uid() is not null and not public.crm_offboarding_blockers_internal_ok()
     and not public.is_admin() and s.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  select count(*) into v_deals from public.crm2_deals d
   where d.office_id = s.office_id and d.agent_id = p_profile and d.is_open;
  select count(*) into v_roles from public.crm2_properties p
   where p.office_id = s.office_id
     and p.status in ('draft', 'active', 'suspended')
     and p_profile in (p.listing_agent_id, p.contract_agent_id, p.photo_agent_id);
  select count(*) into v_contacts from public.crm2_contacts c
   where c.office_id = s.office_id and c.responsible_agent_id = p_profile and c.status = 'active';
  select count(*) into v_tasks from public.crm2_tasks t
   where t.office_id = s.office_id and t.assignee_id = p_profile and t.status = 'open';
  select count(*) into v_requests from public.crm2_requests r
   where r.office_id = s.office_id and r.status = 'pending'
     and (r.requested_by = p_profile
          or r.payload ->> 'to_agent' = p_profile::text
          or r.payload ->> 'from_agent' = p_profile::text);
  return jsonb_build_object(
    'has_staff', true,
    'staff_id', s.id,
    'office_id', s.office_id,
    'is_active', s.is_active,
    'offboarding', s.offboarding,
    'leads', 0,
    'opportunities', v_deals,
    'property_roles', v_roles,
    'contacts', v_contacts,
    'open_tasks', v_tasks,
    'pending_requests', v_requests,
    'had_ownership', false,
    'approved_act', true
  );
end
$$;

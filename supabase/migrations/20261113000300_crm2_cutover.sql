-- Хуучин CRM-ийн кодыг устгахтай зэрэг тавина.
--   1) Хуучин CRM-ийн pg_cron ажлуудыг түр зогсооно (устгахгүй). Буцаах: cron.alter_job(jobid, active := true).
--   2) tasks дээрх хуучин CRM-ийн trigger-ийг унтраана. Буцаах: alter table public.tasks enable trigger tasks_crm_track_done.
--   3) crm_offboarding_blockers() — ажилтныг идэвхгүй болгох/нэвтрэлт хаахаас өмнөх шалгалт —
--      шинэ CRM-ийн өгөгдлөөр тоолно. JSON түлхүүрүүд хэвээр:
--        leads          = 0 (хуучин сэжим шинэ CRM-д байхгүй)
--        opportunities  = тухайн хүний хариуцсан нээлттэй хэлцэл (crm2_deals)
--        property_roles = ноорог/идэвхтэй/түдгэлзсэн Staff хөрөнгө дээрх 3 үүргийн аль нэг
--        had_ownership  = false, approved_act = true (хүлээлцэх акт шаардахгүй — хуучин актын UI устсан)
--      Буцаах: 20261107001350_crm_rights_retention.sql доторх өмнөх биеийг дахин ажиллуулна.
-- Хуучин crm_* хүснэгт, өгөгдөлд хүрэхгүй.

do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job
     where jobname in ('crm-sla-5min', 'crm-matching-10min', 'crm-accept-expire-5min',
                       'crm-weekly-hourly', 'crm-agent-daily-stats')
  loop
    perform cron.alter_job(j.jobid, active := false);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'tasks_crm_track_done'
              and tgrelid = 'public.tasks'::regclass) then
    execute 'alter table public.tasks disable trigger tasks_crm_track_done';
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
  return jsonb_build_object(
    'has_staff', true,
    'staff_id', s.id,
    'office_id', s.office_id,
    'is_active', s.is_active,
    'offboarding', s.offboarding,
    'leads', 0,
    'opportunities', v_deals,
    'property_roles', v_roles,
    'had_ownership', false,
    'approved_act', true
  );
end
$$;

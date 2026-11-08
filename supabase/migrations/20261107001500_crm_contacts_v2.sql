-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U5 crm-agent-core), 2/2.
-- Харилцагч, профайл, хуучин сэжимийн шилжүүлэлт (§6.1, §6.2, §6.3):
--
--   • crm_contacts.privacy_level — нууцлалын төлөв (§6.2 «зөвшөөрөл ба
--     нууцлалын төлөв»): энгийн / хязгаарлагдмал.
--   • crm_need_profiles.occupant_kind, occupant_note — түрээслэгчийн өрх
--     буюу бизнесийн хэрэгцээ (§6.2).
--   • crm_leads.source_id заавал (CHECK) — эх сурвалжгүй сэжим байхгүй (§6.3).
--   • Хуучин leads / lead_activities мөрийг CRM руу нэг удаа шилжүүлэх
--     скриптийн идемпотент тэмдэг (зөвхөн нэмэлт багана).
-- ============================================================

alter table public.crm_contacts
  add column if not exists privacy_level text not null default 'standard';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_contacts_privacy_level') then
    alter table public.crm_contacts add constraint crm_contacts_privacy_level check
      (privacy_level in ('standard', 'restricted'));
  end if;
end $$;

comment on column public.crm_contacts.privacy_level is
  '§6.2 нууцлалын төлөв: standard = энгийн, restricted = хязгаарлагдмал (зөвхөн эрх бүхий зорилгоор)';

alter table public.crm_need_profiles
  add column if not exists occupant_kind text,
  add column if not exists occupant_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_need_occupant_kind') then
    alter table public.crm_need_profiles add constraint crm_need_occupant_kind check
      (occupant_kind is null or occupant_kind in ('household', 'business'));
  end if;
end $$;

-- Эх сурвалж заавал: хүчинтэй өгөгдөлд null байхгүй бол шууд баталгаажуулна.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_source_req') then
    alter table public.crm_leads add constraint crm_leads_source_req check (source_id is not null) not valid;
    if not exists (select 1 from public.crm_leads where source_id is null) then
      alter table public.crm_leads validate constraint crm_leads_source_req;
    end if;
  end if;
end $$;

-- Хуучин сэжимийн шилжүүлэлтийн тэмдэг (scripts/migrate-legacy-leads.mjs).
alter table public.leads
  add column if not exists migrated_crm_lead_id uuid references public.crm_leads(id) on delete set null,
  add column if not exists migrated_at timestamptz;

alter table public.lead_activities
  add column if not exists migrated_crm_activity_id uuid references public.crm_activities(id) on delete set null;

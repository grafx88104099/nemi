-- ============================================================
-- PMC CRM — Харилцагч, сэжим (M1; DESIGN §2.5, U2 crm-contacts-leads).
-- Гол шийдвэрүүд:
--  • Нэг бодит этгээд = НЭГ crm_contacts мөр («алтан дүрэм»-ийн суурь, F-100);
--    давхардал normalized утас/и-мэйл + display_name trgm-ээр илэрдэг (F-107).
--  • ⭐ Алтан дүрэм (F-125): идэвхтэй сэжим 5 бүрдэлгүй (эзэмшигч, ангилал,
--    сүүлийн холболт, дараагийн алхам + огноо) хадгалагдахгүй — DB CHECK.
--  • Амьдралын мөчлөгийн шилжилт (F-110, ToR 4.1.6) — trigger guard; заагаагүй
--    шилжилт бүгд хориотой, шилжилт бүр audit_log-т.
--  • Эзэмшигч солих зөвхөн crm_reassign_lead() RPC-ээр (зарчим 6) —
--    ownership_history мөр trigger-ээр заавал бичигдэнэ.
--  • Merge зөвхөн ops_qc, crm_merge_contacts() RPC-ээр (F-108/109): холбоотой
--    бичлэгүүд шилжинэ, устгагдах тал soft-archive (merged_into_id).
--  • МУТСТ 12 талбар (crm_contact_aml) — RLS зөвхөн aml_officer (D7);
--    kyc_public_status-ыг definer trigger синклэнэ.
-- ============================================================

-- pg_trgm — display_name-ийн fuzzy давхардлын индекст (Supabase: extensions schema).
create extension if not exists pg_trgm with schema extensions;

-- ── SQL талын утасны нормалчлал (F-102; lib/crm/normalize.ts-тэй ижил дүрэм) ──

create or replace function public.crm_normalize_phone(raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if length(d) < 6 then return ''; end if;
  if length(d) = 8 then return '976' || d; end if;
  return d;
end $$;

-- ════════════════════════════════════════════════════════════
-- ХҮСНЭГТҮҮД
-- ════════════════════════════════════════════════════════════

create table public.crm_contacts (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  number        text not null,                          -- Client ID, crm_next_number('contact'), immutable
  kind          crm_contact_kind not null default 'person',
  last_name     text,
  first_name    text,
  org_name      text,
  display_name  text not null,
  contact_types crm_contact_type[] not null default '{}', -- олон дүр (зарчим 2)
  source_id     uuid references public.crm_lookups(id),   -- эх сурвалж (заавал — app+CHECK)
  source_detail text,                                     -- аян/санал болгогч/листингийн дугаар
  branch_id     uuid references public.crm_branches(id),
  lifecycle     crm_lifecycle not null default 'new',     -- F-110 (шилжилт trigger-ээр)
  consent       crm_consent_status not null default 'not_asked',
  consent_at    timestamptz,
  consent_channel text,                                   -- F-114, F-654
  kyc_public_status crm_kyc_status not null default 'pending', -- denormalized; зөвхөн AML trigger бичнэ
  is_repeat     boolean not null default false,           -- F-754 (≥2 хаагдсан хэлцэл)
  merged_into_id uuid references public.crm_contacts(id), -- merge-ийн дараах soft archive
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (office_id, number),
  constraint crm_contacts_person_name check (kind <> 'person' or first_name is not null),
  constraint crm_contacts_org_name    check (kind <> 'company' or org_name is not null),
  constraint crm_contacts_source_req  check (source_id is not null)   -- эх сурвалж заавал (F-101)
);
create index crm_contacts_office_idx    on public.crm_contacts (office_id, lifecycle);
create index crm_contacts_name_trgm_idx on public.crm_contacts using gin (display_name gin_trgm_ops); -- fuzzy (pg_trgm; schema-г search_path-аар олно — энэ DB-д public-д суусан)
create index crm_contacts_created_by_idx on public.crm_contacts (created_by);

-- Олон утас/и-мэйл, нормалчлагдсан давхардлын индекс (F-102, F-107)
create table public.crm_contact_phones (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  raw        text not null,
  normalized text not null,            -- lib/crm/normalize.ts + SQL crm_normalize_phone()
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_phones_norm_idx    on public.crm_contact_phones (office_id, normalized);
create index crm_phones_contact_idx on public.crm_contact_phones (contact_id);

create table public.crm_contact_emails (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  email      text not null,            -- lowercase (trigger)
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index crm_emails_idx         on public.crm_contact_emails (office_id, email);
create index crm_emails_contact_idx on public.crm_contact_emails (contact_id);

-- Сегментийн шошго — олон утга (F-118/120/122): crm_lookups kind='tag' мөрүүд эх.
create table public.crm_contact_tags (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  lookup_id  uuid not null references public.crm_lookups(id) on delete restrict,
  office_id  uuid not null references public.offices(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (contact_id, lookup_id)
);
create index crm_contact_tags_lookup_idx on public.crm_contact_tags (office_id, lookup_id);

-- МУТСТ 12 талбар — ХЯЗГААРЛАГДМАЛ БҮС (F-115–117). RLS: зөвхөн aml_officer.
create table public.crm_contact_aml (
  contact_id uuid primary key references public.crm_contacts(id) on delete restrict,
  office_id  uuid not null references public.offices(id) on delete restrict,
  kyc_status crm_kyc_status not null default 'pending',
  risk       crm_aml_risk,
  risk_score numeric(5,2),             -- жин 30/25/20/15/10 — crm_settings 'aml_weights'
  pep_status text,                     -- 'no'|'possible'|'confirmed'
  sanctions_checked_at timestamptz,
  sanctions_result text,
  ubo_verified text,                   -- 'yes'|'no'|'na'
  funds_source text,
  funds_evidence_doc_id uuid,
  payment_method text,
  third_party_payer boolean,
  third_party_note text,
  red_flags text[],
  officer_decision text,               -- 'proceed'|'edd'|'suspend'|'reject'
  reporting_status text,               -- 'threshold'|'str'|'none' (хамгийн хязгаарлагдмал)
  next_review_at date,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Merge түүх (F-108/109) — устгагдахгүй
create table public.crm_contact_merges (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  primary_id uuid not null references public.crm_contacts(id),
  merged_id  uuid not null references public.crm_contacts(id),
  secondary_source jsonb,              -- 2 дахь ирэлтийн эх сурвалж/огноо (P-01 алхам 3, «анхны огноо» нотолгоо)
  field_choices jsonb not null,
  decided_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_contact_merges_idx on public.crm_contact_merges (office_id, primary_id);

-- Сэжим (F-100–128). ⭐ Алтан дүрэм энд сахиулагдана.
create table public.crm_leads (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  contact_id    uuid not null references public.crm_contacts(id) on delete restrict,
  branch_id     uuid references public.crm_branches(id),
  owner_id      uuid references public.profiles(id),
  source_id     uuid references public.crm_lookups(id),
  campaign_code text,
  channel_ref   text,                       -- сувгийн танигч (давхардлын тулгалтад)
  status        crm_lifecycle not null default 'new',  -- new|active|recycled|inactive|archived
  grade         crm_lead_grade,
  grade_override_reason text,               -- F-113 гар өөрчлөлтөд шалтгаан
  score         numeric(5,2),
  score_breakdown jsonb,                    -- F-112 задаргаа
  last_contact_at timestamptz,
  next_step     text,
  next_step_task_id uuid references public.tasks(id),
  next_step_date date,
  first_contact_due_at timestamptz,         -- SLA тоолол (ажлын цагийн дараалалтай)
  unprotected   boolean not null default false, -- F-127 «хамгаалалтгүй бүртгэл»
  inactivity_days int not null default 0,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ⭐ АЛТАН ДҮРЭМ (зарчим 5, F-125): идэвхтэй сэжим 5 бүрдэлгүй хадгалагдахгүй
  constraint crm_leads_golden_rule check (
    status <> 'active'
    or (owner_id is not null and grade is not null
        and last_contact_at is not null and next_step is not null and next_step_date is not null)
  )
);
create index crm_leads_owner_idx   on public.crm_leads (office_id, owner_id, status);
create index crm_leads_contact_idx on public.crm_leads (contact_id);   -- crm_can_view_contact() мөр бүрчлэн асуудаг тул ЗААВАЛ
create index crm_leads_next_idx    on public.crm_leads (office_id, next_step_date) where status = 'active';
create index crm_leads_grade_idx   on public.crm_leads (office_id, grade, status);
create index crm_leads_created_by_idx on public.crm_leads (created_by);

-- Эзэмшлийн түүх (зарчим 6, P-10) — эзэмшигч солигдох бүрд trigger бичнэ
create table public.crm_ownership_history (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  entity text not null,                -- 'lead'|'contact'|'property'|'opportunity'|'lease'
  entity_id uuid not null,
  old_owner_id uuid references public.profiles(id),
  new_owner_id uuid references public.profiles(id),
  reason_code text not null,           -- 'sla_breach'|'inactivity'|'client_request'|'zoning'|'offboarding'|'initial'
  note text,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_ownership_entity_idx on public.crm_ownership_history (entity, entity_id, created_at);

create table public.crm_saved_views (   -- F-121 хувийн хадгалсан харагдац
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page text not null,
  name text not null,
  params jsonb not null,
  created_at timestamptz not null default now()
);
create index crm_saved_views_idx on public.crm_saved_views (profile_id, page);

-- ════════════════════════════════════════════════════════════
-- RLS HELPER (§3.1 — хожмын хүснэгт дурддаг тул plpgsql + to_regclass guard)
-- ════════════════════════════════════════════════════════════

-- Харилцагчийг харах эрх: үүсгэгч / сэжимийн эзэмшигч / багийн ахлагч (багийн
-- эзэмшигчээр) / менежер (SD, ops_qc, ceo) / finance, aml_officer (унших) /
-- property_manager (өөрийн үүсгэсэн ба өөрийн сэжимтэй). Marketing энд ОРОХГҮЙ —
-- зөвхөн масктай view (§3.4, U9/000900). Leases/opportunities-ээр тэлэлт нь
-- 000400/000600-д create or replace-ээр өргөтгөгдөнө.
create or replace function public.crm_can_view_contact(c uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  select exists (
    select 1 from public.crm_contacts ct
    where ct.id = c
      and ct.office_id = public.crm_office_id()
      and (
        ct.created_by = auth.uid()
        or public.crm_is_manager()
        or public.has_crm_role('finance', 'aml_officer')
        or exists (
          select 1 from public.crm_leads l
          where l.contact_id = ct.id
            and (l.owner_id = auth.uid()
                 or l.created_by = auth.uid()
                 or (l.owner_id is not null and public.crm_is_team_of(l.owner_id)))
        )
      )
  ) into ok;
  return ok;
end $$;

-- Харилцагчийг ЗАСАХ эрх: үүсгэгч / сэжимийн эзэмшигч / багийн ахлагч / менежер / PM (өөрийнх).
create or replace function public.crm_can_edit_contact(c uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if public.has_crm_role('marketing', 'finance', 'aml_officer', 'sysadmin')
     and not public.crm_is_manager() then
    -- Эдгээр дүр дангаараа бичих эрхгүй (ACC-05/08/11/14)
    return false;
  end if;
  select exists (
    select 1 from public.crm_contacts ct
    where ct.id = c
      and ct.office_id = public.crm_office_id()
      and (
        ct.created_by = auth.uid()
        or public.crm_is_manager()
        or exists (
          select 1 from public.crm_leads l
          where l.contact_id = ct.id
            and (l.owner_id = auth.uid()
                 or (l.owner_id is not null and public.crm_is_team_of(l.owner_id)))
        )
      )
  ) into ok;
  return ok;
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ФУНКЦУУД
-- ════════════════════════════════════════════════════════════

-- Утас: normalized-ыг SQL талд албадан тооцно (app давхардлын шалгалт хийсэн ч эх үнэн энд).
create or replace function public.crm_phone_normalize()
returns trigger language plpgsql as $$
begin
  new.normalized := public.crm_normalize_phone(new.raw);
  if new.normalized = '' then
    raise exception 'CRM: утасны дугаар буруу байна';
  end if;
  return new;
end $$;

-- И-мэйл: lowercase + синтакс (F-103).
create or replace function public.crm_email_normalize()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  if new.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'CRM: и-мэйлийн формат буруу байна';
  end if;
  return new;
end $$;

-- Амьдралын мөчлөгийн шилжилтийн guard (F-110, ToR 4.1.6) — contacts.lifecycle +
-- leads.status хоёуланд (TG_ARGV[0] = баганы нэр). Заагаагүй шилжилт хориотой;
-- дүрийн шалгалт; merge (GUC crm.merge) → archived чөлөөтэй; service role чөлөөтэй.
create or replace function public.crm_lifecycle_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := tg_argv[0];
  o text := (to_jsonb(old) ->> col);
  n text := (to_jsonb(new) ->> col);
  allowed boolean := false;
begin
  if o = n then return new; end if;
  -- merge-ийн soft archive (RPC доторх GUC)
  if coalesce(current_setting('crm.merge', true), '') = '1' and n = 'archived' then
    return new;
  end if;
  if auth.uid() is null then
    allowed := true;  -- service role / cron (Д-27/28/29, integrity)
  elsif o = 'new'      and n = 'active'   then allowed := (select public.crm_my_staff_id()) is not null;
  elsif o = 'active'   and n = 'recycled' then allowed := public.has_crm_role('team_lead', 'sales_director');
  elsif o = 'recycled' and n = 'active'   then allowed := public.has_crm_role('team_lead', 'sales_director');
  elsif o = 'active'   and n = 'inactive' then allowed := (select public.crm_my_staff_id()) is not null;
  elsif o = 'inactive' and n = 'archived' then allowed := public.has_crm_role('ops_qc');
  elsif o = 'inactive' and n = 'active'   then allowed := (select public.crm_my_staff_id()) is not null;
  elsif o = 'new'      and n = 'inactive' then allowed := public.has_crm_role('team_lead', 'sales_director', 'ops_qc'); -- буруу бүртгэл хаах
  else allowed := false;
  end if;
  if not allowed then
    raise exception 'CRM: % → % шилжилт зөвшөөрөгдөөгүй', o, n;
  end if;
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
  values (new.office_id, auth.uid(), tg_table_name, new.id, 'status', col, to_jsonb(o), to_jsonb(n));
  return new;
end $$;

-- Эзэмшигч солигдох бүрд түүх (зарчим 6). Шинээр онооход ('initial') чөлөөтэй;
-- бусад солилт ЗӨВХӨН crm_reassign_lead() RPC (GUC crm.reassign)-аар.
create or replace function public.crm_lead_owner_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare reason text;
begin
  if new.owner_id is not distinct from old.owner_id then return new; end if;
  reason := nullif(current_setting('crm.reason', true), '');
  if old.owner_id is null then
    reason := coalesce(reason, 'initial');
  elsif coalesce(current_setting('crm.reassign', true), '') <> '1' then
    if auth.uid() is null then
      reason := coalesce(reason, 'inactivity'); -- cron-ийн эргэлт
    else
      raise exception 'CRM: эзэмшигчийг зөвхөн шилжүүлэлтийн үйлдлээр (шалтгаантай) солино';
    end if;
  end if;
  insert into public.crm_ownership_history
    (office_id, entity, entity_id, old_owner_id, new_owner_id, reason_code, note, decided_by)
  values
    (new.office_id, 'lead', new.id, old.owner_id, new.owner_id,
     coalesce(reason, 'initial'), nullif(current_setting('crm.reason_note', true), ''), auth.uid());
  return new;
end $$;

-- F-124: сэжимийн гол талбарын өөрчлөлтийн түүх (ангилал, салбар, эх сурвалж).
create or replace function public.crm_lead_field_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grade is distinct from old.grade then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
    values (new.office_id, auth.uid(), 'crm_leads', new.id, 'update', 'grade',
            to_jsonb(old.grade), to_jsonb(new.grade), new.grade_override_reason);
  end if;
  if new.branch_id is distinct from old.branch_id then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_leads', new.id, 'update', 'branch_id',
            to_jsonb(old.branch_id), to_jsonb(new.branch_id));
  end if;
  if new.source_id is distinct from old.source_id then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_leads', new.id, 'update', 'source_id',
            to_jsonb(old.source_id), to_jsonb(new.source_id));
  end if;
  return new;
end $$;

-- F-124: харилцагчийн гол талбарын түүх (зөвшөөрөл, салбар, эх сурвалж).
create or replace function public.crm_contact_field_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.consent is distinct from old.consent then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_contacts', new.id, 'update', 'consent',
            to_jsonb(old.consent), to_jsonb(new.consent));
  end if;
  if new.branch_id is distinct from old.branch_id then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_contacts', new.id, 'update', 'branch_id',
            to_jsonb(old.branch_id), to_jsonb(new.branch_id));
  end if;
  if new.source_id is distinct from old.source_id then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_contacts', new.id, 'update', 'source_id',
            to_jsonb(old.source_id), to_jsonb(new.source_id));
  end if;
  return new;
end $$;

-- D7: kyc_status → crm_contacts.kyc_public_status синк (нийтэд харагдах 4 төлөв).
create or replace function public.crm_aml_sync_public_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_contacts
     set kyc_public_status = new.kyc_status
   where id = new.contact_id;
  return new;
end $$;

-- kyc_public_status-ыг гараар засахыг хориглоно (зөвхөн дээрх синк trigger).
create or replace function public.crm_contact_kyc_guard()
returns trigger language plpgsql as $$
begin
  if new.kyc_public_status is distinct from old.kyc_public_status
     and coalesce(current_setting('crm.kyc_sync', true), '') <> '1' then
    raise exception 'CRM: KYC төлөвийг зөвхөн МУТСТ модуль өөрчилнө';
  end if;
  return new;
end $$;

-- Синк trigger-ээс дуудагдахдаа guard-ыг тойрох GUC тавьдаг wrapper.
create or replace function public.crm_aml_sync_public_status_guarded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('crm.kyc_sync', '1', true);
  update public.crm_contacts
     set kyc_public_status = new.kyc_status
   where id = new.contact_id;
  perform set_config('crm.kyc_sync', '', true);
  return new;
end $$;

-- ════════════════════════════════════════════════════════════
-- RPC-ууд (definer; §2.2 аюулгүйн дүрэм — дотроо эрх, оффис шалгана)
-- ════════════════════════════════════════════════════════════

-- Зарчим 6: сэжимийн эзэмшигч солих ГАНЦ зам. Ш эрх: team_lead (багтаа),
-- sales_director; sysadmin/ops_qc — техник/чанарын шилжүүлэлт.
create or replace function public.crm_reassign_lead(
  p_lead uuid, p_new_owner uuid, p_reason text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if auth.uid() is not null and not public.has_crm_role('team_lead', 'sales_director', 'ops_qc', 'sysadmin') then
    raise exception 'CRM: танд сэжим шилжүүлэх эрх алга';
  end if;
  if p_reason is null or p_reason not in ('sla_breach', 'inactivity', 'client_request', 'zoning', 'offboarding', 'initial') then
    raise exception 'CRM: шилжүүлэлтийн шалтгааны код буруу';
  end if;
  select * into l from public.crm_leads where id = p_lead;
  if l is null then raise exception 'CRM: сэжим олдсонгүй'; end if;
  if auth.uid() is not null and l.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  -- team_lead зөвхөн БАГИЙНХАА сэжимийг шилжүүлнэ
  if auth.uid() is not null
     and public.has_crm_role('team_lead')
     and not public.has_crm_role('sales_director', 'ops_qc', 'sysadmin')
     and l.owner_id is not null
     and not public.crm_is_team_of(l.owner_id) then
    raise exception 'CRM: багийн ахлагч зөвхөн өөрийн багийн сэжимийг шилжүүлнэ';
  end if;
  -- шинэ эзэмшигч идэвхтэй CRM ажилтан байх ёстой
  if not exists (
    select 1 from public.crm_staff s
    where s.profile_id = p_new_owner and s.office_id = l.office_id and s.is_active
  ) then
    raise exception 'CRM: шинэ эзэмшигч идэвхтэй CRM ажилтан биш байна';
  end if;
  perform set_config('crm.reassign', '1', true);
  perform set_config('crm.reason', p_reason, true);
  perform set_config('crm.reason_note', coalesce(p_note, ''), true);
  update public.crm_leads set owner_id = p_new_owner where id = p_lead;
  perform set_config('crm.reassign', '', true);
  perform set_config('crm.reason', '', true);
  perform set_config('crm.reason_note', '', true);
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (l.office_id, auth.uid(), 'crm_leads', p_lead, 'reassign', 'owner_id',
          to_jsonb(l.owner_id), to_jsonb(p_new_owner), p_reason || coalesce(': ' || p_note, ''));
end $$;

-- F-108/109: merge — зөвхөн ops_qc. Холбоотой бүх бичлэг шилжинэ (хожмын
-- хүснэгтүүд to_regclass guard-тай dynamic SQL-ээр — 000400+ үүссэний дараа ч
-- ЭНЭ функц ажиллана). p_choices: {талбар: 'primary'|'merged'}.
create or replace function public.crm_merge_contacts(
  p_primary uuid, p_merged uuid, p_choices jsonb, p_aml_approval_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  prim record; merg record;
  rec record;
  moved jsonb := '{}';
  n bigint;
begin
  if auth.uid() is not null and not public.has_crm_role('ops_qc') then
    raise exception 'CRM: merge хийх эрх зөвхөн Үйл ажиллагаа/ЧМТ-ийн зохицуулагчид бий';
  end if;
  if p_primary = p_merged then raise exception 'CRM: ижил бүртгэл merge хийгдэхгүй'; end if;
  select * into prim from public.crm_contacts where id = p_primary;
  select * into merg from public.crm_contacts where id = p_merged;
  if prim is null or merg is null then raise exception 'CRM: бүртгэл олдсонгүй'; end if;
  if prim.office_id <> merg.office_id then raise exception 'CRM: өөр оффисын бүртгэл'; end if;
  if auth.uid() is not null and prim.office_id is distinct from public.crm_office_id() then
    raise exception 'CRM: оффисын эрхгүй';
  end if;
  if merg.merged_into_id is not null then raise exception 'CRM: аль хэдийн нэгтгэгдсэн бүртгэл'; end if;

  -- F-109: МУТСТ кейстэй бол МУТСТ-ийн ажилтны зөвшөөрлийн тэмдэглэл заавал.
  if to_regclass('public.crm_aml_cases') is not null then
    execute 'select count(*) from public.crm_aml_cases where contact_id in ($1, $2) and status in (''open'', ''investigating'')'
      into n using p_primary, p_merged;
    if coalesce(n, 0) > 0 and nullif(p_aml_approval_note, '') is null then
      raise exception 'CRM: МУТСТ кейстэй бүртгэл — МУТСТ-ийн ажилтны зөвшөөрлийн тэмдэглэл заавал';
    end if;
  end if;
  -- F-109: хоёулаа идэвхтэй түрээсийн гэрээтэй бол гараар шийднэ.
  if to_regclass('public.crm_leases') is not null then
    execute 'select count(distinct x.c) from (
               select tenant_contact_id as c from public.crm_leases where status = ''active'' and tenant_contact_id in ($1, $2)
               union all
               select landlord_contact_id from public.crm_leases where status = ''active'' and landlord_contact_id in ($1, $2)
             ) x'
      into n using p_primary, p_merged;
    if coalesce(n, 0) >= 2 then
      raise exception 'CRM: хоёулаа идэвхтэй гэрээтэй — автоматаар нэгтгэхгүй, гараар шийднэ';
    end if;
  end if;

  -- Утас: давхардаагүйг шилжүүлж, үлдсэнийг устгана.
  update public.crm_contact_phones p set contact_id = p_primary, is_primary = false
   where p.contact_id = p_merged
     and not exists (select 1 from public.crm_contact_phones q
                     where q.contact_id = p_primary and q.normalized = p.normalized);
  delete from public.crm_contact_phones where contact_id = p_merged;
  -- И-мэйл мөн адил.
  update public.crm_contact_emails e set contact_id = p_primary, is_primary = false
   where e.contact_id = p_merged
     and not exists (select 1 from public.crm_contact_emails q
                     where q.contact_id = p_primary and q.email = e.email);
  delete from public.crm_contact_emails where contact_id = p_merged;
  -- Шошго (давхардал PK-аар хамгаалагдсан).
  insert into public.crm_contact_tags (contact_id, lookup_id, office_id)
  select p_primary, lookup_id, office_id from public.crm_contact_tags where contact_id = p_merged
  on conflict do nothing;
  delete from public.crm_contact_tags where contact_id = p_merged;
  -- Сэжим.
  update public.crm_leads set contact_id = p_primary where contact_id = p_merged;

  -- Хожмын миграцийн хүснэгтүүд (байвал л шилжүүлнэ — F-108 «бүх бичлэг»).
  for rec in
    select * from (values
      ('crm_need_profiles',        'contact_id'),
      ('crm_owner_profiles',       'contact_id'),
      ('crm_activities',           'contact_id'),
      ('crm_opportunities',        'contact_id'),
      ('crm_txn_parties',          'contact_id'),
      ('crm_leases',               'tenant_contact_id'),
      ('crm_leases',               'landlord_contact_id'),
      ('crm_properties',           'owner_contact_id'),
      ('crm_nps_surveys',          'contact_id'),
      ('crm_referrals',            'referrer_contact_id'),
      ('crm_complaints',           'contact_id'),
      ('crm_documents',            'contact_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || rec.tbl) is not null then
      begin
        execute format('update public.%I set %I = $1 where %I = $2', rec.tbl, rec.col, rec.col)
          using p_primary, p_merged;
        get diagnostics n = row_count;
        if n > 0 then moved := moved || jsonb_build_object(rec.tbl || '.' || rec.col, n); end if;
      exception when undefined_column then
        null; -- хүснэгт байгаа ч багана өөр нэртэй — тухайн нэгжийн миграци өөрөө зохицуулна
      end;
    end if;
  end loop;

  -- Талбарын сонголт (F-108): 'merged' гэснийг устгагдах талын утгаар солино.
  update public.crm_contacts c set
    last_name     = case when p_choices ->> 'last_name'     = 'merged' then merg.last_name     else c.last_name     end,
    first_name    = case when p_choices ->> 'first_name'    = 'merged' then merg.first_name    else c.first_name    end,
    org_name      = case when p_choices ->> 'org_name'      = 'merged' then merg.org_name      else c.org_name      end,
    display_name  = case when p_choices ->> 'display_name'  = 'merged' then merg.display_name  else c.display_name  end,
    source_id     = case when p_choices ->> 'source_id'     = 'merged' then merg.source_id     else c.source_id     end,
    source_detail = case when p_choices ->> 'source_detail' = 'merged' then merg.source_detail else c.source_detail end,
    branch_id     = case when p_choices ->> 'branch_id'     = 'merged' then merg.branch_id     else c.branch_id     end,
    consent       = case when p_choices ->> 'consent'       = 'merged' then merg.consent       else c.consent       end,
    consent_at    = case when p_choices ->> 'consent'       = 'merged' then merg.consent_at    else c.consent_at    end,
    consent_channel = case when p_choices ->> 'consent'     = 'merged' then merg.consent_channel else c.consent_channel end,
    contact_types = (select coalesce(array_agg(distinct t), '{}')
                     from unnest(c.contact_types || merg.contact_types) t)
  where c.id = p_primary;

  -- Устгагдах тал → soft archive (GUC-ээр lifecycle guard-ыг нээнэ).
  perform set_config('crm.merge', '1', true);
  update public.crm_contacts
     set lifecycle = 'archived', merged_into_id = p_primary
   where id = p_merged;
  perform set_config('crm.merge', '', true);

  -- Merge түүх — «анхны огноо + эх сурвалж» нотолгоо (F-109).
  insert into public.crm_contact_merges (office_id, primary_id, merged_id, secondary_source, field_choices, decided_by)
  values (prim.office_id, p_primary, p_merged,
          jsonb_build_object(
            'merged_number', merg.number,
            'merged_created_at', merg.created_at,
            'merged_source_id', merg.source_id,
            'merged_source_detail', merg.source_detail,
            'earliest_created_at', least(prim.created_at, merg.created_at),
            'moved', moved,
            'aml_approval_note', p_aml_approval_note),
          coalesce(auth.uid(), prim.created_by));

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (prim.office_id, auth.uid(), 'crm_contacts', p_primary, 'merge', null,
          to_jsonb(p_merged), to_jsonb(p_primary), p_aml_approval_note);
end $$;

-- ════════════════════════════════════════════════════════════
-- TRIGGER ЗАЛГАЛТУУД
-- ════════════════════════════════════════════════════════════

create trigger crm_contacts_updated
  before update on public.crm_contacts
  for each row execute function public.crm_set_updated_at();
create trigger crm_contacts_immutable
  before update on public.crm_contacts
  for each row execute function public.crm_protect_immutable('office_id', 'number', 'created_by', 'created_at');
create trigger crm_contacts_lifecycle
  before update of lifecycle on public.crm_contacts
  for each row execute function public.crm_lifecycle_guard('lifecycle');
create trigger crm_contacts_kyc_guard
  before update of kyc_public_status on public.crm_contacts
  for each row execute function public.crm_contact_kyc_guard();
create trigger crm_contacts_field_audit
  after update on public.crm_contacts
  for each row execute function public.crm_contact_field_audit();

create trigger crm_phones_normalize
  before insert or update of raw on public.crm_contact_phones
  for each row execute function public.crm_phone_normalize();
create trigger crm_emails_normalize
  before insert or update of email on public.crm_contact_emails
  for each row execute function public.crm_email_normalize();

create trigger crm_leads_updated
  before update on public.crm_leads
  for each row execute function public.crm_set_updated_at();
create trigger crm_leads_immutable
  before update on public.crm_leads
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'created_by', 'created_at');
create trigger crm_leads_lifecycle
  before update of status on public.crm_leads
  for each row execute function public.crm_lifecycle_guard('status');
create trigger crm_leads_owner_history
  before update of owner_id on public.crm_leads
  for each row execute function public.crm_lead_owner_change();
create trigger crm_leads_field_audit
  after update on public.crm_leads
  for each row execute function public.crm_lead_field_audit();

create trigger crm_contact_aml_sync
  after insert or update of kyc_status on public.crm_contact_aml
  for each row execute function public.crm_aml_sync_public_status_guarded();
create trigger crm_contact_aml_touch
  before update on public.crm_contact_aml
  for each row execute function public.crm_set_updated_at();

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════

alter table public.crm_contacts        enable row level security;
alter table public.crm_contact_phones  enable row level security;
alter table public.crm_contact_emails  enable row level security;
alter table public.crm_contact_tags    enable row level security;
alter table public.crm_contact_aml     enable row level security;
alter table public.crm_contact_merges  enable row level security;
alter table public.crm_leads           enable row level security;
alter table public.crm_ownership_history enable row level security;
alter table public.crm_saved_views     enable row level security;

-- Харилцагч: харах crm_can_view_contact; үүсгэх staff бүгд (created_by=өөрөө);
-- засах crm_can_edit_contact. Marketing → зөвхөн масктай view (§3.4). delete ҮГҮЙ.
create policy crm_contacts_select on public.crm_contacts for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(id));
create policy crm_contacts_insert on public.crm_contacts for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and not (select public.has_crm_role('marketing'))
  );
create policy crm_contacts_update on public.crm_contacts for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(id));

-- Утас/и-мэйл/шошго: contact-ийн эрх дагана; delete — засах эрхтэй нь.
create policy crm_contact_phones_select on public.crm_contact_phones for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(contact_id));
create policy crm_contact_phones_insert on public.crm_contact_phones for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));
create policy crm_contact_phones_update on public.crm_contact_phones for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));
create policy crm_contact_phones_delete on public.crm_contact_phones for delete
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));

create policy crm_contact_emails_select on public.crm_contact_emails for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(contact_id));
create policy crm_contact_emails_insert on public.crm_contact_emails for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));
create policy crm_contact_emails_update on public.crm_contact_emails for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));
create policy crm_contact_emails_delete on public.crm_contact_emails for delete
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));

create policy crm_contact_tags_select on public.crm_contact_tags for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(contact_id));
create policy crm_contact_tags_insert on public.crm_contact_tags for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));
create policy crm_contact_tags_delete on public.crm_contact_tags for delete
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id));

-- МУТСТ бүс (D7): ЗӨВХӨН aml_officer — sysadmin/manager-т ч нээгдэхгүй.
create policy crm_contact_aml_select on public.crm_contact_aml for select
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')));
create policy crm_contact_aml_insert on public.crm_contact_aml for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')));
create policy crm_contact_aml_update on public.crm_contact_aml for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('aml_officer')));

-- Merge түүх: ops_qc, aml_officer (+ceo аудитын хүрээнд) харна; бичилт RPC-ээр
-- (definer) — insert policy нь ops_qc-д нээлттэй (давхар хамгаалалт).
create policy crm_contact_merges_select on public.crm_contact_merges for select
  using (office_id = (select public.crm_office_id())
         and (select public.has_crm_role('ops_qc', 'aml_officer', 'ceo')));
create policy crm_contact_merges_insert on public.crm_contact_merges for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('ops_qc')));

-- Сэжим: эзэмшигч/үүсгэгч/баг/менежер + marketing, aml_officer унших (§3.2).
create policy crm_leads_select on public.crm_leads for select
  using (
    office_id = (select public.crm_office_id())
    and (
      owner_id = auth.uid()
      or created_by = auth.uid()
      or (owner_id is not null and public.crm_is_team_of(owner_id))
      or (select public.crm_is_manager())
      or (select public.has_crm_role('marketing', 'aml_officer'))
    )
  );
create policy crm_leads_insert on public.crm_leads for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and not (select public.has_crm_role('marketing'))
  );
create policy crm_leads_update on public.crm_leads for update
  using (
    office_id = (select public.crm_office_id())
    and (
      owner_id = auth.uid()
      or (owner_id is null and created_by = auth.uid())
      or (owner_id is not null and public.crm_is_team_of(owner_id))
      or (select public.crm_is_manager())
    )
  )
  with check (office_id = (select public.crm_office_id()));

-- Эзэмшлийн түүх: өөрт хамаатай мөр + team_lead/менежер; бичилт зөвхөн definer trigger.
create policy crm_ownership_history_select on public.crm_ownership_history for select
  using (
    office_id = (select public.crm_office_id())
    and (
      old_owner_id = auth.uid()
      or new_owner_id = auth.uid()
      or (select public.crm_is_manager())
      or (select public.has_crm_role('team_lead'))
    )
  );

-- Хадгалсан харагдац: зөвхөн өөрийн мөр (F-121).
create policy crm_saved_views_select on public.crm_saved_views for select
  using (profile_id = auth.uid());
create policy crm_saved_views_insert on public.crm_saved_views for insert
  with check (profile_id = auth.uid() and office_id = (select public.crm_office_id()));
create policy crm_saved_views_update on public.crm_saved_views for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy crm_saved_views_delete on public.crm_saved_views for delete
  using (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- GRANT / REVOKE (§2.2 definer дүрэм)
-- ════════════════════════════════════════════════════════════

revoke execute on function public.crm_normalize_phone(text) from anon, public;
revoke execute on function public.crm_can_view_contact(uuid) from anon, public;
revoke execute on function public.crm_can_edit_contact(uuid) from anon, public;
revoke execute on function public.crm_reassign_lead(uuid, uuid, text, text) from anon, public;
revoke execute on function public.crm_merge_contacts(uuid, uuid, jsonb, text) from anon, public;

grant execute on function public.crm_normalize_phone(text) to authenticated;
grant execute on function public.crm_can_view_contact(uuid) to authenticated;
grant execute on function public.crm_can_edit_contact(uuid) to authenticated;
grant execute on function public.crm_reassign_lead(uuid, uuid, text, text) to authenticated;
grant execute on function public.crm_merge_contacts(uuid, uuid, jsonb, text) to authenticated;

-- ГАЖИЛТ: supabase_realtime publication-д crm_* хүснэгт НЭМЭХГҮЙ (foundation-тай ижил).

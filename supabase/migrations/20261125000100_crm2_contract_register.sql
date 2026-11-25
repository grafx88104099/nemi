-- 20261125000100_crm2_contract_register.sql
-- Зуучлалын гэрээг БАТЛАХ алхмыг хасна. Агент PMC-ийн тамга, гарын үсэгтэй гэрээний НЭГ PDF-ийг хавсаргаад
-- «Гэрээ бүртгэх» дармагц гэрээ шууд хүчинтэй (active) болно; хөрөнгийн мэдээлэл бүрэн бол хөрөнгө ч
-- автоматаар идэвхжинэ (мэдээлэл дутуу бол дутуугаа нөхмөгц өөрөө идэвхжинэ). Батлагч (roles.approve) ба
-- агентын багийн ахлагч мэдэгдэл (FYI) авч, буруу гэрээг «Гэрээ буруу»-гаар буцаана (гэрээ цуцлагдаж,
-- хөрөнгө ноорог руу буцна). Бусад хүсэлт (crm2_requests: төлөв, шилжүүлэг) хэвээр.
--
-- Өөрчлөгдөх prod функц (prod-ын ОДООГИЙН pg_get_functiondef, 2026-11-25-аас хуулж өөрчилсөн; өмнөх
-- migration-уудын «-- ШИНЭ» тэмдгийг хассан — энэ файлд «-- ШИНЭ» = 20261125000100-ийн өөрчлөлт):
--   crm2_property_has_valid_contract — батлагдсан ЭСВЭЛ бүртгэгдсэн (registered_at) идэвхтэй гэрээ.
--   crm2_brokerage_missing — зөвхөн бүртгэлийн шалгалт: дуусах огноо, эзэн, эзний нэр, гэрээний PDF,
--     PDF биш гэрээний файл, өмчлөлийн баримт (тохиргоогоор).
--   crm2_missing_text — brokerage_contract, file шошго; шинэ file_not_pdf, stamp_unconfirmed.
--   crm2_brokerage_guard — дугаарыг үргэлж систем (B###) олгоно; эхлэх огноо = бүртгэсэн өдөр; шинэ
--     баганыг (registered_*, stamp_confirmed, invalidated_*) зөвхөн RPC бичнэ.
--   crm2_brokerage_files_guard — гэрээ (kind='contract') = зөвхөн PDF, нэг гэрээнд нэг, зөвхөн ноорогт;
--     trigger DELETE-д ч ажиллана: зэрэг бүртгэгдсэн гэрээний файлыг салгахгүй.
--   crm2_daily_maintenance — activate_on_start-ийн оронд хүчинтэй гэрээтэй ноорог (эсвэл сунгалт бүртгэгдсэн
--     «гэрээ дууссан») хөрөнгийг идэвхжүүлнэ (мэдэгдэлгүй); crm2_activation_blocked/ready-г явуулахаа болино.
--   crm2_daily_digest — «батлах» хэсэг хасагдана; contract_file = гэрээ бүртгэгдээгүй.
--   crm2_setting_keys / crm2_setting_default / crm2_set_setting — brokerage.require_file,
--     brokerage.default_commission, brokerage.activation_mode, brokerage.require_special_terms,
--     digest.pending_days түлхүүрийг хасна (crm2_settings мөрийг устгахгүй — 0 мөр байсан).
--   crm2_brokerage_submit / crm2_brokerage_approve / crm2_brokerage_reject / crm2_brokerage_withdraw —
--     ижил сигнатуртай алдааны stub (хуучин хуудаснаас дуудвал ойлгомжтой мессеж). Дараагийн migration-д DROP.
--   crm2_brokerage_track trigger — + registered_by, stamp_confirmed, invalidated_by.
-- Шинэ: crm2_brokerage_register, crm2_brokerage_invalidate, crm2_can_invalidate_brokerage,
--   crm2_contract_watcher_ids (ахлагч ∪ батлагч), crm2_property_try_activate, crm2_property_autoactivate
--   (+ 4 AFTER trigger: crm2_properties, crm2_property_private, crm2_property_media, crm2_contacts).
-- Шинэ багана: crm2_brokerage_contracts.registered_by/at, stamp_confirmed, invalidated_by/at.
--   «Хасах» (office_person_refs, 20261124007000) нь crm2_* хүснэгтийн БҮХ uuid баганыг уншдаг тул
--   registered_by, invalidated_by автоматаар тоологдоно — office_person_refs өөрчлөх шаардлагагүй.
-- Өгөгдөл (§10, idempotent — зөвхөн status='pending'): гэрээний PDF-тэй хүлээгдэж буй гэрээ → active
--   (бүртгэсэн = илгээсэн агент, stamp_confirmed=false, «шинэ дүрмээр шилжүүлсэн»), ахлагч/батлагчид PDF-ийг
--   шалгах FYI; PDF-гүй бол → draft. Уншаагүй crm2_brokerage_pending мэдэгдлийг уншсан болгоно. Ноорогт
--   хүрэхгүй. (prod: 260436 → active, P026 автоматаар идэвхжинэ.)
--
-- DEPLOY:
--   (1) C:/Nemi/backups руу (backup-staff.mjs загвараар) нөөцлөнө: crm2_brokerage_contracts,
--       crm2_brokerage_files, crm2_properties (P026), notifications (type crm2_brokerage_pending),
--       crm2_settings мөрүүд + дээрх функцуудын одоогийн тодорхойлолт (pg_get_functiondef).
--   (2) prod дээр rolled-back sim (contract-register-sim.mjs) ажиллуулна.
--   (3) apply-migration.mjs-ээр apply (нэг транзакц).
--   (4) notify pgrst, 'reload schema' (файлын төгсгөлд байгаа; шаардлагатай бол pgrst-reload.mjs).
--   (5) types/database.ts-ийг дахин үүсгэнэ.
--   (6) Аппыг ШУУД deploy хийнэ: шинэ апп crm2_brokerage_register-ийг дууддаг (энэ migration-аас өмнө
--       байхгүй); хуучин хуудас submit/approve дээр stub мессеж авна.
--   labels.test / settings-policies.test нь TS-ийг хамгийн сүүлийн SQL-тэй тулгадаг — TS толь ижил commit-д.
--
-- Rollback (гараар, нөөцөөс):
--   alter table public.crm2_brokerage_contracts drop constraint if exists crm2_brokerage_no_pending;
--   drop trigger if exists crm2_properties_autoactivate on public.crm2_properties;
--   drop trigger if exists crm2_property_private_autoactivate on public.crm2_property_private;
--   drop trigger if exists crm2_property_media_autoactivate on public.crm2_property_media;
--   drop trigger if exists crm2_contacts_autoactivate on public.crm2_contacts;
--   drop function if exists public.crm2_property_autoactivate();
--   drop function if exists public.crm2_brokerage_register(uuid, date, boolean);
--   drop function if exists public.crm2_brokerage_invalidate(uuid, text);
--   drop function if exists public.crm2_can_invalidate_brokerage(uuid);
--   drop function if exists public.crm2_contract_watcher_ids(uuid, uuid[]);
--   drop function if exists public.crm2_property_try_activate(uuid, boolean);
--   -- Нөөцөлсөн (0500/0300/0200/foundation) тодорхойлолтыг дахин ажиллуулна: crm2_brokerage_guard,
--   --   crm2_brokerage_files_guard, crm2_brokerage_missing, crm2_missing_text, crm2_property_has_valid_contract,
--   --   crm2_daily_maintenance, crm2_daily_digest, crm2_setting_keys, crm2_setting_default, crm2_set_setting,
--   --   crm2_brokerage_track trigger, crm2_brokerage_submit/approve/reject/withdraw.
--   -- crm2_brokerage_complete / crm2_brokerage_approved-ийг ЗӨВХӨН бүртгэлээр идэвхтэй болсон мөрүүдийг
--   --   (approved_at is null and registered_at is not null) pending болгосны дараа нөөцөөс сэргээнэ.
--   alter table public.crm2_brokerage_contracts drop constraint if exists crm2_brokerage_invalidated;
--   drop trigger if exists crm2_brokerage_files_guard on public.crm2_brokerage_files;
--   create trigger crm2_brokerage_files_guard before insert or update on public.crm2_brokerage_files
--     for each row execute function public.crm2_brokerage_files_guard();
--   alter table public.crm2_brokerage_files drop constraint if exists crm2_brokerage_files_contract_pdf;
--   drop index if exists public.crm2_brokerage_files_one_pdf;
--   -- crm2_brokerage_pending_idx-ийг 20261113000100-ээс дахин үүсгэнэ. Шинэ багана үлдэж болно.
--   -- §10 өгөгдлийн засвар автоматаар буцахгүй: 260436 ба P026-г нөөцөөс гараар сэргээнэ.
--   notify pgrst, 'reload schema';

set local lock_timeout = '3s';

-- ── §1. Шинэ багана ──────────────────────────────────────────────────────────
alter table public.crm2_brokerage_contracts
  add column if not exists registered_by uuid,
  add column if not exists registered_at timestamptz,
  add column if not exists stamp_confirmed boolean not null default false,
  add column if not exists invalidated_by uuid,
  add column if not exists invalidated_at timestamptz;

comment on column public.crm2_brokerage_contracts.registered_by is
  'Гэрээг бүртгэсэн хүн (crm2_brokerage_register; батлах алхамгүй). FK-гүй (submitted_by/approved_by шиг); «Хасах» uuid баганаар тоолно.';
comment on column public.crm2_brokerage_contracts.registered_at is
  'Бүртгэсэн агшин — registered_at эсвэл approved_at-тай active гэрээ хүчинтэй.';
comment on column public.crm2_brokerage_contracts.stamp_confirmed is
  '«PMC-ийн тамга, гарын үсэгтэй» гэж бүртгэгч баталгаажуулсан эсэх. false + registered_at = шинэ дүрмээр шилжүүлсэн (20261125).';
comment on column public.crm2_brokerage_contracts.invalidated_by is
  '«Гэрээ буруу» гэж буцаасан хүн (батлагч/багийн ахлагч); шалтгаан termination_reason-д.';
comment on column public.crm2_brokerage_contracts.invalidated_at is
  '«Гэрээ буруу» гэж буцаасан агшин (зөвхөн terminated гэрээнд).';
comment on column public.crm2_brokerage_contracts.commission_type is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй; хуучин гэрээ, сунгалтад үлдэнэ.';
comment on column public.crm2_brokerage_contracts.commission_value is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй; хуучин гэрээ, сунгалтад үлдэнэ.';
comment on column public.crm2_brokerage_contracts.commission_currency is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.commission_note is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.terms is 'ХУУЧИН (20261125): онцгой нөхцөлийг агентын урсгалд асуухгүй (PDF-д байна).';
comment on column public.crm2_brokerage_contracts.no_special_terms is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.signer_differs is 'ХУУЧИН (20261125): агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.signer_note is 'ХУУЧИН (20261125): гарын үсэг зурсан хүн эзнээс өөр бол түүний холбоо/эрх (≤500); агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.file_at_office is 'ХУУЧИН (20261125): «Гэрээ оффист үлдсэн» — агентын урсгалд ашиглахгүй.';
comment on column public.crm2_brokerage_contracts.prefilled is 'ХУУЧИН (20261125): оффисын анхдагчаар урьдчилан бөглөхгүй болсон.';
comment on column public.crm2_brokerage_contracts.approver_file_checked is 'ХУУЧИН (20261125): батлах алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.submitted_by is 'ХУУЧИН (20261125): батлуулахаар илгээх алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.submitted_at is 'ХУУЧИН (20261125): батлуулахаар илгээх алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.approved_by is 'ХУУЧИН (20261125): батлах алхам хасагдсан; хуучин гэрээнд хүчинтэй хэвээр.';
comment on column public.crm2_brokerage_contracts.approved_at is 'ХУУЧИН (20261125): батлах алхам хасагдсан; хуучин гэрээнд хүчинтэй хэвээр.';
comment on column public.crm2_brokerage_contracts.approval_note is 'ХУУЧИН (20261125): батлах алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.rejected_by is 'ХУУЧИН (20261125): батлах алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.rejected_at is 'ХУУЧИН (20261125): батлах алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.rejection_note is 'ХУУЧИН (20261125): батлах алхам хасагдсан.';
comment on column public.crm2_brokerage_contracts.activate_on_start is 'ХУУЧИН (20261125): эхлэх огноо = бүртгэсэн өдөр; үргэлж false.';

-- ── §2. Хязгаарлалт ба индекс ─────────────────────────────────────────────────
alter table public.crm2_brokerage_contracts
  drop constraint if exists crm2_brokerage_complete,
  drop constraint if exists crm2_brokerage_approved,
  drop constraint if exists crm2_brokerage_invalidated;
alter table public.crm2_brokerage_contracts
  -- ШИНЭ: шимтгэл шаардахгүй (зөвхөн огноо).
  add constraint crm2_brokerage_complete
    check (status in ('draft', 'terminated') or (start_date is not null and end_date is not null)),
  -- ШИНЭ: батлагдсан ЭСВЭЛ бүртгэгдсэн.
  add constraint crm2_brokerage_approved
    check (status not in ('active', 'expired') or approved_at is not null or registered_at is not null),
  -- ШИНЭ: «Гэрээ буруу» зөвхөн цуцлагдсан гэрээнд.
  add constraint crm2_brokerage_invalidated
    check (invalidated_at is null or status = 'terminated');

-- Гэрээний файл (kind='contract') = зөвхөн PDF. NOT VALID: files_guard ямар ч UPDATE-г татгалздаг тул
-- хуучин JPEG гэрээний мөрүүд (B001, 260437) дахин шалгагдахгүй; шинэ мөр бүр шалгагдана.
alter table public.crm2_brokerage_files drop constraint if exists crm2_brokerage_files_contract_pdf;
alter table public.crm2_brokerage_files
  add constraint crm2_brokerage_files_contract_pdf
    check (kind <> 'contract' or mime_type = 'application/pdf') not valid;
-- Нэг гэрээнд нэг PDF (зэрэг хоёр байршуулалтын уралдааныг хаана).
create unique index if not exists crm2_brokerage_files_one_pdf
  on public.crm2_brokerage_files (contract_id)
  where kind = 'contract' and mime_type = 'application/pdf';
drop index if exists public.crm2_brokerage_pending_idx;

-- ── §3. Унших туслах функц ────────────────────────────────────────────────────
-- a) Хүчинтэй гэрээ: батлагдсан (хуучин) ЭСВЭЛ бүртгэгдсэн. PDF шаардахгүй — хуучин B001 (P007) зөвхөн JPEG-тэй.
create or replace function public.crm2_property_has_valid_contract(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.property_id = p_property
       and b.status = 'active'
       and (b.approved_at is not null or b.registered_at is not null) -- ШИНЭ
       and b.start_date <= public.crm2_today()
       and b.end_date >= public.crm2_today()
  );
$$;

-- b) Бүртгэхэд дутуу (зөвхөн crm2_brokerage_register). Дараалал = lib/crm2/checklist.ts contractRegisterMissing.
create or replace function public.crm2_brokerage_missing(p_contract uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_missing text[] := '{}';
  v_owner uuid; -- ШИНЭ: гэрээний эзэн, эс бөгөөс хөрөнгийн эзэн
begin
  select * into v_b from public.crm2_brokerage_contracts where id = p_contract;
  if not found then
    return array['contract'];
  end if;
  -- ШИНЭ: эхлэх огноо = бүртгэсэн өдөр (систем тавина) — энд шалгахгүй.
  if v_b.end_date is null then
    v_missing := array_append(v_missing, 'end_date');
  elsif v_b.end_date < public.crm2_today() then
    v_missing := array_append(v_missing, 'end_date_past');
  end if;
  -- ШИНЭ: шимтгэл, онцгой нөхцөл, гарын үсэг зурагч, оффисын анхдагч, гэрээ байгуулсан агентыг шалгахгүй
  --   (гэрээ байгуулсан агентыг бүртгэл өөрөө баталгаажуулна).
  v_owner := coalesce(v_b.owner_contact_id,                                                       -- ШИНЭ
                      (select pp.owner_contact_id from public.crm2_property_private pp            -- ШИНЭ
                        where pp.property_id = v_b.property_id));                                 -- ШИНЭ
  if public.crm2_setting_bool('brokerage.require_owner', v_b.office_id) and v_owner is null then   -- ШИНЭ
    v_missing := array_append(v_missing, 'owner');
  end if;
  if v_owner is not null and exists (select 1 from public.crm2_contacts c                         -- ШИНЭ
                                      where c.id = v_owner and coalesce(c.name_unverified, false)) then -- ШИНЭ
    v_missing := array_append(v_missing, 'owner_name');
  end if;
  -- ШИНЭ: гэрээ = PMC-ийн тамга, гарын үсэгтэй НЭГ PDF; гэрээний зураг (хуучин) тооцогдохгүй. Батлагчгүй
  --   тул storage-ийн объект ОДОО байгаа, PDF эсэхийг шалгана (мөр үлдээд объектыг Storage API-аар устгаж/
  --   өөр файлаар сольсон бол 'file').
  if not exists (select 1 from public.crm2_brokerage_files f                                      -- ШИНЭ
                   join storage.objects o on o.bucket_id = 'crm2-docs' and o.name = f.storage_path -- ШИНЭ
                  where f.contract_id = v_b.id and f.kind = 'contract'                            -- ШИНЭ
                    and f.mime_type = 'application/pdf'                                           -- ШИНЭ
                    and o.metadata->>'mimetype' = 'application/pdf') then                         -- ШИНЭ
    v_missing := array_append(v_missing, 'file');
  end if;
  if exists (select 1 from public.crm2_brokerage_files f                                          -- ШИНЭ
              where f.contract_id = v_b.id and f.kind = 'contract'                                -- ШИНЭ
                and f.mime_type is distinct from 'application/pdf') then                          -- ШИНЭ
    v_missing := array_append(v_missing, 'file_not_pdf');                                         -- ШИНЭ
  end if;                                                                                         -- ШИНЭ
  if public.crm2_setting_bool('brokerage.require_ownership_doc', v_b.office_id)
     and not exists (select 1 from public.crm2_brokerage_files f
                      where f.contract_id = v_b.id and f.kind = 'ownership') then
    v_missing := array_append(v_missing, 'ownership_doc');
  end if;
  return v_missing;
end $$;

-- c) Дутуу зүйлийн нэр. Хуучин кодын нэр (хуучин мессеж, labels.test) хэвээр.
create or replace function public.crm2_missing_text(p_items text[])
returns text
language sql
immutable
as $$
  select string_agg(case x
      when 'district' then 'дүүрэг'
      when 'price_period' then 'үнийн хугацаа ангилалтай таарахгүй'
      when 'location_text' then 'байршил'
      when 'address_detail' then 'байршлын дэлгэрэнгүй'
      when 'pin' then 'газрын зургийн цэг'
      when 'project' then 'төсөл'
      when 'property_type' then 'хөрөнгийн төрөл'
      when 'area_m2' then 'хэмжээ'
      when 'rooms' then 'өрөөний тоо'
      when 'floor' then 'давхар'
      when 'price' then 'үнэ'
      when 'year_in_use' then 'ашиглалтад орсон он'
      when 'listing_agent_id' then 'хөрөнгө авчирсан агент'
      when 'contract_agent_id' then 'гэрээ байгуулсан агент'
      when 'photo_agent_id' then 'зураг авсан агент'
      when 'owner' then 'эзэн'
      when 'owner_source' then 'эзний эх сурвалж'
      when 'owner_name' then 'эзний нэр (баталгаажаагүй)'
      when 'owner_pending' then 'эзнийг шалгах шаардлагатай'
      when 'showing_instructions' then 'үзүүлэх заавар'
      when 'images' then 'зураг'
      when 'unconfirmed' then 'баталгаажаагүй утга'
      when 'brokerage_contract' then 'бүртгэгдсэн, хүчинтэй зуучлалын гэрээ (PMC тамгатай PDF)' -- ШИНЭ
      when 'start_date' then 'эхлэх огноо'
      when 'end_date' then 'дуусах огноо'
      when 'end_date_past' then 'дуусах огноо өнгөрсөн'
      when 'commission' then 'шимтгэл'
      when 'file' then 'гэрээний PDF (PMC-ийн тамга, гарын үсэгтэй)' -- ШИНЭ
      when 'file_not_pdf' then 'гэрээний зураг/бусад файл — гэрээг зөвхөн PDF-ээр оруулна (устгана уу)' -- ШИНЭ
      when 'stamp_unconfirmed' then 'PMC-ийн тамга, гарын үсэгтэйг баталгаажуулаагүй' -- ШИНЭ
      when 'special_terms' then 'онцгой нөхцөл (эсвэл «онцгой нөхцөлгүй»)'
      when 'signer_authority' then 'гарын үсэг зурах эрхийн тайлбар'
      when 'defaults_unconfirmed' then 'оффисын анхдагч утгыг баталгаажуулаагүй'
      when 'ownership_doc' then 'өмчлөлийн баримт'
      when 'role_unconfirmed' then 'гэрээ байгуулсан агентыг баталгаажуулаагүй'
      else x end, ', ')
    from unnest(p_items) x;
$$;

-- d) ШИНЭ: шинэ гэрээний FYI хүлээн авагч = агентуудын багийн ахлагч ∪ roles.approve эрхтэн (давхардалгүй).
--   approvals.team_lead-ээс үл хамаарна. crm2_approver_ids («ахлагч, эс бөгөөс батлагч») ӨӨРЧЛӨГДӨХГҮЙ —
--   төлөв/шилжүүлгийн хүсэлт хуучнаараа.
create or replace function public.crm2_contract_watcher_ids(p_office uuid, p_agents uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    from (
      -- Ахлагч: идэвхтэй, оффисын ажилтан, 'team_lead' дүртэй (crm2_is_lead_of_any-тай ижил дүрэм).
      select t.lead_profile_id as id
        from public.crm_staff s
        join public.crm_teams t on t.id = s.team_id and t.office_id = s.office_id
        join public.crm_staff l on l.profile_id = t.lead_profile_id and l.office_id = p_office and l.is_active
                               and l.roles && array['team_lead']::public.crm_role[]
       where s.office_id = p_office
         and s.profile_id = any (p_agents)
         and t.lead_profile_id is not null
      union
      select s.profile_id
        from public.crm_staff s
       where s.office_id = p_office
         and s.is_active
         and s.roles && public.crm2_setting_roles('roles.approve', p_office)
    ) x;
$$;

-- e) ШИНЭ: «Гэрээ буруу» эрх = батлагч (crm2_brokerage_approver: roles.approve, тохиргоогоор ахлагч / оффисын
--   админ) ЭСВЭЛ хариуцагч/бүртгэгч/үүсгэгчийн багийн ахлагч. RPC ба UI-ийн туг.
create or replace function public.crm2_can_invalidate_brokerage(p_contract uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and (public.crm2_brokerage_approver(b.responsible_agent_id)
            or public.crm2_is_lead_of_any(array[b.responsible_agent_id, b.registered_by, b.created_by]))
  );
$$;

-- ── §4. Хамгаалалт (trigger) ──────────────────────────────────────────────────
-- a) Гэрээний мөр: дугаар үргэлж систем (B###), эхлэх огноо = бүртгэсэн өдөр; шинэ баганыг зөвхөн RPC бичнэ.
create or replace function public.crm2_brokerage_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sys boolean := public.crm2_in_rpc();
  v_me uuid := auth.uid();
  v_prop record;
  v_prev record;
  v_meta text[] := array['updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    select x.office_id, x.contract_agent_id, x.listing_agent_id into v_prop
      from public.crm2_properties x where x.id = new.property_id;
    if not found then
      raise exception 'CRM: хөрөнгө олдсонгүй';
    end if;
    new.office_id := v_prop.office_id;
    if v_me is not null then new.created_by := v_me; end if;
    if not v_sys or v_me is not null then
      -- Хэрэглэгчээс ирсэн мөр үргэлж ноорог; батлалт/бүртгэлийн талбар хоосон.
      if not v_sys then
        new.status := 'draft';
        new.number := '';       -- ШИНЭ: клиентийн дугаарыг үл тооно — систем B### олгоно
        new.start_date := null; -- ШИНЭ: эхлэх огноо = бүртгэсэн өдөр (crm2_brokerage_register)
      end if;
      new.submitted_by := null; new.submitted_at := null;
      new.approved_by := null; new.approved_at := null; new.approval_note := null;
      new.approver_file_checked := null;
      new.rejected_by := null; new.rejected_at := null; new.rejection_note := null;
      new.terminated_by := null; new.terminated_at := null; new.termination_reason := null;
      new.activate_on_start := false;
      new.registered_by := null; new.registered_at := null; new.stamp_confirmed := false; -- ШИНЭ
      new.invalidated_by := null; new.invalidated_at := null;                            -- ШИНЭ
    end if;
    new.responsible_agent_id := coalesce(new.responsible_agent_id, v_prop.contract_agent_id, v_prop.listing_agent_id, new.created_by);
    perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Гэрээний хариуцсан агент');
    if new.previous_id is not null then
      select b.property_id, b.version, b.status into v_prev
        from public.crm2_brokerage_contracts b where b.id = new.previous_id;
      if not found or v_prev.property_id <> new.property_id then
        raise exception 'CRM: өмнөх гэрээ энэ хөрөнгийнх биш';
      end if;
      if v_prev.status not in ('active', 'expired') then
        raise exception 'CRM: зөвхөн батлагдсан гэрээг сунгана';
      end if;
      new.version := v_prev.version + 1;
    else
      new.version := 1;
    end if;
    new.number := btrim(coalesce(new.number, ''));
    if new.number = '' then
      loop
        new.number := public.crm2_next_code(new.office_id, 'brokerage');
        exit when not exists (select 1 from public.crm2_brokerage_contracts b
                               where b.office_id = new.office_id and b.number = new.number);
      end loop;
    elsif exists (select 1 from public.crm2_brokerage_contracts b
                   where b.office_id = new.office_id and b.number = new.number) then
      raise exception 'CRM: «%» дугаартай гэрээ аль хэдийн бүртгэлтэй', new.number;
    end if;
    new.created_at := now();
  else
    if new.office_id <> old.office_id or new.property_id <> old.property_id
       or new.previous_id is distinct from old.previous_id or new.version <> old.version
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: гэрээний хөрөнгө, хувилбарын холбоосыг өөрчлөхгүй';
    end if;
    if not v_sys and (
         new.status <> old.status
         or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at
         or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
         or new.approval_note is distinct from old.approval_note
         or new.approver_file_checked is distinct from old.approver_file_checked
         or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at
         or new.rejection_note is distinct from old.rejection_note
         or new.terminated_by is distinct from old.terminated_by or new.terminated_at is distinct from old.terminated_at
         or new.termination_reason is distinct from old.termination_reason
         or new.activate_on_start <> old.activate_on_start
         or new.number is distinct from old.number                                            -- ШИНЭ
         or new.start_date is distinct from old.start_date                                    -- ШИНЭ
         or new.registered_by is distinct from old.registered_by                              -- ШИНЭ
         or new.registered_at is distinct from old.registered_at                              -- ШИНЭ
         or new.stamp_confirmed is distinct from old.stamp_confirmed                          -- ШИНЭ
         or new.invalidated_by is distinct from old.invalidated_by                            -- ШИНЭ
         or new.invalidated_at is distinct from old.invalidated_at) then                      -- ШИНЭ
      raise exception 'CRM: гэрээний төлөв, батлалтыг тусгай үйлдлээр өөрчилнө';
    end if;
    if old.status <> 'draft' and not v_sys
       and (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      raise exception 'CRM: бүртгэгдсэн гэрээг засахгүй — буруу бол батлагч/багийн ахлагч «Гэрээ буруу» гэж буцаана; хугацааг «Сунгах»-аар'; -- ШИНЭ
    end if;
    if new.responsible_agent_id is distinct from old.responsible_agent_id then
      perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Гэрээний хариуцсан агент');
    end if;
    new.number := btrim(new.number);
    if new.number = '' then
      raise exception 'CRM: гэрээний дугаар хоосон байж болохгүй';
    end if;
    if new.number <> old.number and exists (
         select 1 from public.crm2_brokerage_contracts b
          where b.office_id = new.office_id and b.number = new.number and b.id <> new.id) then
      raise exception 'CRM: «%» дугаартай гэрээ аль хэдийн бүртгэлтэй', new.number;
    end if;
  end if;
  -- Гэрээний эзэн: харах эрхгүй харилцагчийг холбохгүй (сунгалт өмнөх хувилбарын эзнийг өвлөнө).
  if new.owner_contact_id is not null and v_me is not null
     and (tg_op = 'INSERT' or new.owner_contact_id is distinct from old.owner_contact_id)
     and not public.crm2_can_view_contact(new.owner_contact_id)
     and not exists (select 1 from public.crm2_brokerage_contracts p
                      where p.id = new.previous_id and p.owner_contact_id = new.owner_contact_id) then
    raise exception 'CRM: энэ харилцагчийг харах эрхгүй тул гэрээний эзнээр холбохгүй';
  end if;
  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- b) Гэрээний файл: kind='contract' = зөвхөн PDF (.pdf зам + application/pdf), нэг гэрээнд нэг, зөвхөн ноорогт.
--   Өмчлөл/иргэний үнэмлэх/бусад файл хэвээр (зураг зөвшөөрнө). crm2_brokerage_files_kind_guard өөрчлөгдөхгүй.
create or replace function public.crm2_brokerage_files_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b record;
  v_prefix text;
  v_size bigint;
  v_mime text;
  v_limit int;
  v_count int;
begin
  if tg_op = 'UPDATE' then
    raise exception 'CRM: гэрээний файлыг засахгүй — шинээр нэмнэ үү';
  end if;
  -- ШИНЭ: салгах (DELETE) — RLS (crm2_can_detach_brokerage, STABLE) хуучин snapshot-оор «ноорог» гэж үзэж
  --   болох тул гэрээний мөрийг түгжиж шинээр уншина: зэрэг явсан «Бүртгэх» commit хийсэн бол татгалзана
  --   (бүртгэгдсэн гэрээ PDF-гүй үлдэхгүй). Каскад (гэрээ/хөрөнгө устгах), RPC, систем хамаарахгүй.
  if tg_op = 'DELETE' then                                                                       -- ШИНЭ
    if auth.uid() is not null and not public.crm2_in_rpc() and pg_trigger_depth() = 1 then       -- ШИНЭ
      select b.status into v_b from public.crm2_brokerage_contracts b                            -- ШИНЭ
       where b.id = old.contract_id for share;                                                   -- ШИНЭ
      if found and v_b.status <> 'draft' then                                                    -- ШИНЭ
        raise exception 'CRM: бүртгэгдсэн гэрээний файлыг салгахгүй';                            -- ШИНЭ
      end if;                                                                                    -- ШИНЭ
    end if;                                                                                      -- ШИНЭ
    return old;                                                                                  -- ШИНЭ
  end if;                                                                                        -- ШИНЭ
  select b.office_id, b.property_id, b.status into v_b from public.crm2_brokerage_contracts b where b.id = new.contract_id; -- ШИНЭ (status)
  if not found then
    raise exception 'CRM: гэрээ олдсонгүй';
  end if;
  new.office_id := v_b.office_id;
  new.property_id := v_b.property_id;
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  new.created_at := now();
  v_prefix := new.office_id::text || '/brokerage/' || new.contract_id::text || '/';
  if left(new.storage_path, length(v_prefix)) <> v_prefix then
    raise exception 'CRM: гэрээний файлын зам буруу';
  end if;
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into v_size, v_mime
    from storage.objects o
   where o.bucket_id = 'crm2-docs' and o.name = new.storage_path;
  if not found then
    raise exception 'CRM: файл хуулагдаагүй байна — эхлээд файлаа байршуулна уу';
  end if;
  new.size_bytes := v_size;
  new.mime_type := v_mime;
  if new.kind = 'contract' then                                                                  -- ШИНЭ
    if v_mime is distinct from 'application/pdf' or new.storage_path !~* '\.pdf$' then           -- ШИНЭ
      raise exception 'CRM: гэрээг зөвхөн PDF хэлбэрээр оруулна (PMC-ийн тамга, гарын үсэгтэй). Зураг гэрээ гэж тооцогдохгүй — камераар скан хийвэл нэг PDF болно'; -- ШИНЭ
    end if;                                                                                      -- ШИНЭ
    if v_b.status <> 'draft' and auth.uid() is not null then                                     -- ШИНЭ
      raise exception 'CRM: бүртгэгдсэн гэрээний PDF-ийг солихгүй';                              -- ШИНЭ
    end if;                                                                                      -- ШИНЭ
    if exists (select 1 from public.crm2_brokerage_files f                                       -- ШИНЭ
                where f.contract_id = new.contract_id and f.kind = 'contract'                    -- ШИНЭ
                  and f.mime_type = 'application/pdf') then                                      -- ШИНЭ
      raise exception 'CRM: гэрээнд нэг PDF хавсаргана — хуучнаа устгаад солино уу';             -- ШИНЭ
    end if;                                                                                      -- ШИНЭ
  end if;                                                                                        -- ШИНЭ
  v_limit := public.crm2_setting_int('docs.max_file_mb', new.office_id);
  if coalesce(v_size, 0) > v_limit::bigint * 1048576 then
    raise exception 'CRM: файл хэт том (% МБ-аас ихгүй)', v_limit;
  end if;
  v_limit := public.crm2_setting_int('docs.max_files_per_contract', new.office_id);
  select count(*) into v_count from public.crm2_brokerage_files f where f.contract_id = new.contract_id;
  if v_count >= v_limit then
    raise exception 'CRM: нэг гэрээнд % хүртэл файл хадгална', v_limit;
  end if;
  return new;
end $$;

-- ШИНЭ: DELETE-д ч ажиллана (дээрх салгах шалгалт). Өмнө нь BEFORE INSERT OR UPDATE.
drop trigger if exists crm2_brokerage_files_guard on public.crm2_brokerage_files;
create trigger crm2_brokerage_files_guard
  before insert or update or delete on public.crm2_brokerage_files
  for each row execute function public.crm2_brokerage_files_guard();

-- ── §5. Автомат идэвхжүүлэлт (гэрээ бүртгэгдсэн + мэдээлэл бүрэн, аль нь сүүлд хангагдсанаас үл хамаарна) ─────
-- a) ШИНЭ: нэг хөрөнгийг идэвхжүүлэхийг оролдоно. Алдаа (түгжээний deadlock-ийг оролцуулаад) гарвал зөвхөн
--   warning (хадгалалтыг унагахгүй) — өдөр тутмын шалгалт дахин оролдоно. Хөрөнгийн мөрийг FOR NO KEY UPDATE-ээр
--   түгжинэ: status/status_reason/activated_at түлхүүр багана биш; FOR UPDATE нь зураг нэмэхийн FK KEY SHARE ба
--   хөрөнгө хадгалахын NO KEY UPDATE-тэй зөрчилдөж зэрэг хоёр гүйлгээнд deadlock үүсгэнэ. Гэрээний мөрийг
--   түгжихгүй (дараалал гэрээ → хөрөнгө хэвээр). crm2_properties_guard хүчинтэй гэрээг дахин шалгаж activated_at тавина.
--   «Гэрээ дууссан» хөрөнгө: p_allow_ended (бүртгэл) эсвэл тэр төлөвт орсноос ХОЙШ бүртгэгдсэн гэрээ (сунгалт)
--   байвал — хүчинтэй гэрээтэй байхад гараар «гэрээ дууссан» болгосныг автоматаар сэргээхгүй.
create or replace function public.crm2_property_try_activate(p_property uuid, p_allow_ended boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.crm2_property_status;
  v_changed timestamptz;
  v_flag text;
begin
  begin
    select x.status, x.status_changed_at into v_status, v_changed
      from public.crm2_properties x where x.id = p_property for no key update;
    if not found then
      return false;
    end if;
    if v_status = 'contract_ended' then
      if not coalesce(p_allow_ended, false)
         and not exists (select 1 from public.crm2_brokerage_contracts b
                          where b.property_id = p_property and b.status = 'active'
                            and b.registered_at >= v_changed) then
        return false;
      end if;
    elsif v_status <> 'draft' then
      return false;
    end if;
    if not public.crm2_property_has_valid_contract(p_property) then
      return false;
    end if;
    if cardinality(public.crm2_property_missing(p_property)) > 0 then
      return false;
    end if;
    -- Гадна RPC-ийн шалтгааныг (жишээ нь «Гэрээ бүртгэсэн») дарж бичихгүй.
    v_flag := public.crm2_rpc_begin(case when coalesce(current_setting('crm2.rpc', true), '') = '1' then null
                                         else 'Гэрээ бүртгэгдсэн, мэдээлэл бүрэн — автоматаар идэвхжсэн' end);
    update public.crm2_properties set status = 'active', status_reason = null where id = p_property;
    perform public.crm2_rpc_end(v_flag);
    return true;
  exception when others then
    raise warning 'crm2_try_activate % failed: %', p_property, sqlerrm;
    return false;
  end;
end $$;

-- b) ШИНЭ: AFTER trigger — хөрөнгийн мэдээлэл нөхөгдөхөд (үнэ, эзэн, үзүүлэх заавар, зураг, эзний эх
--   сурвалж/нэр) ноорог (эсвэл сунгалт бүртгэгдсэн «гэрээ дууссан») хөрөнгийг идэвхжүүлнэ. Хямд урьдчилсан
--   шалгалт: ноорог/гэрээ дууссан + хугацаа нь өнөөдрийг хамарсан active гэрээ (crm2_brokerage_property_idx);
--   нарийн дүрмийг try_activate шалгана. Идэвхжүүлэлт status='active' болгодог тул WHEN-ээр давтагдахгүй.
create or replace function public.crm2_property_autoactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_today date := public.crm2_today();
begin
  if tg_table_name = 'crm2_contacts' then
    for v_id in
      select pp.property_id
        from public.crm2_property_private pp
        join public.crm2_properties x on x.id = pp.property_id
       where pp.owner_contact_id = new.id
         and x.status in ('draft', 'contract_ended')
         and exists (select 1 from public.crm2_brokerage_contracts b
                      where b.property_id = x.id and b.status = 'active'
                        and b.start_date <= v_today and b.end_date >= v_today)
    loop
      perform public.crm2_property_try_activate(v_id);
    end loop;
    return null;
  end if;
  if tg_table_name = 'crm2_properties' then
    v_id := new.id;
  else
    v_id := new.property_id;
  end if;
  if exists (select 1 from public.crm2_properties x where x.id = v_id and x.status in ('draft', 'contract_ended'))
     and exists (select 1 from public.crm2_brokerage_contracts b
                  where b.property_id = v_id and b.status = 'active'
                    and b.start_date <= v_today and b.end_date >= v_today) then
    perform public.crm2_property_try_activate(v_id);
  end if;
  return null;
end $$;

drop trigger if exists crm2_properties_autoactivate on public.crm2_properties;
create trigger crm2_properties_autoactivate
  after update on public.crm2_properties
  for each row when (new.status in ('draft', 'contract_ended'))
  execute function public.crm2_property_autoactivate();

drop trigger if exists crm2_property_private_autoactivate on public.crm2_property_private;
create trigger crm2_property_private_autoactivate
  after update of owner_contact_id, showing_instructions on public.crm2_property_private
  for each row execute function public.crm2_property_autoactivate();

drop trigger if exists crm2_property_media_autoactivate on public.crm2_property_media;
create trigger crm2_property_media_autoactivate
  after insert on public.crm2_property_media
  for each row when (new.kind = 'image')
  execute function public.crm2_property_autoactivate();

drop trigger if exists crm2_contacts_autoactivate on public.crm2_contacts;
create trigger crm2_contacts_autoactivate
  after update of source, name_unverified on public.crm2_contacts
  for each row execute function public.crm2_property_autoactivate();

-- ── §6. RPC ───────────────────────────────────────────────────────────────────
-- a) ШИНЭ: «Гэрээ бүртгэх» — ноорог → active, батлагчгүй. Дугаар (B###) ноорог үүсэхэд олгогдсон; эхлэх огноо =
--   өнөөдөр; дуусах огноо = p_end_date, эс бөгөөс ноорогийнх, эс бөгөөс өнөөдөр + brokerage.default_term_months − 1 өдөр.
create or replace function public.crm2_brokerage_register(
  p_contract uuid,
  p_end_date date default null,
  p_stamp_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_p public.crm2_properties;
  v_me uuid := auth.uid();
  v_today date := public.crm2_today();
  v_end date;
  v_missing text[];
  v_pmissing text[] := '{}';
  v_pstatus public.crm2_property_status;
  v_flag text;
  v_fill boolean;
  v_name text;
  v_ptext text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: гэрээ олдсонгүй';
  end if;
  -- Давхар товшилт: аль хэдийн бүртгэгдсэн бол одоогийн үр дүнг буцаана.
  if v_b.status = 'active' and v_b.registered_at is not null and public.crm2_can_edit_brokerage_draft(v_b.id) then
    select * into v_p from public.crm2_properties where id = v_b.property_id;
    if v_p.status <> 'active' then
      v_pmissing := public.crm2_property_missing(v_p.id);
    end if;
    return jsonb_build_object('contract_status', 'active', 'number', v_b.number, 'start_date', v_b.start_date,
                              'end_date', v_b.end_date, 'property_status', v_p.status,
                              'property_missing', to_jsonb(v_pmissing), 'already', true);
  end if;
  if v_b.status <> 'draft' then
    raise exception 'CRM: зөвхөн ноорог гэрээг бүртгэнэ (төлөв: %)', v_b.status;
  end if;
  if not public.crm2_can_edit_brokerage_draft(v_b.id) then
    raise exception 'CRM: энэ гэрээг бүртгэх эрхгүй';
  end if;
  select * into v_p from public.crm2_properties where id = v_b.property_id for update;
  if v_p.status = 'archived' then
    raise exception 'CRM: архивласан хөрөнгөд гэрээ бүртгэхгүй — эхлээд сэргээнэ үү';
  end if;
  -- Нэг хөрөнгөд нэг хүчинтэй гэрээ (сунгалт = өмнөх гэрээний шинэ хувилбар).
  if exists (select 1 from public.crm2_brokerage_contracts o
              where o.property_id = v_b.property_id and o.id <> v_b.id and o.status = 'active'
                and o.id is distinct from v_b.previous_id) then
    raise exception 'CRM: энэ хөрөнгөд хүчинтэй гэрээ байна — шинэ гэрээг «Сунгах»-аар үүсгэнэ';
  end if;
  v_end := coalesce(p_end_date, v_b.end_date,
                    ((v_today + make_interval(months => coalesce(
                        public.crm2_setting_int('brokerage.default_term_months', v_b.office_id), 12)))::date - 1));
  if v_end > (v_today + interval '60 months')::date then
    raise exception 'CRM: дуусах огноо 5 жилээс хол байж болохгүй';
  end if;

  v_flag := public.crm2_rpc_begin('Гэрээ бүртгэсэн');
  -- Эзэн: гэрээнд байхгүй бол хөрөнгийн эзэн. start_date-г least(өнөөдөр, дуусах)-аар түр тавина:
  -- хуучин ноорогийн ирээдүйн эхлэх огноо crm2_brokerage_dates-ийг унагахгүй, өнгөрсөн дуусах огноо доорх
  -- «дутуу»-гаар (end_date_past) ойлгомжтой мессежтэй буцна.
  update public.crm2_brokerage_contracts
     set end_date = v_end,
         start_date = least(v_today, v_end),
         owner_contact_id = coalesce(owner_contact_id,
                                     (select pp.owner_contact_id from public.crm2_property_private pp
                                       where pp.property_id = v_b.property_id))
   where id = v_b.id;
  v_missing := public.crm2_brokerage_missing(v_b.id);
  if p_stamp_confirmed is not true then
    v_missing := array_append(v_missing, 'stamp_unconfirmed');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'CRM: гэрээнд дутуу: %', public.crm2_missing_text(v_missing);
  end if;
  update public.crm2_brokerage_contracts
     set status = 'active', start_date = v_today, registered_by = v_me, registered_at = now(),
         stamp_confirmed = true, activate_on_start = false
   where id = v_b.id;

  -- Гэрээ байгуулсан агент: бүртгэл = баталгаажуулалт. Хоосон бол бүртгэгчээр (оффисын идэвхтэй ажилтан,
  -- нэг агент олон үүрэг тохиргоо зөвшөөрвөл эсвэл бүртгэгч листлэгч/зурагчин биш бол).
  select * into v_p from public.crm2_properties where id = v_b.property_id;
  if v_p.contract_agent_id is null or 'contract_agent_id' = any (coalesce(v_p.unconfirmed, '{}'::text[])) then
    v_fill := v_p.contract_agent_id is null
              and exists (select 1 from public.crm_staff s
                           where s.profile_id = v_me and s.office_id = v_p.office_id and s.is_active)
              and (public.crm2_setting_bool('property.same_agent_multi_role', v_p.office_id)
                   or (v_me is distinct from v_p.listing_agent_id and v_me is distinct from v_p.photo_agent_id));
    update public.crm2_properties
       set contract_agent_id = case when v_fill then v_me else contract_agent_id end,
           unconfirmed = array_remove(coalesce(unconfirmed, '{}'::text[]), 'contract_agent_id')
     where id = v_p.id;
  end if;

  -- Мэдээлэл бүрэн бол идэвхжүүлнэ (trigger аль хэдийн идэвхжүүлсэн байж болно). contract_ended хөрөнгийг
  -- шинэ гэрээ (сунгалт) дахин идэвхжүүлнэ.
  perform public.crm2_property_try_activate(v_p.id, true);
  select x.status into v_pstatus from public.crm2_properties x where x.id = v_p.id;
  if v_pstatus <> 'active' then
    v_pmissing := public.crm2_property_missing(v_p.id);
  end if;
  update public.crm2_requests
     set status = 'cancelled', decided_by = v_me, decided_at = now(), decision_note = 'Гэрээ бүртгэгдэж идэвхжсэн'
   where kind = 'property_status' and target_id = v_p.id and status = 'pending'
     and v_pstatus = 'active' and payload->>'to' = 'active';
  perform public.crm2_rpc_end(v_flag);

  -- FYI: батлагчид + агентын багийн ахлагч (бүртгэгч өөрөө хасагдана — crm2_notify).
  select p.full_name into v_name from public.profiles p where p.id = v_me;
  v_ptext := case
    when v_pstatus = 'active' then 'хөрөнгө идэвхтэй'
    when v_pstatus = 'draft' then 'хөрөнгө ноорог'
                                  || coalesce(' (дутуу: ' || public.crm2_missing_text(v_pmissing) || ')', '')
    else 'хөрөнгө: ' || public.crm2_status_label(v_pstatus::text)
  end;
  perform public.crm2_notify(
    public.crm2_contract_watcher_ids(v_b.office_id, array[v_b.responsible_agent_id, v_me]),
    'crm2_brokerage_registered', 'Зуучлалын гэрээ бүртгэгдлээ',
    concat_ws(' · ', v_p.code, v_b.number, nullif(btrim(coalesce(v_name, '')), ''), v_ptext),
    '/agent/crm/staff/' || v_p.id::text);

  return jsonb_build_object(
    'contract_status', 'active',
    'number', v_b.number,
    'start_date', v_today,
    'end_date', v_end,
    'property_status', v_pstatus,
    'property_missing', to_jsonb(v_pmissing)
  );
end $$;

-- b) ШИНЭ: «Гэрээ буруу» — бүртгэгдсэн гэрээг цуцалж (invalidated_*), өөр хүчинтэй гэрээгүй бол идэвхтэй /
--   түр түдгэлзсэн / гэрээ дууссан хөрөнгийг шууд ноорог болгоно (crm2_property_transition_ok-г зориуд
--   алгасна), нийтлэлийг (published_at) цэвэрлэнэ. Түрээслэгдсэн/зарагдсан хөрөнгийн төлөв хэвээр.
--   Буруу PDF нотолгоо болж түгжигдэн үлдэнэ (ноорог биш тул устгахгүй); агент шинэ ноорог (шинэ B###) бүртгэнэ.
create or replace function public.crm2_brokerage_invalidate(p_contract uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_p public.crm2_properties;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
  v_pstatus public.crm2_property_status;
  v_to_draft boolean := false;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status <> 'active' then
    raise exception 'CRM: «Гэрээ буруу» гэж буцаах хүчинтэй гэрээ олдсонгүй';
  end if;
  if not public.crm2_can_invalidate_brokerage(v_b.id) then
    raise exception 'CRM: энэ гэрээг «Гэрээ буруу» гэж буцаах эрхгүй (батлагч эсвэл багийн ахлагч)';
  end if;
  if v_reason is null then
    raise exception 'CRM: юу буруу байгааг бичнэ үү';
  end if;
  if char_length(v_reason) > 1900 then
    raise exception 'CRM: шалтгаан 1900 тэмдэгтээс ихгүй байна';
  end if;
  select * into v_p from public.crm2_properties where id = v_b.property_id for update;

  v_flag := public.crm2_rpc_begin('Гэрээ буруу: ' || v_reason);
  update public.crm2_brokerage_contracts
     set status = 'terminated', terminated_by = auth.uid(), terminated_at = now(),
         termination_reason = 'Гэрээ буруу: ' || v_reason,
         invalidated_by = auth.uid(), invalidated_at = now(), activate_on_start = false
   where id = v_b.id;
  v_pstatus := v_p.status;
  if v_p.status in ('active', 'suspended', 'contract_ended')
     and not public.crm2_property_has_valid_contract(v_p.id) then
    update public.crm2_properties
       set status = 'draft', status_reason = 'Гэрээ буруу: ' || v_reason, published_at = null
     where id = v_p.id;
    v_pstatus := 'draft';
    v_to_draft := true;
    if v_p.listing_id is not null then
      -- crm2_unpublish_property-тэй ижил түүх (зар publish_sync-ээр буцаагдсан).
      perform public.crm2_log(v_p.office_id, 'property', v_p.id, 'unpublish', 'listing_id',
                              to_jsonb(v_p.listing_id::text), null, v_p.id, null, null, 'Гэрээ буруу: ' || v_reason);
    end if;
  end if;
  -- Хүлээгдэж буй төлөвийн хүсэлт: ноорог болсон бол бүгд, эс бөгөөс зөвхөн «идэвхтэй болгох» (гэрээгүй тул
  -- биелэхгүй) хүсэлт цуцлагдана.
  update public.crm2_requests
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Гэрээ буруу'
   where kind = 'property_status' and target_id = v_p.id and status = 'pending'
     and (v_to_draft or payload->>'to' = 'active');
  perform public.crm2_rpc_end(v_flag);

  perform public.crm2_notify(
    array[v_b.responsible_agent_id, v_b.registered_by, v_b.created_by, v_p.listing_agent_id, v_p.contract_agent_id],
    'crm2_brokerage_invalid', 'Гэрээ буруу гэж буцаагдлаа',
    v_p.code || ' · ' || v_b.number || ': ' || v_reason,
    '/agent/crm/staff/' || v_p.id::text);
  return jsonb_build_object('contract_status', 'terminated', 'property_status', v_pstatus);
end $$;

-- c) ШИНЭ: хуучин батлах урсгалын stub (ижил сигнатур, эрх хэвээр) — хуучин хуудас ойлгомжтой мессеж авна.
--   Шинэ апп амьд болсны дараах migration-д DROP хийнэ.
create or replace function public.crm2_brokerage_submit(p_contract uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'CRM: гэрээг батлуулах шаардлагагүй болсон — хуудсаа шинэчлээд «Гэрээ бүртгэх»-ийг ашиглана уу'; -- ШИНЭ
end $$;

create or replace function public.crm2_brokerage_approve(
  p_contract uuid,
  p_note text default null,
  p_expected_updated_at timestamptz default null,
  p_file_checked boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'CRM: гэрээг батлуулах шаардлагагүй болсон — хуудсаа шинэчлээд «Гэрээ бүртгэх»-ийг ашиглана уу'; -- ШИНЭ
end $$;

create or replace function public.crm2_brokerage_reject(p_contract uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'CRM: гэрээг батлуулах шаардлагагүй болсон — хуудсаа шинэчлээд «Гэрээ бүртгэх»-ийг ашиглана уу'; -- ШИНЭ
end $$;

create or replace function public.crm2_brokerage_withdraw(p_contract uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'CRM: гэрээг батлуулах шаардлагагүй болсон — хуудсаа шинэчлээд «Гэрээ бүртгэх»-ийг ашиглана уу'; -- ШИНЭ
end $$;

-- ── §7. Cron ──────────────────────────────────────────────────────────────────
-- a) Өдөр тутмын шалгалт: 2-р алхам = хүчинтэй гэрээтэй, мэдээлэл бүрэн ноорог хөрөнгийг идэвхжүүлэх (trigger-ийн
--   нөөц хамгаалалт), мэдэгдэлгүй. Бусад алхам, буцаах түлхүүр хэвээр.
create or replace function public.crm2_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.crm2_today();
  v_flag text;
  v_r record;
  v_expired int := 0;
  v_activated int := 0;
  v_blocked int := 0;
  v_ended int := 0;
  v_reminded int := 0;
  v_failed int := 0;
  v_days int[];
  v_left int;
  v_new int;
  v_leads uuid[];
begin
  if auth.uid() is not null then
    raise exception 'CRM: зөвхөн системийн ажил';
  end if;
  v_flag := public.crm2_rpc_begin('Өдөр тутмын шалгалт');

  -- Мөр бүр тусдаа (subtransaction): нэг мөрийн алдаа бүх оффисын ажлыг зогсоохгүй.
  for v_r in
    select b.id from public.crm2_brokerage_contracts b
     where b.status = 'active' and b.end_date < v_today
  loop
    begin
      update public.crm2_brokerage_contracts set status = 'expired', activate_on_start = false where id = v_r.id;
      v_expired := v_expired + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: expire % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  -- ШИНЭ: батлах алхамгүй — хүчинтэй гэрээтэй ноорог хөрөнгө (эсвэл «гэрээ дууссан» болсноос хойш сунгалт
  --   бүртгэгдсэн хөрөнгө) мэдээлэл бүрэн бол идэвхжинэ (мэдэгдэлгүй; дутуу нь «blocked» гэж тоологдоно,
  --   UI «дутуу» төлөвөөр харуулна). Дүрэм = crm2_property_try_activate.
  for v_r in                                                                                       -- ШИНЭ
    select x.id from public.crm2_properties x                                                      -- ШИНЭ
     where (x.status = 'draft'                                                                     -- ШИНЭ
            or (x.status = 'contract_ended'                                                        -- ШИНЭ
                and exists (select 1 from public.crm2_brokerage_contracts b                        -- ШИНЭ
                             where b.property_id = x.id and b.status = 'active'                    -- ШИНЭ
                               and b.registered_at >= x.status_changed_at)))                       -- ШИНЭ
       and public.crm2_property_has_valid_contract(x.id)                                           -- ШИНЭ
  loop
    begin
      if public.crm2_property_try_activate(v_r.id) then                                            -- ШИНЭ
        v_activated := v_activated + 1;
      else                                                                                         -- ШИНЭ
        v_blocked := v_blocked + 1;                                                                -- ШИНЭ
      end if;                                                                                      -- ШИНЭ
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: activate % failed: %', v_r.id, sqlerrm;
    end;
  end loop;
  -- ШИНЭ: хуучин activate_on_start туг (эхлэх огноо = бүртгэсэн өдөр болсон тул шинээр тавигдахгүй).
  update public.crm2_brokerage_contracts set activate_on_start = false where activate_on_start;  -- ШИНЭ

  for v_r in
    select x.id from public.crm2_properties x
     where x.status in ('active', 'suspended')
       and not public.crm2_property_has_valid_contract(x.id)
  loop
    begin
      if public.crm2_end_property_if_uncovered(v_r.id, 'Зуучлалын гэрээний хугацаа дууссан') then
        v_ended := v_ended + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: end property % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  for v_r in
    select b.id, b.office_id, b.property_id, b.end_date, b.number, b.responsible_agent_id, x.code
      from public.crm2_brokerage_contracts b
      join public.crm2_properties x on x.id = b.property_id
     where b.status = 'active'
       and b.end_date >= v_today
       and not exists (select 1 from public.crm2_brokerage_contracts n
                        where n.previous_id = b.id and n.status in ('pending', 'active'))
  loop
    begin
      v_left := v_r.end_date - v_today;
      select coalesce(array_agg((e #>> '{}')::int), '{}') into v_days
        from jsonb_array_elements(public.crm2_setting('brokerage.remind_days_before', v_r.office_id)) e;
      with ins as (
        insert into public.crm2_reminder_log (contract_id, end_date, days_before, office_id)
        select v_r.id, v_r.end_date, d, v_r.office_id from unnest(v_days) d where d >= v_left
        on conflict do nothing
        returning 1)
      select count(*) into v_new from ins;
      if v_new > 0 then
        select coalesce(array_agg(t.lead_profile_id), '{}') into v_leads
          from public.crm_staff s
          join public.crm_teams t on t.id = s.team_id
         where s.profile_id = v_r.responsible_agent_id and s.office_id = v_r.office_id
           and t.lead_profile_id is not null;
        perform public.crm2_notify(array[v_r.responsible_agent_id] || v_leads, 'crm2_brokerage_expiring',
          'Зуучлалын гэрээ дуусах дөхлөө',
          v_r.code || ' · ' || v_r.number || ' — ' || to_char(v_r.end_date, 'YYYY-MM-DD')
            || ' (' || v_left || ' хоног үлдлээ)',
          '/agent/crm/staff/' || v_r.property_id::text);
        v_reminded := v_reminded + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: remind % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

  -- Хэмжилт, сануулгын тэмдэг, давхардлын түр token-ий хадгалах хугацаа.
  begin
    delete from public.crm2_ui_events where created_at < now() - interval '180 days';
    delete from public.crm2_nudge_log where last_sent < v_today - 60;
    delete from public.crm2_digest_log where digest_date < v_today - 90;
    delete from public.crm2_duplicate_candidates where created_at < now() - interval '30 days';
  exception when others then
    v_failed := v_failed + 1;
    raise warning 'crm2_daily: purge failed: %', sqlerrm;
  end;

  perform public.crm2_rpc_end(v_flag);
  return jsonb_build_object('expired', v_expired, 'activated', v_activated,
                            'blocked', v_blocked,
                            'ended', v_ended, 'reminded', v_reminded, 'failed', v_failed);
end $$;

-- b) Өдрийн нэгтгэсэн сануулга: «батлах» хэсэг хасагдана; contract_file = ноорог гэрээ байгаа ч бүртгэгдээгүй.
create or replace function public.crm2_daily_digest()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.crm2_today();
  v_local timestamp := now() at time zone 'Asia/Ulaanbaatar';
  v_monday boolean := extract(isodow from (now() at time zone 'Asia/Ulaanbaatar')) = 1;
  v_o record;
  v_a record;
  v_scope text;
  v_pilot jsonb;
  v_owner_days int;
  v_body text;
  v_sent int := 0;
  v_failed int := 0;
begin
  if auth.uid() is not null then
    raise exception 'CRM: зөвхөн системийн ажил';
  end if;
  -- Шөнийн цагт хэзээ ч явуулахгүй (cron хоцорсон/дахин ажилласан ч).
  if extract(hour from v_local) < 9 or extract(hour from v_local) >= 21 then
    return jsonb_build_object('skipped', 'quiet_hours');
  end if;

  -- Түр хүснэгтийг pg_temp-ээр бүрэн нэрлэнэ (public дахь ижил нэртэй объект руу хазайхгүй).
  -- (agent, property_id, reason) давтагдахгүй.
  drop table if exists pg_temp.crm2_digest_items;
  create temp table crm2_digest_items (
    office_id uuid, agent uuid, property_id uuid, reason text,
    unique (agent, property_id, reason)) on commit drop;

  for v_o in select distinct s.office_id from public.crm_staff s where s.is_active loop
    begin
      v_scope := coalesce(public.crm2_setting('digest.scope', v_o.office_id) #>> '{}', 'off');
      if v_scope <> 'off' then
        v_pilot := coalesce(public.crm2_setting('staff.quick_add_pilot', v_o.office_id), '[]'::jsonb);
        v_owner_days := coalesce((public.crm2_setting('digest.owner_days', v_o.office_id) #>> '{}')::int, 1);

        -- Ноорог: эзэнгүй эсвэл эзэн шийдэгдээгүй (owner_pending) / гэрээгүй / гэрээ бүртгэгдээгүй
        -- (зараас үүсгэсэн нь зөвхөн даваа гарагт).
        insert into pg_temp.crm2_digest_items (office_id, agent, property_id, reason)
        select v_o.office_id, coalesce(x.listing_agent_id, x.created_by), x.id, r.reason
          from public.crm2_properties x
          left join public.crm2_property_private pp on pp.property_id = x.id
         cross join lateral (values
            (case when pp.owner_contact_id is null or pp.owner_pending is not null then 'owner' end),
            (case when not exists (select 1 from public.crm2_brokerage_contracts b
                                    where b.property_id = x.id and b.status in ('draft', 'active')) -- ШИНЭ
                  then 'contract' end),
            (case when exists (select 1 from public.crm2_brokerage_contracts b                     -- ШИНЭ
                                where b.property_id = x.id and b.status = 'draft')                  -- ШИНЭ
                       and not exists (select 1 from public.crm2_brokerage_contracts b              -- ШИНЭ
                                        where b.property_id = x.id and b.status = 'active')         -- ШИНЭ
                  then 'contract_file' end)
          ) r(reason)
         where x.office_id = v_o.office_id
           and x.status = 'draft'
           and x.created_at <= now() - make_interval(days => v_owner_days)
           and r.reason is not null
           and (x.source <> 'listing' or v_monday)
        on conflict do nothing;

        -- Ноорог биш (идэвхтэй г.м.) хөрөнгийн шийдэгдээгүй эзэн (owner_pending) мөн 'owner'.
        -- Нас нь owner_pending.at (зөвхөн «Эзэн» RPC бичнэ) — хувийн мөрийн бусад засвар хугацааг сунгахгүй.
        insert into pg_temp.crm2_digest_items (office_id, agent, property_id, reason)
        select v_o.office_id, coalesce(x.listing_agent_id, x.created_by), x.id, 'owner'
          from public.crm2_properties x
          join public.crm2_property_private pp on pp.property_id = x.id
         where x.office_id = v_o.office_id
           and x.status in ('active', 'suspended', 'contract_ended')
           and pp.owner_pending is not null
           and coalesce(case when pg_input_is_valid(pp.owner_pending ->> 'at', 'timestamptz')
                             then (pp.owner_pending ->> 'at')::timestamptz end,
                        pp.updated_at) <= now() - make_interval(days => v_owner_days)
        on conflict do nothing;

        -- ШИНЭ: батлагчдын «хүлээгдэж буй гэрээ» хэсэг хасагдсан (батлах алхамгүй).

        delete from pg_temp.crm2_digest_items i
         where i.office_id = v_o.office_id
           and (i.agent is null
                or (v_scope = 'pilot' and not (v_pilot ? i.agent::text))
                -- Тухайн оффисын идэвхтэй гишүүн биш (шилжсэн, идэвхгүй, оффисгүй профайл) бол явуулахгүй.
                or not exists (select 1 from public.crm_staff s join public.profiles p on p.id = s.profile_id
                                where s.profile_id = i.agent and s.office_id = i.office_id and s.is_active
                                  and coalesce(p.office_id, (select ag.office_id from public.agents ag
                                                              where ag.profile_id = p.id limit 1)) = i.office_id)
                or exists (select 1 from public.crm2_nudge_log n
                            where n.property_id = i.property_id and n.reason = i.reason
                              and n.profile_id = i.agent and n.last_sent > v_today - 3)
                or exists (select 1 from public.crm_notification_prefs np
                            where np.profile_id = i.agent and np.event_code = 'crm2_incomplete_digest'
                              and cardinality(np.channels) = 0)
                or exists (select 1 from public.crm2_digest_log d
                            where d.profile_id = i.agent and d.digest_date = v_today));
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_digest office % failed: %', v_o.office_id, sqlerrm;
    end;
  end loop;

  for v_a in
    select i.agent,
           (array_agg(i.office_id))[1] as office_id,
           count(distinct i.property_id) as props, -- ШИНЭ (шүүлтгүй)
           count(*) filter (where i.reason = 'owner') as n_owner,
           count(*) filter (where i.reason = 'contract') as n_contract,
           count(*) filter (where i.reason = 'contract_file') as n_file,
           array_agg(distinct i.property_id) as pids
      from pg_temp.crm2_digest_items i
     group by i.agent
  loop
    begin
      v_body := v_a.props || ' хөрөнгө дутуу: ' || concat_ws(', ',                                -- ШИНЭ
          case when v_a.n_owner > 0 then v_a.n_owner || ' эзэн' end,
          case when v_a.n_contract > 0 then v_a.n_contract || ' гэрээ' end,
          case when v_a.n_file > 0 then v_a.n_file || ' гэрээ бүртгэгдээгүй' end);                -- ШИНЭ
      insert into public.crm2_digest_log (profile_id, office_id, digest_date, counts, property_ids)
      values (v_a.agent, v_a.office_id, v_today,
              jsonb_build_object('properties', v_a.props, 'owner', v_a.n_owner, 'contract', v_a.n_contract,
                                 'contract_file', v_a.n_file), -- ШИНЭ ('approve' хасагдсан)
              v_a.pids);
      perform public.crm2_notify(array[v_a.agent], 'crm2_incomplete_digest', 'Өнөөдрийн дутуу бүртгэл', v_body,
        '/agent/crm/staff/incomplete'); -- ШИНЭ
      insert into public.crm2_nudge_log (property_id, reason, profile_id, last_sent, times)
      select distinct i.property_id, i.reason, i.agent, v_today, 1
        from pg_temp.crm2_digest_items i where i.agent = v_a.agent
      on conflict (property_id, reason, profile_id) do update
        set last_sent = excluded.last_sent, times = public.crm2_nudge_log.times + 1;
      v_sent := v_sent + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_digest: % failed: %', v_a.agent, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('sent', v_sent, 'failed', v_failed);
end $$;

-- ── §8. Тохиргоо: brokerage.require_file, default_commission, activation_mode, require_special_terms,
--   digest.pending_days түлхүүр хасагдана (тодорхойгүй түлхүүр null анхдагчаар татгалзагдана). ──────────
create or replace function public.crm2_setting_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'property.visibility', 'property.agent_direct_statuses', 'property.activation_required',
    'property.same_agent_multi_role', 'property.category_labels', 'property.types',
    'property.districts', 'property.features',
    'property.category_hints', 'property.duplicate_check', 'property.min_images',
    'brokerage.require_owner', 'brokerage.remind_days_before', 'brokerage.on_expiry', -- ШИНЭ (require_file хасагдсан)
    'brokerage.default_term_months', 'brokerage.require_ownership_doc', -- ШИНЭ (default_commission, activation_mode, require_special_terms хасагдсан)
    'approvals.team_lead', 'approvals.office_admin', 'approvals.allow_self',
    'roles.work', 'roles.approve', 'roles.finance',
    'contact.foreign_deal', 'contact.require_phone',
    'contact.sources',
    'deal.open_property_statuses', 'deal.auto_advance', 'deal.property_agents_can_view', 'deal.cancel_reasons',
    'showing.require_feedback', 'activity.edit_window_hours',
    'media.max_images', 'media.max_videos', 'media.max_image_mb', 'media.max_video_mb',
    'docs.max_file_mb', 'docs.max_files_per_contract',
    'staff.quick_add', 'staff.quick_add_pilot', 'digest.scope', 'digest.owner_days', -- ШИНЭ (pending_days хасагдсан)
    'ai.listing_parse'
  ];
$$;

-- Мөр бүр «when 'түлхүүр' then '<json>'» нэг мөрөнд (labels.test-ийн regex); мөрийн төгсгөлд тайлбаргүй.
create or replace function public.crm2_setting_default(p_key text)
returns jsonb
language sql
immutable
as $$
  select (case p_key
    when 'property.visibility'            then '"office"'
    when 'property.agent_direct_statuses' then '[]'
    when 'property.activation_required'   then '["location_text", "price", "listing_agent_id", "contract_agent_id"]'
    when 'property.same_agent_multi_role' then 'true'
    when 'property.category_labels'       then '{"rent": "Түрээслэх", "lease": "Хөлслөх", "managed_rent": "Менежментийн үйлчилгээтэй түрээс", "sale": "Зарах"}'
    when 'property.types'                 then '{"apartment": "Орон сууц", "house": "Хувийн сууц", "office": "Оффис", "commercial": "Худалдаа, үйлчилгээ", "land": "Газар", "garage": "Гараж, агуулах", "other": "Бусад"}'
    when 'property.districts'             then '["Баянгол", "Баянзүрх", "Сонгинохайрхан", "Сүхбаатар", "Хан-Уул", "Чингэлтэй", "Налайх", "Багануур", "Багахангай"]'
    when 'property.features'              then '{"parking": "Зогсоол", "garage": "Гараж", "furnished": "Тавилгатай", "balcony": "Тагт", "elevator": "Лифт", "pets": "Тэжээвэр амьтан зөвшөөрнө", "security": "Харуул, камертай", "storage": "Агуулахтай", "kids_playground": "Хүүхдийн тоглоомын талбай"}'
    -- ангиллын чипийн тайлбар (lease-ийг оффис тодорхойлтол тайлбаргүй)
    when 'property.category_hints'        then '{"rent": "Сарын түрээсээр", "managed_rent": "Түрээс + оффисын менежментийн үйлчилгээ", "sale": "Худалдах, нийт үнээр"}'
    when 'property.duplicate_check'       then 'true'
    when 'property.min_images'            then '1'
    when 'brokerage.require_owner'        then 'true'
    -- ШИНЭ: brokerage.require_file хасагдсан (гэрээ = PDF, бүртгэлд үргэлж шаардана)
    when 'brokerage.remind_days_before'   then '[30, 7, 1]'
    when 'brokerage.on_expiry'            then '"contract_ended"'
    when 'brokerage.default_term_months'  then '12'
    -- ШИНЭ: brokerage.default_commission, brokerage.activation_mode, brokerage.require_special_terms хасагдсан
    when 'brokerage.require_ownership_doc' then 'false'
    when 'approvals.team_lead'            then 'true'
    when 'approvals.office_admin'         then 'false'
    when 'approvals.allow_self'           then '"managers"'
    when 'roles.work'                     then '["agent", "team_lead", "sales_director", "ops_qc", "ceo", "property_manager"]'
    when 'roles.approve'                  then '["sales_director", "ops_qc", "ceo"]'
    when 'roles.finance'                  then '["finance"]'
    when 'contact.foreign_deal'           then '"deny"'
    when 'contact.require_phone'          then 'true'
    -- эзний эх сурвалжийн 10 кодын ангилал ('other' заавал)
    when 'contact.sources'                then '{"digital": "Онлайн суваг (сошиал, сайт)", "referral": "Танилаар (реферал)", "prospecting": "Идэвхтэй хайлт", "walk_in": "Оффисоор ирсэн", "open_house": "Нээлттэй үзэлт, арга хэмжээ", "listing_inquiry": "Зарын лавлагаа", "personal_network": "Хувийн сүлжээ", "international": "Олон улсын / түнш", "pm_cross": "Менежментийн үйлчилгээнээс", "other": "Бусад (тайлбартай)"}'
    when 'deal.open_property_statuses'    then '["active"]'
    when 'deal.auto_advance'              then 'true'
    when 'deal.property_agents_can_view'  then 'true'
    when 'deal.cancel_reasons'            then '{"price": "Үнэ таараагүй", "location": "Байршил таараагүй", "size": "Хэмжээ, өрөө таараагүй", "condition": "Хөрөнгийн байдал таалагдаагүй", "timing": "Хугацаа таараагүй", "chose_other": "Өөр хөрөнгө сонгосон", "financing": "Санхүүжилт бүрдээгүй", "no_response": "Холбоо тасарсан", "owner_withdrew": "Эзэн татгалзсан", "other": "Бусад"}'
    when 'showing.require_feedback'       then 'true'
    when 'activity.edit_window_hours'     then '72'
    when 'media.max_images'               then '40'
    when 'media.max_videos'               then '5'
    when 'media.max_image_mb'             then '15'
    when 'media.max_video_mb'             then '50'
    when 'docs.max_file_mb'               then '20'
    when 'docs.max_files_per_contract'    then '20'
    when 'staff.quick_add'                then '"off"'
    when 'staff.quick_add_pilot'          then '[]'
    when 'digest.scope'                   then '"pilot"'
    when 'digest.owner_days'              then '1'
    -- ШИНЭ: digest.pending_days хасагдсан
    when 'ai.listing_parse'               then 'false'
  end)::jsonb;
$$;

create or replace function public.crm2_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_default jsonb := public.crm2_setting_default(p_key);
  v_old jsonb;
  v_allowed text[];
  v_num numeric;
  v_min numeric;
  v_max numeric;
  v_flag text;
begin
  if not public.crm2_can_manage_settings() then
    raise exception 'CRM: тохиргоо өөрчлөх эрхгүй';
  end if;
  -- Эрх/батлалтын тохиргоогоор өөрийгөө батлагч, хувийн мэдээлэл харагч болгохоос сэргийлнэ.
  if (p_key like 'roles.%' or p_key like 'approvals.%') and not public.has_crm_role('ceo') then
    raise exception 'CRM: эрх ба батлалтын тохиргоог зөвхөн ерөнхий захирал өөрчилнө';
  end if;
  if p_key in ('roles.approve', 'roles.finance') and p_value ? 'sysadmin' then
    raise exception 'CRM: системийн админ дүрд батлах/санхүүгийн эрх олгохгүй';
  end if;
  if v_default is null then
    raise exception 'CRM: тодорхойгүй тохиргоо (%)', p_key;
  end if;
  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(v_default) then
    raise exception 'CRM: тохиргооны утгын төрөл буруу (%)', p_key;
  end if;

  if jsonb_typeof(v_default) = 'string' then
    v_allowed := case p_key
      when 'property.visibility' then array['office', 'team', 'own']
      when 'approvals.allow_self' then array['nobody', 'managers', 'all']
      when 'brokerage.on_expiry' then array['contract_ended', 'keep']
      when 'contact.foreign_deal' then array['deny', 'allow']
      when 'staff.quick_add' then array['off', 'pilot', 'all']
      when 'digest.scope' then array['off', 'pilot', 'all']
      -- ШИНЭ: brokerage.activation_mode хасагдсан
    end;
    if v_allowed is not null and not ((p_value #>> '{}') = any (v_allowed)) then
      raise exception 'CRM: тохиргооны утга буруу (%)', p_key;
    end if;

  elsif jsonb_typeof(v_default) = 'number' then
    v_num := (p_value #>> '{}')::numeric;
    select lo, hi into v_min, v_max from (values
      ('activity.edit_window_hours', 0, 8760),
      ('media.max_images', 1, 200),
      ('media.max_videos', 0, 50),
      ('media.max_image_mb', 1, 50),
      ('media.max_video_mb', 1, 50),
      ('docs.max_file_mb', 1, 20),
      ('docs.max_files_per_contract', 1, 100),
      ('property.min_images', 0, 20),
      ('brokerage.default_term_months', 1, 60),
      ('digest.owner_days', 0, 14) -- ШИНЭ (digest.pending_days хасагдсан)
    ) as r(k, lo, hi) where r.k = p_key;
    if v_num <> trunc(v_num) or v_num < coalesce(v_min, 0) or v_num > coalesce(v_max, 100000) then
      raise exception 'CRM: тохиргооны тоо хязгаараас гадуур (%: %–%)', p_key, v_min, v_max;
    end if;

  elsif jsonb_typeof(v_default) = 'array' then
    -- (CASE-г хаалтанд: PL/pgSQL IF нөхцөл эхний THEN дээр зогсдог.)
    if jsonb_array_length(p_value) > (case when p_key = 'property.districts' then 60 else 20 end) then
      raise exception 'CRM: жагсаалт хэт урт (%)', p_key;
    end if;
    if p_key = 'brokerage.remind_days_before' then
      if exists (select 1 from jsonb_array_elements(p_value) e
                  where jsonb_typeof(e) <> 'number'
                     or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
                     or (e #>> '{}')::numeric not between 0 and 365) then
        raise exception 'CRM: сануулгын өдөр 0–365 бүхэл тоо байна';
      end if;
    elsif p_key = 'property.districts' then
      if jsonb_array_length(p_value) = 0
         or exists (select 1 from jsonb_array_elements(p_value) e
                     where jsonb_typeof(e) <> 'string'
                        or char_length(e #>> '{}') not between 1 and 60
                        or (e #>> '{}') <> btrim(e #>> '{}'))
         or (select count(distinct x) from jsonb_array_elements_text(p_value) x) <> jsonb_array_length(p_value) then
        raise exception 'CRM: дүүргийн жагсаалт буруу (хоосон биш, 1–60 тэмдэгт, давхардалгүй)';
      end if;
    -- Туршилтын агент = энэ оффисын идэвхтэй ажилтны profile id (uuid мөр, давхардалгүй, ≤ 20).
    -- CASE нь uuid хэлбэрийг cast-аас ӨМНӨ шалгана (буруу мөр cast алдаа биш, энэ мессежээр унана).
    elsif p_key = 'staff.quick_add_pilot' then
      if exists (select 1 from jsonb_array_elements(p_value) e
                  where case
                    when jsonb_typeof(e) <> 'string' then true
                    when (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
                    else not exists (select 1 from public.crm_staff s
                                      where s.profile_id = (e #>> '{}')::uuid
                                        and s.office_id = v_office and s.is_active)
                  end)
         or (select count(distinct x) from jsonb_array_elements_text(p_value) x) <> jsonb_array_length(p_value) then
        raise exception 'CRM: туршилтын агентын жагсаалт буруу (оффисын идэвхтэй ажилтан, давхардалгүй)';
      end if;
    else
      v_allowed := case
        when p_key like 'roles.%' then enum_range(null::public.crm_role)::text[]
        when p_key = 'property.agent_direct_statuses' then array['suspended', 'rented', 'sold', 'contract_ended', 'archived']
        when p_key = 'deal.open_property_statuses' then array['active', 'suspended']
        when p_key = 'property.activation_required' then array[
          'project', 'district', 'location_text', 'address_detail', 'pin', 'area_m2', 'rooms', 'floor', 'price',
          'year_in_use', 'property_type', 'listing_agent_id', 'contract_agent_id', 'photo_agent_id',
          'owner', 'showing_instructions', 'images',
          'owner_source', 'owner_name', 'unconfirmed']
      end;
      if v_allowed is null then
        raise exception 'CRM: жагсаалтын шалгалт тодорхойгүй (%)', p_key;
      end if;
      if exists (select 1 from jsonb_array_elements(p_value) e
                  where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_allowed))) then
        raise exception 'CRM: жагсаалтад зөвшөөрөгдөөгүй утга байна (%)', p_key;
      end if;
      if p_key in ('roles.work', 'roles.approve', 'deal.open_property_statuses') and jsonb_array_length(p_value) = 0 then
        raise exception 'CRM: энэ жагсаалт хоосон байж болохгүй (%)', p_key;
      end if;
    end if;

  elsif jsonb_typeof(v_default) = 'object' then
    if (select count(*) from jsonb_each(p_value)) > 40 then
      raise exception 'CRM: жагсаалт хэт урт (%)', p_key;
    end if;
    if exists (select 1 from jsonb_each(p_value) e
                where e.key !~ '^[a-z][a-z0-9_]{0,39}$'
                   or jsonb_typeof(e.value) <> 'string'
                   or char_length(btrim(e.value #>> '{}')) not between 1 and 80) then
      raise exception 'CRM: түлхүүр/нэрийн хэлбэр буруу (%)', p_key;
    end if;
    if p_key = 'property.category_labels'
       and (select array_agg(k order by k) from jsonb_object_keys(p_value) k)
           <> array['lease', 'managed_rent', 'rent', 'sale'] then
      raise exception 'CRM: 4 ангиллын нэрийг бүгдийг өгнө';
    end if;
    if p_key = 'deal.cancel_reasons' and not (p_value ? 'other') then
      raise exception 'CRM: цуцлах шалтгаанд «other» байх ёстой';
    end if;
    -- Ангиллын тайлбар — 4 ангиллын дурын дэд олонлог (хоосон {} зөвшөөрнө; нэр ≤ 80 дээр шалгагдсан).
    if p_key = 'property.category_hints' -- ШИНЭ (brokerage.default_commission хасагдсан)
       and exists (select 1 from jsonb_object_keys(p_value) k
                    where k not in ('rent', 'lease', 'managed_rent', 'sale')) then
      raise exception 'CRM: зөвхөн 4 ангиллын түлхүүр (%)', p_key;
    end if;
    -- ШИНЭ: шимтгэлийн анхдагчийн (brokerage.default_commission) хэлбэрийн шалгалт хасагдсан.
    if p_key = 'contact.sources' and not (p_value ? 'other') then
      raise exception 'CRM: эх сурвалжид «other» байх ёстой';
    end if;
  end if;

  select s.value into v_old from public.crm2_settings s where s.office_id = v_office and s.key = p_key;
  insert into public.crm2_settings (office_id, key, value, updated_by, updated_at)
  values (v_office, p_key, p_value, auth.uid(), now())
  on conflict (office_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.crm2_log(v_office, 'settings', v_office, 'update', p_key, coalesce(v_old, v_default), p_value);
  -- Төрөл/ангилал/онцлогийн нэр хайлтын текстэд орсон тул шинэчилнэ.
  if p_key in ('property.types', 'property.category_labels', 'property.features') then
    v_flag := public.crm2_rpc_begin(null);
    update public.crm2_properties set search_text = search_text where office_id = v_office;
    perform public.crm2_rpc_end(v_flag);
  end if;
  return p_value;
end $$;

-- ── §9. Түүх: шинэ баганыг гэрээний түүхэнд бичнэ ─────────────────────────────
drop trigger if exists crm2_brokerage_track on public.crm2_brokerage_contracts;
create trigger crm2_brokerage_track
  after insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_track_changes(
    'brokerage', 'status', 'number', 'owner_contact_id', 'start_date', 'end_date', 'terms', 'commission_type',
    'commission_value', 'commission_currency', 'commission_note', 'responsible_agent_id', 'approved_by',
    'approval_note', 'rejection_note', 'termination_reason',
    'prefilled', 'no_special_terms', 'signer_differs', 'file_at_office',
    'approver_file_checked',
    'registered_by', 'stamp_confirmed', 'invalidated_by'); -- ШИНЭ

-- ── §10. Өгөгдлийн засвар (idempotent: зөвхөн status='pending'; ноорогт хүрэхгүй) ───────────────
-- Гэрээний PDF-тэй, хугацаа нь дуусаагүй хүлээгдэж буй гэрээ → active (бүртгэсэн = илгээсэн агент,
-- stamp_confirmed=false = «шинэ дүрмээр шилжүүлсэн»; огноо өөрчлөгдөхгүй), хөрөнгийг идэвхжүүлэхийг оролдоно,
-- ахлагч/батлагчид PDF-ийг шалгах FYI. Бусад хүлээгдэж буй гэрээ → draft (PDF-ээ хавсаргаж бүртгэнэ).
do $do$
declare
  v_flag text := public.crm2_rpc_begin('Шинэ дүрмээр шилжүүлсэн (2026-11-25): батлах алхамгүй');
  v_today date := public.crm2_today();
  v_r record;
  v_agent uuid;
  v_status public.crm2_property_status;
  v_ptext text;
  v_link text;
begin
  for v_r in
    select b.id, b.office_id, b.property_id, b.number, b.responsible_agent_id, b.submitted_by, b.submitted_at,
           b.start_date, b.end_date, x.code,
           exists (select 1 from public.crm2_brokerage_files f
                    where f.contract_id = b.id and f.kind = 'contract' and f.mime_type = 'application/pdf') as has_pdf
      from public.crm2_brokerage_contracts b
      join public.crm2_properties x on x.id = b.property_id
     where b.status = 'pending'
     order by b.created_at
       for update of b
  loop
    v_agent := coalesce(v_r.submitted_by, v_r.responsible_agent_id);
    v_link := '/agent/crm/staff/' || v_r.property_id::text;
    if v_r.has_pdf and v_r.start_date is not null and v_r.end_date >= v_today then
      update public.crm2_brokerage_contracts
         set status = 'active', registered_by = v_agent, registered_at = coalesce(v_r.submitted_at, now()),
             stamp_confirmed = false, activate_on_start = false
       where id = v_r.id;
      perform public.crm2_property_try_activate(v_r.property_id, true);
      select x.status into v_status from public.crm2_properties x where x.id = v_r.property_id;
      v_ptext := case
        when v_status = 'active' then 'хөрөнгө идэвхтэй'
        else 'хөрөнгө: ' || public.crm2_status_label(v_status::text)
             || coalesce(' (дутуу: ' || public.crm2_missing_text(public.crm2_property_missing(v_r.property_id)) || ')', '')
      end;
      perform public.crm2_notify(
        array(select w from unnest(public.crm2_contract_watcher_ids(v_r.office_id,
                                     array[v_r.responsible_agent_id, v_agent])) w
               where w is distinct from v_r.responsible_agent_id and w is distinct from v_agent),
        'crm2_brokerage_registered', 'Зуучлалын гэрээ бүртгэгдлээ (шинэ дүрэм)',
        v_r.code || ' · ' || v_r.number || ' — PDF-ийг шалгаад буруу бол «Гэрээ буруу»',
        v_link);
      perform public.crm2_notify(array[v_r.responsible_agent_id, v_agent],
        'crm2_brokerage_registered', 'Гэрээ батлах шаардлагагүй боллоо',
        v_r.code || ' · ' || v_r.number || ' · ' || v_ptext,
        v_link);
    else
      update public.crm2_brokerage_contracts set status = 'draft' where id = v_r.id;
      -- ШИНЭ төрөл: одоо хийх ажил тул хуучин «crm2_brokerage_decided» (хуучин) шошгогүй.
      perform public.crm2_notify(array[v_r.responsible_agent_id, v_agent],
        'crm2_brokerage_migrated', 'Гэрээгээ PMC тамгатай PDF-ээр хавсаргаж бүртгэнэ үү',
        v_r.code || ' · ' || v_r.number,
        v_link);
    end if;
  end loop;
  -- Хуучин «батлах» мэдэгдлийг уншсан болгоно (мөр устгахгүй).
  update public.notifications set read_at = now()
   where type = 'crm2_brokerage_pending' and read_at is null;
  perform public.crm2_rpc_end(v_flag);
end $do$;

-- ── §11. 'pending' төлөв дахин үүсэхгүй (enum утгыг устгах боломжгүй тул CHECK) ─────────────────
alter table public.crm2_brokerage_contracts drop constraint if exists crm2_brokerage_no_pending;
alter table public.crm2_brokerage_contracts
  add constraint crm2_brokerage_no_pending check (status <> 'pending');

-- ── §12. Эрх, тайлбар ─────────────────────────────────────────────────────────
revoke all on function public.crm2_brokerage_register(uuid, date, boolean) from public, anon;
grant execute on function public.crm2_brokerage_register(uuid, date, boolean) to authenticated, service_role;
revoke all on function public.crm2_brokerage_invalidate(uuid, text) from public, anon;
grant execute on function public.crm2_brokerage_invalidate(uuid, text) to authenticated, service_role;
revoke all on function public.crm2_can_invalidate_brokerage(uuid) from public, anon;
grant execute on function public.crm2_can_invalidate_brokerage(uuid) to authenticated, service_role;
revoke all on function public.crm2_property_try_activate(uuid, boolean) from public, anon, authenticated;
grant execute on function public.crm2_property_try_activate(uuid, boolean) to service_role;
revoke all on function public.crm2_contract_watcher_ids(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.crm2_contract_watcher_ids(uuid, uuid[]) to service_role;
revoke all on function public.crm2_property_autoactivate() from public, anon, authenticated;
grant execute on function public.crm2_property_autoactivate() to service_role;

comment on function public.crm2_brokerage_register(uuid, date, boolean) is
  'Гэрээ бүртгэх (батлах алхамгүй): PMC тамгатай нэг PDF + дуусах огноо + тамганы баталгаа → active; хөрөнгө мэдээлэл бүрэн бол идэвхжинэ; батлагч ба багийн ахлагчид FYI.';
comment on function public.crm2_brokerage_invalidate(uuid, text) is
  '«Гэрээ буруу»: бүртгэгдсэн гэрээг цуцалж (invalidated_*), өөр хүчинтэй гэрээгүй бол хөрөнгийг ноорог болгож нийтлэлийг цэвэрлэнэ; агентад мэдэгдэнэ.';
comment on function public.crm2_can_invalidate_brokerage(uuid) is
  '«Гэрээ буруу» эрх: батлагч (crm2_brokerage_approver) эсвэл хариуцагч/бүртгэгч/үүсгэгчийн багийн ахлагч.';
comment on function public.crm2_contract_watcher_ids(uuid, uuid[]) is
  'Шинэ гэрээний FYI хүлээн авагч: агентуудын багийн ахлагч ∪ roles.approve эрхтэн.';
comment on function public.crm2_property_try_activate(uuid, boolean) is
  'Хүчинтэй гэрээтэй, мэдээлэл бүрэн хөрөнгийг идэвхжүүлнэ (алдаа гарвал warning, false). Зөвхөн дотоод.';
comment on function public.crm2_property_autoactivate() is
  'AFTER trigger: хөрөнгийн мэдээлэл нөхөгдөхөд хүчинтэй гэрээтэй ноорог (эсвэл сунгалт бүртгэгдсэн «гэрээ дууссан») хөрөнгийг идэвхжүүлнэ.';
comment on function public.crm2_brokerage_submit(uuid) is 'ХУУЧИН (20261125): stub — батлах алхам хасагдсан; дараагийн migration-д устгана.';
comment on function public.crm2_brokerage_approve(uuid, text, timestamptz, boolean) is 'ХУУЧИН (20261125): stub — батлах алхам хасагдсан; дараагийн migration-д устгана.';
comment on function public.crm2_brokerage_reject(uuid, text) is 'ХУУЧИН (20261125): stub — батлах алхам хасагдсан; дараагийн migration-д устгана.';
comment on function public.crm2_brokerage_withdraw(uuid) is 'ХУУЧИН (20261125): stub — батлах алхам хасагдсан; дараагийн migration-д устгана.';

notify pgrst, 'reload schema';

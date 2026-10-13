-- ═══════════════════════════════════════════════════════════════════
-- PMC CRM — Объектын сан, бүсчлэл, 3 роль, тохируулгын хөдөлгүүр (U3)
-- DESIGN.md §2.6/§2.7 (crm_matches), F-200–219, F-250–261.
--
-- Шийдвэрүүд:
--  • crm_properties = CRM-ийн ТУСДАА мастер сан (D1) — нийтийн listings-ийг
--    өргөтгөхгүй; publishToSite action listings мөр үүсгэж listing_id-аар синклэнэ.
--  • Статусын машин 4.3.2 — hardcode БИШ: crm_settings key='property_status_transitions'
--    (шилжилт + эрхтэй дүр + нөхцөл) уншдаг guard trigger; идэвхжүүлэлтийн босго
--    crm_property_activation_missing() (дутууг монголоор жагсаана, F-203).
--  • Үнийн түүх (F-208) — trigger; шалтгаан GUC 'crm.reason'-оор (RPC замаар ирнэ).
--  • Бүс автомат (F-207) — zone_directory lookup trigger; гар өөрчлөлтөд шалтгаан заавал.
--  • Эх сурвалжийн роль (F-206) хамгаалагдана — өөрчлөлт зөвхөн RPC
--    crm_reassign_property_role (sales_director/ops_qc + шалтгаан, аудиттай).
--  • crm_matches — оноо/задаргаа/таслах шүүлтүүр/хариу түүхчлэгдэнэ (F-251/256);
--    жингийн хувилбарын холбоос weights_setting_id (детерминистик дахин тооцоо).
--  • Realtime publication-д НЭМЭХГҮЙ (§2.4 гажилт); hard delete policy байхгүй (D9).
--  • active_lease_id / management_agreement_id FK нь 000600-д ALTER-ээр (circular).
-- ═══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 1. ХҮСНЭГТҮҮД
-- ────────────────────────────────────────────────────────────

create table public.crm_properties (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  number        text not null,                              -- Property ID (immutable, F-200)
  name          text not null,
  address       jsonb not null,                             -- {district, khoroo, complex, building, unit}
  branch_id     uuid references public.crm_branches(id),    -- бүсийн лавлахаас автомат (F-207)
  branch_override_reason text,
  service_kind  crm_service_kind not null,
  property_type text not null,                              -- constants: apartment|house|office|retail|land|other
  zone_id       uuid references public.crm_zone_directory(id),
  price         numeric(14,2),
  rent_price    numeric(14,2),
  area_m2       numeric(10,2),
  rooms         int,
  status        crm_property_status not null default 'draft',
  occupancy     crm_occupancy_status,                       -- зөвхөн менежменттэйд (F-210/565)
  vacancy_started_on date,                                  -- F-566
  owner_contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  active_lease_id uuid,                                     -- FK 000600-д (circular)
  management_agreement_id uuid,                             -- FK 000600-д (circular)
  payment_day   int check (payment_day between 1 and 31),
  features      text[] not null default '{}',
  match_tags    jsonb,                                      -- F-209: {location,type,price,goal,special}
  key_location  text,                                       -- F-215 (өөрчлөлт audit-д)
  key_holder_id uuid references public.profiles(id),
  listing_id    uuid references public.listings(id),        -- нийтийн сайтын синк (D1)
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (office_id, number)
);
create index crm_properties_status_idx on public.crm_properties (office_id, status);
create index crm_properties_owner_idx  on public.crm_properties (owner_contact_id);
create index crm_properties_zone_idx   on public.crm_properties (zone_id);
create index crm_properties_branch_idx on public.crm_properties (office_id, branch_id);
create index crm_properties_type_idx   on public.crm_properties (office_id, property_type, service_kind);

create table public.crm_property_price_history (             -- F-208
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  field text not null,                                       -- 'price'|'rent_price'
  old_value numeric(14,2),
  new_value numeric(14,2),
  reason text,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_price_history_idx on public.crm_property_price_history (property_id, created_at desc);

create table public.crm_property_roles (                     -- F-206: 3 роль
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  role crm_property_role not null,
  agent_profile_id uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique (property_id, role)
);
create index crm_property_roles_agent_idx on public.crm_property_roles (office_id, agent_profile_id);

create table public.crm_listing_agreements (                 -- F-205
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete restrict,
  number text not null,
  signed_on date not null,
  expires_on date not null,
  special_terms text,
  created_at timestamptz not null default now(),
  constraint crm_listing_agr_dates check (signed_on <= expires_on)
);
create index crm_listing_agr_exp_idx  on public.crm_listing_agreements (office_id, expires_on);
create index crm_listing_agr_prop_idx on public.crm_listing_agreements (property_id, expires_on desc);

create table public.crm_vacancy_periods (                    -- F-566/567
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now()
);
create index crm_vacancy_prop_idx on public.crm_vacancy_periods (property_id, started_on desc);

create table public.crm_meters (                             -- F-214/580
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  meter_type text not null,
  serial text,
  created_at timestamptz not null default now()
);
create index crm_meters_prop_idx on public.crm_meters (property_id);

create table public.crm_meter_readings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  meter_id uuid not null references public.crm_meters(id) on delete cascade,
  reading numeric(12,2) not null,
  read_on date not null,
  photo_doc_id uuid,                                         -- FK-гүй (crm_documents 000500-д)
  inspection_id uuid,                                        -- FK-гүй (crm_inspections 000600-д)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index crm_meter_readings_idx on public.crm_meter_readings (meter_id, read_on desc);

-- Тохируулга (F-250–261). Түүх хадгалагдана: (profile, property, computed_at) unique.
create table public.crm_matches (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  need_profile_id uuid not null references public.crm_need_profiles(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id) on delete cascade,
  direction text not null default 'profile_to_property'
    check (direction in ('profile_to_property', 'property_to_profile')),  -- урвуу = F-254
  score numeric(5,2) not null,
  breakdown jsonb not null,                                  -- шалгуур бүрийн задаргаа (F-251)
  strength text not null check (strength in ('strong', 'possible', 'weak')),
  deal_breaker_hit boolean not null default false,           -- F-252
  deal_breaker_reasons text[] not null default '{}',
  manual_override_reason text,                               -- сул/таслагдсаныг гараар санал болгоход заавал
  weights_setting_id uuid references public.crm_settings(id),-- ямар жингийн хувилбараар тооцсон
  suggested_at timestamptz,
  suggested_by uuid references public.profiles(id),
  response crm_match_response,
  response_reason text,
  responded_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (need_profile_id, property_id, computed_at)
);
create index crm_matches_profile_idx  on public.crm_matches (need_profile_id, score desc);
create index crm_matches_property_idx on public.crm_matches (property_id, score desc);
create index crm_matches_office_idx   on public.crm_matches (office_id, computed_at desc);

-- ────────────────────────────────────────────────────────────
-- 2. RLS HELPER (§3.1 — plpgsql, definer)
-- ────────────────────────────────────────────────────────────

-- Объектыг ЗАСАХ эрх (§1.2 «Объект» мөр): үүсгэгч / ролтой агент /
-- team_lead (багийн агентын листинг, ХЗ-б) / sales_director (ХЗ-к) /
-- property_manager (ХҮЗ-т). ops_qc/ceo/finance/aml/marketing — зөвхөн харах.
create or replace function public.crm_can_edit_property(p uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if public.has_crm_role('sales_director', 'property_manager') then
    return exists (
      select 1 from public.crm_properties pr
      where pr.id = p and pr.office_id = public.crm_office_id()
    );
  end if;
  select exists (
    select 1 from public.crm_properties pr
    where pr.id = p
      and pr.office_id = public.crm_office_id()
      and (
        pr.created_by = auth.uid()
        or exists (
          select 1 from public.crm_property_roles r
          where r.property_id = pr.id
            and (r.agent_profile_id = auth.uid()
                 or public.crm_is_team_of(r.agent_profile_id))
        )
      )
  ) into ok;
  return ok;
end $$;

-- Тохируулгын мөрийг харах/үйлдэх эрх (§1.2 «Тохируулга»): marketing/finance/
-- aml_officer/sysadmin ДАНГААРАА хандахгүй; бусад нь контакт эсвэл объектын
-- эрхээ дагана (agent-ө, team_lead-б, SD/ops_qc/ceo-к, PM-т).
create or replace function public.crm_can_view_match(p_profile uuid, p_property uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_contact uuid;
begin
  if not (public.crm_my_roles() && '{agent,team_lead,sales_director,ops_qc,property_manager,ceo}'::crm_role[]) then
    return false;
  end if;
  if public.crm_is_manager() or public.has_crm_role('property_manager') then
    return true;  -- оффисын хүрээ policy-ийн office_id нөхцөлд шалгагдана
  end if;
  select contact_id into v_contact from public.crm_need_profiles where id = p_profile;
  if v_contact is not null and public.crm_can_view_contact(v_contact) then
    return true;
  end if;
  return public.crm_can_edit_property(p_property);
end $$;

-- ────────────────────────────────────────────────────────────
-- 3. ИДЭВХЖҮҮЛЭЛТИЙН БОСГО (F-203)
-- ────────────────────────────────────────────────────────────

-- Мөрөн дээрх шалгалт (guard NEW-ээр дуудна; RPC хадгалагдсан мөрөөр).
-- Дутуу шаардлага бүр монгол текстээр — UI checklist + exception мессежид.
create or replace function public.crm_property_activation_missing(p public.crm_properties)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  missing text[] := '{}';
  min_photos int;
  photo_count int := 0;
  is_rental boolean := p.service_kind in ('standard_rental', 'managed_rental');
begin
  -- Заавал талбарууд (4.3.1)
  if coalesce(btrim(p.name), '') = '' then missing := missing || 'Нэр'; end if;
  if coalesce(btrim(p.address->>'district'), '') = '' then missing := missing || 'Хаяг (дүүрэг)'; end if;
  if p.branch_id is null then missing := missing || 'Нутаг дэвсгэрийн салбар'; end if;
  if is_rental then
    if p.rent_price is null or p.rent_price <= 0 then missing := missing || 'Түрээсийн үнэ'; end if;
  else
    if p.price is null or p.price <= 0 then missing := missing || 'Үнэ'; end if;
  end if;
  if p.area_m2 is null or p.area_m2 <= 0 then missing := missing || 'Талбай (м²)'; end if;
  if p.property_type = 'apartment' and coalesce(p.rooms, 0) <= 0 then
    missing := missing || 'Өрөөний тоо';
  end if;

  -- Тохируулгын шошго — 5 бүлгээс дор хаяж байршил, төрөл (F-209)
  if p.match_tags is null
     or coalesce(jsonb_array_length(case jsonb_typeof(p.match_tags->'location')
          when 'array' then p.match_tags->'location' else '[]'::jsonb end), 0) = 0 then
    missing := missing || 'Тохируулгын шошго (байршил)';
  end if;
  if p.match_tags is null
     or coalesce(jsonb_array_length(case jsonb_typeof(p.match_tags->'type')
          when 'array' then p.match_tags->'type' else '[]'::jsonb end), 0) = 0 then
    missing := missing || 'Тохируулгын шошго (төрөл)';
  end if;

  -- Идэвхтэй листингийн гэрээ (F-205)
  if not exists (
    select 1 from public.crm_listing_agreements a
    where a.property_id = p.id and a.expires_on >= current_date
  ) then
    missing := missing || 'Идэвхтэй листингийн гэрээ';
  end if;

  -- Зургийн доод тоо (F-204) — crm_documents 000500-д үүснэ; байхгүй үед 0 гэж
  -- тооцно (аюулгүй тал: чимээгүй тэнцэхгүй). entity = 'property' — 000500-ийн
  -- баримтын холбоосын конвенц (transaction/property/contact/… богино нэр).
  min_photos := coalesce((public.crm_setting_at(p.office_id, 'photo_min_count') #>> '{}')::int, 3);
  if to_regclass('public.crm_document_links') is not null then
    execute
      'select count(*) from public.crm_document_links dl
        join public.crm_documents d on d.id = dl.document_id
       where dl.entity = ''property'' and dl.entity_id = $1 and d.category = ''photo'''
      into photo_count using p.id;
  end if;
  if photo_count < min_photos then
    missing := missing || format('Зураг (доод тал нь %s, одоо %s)', min_photos, photo_count);
  end if;

  return missing;
end $$;

-- RPC хэлбэр — UI checklist (ActivationChecklist) уншина.
create or replace function public.crm_property_activation_check(p_property uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare rec public.crm_properties;
begin
  select * into rec from public.crm_properties
   where id = p_property and office_id = public.crm_office_id();
  if rec.id is null then raise exception 'CRM: объект олдсонгүй эсвэл оффисын эрхгүй'; end if;
  return public.crm_property_activation_missing(rec);
end $$;

-- ────────────────────────────────────────────────────────────
-- 4. TRIGGER ФУНКЦУУД
-- ────────────────────────────────────────────────────────────

-- Бүс автомат (F-207): zone → branch; гараар өөр салбар сонговол шалтгаан заавал.
create or replace function public.crm_property_zone_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare zone_branch uuid;
begin
  if new.zone_id is not null then
    select branch_id into zone_branch
      from public.crm_zone_directory
     where id = new.zone_id and office_id = new.office_id;
    if zone_branch is null then
      raise exception 'CRM: бүсийн лавлах олдсонгүй (өөр оффисын бүс байж болзошгүй)';
    end if;
    if new.branch_id is null then
      new.branch_id := zone_branch;
      new.branch_override_reason := null;
    elsif new.branch_id is distinct from zone_branch
          and coalesce(btrim(new.branch_override_reason), '') = '' then
      raise exception 'CRM: бүсийн салбараас өөр салбар сонгоход шалтгаан заавал (F-207)';
    end if;
  end if;
  return new;
end $$;

-- Статусын машин (F-202, 4.3.2) — шилжилтийн хүснэгт settings-ээс (D4).
-- Идэвхжүүлэлтэд босгын шалгалт (F-203); шилжилт бүр audit_log-т (F-218).
create or replace function public.crm_property_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  rule jsonb;
  my_roles crm_role[];
  rule_roles crm_role[];
  missing text[];
  v_reason text := nullif(btrim(coalesce(current_setting('crm.reason', true), '')), '');
begin
  if new.status is not distinct from old.status then return new; end if;

  -- Систем (service role / cron) — шилжилтийг зөвшөөрнө, аудит хэвээр.
  if auth.uid() is not null then
    cfg := public.crm_setting_at(new.office_id, 'property_status_transitions');
    select t into rule
      from jsonb_array_elements(coalesce(cfg->'transitions', '[]'::jsonb)) t
     where t->>'from' = old.status::text and t->>'to' = new.status::text
     limit 1;
    if rule is null then
      raise exception 'CRM: статусын шилжилт зөвшөөрөгдөөгүй (% → %)', old.status, new.status;
    end if;

    my_roles := public.crm_my_roles();
    select coalesce(array_agg(r::crm_role), '{}')
      into rule_roles
      from jsonb_array_elements_text(coalesce(rule->'roles', '[]'::jsonb)) r
     where r = any (select unnest(enum_range(null::crm_role))::text);
    if cardinality(rule_roles) > 0 and not (my_roles && rule_roles) then
      raise exception 'CRM: танд «% → %» шилжилтийн эрх алга', old.status, new.status;
    end if;

    if coalesce((rule->>'reason')::boolean, false) and v_reason is null then
      raise exception 'CRM: энэ шилжилтэд шалтгаан заавал (RPC crm_set_property_status-аар)';
    end if;

    if rule->>'check' = 'activation' then
      missing := public.crm_property_activation_missing(new);
      if cardinality(missing) > 0 then
        raise exception 'CRM: идэвхжүүлэлтийн босго дутуу — %', array_to_string(missing, '; ');
      end if;
    end if;
  end if;

  -- Аудит (F-218): хэн/хэзээ/хуучин/шинэ/шалтгаан.
  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (new.office_id, auth.uid(), 'crm_properties', new.id, 'status', 'status',
          to_jsonb(old.status::text), to_jsonb(new.status::text), v_reason);
  return new;
end $$;

-- Үнийн түүх (F-208): price/rent_price өөрчлөлт бүр мөр болно; шалтгаан GUC-ээс.
create or replace function public.crm_property_price_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(btrim(coalesce(current_setting('crm.reason', true), '')), '');
begin
  if new.price is distinct from old.price then
    insert into public.crm_property_price_history (office_id, property_id, field, old_value, new_value, reason, changed_by)
    values (new.office_id, new.id, 'price', old.price, new.price, v_reason, coalesce(auth.uid(), new.created_by));
  end if;
  if new.rent_price is distinct from old.rent_price then
    insert into public.crm_property_price_history (office_id, property_id, field, old_value, new_value, reason, changed_by)
    values (new.office_id, new.id, 'rent_price', old.rent_price, new.rent_price, v_reason, coalesce(auth.uid(), new.created_by));
  end if;
  return new;
end $$;

-- Ашиглалтын статус ↔ сул хоногийн мөчлөг (F-566/567) — BEFORE: багана.
create or replace function public.crm_property_occupancy_col()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.occupancy = 'vacant' then
      new.vacancy_started_on := coalesce(new.vacancy_started_on, current_date);
    end if;
    return new;
  end if;
  if new.occupancy is distinct from old.occupancy then
    if new.occupancy = 'vacant' then
      new.vacancy_started_on := coalesce(new.vacancy_started_on, current_date);
    elsif old.occupancy = 'vacant' then
      new.vacancy_started_on := null;
    end if;
  end if;
  return new;
end $$;

-- AFTER (definer): vacancy_periods нээх/хаах.
create or replace function public.crm_property_occupancy_periods()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.occupancy = 'vacant' then
      insert into public.crm_vacancy_periods (office_id, property_id, started_on)
      values (new.office_id, new.id, coalesce(new.vacancy_started_on, current_date));
    end if;
    return new;
  end if;
  if new.occupancy is distinct from old.occupancy then
    if new.occupancy = 'vacant' then
      if not exists (
        select 1 from public.crm_vacancy_periods v
        where v.property_id = new.id and v.ended_on is null
      ) then
        insert into public.crm_vacancy_periods (office_id, property_id, started_on)
        values (new.office_id, new.id, coalesce(new.vacancy_started_on, current_date));
      end if;
    elsif old.occupancy = 'vacant' then
      update public.crm_vacancy_periods
         set ended_on = current_date
       where property_id = new.id and ended_on is null;
    end if;
  end if;
  return new;
end $$;

-- Түлхүүрийн байршил/хариуцагчийн өөрчлөлт бүр түүхтэй (F-215).
create or replace function public.crm_property_key_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key_location is distinct from old.key_location
     or new.key_holder_id is distinct from old.key_holder_id then
    insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value)
    values (new.office_id, auth.uid(), 'crm_properties', new.id, 'update', 'key',
            jsonb_build_object('key_location', old.key_location, 'key_holder_id', old.key_holder_id),
            jsonb_build_object('key_location', new.key_location, 'key_holder_id', new.key_holder_id));
  end if;
  return new;
end $$;

-- Эх сурвалжийн ролийн хамгаалалт (F-206): өөрчлөлт зөвхөн RPC-ээр (GUC туг).
create or replace function public.crm_property_role_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'sourcing' and coalesce(current_setting('crm.role_rpc', true), '') <> '1' then
      raise exception 'CRM: эх сурвалжийн ролийг устгахыг хориглоно (F-206)';
    end if;
    return old;
  end if;
  if old.role = 'sourcing'
     and (new.agent_profile_id is distinct from old.agent_profile_id or new.role is distinct from old.role)
     and coalesce(current_setting('crm.role_rpc', true), '') <> '1' then
    raise exception 'CRM: эх сурвалжийн ролийг зөвхөн эрх бүхий шилжүүлэлтээр (RPC) өөрчилнө (F-206)';
  end if;
  return new;
end $$;

-- ────────────────────────────────────────────────────────────
-- 5. RPC-ууд (§2.2 definer дүрэм: office + дүр шалгалт дотроо)
-- ────────────────────────────────────────────────────────────

-- Статус солих нэг зам: шалтгааныг GUC-д тавьж guard-д дамжуулна.
create or replace function public.crm_set_property_status(
  p_property uuid, p_status crm_property_status, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare rec public.crm_properties;
begin
  select * into rec from public.crm_properties
   where id = p_property and office_id = public.crm_office_id();
  if rec.id is null then raise exception 'CRM: объект олдсонгүй эсвэл оффисын эрхгүй'; end if;
  if not public.crm_can_edit_property(p_property)
     and not public.has_crm_role('ops_qc') then  -- ops_qc: sold/withdrawn шилжилтэд (4.3.2)
    raise exception 'CRM: танд энэ объектын статус өөрчлөх эрх алга';
  end if;
  perform set_config('crm.reason', coalesce(p_reason, ''), true);
  update public.crm_properties set status = p_status where id = p_property;
  perform set_config('crm.reason', '', true);
end $$;

-- Үнэ өөрчлөх нэг зам (F-208): шалтгаан заавал, түүх trigger-ээр.
create or replace function public.crm_update_property_price(
  p_property uuid, p_price numeric default null, p_rent_price numeric default null, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.crm_properties
    where id = p_property and office_id = public.crm_office_id()
  ) then
    raise exception 'CRM: объект олдсонгүй эсвэл оффисын эрхгүй';
  end if;
  if not public.crm_can_edit_property(p_property) then
    raise exception 'CRM: танд энэ объектын үнэ өөрчлөх эрх алга';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'CRM: үнийн өөрчлөлтөд шалтгаан заавал (F-208)';
  end if;
  perform set_config('crm.reason', p_reason, true);
  update public.crm_properties
     set price = coalesce(p_price, price),
         rent_price = coalesce(p_rent_price, rent_price)
   where id = p_property;
  perform set_config('crm.reason', '', true);
end $$;

-- Эх сурвалжийн (болон бусад) ролийн шилжүүлэлт — sourcing зөвхөн SD/ops_qc,
-- шалтгаан заавал; audit + ownership_history (зарчим 6).
create or replace function public.crm_reassign_property_role(
  p_property uuid, p_role crm_property_role, p_new_agent uuid, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare v_office uuid; v_old uuid;
begin
  select office_id into v_office from public.crm_properties
   where id = p_property and office_id = public.crm_office_id();
  if v_office is null then raise exception 'CRM: объект олдсонгүй эсвэл оффисын эрхгүй'; end if;
  if p_role = 'sourcing' then
    if not public.has_crm_role('sales_director', 'ops_qc') then
      raise exception 'CRM: эх сурвалжийн ролийг зөвхөн Борлуулалтын захирал/ЧМТ шилжүүлнэ (F-206)';
    end if;
  elsif not public.crm_can_edit_property(p_property) then
    raise exception 'CRM: танд энэ объектын роль өөрчлөх эрх алга';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'CRM: ролийн шилжүүлэлтэд шалтгаан заавал';
  end if;

  select agent_profile_id into v_old
    from public.crm_property_roles
   where property_id = p_property and role = p_role;

  perform set_config('crm.role_rpc', '1', true);
  insert into public.crm_property_roles (office_id, property_id, role, agent_profile_id)
  values (v_office, p_property, p_role, p_new_agent)
  on conflict (property_id, role)
  do update set agent_profile_id = excluded.agent_profile_id, assigned_at = now();
  perform set_config('crm.role_rpc', '', true);

  insert into public.crm_audit_log (office_id, actor_id, entity, entity_id, action, field, old_value, new_value, reason)
  values (v_office, auth.uid(), 'crm_property_roles', p_property, 'reassign', p_role::text,
          to_jsonb(v_old::text), to_jsonb(p_new_agent::text), p_reason);
  if p_role = 'sourcing' then
    insert into public.crm_ownership_history (office_id, entity, entity_id, old_owner_id, new_owner_id, reason_code, note, decided_by)
    values (v_office, 'property', p_property, v_old, p_new_agent, 'zoning', p_reason, auth.uid());
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 6. TRIGGER ЗАЛГАЛТ
-- ────────────────────────────────────────────────────────────

create trigger crm_properties_updated_at
  before update on public.crm_properties
  for each row execute function public.crm_set_updated_at();

create trigger crm_properties_immutable
  before update on public.crm_properties
  for each row execute function public.crm_protect_immutable('number', 'office_id', 'created_by', 'created_at');

create trigger crm_properties_zone
  before insert or update of zone_id, branch_id on public.crm_properties
  for each row execute function public.crm_property_zone_sync();

create trigger crm_properties_status
  before update of status on public.crm_properties
  for each row execute function public.crm_property_status_guard();

create trigger crm_properties_price
  after update of price, rent_price on public.crm_properties
  for each row execute function public.crm_property_price_track();

create trigger crm_properties_occupancy_col
  before insert or update of occupancy on public.crm_properties
  for each row execute function public.crm_property_occupancy_col();

create trigger crm_properties_occupancy_periods
  after update of occupancy on public.crm_properties
  for each row execute function public.crm_property_occupancy_periods();

create trigger crm_properties_occupancy_init
  after insert on public.crm_properties
  for each row execute function public.crm_property_occupancy_periods();

create trigger crm_properties_key_audit
  after update of key_location, key_holder_id on public.crm_properties
  for each row execute function public.crm_property_key_audit();

create trigger crm_property_roles_guard
  before update or delete on public.crm_property_roles
  for each row execute function public.crm_property_role_guard();

-- Санал болголт/хариуг өөрчлөхөөс бусад тооцооллын талбар immutable (F-251/256 түүхчлэл).
create trigger crm_matches_immutable
  before update on public.crm_matches
  for each row execute function public.crm_protect_immutable(
    'need_profile_id', 'property_id', 'office_id', 'score', 'breakdown', 'strength',
    'deal_breaker_hit', 'computed_at'
  );

-- ────────────────────────────────────────────────────────────
-- 7. RLS
-- ────────────────────────────────────────────────────────────

alter table public.crm_properties            enable row level security;
alter table public.crm_property_price_history enable row level security;
alter table public.crm_property_roles        enable row level security;
alter table public.crm_listing_agreements    enable row level security;
alter table public.crm_vacancy_periods       enable row level security;
alter table public.crm_meters                enable row level security;
alter table public.crm_meter_readings        enable row level security;
alter table public.crm_matches               enable row level security;

-- Объект: дундын сан — sysadmin-ээс бусад бүх дүр харна (§1.2 ACC-14).
create policy crm_properties_select on public.crm_properties for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_roles()) && '{agent,team_lead,sales_director,ops_qc,marketing,property_manager,finance,aml_officer,ceo}'::crm_role[]
  );
create policy crm_properties_insert on public.crm_properties for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.has_crm_role('agent', 'team_lead', 'sales_director', 'property_manager'))
  );
create policy crm_properties_update on public.crm_properties for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(id));

-- Үнийн түүх: объект харах эрхтэй бүх дүр (F-208 «дэлгэцэд харуулна»); бичилт trigger-ээр л.
create policy crm_price_history_select on public.crm_property_price_history for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_roles()) && '{agent,team_lead,sales_director,ops_qc,marketing,property_manager,finance,aml_officer,ceo}'::crm_role[]
  );

-- Роли: staff харна; онооx нь объект засах эрхтэй нь; sourcing өөрчлөлтийг trigger хамгаална.
create policy crm_property_roles_select on public.crm_property_roles for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_property_roles_insert on public.crm_property_roles for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id));
create policy crm_property_roles_update on public.crm_property_roles for update
  using (
    office_id = (select public.crm_office_id())
    and (public.crm_can_edit_property(property_id) or (select public.has_crm_role('ops_qc')))
  )
  with check (
    office_id = (select public.crm_office_id())
    and (public.crm_can_edit_property(property_id) or (select public.has_crm_role('ops_qc')))
  );

-- Листингийн гэрээ: staff харна; бичилт объект засах эрхтэйд.
create policy crm_listing_agr_select on public.crm_listing_agreements for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_listing_agr_insert on public.crm_listing_agreements for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id));
create policy crm_listing_agr_update on public.crm_listing_agreements for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id));

-- Сул хоногийн мөчлөг: staff харна; бичилт trigger + property_manager (гар залруулга).
create policy crm_vacancy_select on public.crm_vacancy_periods for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_vacancy_write on public.crm_vacancy_periods for insert
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('property_manager')));
create policy crm_vacancy_update on public.crm_vacancy_periods for update
  using (office_id = (select public.crm_office_id()) and (select public.has_crm_role('property_manager')))
  with check (office_id = (select public.crm_office_id()) and (select public.has_crm_role('property_manager')));

-- Тоолуур: staff харна; бичилт объект засах эрхтэй + property_manager.
create policy crm_meters_select on public.crm_meters for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_meters_insert on public.crm_meters for insert
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id));
create policy crm_meters_update on public.crm_meters for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id))
  with check (office_id = (select public.crm_office_id()) and public.crm_can_edit_property(property_id));

create policy crm_meter_readings_select on public.crm_meter_readings for select
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm_my_staff_id()) is not null
  );
create policy crm_meter_readings_insert on public.crm_meter_readings for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and exists (
      select 1 from public.crm_meters m
      where m.id = meter_id and public.crm_can_edit_property(m.property_id)
    )
  );

-- Тохируулга (§1.2): marketing/finance/aml дангаараа хандахгүй; бусад нь эрхээ дагана.
create policy crm_matches_select on public.crm_matches for select
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_match(need_profile_id, property_id)
  );
create policy crm_matches_insert on public.crm_matches for insert
  with check (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_match(need_profile_id, property_id)
  );
create policy crm_matches_update on public.crm_matches for update
  using (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_match(need_profile_id, property_id)
  )
  with check (
    office_id = (select public.crm_office_id())
    and public.crm_can_view_match(need_profile_id, property_id)
  );

-- ────────────────────────────────────────────────────────────
-- 8. GRANT / REVOKE (§2.2 definer дүрэм)
-- ────────────────────────────────────────────────────────────

revoke execute on function public.crm_can_edit_property(uuid) from anon, public;
revoke execute on function public.crm_can_view_match(uuid, uuid) from anon, public;
revoke execute on function public.crm_property_activation_missing(public.crm_properties) from anon, public;
revoke execute on function public.crm_property_activation_check(uuid) from anon, public;
revoke execute on function public.crm_set_property_status(uuid, crm_property_status, text) from anon, public;
revoke execute on function public.crm_update_property_price(uuid, numeric, numeric, text) from anon, public;
revoke execute on function public.crm_reassign_property_role(uuid, crm_property_role, uuid, text) from anon, public;

grant execute on function public.crm_can_edit_property(uuid) to authenticated;
grant execute on function public.crm_can_view_match(uuid, uuid) to authenticated;
grant execute on function public.crm_property_activation_check(uuid) to authenticated;
grant execute on function public.crm_set_property_status(uuid, crm_property_status, text) to authenticated;
grant execute on function public.crm_update_property_price(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.crm_reassign_property_role(uuid, crm_property_role, uuid, text) to authenticated;

-- Зөвхөн дотоод хэрэглээний row-variant RPC биш тул authenticated-д үлдээв;
-- crm_property_activation_missing нь composite параметртэй — PostgREST-ээр
-- дуудагдахгүй ч authenticated-аас хураана (guard/RPC дотроос л дуудагдана).
revoke execute on function public.crm_property_activation_missing(public.crm_properties) from authenticated;

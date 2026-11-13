-- ============================================================
-- CRM v2 · 1-р шат (T01–T08): суурь ба бүртгэл.
--
-- Хамрах зүйл: Staff хөрөнгийн сан (гэрээтэй хөрөнгө), хөрөнгийн хувийн
-- талбар, медиа, төсөл, зуучлалын гэрээ (хувилбартай), харилцагч (олон
-- дугаар), шаардлага (өмнөх хувилбар хадгална), хөрөнгө×харилцагчийн хэлцэл,
-- дуудлага/үзүүлэлт, ажил (дараагийн алхам), өөрчлөлтийн түүх, хүсэлт/батлалт,
-- тохиргоо, эрх.
--
-- Хуучин crm_* хүснэгт, функцэд гар хүрэхгүй. Дахин ашиглана: crm_staff,
-- crm_teams, crm_office_id(), crm_my_staff_id(), crm_my_roles(), has_crm_role(),
-- crm_is_manager(), crm_my_team(), crm_is_panel_admin(), jwt_role(), notifications.
--
-- Зарчим:
--  * Бүх crm2_ хүснэгт office_id-тэй, RLS идэвхтэй; helper нь security definer,
--    search_path = public; anon/public-аас бүх эрх хураана.
--  * Төлөв, хариуцагч, батлалт, баталгаажуулалтыг зөвхөн RPC өөрчилнө
--    (guard trigger + транзакцын 'crm2.rpc' туг). Хуурамч туг тавих зам байхгүй:
--    set_config-ийг PostgREST-ээр дуудах боломжгүй.
--  * Hard delete байхгүй (медиа, гэрээний ноорог файл, утаснаас бусад).
--    Түүхийг crm2_history-д trigger бичнэ (хэн, хэзээ, хуучин/шинэ утга).
--  * Тохируулж болох бизнес дүрэм crm2_settings-д; анхдагч утга
--    crm2_setting_default()-д. Админ эрх санхүүгийн эрх олгохгүй.
--  * Цаг: Улаанбаатар (Asia/Ulaanbaatar) — crm2_today().
-- ============================================================

-- ── 0. Төрлүүд ──────────────────────────────────────────────────────────────

create type public.crm2_property_category as enum ('rent', 'lease', 'managed_rent', 'sale');
create type public.crm2_property_status   as enum ('draft', 'active', 'suspended', 'rented', 'sold', 'contract_ended', 'archived');
create type public.crm2_price_period      as enum ('total', 'month', 'day');
create type public.crm2_media_kind        as enum ('image', 'video');
create type public.crm2_brokerage_status  as enum ('draft', 'pending', 'active', 'expired', 'terminated');
create type public.crm2_commission_type   as enum ('percent', 'fixed');
create type public.crm2_record_status     as enum ('active', 'archived');
create type public.crm2_deal_stage        as enum (
  'interested', 'contacted', 'showing_scheduled', 'shown', 'reshow',
  'negotiating', 'confirmed', 'documents', 'awaiting_payment', 'closed', 'cancelled'
);
create type public.crm2_activity_kind     as enum ('call', 'showing');
create type public.crm2_showing_status    as enum ('scheduled', 'shown', 'cancelled', 'no_show');
create type public.crm2_price_basis       as enum ('total', 'per_m2');
create type public.crm2_task_kind         as enum (
  'call_back', 'showing', 'reshow', 'negotiate', 'send_info', 'brokerage_renewal', 'owner_verify', 'other'
);
create type public.crm2_task_status       as enum ('open', 'done', 'cancelled');
create type public.crm2_request_kind     as enum ('property_status', 'deal_transfer', 'contact_transfer');
create type public.crm2_request_status    as enum ('pending', 'approved', 'rejected', 'cancelled');

-- ── 1. Хүснэгтүүд ───────────────────────────────────────────────────────────

-- Оффисын тохиргоо (түлхүүр бүр нэг мөр; өөрчлөлт бүр crm2_history-д).
create table public.crm2_settings (
  office_id  uuid not null references public.offices(id) on delete restrict,
  key        text not null check (key ~ '^[a-z][a-z0-9_.]{2,79}$'),
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (office_id, key)
);

-- Код олгогч (P001, C001, D001, B001) — зөвхөн definer функц бичнэ.
create table public.crm2_counters (
  office_id uuid not null references public.offices(id) on delete restrict,
  kind      text not null check (kind in ('property', 'contact', 'deal', 'brokerage')),
  prefix    text not null,
  next_no   bigint not null default 1 check (next_no >= 1),
  pad       int not null default 3 check (pad between 1 and 8),
  primary key (office_id, kind)
);

-- Төсөл: өмнө бичсэн нэрийг санал болгоход ашиглана.
create table public.crm2_projects (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null default public.crm_office_id() references public.offices(id) on delete restrict,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  name_key   text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  is_active  boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (office_id, name_key),
  unique (id, office_id)
);
create index crm2_projects_name_trgm on public.crm2_projects using gin (name_key gin_trgm_ops);

-- Харилцагч (үйлчлүүлэгч ба хөрөнгийн эзэн аль аль нь).
create table public.crm2_contacts (
  id                   uuid primary key default gen_random_uuid(),
  office_id            uuid not null default public.crm_office_id() references public.offices(id) on delete restrict,
  code                 text not null default '',
  full_name            text not null check (char_length(btrim(full_name)) between 1 and 160),
  note                 text check (note is null or char_length(note) <= 4000),
  responsible_agent_id uuid not null default auth.uid() references public.profiles(id),
  status               public.crm2_record_status not null default 'active',
  archived_at          timestamptz,
  search_text          text not null default '',
  created_by           uuid not null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_by           uuid,
  updated_at           timestamptz not null default now(),
  unique (office_id, code),
  unique (id, office_id)
);
create index crm2_contacts_responsible_idx on public.crm2_contacts (responsible_agent_id, status);
create index crm2_contacts_office_idx on public.crm2_contacts (office_id, created_at desc);
create index crm2_contacts_search_trgm on public.crm2_contacts using gin (search_text gin_trgm_ops);

-- Харилцагчийн дугаарууд. Жигдрүүлсэн дугаараар хайна; ижил дугаартай
-- хоёр өөр хүнийг автоматаар нэгтгэхгүй (оффис дотор давхцаж болно).
create table public.crm2_contact_phones (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null,
  contact_id uuid not null,
  phone      text not null check (char_length(btrim(phone)) between 4 and 40),
  phone_norm text not null default '',
  label      text check (label is null or char_length(label) <= 40),
  is_primary boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict,
  unique (contact_id, phone_norm)
);
create index crm2_contact_phones_norm_idx on public.crm2_contact_phones (office_id, phone_norm);
create unique index crm2_contact_phones_primary on public.crm2_contact_phones (contact_id) where is_primary;

-- Staff хөрөнгө: компанитай зуучлалын гэрээтэй хөрөнгийн карт.
create table public.crm2_properties (
  id                      uuid primary key default gen_random_uuid(),
  office_id               uuid not null default public.crm_office_id() references public.offices(id) on delete restrict,
  code                    text not null default '',
  category                public.crm2_property_category not null,
  property_type           text check (property_type is null or property_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  status                  public.crm2_property_status not null default 'draft',
  status_reason           text check (status_reason is null or char_length(status_reason) <= 2000),
  status_changed_at       timestamptz not null default now(),
  activated_at            timestamptz,
  project_id              uuid,
  -- Дүүрэг: тохиргооны property.districts жагсаалтаас (nemi.mn listings.district-тэй ижил бичлэг).
  district                text check (district is null or char_length(district) <= 60),
  location_text           text check (location_text is null or char_length(location_text) <= 200),
  address_detail          text check (address_detail is null or char_length(address_detail) <= 1000),
  lat                     double precision check (lat is null or lat between -90 and 90),
  lng                     double precision check (lng is null or lng between -180 and 180),
  pin_address             text check (pin_address is null or char_length(pin_address) <= 300),
  area_m2                 numeric(12,2) check (area_m2 is null or (area_m2 > 0 and area_m2 < 10000000)),
  rooms                   smallint check (rooms is null or rooms between 0 and 100),
  floor                   smallint check (floor is null or floor between -10 and 300),
  building_floors         smallint check (building_floors is null or building_floors between 1 and 300),
  price                   numeric(16,2) check (price is null or price >= 0),
  currency                text not null default 'MNT' check (currency in ('MNT', 'USD')),
  price_period            public.crm2_price_period not null default 'total',
  price_basis             public.crm2_price_basis not null default 'total',
  -- Тааруулалтад ашиглах нийт үнэ (м²-ын үнэ бол × талбай).
  price_total             numeric generated always as
                          (round(case when price_basis = 'per_m2' then price * area_m2 else price end, 2)) stored,
  year_in_use             smallint check (year_in_use is null or year_in_use between 1900 and 2100),
  operating_cost          numeric(14,2) check (operating_cost is null or operating_cost >= 0),
  operating_cost_currency text not null default 'MNT' check (operating_cost_currency in ('MNT', 'USD')),
  operating_cost_period   public.crm2_price_period not null default 'month',
  operating_cost_note     text check (operating_cost_note is null or char_length(operating_cost_note) <= 1000),
  condition               text check (condition is null or char_length(condition) <= 4000),
  view_note               text check (view_note is null or char_length(view_note) <= 4000),
  notes                   text check (notes is null or char_length(notes) <= 8000),
  advantages              text check (advantages is null or char_length(advantages) <= 4000),
  -- Онцлог (тохиргооны property.features түлхүүрүүд) — тааруулалтын зайлшгүй нөхцөлд.
  features                text[] not null default '{}' check (cardinality(features) <= 40),
  -- Талбар тус бүрийн эх бичвэр/нэмэлт тайлбар (жишээ: {"price": "...", "rooms": "..."}).
  field_notes             jsonb not null default '{}'
                          check (jsonb_typeof(field_notes) = 'object' and pg_column_size(field_notes) <= 16000),
  available_from          date,
  availability_note       text check (availability_note is null or char_length(availability_note) <= 1000),
  listing_agent_id        uuid references public.profiles(id),
  contract_agent_id       uuid references public.profiles(id),
  photo_agent_id          uuid references public.profiles(id),
  brokerage_end_date      date,          -- батлагдсан идэвхтэй гэрээний хамгийн хожуу дуусах огноо (trigger)
  last_verified_at        timestamptz,   -- эзэнтэй мэдээллээ хамгийн сүүлд тулгасан
  last_verified_by        uuid,
  search_text             text not null default '',
  created_by              uuid not null default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_by              uuid,
  updated_at              timestamptz not null default now(),
  constraint crm2_properties_pin check ((lat is null) = (lng is null)),
  constraint crm2_properties_floor check (floor is null or building_floors is null or floor <= building_floors),
  constraint crm2_properties_per_m2 check (price_basis = 'total' or area_m2 is not null),
  unique (office_id, code),
  unique (id, office_id),
  foreign key (project_id, office_id) references public.crm2_projects (id, office_id) on delete restrict
);
create index crm2_properties_list_idx on public.crm2_properties (office_id, status, created_at desc);
create index crm2_properties_activated_idx on public.crm2_properties (office_id, status, activated_at desc nulls last);
create index crm2_properties_district_idx on public.crm2_properties (office_id, district, status, created_at desc);
create index crm2_properties_features_gin on public.crm2_properties using gin (features);
create index crm2_properties_category_idx on public.crm2_properties (office_id, category, status, created_at desc);
create index crm2_properties_created_idx on public.crm2_properties (office_id, created_at desc);
create index crm2_properties_project_idx on public.crm2_properties (project_id) where project_id is not null;
create index crm2_properties_location_trgm on public.crm2_properties using gin (location_text gin_trgm_ops);
create index crm2_properties_search_trgm on public.crm2_properties using gin (search_text gin_trgm_ops);
create index crm2_properties_listing_idx on public.crm2_properties (listing_agent_id);
create index crm2_properties_contract_agent_idx on public.crm2_properties (contract_agent_id);
create index crm2_properties_photo_idx on public.crm2_properties (photo_agent_id);
create index crm2_properties_brokerage_end_idx on public.crm2_properties (office_id, brokerage_end_date)
  where status in ('active', 'suspended');

-- Хөрөнгийн хувийн талбар (1:1) — хөрөнгөөс илүү хатуу эрхтэй.
create table public.crm2_property_private (
  property_id          uuid primary key,
  office_id            uuid not null,
  owner_contact_id     uuid,
  owner_note           text check (owner_note is null or char_length(owner_note) <= 4000),
  showing_instructions text check (showing_instructions is null or char_length(showing_instructions) <= 4000),
  updated_by           uuid,
  updated_at           timestamptz not null default now(),
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict,
  foreign key (owner_contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict
);
create index crm2_property_private_owner_idx on public.crm2_property_private (owner_contact_id)
  where owner_contact_id is not null;

-- Медиа: 'crm2-media' bucket-ийн {office}/{property}/... зам, эсвэл видеоны https холбоос.
create table public.crm2_property_media (
  id           uuid primary key default gen_random_uuid(),
  office_id    uuid not null,
  property_id  uuid not null,
  kind         public.crm2_media_kind not null default 'image',
  storage_path text unique,
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 1000)),
  mime_type    text,
  size_bytes   bigint,
  caption      text check (caption is null or char_length(caption) <= 300),
  sort_order   int not null default 0,
  is_cover     boolean not null default false,
  uploaded_by  uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint crm2_property_media_source check ((storage_path is null) <> (external_url is null)),
  constraint crm2_property_media_link_video check (external_url is null or kind = 'video'),
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict
);
create index crm2_property_media_property_idx on public.crm2_property_media (property_id, kind, sort_order);
create unique index crm2_property_media_cover on public.crm2_property_media (property_id) where is_cover;

-- Эзэнтэй хийсэн зуучлалын гэрээ. Сунгалт = previous_id-тай шинэ хувилбар.
create table public.crm2_brokerage_contracts (
  id                   uuid primary key default gen_random_uuid(),
  office_id            uuid not null,
  property_id          uuid not null,
  number               text not null default '',
  owner_contact_id     uuid,
  start_date           date,
  end_date             date,
  terms                text check (terms is null or char_length(terms) <= 8000),
  commission_type      public.crm2_commission_type,
  commission_value     numeric(14,4),
  commission_currency  text not null default 'MNT' check (commission_currency in ('MNT', 'USD')),
  commission_note      text check (commission_note is null or char_length(commission_note) <= 2000),
  responsible_agent_id uuid not null references public.profiles(id),
  previous_id          uuid,
  version              int not null default 1 check (version >= 1),
  status               public.crm2_brokerage_status not null default 'draft',
  activate_on_start    boolean not null default false,
  submitted_by         uuid,
  submitted_at         timestamptz,
  approved_by          uuid,
  approved_at          timestamptz,
  approval_note        text check (approval_note is null or char_length(approval_note) <= 2000),
  rejected_by          uuid,
  rejected_at          timestamptz,
  rejection_note       text check (rejection_note is null or char_length(rejection_note) <= 2000),
  terminated_by        uuid,
  terminated_at        timestamptz,
  termination_reason   text check (termination_reason is null or char_length(termination_reason) <= 2000),
  created_by           uuid not null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_by           uuid,
  updated_at           timestamptz not null default now(),
  constraint crm2_brokerage_number check (char_length(number) between 1 and 60),
  constraint crm2_brokerage_dates check (start_date is null or end_date is null or end_date >= start_date),
  constraint crm2_brokerage_complete check (
    status in ('draft', 'terminated')
    or (start_date is not null and end_date is not null and commission_type is not null and commission_value is not null)
  ),
  constraint crm2_brokerage_commission check (
    commission_value is null
    or (commission_value >= 0 and (commission_type is distinct from 'percent' or commission_value <= 100))
  ),
  constraint crm2_brokerage_approved check (status not in ('active', 'expired') or approved_at is not null),
  unique (office_id, number),
  unique (id, office_id),
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict,
  foreign key (owner_contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict,
  foreign key (previous_id, office_id) references public.crm2_brokerage_contracts (id, office_id) on delete restrict
);
create index crm2_brokerage_property_idx on public.crm2_brokerage_contracts (property_id, status, end_date desc);
create index crm2_brokerage_expiry_idx on public.crm2_brokerage_contracts (office_id, end_date) where status = 'active';
create index crm2_brokerage_pending_idx on public.crm2_brokerage_contracts (office_id, submitted_at) where status = 'pending';
create index crm2_brokerage_responsible_idx on public.crm2_brokerage_contracts (responsible_agent_id)
  where status in ('draft', 'pending', 'active');
create index crm2_brokerage_owner_idx on public.crm2_brokerage_contracts (owner_contact_id) where owner_contact_id is not null;
create unique index crm2_brokerage_one_successor on public.crm2_brokerage_contracts (previous_id)
  where previous_id is not null and status <> 'terminated';

-- Гэрээний файл: 'crm2-docs' bucket-ийн {office}/brokerage/{contract}/... зам.
create table public.crm2_brokerage_files (
  id           uuid primary key default gen_random_uuid(),
  office_id    uuid not null,
  contract_id  uuid not null,
  property_id  uuid not null,
  storage_path text not null unique,
  file_name    text check (file_name is null or char_length(file_name) <= 200),
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (contract_id, office_id) references public.crm2_brokerage_contracts (id, office_id) on delete restrict,
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict
);
create index crm2_brokerage_files_contract_idx on public.crm2_brokerage_files (contract_id, created_at);

-- Харилцагчийн шаардлага. Шалгуур өөрчлөгдөхөд өмнөх хувилбар crm2_requirement_versions-д.
create table public.crm2_requirements (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null,
  contact_id    uuid not null,
  purpose       text check (purpose is null or char_length(purpose) <= 200),
  category      public.crm2_property_category,
  property_type text check (property_type is null or property_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  budget_min    numeric(16,2) check (budget_min is null or budget_min >= 0),
  budget_max    numeric(16,2) check (budget_max is null or budget_max >= 0),
  currency      text not null default 'MNT' check (currency in ('MNT', 'USD')),
  price_period  public.crm2_price_period not null default 'total',
  locations     text[] not null default '{}' check (cardinality(locations) <= 30),
  districts     text[] not null default '{}' check (cardinality(districts) <= 20),
  rooms_min    smallint check (rooms_min is null or rooms_min between 0 and 100),
  rooms_max     smallint check (rooms_max is null or rooms_max between 0 and 100),
  area_min      numeric(12,2) check (area_min is null or area_min > 0),
  area_max      numeric(12,2) check (area_max is null or area_max > 0),
  move_in_from  date,
  move_in_note  text check (move_in_note is null or char_length(move_in_note) <= 500),
  must_haves    text[] not null default '{}' check (cardinality(must_haves) <= 30),
  required_features text[] not null default '{}' check (cardinality(required_features) <= 40),
  notes        text check (notes is null or char_length(notes) <= 4000),
  status        public.crm2_record_status not null default 'active',
  version       int not null default 1,
  archived_at   timestamptz,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  constraint crm2_requirements_budget check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint crm2_requirements_rooms check (rooms_min is null or rooms_max is null or rooms_min <= rooms_max),
  constraint crm2_requirements_area check (area_min is null or area_max is null or area_min <= area_max),
  constraint crm2_requirements_period check (category is distinct from 'sale' or price_period = 'total'),
  unique (id, office_id),
  foreign key (contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict
);
create index crm2_requirements_contact_idx on public.crm2_requirements (contact_id, status);
create index crm2_requirements_active_idx on public.crm2_requirements (office_id, category) where status = 'active';
create index crm2_requirements_districts_gin on public.crm2_requirements using gin (districts) where status = 'active';

create table public.crm2_requirement_versions (
  id             bigint generated always as identity primary key,
  office_id      uuid not null,
  requirement_id uuid not null references public.crm2_requirements(id) on delete restrict,
  contact_id     uuid not null,
  version        int not null,
  snapshot       jsonb not null,
  replaced_by    uuid,
  replaced_at    timestamptz not null default now(),
  unique (requirement_id, version)
);

-- Хэлцэл = нэг хөрөнгө × нэг харилцагч. Нэг хосод нэг л нээлттэй хэлцэл.
create table public.crm2_deals (
  id                 uuid primary key default gen_random_uuid(),
  office_id          uuid not null,
  code               text not null default '',
  property_id        uuid not null,
  contact_id         uuid not null,
  requirement_id     uuid,
  agent_id           uuid not null references public.profiles(id),
  stage              public.crm2_deal_stage not null default 'interested',
  is_open            boolean generated always as (stage not in ('closed', 'cancelled')) stored,
  stage_changed_at   timestamptz not null default now(),
  note               text check (note is null or char_length(note) <= 4000),
  cancel_reason_code text check (cancel_reason_code is null or cancel_reason_code ~ '^[a-z][a-z0-9_]{0,39}$'),
  cancel_reason      text check (cancel_reason is null or char_length(cancel_reason) <= 2000),
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  closed_at          timestamptz,
  closed_by          uuid,
  confirmed_at       timestamptz,       -- анх «баталгаажсан» шатанд орсон цаг (тайланд)
  -- Цуцлах үед хүчинтэй байсан шаардлагын хувилбар (crm2_requirements.version).
  requirement_version int,
  previous_deal_id   uuid,              -- ижил хөрөнгө×харилцагчийн өмнөх (хаагдсан) хэлцэл
  origin_deal_id     uuid,              -- цуцлагдсан хэлцлээс үүссэн шинэ санал (өөр хөрөнгө)
  last_activity_at   timestamptz,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_by         uuid,
  updated_at         timestamptz not null default now(),
  constraint crm2_deals_cancel check (stage <> 'cancelled' or cancel_reason_code is not null),
  constraint crm2_deals_origin_self check (origin_deal_id is distinct from id),
  unique (office_id, code),
  unique (id, office_id),
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict,
  foreign key (contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict,
  foreign key (requirement_id, office_id) references public.crm2_requirements (id, office_id) on delete restrict,
  foreign key (previous_deal_id, office_id) references public.crm2_deals (id, office_id) on delete restrict,
  foreign key (origin_deal_id, office_id) references public.crm2_deals (id, office_id) on delete restrict
);
create unique index crm2_deals_one_open on public.crm2_deals (property_id, contact_id) where is_open;
create index crm2_deals_origin_idx on public.crm2_deals (origin_deal_id) where origin_deal_id is not null;
create index crm2_deals_property_idx on public.crm2_deals (property_id, created_at desc);
create index crm2_deals_contact_idx on public.crm2_deals (contact_id, created_at desc);
create index crm2_deals_agent_idx on public.crm2_deals (agent_id, is_open, last_activity_at desc);
create index crm2_deals_stage_idx on public.crm2_deals (office_id, stage);

-- Дуудлага ба үзүүлэлт: хэлцэл бүрт олон мөр. Үзүүлэлт товлосон цаг өнгөрөхөд
-- өөрөө «үзүүлсэн» болохгүй — агент бодит цаг, санал хүсэлтээ оруулна.
create table public.crm2_activities (
  id                  uuid primary key default gen_random_uuid(),
  office_id           uuid not null,
  deal_id             uuid not null,
  property_id         uuid not null,
  contact_id          uuid not null,
  kind                public.crm2_activity_kind not null,
  agent_id            uuid not null references public.profiles(id),
  occurred_at         timestamptz,
  scheduled_at        timestamptz,
  showing_status      public.crm2_showing_status,
  result              text check (result is null or char_length(result) <= 2000),
  feedback            text check (feedback is null or char_length(feedback) <= 4000),
  note                text check (note is null or char_length(note) <= 4000),
  source_activity_id  uuid references public.crm2_activities(id) on delete restrict,
  finalized_at        timestamptz,
  voided_at           timestamptz,
  voided_by           uuid,
  void_reason         text check (void_reason is null or char_length(void_reason) <= 1000),
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  updated_by          uuid,
  updated_at          timestamptz not null default now(),
  constraint crm2_activities_call check (
    kind <> 'call' or (showing_status is null and scheduled_at is null and occurred_at is not null)
  ),
  constraint crm2_activities_showing check (kind <> 'showing' or (showing_status is not null and scheduled_at is not null)),
  constraint crm2_activities_shown check (showing_status is distinct from 'shown' or occurred_at is not null),
  constraint crm2_activities_void check (voided_at is null or void_reason is not null),
  foreign key (deal_id, office_id) references public.crm2_deals (id, office_id) on delete restrict,
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict,
  foreign key (contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict
);
create index crm2_activities_deal_idx on public.crm2_activities (deal_id, created_at desc);
-- Картын «Дуудлага/Үзүүлэлт» таб: бодит (эсвэл товлосон) цагаар эрэмбэлнэ.
create index crm2_activities_property_time_idx
  on public.crm2_activities (property_id, kind, (coalesce(occurred_at, scheduled_at, created_at)) desc);
create index crm2_activities_contact_idx on public.crm2_activities (contact_id, created_at desc);
create index crm2_activities_agent_idx on public.crm2_activities (agent_id, kind, scheduled_at);
create index crm2_activities_scheduled_idx on public.crm2_activities (office_id, scheduled_at)
  where kind = 'showing' and showing_status = 'scheduled';

-- Ажил (дараагийн алхам, сануулга): дуудлагаас тусдаа мөр — хариуцагчийг солих,
-- дуудлагагүй ажил (гэрээ сунгах, эзэнтэй тулгах, хүлээлгийн үйлчлүүлэгч) хадгалах.
create table public.crm2_tasks (
  id                 uuid primary key default gen_random_uuid(),
  office_id          uuid not null default public.crm_office_id(),
  kind               public.crm2_task_kind not null,
  status             public.crm2_task_status not null default 'open',
  assignee_id        uuid not null default auth.uid() references public.profiles(id),
  due_at             timestamptz,
  note               text check (note is null or char_length(note) <= 1000),
  property_id        uuid,
  deal_id            uuid,
  contact_id         uuid,
  requirement_id     uuid,
  brokerage_id       uuid,
  source_activity_id uuid references public.crm2_activities(id) on delete restrict,
  done_at            timestamptz,
  done_by            uuid,
  created_by         uuid not null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_by         uuid,
  updated_at         timestamptz not null default now(),
  constraint crm2_tasks_done check ((status = 'done') = (done_at is not null)),
  constraint crm2_tasks_anchor check (num_nonnulls(property_id, deal_id, contact_id, brokerage_id) > 0),
  foreign key (deal_id, office_id) references public.crm2_deals (id, office_id) on delete restrict,
  foreign key (property_id, office_id) references public.crm2_properties (id, office_id) on delete restrict,
  foreign key (contact_id, office_id) references public.crm2_contacts (id, office_id) on delete restrict,
  foreign key (requirement_id, office_id) references public.crm2_requirements (id, office_id) on delete restrict,
  foreign key (brokerage_id, office_id) references public.crm2_brokerage_contracts (id, office_id) on delete restrict
);
create index crm2_tasks_my_open on public.crm2_tasks (assignee_id, due_at) where status = 'open';
create index crm2_tasks_deal_idx on public.crm2_tasks (deal_id) where deal_id is not null;
create index crm2_tasks_contact_idx on public.crm2_tasks (contact_id) where contact_id is not null;
create index crm2_tasks_property_idx on public.crm2_tasks (property_id) where property_id is not null;
create index crm2_tasks_brokerage_idx on public.crm2_tasks (brokerage_id) where brokerage_id is not null;

-- Талбарын түвшний өөрчлөлтийн түүх (зөвхөн trigger/definer бичнэ).
create table public.crm2_history (
  id          bigint generated always as identity primary key,
  office_id   uuid not null,
  entity      text not null check (entity in (
                'property', 'property_private', 'media', 'brokerage', 'brokerage_file',
                'contact', 'phone', 'requirement', 'deal', 'activity', 'task', 'project', 'settings')),
  entity_id   uuid not null,
  property_id uuid,
  contact_id  uuid,
  deal_id     uuid,
  action      text not null,
  field       text,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  actor_id    uuid,
  created_at  timestamptz not null default now(),
  constraint crm2_history_actor_fk foreign key (actor_id) references public.profiles(id) on delete set null
);
create index crm2_history_entity_idx on public.crm2_history (entity, entity_id, created_at desc);
create index crm2_history_property_idx on public.crm2_history (property_id, created_at desc) where property_id is not null;
create index crm2_history_contact_idx on public.crm2_history (contact_id, created_at desc) where contact_id is not null;
create index crm2_history_deal_idx on public.crm2_history (deal_id, created_at desc) where deal_id is not null;
create index crm2_history_office_idx on public.crm2_history (office_id, created_at desc);

-- Агентын хүсэлт (төлөв өөрчлөх, хэлцэл/харилцагч шилжүүлэх) ба шийдвэр.
create table public.crm2_requests (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete restrict,
  kind          public.crm2_request_kind not null,
  target_id     uuid not null,
  property_id   uuid,
  payload       jsonb not null default '{}',
  reason        text check (reason is null or char_length(reason) <= 2000),
  status        public.crm2_request_status not null default 'pending',
  requested_by  uuid not null,
  requested_at  timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000)
);
create unique index crm2_requests_one_pending on public.crm2_requests (kind, target_id) where status = 'pending';
create index crm2_requests_office_idx on public.crm2_requests (office_id, status, requested_at desc);
create index crm2_requests_property_idx on public.crm2_requests (property_id) where property_id is not null;

-- Гэрээ дуусахын сануулга давхардуулахгүйн тэмдэглэл.
create table public.crm2_reminder_log (
  contract_id uuid not null references public.crm2_brokerage_contracts(id) on delete restrict,
  end_date    date not null,
  days_before int not null,
  office_id   uuid not null,
  sent_at     timestamptz not null default now(),
  primary key (contract_id, end_date, days_before)
);

-- ── 2. Энгийн helper-үүд (хүснэгтгүй) ───────────────────────────────────────

create function public.crm2_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Ulaanbaatar')::date;
$$;

create function public.crm2_uuid(p_text text)
returns uuid language sql immutable as $$
  select case when p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_text::uuid end;
$$;

-- Хуучин crm_normalize_phone-тэй ижил дүрэм (8 оронтой → 976 угтвартай).
create function public.crm2_normalize_phone(p_raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if length(d) < 6 then return ''; end if;
  if length(d) = 8 then return '976' || d; end if;
  return d;
end $$;

create function public.crm2_mask_name(p_name text)
returns text language sql immutable as $$
  select left(btrim(coalesce(p_name, '')), 1) || '***';
$$;

create function public.crm2_like_escape(p_text text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

create function public.crm2_status_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'Ноорог'
    when 'active' then 'Идэвхтэй'
    when 'suspended' then 'Түр түдгэлзсэн'
    when 'rented' then 'Түрээслэгдсэн'
    when 'sold' then 'Зарагдсан'
    when 'contract_ended' then 'Гэрээ дууссан'
    when 'archived' then 'Архив'
    else p_status
  end;
$$;

create function public.crm2_missing_text(p_items text[])
returns text language sql immutable as $$
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
      when 'listing_agent_id' then 'листлэгч агент'
      when 'contract_agent_id' then 'гэрээ хийсэн агент'
      when 'photo_agent_id' then 'зураг авсан агент'
      when 'owner' then 'эзэн'
      when 'showing_instructions' then 'үзүүлэх заавар'
      when 'images' then 'зураг'
      when 'brokerage_contract' then 'батлагдсан, хүчинтэй зуучлалын гэрээ'
      when 'start_date' then 'эхлэх огноо'
      when 'end_date' then 'дуусах огноо'
      when 'end_date_past' then 'дуусах огноо өнгөрсөн'
      when 'commission' then 'шимтгэл'
      when 'file' then 'гэрээний файл'
      else x end, ', ')
    from unnest(p_items) x;
$$;

-- Хөрөнгийн төлөвийн зөвшөөрөгдсөн шилжилт (идэвхжүүлэлт гэрээгээр, бусад нь шалтгаантай).
create function public.crm2_property_transition_ok(p_from public.crm2_property_status, p_to public.crm2_property_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'draft'          then p_to in ('active', 'archived')
    when 'active'         then p_to in ('suspended', 'rented', 'sold', 'contract_ended', 'archived')
    when 'suspended'      then p_to in ('active', 'rented', 'sold', 'contract_ended', 'archived')
    when 'rented'         then p_to in ('active', 'sold', 'contract_ended', 'archived')
    when 'sold'           then p_to in ('active', 'archived')
    when 'contract_ended' then p_to in ('active', 'archived')
    when 'archived'       then p_to in ('draft')
    else false
  end;
$$;

-- ── 3. Тохиргоо ─────────────────────────────────────────────────────────────

-- Бүх тохиргооны түлхүүр ба анхдагч утга. Тодорхойгүй түлхүүр → null.
create function public.crm2_setting_default(p_key text)
returns jsonb language sql immutable as $$
  select (case p_key
    when 'property.visibility'            then '"office"'
    when 'property.agent_direct_statuses' then '[]'
    when 'property.activation_required'   then '["location_text", "price", "listing_agent_id", "contract_agent_id"]'
    when 'property.same_agent_multi_role' then 'true'
    when 'property.category_labels'       then '{"rent": "Түрээслэх", "lease": "Хөлслөх", "managed_rent": "Менежментийн үйлчилгээтэй түрээс", "sale": "Зарах"}'
    when 'property.types'                 then '{"apartment": "Орон сууц", "house": "Хувийн сууц", "office": "Оффис", "commercial": "Худалдаа, үйлчилгээ", "land": "Газар", "garage": "Гараж, агуулах", "other": "Бусад"}'
    when 'property.districts'             then '["Баянгол", "Баянзүрх", "Сонгинохайрхан", "Сүхбаатар", "Хан-Уул", "Чингэлтэй", "Налайх", "Багануур", "Багахангай"]'
    when 'property.features'              then '{"parking": "Зогсоол", "garage": "Гараж", "furnished": "Тавилгатай", "balcony": "Тагт", "elevator": "Лифт", "pets": "Тэжээвэр амьтан зөвшөөрнө"}'
    when 'brokerage.require_owner'        then 'true'
    when 'brokerage.require_file'         then 'true'
    when 'brokerage.remind_days_before'   then '[30, 7, 1]'
    when 'brokerage.on_expiry'            then '"contract_ended"'
    when 'approvals.team_lead'            then 'true'
    when 'approvals.office_admin'         then 'false'
    when 'approvals.allow_self'           then '"managers"'
    when 'roles.work'                     then '["agent", "team_lead", "sales_director", "ops_qc", "ceo", "property_manager"]'
    when 'roles.approve'                  then '["sales_director", "ops_qc", "ceo"]'
    when 'roles.finance'                  then '["finance"]'
    when 'contact.foreign_deal'           then '"deny"'
    when 'contact.require_phone'          then 'true'
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
  end)::jsonb;
$$;

create function public.crm2_setting_keys()
returns text[] language sql immutable as $$
  select array[
    'property.visibility', 'property.agent_direct_statuses', 'property.activation_required',
    'property.same_agent_multi_role', 'property.category_labels', 'property.types',
    'property.districts', 'property.features',
    'brokerage.require_owner', 'brokerage.require_file', 'brokerage.remind_days_before', 'brokerage.on_expiry',
    'approvals.team_lead', 'approvals.office_admin', 'approvals.allow_self',
    'roles.work', 'roles.approve', 'roles.finance',
    'contact.foreign_deal', 'contact.require_phone',
    'deal.open_property_statuses', 'deal.auto_advance', 'deal.property_agents_can_view', 'deal.cancel_reasons',
    'showing.require_feedback', 'activity.edit_window_hours',
    'media.max_images', 'media.max_videos', 'media.max_image_mb', 'media.max_video_mb',
    'docs.max_file_mb', 'docs.max_files_per_contract'
  ];
$$;

-- Хүчинтэй утга. Нэвтэрсэн хэрэглэгч зөвхөн өөрийн оффисын утгыг авна
-- (p_office-ийг зөвхөн системийн ажил ашиглана).
create function public.crm2_setting(p_key text, p_office uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value from public.crm2_settings s
      where s.office_id = case when auth.uid() is null then p_office else public.crm_office_id() end
        and s.key = p_key),
    public.crm2_setting_default(p_key)
  );
$$;

create function public.crm2_setting_text(p_key text, p_office uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select public.crm2_setting(p_key, p_office) #>> '{}';
$$;

create function public.crm2_setting_bool(p_key text, p_office uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.crm2_setting(p_key, p_office) #>> '{}')::boolean, false);
$$;

create function public.crm2_setting_int(p_key text, p_office uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select ((public.crm2_setting(p_key, p_office) #>> '{}')::numeric)::int;
$$;

create function public.crm2_setting_roles(p_key text, p_office uuid default null)
returns public.crm_role[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r::public.crm_role), '{}'::public.crm_role[])
    from jsonb_array_elements_text(public.crm2_setting(p_key, p_office)) r
   where r = any (enum_range(null::public.crm_role)::text[]);
$$;

create function public.crm2_has_setting_role(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_my_roles() && public.crm2_setting_roles(p_key);
$$;

-- ── 4. Хэн бэ (дүр, баг) ────────────────────────────────────────────────────

-- Оффисын админ (CRM-ээс гадуурх эрх хаалттай бол үгүй). Анхдагчаар
-- зөвхөн харах эрх өгнө; засах, батлах, санхүү — тусдаа эрхээр.
create function public.crm2_is_office_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_office_id() is not null
     and public.jwt_role() = 'office_admin'::public.user_role
     and public.crm_is_panel_admin();
$$;

create function public.crm2_is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_office_id() is not null
     and (
       exists (select 1 from public.crm_staff s
                where s.profile_id = auth.uid() and s.is_active and s.office_id = public.crm_office_id())
       or public.crm2_is_office_admin()
     );
$$;

-- Хөрөнгө, харилцагч, хэлцэл, дуудлага бүртгэх (ажлын) эрх.
create function public.crm2_can_work()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member()
     and (public.crm2_has_setting_role('roles.work') or public.crm_is_manager());
$$;

-- Ахлагч = team_lead дүртэй БӨГӨӨД crm_teams.lead_profile_id нь би (батлагдсан ахлагч).
-- Зөвхөн дүр нэмэгдсэн гишүүн ахлагчийн эрх авахгүй; мэдэгдэл ч lead_profile_id-д очдог.
create function public.crm2_is_team_lead()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('team_lead')
     and exists (select 1 from public.crm_teams t
                  where t.lead_profile_id = auth.uid() and t.office_id = public.crm_office_id());
$$;

-- Би эдгээрийн аль нэгнийх нь багийн ахлагч мөн үү (идэвхгүй болсон гишүүнийх ч —
-- хүлээлцэхэд ахлагч харсаар байна).
create function public.crm2_is_lead_of_any(p_profiles uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_crm_role('team_lead')
     and exists (
       select 1 from public.crm_staff s
         join public.crm_teams t on t.id = s.team_id and t.office_id = s.office_id
        where s.profile_id = any (p_profiles)
          and s.office_id = public.crm_office_id()
          and t.lead_profile_id = auth.uid()
     );
$$;

create function public.crm2_is_lead_of(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_lead_of_any(array[p_profile]);
$$;

-- Эдгээрийн аль нэг нь миний багийнх уу ('team' харагдацад).
create function public.crm2_in_my_team_any(p_profiles uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_my_team() is not null
     and exists (
       select 1 from public.crm_staff s
        where s.profile_id = any (p_profiles)
          and s.office_id = public.crm_office_id()
          and s.team_id = public.crm_my_team()
     );
$$;

-- Өөрийн хүсэлт/гэрээг өөрөө батлах дүрэм: 'nobody' | 'managers' | 'all'.
create function public.crm2_self_ok(p_involved uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select case public.crm2_setting_text('approvals.allow_self')
           when 'all' then true
           when 'managers' then public.crm_is_manager()
                                or not coalesce(auth.uid() = any (array_remove(p_involved, null)), false)
           else not coalesce(auth.uid() = any (array_remove(p_involved, null)), false)
         end;
$$;

create function public.crm2_can_manage_settings()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member()
     and (public.has_crm_role('sysadmin', 'ceo') or public.crm2_is_office_admin());
$$;

-- Санхүүгийн эрх (T10–T11-д ашиглана): зөвхөн roles.finance жагсаалтаар.
-- Оффисын админ, sysadmin гэдгээрээ энэ эрхийг АВАХГҮЙ (U09).
create function public.crm2_has_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member() and public.crm2_has_setting_role('roles.finance');
$$;

create function public.crm2_profile_name(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.display_name from public.agents a
      where a.profile_id = p_profile and a.display_name is not null
      order by (a.office_id = public.crm_office_id()) desc nulls last
      limit 1),
    (select p.full_name from public.profiles p where p.id = p_profile),
    'Ажилтан'
  );
$$;

-- ── 5. Хандах эрхийн helper-үүд ─────────────────────────────────────────────

create function public.crm2_property_has_valid_contract(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.property_id = p_property
       and b.status = 'active'
       and b.approved_at is not null
       and b.start_date <= public.crm2_today()
       and b.end_date >= public.crm2_today()
  );
$$;

-- Бүх хөрөнгийг (ноорог орно) харах: менежер, оффисын админ, батлах дүрэмтэн.
create function public.crm2_sees_all_properties()
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_is_manager()
      or public.crm2_is_office_admin()
      or public.crm2_has_setting_role('roles.approve');
$$;

-- Хөрөнгийн мөрийг харах (RLS-д мөрийн баганаар дамжуулна — INSERT..RETURNING-д найдвартай).
create function public.crm2_property_visible(
  p_id uuid, p_status public.crm2_property_status, p_created_by uuid,
  p_listing uuid, p_contract uuid, p_photo uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() = any (array_remove(array[p_listing, p_contract, p_photo], null)), false)
      or (p_status = 'draft' and p_created_by = auth.uid())
      or public.crm2_sees_all_properties()
      or (p_status <> 'draft' and case public.crm2_setting_text('property.visibility')
            when 'office' then true
            when 'team' then public.crm2_in_my_team_any(array[p_listing, p_contract, p_photo])
            else false
          end)
      or public.crm2_is_lead_of_any(array[p_listing, p_contract, p_photo])
      or (p_status = 'draft' and public.crm2_is_lead_of(p_created_by))
      or exists (
           select 1 from public.crm2_brokerage_contracts b
            where b.property_id = p_id
              and b.status in ('draft', 'pending', 'active')
              and (b.responsible_agent_id = auth.uid() or public.crm2_is_lead_of(b.responsible_agent_id))
         )
      -- Энэ хөрөнгө дээр хэлцэлтэй (эсвэл түүний ахлагч), дуудлага/үзүүлэлт хийсэн агент
      -- 'team'/'own' харагдацад ч картаа нээнэ.
      or exists (
           select 1 from public.crm2_deals d
            where d.property_id = p_id
              and (d.agent_id = auth.uid() or public.crm2_is_lead_of(d.agent_id))
         )
      or exists (
           select 1 from public.crm2_activities a
            where a.property_id = p_id and a.agent_id = auth.uid()
         );
$$;

create function public.crm2_can_view_property(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_properties x
     where x.id = p_property
       and x.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_property_visible(x.id, x.status, x.created_by, x.listing_agent_id, x.contract_agent_id, x.photo_agent_id)
  );
$$;

-- Хувийн талбар, гэрээ, гэрээний файл: 3 үүрэгт агент, гэрээний хариуцагч,
-- тэдний ахлагч, менежер, батлах дүрэмтэн, оффисын админ (+ ноорог үүсгэгч).
create function public.crm2_can_view_property_private(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_properties x
     where x.id = p_property
       and x.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and (
         coalesce(auth.uid() = any (array_remove(array[x.listing_agent_id, x.contract_agent_id, x.photo_agent_id], null)), false)
         or (x.status = 'draft' and (x.created_by = auth.uid() or public.crm2_is_lead_of(x.created_by)))
         or public.crm_is_manager()
         or public.crm2_is_office_admin()
         or public.crm2_has_setting_role('roles.approve')
         or public.crm2_is_lead_of_any(array[x.listing_agent_id, x.contract_agent_id, x.photo_agent_id])
         or exists (
              select 1 from public.crm2_brokerage_contracts b
               where b.property_id = x.id
                 and b.status in ('draft', 'pending', 'active')
                 and (b.responsible_agent_id = auth.uid() or public.crm2_is_lead_of(b.responsible_agent_id))
            )
       )
  );
$$;

-- Засах эрх: 3 үүрэгт агент (+ ноорог үүсгэгч), тэдний ахлагч, менежер.
create function public.crm2_property_editable(
  p_status public.crm2_property_status, p_created_by uuid, p_listing uuid, p_contract uuid, p_photo uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_is_manager()
      or (public.crm2_can_work() and (
            coalesce(auth.uid() = any (array_remove(array[p_listing, p_contract, p_photo], null)), false)
            or (p_status = 'draft' and p_created_by = auth.uid())
            or public.crm2_is_lead_of_any(array[p_listing, p_contract, p_photo])
            or (p_status = 'draft' and public.crm2_is_lead_of(p_created_by))
         ));
$$;

create function public.crm2_can_edit_property(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_properties x
     where x.id = p_property
       and x.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_property_editable(x.status, x.created_by, x.listing_agent_id, x.contract_agent_id, x.photo_agent_id)
  );
$$;

-- Хөрөнгийн төлөв батлах чадвар (өөрийгөө батлах дүрмийг тусад нь шалгана).
create function public.crm2_property_approver(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_properties x
     where x.id = p_property
       and x.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and (
         public.crm2_has_setting_role('roles.approve')
         or (public.crm2_setting_bool('approvals.team_lead')
             and public.crm2_is_lead_of_any(array[x.listing_agent_id, x.contract_agent_id, x.photo_agent_id]))
         or (public.crm2_setting_bool('approvals.office_admin') and public.crm2_is_office_admin())
       )
  );
$$;

-- Зуучлалын гэрээ батлах чадвар: батлах дүрэмтэн, хариуцагчийн ахлагч, (тохиргоогоор) админ.
create function public.crm2_brokerage_approver(p_responsible uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member()
     and (
       public.crm2_has_setting_role('roles.approve')
       or (public.crm2_setting_bool('approvals.team_lead') and public.crm2_is_lead_of(p_responsible))
       or (public.crm2_setting_bool('approvals.office_admin') and public.crm2_is_office_admin())
     );
$$;

-- Гэрээ (ба скан файл) харах. Хариуцагч зөвхөн хүчинтэй/ажиллаж буй гэрээг, үүсгэгч
-- зөвхөн ноорогоо; бусад тохиолдолд хөрөнгийн хувийн талбар харах эрхээр (үүрэгээс
-- хасагдсан агент хандалтаа алдана).
create function public.crm2_can_view_brokerage(p_contract uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and ((b.status in ('draft', 'pending', 'active') and b.responsible_agent_id = auth.uid())
            or (b.status = 'draft' and b.created_by = auth.uid())
            or public.crm2_is_lead_of(b.responsible_agent_id)
            or public.crm2_can_view_property_private(b.property_id))
  );
$$;

-- Ноорог гэрээ засах/илгээх: хөрөнгийн засварлагч эсвэл гэрээний хариуцагч.
create function public.crm2_can_edit_brokerage_draft(p_contract uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and (public.crm2_can_edit_property(b.property_id)
            or (b.responsible_agent_id = auth.uid() and public.crm2_can_work()))
  );
$$;

-- Файл нэмэх: ноорог үед засварлагч; илгээсэн/батлагдсан үед зөвхөн батлагч
-- (илгээсний дараа хянагдах баримтын багц өөрчлөгдөхгүй).
create function public.crm2_can_attach_brokerage(p_contract uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and (
         (b.status = 'draft' and public.crm2_can_edit_brokerage_draft(b.id))
         or (b.status in ('pending', 'active') and public.crm2_brokerage_approver(b.responsible_agent_id))
       )
  );
$$;

-- Файл устгах: зөвхөн ноорог гэрээнд.
create function public.crm2_can_detach_brokerage(p_contract uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_brokerage_contracts b
     where b.id = p_contract
       and b.office_id = public.crm_office_id()
       and b.status = 'draft'
       and public.crm2_can_edit_brokerage_draft(b.id)
  );
$$;

-- Харилцагч харах: хариуцагч, түүний ахлагч, менежер, тухайн хүнтэй хэлцэлтэй
-- агент (ба ахлагч), дуудлага/үзүүлэлт хийсэн агент, хөрөнгийн эзэн бол хувийн
-- талбар харах эрхтэн.
create function public.crm2_contact_visible(p_id uuid, p_responsible uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_responsible = auth.uid()
      or public.crm_is_manager()
      or public.crm2_is_lead_of(p_responsible)
      or exists (select 1 from public.crm2_deals d
                  where d.contact_id = p_id
                    and (d.agent_id = auth.uid() or public.crm2_is_lead_of(d.agent_id)))
      or exists (select 1 from public.crm2_activities a
                  where a.contact_id = p_id and a.agent_id = auth.uid())
      or exists (select 1 from public.crm2_property_private pp
                  where pp.owner_contact_id = p_id
                    and public.crm2_can_view_property_private(pp.property_id))
      or exists (select 1 from public.crm2_brokerage_contracts b
                  where b.owner_contact_id = p_id
                    and b.status in ('draft', 'pending', 'active')
                    and public.crm2_can_view_property_private(b.property_id));
$$;

create function public.crm2_can_view_contact(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_contacts c
     where c.id = p_contact
       and c.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_contact_visible(c.id, c.responsible_agent_id)
  );
$$;

create function public.crm2_contact_editable(p_responsible uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_is_manager()
      or (public.crm2_can_work() and (p_responsible = auth.uid() or public.crm2_is_lead_of(p_responsible)));
$$;

create function public.crm2_can_edit_contact(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_contacts c
     where c.id = p_contact
       and c.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_contact_editable(c.responsible_agent_id)
  );
$$;

-- Шаардлага засах: харилцагчийн засварлагч + тухайн хүнтэй нээлттэй хэлцэлтэй агент.
create function public.crm2_can_edit_requirements(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_can_edit_contact(p_contact)
      or (public.crm2_can_work()
          and exists (select 1 from public.crm2_deals d
                       where d.contact_id = p_contact and d.is_open and d.agent_id = auth.uid()
                         and d.office_id = public.crm_office_id()));
$$;

-- Хэлцэл харах: хариуцагч, түүний ахлагч, менежер, харилцагчийн хариуцагч (ба
-- ахлагч) — нэгдсэн карт бүх хэлцлийг харуулна, дуудлага/үзүүлэлт хийсэн агент,
-- (тохиргоогоор) хөрөнгийн 3 үүрэгт агент.
create function public.crm2_deal_visible(p_id uuid, p_agent uuid, p_property uuid, p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_agent = auth.uid()
      or public.crm_is_manager()
      or public.crm2_is_lead_of(p_agent)
      or exists (select 1 from public.crm2_contacts c
                  where c.id = p_contact
                    and (c.responsible_agent_id = auth.uid() or public.crm2_is_lead_of(c.responsible_agent_id)))
      or exists (select 1 from public.crm2_activities a where a.deal_id = p_id and a.agent_id = auth.uid())
      or (public.crm2_setting_bool('deal.property_agents_can_view')
          and exists (select 1 from public.crm2_properties x
                       where x.id = p_property
                         and auth.uid() in (x.listing_agent_id, x.contract_agent_id, x.photo_agent_id)));
$$;

create function public.crm2_can_view_deal(p_deal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_deals d
     where d.id = p_deal
       and d.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_deal_visible(d.id, d.agent_id, d.property_id, d.contact_id)
  );
$$;

create function public.crm2_deal_editable(p_agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_is_manager()
      or (public.crm2_can_work() and (p_agent = auth.uid() or public.crm2_is_lead_of(p_agent)));
$$;

create function public.crm2_can_edit_deal(p_deal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_deals d
     where d.id = p_deal
       and d.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_deal_editable(d.agent_id)
  );
$$;

-- Дуудлага/үзүүлэлт засах: хэлцлийн засварлагч, эсвэл тухайн мөрийн агент/бүртгэгч
-- (хугацааны хязгаарыг guard trigger шалгана).
create function public.crm2_activity_editable(p_deal uuid, p_agent uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.crm2_can_work() and (auth.uid() = p_agent or auth.uid() = p_created_by))
      or public.crm2_can_edit_deal(p_deal);
$$;

create function public.crm2_transfer_approver(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member()
     and (
       public.crm2_has_setting_role('roles.approve')
       or (public.crm2_setting_bool('approvals.team_lead')
           and public.crm2_is_lead_of(p_from) and public.crm2_is_lead_of(p_to))
     );
$$;

-- Үзүүлэх заавар (дунд түвшин): хувийн талбар харах эрхтэн + энэ хөрөнгө дээр
-- нээлттэй хэлцэлтэй агент (ба ахлагч) + товлосон үзүүлэлтийн гүйцэтгэгч.
-- Эзний мэдээлэл, эзний тэмдэглэл хатуу түвшиндээ үлдэнэ.
create function public.crm2_can_view_showing_info(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm2_is_member()
     and (
       public.crm2_can_view_property_private(p_property)
       or exists (select 1 from public.crm2_deals d
                   where d.property_id = p_property and d.is_open
                     and d.office_id = public.crm_office_id()
                     and (d.agent_id = auth.uid() or public.crm2_is_lead_of(d.agent_id)))
       or exists (select 1 from public.crm2_activities a
                   where a.property_id = p_property and a.kind = 'showing'
                     and a.office_id = public.crm_office_id()
                     and a.showing_status = 'scheduled' and a.voided_at is null
                     and a.agent_id = auth.uid())
     );
$$;

-- Ажил харах: хариуцагч, үүсгэгч, менежер, хариуцагчийн ахлагч, хэлцлийг харах эрхтэн.
create function public.crm2_task_visible(p_assignee uuid, p_created_by uuid, p_deal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (p_assignee, p_created_by)
      or public.crm_is_manager()
      or public.crm2_is_lead_of(p_assignee)
      or (p_deal is not null and public.crm2_can_view_deal(p_deal));
$$;

create function public.crm2_can_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm2_tasks t
     where t.id = p_task
       and t.office_id = public.crm_office_id()
       and public.crm2_is_member()
       and public.crm2_task_visible(t.assignee_id, t.created_by, t.deal_id)
  );
$$;

create function public.crm2_can_view_history(
  p_entity text, p_entity_id uuid, p_property uuid, p_contact uuid, p_deal uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_entity in ('property', 'media') then public.crm2_can_view_property(p_property)
    when p_entity in ('property_private', 'brokerage', 'brokerage_file') then public.crm2_can_view_property_private(p_property)
    when p_entity in ('contact', 'phone', 'requirement') then public.crm2_can_view_contact(p_contact)
    when p_entity in ('deal', 'activity') then public.crm2_can_view_deal(p_deal)
    when p_entity = 'task' then public.crm2_can_view_task(p_entity_id)
    when p_entity = 'project' then public.crm2_is_member()
    when p_entity = 'settings' then public.crm2_can_manage_settings()
    else false
  end;
$$;

-- Хүсэлт шийдвэрлэх эрх.
create function public.crm2_can_decide_request(p_request uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_from uuid;
  v_to uuid;
begin
  select * into v_r from public.crm2_requests where id = p_request and office_id = public.crm_office_id();
  if not found or v_r.status <> 'pending' or not public.crm2_is_member() then
    return false;
  end if;
  if not public.crm2_self_ok(array[v_r.requested_by]) then
    return false;
  end if;
  if v_r.kind = 'property_status' then
    -- Өөрийн (үүрэгт агент болсон) хөрөнгийн төлөвийг батлахгүй — шууд замтай ижил дүрэм.
    return public.crm2_property_approver(v_r.target_id)
       and public.crm2_self_ok((select array[x.listing_agent_id, x.contract_agent_id, x.photo_agent_id]
                                  from public.crm2_properties x where x.id = v_r.target_id));
  end if;
  v_to := public.crm2_uuid(v_r.payload->>'to_agent');
  if v_r.kind = 'deal_transfer' then
    select agent_id into v_from from public.crm2_deals where id = v_r.target_id;
  else
    select responsible_agent_id into v_from from public.crm2_contacts where id = v_r.target_id;
  end if;
  return public.crm2_transfer_approver(v_from, v_to)
     and public.crm2_self_ok(array[v_to]);
end $$;

-- Storage замын эрх: crm2-media → {office}/{property}/файл.
create function public.crm2_storage_media_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_name))[1] = public.crm_office_id()::text
     and case when p_write
              then public.crm2_can_edit_property(public.crm2_uuid((storage.foldername(p_name))[2]))
              else public.crm2_can_view_property(public.crm2_uuid((storage.foldername(p_name))[2]))
         end;
$$;

-- crm2-docs → {office}/brokerage/{contract}/файл.
create function public.crm2_storage_doc_access(p_name text, p_mode text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_name))[1] = public.crm_office_id()::text
     and (storage.foldername(p_name))[2] = 'brokerage'
     and case p_mode
           when 'read'   then public.crm2_can_view_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           when 'write'  then public.crm2_can_attach_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           when 'delete' then public.crm2_can_detach_brokerage(public.crm2_uuid((storage.foldername(p_name))[3]))
           else false
         end;
$$;

-- ── 6. Дотоод хэрэгслүүд (зөвхөн trigger/RPC дуудна) ───────────────────────

-- RPC туг: хамгаалагдсан баганыг өөрчлөхийг guard-д зөвшөөрнө. Өмнөх утгыг
-- буцааж, төгсгөлд сэргээнэ (дотор дуудагдсан RPC тугийг унтраахгүй).
create function public.crm2_rpc_begin(p_reason text default null)
returns text language plpgsql as $$
declare v_prev text := coalesce(current_setting('crm2.rpc', true), '');
begin
  perform set_config('crm2.rpc', '1', true);
  if p_reason is not null then
    perform set_config('crm2.reason', p_reason, true);
  end if;
  return v_prev;
end $$;

create function public.crm2_rpc_end(p_prev text)
returns void language plpgsql as $$
begin
  perform set_config('crm2.rpc', coalesce(p_prev, ''), true);
  if coalesce(p_prev, '') = '' then
    perform set_config('crm2.reason', '', true);
  end if;
end $$;

-- Системийн (service role/cron) эсвэл RPC доторх өөрчлөлт мөн үү.
create function public.crm2_in_rpc()
returns boolean language sql stable as $$
  select auth.uid() is null or coalesce(current_setting('crm2.rpc', true), '') = '1';
$$;

-- Race-гүй код олгогч: P001 … P999, P1000 …
create function public.crm2_next_code(p_office uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_no bigint;
  v_pad int;
begin
  insert into public.crm2_counters as c (office_id, kind, prefix, next_no, pad)
  values (p_office, p_kind,
          case p_kind when 'property' then 'P' when 'contact' then 'C' when 'deal' then 'D' when 'brokerage' then 'B' end,
          2, 3)
  on conflict (office_id, kind) do update set next_no = c.next_no + 1
  returning c.prefix, c.next_no - 1, c.pad into v_prefix, v_no, v_pad;
  return v_prefix || case when length(v_no::text) >= v_pad then v_no::text else lpad(v_no::text, v_pad, '0') end;
end $$;

create function public.crm2_log(
  p_office uuid, p_entity text, p_entity_id uuid, p_action text,
  p_field text default null, p_old jsonb default null, p_new jsonb default null,
  p_property uuid default null, p_contact uuid default null, p_deal uuid default null,
  p_reason text default null
) returns void language sql security definer set search_path = public as $$
  insert into public.crm2_history
    (office_id, entity, entity_id, property_id, contact_id, deal_id, action, field, old_value, new_value, reason, actor_id)
  values
    (p_office, p_entity, p_entity_id, p_property, p_contact, p_deal, p_action, p_field, p_old, p_new,
     coalesce(p_reason, nullif(current_setting('crm2.reason', true), '')), auth.uid());
$$;

create function public.crm2_notify(p_users uuid[], p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, link)
  select distinct u, p_type, p_title, p_body, p_link
    from unnest(p_users) u
   where u is not null and u is distinct from auth.uid();
$$;

-- Хүсэлтийг хэнд мэдэгдэх: агентуудын багийн ахлагч; ахлагчгүй бол батлах дүрэмтнүүд.
create function public.crm2_approver_ids(p_office uuid, p_agents uuid[])
returns uuid[] language sql stable security definer set search_path = public as $$
  with leads as (
    select distinct t.lead_profile_id as id
      from public.crm_staff s
      join public.crm_teams t on t.id = s.team_id
     where s.office_id = p_office
       and s.profile_id = any (p_agents)
       and t.lead_profile_id is not null
       and public.crm2_setting_bool('approvals.team_lead', p_office)
  ), approvers as (
    select s.profile_id as id
      from public.crm_staff s
     where s.office_id = p_office
       and s.is_active
       and s.roles && public.crm2_setting_roles('roles.approve', p_office)
  )
  select coalesce(array_agg(x.id), '{}'::uuid[])
    from (
      select id from leads
      union
      select id from approvers where not exists (select 1 from leads)
    ) x;
$$;

create function public.crm2_assert_staff(p_profile uuid, p_office uuid, p_label text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_profile is not null and not exists (
    select 1 from public.crm_staff s
     where s.profile_id = p_profile and s.office_id = p_office and s.is_active
  ) then
    raise exception 'CRM: % — CRM-д идэвхтэй ажилтан биш', p_label;
  end if;
end $$;

-- Ажлын дүртэй идэвхтэй ажилтан (хэлцэл/харилцагч хариуцах боломжтой).
create function public.crm2_assert_work_staff(p_profile uuid, p_office uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_profile is null or not exists (
    select 1 from public.crm_staff s
     where s.profile_id = p_profile and s.office_id = p_office and s.is_active
       and (s.roles && public.crm2_setting_roles('roles.work', p_office)
            or s.roles && array['sales_director', 'ops_qc', 'ceo']::public.crm_role[])
  ) then
    raise exception 'CRM: сонгосон хүн хариуцагч болох идэвхтэй агент биш';
  end if;
end $$;

-- Идэвхжүүлэхэд дутуу зүйлс (тохиргооны жагсаалт + хүчинтэй гэрээ).
create function public.crm2_property_missing(p_property uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  v_p public.crm2_properties;
  v_priv public.crm2_property_private;
  v_req text;
  v_missing text[] := '{}';
  v_hit boolean;
begin
  select * into v_p from public.crm2_properties where id = p_property;
  if not found then
    return array['property'];
  end if;
  select * into v_priv from public.crm2_property_private where property_id = p_property;
  for v_req in select jsonb_array_elements_text(public.crm2_setting('property.activation_required', v_p.office_id)) loop
    v_hit := case v_req
      when 'project' then v_p.project_id is null
      when 'district' then v_p.district is null
      when 'location_text' then coalesce(btrim(v_p.location_text), '') = ''
      when 'address_detail' then coalesce(btrim(v_p.address_detail), '') = ''
      when 'pin' then v_p.lat is null
      when 'area_m2' then v_p.area_m2 is null
      when 'rooms' then v_p.rooms is null
      when 'floor' then v_p.floor is null
      when 'price' then v_p.price is null
      when 'year_in_use' then v_p.year_in_use is null
      when 'property_type' then v_p.property_type is null
      when 'listing_agent_id' then v_p.listing_agent_id is null
      when 'contract_agent_id' then v_p.contract_agent_id is null
      when 'photo_agent_id' then v_p.photo_agent_id is null
      when 'owner' then v_priv.owner_contact_id is null
      when 'showing_instructions' then coalesce(btrim(v_priv.showing_instructions), '') = ''
      when 'images' then not exists (select 1 from public.crm2_property_media m
                                      where m.property_id = p_property and m.kind = 'image')
      else false
    end;
    if v_hit then
      v_missing := array_append(v_missing, v_req);
    end if;
  end loop;
  -- Зарах = нийт үнэ; түрээс = хугацаатай үнэ (тааруулалтад харьцуулагдахуйц байлгана).
  if (v_p.category = 'sale' and v_p.price_period <> 'total')
     or (v_p.category in ('rent', 'managed_rent') and v_p.price_period = 'total') then
    v_missing := array_append(v_missing, 'price_period');
  end if;
  if not public.crm2_property_has_valid_contract(p_property) then
    v_missing := array_append(v_missing, 'brokerage_contract');
  end if;
  return v_missing;
end $$;

-- Гэрээ илгээх/батлахад дутуу зүйлс.
create function public.crm2_brokerage_missing(p_contract uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_missing text[] := '{}';
begin
  select * into v_b from public.crm2_brokerage_contracts where id = p_contract;
  if not found then
    return array['contract'];
  end if;
  if v_b.start_date is null then v_missing := array_append(v_missing, 'start_date'); end if;
  if v_b.end_date is null then
    v_missing := array_append(v_missing, 'end_date');
  elsif v_b.end_date < public.crm2_today() then
    v_missing := array_append(v_missing, 'end_date_past');
  end if;
  if v_b.commission_type is null or v_b.commission_value is null then
    v_missing := array_append(v_missing, 'commission');
  end if;
  if public.crm2_setting_bool('brokerage.require_owner', v_b.office_id) and v_b.owner_contact_id is null then
    v_missing := array_append(v_missing, 'owner');
  end if;
  if public.crm2_setting_bool('brokerage.require_file', v_b.office_id)
     and not exists (select 1 from public.crm2_brokerage_files f where f.contract_id = v_b.id) then
    v_missing := array_append(v_missing, 'file');
  end if;
  return v_missing;
end $$;

-- Төлөвийг хэрэгжүүлэх (дуудагч RPC туг тавьсан байна).
create function public.crm2_apply_property_status(
  p_property uuid, p_status public.crm2_property_status, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cur public.crm2_property_status;
  v_missing text[];
begin
  select status into v_cur from public.crm2_properties where id = p_property for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  if v_cur = p_status then
    return;
  end if;
  if not public.crm2_property_transition_ok(v_cur, p_status) then
    raise exception 'CRM: «%» → «%» шилжилт зөвшөөрөгдөхгүй',
      public.crm2_status_label(v_cur::text), public.crm2_status_label(p_status::text);
  end if;
  if p_status = 'active' then
    v_missing := public.crm2_property_missing(p_property);
    if cardinality(v_missing) > 0 then
      raise exception 'CRM: идэвхжүүлэхэд дутуу: %', public.crm2_missing_text(v_missing);
    end if;
  end if;
  update public.crm2_properties set status = p_status, status_reason = p_reason where id = p_property;
end $$;

-- Хүчинтэй гэрээгүй болсон идэвхтэй/түдгэлзсэн хөрөнгийг тохиргооны дагуу
-- «гэрээ дууссан» (архив) болгоно. Түүх, дуудлага, үзүүлэлт устахгүй.
create function public.crm2_end_property_if_uncovered(p_property uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_p public.crm2_properties;
begin
  select * into v_p from public.crm2_properties where id = p_property for update;
  if not found or v_p.status not in ('active', 'suspended') then
    return false;
  end if;
  if public.crm2_property_has_valid_contract(p_property) then
    return false;
  end if;
  if coalesce(public.crm2_setting_text('brokerage.on_expiry', v_p.office_id), 'contract_ended') <> 'contract_ended' then
    return false;
  end if;
  update public.crm2_properties set status = 'contract_ended', status_reason = p_reason where id = p_property;
  perform public.crm2_notify(array[v_p.listing_agent_id, v_p.contract_agent_id], 'crm2_property_ended',
    'Хөрөнгө архивт шилжлээ', v_p.code || ': ' || p_reason, '/agent/crm/staff/' || v_p.id::text);
  return true;
end $$;

create function public.crm2_apply_deal_transfer(p_deal uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.crm2_deals;
begin
  select * into v_d from public.crm2_deals where id = p_deal for update;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;
  if v_d.stage in ('closed', 'cancelled') then
    raise exception 'CRM: хаагдсан хэлцлийг шилжүүлэхгүй';
  end if;
  perform public.crm2_assert_work_staff(p_to, v_d.office_id);
  if v_d.agent_id is distinct from p_to then
    -- Хуучин хариуцагчийн нээлттэй ажил шинэ хариуцагчийн «Миний ажил» руу шилжинэ.
    update public.crm2_tasks set assignee_id = p_to
     where deal_id = p_deal and status = 'open' and assignee_id = v_d.agent_id;
    update public.crm2_deals set agent_id = p_to where id = p_deal;
  end if;
end $$;

create function public.crm2_apply_contact_transfer(p_contact uuid, p_to uuid, p_with_deals boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_c public.crm2_contacts;
begin
  select * into v_c from public.crm2_contacts where id = p_contact for update;
  if not found then
    raise exception 'CRM: харилцагч олдсонгүй';
  end if;
  perform public.crm2_assert_work_staff(p_to, v_c.office_id);
  if v_c.responsible_agent_id is distinct from p_to then
    update public.crm2_contacts set responsible_agent_id = p_to where id = p_contact;
    -- Хэлцэлгүй (харилцагч дээрх) нээлттэй ажил шинэ хариуцагчид.
    update public.crm2_tasks set assignee_id = p_to
     where contact_id = p_contact and deal_id is null and status = 'open'
       and assignee_id = v_c.responsible_agent_id;
  end if;
  if p_with_deals then
    update public.crm2_tasks t set assignee_id = p_to
      from public.crm2_deals d
     where t.deal_id = d.id and d.contact_id = p_contact and d.is_open
       and d.agent_id = v_c.responsible_agent_id
       and t.status = 'open' and t.assignee_id = d.agent_id;
    update public.crm2_deals set agent_id = p_to
     where contact_id = p_contact and is_open and agent_id = v_c.responsible_agent_id;
  end if;
end $$;

-- ── 7. Trigger функцууд ─────────────────────────────────────────────────────

-- Ерөнхий түүх бичигч. TG_ARGV[0] = entity, үлдсэн = хянах баганууд.
create function public.crm2_track_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entity text := tg_argv[0];
  v_new jsonb;
  v_old jsonb;
  v_row jsonb;
  v_id uuid;
  v_prop uuid;
  v_contact uuid;
  v_deal uuid;
  v_snap jsonb := '{}';
  v_field text;
  i int;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  v_row := coalesce(v_new, v_old);
  v_id := coalesce(v_row->>'id', v_row->>'property_id')::uuid;
  v_prop := (case when v_entity = 'property' then v_row->>'id' else v_row->>'property_id' end)::uuid;
  v_contact := (case when v_entity = 'contact' then v_row->>'id' else v_row->>'contact_id' end)::uuid;
  v_deal := (case when v_entity = 'deal' then v_row->>'id' else v_row->>'deal_id' end)::uuid;

  if tg_op = 'UPDATE' then
    for i in 1 .. tg_nargs - 1 loop
      v_field := tg_argv[i];
      if v_new->v_field is distinct from v_old->v_field then
        perform public.crm2_log((v_row->>'office_id')::uuid, v_entity, v_id,
          case when v_field in ('status', 'stage', 'showing_status') then 'status' else 'update' end,
          v_field, v_old->v_field, v_new->v_field, v_prop, v_contact, v_deal);
      end if;
    end loop;
  else
    for i in 1 .. tg_nargs - 1 loop
      v_field := tg_argv[i];
      v_snap := v_snap || jsonb_build_object(v_field, v_row->v_field);
    end loop;
    perform public.crm2_log((v_row->>'office_id')::uuid, v_entity, v_id, lower(tg_op), null,
      case when tg_op = 'DELETE' then v_snap end,
      case when tg_op = 'INSERT' then v_snap end,
      v_prop, v_contact, v_deal);
  end if;
  return null;
end $$;

create function public.crm2_projects_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.created_at := now();
  elsif new.office_id <> old.office_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'CRM: төслийн оффис, үүсгэгчийг өөрчлөхгүй';
  end if;
  return new;
end $$;

-- Төслийн нэр солигдоход хөрөнгийн хайлтын текстийг шинэчилнэ.
create function public.crm2_projects_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.crm2_properties set search_text = search_text where project_id = new.id;
  end if;
  return null;
end $$;

create function public.crm2_properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sys boolean := public.crm2_in_rpc();
  v_me uuid := auth.uid();
  v_project text;
  -- price_total (generated) BEFORE trigger-т тооцоологдоогүй байдаг тул харьцуулахгүй.
  v_sys_cols text[] := array['search_text', 'updated_at', 'updated_by', 'brokerage_end_date', 'price_total'];
begin
  if tg_op = 'INSERT' then
    if v_me is not null then new.created_by := v_me; end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.code := public.crm2_next_code(new.office_id, 'property');
    new.status := 'draft';
    new.status_reason := null;
    new.status_changed_at := now();
    new.activated_at := null;
    new.brokerage_end_date := null;
    if not v_sys or v_me is not null then
      new.last_verified_at := null;
      new.last_verified_by := null;
    end if;
    new.listing_agent_id := coalesce(new.listing_agent_id, new.created_by);
    new.created_at := now();
  else
    if new.office_id <> old.office_id or new.code <> old.code
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: хөрөнгийн код, оффис, бүртгэсэн хүнийг өөрчлөхгүй';
    end if;
    if not v_sys and (
         new.status <> old.status
         or new.status_reason is distinct from old.status_reason
         or new.status_changed_at <> old.status_changed_at
         or new.activated_at is distinct from old.activated_at
         or new.last_verified_at is distinct from old.last_verified_at
         or new.last_verified_by is distinct from old.last_verified_by
         or new.brokerage_end_date is distinct from old.brokerage_end_date) then
      raise exception 'CRM: төлөв, баталгаажуулалт, гэрээний огноог тусгай үйлдлээр өөрчилнө';
    end if;
    if new.status <> old.status then
      new.status_changed_at := now();
    end if;
    -- Идэвхжсэний дараа: хоосон үүргийг засварлагч бөглөнө; томилогдсоныг солих/хасах
    -- нь ахлагч эсвэл менежер.
    if old.status <> 'draft' and not v_sys
       and not (public.crm_is_manager()
                or public.crm2_is_lead_of_any(array[old.listing_agent_id, old.contract_agent_id, old.photo_agent_id])) then
      if (old.listing_agent_id is not null and new.listing_agent_id is distinct from old.listing_agent_id)
         or (old.contract_agent_id is not null and new.contract_agent_id is distinct from old.contract_agent_id)
         or (old.photo_agent_id is not null and new.photo_agent_id is distinct from old.photo_agent_id) then
        raise exception 'CRM: томилогдсон үүрэгт агентыг багийн ахлагч эсвэл менежер солино';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.listing_agent_id is distinct from old.listing_agent_id then
    perform public.crm2_assert_staff(new.listing_agent_id, new.office_id, 'Листлэгч агент');
  end if;
  if tg_op = 'INSERT' or new.contract_agent_id is distinct from old.contract_agent_id then
    perform public.crm2_assert_staff(new.contract_agent_id, new.office_id, 'Гэрээ хийсэн агент');
  end if;
  if tg_op = 'INSERT' or new.photo_agent_id is distinct from old.photo_agent_id then
    perform public.crm2_assert_staff(new.photo_agent_id, new.office_id, 'Зураг авсан агент');
  end if;
  -- Зөвхөн үүрэгт агент өөрчлөгдөхөд шалгана (системийн шинэчлэлт, хайлтын текст
  -- сэргээлт тохиргоо өөрчлөгдсөний дараа ч саадгүй үргэлжилнэ).
  if (tg_op = 'INSERT'
      or new.listing_agent_id is distinct from old.listing_agent_id
      or new.contract_agent_id is distinct from old.contract_agent_id
      or new.photo_agent_id is distinct from old.photo_agent_id)
     and not public.crm2_setting_bool('property.same_agent_multi_role', new.office_id)
     and (new.listing_agent_id = new.contract_agent_id
          or new.listing_agent_id = new.photo_agent_id
          or new.contract_agent_id = new.photo_agent_id) then
    raise exception 'CRM: нэг агент хэд хэдэн үүрэг давхар авахгүй (тохиргоо)';
  end if;

  -- Дүүрэг, онцлог: тохиргооны жагсаалтаас (тааруулалтад харьцуулагдахуйц).
  new.district := nullif(btrim(coalesce(new.district, '')), '');
  new.features := array(select distinct btrim(f) from unnest(coalesce(new.features, '{}'::text[])) f
                         where btrim(f) <> '' order by 1);
  if new.district is not null and (tg_op = 'INSERT' or new.district is distinct from old.district)
     and not (public.crm2_setting('property.districts', new.office_id) ? new.district) then
    raise exception 'CRM: дүүрэг жагсаалтад алга (%)', new.district;
  end if;
  if (tg_op = 'INSERT' or new.features is distinct from old.features)
     and exists (select 1 from unnest(new.features) f
                  where not (public.crm2_setting('property.features', new.office_id) ? f)) then
    raise exception 'CRM: тохиргоонд бүртгэлгүй онцлог байна';
  end if;
  new.pin_address := nullif(btrim(coalesce(new.pin_address, '')), '');

  -- Идэвхжүүлэлтийн дүрэм: батлагдсан, өнөөдөр хүчинтэй зуучлалын гэрээгүй бол үгүй.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    if not public.crm2_property_has_valid_contract(new.id) then
      raise exception 'CRM: батлагдсан, хүчинтэй зуучлалын гэрээгүй хөрөнгийг идэвхжүүлэх боломжгүй';
    end if;
    new.activated_at := coalesce(old.activated_at, now());
  end if;

  if new.field_notes is null then
    new.field_notes := '{}';
  end if;
  select pr.name into v_project from public.crm2_projects pr where pr.id = new.project_id;
  -- Түлхүүр үгийн хайлт: код, төсөл, дүүрэг, байршил, төрөл/ангиллын нэр, онцлог,
  -- тайлбарууд. Хувийн талбар (эзэн, үзүүлэх заавар) ОРОХГҮЙ.
  new.search_text := lower(concat_ws(' ',
    new.code, v_project, new.district, new.location_text, new.address_detail, new.pin_address,
    new.property_type,
    public.crm2_setting('property.types', new.office_id) ->> new.property_type,
    public.crm2_setting('property.category_labels', new.office_id) ->> new.category::text,
    (select string_agg(public.crm2_setting('property.features', new.office_id) ->> f, ' ')
       from unnest(new.features) f),
    new.condition, new.view_note, new.notes, new.advantages, new.availability_note,
    (select string_agg(e.value, ' ') from jsonb_each_text(new.field_notes) e)));

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_sys_cols) is distinct from (to_jsonb(old) - v_sys_cols) then
      new.updated_at := now();
      new.updated_by := coalesce(v_me, new.updated_by);
    else
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
    end if;
  else
    new.updated_at := now();
    new.updated_by := v_me;
  end if;
  return new;
end $$;

create function public.crm2_properties_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm2_property_private (property_id, office_id, updated_by)
  values (new.id, new.office_id, auth.uid())
  on conflict (property_id) do nothing;
  return null;
end $$;

create function public.crm2_property_private_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.property_id <> old.property_id or new.office_id <> old.office_id then
    raise exception 'CRM: хувийн талбарын хөрөнгийг өөрчлөхгүй';
  end if;
  -- Эзнээр холбохоос өмнө тухайн харилцагчийг аль хэдийн харах эрхтэй байх ёстой
  -- (BEFORE trigger хуучин мөрийг хардаг тул шинэ холбоос өөртөө эрх олгохгүй).
  if new.owner_contact_id is distinct from old.owner_contact_id
     and new.owner_contact_id is not null and auth.uid() is not null
     and not public.crm2_can_view_contact(new.owner_contact_id) then
    raise exception 'CRM: энэ харилцагчийг харах эрхгүй тул эзнээр холбохгүй — өөрийн харилцагчаар бүртгэнэ үү';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.crm2_property_media_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_size bigint;
  v_mime text;
  v_prefix text;
  v_limit int;
  v_count int;
begin
  if tg_op = 'UPDATE' then
    if new.office_id <> old.office_id or new.property_id <> old.property_id or new.kind <> old.kind
       or new.storage_path is distinct from old.storage_path or new.external_url is distinct from old.external_url
       or new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes
       or new.uploaded_by <> old.uploaded_by or new.created_at <> old.created_at then
      raise exception 'CRM: медиагийн файлыг солихгүй — шинээр нэмнэ үү';
    end if;
    return new;
  end if;

  select x.office_id into new.office_id from public.crm2_properties x where x.id = new.property_id;
  if new.office_id is null then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  new.created_at := now();

  if new.storage_path is not null then
    v_prefix := new.office_id::text || '/' || new.property_id::text || '/';
    if left(new.storage_path, length(v_prefix)) <> v_prefix then
      raise exception 'CRM: медиа файлын зам буруу';
    end if;
    select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into v_size, v_mime
      from storage.objects o
     where o.bucket_id = 'crm2-media' and o.name = new.storage_path;
    if not found then
      raise exception 'CRM: файл хуулагдаагүй байна — эхлээд файлаа байршуулна уу';
    end if;
    new.size_bytes := v_size;
    new.mime_type := v_mime;
    new.kind := case when v_mime like 'video/%' then 'video' else 'image' end;
    v_limit := public.crm2_setting_int(
      case when new.kind = 'video' then 'media.max_video_mb' else 'media.max_image_mb' end, new.office_id);
    if coalesce(v_size, 0) > v_limit::bigint * 1048576 then
      raise exception 'CRM: файл хэт том (% МБ-аас ихгүй)', v_limit;
    end if;
  else
    new.kind := 'video';
    new.mime_type := null;
    new.size_bytes := null;
  end if;

  v_limit := public.crm2_setting_int(
    case when new.kind = 'video' then 'media.max_videos' else 'media.max_images' end, new.office_id);
  select count(*) into v_count from public.crm2_property_media m
   where m.property_id = new.property_id and m.kind = new.kind;
  if v_count >= v_limit then
    raise exception 'CRM: нэг хөрөнгөд % хүртэл % хадгална', v_limit,
      case when new.kind = 'video' then 'бичлэг' else 'зураг' end;
  end if;
  return new;
end $$;

create function public.crm2_brokerage_files_guard()
returns trigger language plpgsql security definer set search_path = public as $$
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
  select b.office_id, b.property_id into v_b from public.crm2_brokerage_contracts b where b.id = new.contract_id;
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

create function public.crm2_brokerage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
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
      -- Хэрэглэгчээс ирсэн мөр үргэлж ноорог; батлалтын талбар хоосон.
      if not v_sys then
        new.status := 'draft';
      end if;
      new.submitted_by := null; new.submitted_at := null;
      new.approved_by := null; new.approved_at := null; new.approval_note := null;
      new.rejected_by := null; new.rejected_at := null; new.rejection_note := null;
      new.terminated_by := null; new.terminated_at := null; new.termination_reason := null;
      new.activate_on_start := false;
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
         or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at
         or new.rejection_note is distinct from old.rejection_note
         or new.terminated_by is distinct from old.terminated_by or new.terminated_at is distinct from old.terminated_at
         or new.termination_reason is distinct from old.termination_reason
         or new.activate_on_start <> old.activate_on_start) then
      raise exception 'CRM: гэрээний төлөв, батлалтыг тусгай үйлдлээр өөрчилнө';
    end if;
    if old.status <> 'draft' and not v_sys
       and (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      raise exception 'CRM: илгээсэн/батлагдсан гэрээг засахгүй — буцааж аваад засах эсвэл шинэ хувилбар үүсгэнэ үү';
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

-- Хөрөнгийн brokerage_end_date-г шинэчилнэ.
create function public.crm2_brokerage_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_end date;
  v_flag text;
begin
  select max(b.end_date) into v_end
    from public.crm2_brokerage_contracts b
   where b.property_id = new.property_id and b.status = 'active';
  if exists (select 1 from public.crm2_properties x
              where x.id = new.property_id and x.brokerage_end_date is distinct from v_end) then
    v_flag := public.crm2_rpc_begin(null);
    update public.crm2_properties set brokerage_end_date = v_end where id = new.property_id;
    perform public.crm2_rpc_end(v_flag);
  end if;
  return null;
end $$;

create function public.crm2_contacts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.responsible_agent_id := coalesce(new.responsible_agent_id, new.created_by);
    perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Хариуцсан агент');
    new.code := public.crm2_next_code(new.office_id, 'contact');
    new.status := 'active';
    new.archived_at := null;
    new.created_at := now();
  else
    if new.code <> old.code or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: харилцагчийн код, оффисыг өөрчлөхгүй';
    end if;
    if new.responsible_agent_id <> old.responsible_agent_id then
      if not public.crm2_in_rpc() then
        raise exception 'CRM: хариуцсан агентыг шилжүүлэх үйлдлээр солино';
      end if;
      perform public.crm2_assert_staff(new.responsible_agent_id, new.office_id, 'Хариуцсан агент');
    end if;
    if new.status <> old.status then
      new.archived_at := case when new.status = 'archived' then now() end;
    else
      new.archived_at := old.archived_at;
    end if;
  end if;
  -- Дугаарын хэсгээр («2233») ч хайгдана; RLS харах эрхтэй харилцагчаар хязгаарлана.
  new.search_text := lower(concat_ws(' ', new.code, new.full_name, new.note,
    (select string_agg(ph.phone_norm || ' ' || right(ph.phone_norm, 8), ' ')
       from public.crm2_contact_phones ph where ph.contact_id = new.id)));
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.crm2_contact_phones_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := btrim(new.phone);
  new.phone_norm := public.crm2_normalize_phone(new.phone);
  if new.phone_norm = '' then
    raise exception 'CRM: утасны дугаар буруу (%)', new.phone;
  end if;
  if tg_op = 'INSERT' then
    select c.office_id into new.office_id from public.crm2_contacts c where c.id = new.contact_id;
    if new.office_id is null then
      raise exception 'CRM: харилцагч олдсонгүй';
    end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.created_at := now();
  elsif new.contact_id <> old.contact_id or new.office_id <> old.office_id
        or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'CRM: дугаарыг өөр харилцагч руу шилжүүлэхгүй';
  end if;
  return new;
end $$;

-- Дугаар заавал бол харилцагчийн сүүлийн дугаарыг устгахгүй.
create function public.crm2_contact_phones_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and public.crm2_setting_bool('contact.require_phone')
     and not exists (select 1 from public.crm2_contact_phones p
                      where p.contact_id = old.contact_id and p.id <> old.id) then
    raise exception 'CRM: сүүлийн дугаарыг устгахгүй — эхлээд шинэ дугаар нэмнэ үү';
  end if;
  return old;
end $$;

-- Дугаар өөрчлөгдөхөд харилцагчийн хайлтын текстийг шинэчилнэ.
create function public.crm2_contact_phones_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  if tg_op = 'DELETE' then
    v_contact := old.contact_id;
  else
    v_contact := new.contact_id;
  end if;
  update public.crm2_contacts set search_text = search_text where id = v_contact;
  return null;
end $$;

create function public.crm2_requirements_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta text[] := array['status', 'archived_at', 'version', 'updated_at', 'updated_by'];
begin
  new.locations := array(select distinct btrim(x) from unnest(new.locations) x where btrim(x) <> '');
  new.must_haves := array(select distinct btrim(x) from unnest(new.must_haves) x where btrim(x) <> '');
  new.districts := array(select distinct btrim(x) from unnest(coalesce(new.districts, '{}'::text[])) x
                          where btrim(x) <> '' order by 1);
  new.required_features := array(select distinct btrim(x) from unnest(coalesce(new.required_features, '{}'::text[])) x
                                  where btrim(x) <> '' order by 1);
  if tg_op = 'INSERT' then
    select c.office_id into new.office_id from public.crm2_contacts c where c.id = new.contact_id;
    if new.office_id is null then
      raise exception 'CRM: харилцагч олдсонгүй';
    end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.version := 1;
    new.status := 'active';
    new.archived_at := null;
    new.created_at := now();
  else
    if new.contact_id <> old.contact_id or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: шаардлагын харилцагчийг өөрчлөхгүй';
    end if;
    new.version := old.version;
    if (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      insert into public.crm2_requirement_versions (office_id, requirement_id, contact_id, version, snapshot, replaced_by)
      values (old.office_id, old.id, old.contact_id, old.version, to_jsonb(old), auth.uid());
      new.version := old.version + 1;
    end if;
    if new.status <> old.status then
      new.archived_at := case when new.status = 'archived' then now() end;
    else
      new.archived_at := old.archived_at;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.districts is distinct from old.districts)
     and exists (select 1 from unnest(new.districts) x
                  where not (public.crm2_setting('property.districts', new.office_id) ? x)) then
    raise exception 'CRM: шаардлагын дүүрэг жагсаалтад алга';
  end if;
  if (tg_op = 'INSERT' or new.required_features is distinct from old.required_features)
     and exists (select 1 from unnest(new.required_features) x
                  where not (public.crm2_setting('property.features', new.office_id) ? x)) then
    raise exception 'CRM: тохиргоонд бүртгэлгүй онцлог байна';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.crm2_deals_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sys boolean := public.crm2_in_rpc();
begin
  if tg_op = 'INSERT' then
    if not v_sys then
      raise exception 'CRM: хэлцлийг «хэлцэл нээх» үйлдлээр үүсгэнэ';
    end if;
    select x.office_id into new.office_id from public.crm2_properties x where x.id = new.property_id;
    if new.office_id is null then
      raise exception 'CRM: хөрөнгө олдсонгүй';
    end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.code := public.crm2_next_code(new.office_id, 'deal');
    new.stage_changed_at := now();
    new.created_at := now();
    perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Хариуцсан агент');
  else
    if new.office_id <> old.office_id or new.code <> old.code
       or new.property_id <> old.property_id or new.contact_id <> old.contact_id
       or new.previous_deal_id is distinct from old.previous_deal_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: хэлцлийн хөрөнгө, харилцагч, кодыг өөрчлөхгүй';
    end if;
    if old.stage in ('closed', 'cancelled') and new.stage <> old.stage then
      raise exception 'CRM: хаагдсан/цуцлагдсан хэлцлийг дахин нээхгүй — шинэ хэлцэл үүсгэнэ үү';
    end if;
    if not v_sys and (
         new.stage <> old.stage or new.agent_id <> old.agent_id
         or new.cancel_reason_code is distinct from old.cancel_reason_code
         or new.cancel_reason is distinct from old.cancel_reason
         or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
         or new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by
         or new.confirmed_at is distinct from old.confirmed_at
         or new.requirement_version is distinct from old.requirement_version
         or new.origin_deal_id is distinct from old.origin_deal_id
         or new.last_activity_at is distinct from old.last_activity_at
         or new.stage_changed_at <> old.stage_changed_at) then
      raise exception 'CRM: хэлцлийн шат, хариуцагчийг тусгай үйлдлээр өөрчилнө';
    end if;
    if new.stage <> old.stage then
      new.stage_changed_at := now();
    end if;
    if new.agent_id <> old.agent_id then
      perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Хариуцсан агент');
    end if;
  end if;
  if new.stage = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  if new.requirement_id is not null
     and (tg_op = 'INSERT' or new.requirement_id is distinct from old.requirement_id)
     and not exists (select 1 from public.crm2_requirements r
                      where r.id = new.requirement_id and r.contact_id = new.contact_id) then
    raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
  end if;
  -- Цуцлагдсан хэлцлээс үүссэн санал: ижил харилцагч, өөр хөрөнгө.
  if new.origin_deal_id is not null
     and (tg_op = 'INSERT' or new.origin_deal_id is distinct from old.origin_deal_id)
     and not exists (select 1 from public.crm2_deals o
                      where o.id = new.origin_deal_id and o.contact_id = new.contact_id
                        and o.property_id <> new.property_id) then
    raise exception 'CRM: эх хэлцэл энэ харилцагчийн өөр хөрөнгийн хэлцэл байх ёстой';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.crm2_activities_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_sys boolean := public.crm2_in_rpc();
  v_d record;
  v_free text[] := array['finalized_at', 'updated_at', 'updated_by'];
  v_priv boolean;
begin
  select d.office_id, d.property_id, d.contact_id, d.stage, d.agent_id into v_d
    from public.crm2_deals d where d.id = new.deal_id;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;

  if tg_op = 'INSERT' then
    if v_d.stage in ('closed', 'cancelled') then
      raise exception 'CRM: хэлцэл хаагдсан — шинэ хэлцэл нээж бүртгэнэ үү';
    end if;
    new.office_id := v_d.office_id;
    if new.property_id is null then
      new.property_id := v_d.property_id;
    elsif new.property_id <> v_d.property_id then
      raise exception 'CRM: дуудлага/үзүүлэлтийн хөрөнгө хэлцлийн хөрөнгөтэй таарахгүй байна';
    end if;
    if new.contact_id is null then
      new.contact_id := v_d.contact_id;
    elsif new.contact_id <> v_d.contact_id then
      raise exception 'CRM: дуудлага/үзүүлэлтийн харилцагч хэлцлийн харилцагчтай таарахгүй байна';
    end if;
    if v_me is not null then new.created_by := v_me; end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.agent_id := coalesce(new.agent_id, new.created_by);
    perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Гүйцэтгэсэн агент');
    new.created_at := now();
    new.finalized_at := null;
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
  else
    if new.deal_id <> old.deal_id or new.property_id <> old.property_id or new.contact_id <> old.contact_id
       or new.kind <> old.kind or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: дуудлага/үзүүлэлтийн хэлцэл, хөрөнгө, харилцагч, төрлийг өөрчлөхгүй';
    end if;
    -- Хаагдсан/цуцлагдсан хэлцлийн мөрийн цаг, төлөв, агентыг сэргээж/өөрчилж болохгүй
    -- (тайлбар засах, хүчингүй болгох боломжтой).
    if not v_sys and v_d.stage in ('closed', 'cancelled')
       and (new.showing_status is distinct from old.showing_status
            or new.scheduled_at is distinct from old.scheduled_at
            or new.occurred_at is distinct from old.occurred_at
            or new.agent_id is distinct from old.agent_id) then
      raise exception 'CRM: хаагдсан/цуцлагдсан хэлцлийн дуудлага, үзүүлэлтийг өөрчлөхгүй';
    end if;
    -- Эцсийн үр дүн (үзүүлсэн/ирээгүй/цуцалсан): дахин «товлосон» болгохгүй; өөр үр дүн
    -- рүү засахыг зөвхөн ахлагч/менежер.
    if not v_sys and old.kind = 'showing' and old.showing_status <> 'scheduled'
       and new.showing_status is distinct from old.showing_status then
      if new.showing_status = 'scheduled' then
        raise exception 'CRM: эцсийн үр дүнтэй үзүүлэлтийг дахин «товлосон» болгохгүй — шинэ үзүүлэлт товлоно уу';
      end if;
      if not (public.crm_is_manager()
              or public.crm2_is_lead_of_any(array[old.agent_id, old.created_by, v_d.agent_id])) then
        raise exception 'CRM: үзүүлэлтийн эцсийн үр дүнг багийн ахлагч эсвэл менежер засна';
      end if;
    end if;
    if new.agent_id <> old.agent_id then
      perform public.crm2_assert_staff(new.agent_id, new.office_id, 'Гүйцэтгэсэн агент');
    end if;
    new.finalized_at := old.finalized_at;
    if new.voided_at is distinct from old.voided_at then
      if new.voided_at is null then
        if not (v_sys or public.crm_is_manager()) then
          raise exception 'CRM: хүчингүй болгосон бичлэгийг зөвхөн менежер сэргээнэ';
        end if;
        new.voided_by := null;
        new.void_reason := null;
      else
        if coalesce(btrim(new.void_reason), '') = '' then
          raise exception 'CRM: хүчингүй болгох шалтгааныг бичнэ үү';
        end if;
        new.voided_at := now();
        new.voided_by := v_me;
      end if;
    else
      new.voided_by := old.voided_by;
    end if;
  end if;

  if new.source_activity_id is not null
     and (tg_op = 'INSERT' or new.source_activity_id is distinct from old.source_activity_id)
     and not exists (select 1 from public.crm2_activities s
                      where s.id = new.source_activity_id and s.deal_id = new.deal_id) then
    raise exception 'CRM: холбох дуудлага өөр хэлцлийнх байна';
  end if;

  if new.kind = 'call' then
    if new.showing_status is not null or new.scheduled_at is not null then
      raise exception 'CRM: дуудлагад үзүүлэх тов, төлөв байхгүй — үзүүлэлтийг тусад нь бүртгэнэ';
    end if;
    new.occurred_at := coalesce(new.occurred_at, now());
    if new.occurred_at > now() + interval '15 minutes' then
      raise exception 'CRM: дуудлагын цаг ирээдүйд байж болохгүй';
    end if;
    if tg_op = 'INSERT' then
      new.finalized_at := now();
    end if;
  else
    if new.scheduled_at is null then
      raise exception 'CRM: үзүүлэх огноо, цагийг сонгоно уу';
    end if;
    new.showing_status := coalesce(new.showing_status, 'scheduled');
    if tg_op = 'INSERT' and new.showing_status not in ('scheduled', 'shown') then
      raise exception 'CRM: шинэ үзүүлэлт «товлосон» эсвэл «үзүүлсэн» төлөвтэй бүртгэгдэнэ';
    end if;
    if new.showing_status = 'shown' then
      -- Товлосон цагийг автоматаар бодит цаг гэж тооцохгүй: агент өөрөө оруулна.
      if new.occurred_at is null then
        raise exception 'CRM: бодитоор үзүүлсэн огноо, цагийг оруулна уу';
      end if;
      if new.occurred_at > now() + interval '15 minutes' then
        raise exception 'CRM: ирээдүйн цагт «үзүүлсэн» гэж бүртгэх боломжгүй';
      end if;
      if public.crm2_setting_bool('showing.require_feedback', new.office_id)
         and coalesce(btrim(new.feedback), '') = '' then
        raise exception 'CRM: үзүүлсний дараах харилцагчийн санал хүсэлтийг бичнэ үү';
      end if;
    else
      new.occurred_at := null;
    end if;
    if new.showing_status = 'scheduled' then
      new.finalized_at := null;
    elsif tg_op = 'INSERT' or old.showing_status = 'scheduled' then
      new.finalized_at := now();
    end if;
  end if;

  -- Агентын засах хугацааны хязгаар (дараагийн алхам нь crm2_tasks-д тусдаа).
  if tg_op = 'UPDATE' and not v_sys then
    v_priv := public.crm_is_manager()
              or public.crm2_is_lead_of_any(array[old.agent_id, old.created_by, v_d.agent_id]);
    if not v_priv then
      if old.voided_at is not null then
        raise exception 'CRM: хүчингүй болгосон бичлэгийг засахгүй';
      end if;
      if old.finalized_at is not null
         and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free)
         and now() - old.finalized_at
             > make_interval(hours => public.crm2_setting_int('activity.edit_window_hours', old.office_id)) then
        raise exception 'CRM: засах хугацаа дууссан — багийн ахлагчаар засуулна уу';
      end if;
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- Хэлцлийн сүүлийн үйлдлийн цаг ба шатыг (зөвхөн урагш, эхний шатуудад) шинэчилнэ.
create function public.crm2_activities_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage public.crm2_deal_stage;
  v_target public.crm2_deal_stage;
  v_flag text;
  v_reason text := current_setting('crm2.reason', true);
begin
  select d.stage into v_stage from public.crm2_deals d where d.id = new.deal_id;
  if v_stage is null or v_stage in ('closed', 'cancelled') then
    return null;
  end if;
  if new.voided_at is null and public.crm2_setting_bool('deal.auto_advance', new.office_id) then
    if new.kind = 'call' and tg_op = 'INSERT' then
      if v_stage = 'interested' then v_target := 'contacted'; end if;
    elsif new.kind = 'showing' and new.showing_status = 'scheduled'
          and (tg_op = 'INSERT' or old.showing_status <> 'scheduled') then
      if v_stage in ('interested', 'contacted') then
        v_target := 'showing_scheduled';
      elsif v_stage = 'shown' then
        v_target := 'reshow';
      end if;
    elsif new.kind = 'showing' and new.showing_status = 'shown'
          and (tg_op = 'INSERT' or old.showing_status <> 'shown') then
      if v_stage in ('interested', 'contacted', 'showing_scheduled', 'reshow') then
        v_target := 'shown';
      end if;
    end if;
  end if;
  v_flag := public.crm2_rpc_begin(case when v_target is not null then 'Автомат: дуудлага/үзүүлэлтээс' end);
  update public.crm2_deals
     set last_activity_at = now(),
         stage = coalesce(v_target, stage)
   where id = new.deal_id;
  perform public.crm2_rpc_end(v_flag);
  perform set_config('crm2.reason', coalesce(v_reason, ''), true);
  return null;
end $$;

-- Ажлын холбоос (хэлцэл → хөрөнгө/харилцагч), хариуцагч, дууссан цагийг хамгаална.
create function public.crm2_tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sys boolean := public.crm2_in_rpc();
  v_me uuid := auth.uid();
  v_office uuid;
  v_d record;
  v_b record;
  v_r record;
begin
  if tg_op = 'INSERT' then
    if new.deal_id is not null then
      select d.office_id, d.property_id, d.contact_id, d.stage into v_d
        from public.crm2_deals d where d.id = new.deal_id;
      if not found then
        raise exception 'CRM: хэлцэл олдсонгүй';
      end if;
      if not v_sys and v_d.stage in ('closed', 'cancelled') then
        raise exception 'CRM: хаагдсан/цуцлагдсан хэлцэлд шинэ ажил нэмэхгүй';
      end if;
      if new.property_id is not null and new.property_id <> v_d.property_id then
        raise exception 'CRM: ажлын хөрөнгө хэлцлийн хөрөнгөтэй таарахгүй байна';
      end if;
      if new.contact_id is not null and new.contact_id <> v_d.contact_id then
        raise exception 'CRM: ажлын харилцагч хэлцлийн харилцагчтай таарахгүй байна';
      end if;
      new.property_id := v_d.property_id;
      new.contact_id := v_d.contact_id;
      v_office := v_d.office_id;
    end if;
    if new.brokerage_id is not null then
      select b.office_id, b.property_id into v_b
        from public.crm2_brokerage_contracts b where b.id = new.brokerage_id;
      if not found then
        raise exception 'CRM: гэрээ олдсонгүй';
      end if;
      if new.property_id is not null and new.property_id <> v_b.property_id then
        raise exception 'CRM: ажлын хөрөнгө гэрээний хөрөнгөтэй таарахгүй байна';
      end if;
      new.property_id := v_b.property_id;
      v_office := coalesce(v_office, v_b.office_id);
    end if;
    if new.requirement_id is not null then
      select r.office_id, r.contact_id into v_r
        from public.crm2_requirements r where r.id = new.requirement_id;
      if not found then
        raise exception 'CRM: шаардлага олдсонгүй';
      end if;
      if new.contact_id is not null and new.contact_id <> v_r.contact_id then
        raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
      end if;
      new.contact_id := v_r.contact_id;
      v_office := coalesce(v_office, v_r.office_id);
    end if;
    v_office := coalesce(v_office,
      (select x.office_id from public.crm2_properties x where x.id = new.property_id),
      (select c.office_id from public.crm2_contacts c where c.id = new.contact_id));
    if v_office is null then
      raise exception 'CRM: ажлыг хөрөнгө, хэлцэл, харилцагч эсвэл гэрээтэй холбоно уу';
    end if;
    new.office_id := v_office;
    if v_me is not null then new.created_by := v_me; end if;
    if new.created_by is null then
      raise exception 'CRM: бүртгэсэн хүн тодорхойгүй';
    end if;
    new.assignee_id := coalesce(new.assignee_id, new.created_by);
    perform public.crm2_assert_work_staff(new.assignee_id, new.office_id);
    if not v_sys then
      new.status := 'open';
    end if;
    new.done_at := case when new.status = 'done' then now() end;
    new.done_by := case when new.status = 'done' then v_me end;
    new.created_at := now();
  else
    if new.office_id <> old.office_id
       or new.deal_id is distinct from old.deal_id or new.property_id is distinct from old.property_id
       or new.contact_id is distinct from old.contact_id or new.requirement_id is distinct from old.requirement_id
       or new.brokerage_id is distinct from old.brokerage_id
       or new.source_activity_id is distinct from old.source_activity_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: ажлын холбоос, бүртгэсэн хүнийг өөрчлөхгүй';
    end if;
    if new.assignee_id <> old.assignee_id then
      -- Хариуцагч солих: менежер эсвэл хуучин ба шинэ хариуцагчийн аль алиных нь ахлагч
      -- (хэлцэл/харилцагч шилжүүлэх RPC-ээр автоматаар).
      if not v_sys and not (public.crm_is_manager()
                            or (public.crm2_is_lead_of(old.assignee_id) and public.crm2_is_lead_of(new.assignee_id))) then
        raise exception 'CRM: ажлын хариуцагчийг багийн ахлагч эсвэл менежер солино';
      end if;
      perform public.crm2_assert_work_staff(new.assignee_id, new.office_id);
    end if;
    if new.status <> old.status then
      new.done_at := case when new.status = 'done' then now() end;
      new.done_by := case when new.status = 'done' then v_me end;
    else
      new.done_at := old.done_at;
      new.done_by := old.done_by;
    end if;
  end if;
  if new.source_activity_id is not null
     and (tg_op = 'INSERT' or new.source_activity_id is distinct from old.source_activity_id)
     and not exists (select 1 from public.crm2_activities a
                      where a.id = new.source_activity_id and a.deal_id is not distinct from new.deal_id) then
    raise exception 'CRM: холбох дуудлага өөр хэлцлийнх байна';
  end if;
  new.updated_at := now();
  new.updated_by := v_me;
  return new;
end $$;

-- ── 8. Trigger залгалт ──────────────────────────────────────────────────────

create trigger crm2_projects_guard before insert or update on public.crm2_projects
  for each row execute function public.crm2_projects_guard();
create trigger crm2_projects_after_update after update of name on public.crm2_projects
  for each row execute function public.crm2_projects_after_update();
create trigger crm2_projects_track after insert or update on public.crm2_projects
  for each row execute function public.crm2_track_changes('project', 'name', 'is_active');

create trigger crm2_properties_guard before insert or update on public.crm2_properties
  for each row execute function public.crm2_properties_guard();
create trigger crm2_properties_after_insert after insert on public.crm2_properties
  for each row execute function public.crm2_properties_after_insert();
create trigger crm2_properties_track after insert or update on public.crm2_properties
  for each row execute function public.crm2_track_changes('property',
    'status', 'category', 'property_type', 'price', 'currency', 'price_period', 'price_basis',
    'available_from', 'availability_note', 'last_verified_at',
    'listing_agent_id', 'contract_agent_id', 'photo_agent_id', 'project_id',
    'district', 'location_text', 'address_detail', 'lat', 'lng', 'pin_address',
    'area_m2', 'rooms', 'floor', 'building_floors', 'year_in_use',
    'operating_cost', 'operating_cost_currency', 'operating_cost_period', 'operating_cost_note',
    'condition', 'view_note', 'notes', 'advantages', 'features', 'field_notes');

create trigger crm2_property_private_guard before update on public.crm2_property_private
  for each row execute function public.crm2_property_private_guard();
create trigger crm2_property_private_track after update on public.crm2_property_private
  for each row execute function public.crm2_track_changes('property_private',
    'owner_contact_id', 'owner_note', 'showing_instructions');

create trigger crm2_property_media_guard before insert or update on public.crm2_property_media
  for each row execute function public.crm2_property_media_guard();
create trigger crm2_property_media_track after insert or delete on public.crm2_property_media
  for each row execute function public.crm2_track_changes('media', 'kind', 'storage_path', 'external_url', 'caption');

create trigger crm2_brokerage_guard before insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_brokerage_guard();
create trigger crm2_brokerage_after after insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_brokerage_after();
create trigger crm2_brokerage_track after insert or update on public.crm2_brokerage_contracts
  for each row execute function public.crm2_track_changes('brokerage',
    'status', 'number', 'owner_contact_id', 'start_date', 'end_date', 'terms',
    'commission_type', 'commission_value', 'commission_currency', 'commission_note', 'responsible_agent_id',
    'approved_by', 'approval_note', 'rejection_note', 'termination_reason');

create trigger crm2_brokerage_files_guard before insert or update on public.crm2_brokerage_files
  for each row execute function public.crm2_brokerage_files_guard();
create trigger crm2_brokerage_files_track after insert or delete on public.crm2_brokerage_files
  for each row execute function public.crm2_track_changes('brokerage_file', 'storage_path', 'file_name');

create trigger crm2_contacts_guard before insert or update on public.crm2_contacts
  for each row execute function public.crm2_contacts_guard();
create trigger crm2_contacts_track after insert or update on public.crm2_contacts
  for each row execute function public.crm2_track_changes('contact', 'full_name', 'note', 'responsible_agent_id', 'status');

create trigger crm2_contact_phones_guard before insert or update on public.crm2_contact_phones
  for each row execute function public.crm2_contact_phones_guard();
create trigger crm2_contact_phones_delete_guard before delete on public.crm2_contact_phones
  for each row execute function public.crm2_contact_phones_delete_guard();
create trigger crm2_contact_phones_after after insert or update or delete on public.crm2_contact_phones
  for each row execute function public.crm2_contact_phones_after();
create trigger crm2_contact_phones_track after insert or update or delete on public.crm2_contact_phones
  for each row execute function public.crm2_track_changes('phone', 'phone', 'label', 'is_primary');

create trigger crm2_requirements_guard before insert or update on public.crm2_requirements
  for each row execute function public.crm2_requirements_guard();
create trigger crm2_requirements_track after insert or update on public.crm2_requirements
  for each row execute function public.crm2_track_changes('requirement',
    'purpose', 'category', 'property_type', 'budget_min', 'budget_max', 'currency', 'price_period',
    'locations', 'districts', 'rooms_min', 'rooms_max', 'area_min', 'area_max', 'move_in_from', 'move_in_note',
    'must_haves', 'required_features', 'notes', 'status');

create trigger crm2_deals_guard before insert or update on public.crm2_deals
  for each row execute function public.crm2_deals_guard();
create trigger crm2_deals_track after insert or update on public.crm2_deals
  for each row execute function public.crm2_track_changes('deal',
    'stage', 'agent_id', 'requirement_id', 'note', 'cancel_reason_code', 'cancel_reason', 'origin_deal_id');

create trigger crm2_activities_guard before insert or update on public.crm2_activities
  for each row execute function public.crm2_activities_guard();
create trigger crm2_activities_after after insert or update on public.crm2_activities
  for each row execute function public.crm2_activities_after();
create trigger crm2_activities_track after insert or update on public.crm2_activities
  for each row execute function public.crm2_track_changes('activity',
    'kind', 'scheduled_at', 'showing_status', 'occurred_at', 'agent_id', 'voided_at',
    'result', 'feedback', 'note');

create trigger crm2_tasks_guard before insert or update on public.crm2_tasks
  for each row execute function public.crm2_tasks_guard();
create trigger crm2_tasks_track after insert or update on public.crm2_tasks
  for each row execute function public.crm2_track_changes('task', 'kind', 'status', 'assignee_id', 'due_at', 'note');

-- ── 9. RLS ──────────────────────────────────────────────────────────────────

alter table public.crm2_settings             enable row level security;
alter table public.crm2_counters             enable row level security;
alter table public.crm2_projects             enable row level security;
alter table public.crm2_contacts             enable row level security;
alter table public.crm2_contact_phones       enable row level security;
alter table public.crm2_properties           enable row level security;
alter table public.crm2_property_private     enable row level security;
alter table public.crm2_property_media       enable row level security;
alter table public.crm2_brokerage_contracts  enable row level security;
alter table public.crm2_brokerage_files      enable row level security;
alter table public.crm2_requirements         enable row level security;
alter table public.crm2_requirement_versions enable row level security;
alter table public.crm2_deals                enable row level security;
alter table public.crm2_activities           enable row level security;
alter table public.crm2_tasks                enable row level security;
alter table public.crm2_history              enable row level security;
alter table public.crm2_requests             enable row level security;
alter table public.crm2_reminder_log         enable row level security;
-- crm2_counters, crm2_reminder_log: policy байхгүй (зөвхөн definer функц).

create policy crm2_settings_select on public.crm2_settings for select to authenticated
  using (office_id = (select public.crm_office_id()) and (select public.crm2_is_member()));

create policy crm2_projects_select on public.crm2_projects for select to authenticated
  using (office_id = (select public.crm_office_id()) and (select public.crm2_is_member()));
create policy crm2_projects_insert on public.crm2_projects for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and (select public.crm2_can_work())
              and created_by = (select auth.uid()));
create policy crm2_projects_update on public.crm2_projects for update to authenticated
  using (office_id = (select public.crm_office_id()) and (select public.crm_is_manager()))
  with check (office_id = (select public.crm_office_id()) and (select public.crm_is_manager()));

-- Staff хөрөнгө: идэвхтэй (ноорог биш) хөрөнгийг оффисын бүх ажилтан харна
-- (property.visibility = 'office'); ноорогийг үүсгэгч, үүрэгт агент, ахлагч, батлагч.
create policy crm2_properties_select on public.crm2_properties for select to authenticated
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm2_is_member())
    and (
      (status <> 'draft' and (select public.crm2_setting_text('property.visibility')) = 'office')
      or (select auth.uid()) in (listing_agent_id, contract_agent_id, photo_agent_id)
      or (status = 'draft' and created_by = (select auth.uid()))
      or (select public.crm2_sees_all_properties())
      or public.crm2_property_visible(id, status, created_by, listing_agent_id, contract_agent_id, photo_agent_id)
    )
  );
create policy crm2_properties_insert on public.crm2_properties for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and (select public.crm2_can_work())
              and created_by = (select auth.uid())
              and status = 'draft');
create policy crm2_properties_update on public.crm2_properties for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_property_editable(status, created_by, listing_agent_id, contract_agent_id, photo_agent_id))
  with check (office_id = (select public.crm_office_id())
              and public.crm2_property_editable(status, created_by, listing_agent_id, contract_agent_id, photo_agent_id));

create policy crm2_property_private_select on public.crm2_property_private for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_property_private(property_id));
create policy crm2_property_private_update on public.crm2_property_private for update to authenticated
  using (office_id = (select public.crm_office_id())
         and public.crm2_can_view_property_private(property_id)
         and public.crm2_can_edit_property(property_id))
  with check (office_id = (select public.crm_office_id())
              and public.crm2_can_view_property_private(property_id)
              and public.crm2_can_edit_property(property_id));

create policy crm2_property_media_select on public.crm2_property_media for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_property(property_id));
create policy crm2_property_media_insert on public.crm2_property_media for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and uploaded_by = (select auth.uid())
              and public.crm2_can_edit_property(property_id));
create policy crm2_property_media_update on public.crm2_property_media for update to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_edit_property(property_id))
  with check (office_id = (select public.crm_office_id()) and public.crm2_can_edit_property(property_id));
create policy crm2_property_media_delete on public.crm2_property_media for delete to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_edit_property(property_id));

-- crm2_can_view_brokerage-тэй ижил дүрэм (мөрийн баганаар — INSERT..RETURNING-д найдвартай).
create policy crm2_brokerage_select on public.crm2_brokerage_contracts for select to authenticated
  using (
    office_id = (select public.crm_office_id())
    and (select public.crm2_is_member())
    and (
      (status in ('draft', 'pending', 'active') and responsible_agent_id = (select auth.uid()))
      or (status = 'draft' and created_by = (select auth.uid()))
      or public.crm2_is_lead_of(responsible_agent_id)
      or public.crm2_can_view_property_private(property_id)
    )
  );
create policy crm2_brokerage_insert on public.crm2_brokerage_contracts for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and (select public.crm2_can_work())
              and created_by = (select auth.uid())
              and status = 'draft'
              and public.crm2_can_edit_property(property_id));
create policy crm2_brokerage_update on public.crm2_brokerage_contracts for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (public.crm2_can_edit_property(property_id)
              or (responsible_agent_id = (select auth.uid()) and (select public.crm2_can_work()))))
  with check (office_id = (select public.crm_office_id())
              and (public.crm2_can_edit_property(property_id)
                   or (responsible_agent_id = (select auth.uid()) and (select public.crm2_can_work()))));

create policy crm2_brokerage_files_select on public.crm2_brokerage_files for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_brokerage(contract_id));
create policy crm2_brokerage_files_insert on public.crm2_brokerage_files for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and uploaded_by = (select auth.uid())
              and public.crm2_can_attach_brokerage(contract_id));
create policy crm2_brokerage_files_delete on public.crm2_brokerage_files for delete to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_detach_brokerage(contract_id));

create policy crm2_contacts_select on public.crm2_contacts for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and ((select auth.uid()) = responsible_agent_id or public.crm2_contact_visible(id, responsible_agent_id)));
-- Харилцагч зөвхөн crm2_create_contact-аар үүснэ (дугаар заавал, давхардлын шалгалт).
create policy crm2_contacts_update on public.crm2_contacts for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_contact_editable(responsible_agent_id))
  with check (office_id = (select public.crm_office_id()) and public.crm2_contact_editable(responsible_agent_id));

create policy crm2_contact_phones_select on public.crm2_contact_phones for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_contact(contact_id));
create policy crm2_contact_phones_insert on public.crm2_contact_phones for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and public.crm2_can_edit_contact(contact_id));
create policy crm2_contact_phones_update on public.crm2_contact_phones for update to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_edit_contact(contact_id))
  with check (office_id = (select public.crm_office_id()) and public.crm2_can_edit_contact(contact_id));
create policy crm2_contact_phones_delete on public.crm2_contact_phones for delete to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_edit_contact(contact_id));

create policy crm2_requirements_select on public.crm2_requirements for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_contact(contact_id));
create policy crm2_requirements_insert on public.crm2_requirements for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and public.crm2_can_edit_requirements(contact_id));
create policy crm2_requirements_update on public.crm2_requirements for update to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_edit_requirements(contact_id))
  with check (office_id = (select public.crm_office_id()) and public.crm2_can_edit_requirements(contact_id));

create policy crm2_requirement_versions_select on public.crm2_requirement_versions for select to authenticated
  using (office_id = (select public.crm_office_id()) and public.crm2_can_view_contact(contact_id));

-- Хэлцэл: зөвхөн crm2_open_deal/crm2_log_call үүсгэнэ (insert policy байхгүй).
create policy crm2_deals_select on public.crm2_deals for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and ((select auth.uid()) = agent_id or public.crm2_deal_visible(id, agent_id, property_id, contact_id)));
create policy crm2_deals_update on public.crm2_deals for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_deal_editable(agent_id))
  with check (office_id = (select public.crm_office_id()) and public.crm2_deal_editable(agent_id));

create policy crm2_activities_select on public.crm2_activities for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and ((select auth.uid()) in (agent_id, created_by) or public.crm2_can_view_deal(deal_id)));
create policy crm2_activities_insert on public.crm2_activities for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and created_by = (select auth.uid())
              and (select public.crm2_can_work())
              and public.crm2_can_edit_deal(deal_id));
create policy crm2_activities_update on public.crm2_activities for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_activity_editable(deal_id, agent_id, created_by))
  with check (office_id = (select public.crm_office_id())
              and public.crm2_activity_editable(deal_id, agent_id, created_by));

-- Ажил: хариуцагч/үүсгэгч, менежер, хариуцагчийн ахлагч, хэлцлийг харах эрхтэн харна.
-- Устгахгүй — «цуцалсан» төлөвөөр. Хариуцагч солих дүрмийг guard шалгана.
create policy crm2_tasks_select on public.crm2_tasks for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_task_visible(assignee_id, created_by, deal_id));
create policy crm2_tasks_insert on public.crm2_tasks for insert to authenticated
  with check (office_id = (select public.crm_office_id())
              and (select public.crm2_can_work())
              and created_by = (select auth.uid())
              and (assignee_id = (select auth.uid())
                   or (select public.crm_is_manager())
                   or public.crm2_is_lead_of(assignee_id))
              and (deal_id is null or public.crm2_can_edit_deal(deal_id))
              and (contact_id is null or public.crm2_can_view_contact(contact_id))
              and (property_id is null or public.crm2_can_view_property(property_id))
              and (brokerage_id is null or public.crm2_can_view_brokerage(brokerage_id)));
create policy crm2_tasks_update on public.crm2_tasks for update to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_can_work())
         and (assignee_id = (select auth.uid())
              or (select public.crm_is_manager())
              or public.crm2_is_lead_of(assignee_id)
              or (deal_id is not null and public.crm2_can_edit_deal(deal_id))))
  with check (office_id = (select public.crm_office_id())
              and (select public.crm2_can_work())
              and (assignee_id = (select auth.uid())
                   or (select public.crm_is_manager())
                   or public.crm2_is_lead_of(assignee_id)
                   or (deal_id is not null and public.crm2_can_edit_deal(deal_id))));

create policy crm2_history_select on public.crm2_history for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and public.crm2_can_view_history(entity, entity_id, property_id, contact_id, deal_id));

create policy crm2_requests_select on public.crm2_requests for select to authenticated
  using (office_id = (select public.crm_office_id())
         and (select public.crm2_is_member())
         and (requested_by = (select auth.uid())
              or decided_by = (select auth.uid())
              or (select public.crm_is_manager())
              or public.crm2_can_decide_request(id)));

-- ── 10. RPC (UI дуудна) ─────────────────────────────────────────────────────

create function public.crm2_my_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile_id', auth.uid(),
    'office_id', public.crm_office_id(),
    'staff_id', public.crm_my_staff_id(),
    'roles', to_jsonb(public.crm_my_roles()),
    'team_id', public.crm_my_team(),
    'is_member', public.crm2_is_member(),
    'is_manager', public.crm_is_manager(),
    'is_team_lead', public.crm2_is_team_lead(),
    'is_office_admin', public.crm2_is_office_admin(),
    'can_work', public.crm2_can_work(),
    'can_approve', public.crm2_is_member() and (
        public.crm2_has_setting_role('roles.approve')
        or (public.crm2_setting_bool('approvals.team_lead') and public.crm2_is_team_lead())
        or (public.crm2_setting_bool('approvals.office_admin') and public.crm2_is_office_admin())),
    'has_finance', public.crm2_has_finance(),
    'can_manage_settings', public.crm2_can_manage_settings(),
    -- roles.* ба approvals.* түлхүүрийг зөвхөн CEO өөрчилнө.
    'can_manage_access_settings', public.crm2_can_manage_settings() and public.has_crm_role('ceo')
  );
$$;

-- Агент сонгох жагсаалт (agent нь crm_staff-ийг бүхэлд нь харах эрхгүй).
create function public.crm2_staff_directory()
returns table (profile_id uuid, name text, avatar_url text, team_id uuid, team_name text, roles public.crm_role[])
language sql stable security definer set search_path = public as $$
  select s.profile_id,
         coalesce(a.display_name, p.full_name, 'Ажилтан'),
         coalesce(a.avatar_url, a.avatar, p.avatar_url),
         s.team_id,
         t.name,
         s.roles
    from public.crm_staff s
    join public.profiles p on p.id = s.profile_id
    left join lateral (
      select ag.display_name, ag.avatar_url, ag.avatar
        from public.agents ag
       where ag.profile_id = s.profile_id and ag.office_id = s.office_id
       limit 1
    ) a on true
    left join public.crm_teams t on t.id = s.team_id
   where s.office_id = public.crm_office_id()
     and s.is_active
     and public.crm2_is_member()
   order by 2;
$$;

-- Бүх тохиргооны хүчинтэй утга (S11).
create function public.crm2_settings_effective()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k, public.crm2_setting(k)), '{}'::jsonb)
    from unnest(public.crm2_setting_keys()) k
   where public.crm2_is_member();
$$;

create function public.crm2_set_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
      ('docs.max_files_per_contract', 1, 100)
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
    else
      v_allowed := case
        when p_key like 'roles.%' then enum_range(null::public.crm_role)::text[]
        when p_key = 'property.agent_direct_statuses' then array['suspended', 'rented', 'sold', 'contract_ended', 'archived']
        when p_key = 'deal.open_property_statuses' then array['active', 'suspended']
        when p_key = 'property.activation_required' then array[
          'project', 'district', 'location_text', 'address_detail', 'pin', 'area_m2', 'rooms', 'floor', 'price',
          'year_in_use', 'property_type', 'listing_agent_id', 'contract_agent_id', 'photo_agent_id',
          'owner', 'showing_instructions', 'images']
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

create function public.crm2_reset_setting(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_old jsonb;
  v_flag text;
begin
  if not public.crm2_can_manage_settings() then
    raise exception 'CRM: тохиргоо өөрчлөх эрхгүй';
  end if;
  if (p_key like 'roles.%' or p_key like 'approvals.%') and not public.has_crm_role('ceo') then
    raise exception 'CRM: эрх ба батлалтын тохиргоог зөвхөн ерөнхий захирал өөрчилнө';
  end if;
  delete from public.crm2_settings s where s.office_id = v_office and s.key = p_key returning s.value into v_old;
  if v_old is not null then
    perform public.crm2_log(v_office, 'settings', v_office, 'reset', p_key, v_old, public.crm2_setting_default(p_key));
    if p_key in ('property.types', 'property.category_labels', 'property.features') then
      v_flag := public.crm2_rpc_begin(null);
      update public.crm2_properties set search_text = search_text where office_id = v_office;
      perform public.crm2_rpc_end(v_flag);
    end if;
  end if;
  return public.crm2_setting_default(p_key);
end $$;

-- Төслийн нэр санал болгох (өмнө бичсэн нэрс).
create function public.crm2_suggest_projects(p_query text, p_limit int default 10)
returns table (id uuid, name text, property_count int)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.name,
         (select count(*)::int from public.crm2_properties x where x.project_id = pr.id)
    from public.crm2_projects pr
   where pr.office_id = public.crm_office_id()
     and public.crm2_is_member()
     and pr.is_active
     and (coalesce(btrim(p_query), '') = ''
          or pr.name_key like '%' || public.crm2_like_escape(lower(btrim(p_query))) || '%'
          or similarity(pr.name_key, lower(btrim(p_query))) > 0.3)
   order by (pr.name_key like public.crm2_like_escape(lower(btrim(coalesce(p_query, '')))) || '%') desc,
            similarity(pr.name_key, lower(btrim(coalesce(p_query, '')))) desc,
            pr.name
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Төслийг нэрээр олох эсвэл шинээр үүсгэх.
create function public.crm2_ensure_project(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if not public.crm2_can_work() then
    raise exception 'CRM: эрх алга';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'CRM: төслийн нэр 1–120 тэмдэгт';
  end if;
  select pr.id into v_id from public.crm2_projects pr
   where pr.office_id = v_office and pr.name_key = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;
  begin
    insert into public.crm2_projects (office_id, name, created_by)
    values (v_office, v_name, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    select pr.id into v_id from public.crm2_projects pr
     where pr.office_id = v_office and pr.name_key = lower(v_name);
  end;
  return v_id;
end $$;

-- Байршлын санал (ноорог биш хөрөнгийн байршлын бичвэр).
create function public.crm2_suggest_locations(p_query text, p_limit int default 15)
returns table (location text, property_count int)
language sql stable security definer set search_path = public as $$
  select min(x.location_text), count(*)::int
    from public.crm2_properties x
   where x.office_id = public.crm_office_id()
     and public.crm2_is_member()
     and x.status <> 'draft'
     and (public.crm2_setting_text('property.visibility') = 'office' or public.crm2_can_view_property(x.id))
     and coalesce(btrim(x.location_text), '') <> ''
     and (coalesce(btrim(p_query), '') = ''
          or lower(x.location_text) like '%' || public.crm2_like_escape(lower(btrim(p_query))) || '%')
   group by lower(btrim(x.location_text))
   order by 2 desc, 1
   limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

create function public.crm2_property_activation_check(p_property uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_missing text[];
begin
  if not public.crm2_can_view_property(p_property) then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  v_missing := public.crm2_property_missing(p_property);
  return jsonb_build_object(
    'ok', cardinality(v_missing) = 0,
    'missing', to_jsonb(v_missing),
    'missing_text', public.crm2_missing_text(v_missing),
    'has_valid_contract', public.crm2_property_has_valid_contract(p_property)
  );
end $$;

-- Хөрөнгийн төлөв өөрчлөх. Батлагч → шууд ('applied'); засварлагч → хүсэлт
-- ('pending'), гэхдээ батлагдсан гэрээтэй ноорог/гэрээ дууссан хөрөнгийг
-- идэвхжүүлэх нь засварлагчид шууд.
create function public.crm2_property_set_status(
  p_property uuid, p_status public.crm2_property_status, p_reason text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_p public.crm2_properties;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_activation boolean;
  v_editor boolean;
  v_direct boolean;
  v_missing text[];
  v_flag text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_p from public.crm2_properties
   where id = p_property and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  if v_p.status = p_status then
    raise exception 'CRM: хөрөнгө аль хэдийн энэ төлөвтэй байна';
  end if;
  if not public.crm2_property_transition_ok(v_p.status, p_status) then
    raise exception 'CRM: «%» → «%» шилжилт зөвшөөрөгдөхгүй',
      public.crm2_status_label(v_p.status::text), public.crm2_status_label(p_status::text);
  end if;
  v_activation := p_status = 'active' and v_p.status in ('draft', 'contract_ended');
  if not v_activation and v_reason is null then
    raise exception 'CRM: төлөв өөрчлөх шалтгааныг бичнэ үү';
  end if;
  if p_status = 'active' then
    v_missing := public.crm2_property_missing(v_p.id);
    if cardinality(v_missing) > 0 then
      raise exception 'CRM: идэвхжүүлэхэд дутуу: %', public.crm2_missing_text(v_missing);
    end if;
  end if;

  v_editor := public.crm2_property_editable(v_p.status, v_p.created_by, v_p.listing_agent_id,
                                            v_p.contract_agent_id, v_p.photo_agent_id);
  v_direct := (public.crm2_property_approver(v_p.id)
               and public.crm2_self_ok(array[v_p.listing_agent_id, v_p.contract_agent_id, v_p.photo_agent_id]))
              or (v_editor and (v_activation or exists (
                    select 1 from jsonb_array_elements_text(public.crm2_setting('property.agent_direct_statuses')) s
                     where s = p_status::text)));

  if v_direct then
    v_flag := public.crm2_rpc_begin(v_reason);
    perform public.crm2_apply_property_status(v_p.id, p_status, v_reason);
    update public.crm2_requests
       set status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
           decision_note = 'Төлөв шууд өөрчлөгдсөн'
     where kind = 'property_status' and target_id = v_p.id and status = 'pending';
    perform public.crm2_rpc_end(v_flag);
    return 'applied';
  end if;

  if not v_editor then
    raise exception 'CRM: энэ хөрөнгийн төлөвийг өөрчлөх эрхгүй';
  end if;
  if exists (select 1 from public.crm2_requests r
              where r.kind = 'property_status' and r.target_id = v_p.id and r.status = 'pending') then
    raise exception 'CRM: энэ хөрөнгөд шийдвэрлэгдээгүй хүсэлт байна';
  end if;
  insert into public.crm2_requests (office_id, kind, target_id, property_id, payload, reason, requested_by)
  values (v_p.office_id, 'property_status', v_p.id, v_p.id,
          jsonb_build_object('from', v_p.status, 'to', p_status), v_reason, auth.uid());
  perform public.crm2_notify(
    public.crm2_approver_ids(v_p.office_id, array[v_p.listing_agent_id, v_p.contract_agent_id, v_p.photo_agent_id]),
    'crm2_request', 'Хөрөнгийн төлөв өөрчлөх хүсэлт',
    v_p.code || ': ' || public.crm2_status_label(v_p.status::text) || ' → ' || public.crm2_status_label(p_status::text),
    '/agent/crm/staff/' || v_p.id::text);
  return 'pending';
end $$;

-- Эзэнтэй мэдээллээ тулгасныг тэмдэглэх.
create function public.crm2_property_mark_verified(p_property uuid, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_flag text;
  v_at timestamptz := now();
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийг баталгаажуулах эрхгүй';
  end if;
  v_flag := public.crm2_rpc_begin(nullif(btrim(coalesce(p_note, '')), ''));
  update public.crm2_properties
     set last_verified_at = v_at, last_verified_by = auth.uid()
   where id = p_property;
  perform public.crm2_rpc_end(v_flag);
  return v_at;
end $$;

create function public.crm2_decide_request(p_request uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_r public.crm2_requests;
  v_flag text;
  v_status public.crm2_request_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_link text;
begin
  select * into v_r from public.crm2_requests
   where id = p_request and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хүсэлт олдсонгүй';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'CRM: хүсэлт аль хэдийн шийдвэрлэгдсэн';
  end if;
  if not public.crm2_can_decide_request(v_r.id) then
    raise exception 'CRM: энэ хүсэлтийг шийдвэрлэх эрхгүй';
  end if;
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'CRM: татгалзсан шалтгааныг бичнэ үү';
  end if;
  v_flag := public.crm2_rpc_begin(coalesce(v_r.reason, v_note));
  if coalesce(p_approve, false) then
    if v_r.kind = 'property_status' then
      perform public.crm2_apply_property_status(v_r.target_id, (v_r.payload->>'to')::public.crm2_property_status, v_r.reason);
    elsif v_r.kind = 'deal_transfer' then
      perform public.crm2_apply_deal_transfer(v_r.target_id, public.crm2_uuid(v_r.payload->>'to_agent'));
    elsif v_r.kind = 'contact_transfer' then
      perform public.crm2_apply_contact_transfer(v_r.target_id, public.crm2_uuid(v_r.payload->>'to_agent'),
                                                 coalesce((v_r.payload->>'with_deals')::boolean, false));
    end if;
    v_status := 'approved';
  else
    v_status := 'rejected';
  end if;
  update public.crm2_requests
     set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = v_note
   where id = v_r.id;
  perform public.crm2_rpc_end(v_flag);
  v_link := case
    when v_r.property_id is not null then '/agent/crm/staff/' || v_r.property_id::text
    when v_r.kind = 'contact_transfer' then '/agent/crm/contacts/' || v_r.target_id::text
  end;
  perform public.crm2_notify(array[v_r.requested_by], 'crm2_request_decided',
    case when v_status = 'approved' then 'Хүсэлт батлагдлаа' else 'Хүсэлт татгалзагдлаа' end,
    coalesce(v_note, ''), v_link);
  return v_status::text;
end $$;

create function public.crm2_cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.crm2_requests
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Хүсэгч цуцалсан'
   where id = p_request
     and office_id = public.crm_office_id()
     and requested_by = auth.uid()
     and status = 'pending';
  if not found then
    raise exception 'CRM: цуцлах хүсэлт олдсонгүй';
  end if;
end $$;

-- ── Зуучлалын гэрээ ──

create function public.crm2_brokerage_submit(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_missing text[];
  v_flag text;
  v_code text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: гэрээ олдсонгүй';
  end if;
  if v_b.status <> 'draft' then
    raise exception 'CRM: зөвхөн ноорог гэрээг батлуулахаар илгээнэ';
  end if;
  if not public.crm2_can_edit_brokerage_draft(v_b.id) then
    raise exception 'CRM: энэ гэрээг илгээх эрхгүй';
  end if;
  v_missing := public.crm2_brokerage_missing(v_b.id);
  if cardinality(v_missing) > 0 then
    raise exception 'CRM: гэрээнд дутуу: %', public.crm2_missing_text(v_missing);
  end if;
  v_flag := public.crm2_rpc_begin(null);
  update public.crm2_brokerage_contracts
     set status = 'pending', submitted_by = auth.uid(), submitted_at = now()
   where id = v_b.id;
  perform public.crm2_rpc_end(v_flag);
  select x.code into v_code from public.crm2_properties x where x.id = v_b.property_id;
  perform public.crm2_notify(public.crm2_approver_ids(v_b.office_id, array[v_b.responsible_agent_id]),
    'crm2_brokerage_pending', 'Зуучлалын гэрээ батлах хүсэлт', v_code || ' · ' || v_b.number,
    '/agent/crm/staff/' || v_b.property_id::text);
end $$;

-- Илгээснээ буцааж авах (pending → draft).
create function public.crm2_brokerage_withdraw(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_flag text;
begin
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status <> 'pending' then
    raise exception 'CRM: буцааж авах илгээсэн гэрээ олдсонгүй';
  end if;
  if not (v_b.submitted_by = auth.uid() or public.crm2_can_edit_brokerage_draft(v_b.id)) then
    raise exception 'CRM: энэ гэрээг буцааж авах эрхгүй';
  end if;
  v_flag := public.crm2_rpc_begin('Илгээснээ буцааж авсан');
  update public.crm2_brokerage_contracts set status = 'draft' where id = v_b.id;
  perform public.crm2_rpc_end(v_flag);
end $$;

-- Батлах. Хөрөнгө ноорог/гэрээ дууссан төлөвтэй, гэрээ өнөөдөр хүчинтэй, заавал
-- талбар бүрэн бол хөрөнгийг шууд идэвхжүүлнэ; эхлэх огноо ирээдүйд бол тэр өдөр
-- өдөр тутмын ажил идэвхжүүлнэ.
-- p_expected_updated_at: батлагчийн харсан хувилбарын updated_at (буцааж аваад
-- засаж дахин илгээсэн бол батлахгүй).
create function public.crm2_brokerage_approve(
  p_contract uuid, p_note text default null, p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_p public.crm2_properties;
  v_missing text[];
  v_pmissing text[] := '{}';
  v_pstatus public.crm2_property_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := public.crm2_today();
  v_flag text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: гэрээ олдсонгүй';
  end if;
  -- Зөвхөн илгээсэн (агуулга нь түгжигдсэн) гэрээг батална; менежер нэг товшилтоор
  -- бол илгээгээд дараа нь батална.
  if v_b.status <> 'pending' then
    raise exception 'CRM: зөвхөн батлуулахаар илгээсэн гэрээг батална (төлөв: %)', v_b.status;
  end if;
  if p_expected_updated_at is not null and p_expected_updated_at is distinct from v_b.updated_at then
    raise exception 'CRM: гэрээ таныг харснаас хойш өөрчлөгдсөн — дахин шалгаад батална уу';
  end if;
  select * into v_p from public.crm2_properties where id = v_b.property_id for update;
  -- Өөрийн гэрээ эсвэл өөрийн (үүрэгт агент болсон) хөрөнгийн гэрээг батлахгүй.
  if not public.crm2_brokerage_approver(v_b.responsible_agent_id)
     or not public.crm2_self_ok(array[v_b.responsible_agent_id, v_b.submitted_by, v_b.created_by,
                                      v_p.listing_agent_id, v_p.contract_agent_id, v_p.photo_agent_id]) then
    raise exception 'CRM: энэ гэрээг батлах эрхгүй (өөрийн гэрээг өөр эрх бүхий хүн батална)';
  end if;
  v_missing := public.crm2_brokerage_missing(v_b.id);
  if cardinality(v_missing) > 0 then
    raise exception 'CRM: гэрээнд дутуу: %', public.crm2_missing_text(v_missing);
  end if;

  v_flag := public.crm2_rpc_begin(v_note);
  update public.crm2_brokerage_contracts
     set status = 'active', approved_by = auth.uid(), approved_at = now(), approval_note = v_note,
         rejected_by = null, rejected_at = null, rejection_note = null
   where id = v_b.id;

  -- Гэрээний trigger brokerage_end_date-г шинэчилсэн тул мөрийг дахин уншина.
  select * into v_p from public.crm2_properties where id = v_b.property_id;
  v_pstatus := v_p.status;
  if v_p.status in ('draft', 'contract_ended') then
    if v_b.start_date <= v_today then
      v_pmissing := public.crm2_property_missing(v_p.id);
      if cardinality(v_pmissing) = 0 then
        update public.crm2_properties set status = 'active', status_reason = null where id = v_p.id;
        v_pstatus := 'active';
      end if;
    else
      update public.crm2_brokerage_contracts set activate_on_start = true where id = v_b.id;
    end if;
  end if;
  update public.crm2_requests
     set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Гэрээ батлагдсан'
   where kind = 'property_status' and target_id = v_p.id and status = 'pending'
     and v_pstatus = 'active' and payload->>'to' = 'active';
  perform public.crm2_rpc_end(v_flag);

  perform public.crm2_notify(array[v_b.responsible_agent_id, v_b.submitted_by, v_b.created_by],
    'crm2_brokerage_decided', 'Зуучлалын гэрээ батлагдлаа', v_p.code || ' · ' || v_b.number,
    '/agent/crm/staff/' || v_p.id::text);
  return jsonb_build_object(
    'contract_status', 'active',
    'property_status', v_pstatus,
    'property_missing', to_jsonb(v_pmissing),
    'activate_on_start', v_b.start_date > v_today
  );
end $$;

create function public.crm2_brokerage_reject(p_contract uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_flag text;
  v_code text;
begin
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status <> 'pending' then
    raise exception 'CRM: татгалзах илгээсэн гэрээ олдсонгүй';
  end if;
  if not public.crm2_brokerage_approver(v_b.responsible_agent_id) then
    raise exception 'CRM: энэ гэрээг шийдвэрлэх эрхгүй';
  end if;
  if v_note is null then
    raise exception 'CRM: татгалзсан шалтгааныг бичнэ үү';
  end if;
  v_flag := public.crm2_rpc_begin(v_note);
  update public.crm2_brokerage_contracts
     set status = 'draft', rejected_by = auth.uid(), rejected_at = now(), rejection_note = v_note
   where id = v_b.id;
  perform public.crm2_rpc_end(v_flag);
  select x.code into v_code from public.crm2_properties x where x.id = v_b.property_id;
  perform public.crm2_notify(array[v_b.responsible_agent_id, v_b.submitted_by], 'crm2_brokerage_decided',
    'Зуучлалын гэрээ буцаагдлаа', v_code || ' · ' || v_b.number || ': ' || v_note,
    '/agent/crm/staff/' || v_b.property_id::text);
end $$;

-- Батлагдсан гэрээг хугацаанаас нь өмнө цуцлах (батлагч). Хүчинтэй гэрээ
-- үлдээгүй бол хөрөнгө тохиргооны дагуу «гэрээ дууссан» болно.
create function public.crm2_brokerage_terminate(p_contract uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
  v_status public.crm2_property_status;
begin
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status <> 'active' then
    raise exception 'CRM: цуцлах батлагдсан гэрээ олдсонгүй';
  end if;
  if not public.crm2_brokerage_approver(v_b.responsible_agent_id)
     or not public.crm2_self_ok(array[v_b.responsible_agent_id]) then
    raise exception 'CRM: энэ гэрээг цуцлах эрхгүй';
  end if;
  if v_reason is null then
    raise exception 'CRM: цуцлах шалтгааныг бичнэ үү';
  end if;
  v_flag := public.crm2_rpc_begin(v_reason);
  update public.crm2_brokerage_contracts
     set status = 'terminated', terminated_by = auth.uid(), terminated_at = now(),
         termination_reason = v_reason, activate_on_start = false
   where id = v_b.id;
  perform public.crm2_end_property_if_uncovered(v_b.property_id, 'Зуучлалын гэрээ цуцлагдсан: ' || v_reason);
  perform public.crm2_rpc_end(v_flag);
  select x.status into v_status from public.crm2_properties x where x.id = v_b.property_id;
  return v_status::text;
end $$;

-- Батлагдаагүй ноорог гэрээг хаях (мөр түүхэнд үлдэнэ).
create function public.crm2_brokerage_discard(p_contract uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_flag text;
begin
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status <> 'draft' then
    raise exception 'CRM: хаях ноорог гэрээ олдсонгүй';
  end if;
  if not public.crm2_can_edit_brokerage_draft(v_b.id) then
    raise exception 'CRM: энэ гэрээг хаях эрхгүй';
  end if;
  v_flag := public.crm2_rpc_begin(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Ноорог хаясан'));
  update public.crm2_brokerage_contracts
     set status = 'terminated', terminated_by = auth.uid(), terminated_at = now(),
         termination_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Ноорог хаясан')
   where id = v_b.id;
  perform public.crm2_rpc_end(v_flag);
end $$;

-- Сунгалт: өмнөх гэрээтэй холбоотой шинэ ноорог хувилбар (файлыг шинээр хавсаргана).
create function public.crm2_brokerage_renew(p_contract uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_b public.crm2_brokerage_contracts;
  v_id uuid;
  v_flag text;
  v_resp uuid;
begin
  select * into v_b from public.crm2_brokerage_contracts
   where id = p_contract and office_id = public.crm_office_id() for update;
  if not found or v_b.status not in ('active', 'expired') then
    raise exception 'CRM: зөвхөн батлагдсан (идэвхтэй эсвэл дууссан) гэрээг сунгана';
  end if;
  if not (public.crm2_can_edit_property(v_b.property_id)
          or (v_b.responsible_agent_id = auth.uid() and public.crm2_can_work())) then
    raise exception 'CRM: энэ гэрээг сунгах эрхгүй';
  end if;
  if exists (select 1 from public.crm2_brokerage_contracts n
              where n.previous_id = v_b.id and n.status <> 'terminated') then
    raise exception 'CRM: энэ гэрээнд сунгалтын хувилбар аль хэдийн байна';
  end if;
  -- Хариуцагч ажлаас гарсан бол: гэрээ хийсэн агент, эсвэл сунгаж буй хүн.
  select coalesce(
    (select s.profile_id from public.crm_staff s
      where s.profile_id = v_b.responsible_agent_id and s.office_id = v_b.office_id and s.is_active),
    (select s.profile_id from public.crm_staff s
       join public.crm2_properties x on x.id = v_b.property_id
      where s.profile_id = x.contract_agent_id and s.office_id = v_b.office_id and s.is_active),
    auth.uid()) into v_resp;
  v_flag := public.crm2_rpc_begin('Сунгалт');
  insert into public.crm2_brokerage_contracts (
    office_id, property_id, previous_id, status, owner_contact_id, start_date, end_date, terms,
    commission_type, commission_value, commission_currency, commission_note, responsible_agent_id, created_by)
  values (
    v_b.office_id, v_b.property_id, v_b.id, 'draft', v_b.owner_contact_id, v_b.end_date + 1, null, v_b.terms,
    v_b.commission_type, v_b.commission_value, v_b.commission_currency, v_b.commission_note,
    v_resp, auth.uid())
  returning id into v_id;
  perform public.crm2_rpc_end(v_flag);
  return v_id;
end $$;

-- ── Харилцагч ──

-- Дугаараар хайх: нээх эрхгүй ч гэсэн тухайн дугаартай харилцагч байгааг
-- (нэрийг далдлан, хариуцагчийн нэртэй) харуулж давхар бүртгэлээс сэргийлнэ.
-- p_property өгвөл тухайн хөрөнгө дээрх нээлттэй хэлцлийг (үүсгэхгүйгээр) буцаана.
-- contact_id-г шилжүүлэх хүсэлтэд ашиглана; эрхгүй бол харилцагчийг холбох (эзэн
-- болгох) боломжгүй — guard шалгана.
create function public.crm2_find_contacts_by_phone(p_phone text, p_property uuid default null)
returns table (
  contact_id uuid, code text, display_name text, can_open boolean,
  responsible_agent_id uuid, responsible_agent_name text, status public.crm2_record_status, open_deals int,
  property_deal_id uuid, property_deal_code text, property_deal_stage public.crm2_deal_stage,
  property_deal_agent_name text, property_deal_can_log boolean
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_norm text := public.crm2_normalize_phone(p_phone);
begin
  if not public.crm2_can_work() then
    return;
  end if;
  if length(v_norm) < 8 then
    raise exception 'CRM: утасны дугаарыг бүтнээр оруулна уу';
  end if;
  if p_property is not null and not public.crm2_can_view_property(p_property) then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  return query
  select c.id,
         c.code,
         case when public.crm2_can_view_contact(c.id) then c.full_name else public.crm2_mask_name(c.full_name) end,
         public.crm2_can_view_contact(c.id),
         c.responsible_agent_id,
         public.crm2_profile_name(c.responsible_agent_id),
         c.status,
         (select count(*)::int from public.crm2_deals d where d.contact_id = c.id and d.is_open),
         pd.id,
         pd.code,
         case when pd.id is not null and public.crm2_can_view_deal(pd.id) then pd.stage end,
         case when pd.id is not null then public.crm2_profile_name(pd.agent_id) end,
         coalesce(pd.id is not null and public.crm2_can_edit_deal(pd.id), false)
    from public.crm2_contacts c
    left join lateral (
      select d.id, d.code, d.stage, d.agent_id
        from public.crm2_deals d
       where p_property is not null and d.property_id = p_property
         and d.contact_id = c.id and d.is_open
    ) pd on true
   where c.office_id = public.crm_office_id()
     and exists (select 1 from public.crm2_contact_phones ph
                  where ph.contact_id = c.id and ph.phone_norm = v_norm)
   order by c.created_at;
end $$;

-- Харилцагч + дугаарууд нэг дор. Давхцал илэрвэл (p_allow_duplicate=false)
-- үүсгэхгүйгээр жагсаалтыг буцаана; нэгтгэх ажиллагаа хэзээ ч автоматаар хийгдэхгүй.
-- p_phones: ["9911...", ...] эсвэл [{"phone": "...", "label": "..."}, ...]
create function public.crm2_create_contact(
  p_full_name text, p_phones jsonb, p_note text default null,
  p_agent uuid default null, p_allow_duplicate boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_agent uuid := coalesce(p_agent, auth.uid());
  v_norms text[];
  v_dups jsonb;
  v_id uuid;
  v_code text;
  v_item jsonb;
  v_phone text;
  v_first boolean := true;
begin
  if not public.crm2_can_work() then
    raise exception 'CRM: харилцагч бүртгэх эрхгүй';
  end if;
  if v_agent <> auth.uid() and not (public.crm_is_manager() or public.crm2_is_lead_of(v_agent)) then
    raise exception 'CRM: өөр агентад харилцагч бүртгэх эрхгүй';
  end if;
  if p_phones is not null and jsonb_typeof(p_phones) <> 'array' then
    raise exception 'CRM: дугаарын жагсаалт буруу';
  end if;
  select coalesce(array_agg(distinct n), '{}') into v_norms
    from (
      select public.crm2_normalize_phone(case when jsonb_typeof(e) = 'object' then e->>'phone' else e #>> '{}' end) n
        from jsonb_array_elements(coalesce(p_phones, '[]'::jsonb)) e
    ) q
   where n <> '';
  if cardinality(v_norms) = 0 and public.crm2_setting_bool('contact.require_phone') then
    raise exception 'CRM: дор хаяж нэг зөв утасны дугаар оруулна уу';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', c.id,
           'code', c.code,
           'display_name', case when public.crm2_can_view_contact(c.id) then c.full_name else public.crm2_mask_name(c.full_name) end,
           'can_open', public.crm2_can_view_contact(c.id),
           'responsible_agent_name', public.crm2_profile_name(c.responsible_agent_id))), '[]'::jsonb)
    into v_dups
    from public.crm2_contacts c
   where c.office_id = v_office
     and exists (select 1 from public.crm2_contact_phones ph
                  where ph.contact_id = c.id and ph.phone_norm = any (v_norms));

  if jsonb_array_length(v_dups) > 0 and not coalesce(p_allow_duplicate, false) then
    return jsonb_build_object('contact_id', null, 'code', null, 'duplicates', v_dups);
  end if;

  insert into public.crm2_contacts (office_id, full_name, note, responsible_agent_id, created_by)
  values (v_office, p_full_name, nullif(btrim(coalesce(p_note, '')), ''), v_agent, auth.uid())
  returning id, code into v_id, v_code;

  for v_item in select e from jsonb_array_elements(coalesce(p_phones, '[]'::jsonb)) e loop
    v_phone := case when jsonb_typeof(v_item) = 'object' then v_item->>'phone' else v_item #>> '{}' end;
    continue when public.crm2_normalize_phone(v_phone) = '';
    insert into public.crm2_contact_phones (contact_id, phone, label, is_primary, created_by)
    values (v_id, v_phone,
            case when jsonb_typeof(v_item) = 'object' then nullif(btrim(coalesce(v_item->>'label', '')), '') end,
            v_first, auth.uid())
    on conflict (contact_id, phone_norm) do nothing;
    v_first := false;
  end loop;

  return jsonb_build_object('contact_id', v_id, 'code', v_code, 'duplicates', v_dups);
end $$;

create function public.crm2_transfer_contact(
  p_contact uuid, p_to_agent uuid, p_reason text, p_with_deals boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_c public.crm2_contacts;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_c from public.crm2_contacts
   where id = p_contact and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: харилцагч олдсонгүй';
  end if;
  if p_to_agent is null or p_to_agent = v_c.responsible_agent_id then
    raise exception 'CRM: шинэ хариуцагчийг сонгоно уу';
  end if;
  if v_reason is null then
    raise exception 'CRM: шилжүүлэх шалтгааныг бичнэ үү';
  end if;
  perform public.crm2_assert_work_staff(p_to_agent, v_c.office_id);

  if public.crm2_transfer_approver(v_c.responsible_agent_id, p_to_agent) and public.crm2_self_ok(array[p_to_agent]) then
    v_flag := public.crm2_rpc_begin(v_reason);
    perform public.crm2_apply_contact_transfer(v_c.id, p_to_agent, coalesce(p_with_deals, false));
    update public.crm2_requests
       set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Шууд шилжүүлсэн'
     where kind = 'contact_transfer' and target_id = v_c.id and status = 'pending';
    perform public.crm2_rpc_end(v_flag);
    perform public.crm2_notify(array[v_c.responsible_agent_id, p_to_agent], 'crm2_contact_transferred',
      'Харилцагч шилжлээ', v_c.code || ': ' || v_reason, '/agent/crm/contacts/' || v_c.id::text);
    return 'applied';
  end if;

  if not (public.crm2_contact_editable(v_c.responsible_agent_id)
          or (p_to_agent = auth.uid() and public.crm2_can_work())) then
    raise exception 'CRM: энэ харилцагчийг шилжүүлэх хүсэлт гаргах эрхгүй';
  end if;
  if exists (select 1 from public.crm2_requests r
              where r.kind = 'contact_transfer' and r.target_id = v_c.id and r.status = 'pending') then
    raise exception 'CRM: энэ харилцагчид шийдвэрлэгдээгүй хүсэлт байна';
  end if;
  insert into public.crm2_requests (office_id, kind, target_id, payload, reason, requested_by)
  values (v_c.office_id, 'contact_transfer', v_c.id,
          jsonb_build_object('from_agent', v_c.responsible_agent_id, 'to_agent', p_to_agent,
                             'with_deals', coalesce(p_with_deals, false)),
          v_reason, auth.uid());
  perform public.crm2_notify(public.crm2_approver_ids(v_c.office_id, array[v_c.responsible_agent_id, p_to_agent]),
    'crm2_request', 'Харилцагч шилжүүлэх хүсэлт', v_c.code || ': ' || v_reason,
    '/agent/crm/contacts/' || v_c.id::text);
  return 'pending';
end $$;

-- ── Хэлцэл ──

-- Хөрөнгө×харилцагчийн нээлттэй хэлцлийг буцаана эсвэл шинээр нээнэ.
-- accessible = энэ хэлцэлд бүртгэх (засах) эрхтэй; visible = харах эрхтэй.
-- accessible=false: өөр агентын нээлттэй хэлцэл байна → шилжүүлэх хүсэлт гаргана.
-- p_origin_deal: цуцлагдсан хэлцлийн дараах шинэ санал (ижил харилцагч, өөр хөрөнгө).
create function public.crm2_open_deal(
  p_property uuid, p_contact uuid, p_requirement uuid default null, p_agent uuid default null,
  p_origin_deal uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_office uuid := public.crm_office_id();
  v_agent uuid := coalesce(p_agent, auth.uid());
  v_pstatus public.crm2_property_status;
  v_d record;
  v_prev uuid;
  v_id uuid;
  v_code text;
  v_flag text;
  v_visible boolean;
  v_edit boolean;
begin
  if not public.crm2_can_work() then
    raise exception 'CRM: хэлцэл нээх эрхгүй';
  end if;
  select x.status into v_pstatus from public.crm2_properties x
   where x.id = p_property and x.office_id = v_office;
  if not found or not public.crm2_can_view_property(p_property) then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  if not exists (select 1 from public.crm2_contacts c where c.id = p_contact and c.office_id = v_office) then
    raise exception 'CRM: харилцагч олдсонгүй';
  end if;
  if v_agent <> auth.uid() and not (public.crm_is_manager() or public.crm2_is_lead_of(v_agent)) then
    raise exception 'CRM: өөр агентын нэр дээр хэлцэл нээх эрхгүй';
  end if;
  if p_requirement is not null and not exists (
       select 1 from public.crm2_requirements r where r.id = p_requirement and r.contact_id = p_contact) then
    raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
  end if;
  if p_origin_deal is not null and not exists (
       select 1 from public.crm2_deals o
        where o.id = p_origin_deal and o.office_id = v_office
          and o.contact_id = p_contact and o.property_id <> p_property
          and public.crm2_can_view_deal(o.id)) then
    raise exception 'CRM: эх хэлцэл энэ харилцагчийн өөр хөрөнгийн хэлцэл биш';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('crm2_deal:' || p_property::text || ':' || p_contact::text, 0));

  select d.id, d.code, d.stage, d.agent_id, d.requirement_id, d.origin_deal_id, d.previous_deal_id into v_d
    from public.crm2_deals d
   where d.property_id = p_property and d.contact_id = p_contact and d.is_open;
  if found then
    v_visible := public.crm2_can_view_deal(v_d.id);
    v_edit := public.crm2_can_edit_deal(v_d.id);
    if v_edit and ((p_requirement is not null and v_d.requirement_id is null)
                   or (p_origin_deal is not null and v_d.origin_deal_id is null)) then
      v_flag := public.crm2_rpc_begin(null);
      update public.crm2_deals
         set requirement_id = coalesce(requirement_id, p_requirement),
             origin_deal_id = coalesce(origin_deal_id, p_origin_deal)
       where id = v_d.id;
      perform public.crm2_rpc_end(v_flag);
    end if;
    return jsonb_build_object('deal_id', v_d.id, 'code', v_d.code,
                              'stage', case when v_visible then v_d.stage end,
                              'created', false, 'accessible', v_edit, 'visible', v_visible,
                              'agent_id', v_d.agent_id, 'agent_name', public.crm2_profile_name(v_d.agent_id),
                              'previous_deal_id', case when v_visible then v_d.previous_deal_id end);
  end if;

  if not public.crm2_can_view_contact(p_contact)
     and coalesce(public.crm2_setting_text('contact.foreign_deal'), 'deny') <> 'allow' then
    raise exception 'CRM: энэ харилцагчийг өөр агент хариуцдаг — шилжүүлэх хүсэлт гаргана уу';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(public.crm2_setting('deal.open_property_statuses')) s
                  where s = v_pstatus::text) then
    raise exception 'CRM: «%» төлөвтэй хөрөнгө дээр шинэ хэлцэл нээхгүй', public.crm2_status_label(v_pstatus::text);
  end if;

  select d.id into v_prev from public.crm2_deals d
   where d.property_id = p_property and d.contact_id = p_contact
   order by d.created_at desc limit 1;

  v_flag := public.crm2_rpc_begin(null);
  insert into public.crm2_deals (office_id, property_id, contact_id, requirement_id, agent_id, created_by,
                                 previous_deal_id, origin_deal_id)
  values (v_office, p_property, p_contact, p_requirement, v_agent, auth.uid(), v_prev, p_origin_deal)
  returning id, code into v_id, v_code;
  perform public.crm2_rpc_end(v_flag);
  return jsonb_build_object('deal_id', v_id, 'code', v_code, 'stage', 'interested',
                            'created', true, 'accessible', true, 'visible', true, 'agent_id', v_agent,
                            'agent_name', public.crm2_profile_name(v_agent), 'previous_deal_id', v_prev,
                            'origin_deal_id', p_origin_deal);
end $$;

-- Хөрөнгийн картаас дуудлага бүртгэх: хэлцлийг олох/нээх + дуудлагын мөр (+ дараагийн
-- ажил crm2_tasks-д, хэлцлийн хариуцагч дээр). Дуудлага хадгалах нь «үзүүлсэн» гэсэн
-- үг биш; UI дараа нь үзүүлэлтийн маягт нээнэ. p_agent = гүйцэтгэсэн агент; шинэ хэлцэл
-- мөн түүн дээр нээгдэнэ (өөр хүнийг сонгох нь менежер/ахлагчийн эрх).
create function public.crm2_log_call(
  p_property uuid,
  p_contact uuid,
  p_occurred_at timestamptz default null,
  p_note text default null,
  p_result text default null,
  p_next_action public.crm2_task_kind default null,
  p_next_action_due timestamptz default null,
  p_next_action_note text default null,
  p_requirement uuid default null,
  p_agent uuid default null,
  p_origin_deal uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_deal jsonb;
  v_deal_id uuid;
  v_act uuid;
  v_task uuid;
  v_assignee uuid;
begin
  v_deal := public.crm2_open_deal(p_property, p_contact, p_requirement, p_agent, p_origin_deal);
  if not (v_deal->>'accessible')::boolean then
    raise exception 'CRM: энэ хөрөнгө–харилцагчийн хэлцлийг % хариуцдаг — шилжүүлэх хүсэлт гаргана уу',
      v_deal->>'agent_name';
  end if;
  v_deal_id := (v_deal->>'deal_id')::uuid;
  if not public.crm2_can_edit_deal(v_deal_id) then
    raise exception 'CRM: энэ хэлцэлд бүртгэх эрхгүй';
  end if;
  insert into public.crm2_activities (deal_id, kind, agent_id, occurred_at, note, result, created_by)
  values (v_deal_id, 'call', coalesce(p_agent, auth.uid()), coalesce(p_occurred_at, now()),
          nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_result, '')), ''), auth.uid())
  returning id into v_act;
  if p_next_action is not null then
    -- Ажил хэлцлийн хариуцагч дээр; тэр ажлаас гарсан бол бүртгэж буй хүн дээр.
    v_assignee := (v_deal->>'agent_id')::uuid;
    if not exists (select 1 from public.crm_staff s
                    where s.profile_id = v_assignee and s.office_id = public.crm_office_id() and s.is_active) then
      v_assignee := auth.uid();
    end if;
    insert into public.crm2_tasks (deal_id, kind, assignee_id, due_at, note, source_activity_id, created_by)
    values (v_deal_id, p_next_action, v_assignee, p_next_action_due,
            nullif(btrim(coalesce(p_next_action_note, '')), ''), v_act, auth.uid())
    returning id into v_task;
  end if;
  return v_deal || jsonb_build_object('activity_id', v_act, 'task_id', v_task);
end $$;

create function public.crm2_set_deal_stage(p_deal uuid, p_stage public.crm2_deal_stage, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.crm2_deals;
  v_flag text;
begin
  select * into v_d from public.crm2_deals where id = p_deal and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;
  if not public.crm2_deal_editable(v_d.agent_id) then
    raise exception 'CRM: энэ хэлцлийг өөрчлөх эрхгүй';
  end if;
  if v_d.stage in ('closed', 'cancelled') then
    raise exception 'CRM: хаагдсан/цуцлагдсан хэлцэл — шинэ хэлцэл нээнэ үү';
  end if;
  if p_stage = 'cancelled' then
    raise exception 'CRM: цуцлахдаа шалтгаантай «хэлцэл цуцлах» үйлдлийг ашиглана';
  end if;
  if p_stage = 'closed' then
    raise exception 'CRM: хэлцлийг төлбөр батлагдсаны дараа санхүүгийн эрхтэй хүн хаана';
  end if;
  if p_stage in ('documents', 'awaiting_payment') then
    raise exception 'CRM: энэ шат хэлцлийн гэрээ, нэхэмжлэлийн хэсэг нээгдсэний дараа ашиглагдана';
  end if;
  if p_stage = v_d.stage then
    return;
  end if;
  -- Дуудлага ≠ үзүүлэлт: «үзүүлсэн» шат бодит үзүүлэлтийн бүртгэлтэй л байна.
  if p_stage in ('shown', 'reshow') and not exists (
       select 1 from public.crm2_activities a
        where a.deal_id = v_d.id and a.kind = 'showing'
          and a.showing_status = 'shown' and a.voided_at is null) then
    raise exception 'CRM: бодитоор үзүүлсэн бүртгэлгүй хэлцлийг «үзүүлсэн» болгохгүй — үзүүлэлтийн үр дүнг бүртгэнэ үү';
  end if;
  if p_stage = 'showing_scheduled' and not exists (
       select 1 from public.crm2_activities a
        where a.deal_id = v_d.id and a.kind = 'showing'
          and a.showing_status = 'scheduled' and a.voided_at is null) then
    raise exception 'CRM: товлосон үзүүлэлт алга — эхлээд үзүүлэх цагаа хадгална уу';
  end if;
  v_flag := public.crm2_rpc_begin(nullif(btrim(coalesce(p_note, '')), ''));
  update public.crm2_deals set stage = p_stage where id = v_d.id;
  perform public.crm2_rpc_end(v_flag);
end $$;

-- Нэг харилцагчийн хэлцлийг цуцлах: хөрөнгийн төлөв ба бусад хэлцэлд нөлөөлөхгүй.
-- Товлосон үзүүлэлтүүд «цуцалсан» болно.
create function public.crm2_cancel_deal(
  p_deal uuid, p_reason_code text, p_reason text default null, p_requirement uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_d public.crm2_deals;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
begin
  select * into v_d from public.crm2_deals where id = p_deal and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;
  if not public.crm2_deal_editable(v_d.agent_id) then
    raise exception 'CRM: энэ хэлцлийг цуцлах эрхгүй';
  end if;
  if v_d.stage in ('closed', 'cancelled') then
    raise exception 'CRM: хэлцэл аль хэдийн хаагдсан';
  end if;
  if p_reason_code is null or not (public.crm2_setting('deal.cancel_reasons') ? p_reason_code) then
    raise exception 'CRM: цуцлах шалтгааныг жагсаалтаас сонгоно уу';
  end if;
  if p_reason_code = 'other' and v_reason is null then
    raise exception 'CRM: «Бусад» шалтгааны тайлбарыг бичнэ үү';
  end if;
  if p_requirement is not null and not exists (
       select 1 from public.crm2_requirements r where r.id = p_requirement and r.contact_id = v_d.contact_id) then
    raise exception 'CRM: сонгосон шаардлага энэ харилцагчийнх биш';
  end if;
  v_flag := public.crm2_rpc_begin(coalesce(v_reason, p_reason_code));
  update public.crm2_activities
     set showing_status = 'cancelled',
         result = coalesce(result, 'Хэлцэл цуцлагдсан')
   where deal_id = v_d.id and kind = 'showing' and showing_status = 'scheduled';
  update public.crm2_tasks
     set status = 'cancelled', note = coalesce(note, 'Хэлцэл цуцлагдсан')
   where deal_id = v_d.id and status = 'open';
  -- Цуцлах үеийн шаардлагын хувилбарыг хадгална (дараа засвал хуучин нь _versions-д).
  update public.crm2_deals
     set stage = 'cancelled', cancel_reason_code = p_reason_code, cancel_reason = v_reason,
         cancelled_at = now(), cancelled_by = auth.uid(),
         requirement_id = coalesce(p_requirement, requirement_id),
         requirement_version = (select r.version from public.crm2_requirements r
                                 where r.id = coalesce(p_requirement, v_d.requirement_id))
   where id = v_d.id;
  perform public.crm2_rpc_end(v_flag);
end $$;

create function public.crm2_transfer_deal(p_deal uuid, p_to_agent uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_d public.crm2_deals;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_flag text;
begin
  if not public.crm2_is_member() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_d from public.crm2_deals where id = p_deal and office_id = public.crm_office_id() for update;
  if not found then
    raise exception 'CRM: хэлцэл олдсонгүй';
  end if;
  if v_d.stage in ('closed', 'cancelled') then
    raise exception 'CRM: хаагдсан хэлцлийг шилжүүлэхгүй';
  end if;
  if p_to_agent is null or p_to_agent = v_d.agent_id then
    raise exception 'CRM: шинэ хариуцагчийг сонгоно уу';
  end if;
  if v_reason is null then
    raise exception 'CRM: шилжүүлэх шалтгааныг бичнэ үү';
  end if;
  perform public.crm2_assert_work_staff(p_to_agent, v_d.office_id);

  if public.crm2_transfer_approver(v_d.agent_id, p_to_agent) and public.crm2_self_ok(array[p_to_agent]) then
    v_flag := public.crm2_rpc_begin(v_reason);
    perform public.crm2_apply_deal_transfer(v_d.id, p_to_agent);
    update public.crm2_requests
       set status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_note = 'Шууд шилжүүлсэн'
     where kind = 'deal_transfer' and target_id = v_d.id and status = 'pending';
    perform public.crm2_rpc_end(v_flag);
    perform public.crm2_notify(array[v_d.agent_id, p_to_agent], 'crm2_deal_transferred',
      'Хэлцэл шилжлээ', v_d.code || ': ' || v_reason, '/agent/crm/staff/' || v_d.property_id::text);
    return 'applied';
  end if;

  -- Хүсэлт: хэлцлийн засварлагч, эсвэл хэлцлийг өөртөө авахыг хүссэн агент.
  if not (public.crm2_deal_editable(v_d.agent_id) or (p_to_agent = auth.uid() and public.crm2_can_work())) then
    raise exception 'CRM: энэ хэлцлийг шилжүүлэх хүсэлт гаргах эрхгүй';
  end if;
  if exists (select 1 from public.crm2_requests r
              where r.kind = 'deal_transfer' and r.target_id = v_d.id and r.status = 'pending') then
    raise exception 'CRM: энэ хэлцэлд шийдвэрлэгдээгүй хүсэлт байна';
  end if;
  insert into public.crm2_requests (office_id, kind, target_id, property_id, payload, reason, requested_by)
  values (v_d.office_id, 'deal_transfer', v_d.id, v_d.property_id,
          jsonb_build_object('from_agent', v_d.agent_id, 'to_agent', p_to_agent), v_reason, auth.uid());
  perform public.crm2_notify(public.crm2_approver_ids(v_d.office_id, array[v_d.agent_id, p_to_agent]),
    'crm2_request', 'Хэлцэл шилжүүлэх хүсэлт', v_d.code || ': ' || v_reason,
    '/agent/crm/staff/' || v_d.property_id::text);
  return 'pending';
end $$;

-- Хөрөнгийн картын «Хэлцлүүд» таб: харах эрхтэй хэлцлүүд, харилцагчийн нэрийг
-- эрхгүй бол далдална; дуудлага/үзүүлэлтийг үйл явдлаар тоолно.
create function public.crm2_property_deals(p_property uuid)
returns table (
  deal_id uuid, code text, stage public.crm2_deal_stage, is_open boolean,
  contact_id uuid, contact_name text, contact_visible boolean,
  agent_id uuid, agent_name text,
  calls int, showings int, shown int,
  last_activity_at timestamptz, created_at timestamptz,
  cancel_reason_code text, previous_deal_id uuid, origin_deal_id uuid
) language sql stable security definer set search_path = public as $$
  select d.id, d.code, d.stage, d.is_open,
         -- Нэр далд бол id-г ч нуух.
         case when public.crm2_can_view_contact(d.contact_id) then d.contact_id end,
         case when public.crm2_can_view_contact(d.contact_id) then c.full_name else public.crm2_mask_name(c.full_name) end,
         public.crm2_can_view_contact(d.contact_id),
         d.agent_id, public.crm2_profile_name(d.agent_id),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'call' and a.voided_at is null),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'showing' and a.voided_at is null),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'showing' and a.showing_status = 'shown' and a.voided_at is null),
         d.last_activity_at, d.created_at, d.cancel_reason_code, d.previous_deal_id, d.origin_deal_id
    from public.crm2_deals d
    join public.crm2_contacts c on c.id = d.contact_id
   where d.property_id = p_property
     and d.office_id = public.crm_office_id()
     and public.crm2_can_view_property(p_property)
     and public.crm2_can_view_deal(d.id)
   order by d.is_open desc, coalesce(d.last_activity_at, d.created_at) desc;
$$;

-- Харилцагчийн нэгдсэн картын «Хэлцлүүд»: бүх хөрөнгө дээрх харах эрхтэй хэлцэл.
-- Хөрөнгийн байршлыг харах эрхгүй бол нууна (код, төлөв харагдана).
create function public.crm2_contact_deals(p_contact uuid)
returns table (
  deal_id uuid, code text, stage public.crm2_deal_stage, is_open boolean,
  property_id uuid, property_code text, property_status public.crm2_property_status,
  property_category public.crm2_property_category, property_location text,
  agent_id uuid, agent_name text,
  calls int, showings int, shown int,
  last_activity_at timestamptz, created_at timestamptz,
  cancel_reason_code text, requirement_id uuid, requirement_version int,
  previous_deal_id uuid, origin_deal_id uuid
) language sql stable security definer set search_path = public as $$
  select d.id, d.code, d.stage, d.is_open,
         d.property_id, x.code, x.status, x.category,
         case when public.crm2_can_view_property(x.id) then x.location_text end,
         d.agent_id, public.crm2_profile_name(d.agent_id),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'call' and a.voided_at is null),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'showing' and a.voided_at is null),
         (select count(*)::int from public.crm2_activities a
           where a.deal_id = d.id and a.kind = 'showing' and a.showing_status = 'shown' and a.voided_at is null),
         d.last_activity_at, d.created_at, d.cancel_reason_code, d.requirement_id, d.requirement_version,
         d.previous_deal_id, d.origin_deal_id
    from public.crm2_deals d
    join public.crm2_properties x on x.id = d.property_id
   where d.contact_id = p_contact
     and d.office_id = public.crm_office_id()
     and public.crm2_can_view_contact(p_contact)
     and public.crm2_can_view_deal(d.id)
   order by d.is_open desc, coalesce(d.last_activity_at, d.created_at) desc;
$$;

-- Хөрөнгийн картын «Дуудлага» / «Үзүүлэлт» таб: бодит (эсвэл товлосон) цагаар,
-- харилцагчийн нэрийг эрхгүй бол далдална. p_before-оор хуудаслана.
create function public.crm2_property_activities(
  p_property uuid, p_kind public.crm2_activity_kind default null,
  p_before timestamptz default null, p_limit int default 50
) returns table (
  activity_id uuid, kind public.crm2_activity_kind, deal_id uuid, deal_code text,
  contact_id uuid, contact_name text, contact_visible boolean,
  agent_id uuid, agent_name text, occurred_at timestamptz, scheduled_at timestamptz,
  showing_status public.crm2_showing_status, result text, feedback text, note text,
  voided_at timestamptz, sort_at timestamptz
) language sql stable security definer set search_path = public as $$
  select a.id, a.kind, a.deal_id, d.code,
         case when public.crm2_can_view_contact(a.contact_id) then a.contact_id end,
         case when public.crm2_can_view_contact(a.contact_id) then c.full_name else public.crm2_mask_name(c.full_name) end,
         public.crm2_can_view_contact(a.contact_id),
         a.agent_id, public.crm2_profile_name(a.agent_id),
         a.occurred_at, a.scheduled_at, a.showing_status, a.result, a.feedback, a.note, a.voided_at,
         coalesce(a.occurred_at, a.scheduled_at, a.created_at)
    from public.crm2_activities a
    join public.crm2_deals d on d.id = a.deal_id
    join public.crm2_contacts c on c.id = a.contact_id
   where a.property_id = p_property
     and (p_kind is null or a.kind = p_kind)
     and a.office_id = public.crm_office_id()
     and public.crm2_can_view_property(p_property)
     and (auth.uid() in (a.agent_id, a.created_by) or public.crm2_can_view_deal(a.deal_id))
     and coalesce(a.occurred_at, a.scheduled_at, a.created_at) < coalesce(p_before, 'infinity'::timestamptz)
   order by coalesce(a.occurred_at, a.scheduled_at, a.created_at) desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Үзүүлэх заавар (дунд түвшин: хэлцэлтэй/үзүүлэх агент ч харна).
create function public.crm2_property_showing_info(p_property uuid)
returns text language sql stable security definer set search_path = public as $$
  select pp.showing_instructions
    from public.crm2_property_private pp
   where pp.property_id = p_property
     and pp.office_id = public.crm_office_id()
     and public.crm2_is_member()
     and public.crm2_can_view_showing_info(p_property);
$$;

-- ── Өдөр тутмын ажил (pg_cron, 08:05 Улаанбаатар) ──
-- 1) хугацаа нь өнгөрсөн гэрээ → expired; 2) эхлэх өдөр нь ирсэн батлагдсан гэрээтэй
-- хөрөнгийг идэвхжүүлнэ; 3) хүчинтэй гэрээгүй болсон хөрөнгийг тохиргооны дагуу
-- «гэрээ дууссан» болгоно; 4) дуусахаас N хоногийн өмнө хариуцагч ба ахлагчид сануулна.
create function public.crm2_daily_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.crm2_today();
  v_flag text;
  v_r record;
  v_expired int := 0;
  v_activated int := 0;
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

  for v_r in
    select b.id, b.property_id from public.crm2_brokerage_contracts b
     where b.status = 'active' and b.activate_on_start and b.start_date <= v_today and b.end_date >= v_today
  loop
    begin
      if (select x.status from public.crm2_properties x where x.id = v_r.property_id) in ('draft', 'contract_ended')
         and cardinality(public.crm2_property_missing(v_r.property_id)) = 0 then
        update public.crm2_properties set status = 'active', status_reason = null where id = v_r.property_id;
        v_activated := v_activated + 1;
      end if;
      update public.crm2_brokerage_contracts set activate_on_start = false where id = v_r.id;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'crm2_daily: activate % failed: %', v_r.id, sqlerrm;
    end;
  end loop;

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

  perform public.crm2_rpc_end(v_flag);
  return jsonb_build_object('expired', v_expired, 'activated', v_activated, 'ended', v_ended,
                            'reminded', v_reminded, 'failed', v_failed);
end $$;

-- ── 11. Storage ─────────────────────────────────────────────────────────────

-- HEIC/HEIF-ийг Chrome/Edge харуулдаггүй тул хүлээж авахгүй — клиент JPEG болгож
-- хуулна. iPhone-ы .mov (HEVC) тоглохгүй бол UI татаж авах холбоос үзүүлнэ.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('crm2-media', 'crm2-media', false, 52428800,
   array['image/jpeg', 'image/png', 'image/webp',
         'video/mp4', 'video/quicktime', 'video/webm']),
  ('crm2-docs', 'crm2-docs', false, 20971520,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Медиа: хөрөнгийг харах эрхтэн уншина (signed URL), засварлагч нэмнэ/устгана.
-- Дарж бичих (update) policy байхгүй — файл бүр шинэ зам.
create policy crm2_media_select on storage.objects for select to authenticated
  using (bucket_id = 'crm2-media' and public.crm2_storage_media_access(name, false));
create policy crm2_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm2-media' and public.crm2_storage_media_access(name, true));
create policy crm2_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm2-media' and public.crm2_storage_media_access(name, true));

-- Гэрээний файл: хувийн талбар харах эрхтэн уншина.
create policy crm2_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'crm2-docs' and public.crm2_storage_doc_access(name, 'read'));
create policy crm2_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm2-docs' and public.crm2_storage_doc_access(name, 'write'));
create policy crm2_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm2-docs' and public.crm2_storage_doc_access(name, 'delete'));

-- ── 12. Эрх (grant/revoke) ──────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'crm2_settings', 'crm2_counters', 'crm2_projects', 'crm2_contacts', 'crm2_contact_phones',
    'crm2_properties', 'crm2_property_private', 'crm2_property_media', 'crm2_brokerage_contracts',
    'crm2_brokerage_files', 'crm2_requirements', 'crm2_requirement_versions', 'crm2_deals',
    'crm2_activities', 'crm2_tasks', 'crm2_history', 'crm2_requests', 'crm2_reminder_log'
  ] loop
    execute format('revoke all on table public.%I from anon, public, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

grant select on table public.crm2_settings, public.crm2_requirement_versions, public.crm2_history, public.crm2_requests
  to authenticated;
-- crm2_contacts: insert эрхгүй — зөвхөн crm2_create_contact (дугаар, давхардлын шалгалт).
grant select, update on table public.crm2_deals, public.crm2_property_private, public.crm2_contacts to authenticated;
grant select, insert, update on table public.crm2_projects, public.crm2_properties,
  public.crm2_brokerage_contracts, public.crm2_requirements, public.crm2_activities, public.crm2_tasks
  to authenticated;
grant select, insert, update, delete on table public.crm2_contact_phones, public.crm2_property_media to authenticated;
grant select, insert, delete on table public.crm2_brokerage_files to authenticated;
-- crm2_counters, crm2_reminder_log: authenticated эрхгүй.

-- Функц: бүгдийг anon/public-аас хурааж, UI/RLS-д хэрэгтэйг л authenticated-д нээнэ.
do $$
declare
  f record;
  v_public text[] := array[
    -- RLS/storage policy-д ашиглагдах helper
    'crm2_today', 'crm2_uuid', 'crm2_normalize_phone', 'crm2_mask_name', 'crm2_like_escape',
    'crm2_status_label', 'crm2_missing_text', 'crm2_property_transition_ok',
    'crm2_setting_default', 'crm2_setting_keys', 'crm2_setting', 'crm2_setting_text', 'crm2_setting_bool',
    'crm2_setting_int', 'crm2_setting_roles', 'crm2_has_setting_role',
    -- crm2_profile_name, crm2_property_has_valid_contract: оффисын хүрээгүй тул нээхгүй
    -- (зөвхөн definer функц дотор дуудагдана).
    'crm2_is_office_admin', 'crm2_is_member', 'crm2_can_work', 'crm2_is_team_lead',
    'crm2_is_lead_of_any', 'crm2_is_lead_of',
    'crm2_in_my_team_any', 'crm2_self_ok', 'crm2_can_manage_settings', 'crm2_has_finance',
    'crm2_sees_all_properties', 'crm2_property_visible',
    'crm2_can_view_property', 'crm2_can_view_property_private', 'crm2_property_editable', 'crm2_can_edit_property',
    'crm2_property_approver', 'crm2_brokerage_approver', 'crm2_can_view_brokerage', 'crm2_can_edit_brokerage_draft',
    'crm2_can_attach_brokerage', 'crm2_can_detach_brokerage', 'crm2_contact_visible', 'crm2_can_view_contact',
    'crm2_contact_editable', 'crm2_can_edit_contact', 'crm2_can_edit_requirements', 'crm2_deal_visible',
    'crm2_can_view_deal', 'crm2_deal_editable', 'crm2_can_edit_deal', 'crm2_activity_editable',
    'crm2_transfer_approver', 'crm2_can_view_showing_info', 'crm2_task_visible', 'crm2_can_view_task',
    'crm2_can_view_history', 'crm2_can_decide_request',
    'crm2_storage_media_access', 'crm2_storage_doc_access',
    -- UI RPC
    'crm2_my_context', 'crm2_staff_directory', 'crm2_settings_effective', 'crm2_set_setting', 'crm2_reset_setting',
    'crm2_suggest_projects', 'crm2_ensure_project', 'crm2_suggest_locations', 'crm2_property_activation_check',
    'crm2_property_set_status', 'crm2_property_mark_verified', 'crm2_decide_request', 'crm2_cancel_request',
    'crm2_brokerage_submit', 'crm2_brokerage_withdraw', 'crm2_brokerage_approve', 'crm2_brokerage_reject',
    'crm2_brokerage_terminate', 'crm2_brokerage_discard', 'crm2_brokerage_renew',
    'crm2_find_contacts_by_phone', 'crm2_create_contact', 'crm2_transfer_contact',
    'crm2_open_deal', 'crm2_log_call', 'crm2_set_deal_stage', 'crm2_cancel_deal', 'crm2_transfer_deal',
    'crm2_property_deals', 'crm2_contact_deals', 'crm2_property_activities', 'crm2_property_showing_info'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname like 'crm2\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname = any (v_public) then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ── 13. Өдөр тутмын хуваарь (00:05 UTC = 08:05 Улаанбаатар) ─────────────────

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'crm2-daily' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('crm2-daily', '5 0 * * *', $cmd$select public.crm2_daily_maintenance()$cmd$);
end $$;

-- ГАЖИЛТ: crm2_* хүснэгтийг supabase_realtime-д нэмэхгүй (хуучин CRM-тэй ижил).

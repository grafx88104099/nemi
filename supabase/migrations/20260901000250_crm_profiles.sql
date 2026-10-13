-- ============================================================
-- PMC CRM — Профайлууд (M2): crm_need_profiles, crm_owner_profiles.
-- DESIGN.md §2.7, F-150–159.
--
-- ⚠️ Дугаарлалтын тайлбар (U4, crm-pipeline-activities): дизайны §10-д энэ
-- хоёр хүснэгт 000400 (U4)-ийн эхэнд байхаар заагдсан ч 000300-ийн
-- crm_matches хүснэгт crm_need_profiles(id)-г FK-ээр заадаг тул миграцийн
-- дарааллаар 000300-аас ӨМНӨ үүсэх ЁСТОЙ — тиймээс 000250 дугаартай тусдаа
-- файлд гаргав. crm_owner_profiles.property_id-ийн FK нь crm_properties
-- (000300)-ыг заадаг тул 000400-д ALTER-ээр нэмэгдэнэ.
-- ============================================================

-- ── crm_need_profiles (F-150–152: худалдан авагч/түрээслэгч/хөрөнгө оруулагч/олон улс) ──

create table public.crm_need_profiles (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  profile_type text not null,                -- buyer|tenant|investor|intl_buyer
  goal_id uuid references public.crm_lookups(id),
  locations jsonb not null,                  -- сонирхсон бүсүүд
  property_types text[] not null,
  budget_min numeric(14,2),
  budget_target numeric(14,2),
  budget_max numeric(14,2) not null,
  financing text not null,                   -- cash|loan|mixed|not_ready
  rooms_min int,
  area_min numeric(10,2),
  conditions text[],
  timeline text not null,                    -- '0_30'|'1_3m'|'3_12m'|'12m_plus'
  move_in_date date,                         -- түрээслэгчид заавал (app validation)
  must_haves jsonb not null default '[]',    -- 3–5 заавал шаардлага
  nice_to_haves jsonb not null default '[]',
  deal_breakers jsonb not null default '[]', -- F-158 таслах шүүлтүүр
  decision_maker text,
  blocker text,
  status crm_profile_status not null default 'active',
  paused_until date,
  lost_reason_id uuid references public.crm_lookups(id),
  fulfilled_txn_id uuid,                     -- F-156 (crm_transactions 000500-д — FK-гүй, guard trigger-тэй)
  completeness_pct numeric(5,2),             -- F-159
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_need_budget check (budget_min is null or budget_min <= budget_max),
  constraint crm_need_profile_type check (profile_type in ('buyer', 'tenant', 'investor', 'intl_buyer')),
  constraint crm_need_financing check (financing in ('cash', 'loan', 'mixed', 'not_ready')),
  constraint crm_need_timeline check (timeline in ('0_30', '1_3m', '3_12m', '12m_plus'))
);
create index crm_need_contact_idx on public.crm_need_profiles (contact_id, status);
create index crm_need_office_idx  on public.crm_need_profiles (office_id, status);

-- ── crm_owner_profiles (F-153) ──

create table public.crm_owner_profiles (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete restrict,
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  property_id uuid,                          -- FK → crm_properties 000400-д ALTER-ээр (000300-аас хойш)
  goal text not null,                        -- sell|rent_out|manage
  asking_price numeric(14,2) not null,
  terms text,
  urgency text,
  urgency_note text,
  decision_authority text not null,          -- sole|co_owner|poa
  listing_state text not null default 'none',-- none|negotiating|agreed
  status crm_profile_status not null default 'active',
  paused_until date,
  lost_reason_id uuid references public.crm_lookups(id),
  fulfilled_txn_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_owner_goal check (goal in ('sell', 'rent_out', 'manage')),
  constraint crm_owner_decision check (decision_authority in ('sole', 'co_owner', 'poa')),
  constraint crm_owner_listing_state check (listing_state in ('none', 'negotiating', 'agreed'))
);
create index crm_owner_contact_idx  on public.crm_owner_profiles (contact_id, status);
create index crm_owner_property_idx on public.crm_owner_profiles (property_id);

-- ── Trigger функц: F-156 — «Хангагдсан» төлөвт хэлцлийн холбоос заавал ──

create or replace function public.crm_profile_fulfilled_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'fulfilled' and new.fulfilled_txn_id is null then
    raise exception 'CRM: «Хангагдсан» төлөвт хэлцлийн холбоос заавал (F-156)';
  end if;
  return new;
end $$;

-- ── Trigger залгалтууд ──

create trigger crm_need_profiles_updated
  before update on public.crm_need_profiles
  for each row execute function public.crm_set_updated_at();
create trigger crm_need_profiles_immutable
  before update on public.crm_need_profiles
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'created_by', 'created_at');
create trigger crm_need_profiles_fulfilled
  before insert or update on public.crm_need_profiles
  for each row execute function public.crm_profile_fulfilled_guard();

create trigger crm_owner_profiles_updated
  before update on public.crm_owner_profiles
  for each row execute function public.crm_set_updated_at();
create trigger crm_owner_profiles_immutable
  before update on public.crm_owner_profiles
  for each row execute function public.crm_protect_immutable('office_id', 'contact_id', 'created_by', 'created_at');
create trigger crm_owner_profiles_fulfilled
  before insert or update on public.crm_owner_profiles
  for each row execute function public.crm_profile_fulfilled_guard();

-- ── RLS (§3.2: contact-ийн эрх дагана; insert эзэмшигч; update эзэмшигч/manager) ──

alter table public.crm_need_profiles  enable row level security;
alter table public.crm_owner_profiles enable row level security;

create policy crm_need_profiles_select on public.crm_need_profiles for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(contact_id));
create policy crm_need_profiles_insert on public.crm_need_profiles for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_contact(contact_id)
  );
create policy crm_need_profiles_update on public.crm_need_profiles for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id))
  with check (office_id = (select public.crm_office_id()));

create policy crm_owner_profiles_select on public.crm_owner_profiles for select
  using (office_id = (select public.crm_office_id()) and public.crm_can_view_contact(contact_id));
create policy crm_owner_profiles_insert on public.crm_owner_profiles for insert
  with check (
    office_id = (select public.crm_office_id())
    and created_by = auth.uid()
    and (select public.crm_my_staff_id()) is not null
    and public.crm_can_edit_contact(contact_id)
  );
create policy crm_owner_profiles_update on public.crm_owner_profiles for update
  using (office_id = (select public.crm_office_id()) and public.crm_can_edit_contact(contact_id))
  with check (office_id = (select public.crm_office_id()));

-- delete policy ОГТ ҮГҮЙ (архив = status).
-- ГАЖИЛТ: supabase_realtime publication-д НЭМЭХГҮЙ (foundation-тай ижил).

-- ============================================================
-- Нэми — үндсэн schema (Phase 1)
-- Эх сурвалж: legacy/assets/js/data.js
-- ============================================================

-- ---------- Өргөтгөлүүд ----------
create extension if not exists postgis;      -- гео хайлт (lat/lng)
create extension if not exists pg_trgm;      -- текст хайлт (кирилл)
create extension if not exists unaccent;     -- хайлтын normalize

-- ---------- Enum төрлүүд ----------
create type user_role        as enum ('buyer', 'agent', 'office_admin', 'admin');
create type listing_status   as enum ('active', 'draft', 'review', 'sold');
create type lead_stage        as enum ('new', 'contacted', 'viewing', 'offer', 'closed', 'lost');
create type lead_source       as enum ('website', 'facebook', 'instagram', 'google', 'referral', 'other');
create type viewing_status    as enum ('pending', 'confirmed', 'done', 'cancelled');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- ---------- updated_at туслах ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ============================================================
-- profiles — auth.users-ийн өргөтгөл
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  phone       text,
  email       text,
  role        user_role not null default 'buyer',
  office_id   uuid,                       -- agent/office_admin-д тохиолдоно (доор FK нэмнэ)
  created_at  timestamptz not null default now()
);

-- Шинэ хэрэглэгч бүртгэгдэхэд profiles мөр автоматаар үүсгэх
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- offices — үл хөдлөхийн оффис
-- ============================================================
create table public.offices (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  name          text not null,
  logo          text,                     -- товчлол "GH"
  color         text,
  verified      boolean not null default false,
  agents_count  int not null default 0,
  listings_count int not null default 0,
  created_at    timestamptz not null default now()
);

-- profiles.office_id FK (offices үүссэний дараа)
alter table public.profiles
  add constraint profiles_office_fk foreign key (office_id)
  references public.offices(id) on delete set null;

-- ============================================================
-- agents — агент (profile + office)
-- ============================================================
create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  profile_id    uuid references public.profiles(id) on delete set null,
  office_id     uuid references public.offices(id) on delete set null,
  display_name  text not null,
  phone         text,
  avatar        text,                     -- товчлол "AB"
  rating        numeric(2,1),
  reviews_count int not null default 0,
  years         int,
  sold          int not null default 0,
  listings_count int not null default 0,
  verified      boolean not null default false,
  premier       boolean not null default false,
  response_time text,
  languages     text[] not null default '{}',
  areas         text[] not null default '{}',
  specialty     text,
  bio           text,
  sub_ratings   jsonb,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- listings — зар
-- ============================================================
create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  agent_id      uuid references public.agents(id) on delete set null,
  title         text not null,
  district      text,
  type          text,                     -- "Орон сууц", "Хаус" ...
  rooms         int not null default 0,
  area          numeric,                  -- м²
  floor         text,                     -- "12/18" эсвэл "-"
  price         bigint not null,
  price_per_m2  bigint,
  year          int,
  parking       int not null default 0,
  status        listing_status not null default 'active',
  verified      boolean not null default false,
  hot           boolean not null default false,
  featured      boolean not null default false,
  shared        boolean not null default false,
  description   text,
  amenities     text[] not null default '{}',
  ai_score      int,                      -- хамгийн сүүлийн оноо (display кэш; эх нь ai_valuations)
  ai_note       text,
  location      geography(Point, 4326),   -- lng/lat
  photo         text,                     -- үндсэн зураг (кэш)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create index listings_location_gix on public.listings using gist (location);
create index listings_title_trgm   on public.listings using gin (title gin_trgm_ops);
create index listings_status_idx   on public.listings (status);
create index listings_district_idx on public.listings (district);
create index listings_agent_idx    on public.listings (agent_id);

-- ============================================================
-- listing_photos — зарын зургууд (Storage)
-- ============================================================
create table public.listing_photos (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  url         text not null,
  sort_order  int not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id);

-- ============================================================
-- ai_valuations — AI үнэлгээний түүх/кэш
-- ============================================================
create table public.ai_valuations (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  score       int,
  note        text,
  model       text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index ai_valuations_listing_idx on public.ai_valuations (listing_id);

-- ============================================================
-- favorites / saved_searches / recently_viewed — хэрэглэгчийн
-- ============================================================
create table public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text,
  filters       jsonb not null,
  alert_enabled boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.recently_viewed (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ============================================================
-- leads — агентын CRM
-- ============================================================
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  agent_id      uuid not null references public.agents(id) on delete cascade,
  listing_id    uuid references public.listings(id) on delete set null,
  name          text not null,
  phone         text,
  source        lead_source not null default 'website',
  stage         lead_stage not null default 'new',
  score         int,
  note          text,
  last_touch    text,
  created_at    timestamptz not null default now()
);
create index leads_agent_idx on public.leads (agent_id);

-- ============================================================
-- conversations / messages — чат (Realtime)
-- ============================================================
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  listing_id      uuid references public.listings(id) on delete set null,
  buyer_id        uuid references public.profiles(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null,
  sender_role     text,                   -- 'me' | 'them' (mock); prod-д sender_id-аар тодорхойлно
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ============================================================
-- viewings — үзлэгийн цаг
-- ============================================================
create table public.viewings (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  agent_id      uuid references public.agents(id) on delete set null,
  buyer_id      uuid references public.profiles(id) on delete set null,
  scheduled_at  timestamptz,
  status        viewing_status not null default 'pending',
  created_at    timestamptz not null default now()
);

-- ============================================================
-- reviews — агентын сэтгэгдэл
-- ============================================================
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  author_name   text,                     -- mock pool-д
  listing_id    uuid references public.listings(id) on delete set null,
  area          text,
  deal_type     text,                     -- "Худалдан авсан" | "Зарсан"
  rating        int check (rating between 1 and 5),
  sub_ratings   jsonb,
  text          text,
  verified      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index reviews_agent_idx on public.reviews (agent_id);

-- ============================================================
-- subscriptions / payments — Premier төлбөр (QPay)
-- ============================================================
create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.agents(id) on delete cascade,
  plan                text not null,
  status              subscription_status not null default 'trialing',
  current_period_end  timestamptz,
  qpay_invoice_id     text,
  created_at          timestamptz not null default now()
);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  agent_id        uuid references public.agents(id) on delete set null,
  amount          bigint not null,
  currency        text not null default 'MNT',
  qpay_payment_id text,
  status          text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- notifications — мэдэгдэл
-- ============================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text,
  title       text,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at);

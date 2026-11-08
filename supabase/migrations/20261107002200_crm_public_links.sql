-- U8 crm-mobile-growth (8в: R9, R10, R11) — харилцагчид гарах токентой холбоос.
--   • crm_public_links      — сонголтын жагсаалт (collection, R11) ба өмчлөгчийн явцын тайлан (owner_report, R10).
--   • crm_public_link_items — жагсаалтын үл хөдлөх, харилцагчийн хариу (crm_matches.response-тэй синк).
--   • crm_open_houses       — нээлттэй үзлэг / үл хөдлөхийн байнгын QR (R9).
--   • crm_open_house_visits — QR-аар бүртгүүлсэн зочин (хувийн мэдээлэл энд хадгалахгүй — сэжимд).
-- Токен, кодыг зөвхөн SHA-256 hash-аар хадгална. Нийтийн хуудас нь service role-оор hash-аар
-- хайж, хугацаа/цуцлалтыг шалгана. Ажилтан зөвхөн өөрийн (эсвэл багийн/удирдлагын) холбоосыг харна.
-- Тохиргоо: public_links (хугацаа, жагсаалтын хэмжээ, давтамжийн хязгаар).

create table if not exists public.crm_public_links (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  kind text not null,
  token_hash text not null,
  contact_id uuid references public.crm_contacts(id),
  lead_id uuid references public.crm_leads(id) on delete set null,
  property_id uuid references public.crm_properties(id),
  title text,
  note text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  open_count int not null default 0,
  last_opened_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_public_links_kind check (kind in ('collection', 'owner_report')),
  constraint crm_public_links_hash unique (token_hash),
  constraint crm_public_links_hash_fmt check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint crm_public_links_target check (
    (kind = 'collection' and contact_id is not null)
    or (kind = 'owner_report' and property_id is not null)),
  constraint crm_public_links_expiry check (expires_at > created_at and expires_at <= created_at + interval '120 days')
);

create index if not exists crm_public_links_creator_idx on public.crm_public_links (created_by, created_at desc);
create index if not exists crm_public_links_contact_idx on public.crm_public_links (contact_id);
create index if not exists crm_public_links_property_idx on public.crm_public_links (property_id);

alter table public.crm_public_links enable row level security;

drop policy if exists crm_public_links_select on public.crm_public_links;
create policy crm_public_links_select on public.crm_public_links for select
  using (office_id = (select public.crm_office_id())
         and (created_by = auth.uid() or public.crm_is_team_of(created_by) or (select public.crm_is_manager())));

-- Үүсгэх: зөвхөн өөрийн нэрээр, харах эрхтэй харилцагч / засах эрхтэй үл хөдлөх дээр.
drop policy if exists crm_public_links_insert on public.crm_public_links;
create policy crm_public_links_insert on public.crm_public_links for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and revoked_at is null
              and (
                (kind = 'collection' and public.crm_can_view_contact(contact_id))
                or (kind = 'owner_report' and public.crm_can_edit_property(property_id))));

-- Шинэчлэл: зөвхөн цуцлах ба тэмдэглэл (бусад баганыг trigger хамгаална).
drop policy if exists crm_public_links_update on public.crm_public_links;
create policy crm_public_links_update on public.crm_public_links for update
  using (office_id = (select public.crm_office_id())
         and (created_by = auth.uid() or (select public.crm_is_manager())))
  with check (office_id = (select public.crm_office_id()));

create or replace function public.crm_public_links_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('role', true) = 'service_role' or auth.uid() is null then
    return new; -- нийтийн хуудасны тоолуур (service role)
  end if;
  if new.token_hash <> old.token_hash or new.kind <> old.kind
     or new.contact_id is distinct from old.contact_id or new.property_id is distinct from old.property_id
     or new.created_by <> old.created_by or new.office_id <> old.office_id
     or new.expires_at > old.expires_at or new.open_count <> old.open_count then
    raise exception 'CRM: холбоосын үндсэн мэдээллийг засахгүй — шинээр үүсгэнэ үү.';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'CRM: цуцалсан холбоосыг сэргээхгүй.';
  end if;
  if new.revoked_at is not null and old.revoked_at is null then
    new.revoked_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists crm_public_links_guard on public.crm_public_links;
create trigger crm_public_links_guard before update on public.crm_public_links
  for each row execute function public.crm_public_links_guard();

create table if not exists public.crm_public_link_items (
  link_id uuid not null references public.crm_public_links(id) on delete cascade,
  property_id uuid not null references public.crm_properties(id),
  match_id uuid references public.crm_matches(id) on delete set null,
  sort_order int not null default 0,
  response public.crm_match_response,
  comment text,
  responded_at timestamptz,
  primary key (link_id, property_id),
  constraint crm_public_link_items_comment check (comment is null or length(comment) <= 500)
);

alter table public.crm_public_link_items enable row level security;

drop policy if exists crm_public_link_items_select on public.crm_public_link_items;
create policy crm_public_link_items_select on public.crm_public_link_items for select
  using (exists (select 1 from public.crm_public_links l where l.id = crm_public_link_items.link_id));

drop policy if exists crm_public_link_items_insert on public.crm_public_link_items;
create policy crm_public_link_items_insert on public.crm_public_link_items for insert
  with check (response is null and exists (
    select 1 from public.crm_public_links l
     where l.id = crm_public_link_items.link_id and l.created_by = auth.uid() and l.kind = 'collection'));

create table if not exists public.crm_open_houses (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  property_id uuid not null references public.crm_properties(id),
  kind text not null default 'open_house',
  code_hash text not null,
  title text,
  host_id uuid not null references public.profiles(id),
  owner_agent_id uuid not null references public.profiles(id),
  starts_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz,
  visit_count int not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint crm_open_houses_kind check (kind in ('open_house', 'permanent')),
  constraint crm_open_houses_hash unique (code_hash),
  constraint crm_open_houses_hash_fmt check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint crm_open_houses_window check (
    (kind = 'permanent' and starts_at is null and ends_at is null)
    or (kind = 'open_house' and starts_at is not null and ends_at > starts_at
        and ends_at <= starts_at + interval '3 days'))
);

create index if not exists crm_open_houses_property_idx on public.crm_open_houses (property_id);

alter table public.crm_open_houses enable row level security;

drop policy if exists crm_open_houses_select on public.crm_open_houses;
create policy crm_open_houses_select on public.crm_open_houses for select
  using (office_id = (select public.crm_office_id())
         and (created_by = auth.uid() or host_id = auth.uid() or owner_agent_id = auth.uid()
              or public.crm_is_team_of(created_by) or (select public.crm_is_manager())));

drop policy if exists crm_open_houses_insert on public.crm_open_houses;
create policy crm_open_houses_insert on public.crm_open_houses for insert
  with check (office_id = (select public.crm_office_id())
              and created_by = auth.uid()
              and revoked_at is null
              and public.crm_can_edit_property(property_id));

drop policy if exists crm_open_houses_update on public.crm_open_houses;
create policy crm_open_houses_update on public.crm_open_houses for update
  using (office_id = (select public.crm_office_id())
         and (created_by = auth.uid() or (select public.crm_is_manager())))
  with check (office_id = (select public.crm_office_id()));

create or replace function public.crm_open_houses_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('role', true) = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if new.code_hash <> old.code_hash or new.property_id <> old.property_id or new.kind <> old.kind
     or new.owner_agent_id <> old.owner_agent_id or new.created_by <> old.created_by
     or new.visit_count <> old.visit_count then
    raise exception 'CRM: QR бүртгэлийн үндсэн мэдээллийг засахгүй — шинээр үүсгэнэ үү.';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'CRM: цуцалсан QR-г сэргээхгүй.';
  end if;
  return new;
end $$;

drop trigger if exists crm_open_houses_guard on public.crm_open_houses;
create trigger crm_open_houses_guard before update on public.crm_open_houses
  for each row execute function public.crm_open_houses_guard();

create table if not exists public.crm_open_house_visits (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null,
  open_house_id uuid not null references public.crm_open_houses(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  existing_lead boolean not null default false,
  client_hash text,
  created_at timestamptz not null default now()
);

create index if not exists crm_open_house_visits_oh_idx on public.crm_open_house_visits (open_house_id, created_at desc);
create index if not exists crm_open_house_visits_client_idx on public.crm_open_house_visits (client_hash, created_at desc);

alter table public.crm_open_house_visits enable row level security;

-- Зочны бүртгэлийг зөвхөн service role бичнэ; ажилтан өөрийн QR-ын бүртгэлийг уншина.
drop policy if exists crm_open_house_visits_select on public.crm_open_house_visits;
create policy crm_open_house_visits_select on public.crm_open_house_visits for select
  using (exists (select 1 from public.crm_open_houses h where h.id = crm_open_house_visits.open_house_id));

revoke insert, update, delete on public.crm_open_house_visits from authenticated, anon;
revoke all on public.crm_public_links, public.crm_public_link_items, public.crm_open_houses from anon;

-- Тохиргоо
do $$
declare
  o record;
  v_creator uuid;
begin
  for o in select distinct office_id from public.crm_settings loop
    if exists (select 1 from public.crm_settings
                where office_id = o.office_id and key = 'public_links' and valid_to is null) then
      continue;
    end if;
    select created_by into v_creator from public.crm_settings
     where office_id = o.office_id order by created_at limit 1;
    insert into public.crm_settings (office_id, key, value, created_by, note)
    values (o.office_id, 'public_links',
      '{"collection_days":7,"owner_report_days":30,"collection_min_items":3,"collection_max_items":7,
        "open_house_grace_hours":4,"open_house_early_hours":1,"visits_per_client_hour":5,
        "visits_per_event_hour":120}'::jsonb,
      v_creator, 'PRO-001 v2.1 — харилцагчид гарах холбоосын анхны утга');
  end loop;
end $$;

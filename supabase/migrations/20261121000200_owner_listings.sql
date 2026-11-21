-- Эзэн (энгийн хэрэглэгч) өөрөө зар нийтлэх + оффист зуучлуулах хүсэлт.
--
-- Өмнө нь зөвхөн агент зар оруулдаг байсан (listings нь бүхэлдээ agent_id-аар
-- RLS хийгддэг). Одоо:
--   1) Эзэний зар: agent_id NULL, owner_id = хэрэглэгч. ХЯНАЛТТАЙ — эзэн
--      «Идэвхтэй» болгож чадахгүй, хянуулахаар («review») илгээнэ; админ
--      баталсны дараа нийтэд гарна. Нийтлэгдсэн зарын агуулгыг засвал дахин
--      хяналтад орно. Баталгаа/онцлох/AI оноог эзэн өөрчлөхгүй.
--   2) Зуучлалын хүсэлт (owner_requests): эзэн хөрөнгөө оффист зуучлуулахаар
--      үлдээнэ — оффисын админ, менежерт мэдэгдэл очно.
--
-- Агентын зарын зан төлөв ӨӨРЧЛӨГДӨХГҮЙ (бүх шинэ дүрэм agent_id IS NULL үед л).

-- ── 1. Багана ─────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists review_note text;

alter table public.listings drop constraint if exists listings_poster_chk;
alter table public.listings
  add constraint listings_poster_chk check (agent_id is not null or owner_id is not null);
alter table public.listings drop constraint if exists listings_owner_text_chk;
alter table public.listings
  add constraint listings_owner_text_chk check (
    (owner_name is null or char_length(owner_name) <= 120)
    and (owner_phone is null or char_length(owner_phone) between 6 and 30)
    and (review_note is null or char_length(review_note) <= 500)
  );

create index if not exists listings_owner_idx on public.listings (owner_id) where owner_id is not null;

-- ── 2. Эрхийн туслахууд ───────────────────────────────────────────────────
create or replace function public.can_manage_listing(l uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings ls
     where ls.id = l
       and (public.can_manage_agent(ls.agent_id)
            or (ls.agent_id is null and ls.owner_id = auth.uid()))
  );
$$;

create or replace function public.listing_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings l
     where l.id = p_id
       and ((l.status = 'active' and not public.agent_office_suspended(l.agent_id))
            or public.can_manage_agent(l.agent_id)
            or (l.agent_id is null and l.owner_id = auth.uid())
            or public.listing_shared_with_me(l.id))
  );
$$;

-- ── 3. Бодлого ────────────────────────────────────────────────────────────
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select using (
  ((status = 'active') and not public.agent_office_suspended(agent_id))
  or public.can_manage_agent(agent_id)
  or (agent_id is null and owner_id = auth.uid())
  or public.listing_shared_with_me(id)
);

drop policy if exists listings_owner_insert on public.listings;
create policy listings_owner_insert on public.listings for insert to authenticated
  with check (agent_id is null and owner_id = auth.uid());

drop policy if exists listings_owner_update on public.listings;
create policy listings_owner_update on public.listings for update to authenticated
  using (agent_id is null and owner_id = auth.uid())
  with check (agent_id is null and owner_id = auth.uid());

drop policy if exists listings_owner_delete on public.listings;
create policy listings_owner_delete on public.listings for delete to authenticated
  using (agent_id is null and owner_id = auth.uid());

-- ── 4. Эзэний засварын хамгаалалт ─────────────────────────────────────────
create or replace function public.listings_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_content_changed boolean;
begin
  -- Агентын зар, системийн (service role) болон админы бичилтэд хамаарахгүй.
  if v_me is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.agent_id is not null then
      return new;
    end if;
    -- Агент «эзэн» нэрээр оффисоосоо гадуур зар оруулахгүй — агентын самбараар.
    if exists (select 1 from public.agents a where a.profile_id = v_me) then
      raise exception 'Агент зараа агентын самбараас оруулна';
    end if;
    new.owner_id := v_me;
    new.status := case when new.status = 'draft' then 'draft'::public.listing_status
                       else 'review'::public.listing_status end;
    new.verified := false;
    new.featured := false;
    new.hot := false;
    new.ai_score := null;
    new.ai_note := null;
    new.review_note := null;
    return new;
  end if;

  if old.agent_id is not null then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.agent_id is not null then
    raise exception 'Зарын эзнийг өөрчлөх боломжгүй';
  end if;
  -- Эзэн эдгээрийг өөрчлөхгүй.
  new.verified := old.verified;
  new.featured := old.featured;
  new.hot := old.hot;
  new.ai_score := old.ai_score;
  new.ai_note := old.ai_note;
  new.review_note := old.review_note;

  v_content_changed := (
    to_jsonb(new) - array['status', 'updated_at', 'verified', 'featured', 'hot', 'ai_score', 'ai_note', 'review_note']
  ) is distinct from (
    to_jsonb(old) - array['status', 'updated_at', 'verified', 'featured', 'hot', 'ai_score', 'ai_note', 'review_note']
  );

  -- Эзэн өөрөө нийтэлж чадахгүй: «Идэвхтэй» хүсвэл хяналтад илгээнэ.
  if new.status = 'active' and (old.status <> 'active' or v_content_changed) then
    new.status := 'review';
  end if;
  return new;
end $$;

drop trigger if exists listings_owner_guard on public.listings;
create trigger listings_owner_guard
  before insert or update on public.listings
  for each row execute function public.listings_owner_guard();

-- ── 5. Мэдэгдэл: хянах зар → админ; шийдвэр → эзэн ────────────────────────
create or replace function public.listings_owner_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.agent_id is not null or new.owner_id is null then
    return null;
  end if;
  if new.status = 'review' and (tg_op = 'INSERT' or old.status is distinct from 'review') then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'owner_listing_review', 'Хянах зар ирлээ',
           '«' || left(new.title, 80) || '» — эзэн өөрөө нийтлэхээр илгээсэн.',
           '/admin/listings?status=review'
      from public.profiles p
     where p.role = 'admin';
  elsif tg_op = 'UPDATE' and old.status = 'review' and new.status in ('active', 'draft') then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.owner_id,
      'owner_listing_decision',
      case when new.status = 'active' then 'Таны зар нийтлэгдлээ' else 'Таны зарыг засварлах шаардлагатай' end,
      case when new.status = 'active' then '«' || left(new.title, 80) || '» нийтэд харагдаж байна.'
           else '«' || left(new.title, 80) || '»' || coalesce(' — ' || new.review_note, '') end,
      case when new.status = 'active' then '/listings/' || new.id else '/my-listings' end
    );
  end if;
  return null;
end $$;

drop trigger if exists listings_owner_notify on public.listings;
-- «update of status» биш: хамгаалалт BEFORE-д төлвийг өөрчилж болох тул бүх засварт шалгана.
create trigger listings_owner_notify
  after insert or update on public.listings
  for each row execute function public.listings_owner_notify();

-- ── 6. Зураг: эзэн өөрийн хавтас руу (owners/<uid>/…) хуулна ──────────────
drop policy if exists listings_auth_insert on storage.objects;
create policy listings_auth_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listings'
    and (
      exists (select 1 from public.agents where agents.profile_id = auth.uid())
      or ((storage.foldername(name))[1] = 'owners' and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- ── 7. Оффист зуучлуулах хүсэлт ───────────────────────────────────────────
create table if not exists public.owner_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 120),
  contact_phone text not null check (char_length(contact_phone) between 6 and 30),
  deal_type public.deal_type not null,
  property_type text check (property_type is null or char_length(property_type) <= 60),
  district text check (district is null or char_length(district) <= 60),
  location_text text check (location_text is null or char_length(location_text) <= 300),
  area numeric check (area is null or (area > 0 and area < 1000000)),
  rooms int check (rooms is null or (rooms >= 0 and rooms <= 100)),
  price bigint check (price is null or (price > 0 and price < 1000000000000000)),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists owner_requests_office_idx on public.owner_requests (office_id, status, created_at desc);
create index if not exists owner_requests_phone_idx on public.owner_requests (contact_phone, created_at desc);

alter table public.owner_requests enable row level security;

-- Оруулалт зөвхөн серверийн үйлдлээр (service role) — давтамж, утсыг тэнд шалгана.
revoke all on public.owner_requests from anon, authenticated;
grant select, update on public.owner_requests to authenticated;

drop policy if exists owner_requests_select on public.owner_requests;
create policy owner_requests_select on public.owner_requests for select to authenticated using (
  public.is_admin()
  or user_id = auth.uid()
  or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin')
);

drop policy if exists owner_requests_update on public.owner_requests;
create policy owner_requests_update on public.owner_requests for update to authenticated
  using (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'))
  with check (public.is_admin() or (office_id = public.my_office_id() and public.jwt_role() = 'office_admin'));

-- Оффисын админ зөвхөн төлөв, хариуцсан хүнийг өөрчилнө (эзний өгөгдөл үл хөдлөнө).
create or replace function public.owner_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (to_jsonb(new) - array['status', 'handled_by', 'handled_at'])
     is distinct from (to_jsonb(old) - array['status', 'handled_by', 'handled_at']) then
    raise exception 'Хүсэлтийн зөвхөн төлвийг өөрчилнө';
  end if;
  if new.status is distinct from old.status then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists owner_requests_guard on public.owner_requests;
create trigger owner_requests_guard
  before update on public.owner_requests
  for each row execute function public.owner_requests_guard();

create or replace function public.owner_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select distinct u, 'owner_request', 'Зуучлуулах хүсэлт ирлээ',
         new.contact_name || ' — ' ||
           case new.deal_type when 'rent' then 'түрээслүүлэх' else 'худалдах' end ||
           coalesce(', ' || new.district, '') || coalesce(', ' || new.property_type, ''),
         '/office/owner-requests'
    -- Хүсэлтийг оффисын самбараас (зөвхөн office_admin нэвтэрдэг) шийднэ.
    from (select p.id u from public.profiles p
           where p.office_id = new.office_id and p.role = 'office_admin') t
   where u is not null;
  return null;
end $$;

drop trigger if exists owner_requests_notify on public.owner_requests;
create trigger owner_requests_notify
  after insert on public.owner_requests
  for each row execute function public.owner_requests_notify();

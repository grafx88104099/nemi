-- R10 — Оффисын Facebook хуудсанд шууд нийтэлсэн зарын бүртгэл.
-- external_id null = «хүлээгдэж буй» захиалга (Graph дуудлагын ӨМНӨ үүснэ).
-- Токен, нууц утга энд ХАДГАЛАХГҮЙ (FB_PAGE_ACCESS_TOKEN зөвхөн серверийн env).
--
-- Хамаарал: 20261123000500_listing_attribution.sql (listing_can_distribute) —
-- энэ файлын өмнө хэрэгжсэн байх ёстой.
--
-- Хамрах хүрээ: ЗӨВХӨН шинэ хүснэгт + 3 RPC. listings/profiles-ийн одоо байгаа
-- мөрийг өөрчлөхгүй (backfill байхгүй) → listings дээрх триггерүүд
-- (updated_at, crm2_listings_lock, listings_owner_guard, notify) огт ажиллахгүй.
-- FK үүсгэх нь listings/profiles дээр SHARE ROW EXCLUSIVE түгжээг хормын төдий авна
-- (уншилтыг хаахгүй, бичилтийг богино хугацаанд хүлээлгэнэ).
--
-- Бичих эрх: шууд INSERT/UPDATE/DELETE grant, policy БАЙХГҮЙ. Бичилт зөвхөн
-- listing_share_reserve / _complete / _release (SECURITY DEFINER)-ээр.

set local lock_timeout = '5s';

create table if not exists public.listing_share_posts (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  channel     text not null default 'facebook' check (channel in ('facebook')),
  posted_by   uuid references public.profiles(id) on delete set null,
  external_id text check (external_id is null or external_id ~ '^[0-9_]{1,200}$'),
  created_at  timestamptz not null default now()
);
comment on table public.listing_share_posts is
  'R10: Graph API-аар оффисын хуудсанд нийтэлсэн зар (external_id = FB post id, null = хүлээгдэж буй). Токен энд ХАДГАЛАХГҮЙ. Бичилт зөвхөн listing_share_* RPC-ээр.';

create index if not exists listing_share_posts_listing_idx
  on public.listing_share_posts (listing_id, channel, created_at desc);

alter table public.listing_share_posts enable row level security;

-- Supabase-ийн default ACL anon/authenticated/service_role-д бүх эрх өгдөг тул
-- бүгдийг хурааж, зөвхөн уншилтыг буцааж өгнө.
revoke all on public.listing_share_posts from public, anon, authenticated, service_role;
grant select on public.listing_share_posts to authenticated, service_role;

drop policy if exists listing_share_posts_select on public.listing_share_posts;
create policy listing_share_posts_select on public.listing_share_posts
  for select to authenticated
  using (public.is_admin() or public.listing_can_distribute(listing_share_posts.listing_id));
-- insert/update/delete policy байхгүй (RLS = default deny).

-- Захиалга: эрх + нийтэд харагдах эсэх + 24 цагийн хязгаарыг атомаар шалгаж,
-- хүлээгдэж буй мөр үүсгэнэ.
--  * 42501: нэвтрээгүй / эрхгүй (зөвхөн платформын админ эсвэл тухайн агентын
--    оффисын panel_admin эрхтэй office_admin; агент өөрөө нийтлэхгүй).
--  * P0002: зар олдсонгүй.
--  * null: зар нийтэд харагдахгүй (active биш эсвэл оффис түдгэлзсэн), эсвэл
--    сүүлийн 24 цагт нийтэлсэн/хүлээгдэж буй мөр байна.
create or replace function public.listing_share_reserve(p_listing uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
  v_agent  uuid;
  v_office uuid;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_listing is null then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  -- Нэг зарын хувьд зэрэгцээ захиалгыг транзакц дуустал дараалуулна.
  -- READ COMMITTED: түгжээ авсны дараах exists шалгалт шинэ snapshot-оор
  -- өмнөх транзакцын commit хийсэн мөрийг харна.
  perform pg_advisory_xact_lock(hashtextextended('listing_share_posts:' || p_listing::text, 0));

  select l.status::text, l.agent_id, a.office_id
    into v_status, v_agent, v_office
    from public.listings l
    left join public.agents a on a.id = l.agent_id
   where l.id = p_listing;
  if not found then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  -- Эзэмшигчийн (агентгүй) зарыг оффисын хуудсанд нийтлэхгүй.
  if v_agent is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not (
    public.is_admin()
    or (public.jwt_role() = 'office_admin'
        and public.crm_is_panel_admin()
        and v_office is not null
        and v_office = public.my_office_id())
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- listings_select-ийн нийтийн нөхцөлтэй ижил: active ба оффис түдгэлзээгүй.
  if v_status <> 'active' or public.agent_office_suspended(v_agent) then
    return null;
  end if;

  if exists (
    select 1 from public.listing_share_posts s
     where s.listing_id = p_listing and s.channel = 'facebook'
       and s.created_at > now() - interval '24 hours'
  ) then
    return null;
  end if;

  insert into public.listing_share_posts (listing_id, channel, posted_by)
  values (p_listing, 'facebook', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Амжилттай нийтэлсний дараа FB post id-г бичнэ (өөрийн хүлээгдэж буй мөр л).
create or replace function public.listing_share_complete(p_id uuid, p_external_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_id is null
     or p_external_id is null or p_external_id !~ '^[0-9_]{1,200}$' then
    return false;
  end if;
  update public.listing_share_posts
     set external_id = p_external_id
   where id = p_id and posted_by = auth.uid() and external_id is null;
  return found;
end;
$$;

-- Graph тодорхой алдаа буцаасан үед захиалгыг цуцална
-- (өөрийн, 1 цагаас залуу, хүлээгдэж буй мөр л). Timeout үед дуудахгүй →
-- захиалга үлдэж 24 цагийн хамгаалалт хэвээр.
create or replace function public.listing_share_release(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_id is null then
    return false;
  end if;
  delete from public.listing_share_posts
   where id = p_id and posted_by = auth.uid() and external_id is null
     and created_at > now() - interval '1 hour';
  return found;
end;
$$;

-- Default ACL anon/service_role-д EXECUTE өгдөг тул хурааж, зөвхөн
-- authenticated-д (auth.uid() шаардлагатай) өгнө.
revoke all on function public.listing_share_reserve(uuid) from public, anon, service_role;
revoke all on function public.listing_share_complete(uuid, text) from public, anon, service_role;
revoke all on function public.listing_share_release(uuid) from public, anon, service_role;
grant execute on function public.listing_share_reserve(uuid) to authenticated;
grant execute on function public.listing_share_complete(uuid, text) to authenticated;
grant execute on function public.listing_share_release(uuid) to authenticated;

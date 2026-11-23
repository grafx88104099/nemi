-- R10 (fb-utm) — Зарын эх сурвалжийн хэмжилт (first-party attribution).
-- IP, user agent, user_id ХАДГАЛАХГҮЙ. listing_views-д зөвхөн service_role
-- (route handler /api/listing-view) listing_view_record-оор бичнэ.
--
-- Prod-д шалгасан (2026-11-23, SELECT-only):
--  * conversations (24 мөр), viewings (3), owner_requests (0) — utm_* багана байхгүй.
--  * Эдгээр хүснэгтийн триггер: owner_requests_guard (BEFORE UPDATE — status/handled_*-аас
--    бусад багана өөрчлөгдвөл ХЭН Ч БАЙСАН алдаа; service_role/bypass чөлөөлөлтгүй),
--    owner_requests_notify (AFTER INSERT), concierge_viewing_guard (BEFORE INS/UPD/DEL),
--    trg_guard_viewing_identity (BEFORE UPDATE), viewings_notify_agent (AFTER INSERT).
--    conversations дээр триггер байхгүй. Эдгээрийн аль нь ч pg_net дууддаггүй;
--    notifications дээр триггер байхгүй.
--  * is_service_role(), guards_bypassed(), can_manage_agent(), crm2_can_view_property(),
--    crm2_properties.listing_id, listing_status('active'), pg_cron 1.6 бүгд байгаа.
--    'listing-views-purge' нэртэй cron ажил байхгүй.
--  * FK: viewings.listing_id → listings ON DELETE CASCADE, conversations.listing_id → listings
--    ON DELETE SET NULL; owner_requests.user_id / handled_by → profiles ON DELETE SET NULL.
--
-- Backfill БАЙХГҮЙ: шинэ utm_* багана nullable, default-гүй → метадата өөрчлөлт
-- (хүснэгт дахин бичихгүй). Хуучин мөр NULL = «шууд / бусад» гэж тоологдоно.
-- Одоо байгаа мөрийг UPDATE хийхгүй тул ямар ч UPDATE триггер (guard, notify) асахгүй.
-- listings / profiles хүснэгтийг өөрчлөхгүй (listing_views-ийн FK л listings-ийг заана —
-- FK нэмэхэд listings дээр SHARE ROW EXCLUSIVE түгжээ хором зуур авна).
--
-- Түгжээний дараалал: эхлээд listings (listing_views-ийн FK), ДАРАА нь хүүхэд хүснэгтүүд
-- (conversations, viewings, owner_requests). Энэ нь `delete from listings`-ийн FK cascade
-- түгжих дараалалтай ижил тул амьд зар устгалттай deadlock үүсэхгүй.
-- Бүгд жижиг хүснэгт дээр хором зуур; lock_timeout 3s-ээр амьд сайтыг удаан хүлээлгэхгүй.

set local lock_timeout = '3s';

-- 1) Нэргүй зар үзэлт (listings-ийг ЭХЭНД түгжинэ — дээрх тайлбарыг үз)
--    Хэмжээ: session_hash bytea(32) — hex text(64)-ээс ~2 дахин бага мөр/индекс.
create table if not exists public.listing_views (
  id           bigint generated always as identity primary key,
  listing_id   uuid not null references public.listings(id) on delete cascade,
  session_hash bytea not null check (octet_length(session_hash) = 32),
  utm_source   text check (utm_source   is null or utm_source   ~ '^[a-z0-9_-]{1,40}$'),
  utm_medium   text check (utm_medium   is null or utm_medium   ~ '^[a-z0-9_-]{1,40}$'),
  utm_campaign text check (utm_campaign is null or utm_campaign ~ '^[a-z0-9_-]{1,40}$'),
  utm_content  text check (utm_content  is null or utm_content  ~ '^[a-z0-9_-]{1,40}$'),
  created_at   timestamptz not null default now()
);
comment on table public.listing_views is
  'R10: нэргүй зар үзэлт. IP/UA/user_id хадгалахгүй. Бичилт зөвхөн listing_view_record (service_role; нийт/зар/сессийн дээд хязгаартай), уншилт listing_channel_stats-аар. 180 хоног хадгална.';

create index if not exists listing_views_listing_created_idx on public.listing_views (listing_id, created_at desc);
create index if not exists listing_views_session_created_idx on public.listing_views (session_hash, created_at desc);
-- Нийт цагийн хязгаар болон өдөр тутмын purge (created_at-аар) seq scan хийхгүй.
create index if not exists listing_views_created_idx on public.listing_views (created_at);

-- RLS + эрх: public schema-ийн default ACL anon/authenticated-д хүснэгт, sequence-ийн
-- бүх эрхийг олгодог тул ил revoke хийнэ. service_role (BYPASSRLS) эрхээ хадгална.
alter table public.listing_views enable row level security;
revoke all on table public.listing_views from public, anon, authenticated;
revoke all on sequence public.listing_views_id_seq from public, anon, authenticated;

-- Ил «хориглох» бодлого: хэн нэгэн дараа нь grant буцааж өгсөн ч мөр харагдахгүй.
drop policy if exists listing_views_no_client_access on public.listing_views;
create policy listing_views_no_client_access
  on public.listing_views
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 2) Эх сурвалжийн тамга (nullable, хуучин мөр null = «шууд»)
alter table public.conversations
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;
alter table public.viewings
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;
alter table public.owner_requests
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

do $$
declare t text;
begin
  foreach t in array array['conversations', 'viewings', 'owner_requests'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_utm_chk');
    execute format(
      $f$alter table public.%I add constraint %I check (
         (utm_source   is null or utm_source   ~ '^[a-z0-9_-]{1,40}$') and
         (utm_medium   is null or utm_medium   ~ '^[a-z0-9_-]{1,40}$') and
         (utm_campaign is null or utm_campaign ~ '^[a-z0-9_-]{1,40}$'))$f$,
      t, t || '_utm_chk');
  end loop;
end $$;

comment on column public.conversations.utm_source is
  'R10: эх сурвалж (facebook/viber/unegui/...) — үүсгэх үед л тамгална, дараа нь utm_freeze хамгаална (service_role засаж болно). NULL = шууд.';
comment on column public.viewings.utm_source is
  'R10: эх сурвалж — үүсгэх үед л тамгална, дараа нь utm_freeze хамгаална (service_role засаж болно). NULL = шууд.';
comment on column public.owner_requests.utm_source is
  'R10: эх сурвалж — service_role (submitOwnerRequest) INSERT үед л оруулна. Дараа нь owner_requests_guard-аар ХЭН Ч (service_role орно) өөрчлөхгүй. NULL = шууд.';

-- 2b) Үүсгэсний дараа utm_* өөрчлөгдөхгүй (худалдан авагч/агент PostgREST-ээр
--     статистикийг гуйвуулахаас сэргийлнэ). Алдаа өгөхгүй — хуучин утгыг чимээгүй сэргээнэ,
--     тиймээс бусад баганатай хамт ирсэн UPDATE (жишээ нь бүх баганатай upsert) эвдрэхгүй.
--     conversations / viewings: service_role / JWT-гүй (SQL editor, cron) /
--     nemi.bypass_guards='on' үед utm-ийг засаж болно.
--     owner_requests: энэ триггер нэмэлт давхарга л; owner_requests_guard (нэрээр түрүүлж
--     асна) status/handled_*-аас бусад баганын өөрчлөлтөд ямар ч ролийг (service_role,
--     bypass орно) алдаагаар зогсоодог тул тэнд utm бүх ролийн хувьд өөрчлөгдөхгүй.
--     is_service_role(): JWT role='service_role' эсвэл JWT огт байхгүй үед л true;
--     anon/authenticated PostgREST дуудлагад false.
--     Security invoker (хүснэгт уншдаггүй); дуудагддаг хоёр helper-ийг anon/authenticated
--     execute хийх эрхтэй (prod-д шалгасан). Триггер функцийн EXECUTE эрхийг триггер
--     асах үед шалгадаггүй тул клиент ролиудаас бүрэн хасна.
create or replace function public.utm_freeze()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_service_role() or public.guards_bypassed() then
    return new;
  end if;
  new.utm_source   := old.utm_source;
  new.utm_medium   := old.utm_medium;
  new.utm_campaign := old.utm_campaign;
  return new;
end;
$$;
revoke all on function public.utm_freeze() from public, anon, authenticated;

drop trigger if exists conversations_utm_freeze on public.conversations;
create trigger conversations_utm_freeze
  before update of utm_source, utm_medium, utm_campaign on public.conversations
  for each row execute function public.utm_freeze();
drop trigger if exists viewings_utm_freeze on public.viewings;
create trigger viewings_utm_freeze
  before update of utm_source, utm_medium, utm_campaign on public.viewings
  for each row execute function public.utm_freeze();
drop trigger if exists owner_requests_utm_freeze on public.owner_requests;
create trigger owner_requests_utm_freeze
  before update of utm_source, utm_medium, utm_campaign on public.owner_requests
  for each row execute function public.utm_freeze();

create index if not exists conversations_listing_created_idx
  on public.conversations (listing_id, created_at) where listing_id is not null;
create index if not exists viewings_listing_created_idx
  on public.viewings (listing_id, created_at);

-- 2c) owner_requests_guard: хэрэглэгчийн бүртгэл устахад (profiles устгал →
--     owner_requests.user_id ON DELETE SET NULL) guard RI шинэчлэлтийг алдаагаар зогсоож,
--     бүртгэл устгах боломжгүй болгодог байсан (prod-д 0 мөр тул далд алдаа). Зөвхөн
--     «user_id NULL болсон БӨГӨӨД хуучин профайл байхгүй» тохиолдлыг чөлөөлнө — өөр ямар ч
--     өөрчлөлт (utm орно) хуучин шигээ бүх ролийн хувьд хориотой. handled_by-ийн SET NULL
--     аль хэдийн чөлөөт жагсаалтад байгаа. Логик бусад тохиолдолд өөрчлөгдөөгүй.
create or replace function public.owner_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free text[] := array['status', 'handled_by', 'handled_at'];
begin
  if new.user_id is null and old.user_id is not null
     and not exists (select 1 from public.profiles p where p.id = old.user_id) then
    v_free := v_free || 'user_id'::text;
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Хүсэлтийн зөвхөн төлвийг өөрчилнө';
  end if;
  if new.status is distinct from old.status then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end $$;

-- 3) Үзэлт бүртгэх (зөвхөн service_role)
--    p_session: sha256 hex (64 тэмдэгт) — дотроо bytea(32) болгон хадгална.
--    Хязгаарууд (бүгд 'хэтэрвэл тоолохгүй', алдаа өгөхгүй):
--      * нэг сесс × нэг зар: 30 минутад 1 (advisory xact lock-оор зэрэгцээ дуудлагыг цуваална)
--      * нэг сесс: 24 цагт 300
--      * нэг зар: цагт 200
--      * НИЙТ: цагт 3000 → хамгийн муу тохиолдолд ~72k мөр/өдөр (сесс эргүүлдэг скрипт ч
--        үүнээс хэтрүүлж чадахгүй; диск дүүргэх эрсдэлийг хаана). Хэтэрсэн үед жинхэнэ
--        үзэлт ч тоологдохгүй — статистик зөвхөн best-effort.
create or replace function public.listing_view_record(
  p_listing  uuid,
  p_session  text,
  p_viewer   uuid default null,
  p_source   text default null,
  p_medium   text default null,
  p_campaign text default null,
  p_content  text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent uuid;
  v_sess  bytea;
  v_re constant text := '^[a-z0-9_-]{1,40}$';
  c_per_session_day constant int := 300;
  c_per_listing_hour constant int := 200;
  c_global_hour constant int := 3000;
begin
  if p_listing is null or p_session is null or p_session !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  v_sess := decode(p_session, 'hex');

  select l.agent_id into v_agent
    from public.listings l
   where l.id = p_listing and l.status = 'active';
  if not found then
    return false;
  end if;

  -- Агент өөрийн зарыг үзсэнийг тоолохгүй (viewer id хадгалахгүй).
  if p_viewer is not null and v_agent is not null
     and exists (select 1 from public.agents a where a.id = v_agent and a.profile_id = p_viewer) then
    return false;
  end if;

  -- Нэг сесс × нэг зарын зэрэгцээ дуудлагыг (2 таб, давтагдсан beacon) цуваална —
  -- үгүй бол хоёулаа доорх шалгалтыг давж давхар бичнэ.
  perform pg_advisory_xact_lock(hashtextextended('lv:' || p_session || ':' || p_listing::text, 0));

  -- Давхардал: нэг сесс нэг зарыг 30 минутад нэг удаа.
  if exists (
    select 1 from public.listing_views v
     where v.session_hash = v_sess and v.listing_id = p_listing
       and v.created_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;

  -- Нэг сесс 24 цагт.
  if (select count(*) from (
        select 1 from public.listing_views v
         where v.session_hash = v_sess and v.created_at > now() - interval '24 hours'
         limit c_per_session_day) s) >= c_per_session_day then
    return false;
  end if;

  -- Нэг зар цагт.
  if (select count(*) from (
        select 1 from public.listing_views v
         where v.listing_id = p_listing and v.created_at > now() - interval '1 hour'
         limit c_per_listing_hour) s) >= c_per_listing_hour then
    return false;
  end if;

  -- Нийт цагт (listing_views_created_idx).
  if (select count(*) from (
        select 1 from public.listing_views v
         where v.created_at > now() - interval '1 hour'
         limit c_global_hour) s) >= c_global_hour then
    return false;
  end if;

  insert into public.listing_views (listing_id, session_hash, utm_source, utm_medium, utm_campaign, utm_content)
  values (
    p_listing, v_sess,
    case when p_source   ~ v_re then p_source   end,
    case when p_medium   ~ v_re then p_medium   end,
    case when p_campaign ~ v_re then p_campaign end,
    case when p_content  ~ v_re then p_content  end
  );
  return true;
end;
$$;

-- Default ACL execute-ийг anon/authenticated-д олгодог тул ил revoke (дараагийн migration
-- энэ функцэд дахин grant хийх ЁСГҮЙ).
revoke all on function public.listing_view_record(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.listing_view_record(uuid, text, uuid, text, text, text, text) to service_role;

-- 4) Түгээх/статистик харах эрх: агент өөрөө, оффисын админ (panel_admin), платформын админ,
--    эсвэл холбогдсон CRM2 хөрөнгийг харах эрхтэй ажилтан. Зөвхөн агентын зар (agent_id not null).
create or replace function public.listing_can_distribute(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.listings l
     where l.id = p_listing
       and l.agent_id is not null
       and (public.can_manage_agent(l.agent_id)
            or exists (select 1 from public.crm2_properties p
                        where p.listing_id = l.id and public.crm2_can_view_property(p.id)))
  );
$$;
revoke all on function public.listing_can_distribute(uuid) from public, anon;
grant execute on function public.listing_can_distribute(uuid) to authenticated, service_role;

-- 5) Зар × суваг статистик (үзэлт, чат, үзлэгийн хүсэлт). Зөвхөн нэгтгэсэн тоо буцаана;
--    эрхгүй дуудагчид хоосон үр дүн. Агентын өөрөө оруулсан walk-in үзлэг (buyer_id null)
--    үзлэгийн хүсэлтэд орохгүй.
create or replace function public.listing_channel_stats(
  p_agent   uuid default null,
  p_listing uuid default null,
  p_days    int  default 30
)
returns table (listing_id uuid, channel text, views bigint, chats bigint, viewing_requests bigint)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as since
  ),
  ls as (
    select l.id from public.listings l
     where (p_listing is not null and l.id = p_listing and public.listing_can_distribute(l.id))
        or (p_listing is null and p_agent is not null and l.agent_id = p_agent and public.can_manage_agent(p_agent))
  ),
  v as (
    select x.listing_id, coalesce(x.utm_source, 'direct') as ch, count(*) as n
      from public.listing_views x, params
     where x.listing_id in (select id from ls) and x.created_at >= params.since
     group by 1, 2
  ),
  c as (
    select x.listing_id, coalesce(x.utm_source, 'direct') as ch, count(*) as n
      from public.conversations x, params
     where x.listing_id in (select id from ls) and x.created_at >= params.since
     group by 1, 2
  ),
  w as (
    select x.listing_id, coalesce(x.utm_source, 'direct') as ch, count(*) as n
      from public.viewings x, params
     where x.listing_id in (select id from ls) and x.buyer_id is not null
       and x.created_at >= params.since
     group by 1, 2
  ),
  k as (
    select listing_id, ch from v union select listing_id, ch from c union select listing_id, ch from w
  )
  select k.listing_id, k.ch, coalesce(v.n, 0), coalesce(c.n, 0), coalesce(w.n, 0)
    from k
    left join v on v.listing_id = k.listing_id and v.ch = k.ch
    left join c on c.listing_id = k.listing_id and c.ch = k.ch
    left join w on w.listing_id = k.listing_id and w.ch = k.ch
   order by 1, 2;
$$;
revoke all on function public.listing_channel_stats(uuid, uuid, int) from public, anon;
grant execute on function public.listing_channel_stats(uuid, uuid, int) to authenticated, service_role;

-- 6) Хадгалах хугацаа: 180 хоног (нэрээр идемпотент; listing_views_created_idx ашиглана)
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'listing-views-purge' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('listing-views-purge', '20 3 * * *',
    $cmd$delete from public.listing_views where created_at < now() - interval '180 days'$cmd$);
end $$;

notify pgrst, 'reload schema';

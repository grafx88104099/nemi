-- R02 share-seo: хаагдсан (зарагдсан/түрээслэгдсэн) агентын зарын НИЙТИЙН
-- хязгаарлагдмал хуудас.
--
-- 1) listings.closed_at (nullable, default-гүй → метадата өөрчлөлт, хүснэгт
--    дахин бичихгүй). Зөвхөн BEFORE trigger listings_set_closed_at тогтооно:
--      * INSERT                    → null (клиент шууд бичсэнийг үл тооно)
--      * active → sold/rented      → now()
--      * sold/rented → sold/rented → old.closed_at (огноо хэвээр; клиентийн утгыг үл тооно)
--      * draft/review/paused/withdrawn → sold/rented → null (нийтэд хэзээ ч
--        гараагүй, хяналтгүй агуулга нийтлэгдэхгүй)
--      * бусад төлөв               → null
--    BEFORE trigger-ууд нэрийн цагаан толгойн дарааллаар ажилладаг (prod-д шалгасан):
--    concierge_listing_guard, crm2_listings_lock, listings_owner_guard,
--    listings_set_closed_at, listings_updated_at. Тиймээс guard-ууд
--    closed_at-ийн өөрчлөлтийг ХЭЗЭЭ Ч харахгүй (эзний зар review руу орохгүй,
--    concierge/CRM2 guard raise хийхгүй). AFTER trigger-ууд
--    (concierge_terms_invalidate, listings_owner_notify, listings_aggregates)
--    closed_at-ийг харьцуулдаггүй.
--
-- 2) Backfill (зөвхөн анх тавихад: trigger хараахан байхгүй үед) — одоогийн
--    sold/rented агентын зар closed_at = updated_at. Нэг DO блок (= нэг атомар
--    statement) дотор:
--      * listings_updated_at trigger-ийг түр унтраана → updated_at ХӨДЛӨХГҮЙ
--        (DO блок дуусахаас өмнө буцааж асаана; ADD COLUMN-ы ACCESS EXCLUSIVE
--        түгжээ транзакц дуустал барьж байгаа тул өөр сесс унтраасан төлөвийг
--        хэзээ ч харахгүй; алдаа гарвал бүхэлдээ rollback).
--      * crm2.listing_rpc / nemi.concierge_write-ийг транзакц-локал асаана →
--        CRM2-тэй холбоотой эсвэл concierge-ийн удирддаг мөр байсан ч guard
--        raise хийхгүй (одоо ийм мөр 0 — шалгасан), дараа нь буцааж хоосолно.
--      * listings_owner_guard: auth.uid() null → шууд return (өөрчлөлтгүй).
--      * listings_aggregates: «UPDATE OF status, agent_id» → SET-д тэдгээр
--        багана байхгүй тул ажиллахгүй.
--      * concierge_terms_invalidate / listings_owner_notify: харьцуулдаг
--        баганууд өөрчлөгдөхгүй, агентын зар → no-op (мэдэгдэл явахгүй).
--    Дахин тавихад (trigger аль хэдийн байвал) backfill алгасна: тэр үед
--    closed_at null sold мөр бол нийтэд гараагүй мөр тул хөндөх ёсгүй.
--
-- 3) listing_closed_public(uuid) — SECURITY DEFINER, зөвхөн: id, deal_type,
--    type, district, rooms, area, floor, photo. Гарчиг (байр/тоот агуулж
--    болно), үнэ, тайлбар, холбоо барих, эзэн/агент, байршил, огноо ОРОХГҮЙ.
--    Зөвхөн агентын зар, closed_at-аас 180 хоног, түдгэлзсэн оффисын зар орохгүй.
--    listings RLS өөрчлөгдөхгүй: anon одоо ч зөвхөн active мөр хардаг.

set local lock_timeout = '5s';

alter table public.listings add column if not exists closed_at timestamptz;

comment on column public.listings.closed_at is
  'active → sold/rented болсон огноо (trigger listings_set_closed_at). Бусад төлөвт null. Клиент шууд бичиж чадахгүй.';

-- 2) Backfill — trigger үүсэхээс ӨМНӨ, зөвхөн анх тавихад.
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.listings'::regclass
       and tgname = 'listings_set_closed_at'
  ) then
    return;
  end if;

  perform set_config('crm2.listing_rpc', '1', true);
  perform set_config('nemi.concierge_write', 'on', true);
  alter table public.listings disable trigger listings_updated_at;

  update public.listings
     set closed_at = updated_at
   where status in ('sold', 'rented')
     and agent_id is not null
     and closed_at is null;

  alter table public.listings enable trigger listings_updated_at;
  perform set_config('crm2.listing_rpc', '', true);
  perform set_config('nemi.concierge_write', '', true);
end $$;

-- 1) Trigger. SECURITY INVOKER: зөвхөн NEW-г өөрчилнө, өөр хүснэгт уншихгүй.
create or replace function public.listings_set_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.closed_at := null;
    return new;
  end if;

  if new.status in ('sold', 'rented') then
    if old.status = 'active' then
      new.closed_at := now();
    elsif old.status in ('sold', 'rented') then
      new.closed_at := old.closed_at;   -- sold ↔ rented / бусад засвар: огноо хэвээр
    else
      new.closed_at := null;            -- draft/review/paused/withdrawn → sold: нийтэд гараагүй
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

revoke all on function public.listings_set_closed_at() from public, anon, authenticated;

drop trigger if exists listings_set_closed_at on public.listings;
create trigger listings_set_closed_at
  before insert or update on public.listings
  for each row execute function public.listings_set_closed_at();

-- 3) Нийтийн хязгаарлагдмал RPC.
create or replace function public.listing_closed_public(p_id uuid)
returns table (
  id uuid, deal_type text, type text, district text,
  rooms int, area numeric, floor text, photo text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.deal_type::text, l.type, l.district,
         l.rooms, l.area, l.floor, l.photo
    from public.listings l
   where l.id = p_id
     and l.agent_id is not null
     and l.status in ('sold', 'rented')
     and l.closed_at is not null
     and l.closed_at >= now() - interval '180 days'
     and not public.agent_office_suspended(l.agent_id);
$$;

comment on function public.listing_closed_public(uuid) is
  'Хаагдсан агентын зарын нийтийн хязгаарлагдмал мэдээлэл (closed_at-аас 180 хоног). Гарчиг, үнэ, тайлбар, холбоо барих, эзэн/агент, байршил, огноогүй.';

revoke all on function public.listing_closed_public(uuid) from public;
grant execute on function public.listing_closed_public(uuid) to anon, authenticated, service_role;

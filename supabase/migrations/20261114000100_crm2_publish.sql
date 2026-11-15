-- CRM v2 — Staff хөрөнгийг нийтийн зар болгох.
--
-- §1.2: «Компанийн вэбсайт — идэвхтэй листинг нийтлэх интеграци».
-- Зөвхөн ИДЭВХТЭЙ (батлагдсан зуучлалын гэрээтэй) хөрөнгийг нийтэлнэ.
--
-- Нууцлал: эзний харилцагч, эзний тэмдэглэл, үзүүлэх заавар (crm2_property_private),
-- дэлгэрэнгүй хаяг (address_detail), дотоод тэмдэглэл (notes), талбарын эх бичвэр
-- (field_notes), хөрөнгийн код, үүрэгт агентууд, гэрээний огноо, баталгаажуулалтын
-- мэдээлэл — НИЙТЭД ГАРАХГҮЙ. Зөвхөн crm2_listing_payload()-д байгаа талбарууд гарна.
--
-- Холболт: зар нь хөрөнгөтэйгөө холбоотой үлдэнэ — үнэ, үзүүлэлт, төлөв автоматаар
-- (trigger) шинэчлэгдэнэ; харин гарчиг, зарлалын текстийг агент чөлөөтэй засна.
-- Зураг нь тамга дарах шаардлагатай тул клиентээс (lib/crm2/publish-photos.ts)
-- шинэчлэгдэнэ — crm2_set_listing_photos().

-- ── 1. Хөрөнгийн нийтлэлийн талбарууд ───────────────────────────────────────

alter table public.crm2_properties
  add column if not exists listing_id uuid references public.listings(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id),
  add column if not exists media_synced_at timestamptz;

create unique index if not exists crm2_properties_listing_uidx
  on public.crm2_properties (listing_id) where listing_id is not null;

create index if not exists crm2_properties_published_idx
  on public.crm2_properties (office_id, published_at desc) where published_at is not null;

comment on column public.crm2_properties.listing_id is
  'Нийтийн зар (listings.id). Нийтэлсний дараа холбоотой үлдэнэ — буцаахад ч хадгална.';
comment on column public.crm2_properties.media_synced_at is
  'Тамгатай зургийг зард сүүлд шинэчилсэн цаг. Үүнээс хойш CRM-д зураг нэмэгдвэл зард дутуу.';

-- ── 2. Нийтлэхэд саад болох шалтгаанууд ─────────────────────────────────────

create or replace function public.crm2_publish_blockers(p_property uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when p.status <> 'active' then 'Зөвхөн идэвхтэй хөрөнгийг нийтэлнэ' end,
    case when coalesce(p.currency, 'MNT') <> 'MNT' then 'Нийтийн зар зөвхөн төгрөгөөр (MNT)' end,
    case when coalesce(p.price_total, 0) <= 0 then 'Үнэ оруулаагүй байна' end,
    case when p.district is null then 'Дүүрэг сонгоогүй байна' end,
    case when coalesce(p.area_m2, 0) <= 0 then 'Талбай оруулаагүй байна' end,
    case when not exists (select 1 from public.crm2_property_media m
                           where m.property_id = p.id and m.kind = 'image')
         then 'Зураггүй хөрөнгийг нийтлэхгүй' end,
    case when not exists (select 1 from public.agents a
                           where a.profile_id = p.listing_agent_id and a.status = 'active')
         then 'Листлэгч агентын нийтийн бүртгэл идэвхгүй байна' end
  ], null)
  from public.crm2_properties p
  where p.id = p_property;
$$;

revoke all on function public.crm2_publish_blockers(uuid) from public, anon;
grant execute on function public.crm2_publish_blockers(uuid) to authenticated, service_role;

-- ── 3. Нийтэд гарах талбарууд (цорын ганц эх сурвалж) ───────────────────────

/**
 * Хөрөнгөөс зар руу буух талбарууд. ЗӨВХӨН энд байгаа талбар нийтэд гарна —
 * нууцлалын шалгуурыг энэ нэг газраас хянана.
 */
create or replace function public.crm2_listing_payload(p_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deal_type', case when p.category = 'sale' then 'sale' else 'rent' end,
    'type', coalesce(nullif(btrim(p.property_type), ''), 'apartment'),
    'district', coalesce(p.district, '-'),
    'rooms', coalesce(p.rooms, 0),
    'area', coalesce(p.area_m2, 0),
    'floor', case
               when p.floor is null and p.building_floors is null then '-'
               when p.building_floors is null then p.floor::text
               when p.floor is null then '-/' || p.building_floors::text
               else p.floor::text || '/' || p.building_floors::text
             end,
    'price', round(coalesce(p.price_total, 0))::bigint,
    'price_per_m2', case when coalesce(p.area_m2, 0) > 0
                         then round(coalesce(p.price_total, 0) / p.area_m2)::bigint end,
    'year', p.year_in_use,
    -- Онцлогийг кодоор биш, нийтэд ойлгогдох нэрээр (тохиргооны жагсаалтаас).
    'amenities', coalesce((
      select jsonb_agg(label order by label)
        from unnest(coalesce(p.features, '{}'::text[])) f
        cross join lateral (
          select coalesce(public.crm2_setting('property.features', p.office_id) ->> f, f) as label
        ) x
    ), '[]'::jsonb),
    'parking', case when 'parking' = any (coalesce(p.features, '{}'::text[])) then 1 else 0 end,
    'lat', p.lat,
    'lng', p.lng,
    'status', case p.status
                when 'active' then 'active'
                when 'suspended' then 'paused'
                when 'sold' then 'sold'
                when 'rented' then 'rented'
                else 'withdrawn'
              end,
    -- Зуучлалын гэрээтэй, идэвхтэй хөрөнгө — баталгаажсан тэмдэг.
    'verified', p.status = 'active'
  )
  from public.crm2_properties p
  where p.id = p_property;
$$;

revoke all on function public.crm2_listing_payload(uuid) from public, anon, authenticated;
grant execute on function public.crm2_listing_payload(uuid) to service_role;

/** Анхдагч гарчиг — агент дараа нь чөлөөтэй засна. */
create or replace function public.crm2_default_listing_title(p_property uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(nullif(concat_ws(' · ',
    nullif(btrim(coalesce(p.location_text, p.district, '')), ''),
    case when p.rooms is not null and p.rooms > 0 then p.rooms || ' өрөө' end,
    -- FM нь арын тэгийг хасдаг ч таслалыг үлдээдэг тул «65.» болохоос сэргийлнэ.
    case when coalesce(p.area_m2, 0) > 0
         then rtrim(btrim(to_char(p.area_m2, 'FM999999990.99')), '.') || ' м²' end
  ), ''), 160)
  from public.crm2_properties p
  where p.id = p_property;
$$;

revoke all on function public.crm2_default_listing_title(uuid) from public, anon, authenticated;
grant execute on function public.crm2_default_listing_title(uuid) to service_role;

/**
 * Анхдагч зарлалын текст. Дотоод тэмдэглэл (notes), талбарын эх бичвэр
 * (field_notes), хаягийн дэлгэрэнгүй ОРОХГҮЙ.
 */
create or replace function public.crm2_default_listing_description(p_property uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(coalesce(nullif(concat_ws(E'\n',
    nullif(btrim(coalesce(p.advantages, '')), ''),
    case when nullif(btrim(coalesce(p.condition, '')), '') is not null
         then 'Байдал: ' || btrim(p.condition) end,
    case when nullif(btrim(coalesce(p.view_note, '')), '') is not null
         then 'Орчин, харагдах байдал: ' || btrim(p.view_note) end,
    case when nullif(btrim(coalesce(p.availability_note, '')), '') is not null
         then 'Орох боломж: ' || btrim(p.availability_note) end,
    case when coalesce(p.operating_cost, 0) > 0
         then 'Ашиглалтын зардал: ' || btrim(to_char(p.operating_cost, 'FM999,999,999')) || ' '
              || coalesce(p.operating_cost_currency, 'MNT') end
  ), ''), ''), 4000)
  from public.crm2_properties p
  where p.id = p_property;
$$;

revoke all on function public.crm2_default_listing_description(uuid) from public, anon, authenticated;
grant execute on function public.crm2_default_listing_description(uuid) to service_role;

-- ── 4. Зар руу талбаруудыг буулгах ──────────────────────────────────────────

/**
 * Холбоотой зарын АВТОМАТ талбаруудыг хөрөнгөөс шинэчилнэ.
 * Гарчиг, тайлбар, зураг — ХӨНДӨХГҮЙ (агентын эзэмшил).
 * Буцаасан (published_at is null) бол зар үргэлж «withdrawn».
 */
create or replace function public.crm2_sync_listing(p_property uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_published timestamptz;
  v_f jsonb;
begin
  select listing_id, published_at into v_listing, v_published
    from public.crm2_properties where id = p_property;
  if v_listing is null then
    return;
  end if;
  v_f := public.crm2_listing_payload(p_property);

  update public.listings l set
    deal_type = (v_f->>'deal_type')::public.deal_type,
    type = v_f->>'type',
    district = v_f->>'district',
    rooms = (v_f->>'rooms')::int,
    area = (v_f->>'area')::numeric,
    floor = v_f->>'floor',
    price = (v_f->>'price')::bigint,
    price_per_m2 = nullif(v_f->>'price_per_m2', '')::bigint,
    year = nullif(v_f->>'year', '')::int,
    amenities = array(select jsonb_array_elements_text(v_f->'amenities')),
    parking = (v_f->>'parking')::int,
    verified = (v_f->>'verified')::boolean,
    location = case when v_f->>'lat' is not null and v_f->>'lng' is not null
                    then ('SRID=4326;POINT(' || (v_f->>'lng') || ' ' || (v_f->>'lat') || ')')::geography
               end,
    status = case when v_published is null then 'withdrawn'::public.listing_status
                  else (v_f->>'status')::public.listing_status end,
    updated_at = now()
  where l.id = v_listing;
end $$;

revoke all on function public.crm2_sync_listing(uuid) from public, anon, authenticated;
grant execute on function public.crm2_sync_listing(uuid) to service_role;

/** Хөрөнгө өөрчлөгдөхөд холбоотой зарыг дагуулна. */
create or replace function public.crm2_properties_publish_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.listing_id is not null then
    perform public.crm2_sync_listing(new.id);
  end if;
  return null;
end $$;

revoke all on function public.crm2_properties_publish_sync() from public, anon, authenticated;
grant execute on function public.crm2_properties_publish_sync() to service_role;

drop trigger if exists crm2_properties_publish_sync on public.crm2_properties;
create trigger crm2_properties_publish_sync
  after update on public.crm2_properties
  for each row
  when (new.listing_id is not null and (
        old.status is distinct from new.status
     or old.published_at is distinct from new.published_at
     or old.price is distinct from new.price
     or old.price_basis is distinct from new.price_basis
     or old.price_period is distinct from new.price_period
     or old.area_m2 is distinct from new.area_m2
     or old.rooms is distinct from new.rooms
     or old.floor is distinct from new.floor
     or old.building_floors is distinct from new.building_floors
     or old.district is distinct from new.district
     or old.property_type is distinct from new.property_type
     or old.category is distinct from new.category
     or old.year_in_use is distinct from new.year_in_use
     or old.features is distinct from new.features
     or old.lat is distinct from new.lat
     or old.lng is distinct from new.lng))
  execute function public.crm2_properties_publish_sync();

-- ── 5. Нийтлэх / буцаах ─────────────────────────────────────────────────────

create or replace function public.crm2_publish_property(
  p_property uuid,
  p_title text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_office uuid;
  v_agent uuid;
  v_listing uuid;
  v_blockers text[];
  v_title text;
  v_desc text;
  v_f jsonb;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийг нийтлэх эрхгүй байна';
  end if;

  select office_id, listing_id into v_office, v_listing
    from public.crm2_properties where id = p_property for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;

  v_blockers := public.crm2_publish_blockers(p_property);
  if cardinality(v_blockers) > 0 then
    raise exception 'CRM: нийтлэх боломжгүй — %', array_to_string(v_blockers, '; ');
  end if;

  select a.id into v_agent
    from public.agents a
    join public.crm2_properties p on p.listing_agent_id = a.profile_id
   where p.id = p_property and a.status = 'active'
   limit 1;
  if v_agent is null then
    raise exception 'CRM: листлэгч агентын нийтийн бүртгэл олдсонгүй';
  end if;

  v_f := public.crm2_listing_payload(p_property);
  v_title := left(nullif(btrim(coalesce(p_title, '')), ''), 160);
  v_desc := left(nullif(btrim(coalesce(p_description, '')), ''), 4000);

  v_prev := public.crm2_rpc_begin();

  if v_listing is null then
    insert into public.listings (
      agent_id, title, description, type, district, rooms, area, floor,
      price, price_per_m2, year, parking, amenities, deal_type, verified,
      location, status
    ) values (
      v_agent,
      coalesce(v_title, public.crm2_default_listing_title(p_property), 'Үл хөдлөх хөрөнгө'),
      coalesce(v_desc, public.crm2_default_listing_description(p_property)),
      v_f->>'type',
      v_f->>'district',
      (v_f->>'rooms')::int,
      (v_f->>'area')::numeric,
      v_f->>'floor',
      (v_f->>'price')::bigint,
      nullif(v_f->>'price_per_m2', '')::bigint,
      nullif(v_f->>'year', '')::int,
      (v_f->>'parking')::int,
      array(select jsonb_array_elements_text(v_f->'amenities')),
      (v_f->>'deal_type')::public.deal_type,
      (v_f->>'verified')::boolean,
      case when v_f->>'lat' is not null and v_f->>'lng' is not null
           then ('SRID=4326;POINT(' || (v_f->>'lng') || ' ' || (v_f->>'lat') || ')')::geography end,
      'draft'::public.listing_status
    ) returning id into v_listing;
  else
    -- Дахин нийтлэх: агент, гарчиг/тайлбарыг (өгсөн бол) шинэчилнэ.
    update public.listings set
      agent_id = v_agent,
      title = coalesce(v_title, title),
      description = coalesce(v_desc, description)
    where id = v_listing;
  end if;

  update public.crm2_properties
     set listing_id = v_listing,
         published_at = now(),
         published_by = auth.uid()
   where id = p_property;

  perform public.crm2_sync_listing(p_property);
  perform public.crm2_rpc_end(v_prev);

  perform public.crm2_log(v_office, 'property', p_property, 'publish', 'listing_id',
                          null, to_jsonb(v_listing::text), p_property);

  return jsonb_build_object(
    'listing_id', v_listing,
    'needs_photos', not exists (select 1 from public.listing_photos lp where lp.listing_id = v_listing)
  );
exception
  when others then
    if v_prev is not null then perform public.crm2_rpc_end(v_prev); end if;
    raise;
end $$;

revoke all on function public.crm2_publish_property(uuid, text, text) from public, anon;
grant execute on function public.crm2_publish_property(uuid, text, text) to authenticated, service_role;

create or replace function public.crm2_unpublish_property(p_property uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_office uuid;
  v_listing uuid;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийн зарыг буцаах эрхгүй байна';
  end if;
  select office_id, listing_id into v_office, v_listing
    from public.crm2_properties where id = p_property for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;
  if v_listing is null then
    return;
  end if;

  v_prev := public.crm2_rpc_begin(p_reason);
  update public.crm2_properties set published_at = null where id = p_property;
  perform public.crm2_sync_listing(p_property);
  perform public.crm2_rpc_end(v_prev);

  perform public.crm2_log(v_office, 'property', p_property, 'unpublish', 'listing_id',
                          to_jsonb(v_listing::text), null, p_property, null, null, p_reason);
exception
  when others then
    if v_prev is not null then perform public.crm2_rpc_end(v_prev); end if;
    raise;
end $$;

revoke all on function public.crm2_unpublish_property(uuid, text) from public, anon;
grant execute on function public.crm2_unpublish_property(uuid, text) to authenticated, service_role;

-- ── 6. Зарлалын текст (агентын эзэмшил) ─────────────────────────────────────

create or replace function public.crm2_update_listing_text(
  p_property uuid,
  p_title text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_title text := left(nullif(btrim(coalesce(p_title, '')), ''), 160);
  v_desc text := left(btrim(coalesce(p_description, '')), 4000);
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ зарыг засах эрхгүй байна';
  end if;
  if v_title is null then
    raise exception 'CRM: зарын гарчиг хоосон байж болохгүй';
  end if;
  select listing_id into v_listing from public.crm2_properties where id = p_property;
  if v_listing is null then
    raise exception 'CRM: энэ хөрөнгө зар болоогүй байна';
  end if;
  update public.listings
     set title = v_title, description = nullif(v_desc, ''), updated_at = now()
   where id = v_listing;
end $$;

revoke all on function public.crm2_update_listing_text(uuid, text, text) from public, anon;
grant execute on function public.crm2_update_listing_text(uuid, text, text) to authenticated, service_role;

-- ── 7. Тамгатай зураг (клиентээс) ───────────────────────────────────────────

/**
 * Зард тамгатай зургийг тавина. URL-ууд нь зөвхөн нийтийн `listings` bucket-ийнх
 * байх ёстой — өөр хаяг оруулахаас сэргийлнэ.
 */
create or replace function public.crm2_set_listing_photos(p_property uuid, p_urls text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_urls text[] := coalesce(p_urls, '{}'::text[]);
  v_bad text;
  v_prev text;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ зарын зургийг солих эрхгүй байна';
  end if;
  select listing_id into v_listing from public.crm2_properties where id = p_property;
  if v_listing is null then
    raise exception 'CRM: энэ хөрөнгө зар болоогүй байна';
  end if;
  if cardinality(v_urls) > 30 then
    raise exception 'CRM: зураг хэтэрхий олон (дээд тал нь 30)';
  end if;
  select u into v_bad from unnest(v_urls) u
   where u !~ '^https://[^/]+/storage/v1/object/public/listings/' limit 1;
  if v_bad is not null then
    raise exception 'CRM: зөвшөөрөгдөөгүй зургийн хаяг';
  end if;

  delete from public.listing_photos where listing_id = v_listing;
  if cardinality(v_urls) > 0 then
    insert into public.listing_photos (listing_id, url, sort_order, is_primary)
    select v_listing, u, ord - 1, ord = 1
      from unnest(v_urls) with ordinality as t(u, ord);
  end if;
  update public.listings set photo = v_urls[1], updated_at = now() where id = v_listing;
  v_prev := public.crm2_rpc_begin();
  update public.crm2_properties set media_synced_at = now() where id = p_property;
  perform public.crm2_rpc_end(v_prev);
exception
  when others then
    if v_prev is not null then perform public.crm2_rpc_end(v_prev); end if;
    raise;
end $$;

revoke all on function public.crm2_set_listing_photos(uuid, text[]) from public, anon;
grant execute on function public.crm2_set_listing_photos(uuid, text[]) to authenticated, service_role;

-- ── 8. UI-д зориулсан төлөв ─────────────────────────────────────────────────

create or replace function public.crm2_publish_state(p_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.crm2_can_view_property(p_property) then null else
    jsonb_build_object(
      'can_publish', public.crm2_can_edit_property(p_property),
      'blockers', to_jsonb(public.crm2_publish_blockers(p_property)),
      'listing_id', p.listing_id,
      'published', p.published_at is not null,
      'published_at', p.published_at,
      'published_by', public.crm2_profile_name(p.published_by),
      'title', l.title,
      'description', l.description,
      'listing_status', l.status,
      'photo_count', (select count(*) from public.listing_photos lp where lp.listing_id = p.listing_id),
      'image_count', (select count(*) from public.crm2_property_media m
                       where m.property_id = p.id and m.kind = 'image'),
      'media_stale', p.listing_id is not null and exists (
        select 1 from public.crm2_property_media m
         where m.property_id = p.id and m.kind = 'image'
           and (p.media_synced_at is null or m.created_at > p.media_synced_at)),
      'default_title', public.crm2_default_listing_title(p.id),
      'default_description', public.crm2_default_listing_description(p.id)
    ) end
  from public.crm2_properties p
  left join public.listings l on l.id = p.listing_id
  where p.id = p_property;
$$;

revoke all on function public.crm2_publish_state(uuid) from public, anon;
grant execute on function public.crm2_publish_state(uuid) to authenticated, service_role;

-- ── 9. Нийтлэлийн талбарыг зөвхөн RPC-ээр ───────────────────────────────────

create or replace function public.crm2_properties_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    -- Шинэ хөрөнгө хэзээ ч зартай төрөхгүй.
    new.listing_id := null;
    new.published_at := null;
    new.published_by := null;
    new.media_synced_at := null;
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
    -- Нийтлэлийг зөвхөн crm2_publish_property / crm2_unpublish_property-оор.
    if not v_sys and (
         new.listing_id is distinct from old.listing_id
         or new.published_at is distinct from old.published_at
         or new.published_by is distinct from old.published_by
         or new.media_synced_at is distinct from old.media_synced_at) then
      raise exception 'CRM: зарын холбоог тусгай үйлдлээр өөрчилнө';
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

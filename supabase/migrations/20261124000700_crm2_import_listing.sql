-- 20261124000700_crm2_import_listing.sql
-- P12(2): «Миний зараас үүсгэх» — агентын өөрийн нийтийн зарын талбаруудыг ЗӨВХӨН ХУУЛЖ ШИНЭ ноорог үүсгэнэ.
--   source='listing', source_listing_id тавина; listing_id-ийг ХОЛБОХГҮЙ (синк триггер амьд зарыг 'withdrawn'
--   болгох, crm2_listings_lock ListingForm-ийг түгжихээс сэргийлнэ) — холболт зөвхөн нийтлэх үед
--   (20261124000600 crm2_publish_property p_link_listing).
--   Импортолсон (утгатай) талбар бүр unconfirmed-д («зараас, шалгана уу»); анхны зарын created_at түүхэнд нотолгоо болно.
--   contract_agent_id ХООСОН үлдэнэ (гэрээний доод цонх тавина) — same_agent_multi_role-той зөрчилдөхгүй.   -- ШИНЭ
-- Зураг: RPC зарын зургийг {path, url, sort} хэлбэрээр буцаана. path = '/object/public/listings/'-ийн дараах   -- ШИНЭ
--   объектын зам. Хостод итгэхгүй: сервер (server action) зөвхөн path-аар Storage API-аар татаж crm2-media руу   -- ШИНЭ
--   хуулаад crm2_attach_imported_media-аар бүртгэнэ (URL-аар fetch хийхгүй).                                    -- ШИНЭ
--   Зам = цагаан жагсаалт (crm2_listing_photo_path): "%", зай, "..", "//" бүхий замыг буцаахгүй/хүлээж авахгүй.
--   Импорт/хавсаргалт idempotent: давтан импорт ижил хариу (+attached) буцаана, давтан хавсаргалт алгасна.
--   source_public_url-ийг зөвхөн энэ RPC тавина (media guard хэрэглэгчийн утгыг тэглэнэ, дараа нь өөрчлөхгүй).
-- Өөрчлөгдөх prod функц: crm2_property_media_guard (source_public_url) — prod-ын одоогийн тодорхойлолт +
--   «-- ШИНЭ» мөрүүд. Шинэ: crm2_create_property_from_listing, crm2_attach_imported_media,
--   crm2_listing_photo_path, crm2_listing_photo_url, индекс crm2_property_media_source_url_uq.
--
-- DEPLOY: 20261124000100 … 20261124000600-ийн ДАРАА (файлын дарааллаар); Batch 2 кодоос ӨМНӨ.
--   Prod: BEGIN … ROLLBACK dry-run → apply.                                                                      -- ШИНЭ
-- Rollback: 20261113000100-ийн crm2_property_media_guard-ийг сэргээж,
--   drop function public.crm2_attach_imported_media(uuid, jsonb), public.crm2_create_property_from_listing(uuid, uuid),
--   public.crm2_listing_photo_url(text), public.crm2_listing_photo_path(text);
--   drop index if exists public.crm2_property_media_source_url_uq.

set local lock_timeout = '3s';

create or replace function public.crm2_property_media_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
       or new.uploaded_by <> old.uploaded_by or new.created_at <> old.created_at  -- ШИНЭ
       or new.source_public_url is distinct from old.source_public_url then   -- ШИНЭ
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
  -- ШИНЭ: «зараас хуулсан» гэх тэмдгийг зөвхөн импортын RPC тавина.
  if not public.crm2_in_rpc() then   -- ШИНЭ
    new.source_public_url := null;   -- ШИНЭ
  end if;   -- ШИНЭ

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

-- ШИНЭ: зарын зургийн URL-аас listings bucket доторх замыг ЦАГААН ЖАГСААЛТААР гаргана (хоёр функц нэг дүрэм).
--   Сегмент бүр [A-Za-z0-9_-]-ээр эхэлж, зөвхөн [A-Za-z0-9._-] агуулна: '%' (кодлосон '..', '/'), зай, '..',
--   '//', эхний '/' болон цэгээр эхэлсэн сегментийг татгалзана. Query/fragment-ийг хасна. Хостод итгэхгүй.
create or replace function public.crm2_listing_photo_path(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when s.path ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
                and char_length(s.path) <= 500
                and char_length(s.pre) + char_length(s.path) <= 1000   -- crm2_property_media_source_url_chk
           then s.path end
    from (select substring(p_url from '^https://[^/?#]+/storage/v1/object/public/listings/([^?#]+)') as path,
                 substring(p_url from '^(https://[^/?#]+/storage/v1/object/public/listings/)') as pre) s
$$;

-- ШИНЭ: query/fragment-гүй URL (гарал үүслийн тэмдэг) — зам хүчинтэй үед л.
create or replace function public.crm2_listing_photo_url(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select substring(p_url from '^(https://[^/?#]+/storage/v1/object/public/listings/)')
         || public.crm2_listing_photo_path(p_url)
$$;
revoke all on function public.crm2_listing_photo_path(text) from public, anon, authenticated;
revoke all on function public.crm2_listing_photo_url(text) from public, anon, authenticated;
grant execute on function public.crm2_listing_photo_path(text) to service_role;
grant execute on function public.crm2_listing_photo_url(text) to service_role;

-- ШИНЭ: нэг хөрөнгөд нэг зарын зураг нэг л удаа (давтан/зэрэг хавсаргалт).
create unique index if not exists crm2_property_media_source_url_uq
  on public.crm2_property_media (property_id, source_public_url) where source_public_url is not null;

-- Буцаах утга (ШИНЭ: шинэ болон өмнө нь үүссэн — ижил хэлбэр, дутуу хуулсан зургийг үргэлжлүүлэхэд):
--   {"existing": bool, "property_id": uuid, "code", "photos": [{"path", "url", "sort"}],
--    "attached": [source_public_url…], "duplicates": [...]}
--   Өмнө нь үүссэн ч засах эрхгүй (эсвэл энэ зараас хуулагдаагүй, зөвхөн холбогдсон) бол: {"existing": true, "property_id", "code"};
--   харах эрхгүй бол {"existing": true, "property_id": null}.
create or replace function public.crm2_create_property_from_listing(p_listing uuid, p_client_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid := public.crm_office_id();
  v_me uuid := auth.uid();
  v_l public.listings;
  v_type text;
  v_cat public.crm2_property_category;
  v_m text[];
  v_floor int;
  v_bfloors int;
  v_existing uuid;
  v_id uuid;
  v_code text;
  v_src uuid;                    -- ШИНЭ
  v_flag text;
  v_photos jsonb;
  v_attached jsonb := '[]'::jsonb;   -- ШИНЭ
  v_dups jsonb := '[]'::jsonb;
  v_txt text;
  v_project uuid;
  v_district text;
  v_area numeric;
  v_rooms int;
  v_price numeric;
  v_year int;
  v_features text[];
  v_lat double precision;
  v_lng double precision;
  v_adv text;
  v_parking int;
  v_adv_m int;
  v_dep_m int;
  v_lagent uuid;                 -- ШИНЭ
  v_unconf text[];
begin
  if v_office is null or not public.crm2_can_work() then
    raise exception 'CRM: эрх алга';
  end if;
  select * into v_l from public.listings where id = p_listing;
  if not found then
    raise exception 'CRM: зар олдсонгүй';
  end if;
  -- Зөвхөн өөрийн зар (менежер — оффисын агентын зар).
  if not exists (select 1 from public.agents a
                  where a.id = v_l.agent_id and a.office_id = v_office
                    and (a.profile_id = v_me or public.crm_is_manager())) then
    raise exception 'CRM: зөвхөн өөрийн зараас хөрөнгө үүсгэнэ';
  end if;
  select x.id into v_existing from public.crm2_properties x
   where x.source_listing_id = p_listing or x.listing_id = p_listing
   order by (x.source_listing_id = p_listing) desc nulls last limit 1;

  if v_existing is null then
    v_type := case v_l.type
                when 'Орон сууц' then 'apartment' when 'Хаус' then 'house' when 'Оффис' then 'office'
                when 'Худалдааны талбай' then 'commercial' when 'Газар' then 'land' else 'other' end;
    if not (public.crm2_setting('property.types', v_office) ? v_type) then
      v_type := null;
    end if;
    v_cat := case when v_l.deal_type = 'sale' then 'sale' else 'rent' end;
    v_m := regexp_match(coalesce(v_l.floor, ''), '^\s*(-?\d{1,3})\s*(?:[/|-]\s*(\d{1,3}))?\s*$');
    v_floor := v_m[1]::int;
    v_bfloors := nullif(v_m[2], '')::int;
    if v_floor is not null and (v_floor < -10 or v_floor > 300) then v_floor := null; end if;
    if v_bfloors is not null and (v_bfloors < 1 or v_bfloors > 300) then v_bfloors := null; end if;
    if v_floor is not null and v_bfloors is not null and v_floor > v_bfloors then
      v_floor := null; v_bfloors := null;
    end if;

    -- Утгуудыг урьдчилан тооцож, зөвхөн бодитоор хуулсан талбарыг unconfirmed-д оруулна.
    v_district := case when public.crm2_setting('property.districts', v_office) ? v_l.district then v_l.district end;
    v_area := case when v_l.area > 0 and v_l.area < 10000000 then v_l.area end;
    v_rooms := case when v_l.rooms between 1 and 100 then v_l.rooms end;
    v_price := case when v_l.price > 0 and v_l.price < 100000000000000 then v_l.price end;   -- ШИНЭ: numeric(16,2), >= 0
    v_year := case when v_l.year between 1900 and 2100 then v_l.year end;
    v_features := array(select distinct m.k
                          from unnest(coalesce(v_l.features, '{}'::text[])) lf
                         cross join lateral (values (case lf when 'pets_allowed' then 'pets' else lf end)) m(k)
                         where public.crm2_setting('property.features', v_office) ? m.k
                         order by 1);
    if v_l.location is not null then
      v_lat := ST_Y(v_l.location::geometry);
      v_lng := ST_X(v_l.location::geometry);
    end if;
    v_adv := left(nullif(btrim(coalesce(v_l.description, '')), ''), 4000);
    v_parking := case when v_l.parking between 1 and 50 then v_l.parking end;
    v_adv_m := case when v_cat <> 'sale' and v_l.rent_advance_months between 0 and 24 then v_l.rent_advance_months end;
    v_dep_m := case when v_cat <> 'sale' and v_l.rent_deposit_months between 0 and 24 then v_l.rent_deposit_months end;

    -- ШИНЭ: зарын агент энэ оффисын CRM-д идэвхтэй ажилтан биш бол листлэгч агентыг хоосон үлдээнэ
    --   (guard үүсгэгчээр орлуулна) — 'listing_agent_id' unconfirmed-д орж, менежер шалгана.
    select a.profile_id into v_lagent from public.agents a where a.id = v_l.agent_id;
    if v_lagent is not null and not exists (select 1 from public.crm_staff s
                                             where s.profile_id = v_lagent and s.office_id = v_office and s.is_active) then
      v_lagent := null;
    end if;

    -- Төслийг зарын гарчиг/тайлбараас таних (оффисын идэвхтэй төсөл; ШИНЭ: нэр БҮТЭН ҮГЭЭР таарна,
    --   урт нэр давуу). Шинэ төсөл ҮҮСГЭХГҮЙ. Таарвал 'project' unconfirmed-д орно.
    v_txt := ' ' || lower(regexp_replace(
               coalesce(v_l.title, '') || ' ' || left(coalesce(v_l.description, ''), 2000), '[^[:alnum:]]+', ' ', 'g')) || ' ';   -- ШИНЭ: төгсгөлийн зай
    select pr.id into v_project
      from public.crm2_projects pr
     cross join lateral (select btrim(lower(regexp_replace(pr.name, '[^[:alnum:]]+', ' ', 'g'))) as k) f
     where pr.office_id = v_office and pr.is_active
       and char_length(replace(f.k, ' ', '')) >= 3
       and strpos(v_txt, ' ' || f.k || ' ') > 0   -- ШИНЭ: үгийн хоёр талын хил
     order by char_length(f.k) desc, pr.created_at, pr.id
     limit 1;

    v_unconf := array_remove(array[
      'category',
      case when v_type is not null then 'property_type' end,
      case when v_project is not null then 'project' end,
      case when v_district is not null then 'district' end,
      case when v_area is not null then 'area_m2' end,
      case when v_rooms is not null then 'rooms' end,
      case when v_floor is not null then 'floor' end,
      case when v_bfloors is not null then 'building_floors' end,
      case when v_price is not null then 'price' end,
      case when v_year is not null then 'year_in_use' end,
      case when cardinality(v_features) > 0 then 'features' end,
      case when v_adv is not null then 'advantages' end,
      case when v_lat is not null then 'lat' end,
      case when v_parking is not null then 'parking_spaces' end,
      case when v_adv_m is not null then 'rent_advance_months' end,
      case when v_dep_m is not null then 'rent_deposit_months' end,
      case when v_lagent is null then 'listing_agent_id' end   -- ШИНЭ
    ]::text[], null);

    v_flag := public.crm2_rpc_begin('Зараас үүсгэсэн');
    begin
      insert into public.crm2_properties (
        office_id, created_by, category, property_type, project_id, district, area_m2, rooms, floor, building_floors,
        price, currency, price_period, price_basis, year_in_use, features, lat, lng, advantages, field_notes,
        listing_agent_id, contract_agent_id, parking_spaces, rent_advance_months, rent_deposit_months,
        source, source_listing_id, client_key, unconfirmed
      ) values (
        v_office, v_me, v_cat, v_type, v_project, v_district, v_area, v_rooms,
        v_floor, v_bfloors,
        v_price, 'MNT',
        (case when v_cat = 'sale' then 'total' else 'month' end)::public.crm2_price_period,
        'total'::public.crm2_price_basis,
        v_year, v_features, v_lat, v_lng, v_adv,
        jsonb_build_object('listing_title', left(coalesce(v_l.title, ''), 2000)),
        v_lagent,                                                                     -- ШИНЭ
        null,                                                                         -- гэрээний агентыг гэрээний цонх тавина
        v_parking, v_adv_m, v_dep_m,
        'listing', p_listing, p_client_key,
        v_unconf
      ) returning id, code into v_id, v_code;
    exception
      when unique_violation then   -- зэрэг дуудсан (source_listing_id unique) — нөгөөгийнх нь үр дүнг буцаана
        select x.id into v_existing from public.crm2_properties x
         where x.source_listing_id = p_listing or x.listing_id = p_listing
         order by (x.source_listing_id = p_listing) desc nulls last limit 1;
        if v_existing is null then
          raise;
        end if;
    end;
    perform public.crm2_rpc_end(v_flag);
    v_flag := null;

    if v_id is not null then
      -- Нотолгоо: анхны зарын бүртгэлийн огноо.
      perform public.crm2_log(v_office, 'property', v_id, 'import', 'source_listing_id', null,
        jsonb_build_object('listing_id', p_listing, 'listing_created_at', v_l.created_at), v_id);
    end if;
  end if;

  -- ШИНЭ: өмнө нь үүссэн бол — засах эрхтэй, энэ зараас хуулсан үед шинэтэй ижил хариу (үргэлжлүүлэх).
  if v_existing is not null then
    if not public.crm2_can_view_property(v_existing) then
      return jsonb_build_object('existing', true, 'property_id', null);
    end if;
    select x.id, x.code, x.source_listing_id into v_id, v_code, v_src
      from public.crm2_properties x where x.id = v_existing;
    if v_src is distinct from p_listing or not public.crm2_can_edit_property(v_existing) then
      return jsonb_build_object('existing', true, 'property_id', v_id, 'code', v_code);
    end if;
    select coalesce(jsonb_agg(m.source_public_url order by m.sort_order, m.created_at, m.id), '[]'::jsonb)
      into v_attached
      from public.crm2_property_media m
     where m.property_id = v_id and m.source_public_url is not null;
  end if;

  -- {path, url, sort}: path = listings bucket доторх зам (crm2_listing_photo_path цагаан жагсаалт);
  --   url = query/fragment-гүй хэлбэр (crm2_property_media_source_url_chk-тэй ижил). Хостыг ашиглахгүй —
  --   TS зөвхөн path-аар Storage API-аар татна.
  select coalesce(jsonb_agg(jsonb_build_object('path', s.path, 'url', s.url, 'sort', s.sort)
                            order by s.sort, s.created_at, s.id), '[]'::jsonb)
    into v_photos
    from (select lp.id, lp.sort_order as sort, lp.created_at,
                 public.crm2_listing_photo_url(lp.url) as url,      -- ШИНЭ
                 public.crm2_listing_photo_path(lp.url) as path     -- ШИНЭ
            from public.listing_photos lp
           where lp.listing_id = p_listing) s
   where s.path is not null;

  -- Давхардлын шалгалт хадгалсан өгөгдлөөр (20261124000400). Шалгалт импортыг хэзээ ч зогсоохгүй.
  begin
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_dups
      from public.crm2_property_duplicates(v_id) d;
  exception when others then
    v_dups := '[]'::jsonb;
  end;

  return jsonb_build_object('existing', v_existing is not null, 'property_id', v_id, 'code', v_code,
                            'photos', v_photos, 'attached', v_attached, 'duplicates', v_dups);   -- ШИНЭ: attached
exception
  when others then
    if v_flag is not null then perform public.crm2_rpc_end(v_flag); end if;
    raise;
end $$;
revoke all on function public.crm2_create_property_from_listing(uuid, uuid) from public, anon;
grant execute on function public.crm2_create_property_from_listing(uuid, uuid) to authenticated, service_role;

-- p_items: [{"storage_path": "<office>/<property>/<uuid>.jpg",
--            "source_path": "<listings bucket доторх зам>"  -- эсвэл "public_url": "<зарын зургийн url>"
--            "sort_order": 0, "is_cover": true}]  — файлыг server action урьдчилан crm2-media руу хуулсан байна.
-- Зураг тухайн эх зарынх (listing_photos) байх ёстой; source_public_url-д DB дахь зарын url-ийг тавина.
-- ШИНЭ: idempotent — энэ хөрөнгөд аль хэдийн байгаа storage_path эсвэл аль хэдийн хавсаргасан зарын зургийг
--   алгасна (алдаагүй). Буцаах утга = бодитоор нэмсэн тоо (алгассан зүйлийн хуулсан файлыг TS устгана).
create or replace function public.crm2_attach_imported_media(p_property uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src uuid;
  v_item jsonb;
  v_flag text;
  v_n int := 0;
  v_url text;
  v_path text;          -- ШИНЭ
  v_cover boolean;
  v_has_cover boolean;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийг засах эрхгүй';
  end if;
  select source_listing_id into v_src from public.crm2_properties where id = p_property;
  if v_src is null then
    raise exception 'CRM: энэ хөрөнгө зараас үүсээгүй';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then
    raise exception 'CRM: зургийн жагсаалт буруу';
  end if;
  -- Нэг хөрөнгөд нэг л нүүр зураг (crm2_property_media_cover unique).
  select exists (select 1 from public.crm2_property_media m where m.property_id = p_property and m.is_cover)
    into v_has_cover;
  v_flag := public.crm2_rpc_begin('Зарын зургийг хуулсан');
  for v_item in select e from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_item) <> 'object' or nullif(v_item->>'storage_path', '') is null then   -- ШИНЭ: storage_path заавал
      raise exception 'CRM: зургийн жагсаалт буруу';
    end if;
    v_path := v_item->>'storage_path';
    -- ШИНЭ: давтан илгээлт — энэ файл энэ хөрөнгөд аль хэдийн бүртгэгдсэн.
    if exists (select 1 from public.crm2_property_media m
                where m.property_id = p_property and m.storage_path = v_path) then
      continue;
    end if;
    -- DB дахь зарын url-ийн query/fragment-гүй хэлбэр (RPC-ийн буцаасан url-тай ижил, ижил цагаан жагсаалт).
    v_url := null;
    select f.url into v_url
      from public.listing_photos lp
     cross join lateral (select public.crm2_listing_photo_url(lp.url) as url,      -- ШИНЭ
                                public.crm2_listing_photo_path(lp.url) as path) f  -- ШИНЭ
     where lp.listing_id = v_src
       and f.path is not null
       and (lp.url = v_item->>'public_url' or f.url = v_item->>'public_url'
            or (nullif(v_item->>'source_path', '') is not null and f.path = v_item->>'source_path'))
     order by lp.sort_order
     limit 1;
    if v_url is null then
      raise exception 'CRM: зураг энэ зарынх биш';
    end if;
    -- ШИНЭ: энэ зарын зураг энэ хөрөнгөд аль хэдийн хавсаргагдсан.
    if exists (select 1 from public.crm2_property_media m
                where m.property_id = p_property and m.source_public_url = v_url) then
      continue;
    end if;
    v_cover := coalesce((v_item->>'is_cover')::boolean, v_n = 0) and not v_has_cover;
    begin   -- ШИНЭ: зэрэг хавсаргалт (crm2_property_media_source_url_uq / storage_path unique)
      insert into public.crm2_property_media (property_id, kind, storage_path, sort_order, is_cover, source_public_url)
      values (p_property, 'image', v_path,
              coalesce((v_item->>'sort_order')::int, v_n),
              v_cover,
              v_url);
    exception
      when unique_violation then
        if exists (select 1 from public.crm2_property_media m
                    where m.property_id = p_property
                      and (m.source_public_url = v_url or m.storage_path = v_path)) then
          continue;
        end if;
        raise;
    end;
    v_has_cover := v_has_cover or v_cover;
    v_n := v_n + 1;
  end loop;
  perform public.crm2_rpc_end(v_flag);
  return v_n;
exception
  when others then
    if v_flag is not null then perform public.crm2_rpc_end(v_flag); end if;
    raise;
end $$;
revoke all on function public.crm2_attach_imported_media(uuid, jsonb) from public, anon;
grant execute on function public.crm2_attach_imported_media(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

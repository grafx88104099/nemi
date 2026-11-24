-- 20261124000600_crm2_publish_payload.sql
-- P12(1)+(3): CRM-ээс нийтэлсэн зар нийтийн хайлтын facet-аас алга болохгүй:
--   * type → нийтийн PROPERTY_TYPES нэр (одоо «Хувийн сууц», «Худалдаа, үйлчилгээ», «Гараж, агуулах», «Бусад» гэж
--     очдог тул «Хаус», «Худалдааны талбай», «Обьект» шүүлтүүрт ОРДОГГҮЙ — алдаа);
--   * listings.features (20261123000800-ийн толь) — crm2 онцлогоос буулгана (garage→parking, pets→pets_allowed);
--   * parking = бодит зогсоолын тоо (parking_spaces), байхгүй бол онцлогоос 0/1 (хуучин дүрэм);
--     parking_spaces = 0 бол 'parking'/'garage'-ийг онцлогоос хасна;
--   * rent_advance_months / rent_deposit_months (түрээс).
--   * crm2_publish_blockers: баталгаажаагүй нийтийн утга, property.min_images.
--   * Утасны дугаар (best effort — үнэ мэт тоог алгасна, бүх бичлэгийг барихгүй):
--     - карт дээрх бичвэрт (байршил, давуу тал…) байвал САНУУЛГА (crm2_publish_state/preview 'warnings'); зөвхөн
--       анхдагч гарчиг/тайлбараар ШИНЭ зар үүсгэх үед нийтлэхийг хориглоно;
--     - агентын бичсэн гарчиг/тайлбар (crm2_publish_property, crm2_update_listing_text) — хориглоно;
--     - эх зартай холбох үед түүний хэвээр үлдэх гарчиг/тайлбарыг НЭГ УДАА нууж, түүхэнд бичнэ (синк бичвэрт хүрэхгүй).
--   * crm2_publish_property(+p_link_listing, +p_replace_photos): «Миний зараас үүсгэсэн» ноорогийн эх зар идэвхтэй,
--     листлэгч агентынх, консьержийн удирдлагагүй бол ЗӨВХӨН түүнтэй холбогдоно (шинэ давхар зар үүсгэхгүй).
--     Эх зар өөр агентынх (жишээ нь хөрөнгийг дахин хуваарилсан) бол шинэ зар үүсгэнэ — нийтлэл гацахгүй.
--     Зарагдсан/түрээслэгдсэн (хаагдсан) эх зартай холбохгүй. Зургийг анхдагчаар хэвээр үлдээнэ.
--   * crm2_publish_preview(): холбохоос өмнөх ялгаа (гарчиг, тайлбар, link_mode, warnings) агентад.
-- Шинэ туслах функц: crm2_phone_pattern, crm2_has_phone, crm2_mask_phones, crm2_publish_confirm_keys,
--   crm2_publish_confirm_label, crm2_publish_phone_fields, crm2_source_link_mode.
-- Өөрчлөгдөх prod функц: crm2_listing_payload, crm2_sync_listing, crm2_publish_blockers, crm2_publish_state
--   (+'warnings'), crm2_update_listing_text (утасны шалгалт), crm2_publish_property (СИГНАТУР — DROP+CREATE;
--   хуучин 3 нэрлэсэн арг-тай дуудлага ажиллана), trigger crm2_properties_publish_sync (WHEN жагсаалт +3 багана).
-- Дахин apply хийхэд аюулгүй (5 арг-тай crm2_publish_property-г ч drop хийж дахин үүсгэнэ).
-- Регресс: одоо crm2-той холбогдсон зар 0 (prod 2026-11-24) — одоогийн нийтийн зарт нөлөөлөхгүй.
--   ListingForm-ийн зарууд энэ функцэд огт хамааралгүй. listings_features_parking триггер parking>0 үед 'parking'-ийг
--   өөрөө нэмдэг — давхардахгүй (толийн дараалал хадгалагдана).
--
-- DEPLOY: 20261124000100 (parking_spaces, unconfirmed, source_listing_id, rent баганууд)-ийн ДАРАА;
--   20261124000200 (property.min_images) байхгүй бол анхдагч 1 (одоогийн «зураггүй бол нийтлэхгүй»).
--   Prod: BEGIN … ROLLBACK dry-run → apply-migration.mjs (зөвхөн main session). Batch 2/3 кодоос ӨМНӨ.
--
-- Rollback (гараар):
--   crm2_listing_payload-ийг 20261114000200-аас, crm2_sync_listing/crm2_publish_blockers/crm2_publish_state-ийг
--   20261114000300-аас, crm2_update_listing_text-ийг 20261114000100-аас сэргээнэ; drop function public.crm2_publish_property(uuid, text, text, uuid, boolean) хийгээд 20261114000300-ийн
--   3 арг-тай crm2_publish_property-г дахин үүсгэж (revoke/grant-тай нь); drop function public.crm2_publish_preview(uuid);
--   триггер crm2_properties_publish_sync-ийг 20261114000300-ийн WHEN-ээр дахин үүсгэнэ; дараа нь
--   drop function public.crm2_source_link_mode(uuid), public.crm2_publish_phone_fields(uuid),
--   public.crm2_publish_confirm_label(text), public.crm2_publish_confirm_keys(),
--   public.crm2_mask_phones(text), public.crm2_has_phone(text), public.crm2_phone_pattern();
--   notify pgrst, 'reload schema'.

set local lock_timeout = '3s';

-- ── Туслах функцүүд ─────────────────────────────────────────────────────────
-- ШИНЭ: Монгол утасны дугаарын хэв (8 орон, 6–9-өөр эхэлнэ; +976, зай/зураас зөвшөөрнө). Best effort:
--   ард нь ₮/төг/сая байвал үнэ гэж алгасна; «9911.2233», «99 112 233» мэт бичлэгийг барихгүй.
-- lib/crm2/listing-text/phones.ts PHONE_PATTERN_SOURCE-тэй ИЖИЛ байх ёстой. Lookbehind ХЭРЭГЛЭХГҮЙ (iOS Safari
--   16.4-өөс өмнөх хувилбар lookbehind-гүй) — эхний бүлэг (^|[^0-9]) өмнөх тэмдэгтийг барих тул солихдоо
--   '\1' (JS: '$1')-ийг хадгална. Lookahead тусгаарлагчийг идэхгүй — «99112233,88112233» хоёулаа таарна.
create or replace function public.crm2_phone_pattern()
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  -- PHONE_PATTERN_SOURCE
  select '(^|[^0-9])(?:[+]?976[ -]?)?[6-9][0-9](?:[ -]?[0-9]{2}){3}(?![0-9])(?! ?(?:₮|[тТ]өг|[сС]ая))'::text;
$$;

-- ШИНЭ
create or replace function public.crm2_has_phone(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(p_text ~ public.crm2_phone_pattern(), false);
$$;

-- ШИНЭ
create or replace function public.crm2_mask_phones(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(p_text, public.crm2_phone_pattern(), '\1•••• ••••', 'g');
$$;

-- ШИНЭ: нийтлэхээс өмнө баталгаажуулах шаардлагатай түлхүүр (20261124000100-ийн жагсаалтаас notes ба 3 үүрэгт
-- агентыг хассан). lib/crm2/checklist.ts PUBLISH_CONFIRM_KEYS-тэй ИЖИЛ (дараалал ч мөн).
create or replace function public.crm2_publish_confirm_keys()
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  -- PUBLISH_CONFIRM_KEYS
  select array['category', 'property_type', 'project', 'district', 'location_text', 'lat', 'area_m2', 'rooms', 'floor',
               'building_floors', 'price', 'currency', 'price_period', 'price_basis', 'year_in_use', 'features',
               'parking_spaces', 'rent_advance_months', 'rent_deposit_months', 'advantages', 'available_from']::text[];
$$;

-- ШИНЭ: саадын мессежид харуулах нэр.
create or replace function public.crm2_publish_confirm_label(p_key text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case p_key
    when 'category' then 'ангилал'
    when 'property_type' then 'төрөл'
    when 'project' then 'төсөл'
    when 'district' then 'дүүрэг'
    when 'location_text' then 'байршил'
    when 'lat' then 'газрын зураг дээрх цэг'
    when 'area_m2' then 'талбай'
    when 'rooms' then 'өрөө'
    when 'floor' then 'давхар'
    when 'building_floors' then 'барилгын давхар'
    when 'price' then 'үнэ'
    when 'currency' then 'валют'
    when 'price_period' then 'үнийн хугацаа'
    when 'price_basis' then 'үнийн суурь'
    when 'year_in_use' then 'ашиглалтад орсон он'
    when 'features' then 'онцлог'
    when 'parking_spaces' then 'зогсоол'
    when 'rent_advance_months' then 'урьдчилгаа'
    when 'rent_deposit_months' then 'барьцаа'
    when 'advantages' then 'давуу тал'
    when 'available_from' then 'орох боломжтой огноо'
    else p_key
  end;
$$;

-- ШИНЭ: анхдагч гарчиг/тайлбарт орох карт дээрх бичвэрт утасны дугаартай талбаруудын НЭР (утгыг биш), эсвэл null.
create or replace function public.crm2_publish_phone_fields(p_property uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(t.label, ', ' order by t.ord)
    from public.crm2_properties p
   cross join lateral (values (1, 'Байршил', p.location_text),
                              (2, 'Давуу тал', p.advantages),
                              (3, 'Нөхцөл', p.condition),
                              (4, 'Цонхноос харагдах байдал', p.view_note),
                              (5, 'Боломжийн тайлбар', p.availability_note)) t(ord, label, val)
   where p.id = p_property
     and public.crm2_has_phone(t.val);
$$;

-- ШИНЭ: «Миний зараас үүсгэсэн» ноорогийн эх зартай холбох горим. crm2_publish_preview ба crm2_publish_property
-- хоёулаа үүнийг хэрэглэнэ (нэг дүрэм).
--   'link_only' — эх зар идэвхтэй, холбогдоогүй, листлэгч агентынх, консьержийн удирдлагагүй (шинэ зар хориотой);
--   'choice'    — дээрхтэй ижил, гэхдээ эх зар ноорог/түр зогсоосон/буцаасан (холбох эсвэл шинэ зар);
--   'new_only'  — эх заргүй, хөрөнгө аль хэдийн зартай, эх зар өөр хөрөнгөтэй холбогдсон, өөр агентынх (жишээ нь
--                 хөрөнгийг дахин хуваарилсан), консьержийн удирдлагад, эсвэл хаагдсан/хянагдаж буй.
create or replace function public.crm2_source_link_mode(p_property uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.listing_id is not null or p.source_listing_id is null or l.id is null then 'new_only'
           when public.crm2_listing_linked(l.id) then 'new_only'
           when not exists (select 1 from public.agents a
                             where a.id = l.agent_id and a.profile_id = p.listing_agent_id
                               and a.status = 'active') then 'new_only'
           when exists (select 1 from public.concierge_cases cc where cc.listing_id = l.id) then 'new_only'
           when l.status = 'active' then 'link_only'
           when l.status in ('draft', 'paused', 'withdrawn') then 'choice'
           else 'new_only'
         end
    from public.crm2_properties p
    left join public.listings l on l.id = p.source_listing_id
   where p.id = p_property;
$$;

revoke all on function public.crm2_publish_phone_fields(uuid) from public, anon, authenticated;
revoke all on function public.crm2_source_link_mode(uuid) from public, anon, authenticated;
grant execute on function public.crm2_publish_phone_fields(uuid) to service_role;
grant execute on function public.crm2_source_link_mode(uuid) to service_role;

revoke all on function public.crm2_phone_pattern() from public, anon;
revoke all on function public.crm2_has_phone(text) from public, anon;
revoke all on function public.crm2_mask_phones(text) from public, anon;
revoke all on function public.crm2_publish_confirm_keys() from public, anon;
revoke all on function public.crm2_publish_confirm_label(text) from public, anon;
grant execute on function public.crm2_phone_pattern() to authenticated, service_role;
grant execute on function public.crm2_has_phone(text) to authenticated, service_role;
grant execute on function public.crm2_mask_phones(text) to authenticated, service_role;
grant execute on function public.crm2_publish_confirm_keys() to authenticated, service_role;
grant execute on function public.crm2_publish_confirm_label(text) to authenticated, service_role;

-- ── Нийтийн зарын утга ─────────────────────────────────────────────────────
create or replace function public.crm2_listing_payload(p_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deal_type', case when p.category = 'sale' then 'sale' else 'rent' end,
    -- ШИНЭ: нийтийн шүүлтүүрийн нэрээр (lib/constants.ts PROPERTY_TYPES); бусад/тодорхойгүй бол 'Обьект'.
    'type', case p.property_type  -- ШИНЭ
              when 'apartment' then 'Орон сууц'  -- ШИНЭ
              when 'house' then 'Хаус'  -- ШИНЭ
              when 'office' then 'Оффис'  -- ШИНЭ
              when 'commercial' then 'Худалдааны талбай'  -- ШИНЭ
              when 'land' then 'Газар'  -- ШИНЭ
              when 'garage' then 'Обьект'  -- ШИНЭ
              when 'other' then 'Обьект'  -- ШИНЭ
              else 'Обьект'  -- ШИНЭ
            end,
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
       -- ШИНЭ: зогсоол 0 гэж заасан бол зогсоол/гаражийг нийтэд харуулахгүй.
       where not (p.parking_spaces is not distinct from 0 and f in ('parking', 'garage'))  -- ШИНЭ
    ), '[]'::jsonb),
    -- ШИНЭ: listings_features_chk толь, дараалал (lib/listing-features.ts FEATURE_KEYS).
    'features', to_jsonb(array(  -- ШИНЭ
      select t.k  -- ШИНЭ
        from unnest(array['furnished', 'parking', 'elevator', 'balcony', 'security', 'storage',  -- ШИНЭ
                          'kids_playground', 'pets_allowed']::text[]) with ordinality t(k, ord)  -- ШИНЭ
       where t.k = any (  -- ШИНЭ
               array(select case f when 'garage' then 'parking' when 'pets' then 'pets_allowed' else f end  -- ШИНЭ
                       from unnest(coalesce(p.features, '{}'::text[])) f)  -- ШИНЭ
               || case when coalesce(p.parking_spaces, 0) > 0 then array['parking'] else '{}'::text[] end)  -- ШИНЭ
         and not (t.k = 'parking' and p.parking_spaces is not distinct from 0)  -- ШИНЭ: зогсоол 0 → 'parking'/'garage' хасна
       order by t.ord)),  -- ШИНЭ
    -- ШИНЭ: бодит тоо; заагаагүй бол хуучин дүрэм (онцлогоос 0/1).
    'parking', coalesce(p.parking_spaces,  -- ШИНЭ
                        case when coalesce(p.features, '{}'::text[]) && array['parking', 'garage']::text[] then 1 else 0 end),  -- ШИНЭ
    'rent_advance_months', case when p.category <> 'sale' then p.rent_advance_months end,  -- ШИНЭ
    'rent_deposit_months', case when p.category <> 'sale' then p.rent_deposit_months end,  -- ШИНЭ
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

-- ── Нийтлэх саад ───────────────────────────────────────────────────────────
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
    -- listings-д үнийн хугацааны багана байхгүй: худалдах = нийт үнэ,
    -- түрээс = сарын үнэ. Өдрийн/нийт түрээсийг нийтлэвэл сар мэт харагдана.
    case when p.price_period is distinct from
              (case when p.category = 'sale' then 'total' else 'month' end)::public.crm2_price_period
         then case when p.category = 'sale'
                   then 'Худалдах зар нийт үнээр байна'
                   else 'Түрээсийн зар сарын үнээр байна (өдрийн/нийт үнийг нийтлэхгүй)' end end,
    case when coalesce(p.price_total, 0) <= 0 then 'Үнэ оруулаагүй байна' end,
    case when p.district is null then 'Дүүрэг сонгоогүй байна' end,
    case when coalesce(p.area_m2, 0) <= 0 then 'Талбай оруулаагүй байна' end,
    case when not public.crm2_property_has_valid_contract(p.id)
         then 'Хүчинтэй зуучлалын гэрээгүй байна' end,
    -- ШИНЭ: property.min_images (анхдагч 1 = одоогийн «зураггүй бол нийтлэхгүй»).
    case when img.n < img.min_n  -- ШИНЭ
         then case when img.n = 0 then 'Зураггүй хөрөнгийг нийтлэхгүй'  -- ШИНЭ
                   else 'Нийтлэхэд дор хаяж ' || img.min_n || ' зураг хэрэгтэй (одоо ' || img.n || ')' end end,  -- ШИНЭ
    case when not exists (select 1 from public.agents a
                           where a.profile_id = p.listing_agent_id and a.status = 'active')
         then 'Листлэгч агентын нийтийн бүртгэл идэвхгүй байна' end,  -- ШИНЭ
    -- ШИНЭ: автоматаар бөглөгдсөн нийтийн утгыг агент баталгаажуулаагүй.
    case when p.unconfirmed && public.crm2_publish_confirm_keys()  -- ШИНЭ
         then 'Баталгаажаагүй утга байна: ' || (  -- ШИНЭ
                select string_agg(public.crm2_publish_confirm_label(k.key), ', ' order by k.ord)  -- ШИНЭ
                  from unnest(public.crm2_publish_confirm_keys()) with ordinality k(key, ord)  -- ШИНЭ
                 where k.key = any (p.unconfirmed)) end  -- ШИНЭ
    -- Карт дээрх бичвэр дэх утасны дугаар энд БИШ: crm2_publish_state/preview-ийн 'warnings' (саад биш).
  ], null)
  from public.crm2_properties p
  -- ШИНЭ
  cross join lateral (  -- ШИНЭ
    select (select count(*) from public.crm2_property_media m  -- ШИНЭ
             where m.property_id = p.id and m.kind = 'image')::int as n,  -- ШИНЭ
           greatest(coalesce(public.crm2_setting_int('property.min_images', p.office_id), 1), 0) as min_n  -- ШИНЭ
  ) img  -- ШИНЭ
  where p.id = p_property;
$$;

-- ── Нийтлэх төлөв (prod-ын одоогийн тодорхойлолт + 'warnings') ─────────────
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
      -- ШИНЭ: саад биш сануулга (анхдагч бичвэрээр шинэ зар үүсгэх үед л нийтлэхийг хориглоно).
      'warnings', to_jsonb(array_remove(array[
        (select 'Нийтлэх бичвэрт утасны дугаар байна: ' || f
           from public.crm2_publish_phone_fields(p.id) f where f is not null)
      ], null)),
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
      -- Шинэ зураг нэмэгдсэн ЭСВЭЛ зард байгаа тоо CRM-ийнхтэй таарахгүй
      -- (CRM-ээс устгасан) бол шинэчлэх шаардлагатай.
      'media_stale', p.listing_id is not null and (
        exists (select 1 from public.crm2_property_media m
                 where m.property_id = p.id and m.kind = 'image'
                   and (p.media_synced_at is null or m.created_at > p.media_synced_at))
        or (select count(*) from public.listing_photos lp where lp.listing_id = p.listing_id)
           <> least((select count(*) from public.crm2_property_media m
                      where m.property_id = p.id and m.kind = 'image'), 30)),
      'default_title', public.crm2_default_listing_title(p.id),
      'default_description', public.crm2_default_listing_description(p.id)
    ) end
  from public.crm2_properties p
  left join public.listings l on l.id = p.listing_id
  where p.id = p_property;
$$;

-- ── Зарын бичвэр засах (prod-ын одоогийн тодорхойлолт + утасны шалгалт) ────
create or replace function public.crm2_update_listing_text(p_property uuid, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_title text := left(nullif(btrim(coalesce(p_title, '')), ''), 160);
  v_desc text := left(btrim(coalesce(p_description, '')), 4000);
  v_prev text := coalesce(current_setting('crm2.listing_rpc', true), '');
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ зарыг засах эрхгүй байна';
  end if;
  if v_title is null then
    raise exception 'CRM: зарын гарчиг хоосон байж болохгүй';
  end if;
  -- ШИНЭ: нийтийн гарчиг/тайлбарт утасны дугаар бичихгүй (crm2_publish_property-тэй ижил).
  if public.crm2_has_phone(v_title) or public.crm2_has_phone(v_desc) then
    raise exception 'CRM: гарчиг/тайлбарт утасны дугаар байна';
  end if;
  select listing_id into v_listing from public.crm2_properties where id = p_property;
  if v_listing is null then
    raise exception 'CRM: энэ хөрөнгө зар болоогүй байна';
  end if;
  perform set_config('crm2.listing_rpc', '1', true);
  update public.listings
     set title = v_title, description = nullif(v_desc, ''), updated_at = now()
   where id = v_listing;
  perform set_config('crm2.listing_rpc', v_prev, true);
end $$;

-- ── Синк ───────────────────────────────────────────────────────────────────
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
  v_live boolean;
  v_prev text := coalesce(current_setting('crm2.listing_rpc', true), '');
begin
  select listing_id, published_at into v_listing, v_published
    from public.crm2_properties where id = p_property;
  if v_listing is null then
    return;
  end if;
  v_f := public.crm2_listing_payload(p_property);

  -- Нийтэд харагдах эсэх: буцаагаагүй БА нийтлэх болзол хэвээр байх ёстой.
  -- Нийтэлсний дараа валют/үнийн хугацаа солигдох, гэрээ дуусах зэрэгт зар
  -- автоматаар буцна — буруу үнэ нийтэд үлдэхээс сэргийлнэ.
  v_live := v_published is not null
        and exists (select 1 from public.crm2_properties p
                     where p.id = p_property
                       and public.crm2_price_publishable(p.category, p.price_period, p.currency))
        and public.crm2_property_has_valid_contract(p_property);

  perform set_config('crm2.listing_rpc', '1', true);
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
    -- Гарчиг/тайлбарт синк ХҮРЭХГҮЙ (утасны нуулт зөвхөн холбох үед нэг удаа, түүхтэй — crm2_publish_property).
    -- ШИНЭ
    features = array(select jsonb_array_elements_text(v_f->'features')),  -- ШИНЭ
    rent_advance_months = nullif(v_f->>'rent_advance_months', '')::smallint,  -- ШИНЭ
    rent_deposit_months = nullif(v_f->>'rent_deposit_months', '')::smallint,  -- ШИНЭ
    parking = (v_f->>'parking')::int,
    verified = (v_f->>'verified')::boolean and v_live,
    -- Хариуцагч агент солигдвол зар дээрх холбоо барих хүн дагана. Шинэ агент
    -- нийтийн бүртгэлгүй бол хуучнаар нь үлдээнэ (зар эзэнгүй болохоос сэргийлнэ).
    agent_id = coalesce((
      select a.id from public.agents a
       where a.profile_id = (select p.listing_agent_id from public.crm2_properties p where p.id = p_property)
         and a.status = 'active' limit 1), l.agent_id),
    location = case when v_f->>'lat' is not null and v_f->>'lng' is not null
                    then ('SRID=4326;POINT(' || (v_f->>'lng') || ' ' || (v_f->>'lat') || ')')::geography
               end,
    status = case when not v_live then 'withdrawn'::public.listing_status
                  else (v_f->>'status')::public.listing_status end,
    updated_at = now()
  where l.id = v_listing;
  perform set_config('crm2.listing_rpc', v_prev, true);
end $$;

-- ── Нийтлэх ────────────────────────────────────────────────────────────────
drop function if exists public.crm2_publish_property(uuid, text, text);
drop function if exists public.crm2_publish_property(uuid, text, text, uuid, boolean);  -- ШИНЭ: дахин apply
create function public.crm2_publish_property(
  p_property uuid,
  p_title text default null,
  p_description text default null,
  p_link_listing uuid default null,  -- ШИНЭ
  p_replace_photos boolean default false  -- ШИНЭ
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_lprev text := coalesce(current_setting('crm2.listing_rpc', true), '');
  v_office uuid;
  v_agent uuid;
  v_listing uuid;
  v_source uuid;  -- ШИНЭ
  v_linked boolean := false;  -- ШИНЭ
  v_mode text;  -- ШИНЭ
  v_src record;  -- ШИНЭ
  v_phone_fields text;  -- ШИНЭ
  v_masked text[] := '{}';  -- ШИНЭ
  v_blockers text[];
  v_title text;
  v_desc text;
  v_f jsonb;
begin
  if not public.crm2_can_edit_property(p_property) then
    raise exception 'CRM: энэ хөрөнгийг нийтлэх эрхгүй байна';
  end if;

  select office_id, listing_id, source_listing_id into v_office, v_listing, v_source  -- ШИНЭ: source_listing_id
    from public.crm2_properties where id = p_property for update;
  if not found then
    raise exception 'CRM: хөрөнгө олдсонгүй';
  end if;

  -- ШИНЭ: гарчиг/тайлбарт утасны дугаар нийтлэхгүй.
  if public.crm2_has_phone(p_title) or public.crm2_has_phone(p_description) then  -- ШИНЭ
    raise exception 'CRM: гарчиг/тайлбарт утасны дугаар байна';  -- ШИНЭ
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

  -- ШИНЭ: эх зартай холбох горим (crm2_source_link_mode — preview-тэй ижил дүрэм). Эх зарын мөрийг түгжинэ.
  if v_listing is null and v_source is not null then  -- ШИНЭ
    perform 1 from public.listings where id = v_source for update;  -- ШИНЭ
  end if;
  v_mode := coalesce(public.crm2_source_link_mode(p_property), 'new_only');  -- ШИНЭ
  -- Эх зар идэвхтэй, листлэгч агентынх бол давхар шинэ зар үүсгэхгүй — зөвхөн түүнтэй холбоно.
  -- (Эх зар өөр агентынх / консьержийн удирдлагад бол 'new_only' — шинэ зар үүсгэнэ, гацахгүй.)
  if v_mode = 'link_only' and p_link_listing is distinct from v_source then  -- ШИНЭ
    raise exception 'CRM: эх зар идэвхтэй — түүнийг шинэчилнэ үү';  -- ШИНЭ
  end if;
  -- ШИНЭ: эх зартай холбох шалгалт.
  if p_link_listing is not null then  -- ШИНЭ
    if v_listing is not null then  -- ШИНЭ
      raise exception 'CRM: хөрөнгө аль хэдийн зартай холбогдсон';  -- ШИНЭ
    end if;
    if v_source is distinct from p_link_listing then  -- ШИНЭ
      raise exception 'CRM: зөвхөн энэ хөрөнгийг үүсгэсэн зартай холбоно';  -- ШИНЭ
    end if;
    select l.id, l.status, l.agent_id into v_src from public.listings l where l.id = p_link_listing;  -- ШИНЭ
    if not found then  -- ШИНЭ
      raise exception 'CRM: эх зар олдсонгүй';  -- ШИНЭ
    end if;
    if public.crm2_listing_linked(p_link_listing) then  -- ШИНЭ
      raise exception 'CRM: энэ зар өөр хөрөнгөтэй холбогдсон';  -- ШИНЭ
    end if;
    if v_src.agent_id is distinct from v_agent then  -- ШИНЭ
      raise exception 'CRM: зар листлэгч агентынх биш — шинэ зар үүсгэнэ үү';  -- ШИНЭ
    end if;
    if exists (select 1 from public.concierge_cases cc where cc.listing_id = p_link_listing) then  -- ШИНЭ
      raise exception 'CRM: зар консьержийн удирдлагад байгаа тул холбохгүй — шинэ зар үүсгэнэ үү';  -- ШИНЭ
    end if;
    if v_src.status in ('sold', 'rented') then  -- ШИНЭ
      raise exception 'CRM: хаагдсан (зарагдсан/түрээслэгдсэн) зартай холбохгүй — шинэ зар үүсгэнэ үү';  -- ШИНЭ
    end if;
    if v_mode not in ('link_only', 'choice') then  -- ШИНЭ
      raise exception 'CRM: энэ зартай холбох боломжгүй — шинэ зар үүсгэнэ үү';  -- ШИНЭ
    end if;
  end if;

  v_f := public.crm2_listing_payload(p_property);
  v_title := left(nullif(btrim(coalesce(p_title, '')), ''), 160);
  v_desc := left(nullif(btrim(coalesce(p_description, '')), ''), 4000);

  -- ШИНЭ: анхдагч гарчиг/тайлбараар ШИНЭ зар үүсгэх үед л карт дээрх бичвэрийн утасны дугаар саад болно
  -- (дахин нийтлэх, холбох, агент өөрөө бичсэн бичвэр — энэ шалгалтад хамаарахгүй).
  if v_listing is null and p_link_listing is null  -- ШИНЭ
     and ((v_title is null and public.crm2_has_phone(public.crm2_default_listing_title(p_property)))  -- ШИНЭ
          or (v_desc is null and public.crm2_has_phone(public.crm2_default_listing_description(p_property)))) then  -- ШИНЭ
    v_phone_fields := public.crm2_publish_phone_fields(p_property);  -- ШИНЭ
    raise exception 'CRM: нийтлэх боломжгүй — Нийтлэх бичвэрт утасны дугаар байна%',  -- ШИНЭ
      coalesce(': ' || v_phone_fields, '');  -- ШИНЭ
  end if;

  v_prev := public.crm2_rpc_begin();
  perform set_config('crm2.listing_rpc', '1', true);

  -- ШИНЭ: эх зартай холбох салбар.
  if v_listing is null and p_link_listing is not null then  -- ШИНЭ
    -- Хэвээр үлдэх эх зарын гарчиг/тайлбар дахь утасны дугаарыг НЭГ УДАА нууна (түүхэнд талбарын нэрээр).
    select array_remove(array[  -- ШИНЭ
             case when v_title is null and public.crm2_has_phone(l.title) then 'title' end,  -- ШИНЭ
             case when v_desc is null and public.crm2_has_phone(l.description) then 'description' end], null)  -- ШИНЭ
      into v_masked  -- ШИНЭ
      from public.listings l where l.id = p_link_listing;  -- ШИНЭ
    update public.listings  -- ШИНЭ
       set agent_id = v_agent,  -- ШИНЭ
           title = coalesce(v_title, public.crm2_mask_phones(title)),  -- ШИНЭ
           description = coalesce(v_desc, public.crm2_mask_phones(description))  -- ШИНЭ
     where id = p_link_listing;  -- ШИНЭ
    v_listing := p_link_listing;  -- ШИНЭ
    v_linked := true;  -- ШИНЭ
  elsif v_listing is null then  -- ШИНЭ
    insert into public.listings (
      agent_id, title, description, type, district, rooms, area, floor,
      price, price_per_m2, year, parking, amenities,  -- ШИНЭ
      features, rent_advance_months, rent_deposit_months,  -- ШИНЭ
      deal_type, verified, location, status  -- ШИНЭ
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
      array(select jsonb_array_elements_text(v_f->'features')),  -- ШИНЭ
      nullif(v_f->>'rent_advance_months', '')::smallint,  -- ШИНЭ
      nullif(v_f->>'rent_deposit_months', '')::smallint,  -- ШИНЭ
      (v_f->>'deal_type')::public.deal_type,
      (v_f->>'verified')::boolean,
      case when v_f->>'lat' is not null and v_f->>'lng' is not null
           then ('SRID=4326;POINT(' || (v_f->>'lng') || ' ' || (v_f->>'lat') || ')')::geography end,
      'draft'::public.listing_status
    ) returning id into v_listing;
  else
    update public.listings set
      agent_id = v_agent,
      title = coalesce(v_title, title),
      description = coalesce(v_desc, description)
    where id = v_listing;
  end if;

  update public.crm2_properties
     set listing_id = v_listing,
         published_at = now(),
         published_by = auth.uid(),  -- ШИНЭ
         -- ШИНЭ: холбосон зарын (аль хэдийн тамгатай) зургийг хэвээр үлдээвэл «шинэчлэх шаардлагатай» гэж тооцохгүй.
         media_synced_at = case when v_linked and not coalesce(p_replace_photos, false) then now() else media_synced_at end  -- ШИНЭ
   where id = p_property;

  perform public.crm2_sync_listing(p_property);
  perform set_config('crm2.listing_rpc', v_lprev, true);
  perform public.crm2_rpc_end(v_prev);

  perform public.crm2_log(v_office, 'property', p_property, 'publish', 'listing_id',
                          null, to_jsonb(v_listing::text), p_property);
  -- ШИНЭ
  if v_linked then  -- ШИНЭ
    perform public.crm2_log(v_office, 'property', p_property, 'link_listing', 'listing_id',  -- ШИНЭ
                            null, to_jsonb(v_listing::text), p_property);  -- ШИНЭ
    -- Хуучин бичвэрийг (утастай) түүхэнд хадгалахгүй — зөвхөн аль талбарыг нуусныг.
    if cardinality(v_masked) > 0 then  -- ШИНЭ
      perform public.crm2_log(v_office, 'property', p_property, 'mask_listing_phones', 'listing_text',  -- ШИНЭ
                              null, to_jsonb(v_masked), p_property);  -- ШИНЭ
    end if;
  end if;

  return jsonb_build_object(
    'listing_id', v_listing,
    'linked', v_linked,  -- ШИНЭ
    'needs_photos', not exists (select 1 from public.listing_photos lp where lp.listing_id = v_listing)
  );
exception
  when others then
    if v_prev is not null then perform public.crm2_rpc_end(v_prev); end if;
    perform set_config('crm2.listing_rpc', v_lprev, true);
    raise;
end $$;
revoke all on function public.crm2_publish_property(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.crm2_publish_property(uuid, text, text, uuid, boolean) to authenticated, service_role;

-- ── Холбохоос өмнөх ялгаа (read-only) ─────────────────────────────────────
-- ШИНЭ. Эзний мэдээлэл огт орохгүй; эх зарын гарчиг/тайлбарыг холбосны дараах (утас нуусан) хэлбэрээр.
-- link_mode: crm2_source_link_mode (link_only / choice / new_only). warnings: crm2_publish_state-тэй ижил.
create or replace function public.crm2_publish_preview(p_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.crm2_can_edit_property(p_property) then null else
    jsonb_build_object(
      'payload', public.crm2_listing_payload(p.id),
      'title', coalesce(public.crm2_default_listing_title(p.id), 'Үл хөдлөх хөрөнгө'),
      'description', public.crm2_default_listing_description(p.id),
      'link_mode', m.mode,
      'warnings', to_jsonb(array_remove(array[
        (select 'Нийтлэх бичвэрт утасны дугаар байна: ' || f
           from public.crm2_publish_phone_fields(p.id) f where f is not null)
      ], null)),
      'link_candidate', case when m.mode in ('link_only', 'choice') then (
        select jsonb_build_object(
                 'listing_id', l.id,
                 'title', public.crm2_mask_phones(l.title),
                 'description', public.crm2_mask_phones(l.description),
                 'status', l.status, 'type', l.type, 'district', l.district,
                 'rooms', l.rooms, 'area', l.area, 'floor', l.floor, 'price', l.price, 'year', l.year,
                 'parking', l.parking, 'features', to_jsonb(l.features),
                 'rent_advance_months', l.rent_advance_months, 'rent_deposit_months', l.rent_deposit_months,
                 'has_location', l.location is not null,
                 'photo_count', (select count(*) from public.listing_photos lp where lp.listing_id = l.id),
                 'owned_by_listing_agent', src.owned,
                 'created_at', l.created_at)
          from public.listings l
         where l.id = p.source_listing_id) end
    ) end
  from public.crm2_properties p
  left join lateral (
    select exists (select 1 from public.agents a
                    where a.id = l.agent_id and a.profile_id = p.listing_agent_id
                      and a.status = 'active') as owned
      from public.listings l
     where l.id = p.source_listing_id
  ) src on true
  cross join lateral (
    select coalesce(public.crm2_source_link_mode(p.id), 'new_only') as mode
  ) m
  where p.id = p_property;
$$;
revoke all on function public.crm2_publish_preview(uuid) from public, anon;
grant execute on function public.crm2_publish_preview(uuid) to authenticated, service_role;

-- ── Синкийн триггер ────────────────────────────────────────────────────────
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
     or old.currency is distinct from new.currency
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
     or old.lng is distinct from new.lng
     or old.listing_agent_id is distinct from new.listing_agent_id
     or old.brokerage_end_date is distinct from new.brokerage_end_date
     -- ШИНЭ
     or old.parking_spaces is distinct from new.parking_spaces
     or old.rent_advance_months is distinct from new.rent_advance_months
     or old.rent_deposit_months is distinct from new.rent_deposit_months))
  execute function public.crm2_properties_publish_sync();

notify pgrst, 'reload schema';

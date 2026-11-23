-- Facets («Нарлаг хот» redesign): listings.features (хяналттай толь) + heuristic backfill
-- + parking→features триггер + listing_facets() RPC (SECURITY INVOKER) + listings_map_search шинэ параметрүүд.
--
-- DEPLOY: энэ миграцийг кодоос ӨМНӨ хэрэглэнэ (createListing/updateListing `features` бичдэг,
--   ListingsMap p_districts… илгээдэг — миграцгүй бол PGRST204/PGRST202).
--
-- Толь (lib/listing-features.ts FEATURE_KEYS-тэй ЯГ ижил дараалал; vitest parity тест энэ файлыг уншина):
--   furnished, parking, elevator, balcony, security, storage, kids_playground, pets_allowed
-- Шүүлтийн семантик lib/listing-filters.ts applyListingFilters-тэй ижил:
--   q (p_q_groups), deal, districts (OR), type, rooms (>= N), price/area муж, posted,
--   features (бүгд, @>), new_build (year >= УБ-ын он − 5), adv1 (rent & урьдчилгаа <= 1 сар),
--   no_deposit (rent & барьцаа = 0), loan8 (sale & 'Орон сууц' & price <= 357 000 000 —
--   LOAN8_MAX_PRICE = 250 сая / (1 − 30%), «тооцоолол»), owner_only (agent_id IS NULL).
--
-- Backfill (features = '{}' мөрүүд) — 20261123000300-ийн хэв маяг, дагалдах үйлдэлгүй:
--  * UPDATE нь ЗӨВХӨН features-ийг SET хийнэ (prod-д 9 триггер шалгасан):
--      - listings_aggregates (UPDATE OF status, agent_id) ажиллахгүй;
--      - concierge_terms_invalidate: price/terms/status/rooms/district/amenities/agent_id хэвээр → no-op;
--      - listings_owner_notify: төлөв хэвээр → мэдэгдэлгүй;
--      - listings_owner_guard: auth.uid() IS NULL → шууд return;
--      - listings_search_text: ижил утга; listings_set_closed_at: closed_at хэвээр.
--  * listings_updated_at-ийг ЭНЭ транзакц дотор л унтраана. apply-migration.mjs BEGIN…COMMIT.
--  * crm2.listing_rpc / nemi.concierge_write GUC тойролт транзакцын түвшинд, UPDATE-ийн дараа ШУУД хаана.
--  * Эх сурвалж: amenities + description (lower) + parking багана. Ө/Ү нь [а-я]-д орохгүй → [[:alpha:]].
--    Үгүйсгэл: «хагас тавилга», «…гүй», «… байхгүй»; «харуулна/харуулах/харуулж/харуулсан» (үйл үг) хасна.
--    pets_allowed-ийг heuristic-аар бөглөхгүй (зөвхөн маягтаар).
--  * Prod dry-run v2 (2026-11-23, идэвхтэй 133): parking 45, furnished 19, security 17, elevator 9,
--    balcony 7, kids_playground 7, storage 4, pets_allowed 0.
--
-- Rollback (гараар): drop trigger listings_features_parking on public.listings;
--   drop function public.listings_features_from_parking();
--   drop function public.listing_facets(text, text[], text, int, bigint, bigint, numeric, numeric, jsonb, int,
--     text[], boolean, boolean, boolean, boolean, boolean, boolean);
--   drop function public.listings_map_search(<21 арг>); 20261123000300-ийн §7-г дахин ажиллуулах;
--   drop index listings_features_gin; alter table public.listings drop constraint listings_features_chk,
--   drop column features.

set local lock_timeout = '3s';

-- 1. Багана + толь + индекс.
alter table public.listings
  add column if not exists features text[] not null default '{}'::text[];

alter table public.listings drop constraint if exists listings_features_chk;
alter table public.listings
  add constraint listings_features_chk check (
    features <@ array['furnished','parking','elevator','balcony','security','storage','kids_playground','pets_allowed']::text[]
    and cardinality(features) <= 8
  );

comment on column public.listings.features is
  'Facets: хяналттай онцлогийн толь (lib/listing-features.ts). ListingForm бичнэ; parking > 0 → parking (триггер); 20261123000800 heuristic backfill.';

create index if not exists listings_features_gin on public.listings using gin (features);

-- 2. Backfill.
alter table public.listings disable trigger listings_updated_at;
do $$
begin
  perform set_config('crm2.listing_rpc', '1', true);
  perform set_config('nemi.concierge_write', 'on', true);

  with src as (
    select l.id, l.parking,
           lower(coalesce(array_to_string(l.amenities, ' | '), '') || ' | ' || coalesce(l.description, '')) as t
      from public.listings l
     where l.features = '{}'::text[]
  ), guess as (
    select s.id, array_remove(array[
      case when s.t ~ '(бүрэн|бүрэг)\s*тавилга|(?<!тогооны )(?<!тогоо )тавилгатай|furnished'
            and s.t !~ 'хагас\s*тавилга|тавилга(гүй|[[:alpha:]]*\s+байхгүй)'
           then 'furnished' end,
      case when coalesce(s.parking, 0) > 0
             or (s.t ~ 'зогсоол|гараж|граж|parking|zogsool'
                 and s.t !~ '(зогсоол|гараж|граж)(гүй|[[:alpha:]]*\s+байхгүй)')
           then 'parking' end,
      case when s.t ~ 'лифт|elevator' and s.t !~ 'лифт(гүй|[[:alpha:]]*\s+байхгүй)' then 'elevator' end,
      case when s.t ~ 'тагт|balcony' and s.t !~ 'тагт(гүй|[[:alpha:]]*\s+байхгүй)' then 'balcony' end,
      case when s.t ~ 'харуул(?!н|ж|ах|сан|даг)|камер|cctv|security' then 'security' end,
      case when s.t ~ 'агуулах|подвал|storage'
            and s.t !~ '(агуулах|подвал)(гүй|[[:alpha:]]*\s+байхгүй)' then 'storage' end,
      case when s.t ~ '(тоглоомын|хүүхдийн)\s+талбай|playground' then 'kids_playground' end
    ]::text[], null) as f
      from src s
  )
  update public.listings l
     set features = g.f
    from guess g
   where l.id = g.id
     and cardinality(g.f) > 0;

  perform set_config('crm2.listing_rpc', '', true);
  perform set_config('nemi.concierge_write', 'off', true);
end $$;
alter table public.listings enable trigger listings_updated_at;

-- 2b. Зогсоолын нэг үнэний эх: parking > 0 → features-д 'parking' (ListingForm, owner, CRM2 publish — бүх зам).
--     BEFORE триггерүүд нэрийн дарааллаар: concierge_listing_guard, crm2_listings_lock, listings_features_parking,
--     listings_owner_guard (to_jsonb diff нь энэ өөрчлөлтийг харна) …; backfill-ийн ДАРАА үүсгэнэ.
create or replace function public.listings_features_from_parking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.parking, 0) > 0 and not ('parking' = any (coalesce(new.features, '{}'::text[]))) then
    new.features := array_append(coalesce(new.features, '{}'::text[]), 'parking');
  end if;
  return new;
end;
$$;

drop trigger if exists listings_features_parking on public.listings;
create trigger listings_features_parking
  before insert or update of parking, features on public.listings
  for each row execute function public.listings_features_from_parking();

-- 3. Facet тоо (SECURITY INVOKER → дуудагчийн RLS; anon = идэвхтэй, түдгэлзээгүй оффисын зар).
--      deal / districts / type / rooms → ӨӨРИЙН бүлгийн шүүлтийг хасна;
--      features / flags (AND бүлэг)    → одоогийн шүүлт ∩ утга; сонгосон = total.
--    p_has_location = true → /map: байршилтай + түдгэлзээгүй оффис (listings_map_search-тэй ижил дүрэм,
--    нэвтэрсэн менежерт ч пинийн тоотой тэнцүү). «Энэ хавьд (4км)» горимд тоо хотын хэмжээнд хэвээр.
--    Буруу p_q_groups / хэт урт массив → бүх тоо 0.
create or replace function public.listing_facets(
  p_deal         text    default null,
  p_districts    text[]  default null,
  p_type         text    default null,
  p_rooms        int     default null,
  p_min_price    bigint  default null,
  p_max_price    bigint  default null,
  p_min_area     numeric default null,
  p_max_area     numeric default null,
  p_q_groups     jsonb   default null,
  p_posted       int     default null,
  p_features     text[]  default null,
  p_new_build    boolean default false,
  p_adv1         boolean default false,
  p_no_deposit   boolean default false,
  p_loan8        boolean default false,
  p_owner_only   boolean default false,
  p_has_location boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with v as materialized (
    select (case
              when p_q_groups is null then true
              when jsonb_typeof(p_q_groups) <> 'array' then false
              when jsonb_array_length(p_q_groups) > 6 then false
              else not exists (
                select 1
                  from jsonb_array_elements(p_q_groups) e(grp)
                 where case
                         when jsonb_typeof(e.grp) <> 'array' then true
                         when jsonb_array_length(e.grp) > 8 then true
                         else exists (
                           select 1 from jsonb_array_elements(e.grp) x(pat)
                            where case when jsonb_typeof(x.pat) <> 'string' then true
                                       else char_length(x.pat #>> '{}') > 80
                                            or (x.pat #>> '{}') ~ '(^|[^\\])(\\\\)*\\$' end)
                       end)
            end)
           and coalesce(cardinality(p_districts), 0) <= 12
           and coalesce(cardinality(p_features), 0) <= 8 as ok
  ),
  g as materialized (
    select array_agg(x.pat) as pats
      from v
     cross join lateral jsonb_array_elements(
             case when v.ok and p_q_groups is not null then p_q_groups else '[]'::jsonb end
           ) with ordinality e(grp, gi)
     cross join lateral jsonb_array_elements_text(e.grp) x(pat)
     group by e.gi
  ),
  y as (
    select extract(year from (now() at time zone 'Asia/Ulaanbaatar'))::int - 5 as new_from
  ),
  b as materialized (
    select l.deal_type::text as deal, l.district, l.type, l.rooms, l.features,
           coalesce(l.year >= y.new_from, false)                                         as f_new,
           (l.deal_type = 'rent' and coalesce(l.rent_advance_months <= 1, false))        as f_adv1,
           (l.deal_type = 'rent' and coalesce(l.rent_deposit_months = 0, false))         as f_nodep,
           (l.deal_type = 'sale' and l.type = 'Орон сууц'
              and coalesce(l.price <= 357000000, false))                                 as f_loan8,
           (l.agent_id is null)                                                          as f_owner,
           (p_deal is null or l.deal_type::text = p_deal)                                as m_deal,
           (coalesce(cardinality(p_districts), 0) = 0 or l.district = any (p_districts)) as m_district,
           (p_type is null or l.type = p_type)                                           as m_type,
           (p_rooms is null or l.rooms >= p_rooms)                                       as m_rooms
      from public.listings l
     cross join v
     cross join y
     where v.ok
       and l.status = 'active'
       and (not coalesce(p_has_location, false)
            or (l.location is not null and not public.agent_office_suspended(l.agent_id)))
       and (p_min_price is null or l.price >= p_min_price)
       and (p_max_price is null or l.price <= p_max_price)
       and (p_min_area is null or l.area >= p_min_area)
       and (p_max_area is null or l.area <= p_max_area)
       and not exists (select 1 from g where not (coalesce(l.search_text, '') like any (g.pats)))
       and (p_posted is null or l.created_at >= now() - make_interval(days => least(greatest(p_posted, 0), 3650)))
       and (coalesce(cardinality(p_features), 0) = 0 or l.features @> p_features)
       and (not coalesce(p_new_build, false) or coalesce(l.year >= y.new_from, false))
       and (not coalesce(p_adv1, false)
            or (l.deal_type = 'rent' and coalesce(l.rent_advance_months <= 1, false)))
       and (not coalesce(p_no_deposit, false)
            or (l.deal_type = 'rent' and coalesce(l.rent_deposit_months = 0, false)))
       and (not coalesce(p_loan8, false)
            or (l.deal_type = 'sale' and l.type = 'Орон сууц' and coalesce(l.price <= 357000000, false)))
       and (not coalesce(p_owner_only, false) or l.agent_id is null)
  )
  select jsonb_build_object(
    'total',    (select count(*) from b where m_deal and m_district and m_type and m_rooms),
    'new_from', (select new_from from y),
    'deal', coalesce((select jsonb_object_agg(s.deal, s.n) from (
               select deal, count(*) n from b where m_district and m_type and m_rooms group by deal) s), '{}'::jsonb),
    'district', coalesce((select jsonb_object_agg(s.district, s.n) from (
               select district, count(*) n from b
                where m_deal and m_type and m_rooms and district is not null group by district) s), '{}'::jsonb),
    'type', coalesce((select jsonb_object_agg(s.type, s.n) from (
               select type, count(*) n from b
                where m_deal and m_district and m_rooms and type is not null group by type) s), '{}'::jsonb),
    'rooms', (select jsonb_build_object(
                 '1', count(*) filter (where rooms >= 1), '2', count(*) filter (where rooms >= 2),
                 '3', count(*) filter (where rooms >= 3), '4', count(*) filter (where rooms >= 4))
                from b where m_deal and m_district and m_type),
    'features', (select coalesce(jsonb_object_agg(k.key, (
                    select count(*) from b
                     where m_deal and m_district and m_type and m_rooms and k.key = any (b.features))), '{}'::jsonb)
                   from unnest(array['furnished','parking','elevator','balcony','security','storage','kids_playground','pets_allowed']::text[]) as k(key)),
    'flags', (select jsonb_build_object(
                 'newBuild',  count(*) filter (where f_new),
                 'adv1',      count(*) filter (where f_adv1),
                 'noDeposit', count(*) filter (where f_nodep),
                 'loan8',     count(*) filter (where f_loan8),
                 'ownerOnly', count(*) filter (where f_owner))
                from b where m_deal and m_district and m_type and m_rooms)
  );
$$;

revoke all on function public.listing_facets(text, text[], text, int, bigint, bigint, numeric, numeric, jsonb, int, text[], boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.listing_facets(text, text[], text, int, bigint, bigint, numeric, numeric, jsonb, int, text[], boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated, service_role;

-- 4. Газрын зураг: ижил шинэ параметрүүд. Overload үүсгэхгүйн тулд 14 аргументтайг устгана
--    (PostgREST нэрлэсэн аргумент → хуучин клиент шинэд таарна; шинэ клиент зөвхөн тохируулсан түлхүүрээ илгээнэ).
drop function if exists public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision, jsonb);

create or replace function public.listings_map_search(
  p_deal       text    default null,
  p_district   text    default null,
  p_type       text    default null,
  p_rooms      int     default null,
  p_min_price  bigint  default null,
  p_max_price  bigint  default null,
  p_min_area   numeric default null,
  p_max_area   numeric default null,
  p_q          text    default null,
  p_posted     int     default null,
  p_lng        double precision default null,
  p_lat        double precision default null,
  p_m          double precision default null,
  p_q_groups   jsonb   default null,
  p_districts  text[]  default null,
  p_features   text[]  default null,
  p_new_build  boolean default false,
  p_adv1       boolean default false,
  p_no_deposit boolean default false,
  p_loan8      boolean default false,
  p_owner_only boolean default false
)
returns table (
  id uuid, title text, price bigint, district text, deal_type text,
  rooms int, area numeric, photo text, lng double precision, lat double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with v as materialized (
    select (case
              when p_q_groups is null then true
              when jsonb_typeof(p_q_groups) <> 'array' then false
              when jsonb_array_length(p_q_groups) > 6 then false
              else not exists (
                select 1
                  from jsonb_array_elements(p_q_groups) e(grp)
                 where case
                         when jsonb_typeof(e.grp) <> 'array' then true
                         when jsonb_array_length(e.grp) > 8 then true
                         else exists (
                           select 1 from jsonb_array_elements(e.grp) x(pat)
                            where case when jsonb_typeof(x.pat) <> 'string' then true
                                       else char_length(x.pat #>> '{}') > 80
                                            or (x.pat #>> '{}') ~ '(^|[^\\])(\\\\)*\\$' end)
                       end)
            end)
           and coalesce(cardinality(p_districts), 0) <= 12
           and coalesce(cardinality(p_features), 0) <= 8 as ok
  ),
  g as materialized (
    select array_agg(x.pat) as pats
      from v
     cross join lateral jsonb_array_elements(
             case when v.ok and p_q_groups is not null then p_q_groups else '[]'::jsonb end
           ) with ordinality e(grp, gi)
     cross join lateral jsonb_array_elements_text(e.grp) x(pat)
     group by e.gi
  ),
  y as (
    select extract(year from (now() at time zone 'Asia/Ulaanbaatar'))::int - 5 as new_from
  )
  select l.id, l.title, l.price, l.district, l.deal_type::text,
         l.rooms, l.area, l.photo,
         ST_X(l.location::geometry), ST_Y(l.location::geometry)
    from public.listings l
    cross join v
    cross join y
    left join public.agents ag on ag.id = l.agent_id
    left join public.offices o on o.id = ag.office_id
   where v.ok
     and l.status = 'active'
     and l.location is not null
     and o.suspended_at is null
     and (p_deal is null or l.deal_type::text = p_deal)
     and (p_district is null or l.district = p_district)
     and (coalesce(cardinality(p_districts), 0) = 0 or l.district = any (p_districts))
     and (p_type is null or l.type = p_type)
     and (p_rooms is null or l.rooms >= p_rooms)
     and (p_min_price is null or l.price >= p_min_price)
     and (p_max_price is null or l.price <= p_max_price)
     and (p_min_area is null or l.area >= p_min_area)
     and (p_max_area is null or l.area <= p_max_area)
     and (p_q_groups is not null or p_q is null
          or l.title ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and not exists (select 1 from g where not (coalesce(l.search_text, '') like any (g.pats)))
     and (p_posted is null or l.created_at >= now() - make_interval(days => least(greatest(p_posted, 0), 3650)))
     and (coalesce(cardinality(p_features), 0) = 0 or l.features @> p_features)
     and (not coalesce(p_new_build, false) or coalesce(l.year >= y.new_from, false))
     and (not coalesce(p_adv1, false)
          or (l.deal_type = 'rent' and coalesce(l.rent_advance_months <= 1, false)))
     and (not coalesce(p_no_deposit, false)
          or (l.deal_type = 'rent' and coalesce(l.rent_deposit_months = 0, false)))
     and (not coalesce(p_loan8, false)
          or (l.deal_type = 'sale' and l.type = 'Орон сууц' and coalesce(l.price <= 357000000, false)))
     and (not coalesce(p_owner_only, false) or l.agent_id is null)
     and (p_lng is null or p_lat is null or p_m is null
          or ST_DWithin(l.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, least(p_m, 50000)))
   order by l.created_at desc
   limit 2000;
$$;

revoke all on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision, jsonb, text[], text[], boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision, jsonb, text[], text[], boolean, boolean, boolean, boolean, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

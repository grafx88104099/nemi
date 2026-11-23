-- R08a ухаалаг хайлт (Stage 1): listings.search_text — латин→кирилл нугалсан,
-- ЗӨВХӨН нийтийн талбараас бүтсэн хайлтын мөр + газрын зургийн RPC-д p_q_groups.
--
-- Агуулга: title (+зураасгүй хэлбэр), district (+зайтай хэлбэр, товчлол),
-- type (+ижил утга), гүйлгээний үг, «N өрөө», description-ийн эхний 4000 тэмдэгт.
-- ХЭЗЭЭ Ч орохгүй: owner_phone, owner_name, review_note, ai_note, CRM-ийн талбар.
-- search_fold / listings_build_search_text-ийг өөрчилбөл lib/search/fold.ts ба
-- fold-cases.json-ийг ХАМТ өөрчил (TS толь нь яг ижил үр дүн өгөх ёстой).
--
-- Prod-д (SELECT-ээр) шалгасан:
--  * pg_trgm нь public схемд; listings-ийн эзэн postgres; listings дээр баганын
--    түвшний ACL байхгүй (хүснэгтийн grant шинэ баганад шууд хамаарна).
--  * listings дээрх триггерүүд (нэрийн дарааллаар ажиллана):
--      BEFORE: concierge_listing_guard, crm2_listings_lock, listings_owner_guard,
--              [listings_search_text], (listings_set_closed_at — 000200), listings_updated_at
--      AFTER : concierge_terms_invalidate, listings_aggregates (UPDATE OF status, agent_id),
--              listings_owner_notify
--    Шинэ триггер хамгаалалтуудын ДАРАА ажиллах тул тэд search_text-ийн өөрчлөлтийг
--    хэзээ ч «агуулга өөрчлөгдсөн» гэж харахгүй (owner → review, concierge 42501 гэх мэт).
--
-- Backfill (одоо байгаа 139 мөр) — дагалдах үйлдэлгүйгээр:
--  * UPDATE нь ЗӨВХӨН search_text-ийг SET хийнэ →
--      - listings_aggregates (UPDATE OF status, agent_id) огт ажиллахгүй;
--      - concierge_terms_invalidate: үнэ/төлөв/өрөө... өөрчлөгдөөгүй → юу ч хийхгүй;
--      - listings_owner_notify: төлөв өөрчлөгдөөгүй → мэдэгдэл үүсэхгүй;
--      - listings_owner_guard: auth.uid() IS NULL (миграцийн холболт) → шууд return;
--        мөн аль ч тохиолдолд статусыг review болгохгүй.
--  * listings_updated_at-ийг ЭНЭ транзакц дотор л унтраана (updated_at хөдлөхгүй).
--    ALTER TABLE ... DISABLE TRIGGER нь транзакцын дотор; ADD COLUMN-ийн ACCESS EXCLUSIVE
--    түгжээ commit хүртэл барьдаг тул өөр бичигч энэ хооронд орж ирэхгүй, алдаа гарвал
--    бүгд буцна (apply-migration.mjs нь BEGIN…COMMIT дотор ажиллуулна).
--  * crm2_listings_lock (CRM-тэй холбоотой зар) ба concierge_guard_managed (concierge зар)
--    нь search_text-ийн өөрчлөлтийг ч хориглох тул тэдний албан ёсны тойрох GUC-ийг
--    (crm2.listing_rpc='1', nemi.concierge_write='on') транзакцын түвшинд тавиад, UPDATE-ийн
--    дараа ШУУД буцааж хаана — миграцийн үлдсэн хэсэг/дараагийн бичилтүүд хамгаалалттай.
--
-- Эрх: search_fold / listings_build_search_text-ийг PUBLIC/anon/authenticated-аас хасна
-- (апп RPC-ээр дууддаггүй; TS толь ашигладаг). Триггер функц нь SECURITY DEFINER тул
-- аль ч бичигч (anon/authenticated/service_role/definer RPC) туслах функцийг эзнийхээ
-- эрхээр дуудна — бичих зам эрхийн дутагдлаар унахгүй.

set local lock_timeout = '3s';

-- 1. Нугалалт (IMMUTABLE). unaccent нь STABLE тул NFKD + нийлмэл тэмдэг арилгах,
--    дахин lower («№»→«no»). й→и, ё→е нь NFKD-ээр задарч тэмдэг нь арилна.
create or replace function public.search_fold(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(replace(
    regexp_replace(
     regexp_replace(
      regexp_replace(
       regexp_replace(
        regexp_replace(
         regexp_replace(
          replace(
           regexp_replace(
            regexp_replace(
             translate(
              replace(replace(replace(replace(replace(replace(replace(replace(replace(
                lower(regexp_replace(normalize(regexp_replace(lower(coalesce(p, '')), '[‐-―−]', '-', 'g'), NFKD),
                                     '[̀-ͯ]', '', 'g')),
              'kh','х'),'sh','ш'),'ch','ч'),'ts','ц'),'zh','ж'),'ya','я'),'yo','е'),'ye','е'),'yu','ю'),
              'abcdefghijklmnopqrstuvwxyzөүэыщьъ',
              'абцдефгхижклмнопкрстуввхизоуеиш'),
             '(?<=[0-9]),(?=[0-9])', '.', 'g'),
            '(?<=[0-9])-(?=[0-9])', ' ', 'g'),
           '-', ''),
          '([0-9])(?=[а-я])', '\1 ', 'g'),
         '[^0-9а-я.]+', ' ', 'g'),
        '(?<![0-9])\.|\.(?![0-9])', ' ', 'g'),
       '\s+', ' ', 'g'),
      '([0-9]) р(?![а-я])', '\1р', 'g'),
     '([а-я])\1+', '\1', 'g'),
    'яа', 'я'));
$$;

-- 2. Нийтийн талбараас хайлтын мөр (эхэнд/төгсгөлд зай — үгийн эхээр тааруулахад).
--    Зураастай нэрийг зайтай хэлбэрээр ч хадгална: «Хан-Уул» → «ханул» + «хан ул».
create or replace function public.listings_build_search_text(
  p_title text, p_district text, p_type text, p_description text, p_deal text, p_rooms int
)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select ' ' || public.search_fold(concat_ws(' ',
    p_title,
    case when p_title ~ '[[:alpha:]][-‐-―−][[:alpha:]]'
         then regexp_replace(p_title, '[-‐-―−]', ' ', 'g') end,
    p_district,
    case when strpos(p_district, '-') > 0 then replace(p_district, '-', ' ') end,
    case p_district
      when 'Хан-Уул' then 'ХУД' when 'Баянзүрх' then 'БЗД' when 'Сүхбаатар' then 'СБД'
      when 'Чингэлтэй' then 'ЧД' when 'Баянгол' then 'БГД' when 'Сонгинохайрхан' then 'СХД'
      when 'Налайх' then 'НД' end,
    p_type,
    case p_type
      when 'Орон сууц' then 'байр' when 'Хаус' then 'байшин' when 'Оффис' then 'офис'
      when 'Обьект' then 'объект' end,
    case p_deal
      when 'rent' then 'түрээс түрээслэх түрээслүүлнэ хөлслүүлнэ'
      when 'sale' then 'худалдана худалдах зарна зарах' end,
    case when p_rooms > 0 then p_rooms::text || ' өрөө' end,
    left(p_description, 4000)
  )) || ' ';
$$;

revoke all on function public.search_fold(text) from public, anon, authenticated;
revoke all on function public.listings_build_search_text(text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.search_fold(text) to service_role;
grant execute on function public.listings_build_search_text(text, text, text, text, text, int) to service_role;

-- 3. Багана (default-гүй nullable → метадата өөрчлөлт, хүснэгт дахин бичихгүй).
alter table public.listings add column if not exists search_text text;
comment on column public.listings.search_text is
  'R08a: нийтийн талбараас (title, district, type, deal, rooms, description) нугалсан хайлтын мөр. Триггер listings_search_text бичнэ; клиентийн утгыг дарж бичнэ.';

-- 4. Триггер: INSERT/UPDATE БҮРД дахин тооцно (клиент search_text илгээсэн ч дарж бичнэ).
--    SECURITY DEFINER: туслах функцийн EXECUTE-ийг клиент рольд олгохгүй байхын тулд.
--    Зөвхөн NEW-ийн нийтийн талбарыг уншина, өөр хүснэгтэд хүрэхгүй.
create or replace function public.listings_search_text_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.search_text := public.listings_build_search_text(
    new.title, new.district, new.type, new.description, new.deal_type::text, new.rooms);
  return new;
end $$;

revoke all on function public.listings_search_text_tg() from public, anon, authenticated;

drop trigger if exists listings_search_text on public.listings;
create trigger listings_search_text
  before insert or update on public.listings
  for each row execute function public.listings_search_text_tg();

-- 5. Backfill (дээрх тайлбарыг үз): updated_at хөдлөхгүй, мэдэгдэл/статус өөрчлөлтгүй.
alter table public.listings disable trigger listings_updated_at;
do $$
begin
  perform set_config('crm2.listing_rpc', '1', true);
  perform set_config('nemi.concierge_write', 'on', true);
  update public.listings
     set search_text = public.listings_build_search_text(title, district, type, description, deal_type::text, rooms)
   where search_text is distinct from
         public.listings_build_search_text(title, district, type, description, deal_type::text, rooms);
  -- Тойрохыг ШУУД хаана (транзакцын үлдсэн хэсэгт хамгаалалт ажиллана).
  perform set_config('crm2.listing_rpc', '', true);
  perform set_config('nemi.concierge_write', 'off', true);
end $$;
alter table public.listings enable trigger listings_updated_at;

-- 6. Триграм индекс (backfill-ийн дараа нэг удаа барина; 139 мөр — хором зуур).
create index if not exists listings_search_text_trgm
  on public.listings using gin (search_text gin_trgm_ops);

-- 7. Газрын зураг: жагсаалттай ИЖИЛ хэв маяг (lib/search/query.ts searchPatternGroups).
--    p_q_groups = [[хувилбар, ...], ...]: бүлэг бүр (AND) дор хаяж нэг хувилбартай (OR)
--    таарна. Хэлбэр буруу эсвэл хэт том (>6 бүлэг, >8 хувилбар, >80 тэмдэгт, мөр биш
--    элемент) бол ХООСОН буцаана. Хоосон бүлэг ([]) үл тооцогдоно.
--    Overload үүсгэхгүйн тулд хуучин 13 аргументтайг устгана. p_q (хуучин клиент) хэвээр.
drop function if exists public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision);

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
  p_q_groups   jsonb   default null
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
  -- Оролтыг НЭГ удаа шалгаж задлана (мөр бүрт биш).
  with v as materialized (
    select case
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
                                      -- сондгой тооны \-ээр төгссөн загвар LIKE-д алдаа өгдөг → мөргүй
                                      else char_length(x.pat #>> '{}') > 80
                                           or (x.pat #>> '{}') ~ '(^|[^\\])(\\\\)*\\$' end)
                      end)
           end as ok
  ),
  g as materialized (
    select array_agg(x.pat) as pats
      from v
     cross join lateral jsonb_array_elements(
             case when v.ok and p_q_groups is not null then p_q_groups else '[]'::jsonb end
           ) with ordinality e(grp, gi)
     cross join lateral jsonb_array_elements_text(e.grp) x(pat)
     group by e.gi
  )
  select l.id, l.title, l.price, l.district, l.deal_type::text,
         l.rooms, l.area, l.photo,
         ST_X(l.location::geometry), ST_Y(l.location::geometry)
    from public.listings l
    cross join v
    left join public.agents ag on ag.id = l.agent_id
    left join public.offices o on o.id = ag.office_id
   where v.ok
     and l.status = 'active'
     and l.location is not null
     and o.suspended_at is null
     and (p_deal is null or l.deal_type::text = p_deal)
     and (p_district is null or l.district = p_district)
     and (p_type is null or l.type = p_type)
     and (p_rooms is null or l.rooms >= p_rooms)
     and (p_min_price is null or l.price >= p_min_price)
     and (p_max_price is null or l.price <= p_max_price)
     and (p_min_area is null or l.area >= p_min_area)
     and (p_max_area is null or l.area <= p_max_area)
     -- хуучин клиент (deploy-ийн үе): p_q_groups-гүй бол гарчгаар; % _ \ үсэг гэж тооцно.
     and (p_q_groups is not null or p_q is null
          or l.title ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and not exists (select 1 from g where not (coalesce(l.search_text, '') like any (g.pats)))
     and (p_posted is null or l.created_at >= now() - make_interval(days => p_posted))
     and (p_lng is null or p_lat is null or p_m is null
          or ST_DWithin(l.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, least(p_m, 50000)))
   order by l.created_at desc
   limit 2000;
$$;

revoke all on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision, jsonb) from public;
grant execute on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

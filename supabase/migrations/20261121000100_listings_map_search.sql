-- Газрын зургийн зар — жагсаалттай ИЖИЛ шүүлттэй.
--
-- Өмнө нь газрын зураг (listings_map / listings_within) ямар ч шүүлтгүй, бүх
-- идэвхтэй зарыг харуулдаг байсан тул «Түрээс, Хан-Уул, 2+ өрөө» гэж
-- жагсаалтаас шилжихэд шүүлт алга болдог байв. Энэ функц нь шүүлтийг (бүгд
-- заавал биш) хүлээж авна; p_lng/p_lat/p_m өгвөл тойргоор хязгаарлана.
--
-- Хуучин хоёр функц хэвээр — deploy-ийн үеэр хуучин клиент тэдгээрийг
-- дуудсаар байж болно.

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
  p_m          double precision default null
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
  select l.id, l.title, l.price, l.district, l.deal_type::text,
         l.rooms, l.area, l.photo,
         ST_X(l.location::geometry), ST_Y(l.location::geometry)
    from public.listings l
    left join public.agents ag on ag.id = l.agent_id
    left join public.offices o on o.id = ag.office_id
   where l.status = 'active'
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
     -- Жагсаалттай адил: % _ \ тэмдгийг үсэг гэж тооцно.
     and (p_q is null or l.title ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and (p_posted is null or l.created_at >= now() - make_interval(days => p_posted))
     and (p_lng is null or p_lat is null or p_m is null
          or ST_DWithin(l.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, least(p_m, 50000)))
   order by l.created_at desc
   limit 2000;
$$;

revoke all on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision) from public;
grant execute on function public.listings_map_search(text, text, text, int, bigint, bigint, numeric, numeric, text, int, double precision, double precision, double precision) to anon, authenticated, service_role;

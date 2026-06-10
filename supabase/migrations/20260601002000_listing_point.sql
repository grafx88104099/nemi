-- Нэг зарын координат (lng/lat) унших RPC.
-- location нь geography(Point) тул PostgREST-ээр WKB hex буцдаг — шууд ашиглах
-- боломжгүй. Энэ RPC ST_X/ST_Y-ээр задлан буцаана (зар засах форм + дэлгэрэнгүй
-- хуудасны газрын зураг).

create or replace function public.listing_point(p_id uuid)
returns table (lng float8, lat float8)
language sql stable security definer set search_path = public as $$
  select ST_X(location::geometry), ST_Y(location::geometry)
  from public.listings
  where id = p_id and location is not null;
$$;

grant execute on function public.listing_point(uuid) to anon, authenticated;

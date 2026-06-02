-- ============================================================
-- Гео RPC (Phase 11) — газрын зураг + радиусын хайлт
-- security definer + зөвхөн active зар тул нийтэд аюулгүй.
-- ============================================================

-- Бүх идэвхтэй зарын координат (газрын зурагт)
create or replace function public.listings_map()
returns table (id uuid, title text, price bigint, district text, ai_score int, lng float8, lat float8)
language sql stable security definer set search_path = public as $$
  select id, title, price, district, ai_score,
         ST_X(location::geometry), ST_Y(location::geometry)
  from public.listings
  where status = 'active' and location is not null;
$$;

-- Тухайн цэгийн ойролцоох зарууд (метрээр)
create or replace function public.listings_within(p_lng float8, p_lat float8, p_m float8)
returns table (id uuid, title text, price bigint, district text, ai_score int, lng float8, lat float8, dist_m float8)
language sql stable security definer set search_path = public as $$
  select id, title, price, district, ai_score,
         ST_X(location::geometry), ST_Y(location::geometry),
         ST_Distance(location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
  from public.listings
  where status = 'active' and location is not null
    and ST_DWithin(location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_m)
  order by 8;
$$;

grant execute on function public.listings_map() to anon, authenticated;
grant execute on function public.listings_within(float8, float8, float8) to anon, authenticated;

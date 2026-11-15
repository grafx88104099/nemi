-- Нийтийн зарын «төрөл» талбарыг кодоор биш, нэрээр нь буулгана.
-- crm2-д property_type нь код (apartment, house …), нийтийн listings.type нь
-- монгол нэр («Орон сууц», «Хаус» …) хадгалдаг бөгөөд сайтын шүүлтүүр түүгээр
-- ажилладаг. Онцлогийг (features) аль хэдийн нэрээр нь буулгадаг.

create or replace function public.crm2_listing_payload(p_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deal_type', case when p.category = 'sale' then 'sale' else 'rent' end,
    -- Төрлийг тохиргооны жагсаалтын нэрээр (олдохгүй бол кодоор нь).
    'type', coalesce(
      nullif(btrim(public.crm2_setting('property.types', p.office_id) ->> p.property_type), ''),
      nullif(btrim(p.property_type), ''),
      'Бусад'),
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

-- Нийтлэгдсэн зарууд дээр шинэ нэрийг тавина.
do $$
declare r record;
begin
  for r in select id from public.crm2_properties where listing_id is not null loop
    perform public.crm2_sync_listing(r.id);
  end loop;
end $$;

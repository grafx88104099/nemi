-- Зарын зургийг атомикаар солих RPC.
-- Өмнө нь app talд delete→insert тусдаа хийдэг тул delete амжаад insert унавал
-- зураг бүгд алга болох эрсдэлтэй байв. Энэ функц нэг транзакцид солино.
-- security invoker тул RLS (can_manage_listing) хүчинтэй — агент зөвхөн өөрийн
-- зарын зургийг солино.

create or replace function public.replace_listing_photos(p_listing_id uuid, p_urls text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.listing_photos where listing_id = p_listing_id;
  if array_length(p_urls, 1) is not null then
    insert into public.listing_photos (listing_id, url, sort_order, is_primary)
    select p_listing_id, u, ord - 1, ord = 1
    from unnest(p_urls) with ordinality as t(u, ord);
  end if;
end;
$$;

grant execute on function public.replace_listing_photos(uuid, text[]) to authenticated;

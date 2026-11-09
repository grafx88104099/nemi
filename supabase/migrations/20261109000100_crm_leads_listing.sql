-- Сэжмийг nemi.mn-ийн зартай холбоно: тухайн сэжим яг ямар ҮХХ-ийн сэжим болохыг
-- харагдуулах зорилготой.
--
-- listing_id     — одоогийн зар руу заана. Зарын эзэн зараа устгахад CRM саад болох
--                  ёсгүй тул on delete set null.
-- listing_snapshot — бүртгэсэн үеийн зарын мэдээлэл. Зар зарагдах/устах үед listings-ийн
--                  RLS өөр оффисын агентаас мөрийг нууж болох тул сэжмийн карт, зарын
--                  жагсаалт энэ хуулбарт найдна. Хэлбэр: lib/crm/lead-listing.ts.
--
-- Харагдах эрх шинээр нэмэгдэхгүй: crm_leads-ийн одоогийн RLS агентад зөвхөн өөрийн
-- (бүртгэсэн эсвэл эзэмшсэн) сэжмийг, менежерүүдэд бүх сэжмийг харуулдаг.
alter table public.crm_leads
  add column listing_id uuid references public.listings(id) on delete set null,
  add column listing_snapshot jsonb;

create index crm_leads_listing_idx
  on public.crm_leads (office_id, listing_id)
  where listing_id is not null;

comment on column public.crm_leads.listing_id is
  'Сэжмийн сонирхсон nemi.mn зар. Зар устахад null болно; мэдээлэл нь listing_snapshot-д үлдэнэ.';
comment on column public.crm_leads.listing_snapshot is
  'Бүртгэсэн үеийн зарын мэдээлэл (title, price, deal_type, district, type, rooms, area, photo, captured_at).';

-- Сайтаас (зарын хуудаснаас) ирсэн одоогийн сэжмүүд channel_ref-д зарын id-тай.
update public.crm_leads cl
   set listing_id = l.id,
       listing_snapshot = jsonb_build_object(
         'title', l.title,
         'price', l.price,
         'deal_type', l.deal_type,
         'district', l.district,
         'type', l.type,
         'rooms', l.rooms,
         'area', l.area,
         'photo', l.photo,
         'captured_at', now()
       )
  from public.listings l
 where cl.channel_ref ~ '^listing:[0-9a-fA-F-]{36}$'
   and l.id::text = substring(cl.channel_ref from 9)
   and cl.listing_id is null;

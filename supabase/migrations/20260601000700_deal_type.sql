-- ============================================================
-- deal_type — зар зарах уу түрээслэх үү (Zillow Buy/Rent шиг)
-- ============================================================
create type deal_type as enum ('sale', 'rent');

alter table public.listings
  add column deal_type deal_type not null default 'sale';

create index listings_deal_idx on public.listings (deal_type);

-- Түрээсийн төлбөрийн нөхцөл (X+Y загвар).
-- X = урьдчилж төлөх түрээсийн сар, Y = барьцааны сар.
-- Жишээ: 1+1, 2+1, 3+1, 6+1 (энгийн), 1+2 (лакшери).
-- Зөвхөн deal_type = 'rent' зард утгатай; sale зард NULL.

alter table public.listings
  add column rent_advance_months smallint
    check (rent_advance_months is null or rent_advance_months between 0 and 24),
  add column rent_deposit_months smallint
    check (rent_deposit_months is null or rent_deposit_months between 0 and 24);

comment on column public.listings.rent_advance_months is 'Урьдчилж төлөх түрээсийн сар (X+Y-ийн X). Зөвхөн rent зард.';
comment on column public.listings.rent_deposit_months is 'Барьцааны сар (X+Y-ийн Y). Зөвхөн rent зард.';

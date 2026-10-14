-- ============================================================
-- Оффисын зарын зурагт лого тамга (watermark) дарах тохиргоо.
-- Асаалттай оффисын агентын оруулсан зарын зураг бүрд тухайн оффисын
-- лого (offices.logo_url) бүдэг тамга болж upload хийхээс өмнө дарагдана.
-- Тохиргоог оффисын админ /office/settings-ээс асааж/унтраана.
-- ============================================================

alter table public.offices
  add column if not exists watermark_enabled boolean not null default false;

-- PMC оффист анхнаасаа асаана (захиалагчийн шаардлага).
update public.offices set watermark_enabled = true where name = 'PMC';

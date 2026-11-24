-- 20261124000800_crm_listing_agreements_readonly.sql
-- ⚠ PROD-д ТАВИГДААГҮЙ (2026-11-24): эзэн «одоохондоо тавихгүй» гэж шийдсэн — оффисын шийдвэрийг хүлээнэ.
-- P2(e) — ЗӨВХӨН оффис «CRM2 зуучлалын гэрээ = үндсэн бүртгэл» гэж шийдсэний ДАРАА хэрэглэнэ.
-- Хуучин CRM-ийн crm_listing_agreements (prod-д 1 мөр; апп кодонд лавлагаа алга) — уншихаар үлдэнэ.
--
-- DEPLOY: СОНГОЛТТОЙ, бусад 20261124… миграцаас хамааралгүй. Хэрэглэхийн өмнө репод дахин хайж   -- ШИНЭ
--   (`grep -rn crm_listing_agreements app lib components scripts`) энэ хүснэгтэд бичдэг код       -- ШИНЭ
--   байхгүйг баталгаажуулна. Уншдаг функцууд (crm_property_activation_missing, crm_check_gate_rec)   -- ШИНЭ
--   SECURITY DEFINER тул хэвээр ажиллана; service_role/postgres-ийн эрх өөрчлөгдөхгүй.             -- ШИНЭ
-- Rollback: 20260901000300_crm_properties.sql-ийн crm_listing_agr_insert/update policy-г дахин     -- ШИНЭ
--   үүсгэж, `grant insert, update, delete, truncate on public.crm_listing_agreements to anon,         -- ШИНЭ
--   authenticated;` хийж, `comment on table public.crm_listing_agreements is null;` болгоно.          -- ШИНЭ

set local lock_timeout = '3s';

drop policy if exists crm_listing_agr_insert on public.crm_listing_agreements;
drop policy if exists crm_listing_agr_update on public.crm_listing_agreements;
revoke insert, update, delete, truncate on public.crm_listing_agreements from anon, authenticated;
comment on table public.crm_listing_agreements is 'Хуучин CRM — зөвхөн унших (2026-11-24). Шинэ гэрээ: crm2_brokerage_contracts.';

notify pgrst, 'reload schema';

-- ============================================================
-- PMC CRM — PRO-001 v2.1 нийцүүлэлт (U1 crm-foundation), 1/4.
-- Шилжих шалгуурын (gate) шинэ кодууд — §6.13, §6.14.
--
-- Нэг шатанд нэг gate_code (crm_stages.gate_code), шаардлагууд нь
-- crm_gate_requirements-д. ALTER TYPE ... ADD VALUE-гаар нэмсэн утгыг
-- тухайн транзакц дотор ашиглах боломжгүй тул энэ файл ТУСДАА, эхэнд.
--
--   g_contact        — ХОЛБОГДСОН (PL-1…5), §6.13 / §6.14
--   g_match          — ТОХИРУУЛСАН
--   g_showing        — ҮЗЛЭГ
--   g_interest       — СОНИРХСОН
--   g_counter        — ХЭЛЭЛЦЭЭР (сөрөг санал)
--   g_meeting        — УУЛЗАЛТ (PL-2)
--   g_valuation      — ҮНЭЛГЭЭ, ҮНЭ ТОГТООЛТ (PL-2)
--   g_listing_live   — ИДЭВХТЭЙ ЛИСТИНГ (PL-2)
--   g_buyer_activity — ҮЗЛЭГҮҮД (PL-2)
-- ============================================================

alter type public.crm_gate_code add value if not exists 'g_contact';
alter type public.crm_gate_code add value if not exists 'g_match';
alter type public.crm_gate_code add value if not exists 'g_showing';
alter type public.crm_gate_code add value if not exists 'g_interest';
alter type public.crm_gate_code add value if not exists 'g_counter';
alter type public.crm_gate_code add value if not exists 'g_meeting';
alter type public.crm_gate_code add value if not exists 'g_valuation';
alter type public.crm_gate_code add value if not exists 'g_listing_live';
alter type public.crm_gate_code add value if not exists 'g_buyer_activity';

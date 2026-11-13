"use server";

import { crm2Session } from "@/lib/crm2/server";
import { AUTH_ERROR, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { idSchema } from "@/lib/crm2/schemas";
import type { Crm2DealStage, Crm2PricePeriod, Crm2PropertyCategory, Crm2Result } from "@/lib/crm2/types";

/**
 * S04 дуудлагын цонхны нэмэлт уншилт (зөвхөн унших — revalidate хийхгүй):
 * сонгосон харилцагчийн идэвхтэй шаардлагууд ба өөр хөрөнгө дээрх хэлцлүүд
 * (цуцлагдсан хэлцлийн дараах санал бол «эх хэлцэл»-ээр холбоно). RLS/RPC эрхээр.
 */
export async function loadCallContext(
  contactId: string,
  propertyId: string
): Promise<
  Crm2Result<{
    requirements: {
      id: string;
      purpose: string | null;
      category: Crm2PropertyCategory | null;
      budget_min: number | null;
      budget_max: number | null;
      currency: string;
      price_period: Crm2PricePeriod;
      districts: string[];
      locations: string[];
      rooms_min: number | null;
      rooms_max: number | null;
      area_min: number | null;
      area_max: number | null;
    }[];
    originOptions: { deal_id: string; code: string; stage: Crm2DealStage; is_open: boolean; property_code: string }[];
  }>
> {
  const c = idSchema.safeParse(contactId);
  const p = idSchema.safeParse(propertyId);
  if (!c.success) return fail(zodErrorText(c.error));
  if (!p.success) return fail(zodErrorText(p.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { supabase } = session;

  const [reqs, deals] = await Promise.all([
    supabase
      .from("crm2_requirements")
      .select(
        "id, purpose, category, budget_min, budget_max, currency, price_period, districts, locations, " +
          "rooms_min, rooms_max, area_min, area_max, updated_at"
      )
      .eq("contact_id", c.data)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase.rpc("crm2_contact_deals", { p_contact: c.data }),
  ]);
  if (reqs.error) return dbFail("loadCallContext requirements", reqs.error);
  if (deals.error) console.error("crm2 loadCallContext deals:", deals.error.message);

  type ReqRow = {
    id: string;
    purpose: string | null;
    category: Crm2PropertyCategory | null;
    budget_min: number | null;
    budget_max: number | null;
    currency: string;
    price_period: Crm2PricePeriod;
    districts: string[] | null;
    locations: string[] | null;
    rooms_min: number | null;
    rooms_max: number | null;
    area_min: number | null;
    area_max: number | null;
  };
  const requirements = ((reqs.data ?? []) as unknown as ReqRow[]).map((r) => ({
    id: r.id,
    purpose: r.purpose,
    category: r.category,
    budget_min: r.budget_min,
    budget_max: r.budget_max,
    currency: r.currency,
    price_period: r.price_period,
    districts: r.districts ?? [],
    locations: r.locations ?? [],
    rooms_min: r.rooms_min,
    rooms_max: r.rooms_max,
    area_min: r.area_min,
    area_max: r.area_max,
  }));
  // Цуцлагдсан хэлцэл эхэнд (эх хэлцэл болох магадлалтай).
  const originOptions = (deals.data ?? [])
    .filter((d) => d.property_id !== p.data)
    .sort((a, b) => Number(a.stage !== "cancelled") - Number(b.stage !== "cancelled"))
    .map((d) => ({ deal_id: d.deal_id, code: d.code, stage: d.stage, is_open: d.is_open, property_code: d.property_code }));
  return ok({ requirements, originOptions });
}

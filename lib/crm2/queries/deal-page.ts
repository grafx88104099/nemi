import { crm2Client } from "@/lib/crm2/server";
import type { DealDetail } from "@/lib/crm2/queries/deals";
import type { Crm2DealStage, Crm2PricePeriod, Crm2PropertyCategory } from "@/lib/crm2/types";

/**
 * Хэлцлийн хуудасны нэмэлт уншилт: өмнөх/эх хэлцлийн хөрөнгө (холбоос угсрахад),
 * энэ хэлцлээс үүссэн дараагийн хэлцлүүд (цуцлалтын дараах санал, ижил хосын
 * шинэ хэлцэл), хүлээгдэж буй шилжүүлэх хүсэлтийг шийдэх эрх.
 */

export type DealLink = { id: string; code: string; property_id: string };

export type DealFollowUp = {
  id: string;
  code: string;
  stage: Crm2DealStage;
  property_id: string;
  property_code: string | null;
  /** origin — цуцлалтын дараах өөр хөрөнгийн санал; next — ижил хосын дараагийн хэлцэл. */
  relation: "origin" | "next";
  created_at: string;
};

export type DealPageExtras = {
  previous: DealLink | null;
  origin: DealLink | null;
  followUps: DealFollowUp[];
  canDecideTransfer: boolean;
};

type FollowRow = {
  id: string;
  code: string;
  stage: Crm2DealStage;
  property_id: string;
  origin_deal_id: string | null;
  previous_deal_id: string | null;
  created_at: string;
  property: { code: string } | null;
};

export async function getDealPageExtras(detail: DealDetail): Promise<DealPageExtras> {
  const supabase = await crm2Client();
  const { deal } = detail;
  const linkIds = [deal.previous_deal_id, deal.origin_deal_id].filter((x): x is string => !!x);

  const [links, follow, decide] = await Promise.all([
    linkIds.length
      ? supabase.from("crm2_deals").select("id, code, property_id").in("id", linkIds)
      : Promise.resolve({ data: [] as DealLink[], error: null }),
    supabase
      .from("crm2_deals")
      .select(
        "id, code, stage, property_id, origin_deal_id, previous_deal_id, created_at, " +
          "property:crm2_properties!crm2_deals_property_id_office_id_fkey(code)"
      )
      .or(`origin_deal_id.eq.${deal.id},previous_deal_id.eq.${deal.id}`)
      .order("created_at", { ascending: true })
      .limit(50),
    detail.pendingTransfer
      ? supabase.rpc("crm2_can_decide_request", { p_request: detail.pendingTransfer.id })
      : Promise.resolve({ data: false, error: null }),
  ]);
  if (links.error) console.error("crm2 deal links:", links.error.message);
  if (follow.error) console.error("crm2 deal follow-ups:", follow.error.message);
  if (decide.error) console.error("crm2 can_decide_request:", decide.error.message);

  const linkMap = new Map(((links.data ?? []) as DealLink[]).map((d) => [d.id, d]));
  const followUps = ((follow.data ?? []) as unknown as FollowRow[]).map((r) => ({
    id: r.id,
    code: r.code,
    stage: r.stage,
    property_id: r.property_id,
    property_code: r.property?.code ?? null,
    relation: (r.origin_deal_id === deal.id ? "origin" : "next") as DealFollowUp["relation"],
    created_at: r.created_at,
  }));

  return {
    previous: deal.previous_deal_id ? (linkMap.get(deal.previous_deal_id) ?? null) : null,
    origin: deal.origin_deal_id ? (linkMap.get(deal.origin_deal_id) ?? null) : null,
    followUps,
    canDecideTransfer: !!decide.data,
  };
}

export type RequirementOption = {
  id: string;
  version: number;
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
};

/** Харилцагчийн идэвхтэй шаардлагууд (цуцлахдаа холбох; харах эрхгүй бол хоосон). */
export async function getContactRequirementOptions(contactId: string): Promise<RequirementOption[]> {
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_requirements")
    .select(
      "id, version, purpose, category, budget_min, budget_max, currency, price_period, districts, locations, " +
        "rooms_min, rooms_max, area_min, area_max"
    )
    .eq("contact_id", contactId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) console.error("crm2 requirement options:", error.message);
  return (data ?? []) as unknown as RequirementOption[];
}

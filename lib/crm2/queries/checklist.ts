import {
  buildChecklist,
  checklistSettings,
  nextStep,
  type Checklist,
  type ChecklistContract,
  type ChecklistInput,
  type ChecklistOwner,
  type NextStep,
} from "@/lib/crm2/checklist";
import { ubToday } from "@/lib/crm2/datetime";
import { findPublicTextRisks } from "@/lib/crm2/text-privacy";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type { BrokerageItem, PropertyDetail } from "@/lib/crm2/queries/properties";
import type { Crm2PropertyRow } from "@/lib/crm2/types";

/**
 * Картын «Дараагийн алхам» ба шалгах жагсаалт (P3) — getProperty()-ийн үр дүнгээс (нэмэлт уншилтгүй)
 * lib/crm2/checklist-ийн цэвэр дүрмээр. Эцсийн шалгалт DB дээр (crm2_property_missing, brokerage_missing,
 * publish_blockers). Хувийн талбар харах эрхгүй бол эзэн 'hidden'.
 */

/** Нийтэд гардаг бичвэрийн талбарууд (утас, тоот, хаалганы кодыг шалгана). */
const PUBLIC_TEXT_KEYS = ["advantages", "condition", "view_note", "availability_note"] as const;

/** Шалгах жагсаалтад хэрэгтэй гэрээний талбарууд (BrokerageItem ба incomplete.ts-ийн мөр хоёулаа тохирно). */
export type ChecklistContractRow = Pick<
  BrokerageItem,
  | "status"
  | "start_date"
  | "end_date"
  | "approved_at"
  | "commission_type"
  | "commission_value"
  | "owner_contact_id"
  | "terms"
  | "no_special_terms"
  | "signer_differs"
  | "signer_note"
  | "prefilled"
  | "file_at_office"
> & {
  owner: { source: string | null; name_unverified: boolean } | null;
  files: readonly { kind: string | null }[] | null;
};

/**
 * Шалгах жагсаалтад тооцох гэрээ: хүчинтэй (active) нь давуу, эс бөгөөс хамгийн сүүлийн ноорог/илгээсэн.
 * Жагсаалт хувилбараар (шинэ нь эхэнд) эрэмбэлэгдсэн байна.
 */
export function pickChecklistContract<T extends { status: string }>(list: readonly T[]): T | null {
  return list.find((c) => c.status === "active") ?? list.find((c) => c.status === "draft" || c.status === "pending") ?? null;
}

export function toChecklistContract(
  c: ChecklistContractRow | null,
  owner: { source: string | null; nameUnverified: boolean } | null
): ChecklistContract | null {
  if (!c) return null;
  const files = c.files ?? [];
  const count = (k: string) => files.filter((f) => (f.kind ?? "contract") === k).length;
  return {
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date,
    approved_at: c.approved_at,
    commission_type: c.commission_type,
    commission_value: c.commission_value,
    owner_contact_id: c.owner_contact_id,
    ownerNameUnverified: c.owner?.name_unverified ?? owner?.nameUnverified ?? false,
    ownerSource: c.owner ? (c.owner.source ?? null) : (owner?.source ?? null),
    terms: c.terms,
    no_special_terms: !!c.no_special_terms,
    signer_differs: !!c.signer_differs,
    signer_note: c.signer_note ?? null,
    prefilled: c.prefilled ?? [],
    fileCount: count("contract"),
    ownershipFileCount: count("ownership"),
    otherFileCount: count("id") + count("other"),
    file_at_office: !!c.file_at_office,
  };
}

/** Хөрөнгийн мөрийн (crm2_properties) шалгах жагсаалтад хэрэгтэй хэсэг. */
export const CHECKLIST_PROPERTY_COLUMNS =
  "category, property_type, project_id, district, location_text, address_detail, lat, area_m2, rooms, floor, " +
  "building_floors, year_in_use, price, price_total, currency, price_period, listing_agent_id, contract_agent_id, " +
  "photo_agent_id, last_verified_at, unconfirmed, status, listing_id, source_listing_id, published_at, advantages, " +
  "condition, view_note, availability_note, features";

export type ChecklistPropertyRow = Pick<
  Crm2PropertyRow,
  | "category" | "property_type" | "project_id" | "district" | "location_text" | "address_detail" | "lat" | "area_m2"
  | "rooms" | "floor" | "building_floors" | "year_in_use" | "price" | "price_total" | "currency" | "price_period"
  | "listing_agent_id" | "contract_agent_id" | "photo_agent_id" | "last_verified_at" | "unconfirmed" | "status"
  | "listing_id" | "source_listing_id" | "published_at" | "advantages" | "condition" | "view_note"
  | "availability_note" | "features"
>;

export function checklistProperty(p: ChecklistPropertyRow): ChecklistInput["property"] {
  return {
    category: p.category,
    property_type: p.property_type,
    project_id: p.project_id,
    district: p.district,
    location_text: p.location_text,
    address_detail: p.address_detail,
    lat: p.lat,
    area_m2: p.area_m2,
    rooms: p.rooms,
    floor: p.floor,
    building_floors: p.building_floors,
    year_in_use: p.year_in_use,
    price: p.price,
    price_total: p.price_total,
    currency: p.currency,
    price_period: p.price_period,
    listing_agent_id: p.listing_agent_id,
    contract_agent_id: p.contract_agent_id,
    photo_agent_id: p.photo_agent_id,
    last_verified_at: p.last_verified_at,
    unconfirmed: p.unconfirmed ?? [],
    status: p.status,
    listing_id: p.listing_id,
    source_listing_id: p.source_listing_id ?? null,
    published_at: p.published_at,
    advantages: p.advantages,
    condition: p.condition,
    view_note: p.view_note,
    availability_note: p.availability_note,
    features: p.features ?? [],
  };
}

/** Нийтэд гардаг бичвэрийн эрсдэл (утас, тоот, хаалганы код). */
export function publicTextRisksOf(p: Pick<Crm2PropertyRow, (typeof PUBLIC_TEXT_KEYS)[number]>): string[] {
  const risks = new Set<string>();
  for (const k of PUBLIC_TEXT_KEYS) {
    const text = p[k];
    if (typeof text === "string" && text.trim()) for (const r of findPublicTextRisks(text)) risks.add(r);
  }
  return [...risks];
}

/** getProperty()-ийн үр дүн → ChecklistInput (цэвэр). */
export function cardChecklistInput(detail: PropertyDetail, settings: Crm2Settings, today = ubToday()): ChecklistInput {
  const p = detail.property;
  const priv = detail.private;
  const owner: ChecklistOwner = !detail.can.viewPrivate
    ? "hidden"
    : priv?.owner
      ? { id: priv.owner.id, nameUnverified: !!priv.owner.name_unverified, source: priv.owner.source ?? null }
      : null;
  const ownerInfo = owner && owner !== "hidden" ? owner : null;
  return {
    property: checklistProperty(p),
    owner,
    ownerPending: !!priv?.owner_pending,
    showingInstructions: detail.can.viewPrivate ? (priv?.showing_instructions ?? null) : "hidden",
    contract: toChecklistContract(pickChecklistContract(detail.brokerage), ownerInfo),
    imageCount: detail.media.filter((m) => m.kind === "image").length,
    listingAgentPublic: detail.listingAgentPublic,
    settings: checklistSettings(settings),
    publicTextRisks: publicTextRisksOf(p),
    today,
  };
}

/** Картын шалгах жагсаалт + «Дараагийн алхам». */
export function buildCardChecklist(
  detail: PropertyDetail,
  settings: Crm2Settings
): { checklist: Checklist; next: NextStep; input: ChecklistInput } {
  const input = cardChecklistInput(detail, settings);
  return { checklist: buildChecklist(input), next: nextStep(input), input };
}

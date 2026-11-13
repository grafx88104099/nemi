import { cache } from "react";

import { crm2Client } from "@/lib/crm2/server";
import { loadHistory, type HistoryItem } from "@/lib/crm2/queries/history";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import type {
  Crm2ActivityRow,
  Crm2ContactPhoneRow,
  Crm2DealRow,
  Crm2PropertyRow,
  Crm2RequestRow,
  Crm2RequirementRow,
  Crm2TaskRow,
} from "@/lib/crm2/types";

/**
 * Нэг хэлцэл (хөрөнгө × харилцагч): дуудлага, үзүүлэлт, ажил, түүх.
 * Харилцагчийг харах эрхгүй (жишээ нь хөрөнгийн 3 агент) бол нэрийг далдлан
 * crm2_property_deals-аас авна.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEAL_SELECT =
  "*, property:crm2_properties!crm2_deals_property_id_office_id_fkey(id, code, category, status, property_type, district, " +
  "location_text, area_m2, rooms, price, currency, price_period, price_basis, listing_agent_id, contract_agent_id, photo_agent_id), " +
  "contact:crm2_contacts!crm2_deals_contact_id_office_id_fkey(id, code, full_name, status, responsible_agent_id, " +
  "phones:crm2_contact_phones!crm2_contact_phones_contact_id_office_id_fkey(id, phone, phone_norm, label, is_primary)), " +
  "agent:profiles!crm2_deals_agent_id_fkey(id, full_name, avatar_url), " +
  "requirement:crm2_requirements!crm2_deals_requirement_id_office_id_fkey(*)";

const DEAL_ACTIVITY_SELECT = "*, agent:profiles!crm2_activities_agent_id_fkey(full_name)";

const DEAL_TASK_SELECT = "*, assignee:profiles!crm2_tasks_assignee_id_fkey(full_name)";

const DEAL_REQUEST_SELECT =
  "id, office_id, kind, target_id, property_id, payload, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note";

export type DealProperty = Pick<
  Crm2PropertyRow,
  | "id"
  | "code"
  | "category"
  | "status"
  | "property_type"
  | "district"
  | "location_text"
  | "area_m2"
  | "rooms"
  | "price"
  | "currency"
  | "price_period"
  | "price_basis"
  | "listing_agent_id"
  | "contract_agent_id"
  | "photo_agent_id"
>;

export type DealContact = {
  id: string;
  code: string;
  full_name: string;
  status: string;
  responsible_agent_id: string;
  phones: Pick<Crm2ContactPhoneRow, "id" | "phone" | "phone_norm" | "label" | "is_primary">[];
};

export type DealActivity = Crm2ActivityRow & {
  agent: { full_name: string | null } | null;
  /** Эрэмбийн цаг: бодит → товлосон → бүртгэсэн. */
  sort_at: string;
};

export type DealTask = Crm2TaskRow & { assignee: { full_name: string | null } | null };

export type DealDetail = {
  deal: Crm2DealRow;
  property: DealProperty | null;
  /** Харах эрхгүй бол null — `contactName` нь далд нэр. */
  contact: DealContact | null;
  contactName: string;
  contactVisible: boolean;
  agent: { id: string; full_name: string | null; avatar_url: string | null } | null;
  requirement: Crm2RequirementRow | null;
  activities: DealActivity[];
  calls: DealActivity[];
  showings: DealActivity[];
  tasks: DealTask[];
  history: HistoryItem[];
  /** Түүхийг ачаалж чадсангүй (хоосон түүх гэж харуулахгүй). */
  historyError: boolean;
  pendingTransfer: (Crm2RequestRow & { requestedByName: string | null; toAgentName: string | null }) | null;
  /** Өмнөх/эх хэлцлийн код (харах эрхтэй бол). */
  links: { previous: { id: string; code: string } | null; origin: { id: string; code: string } | null };
  can: { edit: boolean };
};

type DealRaw = Crm2DealRow & {
  property: DealProperty | null;
  contact: DealContact | null;
  agent: DealDetail["agent"];
  requirement: Crm2RequirementRow | null;
};

/** Хэлцлийн дэлгэрэнгүй — олдохгүй/эрхгүй бол null. */
export const getDeal = cache(async (id: string): Promise<DealDetail | null> => {
  if (!UUID_RE.test(id)) return null;
  const supabase = await crm2Client();
  const { data: row, error } = await supabase.from("crm2_deals").select(DEAL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    // DB/PostgREST алдааг «олдсонгүй» гэж харуулахгүй — crm/error.tsx «Дахин оролдох» гарна.
    console.error("crm2 getDeal:", error.message);
    throw new Error("crm2 getDeal: load failed");
  }
  if (!row) return null;
  const { property, contact, agent, requirement, ...deal } = row as unknown as DealRaw;

  const linkIds = [deal.previous_deal_id, deal.origin_deal_id].filter((x): x is string => !!x);
  const [acts, tasks, history, request, canEdit, names, linked, masked] = await Promise.all([
    supabase.from("crm2_activities").select(DEAL_ACTIVITY_SELECT).eq("deal_id", id).order("created_at", { ascending: false }).limit(500),
    supabase.from("crm2_tasks").select(DEAL_TASK_SELECT).eq("deal_id", id).order("created_at", { ascending: false }).limit(200),
    loadHistory({ dealId: id, limit: 200 }),
    supabase
      .from("crm2_requests")
      .select(DEAL_REQUEST_SELECT)
      .eq("kind", "deal_transfer")
      .eq("target_id", id)
      .eq("status", "pending")
      .maybeSingle(),
    supabase.rpc("crm2_can_edit_deal", { p_deal: id }),
    getStaffNameMap(),
    linkIds.length
      ? supabase.from("crm2_deals").select("id, code").in("id", linkIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
    contact ? Promise.resolve(null) : supabase.rpc("crm2_property_deals", { p_property: deal.property_id }),
  ]);
  if (acts.error) console.error("crm2 getDeal activities:", acts.error.message);
  if (tasks.error) console.error("crm2 getDeal tasks:", tasks.error.message);
  if (request.error) console.error("crm2 getDeal request:", request.error.message);

  const activities = ((acts.data ?? []) as unknown as Omit<DealActivity, "sort_at">[])
    .map((a) => ({ ...a, sort_at: a.occurred_at ?? a.scheduled_at ?? a.created_at }))
    .sort((a, b) => b.sort_at.localeCompare(a.sort_at));
  const maskedRow = masked && "data" in masked ? (masked.data ?? []).find((d) => d.deal_id === id) : undefined;
  const req = (request.data ?? null) as Crm2RequestRow | null;
  const payload = req?.payload && typeof req.payload === "object" && !Array.isArray(req.payload)
    ? (req.payload as Record<string, unknown>)
    : {};
  const toAgent = typeof payload.to_agent === "string" ? payload.to_agent : null;
  const linkMap = new Map((linked.data ?? []).map((d) => [d.id, d]));

  return {
    deal,
    property,
    contact: contact ? { ...contact, phones: [...(contact.phones ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)) } : null,
    contactName: contact?.full_name ?? maskedRow?.contact_name ?? "***",
    contactVisible: !!contact,
    agent,
    requirement,
    activities,
    calls: activities.filter((a) => a.kind === "call"),
    showings: activities.filter((a) => a.kind === "showing"),
    tasks: (tasks.data ?? []) as unknown as DealTask[],
    // Харилцагчийг харах эрхгүй (далдалсан) бөгөөд засах эрхгүй үзэгчид хэлцлийн түүх (тэмдэглэлийн
    // өөрчлөлт г.м.) харуулахгүй — FX2-ийн crm2_can_view_history-тэй хамт DB ч хаана.
    history: contact || canEdit.data ? history.rows : [],
    historyError: history.error,
    pendingTransfer: req
      ? { ...req, requestedByName: names[req.requested_by] ?? null, toAgentName: toAgent ? (names[toAgent] ?? null) : null }
      : null,
    links: {
      previous: deal.previous_deal_id ? (linkMap.get(deal.previous_deal_id) ?? null) : null,
      origin: deal.origin_deal_id ? (linkMap.get(deal.origin_deal_id) ?? null) : null,
    },
    can: { edit: !!canEdit.data },
  };
});

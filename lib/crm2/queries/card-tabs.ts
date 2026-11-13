import { crm2Client, type Crm2Supabase } from "@/lib/crm2/server";
import { getCrm2Context } from "@/lib/crm2/context";
import { getPropertyDeals, loadPropertyActivities, loadPropertyDeals } from "@/lib/crm2/queries/properties";
import type { Crm2ActivityKind, Crm2DealStage, Crm2PropertyActivityItem, Crm2PropertyDealItem } from "@/lib/crm2/types";

/**
 * Хөрөнгийн картын табуудын нэмэлт уншилт (S03): дуудлага/үзүүлэлтийн хуудаслалт ба
 * мөр бүрийн засах эрх, үзүүлэлт товлох боломжтой хэлцлүүд, «Өөр Staff санал
 * болгох» холбоосын харилцагч. Бүгд хэрэглэгчийн client (RLS + definer RPC).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Хэлцэл бүрийг засах эрх (crm2_can_edit_deal) — цөөн хэлцэлд. */
export async function editableDealMap(supabase: Crm2Supabase, dealIds: string[]): Promise<Record<string, boolean>> {
  const ids = [...new Set(dealIds.filter((d) => UUID_RE.test(d)))].slice(0, 60);
  const results = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc("crm2_can_edit_deal", { p_deal: id });
      if (error) console.error("crm2 can_edit_deal:", error.message);
      return [id, !!data] as const;
    })
  );
  return Object.fromEntries(results);
}

export type CardActivityPage = {
  rows: Crm2PropertyActivityItem[];
  /** Дараагийн хуудасны курсор (сүүлийн мөрийн sort_at); цааш байхгүй бол null. */
  nextBefore: string | null;
  /** deal_id → энэ хэлцлийг засах эрхтэй. */
  editableDeals: Record<string, boolean>;
  /** deal_id → нээлттэй эсэх (crm2_property_deals-д харагдаагүй хэлцэлд түлхүүр байхгүй). */
  openDeals: Record<string, boolean>;
  me: string | null;
  /** Жагсаалтыг уншиж чадсангүй (хоосон жагсаалтаас ялгана). */
  error: boolean;
};

/** «Дуудлага» / «Үзүүлэлт» таб — шинэ нь эхэнд, `before`-оор хуудаслана. */
export async function getCardActivities(
  propertyId: string,
  kind: Crm2ActivityKind,
  before: string | null,
  limit = 30
): Promise<CardActivityPage> {
  const cursor = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const [list, ctx] = await Promise.all([
    loadPropertyActivities(propertyId, { kind, before: cursor, limit: limit + 1 }),
    getCrm2Context(),
  ]);
  const hasMore = list.rows.length > limit;
  const rows = hasMore ? list.rows.slice(0, limit) : list.rows;
  // Үйлдэл хийх мөр: хүчингүй болоогүй (товлосон үзүүлэлт, хүчингүй болгох).
  const actionable = rows.filter((r) => !r.voided_at).map((r) => r.deal_id);
  const supabase = await crm2Client();
  const [editableDeals, deals] = actionable.length
    ? await Promise.all([editableDealMap(supabase, actionable), loadPropertyDeals(propertyId)])
    : [{}, { rows: [], error: false }];
  return {
    rows,
    nextBefore: hasMore ? rows[rows.length - 1].sort_at : null,
    editableDeals,
    openDeals: Object.fromEntries(deals.rows.map((d) => [d.deal_id, d.is_open])),
    me: ctx?.profileId ?? null,
    error: list.error,
  };
}

export type SchedulableDeal = Pick<
  Crm2PropertyDealItem,
  "deal_id" | "code" | "stage" | "contact_name" | "contact_visible" | "agent_name" | "agent_id" | "contact_id"
> & {
  /** Харилцагчийн үндсэн утас (харах эрхтэй бол) — товлох маягтыг бөглөнө. */
  contact_phone: string | null;
};

/** Үзүүлэлт товлож болох (нээлттэй, засах эрхтэй) хэлцлүүд. */
export async function getSchedulableDeals(propertyId: string): Promise<SchedulableDeal[]> {
  const deals = (await getPropertyDeals(propertyId)).filter((d) => d.is_open);
  if (deals.length === 0) return [];
  const supabase = await crm2Client();
  const editable = await editableDealMap(
    supabase,
    deals.map((d) => d.deal_id)
  );
  const list = deals.filter((d) => editable[d.deal_id]);
  const contactIds = [
    ...new Set(list.filter((d) => d.contact_visible && d.contact_id).map((d) => d.contact_id as string)),
  ].filter((id) => UUID_RE.test(id));
  const phones = new Map<string, string>();
  if (contactIds.length) {
    // RLS: харах эрхтэй харилцагчийн утас л уншигдана. Үндсэн дугаар эхэнд.
    const { data, error } = await supabase
      .from("crm2_contact_phones")
      .select("contact_id, phone, is_primary")
      .in("contact_id", contactIds)
      .order("is_primary", { ascending: false });
    if (error) console.error("crm2 schedulable deal phones:", error.message);
    for (const p of data ?? []) if (!phones.has(p.contact_id)) phones.set(p.contact_id, p.phone);
  }
  return list.map(({ deal_id, code, stage, contact_name, contact_visible, agent_name, agent_id, contact_id }) => ({
    deal_id,
    code,
    stage,
    contact_name,
    contact_visible,
    agent_name,
    agent_id,
    contact_id,
    contact_phone: contact_visible && contact_id ? (phones.get(contact_id) ?? null) : null,
  }));
}

/** «Санал болгох» горимын баннерт: харилцагчийн код, нэр (харах эрхтэй бол). */
export async function getOfferContact(contactId: string | null): Promise<{ id: string; code: string; full_name: string } | null> {
  if (!contactId || !UUID_RE.test(contactId)) return null;
  const supabase = await crm2Client();
  const { data, error } = await supabase.from("crm2_contacts").select("id, code, full_name").eq("id", contactId).maybeSingle();
  if (error) console.error("crm2 offer contact:", error.message);
  return data ?? null;
}

export type OfferContext = {
  contact: { id: string; code: string; full_name: string; phones: { phone: string; is_primary: boolean }[] };
  /** Цуцлагдсан эх хэлцэл (ижил харилцагч, өөр хөрөнгө) — тохирохгүй бол null. */
  origin: { id: string; code: string; stage: Crm2DealStage } | null;
};

/**
 * ?offer_for=<харилцагч>&origin=<хэлцэл> — харилцагчийг харах эрхтэй бол дуудлагын
 * цонхонд урьдчилан бөглөнө. Эх хэлцэл нь тухайн харилцагчийн өөр хөрөнгийн хэлцэл байна.
 */
export async function getOfferContext(
  propertyId: string,
  contactId: string | null,
  originDealId: string | null
): Promise<OfferContext | null> {
  if (!contactId || !UUID_RE.test(contactId)) return null;
  const supabase = await crm2Client();
  const [contactRes, originRes] = await Promise.all([
    supabase
      .from("crm2_contacts")
      .select(
        "id, code, full_name, status, phones:crm2_contact_phones!crm2_contact_phones_contact_id_office_id_fkey(phone, is_primary)"
      )
      .eq("id", contactId)
      .maybeSingle(),
    originDealId && UUID_RE.test(originDealId)
      ? supabase.from("crm2_deals").select("id, code, stage, property_id, contact_id").eq("id", originDealId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactRes.error) console.error("crm2 offer contact:", contactRes.error.message);
  if (originRes.error) console.error("crm2 offer origin:", originRes.error.message);
  const c = contactRes.data as unknown as {
    id: string;
    code: string;
    full_name: string;
    phones: { phone: string; is_primary: boolean }[] | null;
  } | null;
  if (!c) return null;
  const o = originRes.data as { id: string; code: string; stage: Crm2DealStage; property_id: string; contact_id: string } | null;
  const origin = o && o.contact_id === c.id && o.property_id !== propertyId ? { id: o.id, code: o.code, stage: o.stage } : null;
  return {
    contact: {
      id: c.id,
      code: c.code,
      full_name: c.full_name,
      phones: [...(c.phones ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    },
    origin,
  };
}

/**
 * Илгээсэн гэрээ бүрд хэрэглэгч батлагч эсэх (crm2_brokerage_approver). Батлагч
 * боловч өөрийн оролцсон гэрээ (өөрийгөө батлах дүрэм) бол UI тайлбар харуулна.
 */
export async function brokerageApproverMap(
  contracts: { id: string; status: string; responsible_agent_id: string }[]
): Promise<Record<string, boolean>> {
  const pending = contracts.filter((c) => c.status === "pending").slice(0, 20);
  if (pending.length === 0) return {};
  const supabase = await crm2Client();
  const results = await Promise.all(
    pending.map(async (c) => {
      const { data, error } = await supabase.rpc("crm2_brokerage_approver", { p_responsible: c.responsible_agent_id });
      if (error) console.error("crm2 brokerage_approver:", error.message);
      return [c.id, !!data] as const;
    })
  );
  return Object.fromEntries(results);
}

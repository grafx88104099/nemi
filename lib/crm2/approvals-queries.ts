import { crm2Session } from "@/lib/crm2/server";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import { parseRequestCalls, requestCallPropertyIds, requestTargetLabel, type RequestCallView } from "@/lib/crm2/approvals-view";
import type { Crm2PropertyStatus, Crm2RequestKind, Crm2RequestStatus } from "@/lib/crm2/types";

/**
 * «Миний хүсэлтүүд»-ийн сүүлийн шийдвэрүүд (батлагдсан, татгалзсан, цуцлагдсан) —
 * хүлээгдэж буйг queries/approvals.listPendingApprovals өгнө. Хэрэглэгчийн client (RLS:
 * өөрийн гаргасан хүсэлт үргэлж харагдана).
 */

const MY_REQUEST_SELECT =
  "id, kind, target_id, property_id, payload, reason, status, requested_at, decided_by, decided_at, decision_note";

export type MyDecidedRequest = {
  id: string;
  kind: Crm2RequestKind;
  status: Crm2RequestStatus;
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  /** Хөрөнгийн код, хэлцлийн код эсвэл харилцагч (харах эрхтэй бол). */
  label: string;
  target: { propertyId: string | null; contactId: string | null; dealId: string | null; visible: boolean };
  statusChange: { from: Crm2PropertyStatus; to: Crm2PropertyStatus } | null;
  toAgentName: string | null;
  /** Хүсэлтэд хадгалсан дуудлагууд — батлагдсан бол бүртгэгдсэн/алгассан үр дүнтэй. */
  calls: RequestCallView[];
};

export type MyDecidedRequests = {
  rows: MyDecidedRequest[];
  /** Ачаалахад алдаа гарсан (хоосон түүх гэж харуулахгүй). */
  error: boolean;
};

type Row = {
  id: string;
  kind: Crm2RequestKind;
  target_id: string;
  property_id: string | null;
  payload: unknown;
  reason: string | null;
  status: Crm2RequestStatus;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const DAY_MS = 86_400_000;

export async function listMyDecidedRequests(opts: { days?: number; limit?: number } = {}): Promise<MyDecidedRequests> {
  const session = await crm2Session();
  if (!session) return { rows: [], error: false };
  const { supabase, userId } = session;
  const since = new Date(Date.now() - (opts.days ?? 30) * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from("crm2_requests")
    .select(MY_REQUEST_SELECT)
    .eq("requested_by", userId)
    .neq("status", "pending")
    // Гарчиг «сүүлийн N хоногт шийдвэрлэгдсэн» — шийдвэрийн огноогоор (хүсэлт бүрийн төлөв өөрчлөлт decided_at-тай).
    .gte("decided_at", since)
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(1, opts.limit ?? 20), 100));
  if (error) {
    console.error("crm2 listMyDecidedRequests:", error.message);
    return { rows: [], error: true };
  }
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return { rows: [], error: false };

  const propIds = [
    ...new Set(rows.flatMap((r) => [r.property_id, ...requestCallPropertyIds(r.payload)]).filter((x): x is string => !!x)),
  ];
  const dealIds = rows.filter((r) => r.kind === "deal_transfer").map((r) => r.target_id);
  const contactIds = rows.filter((r) => r.kind === "contact_transfer").map((r) => r.target_id);
  const [props, deals, contacts, names] = await Promise.all([
    propIds.length
      ? supabase.from("crm2_properties").select("id, code").in("id", propIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
    dealIds.length
      ? supabase.from("crm2_deals").select("id, code").in("id", dealIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
    contactIds.length
      ? supabase.from("crm2_contacts").select("id, code, full_name").in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; code: string; full_name: string }[], error: null }),
    getStaffNameMap(),
  ]);
  const propCode = new Map((props.data ?? []).map((p) => [p.id, p.code]));
  const dealCode = new Map((deals.data ?? []).map((d) => [d.id, d.code]));
  const contactLabel = new Map((contacts.data ?? []).map((c) => [c.id, `${c.code} · ${c.full_name}`]));

  const list = rows.map((r): MyDecidedRequest => {
    const p = r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {};
    const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
    const calls = parseRequestCalls(r.payload, propCode, names);
    const { label, visible } = requestTargetLabel(
      { kind: r.kind, targetId: r.target_id, propertyId: r.property_id, calls },
      { propCode, dealCode, contactLabel }
    );
    const toAgent = s("to_agent");
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requested_at,
      decidedAt: r.decided_at,
      decidedByName: r.decided_by ? (r.decided_by === userId ? "Та" : (names[r.decided_by] ?? null)) : null,
      decisionNote: r.decision_note,
      label,
      target: {
        propertyId: r.property_id,
        contactId: r.kind === "contact_transfer" ? r.target_id : null,
        dealId: r.kind === "deal_transfer" ? r.target_id : null,
        visible,
      },
      statusChange:
        r.kind === "property_status" && s("from") && s("to")
          ? { from: s("from") as Crm2PropertyStatus, to: s("to") as Crm2PropertyStatus }
          : null,
      toAgentName: toAgent ? (names[toAgent] ?? null) : null,
      calls,
    };
  });
  return { rows: list, error: false };
}

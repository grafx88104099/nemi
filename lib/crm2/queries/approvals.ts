import { crm2Client } from "@/lib/crm2/server";
import { getStaffNameMap } from "@/lib/crm2/queries/lookups";
import { parseRequestCalls, requestCallPropertyIds, requestTargetLabel, type RequestCallView } from "@/lib/crm2/approvals-view";
import type { Crm2PropertyStatus, Crm2RequestRow } from "@/lib/crm2/types";

/**
 * Батлах хүлээгдэж буй агентын хүсэлт (хөрөнгийн төлөв, хэлцэл/харилцагч шилжүүлэх). RLS-ээр харагдсан
 * мөр бүрд DB-ийн эрхийн функцээр (crm2_can_decide_request) `canDecide` тооцно. Өөрийн хүсэлт `mine`.
 * Зуучлалын гэрээг 20261125000100-аас батлахгүй (агент PMC тамгатай PDF-ээр бүртгэнэ) — энд орохгүй.
 */

const PENDING_REQUEST_SELECT =
  "id, office_id, kind, target_id, property_id, payload, reason, status, requested_by, requested_at, decided_by, decided_at, decision_note";

export type PendingRequest = Crm2RequestRow & {
  canDecide: boolean;
  /** Миний гаргасан хүсэлт (цуцалж болно). */
  mine: boolean;
  requestedByName: string | null;
  fromAgentName: string | null;
  toAgentName: string | null;
  /** Хүсэлтийн объект: хөрөнгийн код, хэлцлийн код, харилцагчийн код/нэр (харах эрхтэй бол). */
  target: { label: string; propertyId: string | null; contactId: string | null; dealId: string | null; visible: boolean };
  /** property_status: { from, to }. */
  statusChange: { from: Crm2PropertyStatus; to: Crm2PropertyStatus } | null;
  withDeals: boolean;
  /** Хүсэлтэд хадгалсан дуудлагууд (crm2_request_transfer_with_call), цагийн дарааллаар. */
  calls: RequestCallView[];
  /** = calls.length. */
  savedCalls: number;
};

export type PendingApprovals = {
  requests: PendingRequest[];
  /** Миний шийдвэрлэх ёстой тоо (цэсний тэмдэгт). */
  toDecide: number;
  /** Ачаалахад алдаа гарсан — хоосон дараалал гэж харуулахгүй. */
  error: boolean;
};

function payloadOf(r: Crm2RequestRow): Record<string, unknown> {
  return r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {};
}

async function boolOf(p: PromiseLike<{ data: boolean | null; error: { message: string } | null }>, label: string) {
  const { data, error } = await p;
  if (error) console.error(`crm2 ${label}:`, error.message);
  return !!data;
}

export async function listPendingApprovals(): Promise<PendingApprovals> {
  const supabase = await crm2Client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { requests: [], toDecide: 0, error: false };
  const me = user.id;

  const [requestsRes, names] = await Promise.all([
    supabase.from("crm2_requests").select(PENDING_REQUEST_SELECT).eq("status", "pending").order("requested_at", { ascending: true }).limit(200),
    getStaffNameMap(),
  ]);
  if (requestsRes.error) console.error("crm2 pending requests:", requestsRes.error.message);

  // ── Хүсэлт ──
  const reqs = (requestsRes.data ?? []) as Crm2RequestRow[];
  // Хүсэлтийн хөрөнгө + хадгалсан дуудлага бүрийн хөрөнгө (contact_transfer-д property_id хоосон).
  const propIds = [
    ...new Set(reqs.flatMap((r) => [r.property_id, ...requestCallPropertyIds(r.payload)]).filter((x): x is string => !!x)),
  ];
  const dealIds = reqs.filter((r) => r.kind === "deal_transfer").map((r) => r.target_id);
  const contactIds = reqs.filter((r) => r.kind === "contact_transfer").map((r) => r.target_id);
  const [props, deals, contacts, decide] = await Promise.all([
    propIds.length
      ? supabase.from("crm2_properties").select("id, code").in("id", propIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
    dealIds.length
      ? supabase.from("crm2_deals").select("id, code").in("id", dealIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
    contactIds.length
      ? supabase.from("crm2_contacts").select("id, code, full_name").in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; code: string; full_name: string }[], error: null }),
    Promise.all(reqs.map((r) => boolOf(supabase.rpc("crm2_can_decide_request", { p_request: r.id }), "can_decide_request"))),
  ]);
  const propCode = new Map((props.data ?? []).map((p) => [p.id, p.code]));
  const dealCode = new Map((deals.data ?? []).map((d) => [d.id, d.code]));
  const contactLabel = new Map((contacts.data ?? []).map((c) => [c.id, `${c.code} · ${c.full_name}`]));

  const requests: PendingRequest[] = reqs.map((r, i) => {
    const p = payloadOf(r);
    const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
    const fromAgent = str("from_agent");
    const toAgent = str("to_agent");
    const calls = parseRequestCalls(r.payload, propCode, names);
    const { label, visible } = requestTargetLabel(
      { kind: r.kind, targetId: r.target_id, propertyId: r.property_id, calls },
      { propCode, dealCode, contactLabel }
    );
    return {
      ...r,
      canDecide: decide[i] ?? false,
      mine: r.requested_by === me,
      requestedByName: names[r.requested_by] ?? null,
      fromAgentName: fromAgent ? (names[fromAgent] ?? null) : null,
      toAgentName: toAgent ? (names[toAgent] ?? null) : null,
      target: {
        label,
        propertyId: r.property_id,
        contactId: r.kind === "contact_transfer" ? r.target_id : null,
        dealId: r.kind === "deal_transfer" ? r.target_id : null,
        visible,
      },
      statusChange:
        r.kind === "property_status" && str("from") && str("to")
          ? { from: str("from") as Crm2PropertyStatus, to: str("to") as Crm2PropertyStatus }
          : null,
      withDeals: p.with_deals === true,
      calls,
      savedCalls: calls.length,
    };
  });

  const toDecide = requests.filter((r) => r.canDecide).length;
  return { requests, toDecide, error: !!requestsRes.error };
}

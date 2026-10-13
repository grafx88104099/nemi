import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import type { Json } from "@/types/database";
import type { CommissionRole, CommissionStatus, TxnType } from "@/lib/constants-crm";
import type { CommissionPolicyPayload } from "@/lib/crm/commission";

/**
 * Шимтгэлийн уншилтууд (U7). RLS = эрхийн давхарга:
 * агент зөвхөн өөрийн мөрөө (F-471), finance/SD/ЧМТ/CEO бүгдийг,
 * PM баг pm_team мөрүүдийг харна — эндээс дахин шүүхгүй.
 */

export type CommissionSource = "transaction" | "lease_monthly";

export type CommissionFilters = {
  status?: CommissionStatus;
  source?: CommissionSource;
  role?: CommissionRole;
  recipientId?: string;
  /** YYYY-MM — үүссэн огноогоор */
  month?: string;
  q?: string;
};

export type CommissionRow = {
  id: string;
  source_type: CommissionSource;
  transaction_id: string | null;
  lease_id: string | null;
  monthly_record_id: string | null;
  recipient_type: "agent" | "team" | "company";
  recipient_profile_id: string | null;
  recipient_name: string | null;
  role: CommissionRole;
  applied_rate_pct: number;
  base_amount: number;
  amount: number;
  paid_amount: number;
  status: CommissionStatus;
  hold_reason: string | null;
  created_at: string;
  txn_number: string | null;
  txn_type: TxnType | null;
  lease_number: string | null;
  record_month: string | null;
};

const LIST_SELECT =
  "id, source_type, transaction_id, lease_id, monthly_record_id, recipient_type, recipient_profile_id, " +
  "role, applied_rate_pct, base_amount, amount, paid_amount, status, hold_reason, created_at, " +
  "recipient:profiles(full_name), txn:crm_transactions(number, type), " +
  "lease:crm_leases(number), monthly:crm_monthly_records(month)";

type RawRow = Omit<CommissionRow, "recipient_name" | "txn_number" | "txn_type" | "lease_number" | "record_month"> & {
  recipient: { full_name: string | null } | null;
  txn: { number: string; type: TxnType } | null;
  lease: { number: string } | null;
  monthly: { month: string } | null;
};

function toRow(r: RawRow): CommissionRow {
  const { recipient, txn, lease, monthly, ...rest } = r;
  return {
    ...rest,
    applied_rate_pct: Number(rest.applied_rate_pct),
    base_amount: Number(rest.base_amount),
    amount: Number(rest.amount),
    paid_amount: Number(rest.paid_amount),
    recipient_name: recipient?.full_name ?? null,
    txn_number: txn?.number ?? null,
    txn_type: txn?.type ?? null,
    lease_number: lease?.number ?? null,
    record_month: monthly?.month ?? null,
  };
}

export async function getCommissions(filters: CommissionFilters = {}): Promise<CommissionRow[]> {
  const supabase = await createClient();
  let q = supabase.from("crm_commission_records").select(LIST_SELECT);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.source) q = q.eq("source_type", filters.source);
  if (filters.role) q = q.eq("role", filters.role);
  if (filters.recipientId) q = q.eq("recipient_profile_id", filters.recipientId);
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    q = q.gte("created_at", `${filters.month}-01`).lt("created_at", nextMonthIso(filters.month));
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
  if (error) {
    console.error("getCommissions:", error.message);
    return [];
  }
  let rows = ((data ?? []) as unknown as RawRow[]).map(toRow);
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.recipient_name ?? "").toLowerCase().includes(needle) ||
        (r.txn_number ?? "").toLowerCase().includes(needle) ||
        (r.lease_number ?? "").toLowerCase().includes(needle)
    );
  }
  return rows;
}

function nextMonthIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

// ── Нэгтгэл (жагсаалтын толгойн картууд, R-01 «өөрийн summary») ──

export type CommissionSummary = Record<CommissionStatus, { count: number; amount: number; paid: number }>;

export function summarize(rows: Pick<CommissionRow, "status" | "amount" | "paid_amount">[]): CommissionSummary {
  const empty = (): { count: number; amount: number; paid: number } => ({ count: 0, amount: 0, paid: 0 });
  const s: CommissionSummary = {
    calculated: empty(),
    reviewed: empty(),
    approved: empty(),
    paid: empty(),
    partially_paid: empty(),
    hold: empty(),
    cancelled: empty(),
  };
  for (const r of rows) {
    s[r.status].count += 1;
    s[r.status].amount += Number(r.amount);
    s[r.status].paid += Number(r.paid_amount);
  }
  return s;
}

// ── Дэлгэрэнгүй (задаргаа, нотолгоо, түүх — F-471/472/473) ──

export type CommissionHistoryRow = {
  id: string;
  from_status: CommissionStatus | null;
  to_status: CommissionStatus;
  decided_by: string | null;
  decided_name: string | null;
  note: string | null;
  created_at: string;
};

export type CommissionClawbackRow = {
  id: string;
  amount: number;
  reason_category: string;
  approved_by: string | null;
  approved_name: string | null;
  approved_at: string | null;
  created_at: string;
};

export type CommissionDisputeRow = {
  id: string;
  transaction_id: string;
  content: string;
  decision: string | null;
  rationale: string | null;
  created_by: string;
  creator_name: string | null;
  decider_name: string | null;
  created_at: string;
};

export type CommissionDetail = CommissionRow & {
  evidence: Record<string, unknown>;
  config: { id: string; policy_code: string; payload: CommissionPolicyPayload; valid_from: string } | null;
  txn_detail: {
    id: string;
    number: string;
    type: TxnType;
    amount_mnt: number;
    closed_on: string | null;
    file_completeness_pct: number;
  } | null;
  monthly_detail: {
    id: string;
    month: string;
    net_income: number | null;
    completeness_pct: number;
    commission_hold: boolean;
  } | null;
  history: CommissionHistoryRow[];
  clawbacks: CommissionClawbackRow[];
  disputes: CommissionDisputeRow[];
};

export async function getCommission(id: string): Promise<CommissionDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_commission_records")
    .select(
      "id, source_type, transaction_id, lease_id, monthly_record_id, recipient_type, recipient_profile_id, " +
        "role, applied_rate_pct, base_amount, amount, paid_amount, status, hold_reason, evidence, created_at, " +
        "recipient:profiles(full_name), " +
        "config:crm_commission_config_versions(id, policy_code, payload, valid_from), " +
        "txn:crm_transactions(id, number, type, amount_mnt, closed_on, file_completeness_pct), " +
        "lease:crm_leases(number), " +
        "monthly:crm_monthly_records(id, month, net_income, completeness_pct, commission_hold)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getCommission:", error.message);
    return null;
  }
  if (!data) return null;

  type RawDetail = {
    id: string;
    source_type: CommissionSource;
    transaction_id: string | null;
    lease_id: string | null;
    monthly_record_id: string | null;
    recipient_type: "agent" | "team" | "company";
    recipient_profile_id: string | null;
    role: CommissionRole;
    applied_rate_pct: number;
    base_amount: number;
    amount: number;
    paid_amount: number;
    status: CommissionStatus;
    hold_reason: string | null;
    evidence: Json;
    created_at: string;
    recipient: { full_name: string | null } | null;
    config: { id: string; policy_code: string; payload: Json; valid_from: string } | null;
    txn: {
      id: string;
      number: string;
      type: TxnType;
      amount_mnt: number;
      closed_on: string | null;
      file_completeness_pct: number;
    } | null;
    lease: { number: string } | null;
    monthly: {
      id: string;
      month: string;
      net_income: number | null;
      completeness_pct: number;
      commission_hold: boolean;
    } | null;
  };
  const raw = data as unknown as RawDetail;

  const [historyRes, clawbackRes, disputeRes] = await Promise.all([
    supabase
      .from("crm_commission_status_history")
      .select("id, from_status, to_status, decided_by, note, created_at, decider:profiles(full_name)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_commission_clawbacks")
      .select("id, amount, reason_category, approved_by, approved_at, created_at, approver:profiles(full_name)")
      .eq("record_id", id)
      .order("created_at", { ascending: false }),
    raw.transaction_id
      ? supabase
          .from("crm_commission_disputes")
          .select(
            "id, transaction_id, content, decision, rationale, created_by, created_at, " +
              "creator:profiles!crm_commission_disputes_created_by_fkey(full_name), " +
              "decider:profiles!crm_commission_disputes_decided_by_fkey(full_name)"
          )
          .eq("transaction_id", raw.transaction_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  type RawHist = Omit<CommissionHistoryRow, "decided_name"> & { decider: { full_name: string | null } | null };
  type RawClaw = Omit<CommissionClawbackRow, "approved_name"> & { approver: { full_name: string | null } | null };
  type RawDisp = Omit<CommissionDisputeRow, "creator_name" | "decider_name"> & {
    creator: { full_name: string | null } | null;
    decider: { full_name: string | null } | null;
  };

  return {
    id: raw.id,
    source_type: raw.source_type,
    transaction_id: raw.transaction_id,
    lease_id: raw.lease_id,
    monthly_record_id: raw.monthly_record_id,
    recipient_type: raw.recipient_type,
    recipient_profile_id: raw.recipient_profile_id,
    recipient_name: raw.recipient?.full_name ?? null,
    role: raw.role,
    applied_rate_pct: Number(raw.applied_rate_pct),
    base_amount: Number(raw.base_amount),
    amount: Number(raw.amount),
    paid_amount: Number(raw.paid_amount),
    status: raw.status,
    hold_reason: raw.hold_reason,
    created_at: raw.created_at,
    txn_number: raw.txn?.number ?? null,
    txn_type: raw.txn?.type ?? null,
    lease_number: raw.lease?.number ?? null,
    record_month: raw.monthly?.month ?? null,
    evidence: (raw.evidence ?? {}) as Record<string, unknown>,
    config: raw.config
      ? {
          id: raw.config.id,
          policy_code: raw.config.policy_code,
          payload: (raw.config.payload ?? {}) as CommissionPolicyPayload,
          valid_from: raw.config.valid_from,
        }
      : null,
    txn_detail: raw.txn
      ? { ...raw.txn, amount_mnt: Number(raw.txn.amount_mnt), file_completeness_pct: Number(raw.txn.file_completeness_pct) }
      : null,
    monthly_detail: raw.monthly
      ? {
          ...raw.monthly,
          net_income: raw.monthly.net_income == null ? null : Number(raw.monthly.net_income),
          completeness_pct: Number(raw.monthly.completeness_pct),
        }
      : null,
    history: ((historyRes.data ?? []) as unknown as RawHist[]).map(({ decider, ...h }) => ({
      ...h,
      decided_name: decider?.full_name ?? null,
    })),
    clawbacks: ((clawbackRes.data ?? []) as unknown as RawClaw[]).map(({ approver, ...c }) => ({
      ...c,
      amount: Number(c.amount),
      approved_name: approver?.full_name ?? null,
    })),
    disputes: ((disputeRes.data ?? []) as unknown as RawDisp[]).map(({ creator, decider, ...d }) => ({
      ...d,
      creator_name: creator?.full_name ?? null,
      decider_name: decider?.full_name ?? null,
    })),
  };
}

// ── Тооцооны хуудас (F-472 — журмын талбарын бүтцээр print) ──

export type CommissionSheet = { detail: CommissionDetail; officeName: string | null };

export async function getCommissionSheet(id: string): Promise<CommissionSheet | null> {
  const detail = await getCommission(id);
  if (!detail) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let officeName: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("crm_staff")
      .select("office_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (staff?.office_id) {
      const { data: office } = await supabase.from("offices").select("name").eq("id", staff.office_id).maybeSingle();
      officeName = office?.name ?? null;
    }
  }
  return { detail, officeName };
}

// ── Тохиргооны хувилбарууд (F-452/453) ────────────────────

export type CommissionConfigRow = {
  id: string;
  policy_code: string;
  payload: CommissionPolicyPayload;
  valid_from: string;
  valid_to: string | null;
  created_by: string;
  created_at: string;
};

export async function getCommissionConfigs(): Promise<CommissionConfigRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_commission_config_versions")
    .select("id, policy_code, payload, valid_from, valid_to, created_by, created_at")
    .order("policy_code")
    .order("valid_from", { ascending: false });
  if (error) console.error("getCommissionConfigs:", error.message);
  return ((data ?? []) as unknown as CommissionConfigRow[]).map((r) => ({
    ...r,
    payload: (r.payload ?? {}) as CommissionPolicyPayload,
  }));
}

// ── Хүлээгдэж буй ажил (тооцооллын товчнуудын badge) ──────

export type TxnOption = { id: string; number: string; type: TxnType; closed_on: string | null };

/** F-454 гээгдэл: хаагдсан ч тооцоо үүсээгүй хэлцлүүд (менежерийн харагдац). */
export async function getClosedTxnsWithoutCommission(): Promise<TxnOption[]> {
  const supabase = await createClient();
  const { data: closed, error } = await supabase
    .from("crm_transactions")
    .select("id, number, type, closed_on")
    .eq("status", "closed")
    .order("closed_on", { ascending: false })
    .limit(100);
  if (error) {
    console.error("getClosedTxnsWithoutCommission:", error.message);
    return [];
  }
  const ids = (closed ?? []).map((t) => t.id);
  if (!ids.length) return [];
  const { data: existing } = await supabase
    .from("crm_commission_records")
    .select("transaction_id")
    .in("transaction_id", ids);
  const covered = new Set((existing ?? []).map((r) => r.transaction_id));
  return ((closed ?? []) as TxnOption[]).filter((t) => !covered.has(t.id));
}

/**
 * F-466 дараалал: хүлээгдэж буй PM тооцооны гүйлтийн тоо.
 * crm_rule_runs-ийн select policy sysadmin/ops_qc/ceo-д л нээлттэй тул
 * дарааллын тоолуурыг app-түвшний дүрийн шалгалт + admin client-ээр уншина
 * (finance/SD-д ч badge харагдана; бичих зам үүгээр нээгдэхгүй).
 */
export async function getPendingPmRunCount(): Promise<number> {
  const ctx = await getCrmStaffContext();
  if (!ctx || !ctx.roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo", "sysadmin"].includes(r))) {
    return 0;
  }
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("crm_rule_runs")
    .select("id", { count: "exact", head: true })
    .eq("office_id", ctx.officeId)
    .eq("rule_code", "F-466")
    .eq("status", "pending");
  if (error) {
    console.error("getPendingPmRunCount:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** F-462 дараалал: цуцлагдсан хэлцлүүд — шимтгэлийн rollback хүлээж буй (U5-ийн trigger бичдэг). */
export async function getPendingRollbackTxns(): Promise<TxnOption[]> {
  const ctx = await getCrmStaffContext();
  if (!ctx || !ctx.roles.some((r) => ["finance", "sales_director", "ops_qc", "ceo"].includes(r))) {
    return [];
  }
  const admin = createAdminClient();
  const { data: runs, error } = await admin
    .from("crm_rule_runs")
    .select("entity_id")
    .eq("office_id", ctx.officeId)
    .eq("rule_code", "F-462")
    .eq("entity", "crm_transactions")
    .eq("status", "pending")
    .limit(50);
  if (error) {
    console.error("getPendingRollbackTxns:", error.message);
    return [];
  }
  const ids = [...new Set((runs ?? []).map((r) => r.entity_id).filter((x): x is string => Boolean(x)))];
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data: txns } = await supabase
    .from("crm_transactions")
    .select("id, number, type, closed_on")
    .in("id", ids);
  return (txns ?? []) as TxnOption[];
}

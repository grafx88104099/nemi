import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { AmlCaseStatus, KycStatus, TxnStatus, TxnType } from "@/lib/constants-crm";

/**
 * МУТСТ хязгаарлагдмал бүсийн уншилтууд (U5 — §3.3, ToR §7.6.5).
 * Кейсийн жагсаалт/дэлгэрэнгүй ШУУД select биш — definer RPC
 * (crm_get_aml_case/crm_get_aml_cases): RPC дотроо aml_officer/ceo эрх
 * шалгаад үзэлт БҮРИЙГ crm_audit_log-т бичнэ (D7-5).
 */

export type AmlCaseRow = {
  id: string;
  status: AmlCaseStatus;
  contact_id: string;
  contact_name: string;
  kyc_public_status: KycStatus;
  transaction_id: string | null;
  transaction_number: string | null;
  transaction_status: TxnStatus | null;
  amount_mnt: number | null;
  str_due_at: string | null;
  threshold_due_on: string | null;
  decision: string | null;
  officer_id: string | null;
  alert_count: number;
  on_hold: boolean;
  created_at: string;
  updated_at: string;
};

export async function getAmlCases(status?: AmlCaseStatus): Promise<AmlCaseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_get_aml_cases", {
    p_status: status ?? null,
  });
  if (error) {
    console.error("getAmlCases:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as AmlCaseRow[]) ?? [];
}

export type AmlAlertRow = {
  id: string;
  alert_kind: "manual" | "threshold";
  detected_at: string;
  category: string | null;
  observed: string | null;
  amount_mnt: number | null;
  payment_method: string | null;
  parties: Json | null;
  urgent: boolean;
  reported_by: string;
  created_at: string;
};

export type AmlHoldRow = {
  id: string;
  transaction_id: string;
  placed_at: string;
  placed_by: string;
  rationale: string;
  released_at: string | null;
  release_rationale: string | null;
};

export type ContactAmlRow = {
  contact_id: string;
  kyc_status: KycStatus;
  risk: string | null;
  risk_score: number | null;
  pep_status: string | null;
  sanctions_checked_at: string | null;
  sanctions_result: string | null;
  ubo_verified: string | null;
  funds_source: string | null;
  payment_method: string | null;
  third_party_payer: boolean | null;
  third_party_note: string | null;
  red_flags: string[] | null;
  officer_decision: string | null;
  reporting_status: string | null;
  next_review_at: string | null;
  updated_at: string;
};

export type AmlCaseDetail = {
  id: string;
  status: AmlCaseStatus;
  gate_checks: Record<string, Json>;
  str_due_at: string | null;
  threshold_due_on: string | null;
  decision: string | null;
  decision_rationale: string | null;
  officer_id: string | null;
  created_at: string;
  updated_at: string;
  contact: { id: string; display_name: string; kyc_public_status: KycStatus; kind: string } | null;
  contact_aml: ContactAmlRow | null;
  transaction: {
    id: string;
    number: string;
    type: TxnType;
    status: TxnStatus;
    amount_mnt: number;
    on_hold: boolean;
  } | null;
  alerts: AmlAlertRow[];
  holds: AmlHoldRow[];
};

export async function getAmlCase(id: string): Promise<AmlCaseDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_get_aml_case", { p_id: id });
  if (error) {
    console.error("getAmlCase:", error.message);
    return null;
  }
  return (data as unknown as AmlCaseDetail) ?? null;
}

/** Харилцагчийн МУТСТ бүртгэл — RLS зөвхөн aml_officer-т мөр буцаана. */
export async function getContactAml(contactId: string): Promise<ContactAmlRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_contact_aml")
    .select(
      "contact_id, kyc_status, risk, risk_score, pep_status, sanctions_checked_at, sanctions_result, " +
        "ubo_verified, funds_source, payment_method, third_party_payer, third_party_note, red_flags, " +
        "officer_decision, reporting_status, next_review_at, updated_at"
    )
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) {
    console.error("getContactAml:", error.message);
    return null;
  }
  return (data as unknown as ContactAmlRow) ?? null;
}

/** Кейст холбогдоогүй (шинэ) дохионууд — RLS officer/ceo. */
export async function getUnassignedAlerts(): Promise<AmlAlertRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_aml_alerts")
    .select(
      "id, alert_kind, detected_at, category, observed, amount_mnt, payment_method, parties, urgent, reported_by, created_at"
    )
    .is("case_id", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("getUnassignedAlerts:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AmlAlertRow[];
}

export type ActiveHoldRow = AmlHoldRow & {
  transaction_number: string | null;
  transaction_status: TxnStatus | null;
};

/** Идэвхтэй hold-ууд (R-13 самбар) — RLS officer/ceo. */
export async function getActiveHolds(): Promise<ActiveHoldRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_aml_holds")
    .select(
      "id, transaction_id, placed_at, placed_by, rationale, released_at, release_rationale, " +
        "transaction:crm_transactions!crm_aml_holds_transaction_id_fkey(number, status)"
    )
    .is("released_at", null)
    .order("placed_at", { ascending: false });
  if (error) {
    console.error("getActiveHolds:", error.message);
    return [];
  }
  type Raw = AmlHoldRow & { transaction: { number: string; status: TxnStatus } | null };
  return ((data ?? []) as unknown as Raw[]).map(({ transaction, ...h }) => ({
    ...h,
    transaction_number: transaction?.number ?? null,
    transaction_status: transaction?.status ?? null,
  }));
}

/** R-13 тоолуурууд: 5 өдрийн босго + 24ц СГТ дөхөж буй кейсүүд. */
export type AmlCounters = {
  openCases: number;
  thresholdDueSoon: number; // threshold_due_on ≤ өнөөдөр+1
  strDueSoon: number; // str_due_at ≤ одоо+6ц
  activeHolds: number;
};

export function getAmlCounters(cases: AmlCaseRow[], holds: ActiveHoldRow[]): AmlCounters {
  const now = Date.now();
  const soonDate = new Date(now + 86400000).toISOString().slice(0, 10);
  const strSoon = new Date(now + 6 * 3600000).toISOString();
  const open = cases.filter((c) => c.status === "open" || c.status === "investigating");
  return {
    openCases: open.length,
    thresholdDueSoon: open.filter((c) => c.threshold_due_on && c.threshold_due_on <= soonDate).length,
    strDueSoon: cases.filter(
      (c) => c.status !== "closed" && c.str_due_at && c.str_due_at <= strSoon
    ).length,
    activeHolds: holds.length,
  };
}

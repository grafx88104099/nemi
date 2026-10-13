import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type {
  TxnType,
  TxnStatus,
  PartyRole,
  CommissionRole,
  DocCategory,
} from "@/lib/constants-crm";

/**
 * Хэлцлийн уншилтууд (U5 — F-400–421). RLS = эрхийн давхарга:
 * боломжийн эрх дагана (finance ●, aml ○) — эндээс дахин шүүхгүй.
 */

// ── Жагсаалт (F-418) ──────────────────────────────────────

export type TxnFilters = {
  type?: TxnType;
  status?: TxnStatus;
  agentId?: string;
  from?: string; // opened_on ≥
  to?: string; // opened_on ≤
  q?: string; // дугаараар
};

export type TxnRow = {
  id: string;
  number: string;
  type: TxnType;
  status: TxnStatus;
  amount: number;
  currency: string;
  amount_mnt: number;
  opened_on: string;
  contracted_on: string | null;
  closed_on: string | null;
  file_completeness_pct: number;
  aml_hold: boolean;
  owner_id: string;
  owner_name: string | null;
  property_name: string | null;
  property_number: string | null;
  opportunity_id: string;
};

const TXN_LIST_SELECT =
  "id, number, type, status, amount, currency, amount_mnt, opened_on, contracted_on, closed_on, " +
  "file_completeness_pct, opportunity_id, " +
  "opportunity:crm_opportunities!crm_transactions_opportunity_id_fkey!inner(owner_id, aml_hold, " +
  "owner:profiles!crm_opportunities_owner_id_fkey(full_name)), " +
  "property:crm_properties!crm_transactions_property_id_fkey(name, number)";

type RawTxnRow = Omit<
  TxnRow,
  "owner_id" | "owner_name" | "property_name" | "property_number" | "aml_hold"
> & {
  opportunity: { owner_id: string; aml_hold: boolean; owner: { full_name: string | null } | null };
  property: { name: string; number: string } | null;
};

function toTxnRow(r: RawTxnRow): TxnRow {
  const { opportunity, property, ...rest } = r;
  return {
    ...rest,
    owner_id: opportunity.owner_id,
    owner_name: opportunity.owner?.full_name ?? null,
    aml_hold: opportunity.aml_hold,
    property_name: property?.name ?? null,
    property_number: property?.number ?? null,
  };
}

export async function getTransactions(filters: TxnFilters = {}): Promise<TxnRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_transactions")
    .select(TXN_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(300);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.agentId) query = query.eq("opportunity.owner_id", filters.agentId);
  if (filters.from) query = query.gte("opened_on", filters.from);
  if (filters.to) query = query.lte("opened_on", filters.to);
  if (filters.q?.trim()) query = query.ilike("number", `%${filters.q.trim()}%`);
  const { data, error } = await query;
  if (error) console.error("getTransactions:", error.message);
  return ((data ?? []) as unknown as RawTxnRow[]).map(toTxnRow);
}

// ── Дэлгэрэнгүй (хавтас) ──────────────────────────────────

export type TxnParty = {
  id: string;
  contact_id: string;
  role: PartyRole;
  contact_name: string;
  kyc_public_status: string;
};

export type TxnAgentRole = {
  id: string;
  agent_profile_id: string;
  role: CommissionRole;
  split_pct: number | null;
  agent_name: string | null;
};

export type TxnContract = {
  id: string;
  contract_type: string;
  number: string;
  signed_on: string | null;
  valid_from: string | null;
  valid_to: string | null;
  doc_id: string | null;
};

export type TxnScheduleLine = {
  id: string;
  due_on: string;
  amount: number;
  kind: string;
  note: string | null;
  paid_amount: number;
};

export type TxnHandoverItem = {
  id: string;
  label: string;
  done: boolean;
  done_on: string | null;
  responsible_id: string | null;
  sort_order: number;
};

export type TxnApproval = {
  id: string;
  requested_by: string;
  requester_name: string | null;
  rationale: string;
  fee_change: string;
  approved_amount: number | null;
  approved_by: string | null;
  approver_name: string | null;
  approved_at: string | null;
  doc_id: string | null;
  created_at: string;
};

export type TxnDetail = {
  id: string;
  number: string;
  type: TxnType;
  status: TxnStatus;
  opportunity_id: string;
  property_id: string;
  amount: number;
  currency: string;
  fx_rate: number;
  fx_rate_source: string;
  amount_mnt: number;
  opened_on: string;
  contracted_on: string | null;
  closed_on: string | null;
  aml_case_id: string | null;
  original_transaction_id: string | null;
  original_number: string | null;
  file_completeness_pct: number;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  zero_fee_note: string | null;
  created_by: string;
  created_at: string;
  on_hold: boolean;
  owner_id: string;
  owner_name: string | null;
  contact_id: string;
  contact_name: string;
  property_name: string | null;
  property_number: string | null;
  pipeline_code: string | null;
  parties: TxnParty[];
  agent_roles: TxnAgentRole[];
  contracts: TxnContract[];
  schedule: TxnScheduleLine[];
  handover: TxnHandoverItem[];
  approvals: TxnApproval[];
};

const TXN_DETAIL_SELECT =
  "id, number, type, status, opportunity_id, property_id, amount, currency, fx_rate, fx_rate_source, " +
  "amount_mnt, opened_on, contracted_on, closed_on, aml_case_id, original_transaction_id, " +
  "file_completeness_pct, cancellation_reason, cancelled_at, zero_fee_note, created_by, created_at, " +
  "original:crm_transactions!crm_transactions_original_transaction_id_fkey(number), " +
  "opportunity:crm_opportunities!crm_transactions_opportunity_id_fkey(owner_id, contact_id, " +
  "owner:profiles!crm_opportunities_owner_id_fkey(full_name), " +
  "contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name), " +
  "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(code)), " +
  "property:crm_properties!crm_transactions_property_id_fkey(name, number), " +
  "parties:crm_transaction_parties(id, contact_id, role, " +
  "contact:crm_contacts!crm_transaction_parties_contact_id_fkey(display_name, kyc_public_status)), " +
  "agent_roles:crm_transaction_agent_roles(id, agent_profile_id, role, split_pct, " +
  "agent:profiles!crm_transaction_agent_roles_agent_profile_id_fkey(full_name)), " +
  "contracts:crm_transaction_contracts(id, contract_type, number, signed_on, valid_from, valid_to, doc_id), " +
  "schedule:crm_payment_schedule_lines(id, due_on, amount, kind, note, paid_amount), " +
  "handover:crm_handover_items(id, label, done, done_on, responsible_id, sort_order), " +
  "approvals:crm_transaction_approvals(id, requested_by, rationale, fee_change, approved_amount, " +
  "approved_by, approved_at, doc_id, created_at, " +
  "requester:profiles!crm_transaction_approvals_requested_by_fkey(full_name), " +
  "approver:profiles!crm_transaction_approvals_approved_by_fkey(full_name))";

export async function getTransaction(id: string): Promise<TxnDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_transactions")
    .select(TXN_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getTransaction:", error.message);
    return null;
  }
  if (!data) return null;

  type Raw = Omit<
    TxnDetail,
    | "on_hold"
    | "owner_id"
    | "owner_name"
    | "contact_id"
    | "contact_name"
    | "property_name"
    | "property_number"
    | "pipeline_code"
    | "original_number"
    | "parties"
    | "agent_roles"
    | "approvals"
  > & {
    original: { number: string } | null;
    opportunity: {
      owner_id: string;
      contact_id: string;
      owner: { full_name: string | null } | null;
      contact: { display_name: string } | null;
      pipeline: { code: string } | null;
    } | null;
    property: { name: string; number: string } | null;
    parties: (Omit<TxnParty, "contact_name" | "kyc_public_status"> & {
      contact: { display_name: string; kyc_public_status: string } | null;
    })[];
    agent_roles: (Omit<TxnAgentRole, "agent_name"> & { agent: { full_name: string | null } | null })[];
    approvals: (Omit<TxnApproval, "requester_name" | "approver_name"> & {
      requester: { full_name: string | null } | null;
      approver: { full_name: string | null } | null;
    })[];
  };
  const raw = data as unknown as Raw;

  const { data: onHold } = await supabase.rpc("crm_txn_on_hold", { t: id });

  const { original, opportunity, property, parties, agent_roles, approvals, ...rest } = raw;
  return {
    ...rest,
    on_hold: Boolean(onHold),
    original_number: original?.number ?? null,
    owner_id: opportunity?.owner_id ?? "",
    owner_name: opportunity?.owner?.full_name ?? null,
    contact_id: opportunity?.contact_id ?? "",
    contact_name: opportunity?.contact?.display_name ?? "?",
    pipeline_code: opportunity?.pipeline?.code ?? null,
    property_name: property?.name ?? null,
    property_number: property?.number ?? null,
    parties: parties.map(({ contact, ...p }) => ({
      ...p,
      contact_name: contact?.display_name ?? "?",
      kyc_public_status: contact?.kyc_public_status ?? "pending",
    })),
    agent_roles: agent_roles.map(({ agent, ...r }) => ({
      ...r,
      agent_name: agent?.full_name ?? null,
    })),
    approvals: approvals
      .map(({ requester, approver, ...a }) => ({
        ...a,
        requester_name: requester?.full_name ?? null,
        approver_name: approver?.full_name ?? null,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    schedule: [...rest.schedule].sort((a, b) => (a.due_on < b.due_on ? -1 : 1)),
    handover: [...rest.handover].sort((a, b) => a.sort_order - b.sort_order),
  };
}

// ── Бүрэн байдлын задаргаа (F-409) ────────────────────────

export type CompletenessDetail = {
  pct: number;
  required: { category: DocCategory | string; label: string; present: boolean }[];
};

const DEFAULT_REQUIRED_DOCS: Record<string, string[]> = {
  sale: ["contract", "payment_proof", "ownership", "identity"],
  international_sale: ["contract", "payment_proof", "ownership", "identity"],
  standard_rental: ["contract", "payment_proof", "identity"],
  managed_rental: ["contract", "payment_proof", "identity"],
  replacement: ["contract", "payment_proof", "identity"],
};

export async function getCompleteness(id: string): Promise<CompletenessDetail> {
  const supabase = await createClient();
  const { data: txn } = await supabase
    .from("crm_transactions")
    .select("type, file_completeness_pct")
    .eq("id", id)
    .maybeSingle();
  if (!txn) return { pct: 0, required: [] };

  const { data: tpl } = await supabase
    .from("crm_checklist_templates")
    .select("items")
    .eq("scope", `required_docs_${txn.type}`)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let required: { category: string; label: string }[] = [];
  if (tpl?.items && Array.isArray(tpl.items)) {
    required = (tpl.items as { label?: string; required?: boolean; doc_category?: string }[])
      .filter((i) => (i.required ?? true) && i.doc_category)
      .map((i) => ({ category: i.doc_category as string, label: i.label ?? (i.doc_category as string) }));
  }
  if (required.length === 0) {
    required = (DEFAULT_REQUIRED_DOCS[txn.type] ?? []).map((c) => ({ category: c, label: c }));
  }

  const { data: links } = await supabase
    .from("crm_document_links")
    .select("document:crm_documents!crm_document_links_document_id_fkey(category)")
    .eq("entity", "transaction")
    .eq("entity_id", id);
  const have = new Set(
    ((links ?? []) as unknown as { document: { category: string } | null }[])
      .map((l) => l.document?.category)
      .filter(Boolean) as string[]
  );

  return {
    pct: txn.file_completeness_pct,
    required: required.map((r) => ({ ...r, present: have.has(r.category) })),
  };
}

// ── Туслах сонголтууд ─────────────────────────────────────

export type OppOption = {
  id: string;
  contact_name: string;
  property_id: string | null;
  property_name: string | null;
  amount: number | null;
  currency: string;
  pipeline_code: string;
};

/** Хэлцэл үүсгэх боломжтой нээлттэй боломжууд (идэвхтэй хэлцэлгүй). */
export async function getOpenOppOptions(): Promise<OppOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_opportunities")
    .select(
      "id, amount, currency, property_id, " +
        "contact:crm_contacts!crm_opportunities_contact_id_fkey(display_name), " +
        "property:crm_properties!crm_opportunities_property_id_fkey(name), " +
        "pipeline:crm_pipelines!crm_opportunities_pipeline_id_fkey(code)"
    )
    .eq("state", "open")
    .limit(300);
  if (error) console.error("getOpenOppOptions:", error.message);

  const { data: txns } = await supabase
    .from("crm_transactions")
    .select("opportunity_id")
    .neq("status", "cancelled");
  const taken = new Set((txns ?? []).map((t) => t.opportunity_id));

  type Raw = {
    id: string;
    amount: number | null;
    currency: string;
    property_id: string | null;
    contact: { display_name: string } | null;
    property: { name: string } | null;
    pipeline: { code: string } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((o) => !taken.has(o.id))
    .map((o) => ({
      id: o.id,
      contact_name: o.contact?.display_name ?? "?",
      property_id: o.property_id,
      property_name: o.property?.name ?? null,
      amount: o.amount,
      currency: o.currency,
      pipeline_code: o.pipeline?.code ?? "?",
    }));
}

export type ContactOption = { id: string; display_name: string };

/** Талуудын сонголтод — эрхийн хүрээний харилцагчид (RLS шүүнэ). */
export async function getContactOptions(q?: string): Promise<ContactOption[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_contacts").select("id, display_name").order("display_name").limit(200);
  if (q?.trim()) query = query.ilike("display_name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error) console.error("getContactOptions:", error.message);
  return (data ?? []) as ContactOption[];
}

// ── Аудитын мөр (AuditTrail — RLS: ops_qc/sysadmin/ceo/SD/finance) ──

export type AuditRow = {
  id: number;
  actor_id: string | null;
  entity: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: Json | null;
  new_value: Json | null;
  reason: string | null;
  created_at: string;
};

export async function getAuditTrail(entity: string, entityId: string, limit = 50): Promise<AuditRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_audit_log")
    .select("id, actor_id, entity, entity_id, action, field, old_value, new_value, reason, created_at")
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // RLS-ээр хаалттай дүрд хоосон — алдаа биш.
    return [];
  }
  return (data ?? []) as AuditRow[];
}

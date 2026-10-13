import { createClient } from "@/lib/supabase/server";
import { agingBucket, type AgingBucket } from "@/lib/crm/arrears";
import type {
  CrmRole,
  ExpenseBearer,
  InspectionKind,
  InvoiceStatus,
  InvoiceType,
  LeaseStatus,
  MaintenanceStatus,
  PaymentKind,
  Urgency,
} from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * Түрээсийн менежментийн уншилтууд (U6 — M8). RLS = эрхийн давхарга;
 * эндээс дүрээр дахин шүүхгүй (queries-tasks.ts конвенц).
 */

// ── Түрээсийн гэрээ ───────────────────────────────────────

export type LeaseFilters = {
  status?: LeaseStatus;
  managed?: boolean;
  propertyId?: string;
  q?: string;
  /** Дуусахад ≤N хоног үлдсэн идэвхтэй гэрээ (R-08 хяналт). */
  expiringDays?: number;
};

export type LeaseRow = {
  id: string;
  number: string;
  status: LeaseStatus;
  start_on: string;
  end_on: string;
  monthly_rent: number;
  payment_day: number;
  is_managed: boolean;
  duration_tier: string | null;
  property_id: string;
  property_number: string | null;
  property_name: string | null;
  tenant_name: string | null;
  landlord_name: string | null;
};

const LEASE_LIST_SELECT =
  "id, number, status, start_on, end_on, monthly_rent, payment_day, is_managed, duration_tier, property_id, " +
  "property:crm_properties!crm_leases_property_id_fkey(number, name), " +
  "tenant:crm_contacts!crm_leases_tenant_contact_id_fkey(display_name), " +
  "landlord:crm_contacts!crm_leases_landlord_contact_id_fkey(display_name)";

type LeaseListRaw = Omit<LeaseRow, "property_number" | "property_name" | "tenant_name" | "landlord_name"> & {
  property: { number: string; name: string } | null;
  tenant: { display_name: string } | null;
  landlord: { display_name: string } | null;
};

function toLeaseRow(r: LeaseListRaw): LeaseRow {
  const { property, tenant, landlord, ...rest } = r;
  return {
    ...rest,
    property_number: property?.number ?? null,
    property_name: property?.name ?? null,
    tenant_name: tenant?.display_name ?? null,
    landlord_name: landlord?.display_name ?? null,
  };
}

export async function getLeases(filters: LeaseFilters = {}): Promise<LeaseRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_leases").select(LEASE_LIST_SELECT).order("end_on", { ascending: true });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.managed != null) query = query.eq("is_managed", filters.managed);
  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters.q) query = query.ilike("number", `%${filters.q}%`);
  if (filters.expiringDays != null) {
    const limit = new Date();
    limit.setDate(limit.getDate() + filters.expiringDays);
    query = query.eq("status", "active").lte("end_on", limit.toISOString().slice(0, 10));
  }
  const { data, error } = await query;
  if (error) console.error("getLeases:", error.message);
  return ((data ?? []) as unknown as LeaseListRaw[]).map(toLeaseRow);
}

export type LeaseChainLink = {
  id: string;
  number: string;
  status: LeaseStatus;
  start_on: string;
  end_on: string;
  monthly_rent: number;
};

export type LeaseInvoiceRow = {
  id: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  period_month: string | null;
  issued_on: string;
  due_on: string;
  amount: number;
  paid_mnt: number;
};

export type LeasePaymentRow = {
  id: string;
  kind: PaymentKind;
  invoice_id: string | null;
  paid_on: string;
  amount: number;
  currency: string;
  amount_mnt: number;
  method: string;
  finance_verified_at: string | null;
};

export type DeductionRow = {
  id: string;
  category: string;
  amount: number;
  rationale: string;
  evidence_inspection_item_id: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type InspectionItemRow = {
  id: string;
  inspection_id: string;
  room: string | null;
  item: string;
  condition: string;
  note: string | null;
  matched_item_id: string | null;
  discrepancy: boolean;
};

export type InspectionRow = {
  id: string;
  kind: InspectionKind;
  inspected_on: string;
  confirmed_by_tenant: boolean;
  items: InspectionItemRow[];
};

export type ExpenseLineRow = { expense_type: string; bearer: ExpenseBearer };

export type LeaseDetail = {
  id: string;
  office_id: string;
  number: string;
  status: LeaseStatus;
  property_id: string;
  property_number: string | null;
  property_name: string | null;
  tenant_contact_id: string;
  tenant_name: string | null;
  landlord_contact_id: string;
  landlord_name: string | null;
  transaction_id: string | null;
  start_on: string;
  end_on: string;
  monthly_rent: number;
  payment_day: number;
  grace_days: number;
  deposit_amount: number;
  deposit_holder: ExpenseBearer | null;
  deposit_received_on: string | null;
  deposit_returned_on: string | null;
  deposit_returned_amount: number | null;
  is_managed: boolean;
  management_agreement_id: string | null;
  agreement_number: string | null;
  agreement_fee_pct: number | null;
  duration_tier: string | null;
  status_created_by: string;
  signed_doc_id: string | null;
  previous_lease_id: string | null;
  termination_reason: string | null;
  created_at: string;
  chain: LeaseChainLink[];
  expense_lines: ExpenseLineRow[];
  invoices: LeaseInvoiceRow[];
  payments: LeasePaymentRow[];
  deductions: DeductionRow[];
  inspections: InspectionRow[];
};

export async function getLease(id: string): Promise<LeaseDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_leases")
    .select(
      "id, office_id, number, status, property_id, tenant_contact_id, landlord_contact_id, transaction_id, " +
        "start_on, end_on, monthly_rent, payment_day, grace_days, deposit_amount, deposit_holder, " +
        "deposit_received_on, deposit_returned_on, deposit_returned_amount, is_managed, management_agreement_id, " +
        "duration_tier, previous_lease_id, termination_reason, signed_doc_id, created_by, created_at, " +
        "property:crm_properties!crm_leases_property_id_fkey(number, name), " +
        "tenant:crm_contacts!crm_leases_tenant_contact_id_fkey(display_name), " +
        "landlord:crm_contacts!crm_leases_landlord_contact_id_fkey(display_name), " +
        "agreement:crm_management_agreements!crm_leases_management_agreement_id_fkey(number, fee_pct), " +
        "expense_lines:crm_lease_expense_lines(expense_type, bearer), " +
        "deductions:crm_deposit_deductions(id, category, amount, rationale, evidence_inspection_item_id, approved_by, approved_at)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getLease:", error.message);
    return null;
  }
  if (!data) return null;

  type Raw = {
    id: string;
    office_id: string;
    number: string;
    status: LeaseStatus;
    property_id: string;
    tenant_contact_id: string;
    landlord_contact_id: string;
    transaction_id: string | null;
    start_on: string;
    end_on: string;
    monthly_rent: number;
    payment_day: number;
    grace_days: number;
    deposit_amount: number;
    deposit_holder: ExpenseBearer | null;
    deposit_received_on: string | null;
    deposit_returned_on: string | null;
    deposit_returned_amount: number | null;
    is_managed: boolean;
    management_agreement_id: string | null;
    duration_tier: string | null;
    previous_lease_id: string | null;
    termination_reason: string | null;
    signed_doc_id: string | null;
    created_by: string;
    created_at: string;
    property: { number: string; name: string } | null;
    tenant: { display_name: string } | null;
    landlord: { display_name: string } | null;
    agreement: { number: string; fee_pct: number } | null;
    expense_lines: ExpenseLineRow[];
    deductions: DeductionRow[];
  };
  const raw = data as unknown as Raw;

  const [chain, invoices, payments, inspections] = await Promise.all([
    getLeaseChain(
      {
        id: raw.id,
        number: raw.number,
        status: raw.status,
        start_on: raw.start_on,
        end_on: raw.end_on,
        monthly_rent: raw.monthly_rent,
      },
      raw.previous_lease_id
    ),
    getLeaseInvoices(raw.id),
    getLeasePayments(raw.id),
    getLeaseInspections(raw.id),
  ]);

  return {
    id: raw.id,
    office_id: raw.office_id,
    number: raw.number,
    status: raw.status,
    property_id: raw.property_id,
    property_number: raw.property?.number ?? null,
    property_name: raw.property?.name ?? null,
    tenant_contact_id: raw.tenant_contact_id,
    tenant_name: raw.tenant?.display_name ?? null,
    landlord_contact_id: raw.landlord_contact_id,
    landlord_name: raw.landlord?.display_name ?? null,
    transaction_id: raw.transaction_id,
    start_on: raw.start_on,
    end_on: raw.end_on,
    monthly_rent: raw.monthly_rent,
    payment_day: raw.payment_day,
    grace_days: raw.grace_days,
    deposit_amount: raw.deposit_amount,
    deposit_holder: raw.deposit_holder,
    deposit_received_on: raw.deposit_received_on,
    deposit_returned_on: raw.deposit_returned_on,
    deposit_returned_amount: raw.deposit_returned_amount,
    is_managed: raw.is_managed,
    management_agreement_id: raw.management_agreement_id,
    agreement_number: raw.agreement?.number ?? null,
    agreement_fee_pct: raw.agreement?.fee_pct ?? null,
    duration_tier: raw.duration_tier,
    status_created_by: raw.created_by,
    signed_doc_id: raw.signed_doc_id,
    previous_lease_id: raw.previous_lease_id,
    termination_reason: raw.termination_reason,
    created_at: raw.created_at,
    chain,
    expense_lines: raw.expense_lines ?? [],
    invoices,
    payments,
    deductions: raw.deductions ?? [],
    inspections,
  };
}

/** Сунгалтын гинж (F-504): урагш/хойш бүх холбоос + өөрийг нь нэг жагсаалтад. */
async function getLeaseChain(current: LeaseChainLink, previousId: string | null): Promise<LeaseChainLink[]> {
  const supabase = await createClient();
  const id = current.id;
  const seen = new Set<string>([id]);
  const chain: LeaseChainLink[] = [current];

  // Хойш (өмнөх гэрээнүүд).
  let cursor = previousId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const { data } = await supabase
      .from("crm_leases")
      .select("id, number, status, start_on, end_on, monthly_rent, previous_lease_id")
      .eq("id", cursor)
      .maybeSingle();
    if (!data) break;
    chain.unshift({
      id: data.id,
      number: data.number,
      status: data.status as LeaseStatus,
      start_on: data.start_on,
      end_on: data.end_on,
      monthly_rent: data.monthly_rent,
    });
    cursor = data.previous_lease_id;
  }

  // Урагш (энэ гэрээг залгамжилсан гэрээнүүд).
  let forward = id;
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase
      .from("crm_leases")
      .select("id, number, status, start_on, end_on, monthly_rent")
      .eq("previous_lease_id", forward)
      .maybeSingle();
    if (!data || seen.has(data.id)) break;
    seen.add(data.id);
    chain.push({
      id: data.id,
      number: data.number,
      status: data.status as LeaseStatus,
      start_on: data.start_on,
      end_on: data.end_on,
      monthly_rent: data.monthly_rent,
    });
    forward = data.id;
  }
  return chain;
}

async function getLeaseInvoices(leaseId: string): Promise<LeaseInvoiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_invoices")
    .select("id, number, type, status, period_month, issued_on, due_on, amount, payments:crm_payments(kind, amount_mnt)")
    .eq("lease_id", leaseId)
    .order("issued_on", { ascending: false });
  if (error) console.error("getLeaseInvoices:", error.message);
  type Raw = Omit<LeaseInvoiceRow, "paid_mnt"> & { payments: { kind: PaymentKind; amount_mnt: number }[] };
  return ((data ?? []) as unknown as Raw[]).map(({ payments, ...rest }) => ({
    ...rest,
    paid_mnt: (payments ?? []).filter((p) => p.kind === "income").reduce((s, p) => s + p.amount_mnt, 0),
  }));
}

async function getLeasePayments(leaseId: string): Promise<LeasePaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_payments")
    .select("id, kind, invoice_id, paid_on, amount, currency, amount_mnt, method, finance_verified_at")
    .eq("lease_id", leaseId)
    .order("paid_on", { ascending: false });
  if (error) console.error("getLeasePayments:", error.message);
  return (data ?? []) as unknown as LeasePaymentRow[];
}

async function getLeaseInspections(leaseId: string): Promise<InspectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_inspections")
    .select(
      "id, kind, inspected_on, confirmed_by_tenant, " +
        "items:crm_inspection_items(id, inspection_id, room, item, condition, note, matched_item_id, discrepancy)"
    )
    .eq("lease_id", leaseId)
    .order("inspected_on", { ascending: true });
  if (error) console.error("getLeaseInspections:", error.message);
  return (data ?? []) as unknown as InspectionRow[];
}

// ── Нэхэмжлэх ─────────────────────────────────────────────

export type InvoiceFilters = {
  status?: InvoiceStatus;
  type?: InvoiceType;
  leaseId?: string;
  from?: string;
  to?: string;
  q?: string;
};

export type InvoiceRow = {
  id: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  lease_id: string | null;
  lease_number: string | null;
  transaction_id: string | null;
  recipient_name: string | null;
  period_month: string | null;
  issued_on: string;
  due_on: string;
  amount: number;
  paid_mnt: number;
  sent_at: string | null;
  corrected_invoice_id: string | null;
};

const INVOICE_SELECT =
  "id, number, type, status, lease_id, transaction_id, period_month, issued_on, due_on, amount, sent_at, corrected_invoice_id, " +
  "lease:crm_leases!crm_invoices_lease_id_fkey(number), " +
  "recipient:crm_contacts!crm_invoices_recipient_contact_id_fkey(display_name), " +
  "payments:crm_payments(kind, amount_mnt)";

type InvoiceRaw = Omit<InvoiceRow, "lease_number" | "recipient_name" | "paid_mnt"> & {
  lease: { number: string } | null;
  recipient: { display_name: string } | null;
  payments: { kind: PaymentKind; amount_mnt: number }[];
};

function toInvoiceRow(r: InvoiceRaw): InvoiceRow {
  const { lease, recipient, payments, ...rest } = r;
  return {
    ...rest,
    lease_number: lease?.number ?? null,
    recipient_name: recipient?.display_name ?? null,
    paid_mnt: (payments ?? []).filter((p) => p.kind === "income").reduce((s, p) => s + p.amount_mnt, 0),
  };
}

export async function getInvoices(filters: InvoiceFilters = {}): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_invoices").select(INVOICE_SELECT).order("due_on", { ascending: false }).limit(300);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.leaseId) query = query.eq("lease_id", filters.leaseId);
  if (filters.from) query = query.gte("issued_on", filters.from);
  if (filters.to) query = query.lte("issued_on", filters.to);
  if (filters.q) query = query.ilike("number", `%${filters.q}%`);
  const { data, error } = await query;
  if (error) console.error("getInvoices:", error.message);
  return ((data ?? []) as unknown as InvoiceRaw[]).map(toInvoiceRow);
}

export type InvoicePrintDetail = InvoiceRow & {
  office_id: string;
  cancel_reason: string | null;
  tenant_name: string | null;
  property_name: string | null;
  property_number: string | null;
};

/** Нэхэмжлэхийн print хуудасны дэлгэрэнгүй (D11 — print-оптимизацитай HTML). */
export async function getInvoice(id: string): Promise<InvoicePrintDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_invoices")
    .select(INVOICE_SELECT + ", office_id, cancel_reason")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getInvoice:", error.message);
    return null;
  }
  if (!data) return null;
  const row = toInvoiceRow(data as unknown as InvoiceRaw) as InvoicePrintDetail;
  row.office_id = (data as unknown as { office_id: string }).office_id;
  row.cancel_reason = (data as unknown as { cancel_reason: string | null }).cancel_reason;
  row.tenant_name = null;
  row.property_name = null;
  row.property_number = null;
  if (row.lease_id) {
    const { data: lease } = await supabase
      .from("crm_leases")
      .select(
        "tenant:crm_contacts!crm_leases_tenant_contact_id_fkey(display_name), property:crm_properties!crm_leases_property_id_fkey(name, number)"
      )
      .eq("id", row.lease_id)
      .maybeSingle();
    type LR = { tenant: { display_name: string } | null; property: { name: string; number: string } | null };
    const lr = lease as unknown as LR | null;
    row.tenant_name = lr?.tenant?.display_name ?? null;
    row.property_name = lr?.property?.name ?? null;
    row.property_number = lr?.property?.number ?? null;
  }
  return row;
}

export type AgingSummary = {
  buckets: Record<AgingBucket, { count: number; amount: number }>;
  totalOverdue: number;
};

/** F-524: төлөгдөөгүй (sent/partially_paid) нэхэмжлэхийн насжилт. */
export async function getAging(): Promise<AgingSummary> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("crm_invoices")
    .select("id, due_on, amount, payments:crm_payments(kind, amount_mnt)")
    .in("status", ["sent", "partially_paid"]);
  if (error) console.error("getAging:", error.message);
  const buckets: AgingSummary["buckets"] = {
    current: { count: 0, amount: 0 },
    d1_3: { count: 0, amount: 0 },
    d4_7: { count: 0, amount: 0 },
    d8_plus: { count: 0, amount: 0 },
  };
  let totalOverdue = 0;
  type Raw = { id: string; due_on: string; amount: number; payments: { kind: PaymentKind; amount_mnt: number }[] };
  for (const r of (data ?? []) as unknown as Raw[]) {
    const paid = (r.payments ?? []).filter((p) => p.kind === "income").reduce((s, p) => s + p.amount_mnt, 0);
    const remaining = Math.max(0, r.amount - paid);
    if (remaining <= 0) continue;
    const b = agingBucket(r.due_on, today);
    buckets[b].count += 1;
    buckets[b].amount += remaining;
    if (b !== "current") totalOverdue += remaining;
  }
  return { buckets, totalOverdue };
}

export type ArrearsRow = {
  id: string;
  invoice_id: string;
  lease_id: string;
  step: number;
  assigned_role: CrmRole;
  escalated_at: string;
};

export async function getArrearsEscalations(leaseId?: string): Promise<ArrearsRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_arrears_escalations")
    .select("id, invoice_id, lease_id, step, assigned_role, escalated_at")
    .order("escalated_at", { ascending: false })
    .limit(100);
  if (leaseId) query = query.eq("lease_id", leaseId);
  const { data, error } = await query;
  if (error) console.error("getArrearsEscalations:", error.message);
  return (data ?? []) as unknown as ArrearsRow[];
}

// ── Засварын хүсэлт ───────────────────────────────────────

export type MaintenanceFilters = {
  status?: MaintenanceStatus;
  urgency?: Urgency;
  propertyId?: string;
};

export type MaintenanceRow = {
  id: string;
  property_id: string;
  property_number: string | null;
  property_name: string | null;
  lease_id: string | null;
  source: string;
  urgency: Urgency;
  description: string;
  status: MaintenanceStatus;
  owner_approval_needed: boolean;
  owner_approved_at: string | null;
  emergency_bypass: boolean;
  vendor_id: string | null;
  vendor_name: string | null;
  assigned_to: string | null;
  estimate_amount: number | null;
  actual_amount: number | null;
  cost_bearer: ExpenseBearer | null;
  sla_respond_by: string | null;
  sla_resolve_by: string | null;
  completed_on: string | null;
  completion_doc_id: string | null;
  category_label: string | null;
  created_at: string;
};

export async function getMaintenance(filters: MaintenanceFilters = {}): Promise<MaintenanceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_maintenance_requests")
    .select(
      "id, property_id, lease_id, source, urgency, description, status, owner_approval_needed, owner_approved_at, " +
        "emergency_bypass, vendor_id, assigned_to, estimate_amount, actual_amount, cost_bearer, " +
        "sla_respond_by, sla_resolve_by, completed_on, completion_doc_id, created_at, " +
        "property:crm_properties!crm_maintenance_requests_property_id_fkey(number, name), " +
        "vendor:crm_vendors!crm_maintenance_requests_vendor_id_fkey(name), " +
        "category:crm_lookups!crm_maintenance_requests_category_id_fkey(label)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.urgency) query = query.eq("urgency", filters.urgency);
  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  const { data, error } = await query;
  if (error) console.error("getMaintenance:", error.message);
  type Raw = Omit<MaintenanceRow, "property_number" | "property_name" | "vendor_name" | "category_label"> & {
    property: { number: string; name: string } | null;
    vendor: { name: string } | null;
    category: { label: string } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ property, vendor, category, ...rest }) => ({
    ...rest,
    property_number: property?.number ?? null,
    property_name: property?.name ?? null,
    vendor_name: vendor?.name ?? null,
    category_label: category?.label ?? null,
  }));
}

export type VendorRow = { id: string; name: string; phone: string | null; specialty: string | null; is_active: boolean };

export async function getVendors(): Promise<VendorRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_vendors")
    .select("id, name, phone, specialty, is_active")
    .order("name");
  if (error) console.error("getVendors:", error.message);
  return (data ?? []) as VendorRow[];
}

// ── Сарын менежментийн бүртгэл ────────────────────────────

export type MonthlyRecordRow = {
  id: string;
  agreement_id: string;
  agreement_number: string | null;
  property_id: string;
  property_number: string | null;
  property_name: string | null;
  lease_id: string | null;
  month: string;
  data: Json;
  completeness_pct: number;
  net_income: number | null;
  commission_hold: boolean;
  completed_at: string | null;
};

export async function getMonthlyRecords(month: string): Promise<MonthlyRecordRow[]> {
  const supabase = await createClient();
  const monthIso = `${month.slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("crm_monthly_records")
    .select(
      "id, agreement_id, property_id, lease_id, month, data, completeness_pct, net_income, commission_hold, completed_at, " +
        "agreement:crm_management_agreements!crm_monthly_records_agreement_id_fkey(number), " +
        "property:crm_properties!crm_monthly_records_property_id_fkey(number, name)"
    )
    .eq("month", monthIso)
    .order("completeness_pct", { ascending: true });
  if (error) console.error("getMonthlyRecords:", error.message);
  type Raw = Omit<MonthlyRecordRow, "agreement_number" | "property_number" | "property_name"> & {
    agreement: { number: string } | null;
    property: { number: string; name: string } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map(({ agreement, property, ...rest }) => ({
    ...rest,
    agreement_number: agreement?.number ?? null,
    property_number: property?.number ?? null,
    property_name: property?.name ?? null,
  }));
}

// ── Өмчлөгчийн тайлан ─────────────────────────────────────

export type StatementFilters = { agreementId?: string; from?: string; to?: string };

export type StatementRow = {
  id: string;
  agreement_id: string;
  agreement_number: string | null;
  owner_contact_id: string;
  owner_name: string | null;
  period_start: string;
  period_end: string;
  income: number;
  expenses: number;
  mgmt_fee: number;
  net_payout: number;
  detail: Json;
  sent_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

const STATEMENT_SELECT =
  "id, agreement_id, owner_contact_id, period_start, period_end, income, expenses, mgmt_fee, net_payout, detail, sent_at, acknowledged_at, created_at, " +
  "agreement:crm_management_agreements!crm_owner_statements_agreement_id_fkey(number), " +
  "owner:crm_contacts!crm_owner_statements_owner_contact_id_fkey(display_name)";

type StatementRaw = Omit<StatementRow, "agreement_number" | "owner_name"> & {
  agreement: { number: string } | null;
  owner: { display_name: string } | null;
};

function toStatementRow(r: StatementRaw): StatementRow {
  const { agreement, owner, ...rest } = r;
  return { ...rest, agreement_number: agreement?.number ?? null, owner_name: owner?.display_name ?? null };
}

export async function getOwnerStatements(filters: StatementFilters = {}): Promise<StatementRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_owner_statements")
    .select(STATEMENT_SELECT)
    .order("period_start", { ascending: false })
    .limit(200);
  if (filters.agreementId) query = query.eq("agreement_id", filters.agreementId);
  if (filters.from) query = query.gte("period_start", filters.from);
  if (filters.to) query = query.lte("period_end", filters.to);
  const { data, error } = await query;
  if (error) console.error("getOwnerStatements:", error.message);
  return ((data ?? []) as unknown as StatementRaw[]).map(toStatementRow);
}

export async function getOwnerStatement(id: string): Promise<StatementRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_owner_statements").select(STATEMENT_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("getOwnerStatement:", error.message);
    return null;
  }
  return data ? toStatementRow(data as unknown as StatementRaw) : null;
}

// ── Менежментийн гэрээ ────────────────────────────────────

export type AgreementRow = {
  id: string;
  number: string;
  owner_contact_id: string;
  owner_name: string | null;
  start_on: string;
  end_on: string | null;
  fee_pct: number;
  reporting_frequency: string;
  repair_approval_limit: number;
  status: string;
  property_count: number;
};

export async function getManagementAgreements(): Promise<AgreementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_management_agreements")
    .select(
      "id, number, owner_contact_id, start_on, end_on, fee_pct, reporting_frequency, repair_approval_limit, status, " +
        "owner:crm_contacts!crm_management_agreements_owner_contact_id_fkey(display_name), " +
        "props:crm_management_agreement_properties(count)"
    )
    .order("created_at", { ascending: false });
  if (error) console.error("getManagementAgreements:", error.message);
  type Raw = Omit<AgreementRow, "owner_name" | "property_count"> & {
    owner: { display_name: string } | null;
    props: { count: number }[];
  };
  return ((data ?? []) as unknown as Raw[]).map(({ owner, props, ...rest }) => ({
    ...rest,
    owner_name: owner?.display_name ?? null,
    property_count: props?.[0]?.count ?? 0,
  }));
}

// ── Сонголтын жагсаалтууд (маягтуудад) ────────────────────

export type RentalContactOption = { id: string; name: string };

export async function getRentalContactOptions(): Promise<RentalContactOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_contacts").select("id, display_name").order("display_name").limit(500);
  if (error) console.error("getRentalContactOptions:", error.message);
  return ((data ?? []) as { id: string; display_name: string }[]).map((c) => ({ id: c.id, name: c.display_name }));
}

export type RentalPropertyOption = {
  id: string;
  number: string;
  name: string;
  service_kind: string;
  occupancy: string | null;
  management_agreement_id: string | null;
};

export async function getRentalPropertyOptions(): Promise<RentalPropertyOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_properties")
    .select("id, number, name, service_kind, occupancy, management_agreement_id")
    .in("service_kind", ["standard_rental", "managed_rental"])
    .order("number")
    .limit(500);
  if (error) console.error("getRentalPropertyOptions:", error.message);
  return (data ?? []) as RentalPropertyOption[];
}

// ── R-08 самбарын товч тоо ────────────────────────────────

export type RentalsSummary = {
  activeLeases: number;
  managedLeases: number;
  expiring60: number;
  expiring30: number;
  occupied: number;
  vacant: number;
};

export async function getRentalsSummary(): Promise<RentalsSummary> {
  const supabase = await createClient();
  const today = new Date();
  const d60 = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const [active, managed, e60, e30, occ, vac] = await Promise.all([
    supabase.from("crm_leases").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("crm_leases").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_managed", true),
    supabase.from("crm_leases").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_on", d60),
    supabase.from("crm_leases").select("id", { count: "exact", head: true }).eq("status", "active").lte("end_on", d30),
    supabase.from("crm_properties").select("id", { count: "exact", head: true }).eq("occupancy", "occupied"),
    supabase.from("crm_properties").select("id", { count: "exact", head: true }).eq("occupancy", "vacant"),
  ]);
  return {
    activeLeases: active.count ?? 0,
    managedLeases: managed.count ?? 0,
    expiring60: e60.count ?? 0,
    expiring30: e30.count ?? 0,
    occupied: occ.count ?? 0,
    vacant: vac.count ?? 0,
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import { calendarExceptionsFromRows, leadSlaDeadline, type SlaPolicy } from "@/lib/crm/calendar";
import { validateMergeInput, type MergeInput } from "@/lib/validation/crm";
import {
  appealDecideSchema,
  coiSchema,
  dataDecideSchema,
  dataRequestSchema,
  dbErrorMessage,
  disputeAppealSchema,
  disputeDecideSchema,
  disputeEscalateSchema,
  disputeEvidenceSchema,
  disputeOpenSchema,
  disputeReviewSchema,
  duplicateSearchSchema,
  leaveSchema,
  parseWith,
  poolClaimSchema,
  poolDecideSchema,
  reassignSchema,
  recycleSchema,
  ANONYMIZE_BLOCKER_LABEL,
  type ReassignInput,
  type RecycleInput,
} from "@/lib/validation/crm-ownership";
import type { Json } from "@/types/database";

/**
 * Эзэмшил, маргаан, эргэлт, хүлээлцэх (PRO-001 v2.1 §5, §6.26, §6.27, §6.32).
 * Бүх эрх, нотолгооны шалгалт DB-ийн definer RPC-д; энд оролт шалгаж,
 * мэдэгдэл илгээж, ажлын цагийн хуанлиар SLA-г нарийвчилна.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

type Result = { ok: boolean; error?: string };

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function revalidateOwnership(leadId?: string) {
  revalidatePath("/agent/crm/pool");
  revalidatePath("/office/crm/pool");
  revalidatePath("/office/crm/disputes");
  revalidatePath("/agent/crm/leads");
  revalidatePath("/office/crm/leads");
  if (leadId) {
    revalidatePath(`/agent/crm/leads/${leadId}`);
    revalidatePath(`/office/crm/leads/${leadId}`);
  }
}

function rpcError(fn: string, message: string): string {
  console.error(`${fn}:`, message);
  return dbErrorMessage(message, SAVE_ERR);
}

// ── Давхардал (§6.26): агентуудын хооронд масктай ────────

export type MaskedDuplicate = {
  contact_id: string;
  match_kind: string;
  can_view: boolean;
  display_name: string;
  masked_phone: string | null;
  created_at: string;
  branch_name: string | null;
  open_lead_id: string | null;
  open_lead_status: string | null;
  owner_name: string | null;
  owner_is_me: boolean;
  has_owner: boolean;
};

export async function findDuplicatesMasked(raw: {
  phone?: string;
  email?: string;
  name?: string;
}): Promise<{ hits?: MaskedDuplicate[]; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const parsed = parseWith(duplicateSearchSchema, raw);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_find_duplicates", {
    p_phone: parsed.data.phone || null,
    p_email: parsed.data.email || null,
    p_name: parsed.data.name || null,
  });
  if (error) return { error: rpcError("findDuplicatesMasked", error.message) };
  return {
    hits: (data ?? []).map((r) => ({
      contact_id: r.contact_id,
      match_kind: r.match_kind,
      can_view: r.can_view,
      display_name: r.display_name,
      masked_phone: r.masked_phone,
      created_at: r.created_at,
      branch_name: r.branch_name,
      open_lead_id: r.can_view ? r.open_lead_id : r.open_lead_id ? "hidden" : null,
      open_lead_status: r.open_lead_status,
      owner_name: r.owner_name,
      owner_is_me: r.owner_is_me,
      has_owner: !!r.owner_id,
    })),
  };
}

// ── Эзэмшлийн маргаан ────────────────────────────────────

export async function openLeadDispute(raw: unknown): Promise<{ id?: string; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;
  const parsed = parseWith(disputeOpenSchema, raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_open_lead_dispute", {
    p_contact: input.contactId,
    p_claim: input.claim,
    p_evidence: input.evidence as unknown as Json,
    p_kind: input.kind,
  });
  if (error || !data) return { error: rpcError("openLeadDispute", error?.message ?? "") };
  const id = data;

  const admin = createAdminClient();
  const { data: d } = await admin
    .from("crm_lead_disputes")
    .select("respondent_id, lead_id")
    .eq("id", id)
    .maybeSingle();
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_dispute_opened",
    recipients: [d?.respondent_id, ctx.profileId],
    title: "Сэжимийн эзэмшлийн маргаан нээгдлээ",
    body: "Нотолгоогоо маргааны хуудсанд оруулна уу. Багийн ахлагч, Үйл ажиллагаа-ЧМТ хянана.",
    // Агент → агентын панелийн маргааны таб; оффисын хэрэглэгчид panelLink нь
    // /office/crm/pool?tab=disputes болгож, тэр хуудас маргааны хуудас руу шилжүүлнэ.
    link: `/agent/crm/pool?tab=disputes&id=${id}`,
    entity: "crm_lead_disputes",
    entityId: id,
    admin,
  });
  revalidateOwnership(d?.lead_id ?? undefined);
  return { id };
}

export async function addDisputeEvidence(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const parsed = parseWith(disputeEvidenceSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_add_dispute_evidence", {
    p_dispute: parsed.data.disputeId,
    p_note: parsed.data.note || null,
    p_evidence: parsed.data.evidence as unknown as Json,
  });
  if (error) return { ok: false, error: rpcError("addDisputeEvidence", error.message) };
  revalidateOwnership();
  return { ok: true };
}

export async function reviewDispute(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const parsed = parseWith(disputeReviewSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_review_lead_dispute", {
    p_dispute: parsed.data.disputeId,
    p_note: parsed.data.note,
    p_recommendation: parsed.data.recommendation,
  });
  if (error) return { ok: false, error: rpcError("reviewDispute", error.message) };
  revalidateOwnership();
  return { ok: true };
}

export async function escalateDispute(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(disputeEscalateSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_escalate_lead_dispute", {
    p_dispute: parsed.data.disputeId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: rpcError("escalateDispute", error.message) };
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_dispute_opened",
    recipients: [],
    includeRoles: ["ceo"],
    title: "Эзэмшлийн маргаан CEO-д шилжлээ",
    body: "Борлуулалт хариуцсан захирал шийдэх боломжгүй маргаан — шийдвэр гаргана уу.",
    link: `/office/crm/disputes?id=${parsed.data.disputeId}`,
    entity: "crm_lead_disputes",
    entityId: parsed.data.disputeId,
  });
  revalidateOwnership();
  return { ok: true };
}

async function notifyDecision(officeId: string, disputeId: string, title: string) {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("crm_lead_disputes")
    .select("claimant_id, respondent_id, lead_id")
    .eq("id", disputeId)
    .maybeSingle();
  if (!d) return;
  await notifyCrm({
    officeId,
    event: "lead_dispute_decided",
    recipients: [d.claimant_id, d.respondent_id],
    title,
    body: "Шийдвэр, үндэслэлтэй маргааны хуудсанд танилцана уу.",
    link: `/agent/crm/pool?tab=disputes&id=${disputeId}`,
    entity: "crm_lead_disputes",
    entityId: disputeId,
    admin,
  });
  revalidateOwnership(d.lead_id);
}

export async function decideDispute(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(disputeDecideSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_decide_lead_dispute", {
    p_dispute: parsed.data.disputeId,
    p_decision: parsed.data.decision,
    p_rationale: parsed.data.rationale,
  });
  if (error) return { ok: false, error: rpcError("decideDispute", error.message) };
  await notifyDecision(ctx.officeId, parsed.data.disputeId, "Эзэмшлийн маргаан шийдвэрлэгдлээ");
  return { ok: true };
}

export async function appealDispute(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(disputeAppealSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_appeal_lead_dispute", {
    p_dispute: parsed.data.disputeId,
    p_text: parsed.data.text,
  });
  if (error) return { ok: false, error: rpcError("appealDispute", error.message) };
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_dispute_opened",
    recipients: [],
    includeRoles: ["ceo"],
    title: "Эзэмшлийн маргааныг давж заалдлаа",
    body: "Давж заалдах хүсэлтийг шийдвэрлэнэ үү.",
    link: `/office/crm/disputes?id=${parsed.data.disputeId}`,
    entity: "crm_lead_disputes",
    entityId: parsed.data.disputeId,
  });
  revalidateOwnership();
  return { ok: true };
}

export async function decideAppeal(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(appealDecideSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_decide_lead_appeal", {
    p_dispute: parsed.data.disputeId,
    p_outcome: parsed.data.outcome,
    p_rationale: parsed.data.rationale,
  });
  if (error) return { ok: false, error: rpcError("decideAppeal", error.message) };
  await notifyDecision(ctx.officeId, parsed.data.disputeId, "Давж заалдах хүсэлт шийдвэрлэгдлээ");
  return { ok: true };
}

export async function withdrawDispute(disputeId: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_withdraw_lead_dispute", { p_dispute: disputeId });
  if (error) return { ok: false, error: rpcError("withdrawDispute", error.message) };
  revalidateOwnership();
  return { ok: true };
}

// ── Ашиг сонирхлын мэдүүлэг ──────────────────────────────

export async function declareCoi(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(coiSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  if (parsed.data.relatedProfileId === ctx.profileId) {
    return { ok: false, error: "Өөрийгөө хамаарал бүхий ажилтнаар сонгохгүй." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("crm_coi_declarations").insert({
    office_id: ctx.officeId,
    profile_id: ctx.profileId,
    contact_id: parsed.data.contactId,
    related_profile_id: parsed.data.relatedProfileId,
    relation: parsed.data.relation,
    note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: rpcError("declareCoi", error.message) };
  revalidateOwnership();
  return { ok: true };
}

export async function revokeCoi(id: string, note: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (note.trim().length < 5) return { ok: false, error: "Цуцлах шалтгаанаа бичнэ үү." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("crm_coi_declarations")
    .update({ revoked_at: new Date().toISOString(), revoke_note: note.trim() }, { count: "exact" })
    .eq("id", id)
    .eq("profile_id", ctx.profileId)
    .is("revoked_at", null);
  if (error) return { ok: false, error: rpcError("revokeCoi", error.message) };
  if (!count) return { ok: false, error: "Мэдүүлэг олдсонгүй." };
  revalidateOwnership();
  return { ok: true };
}

// ── Дахин хуваарилалт (§6.27) ─────────────────────────────

/** Ажлын цагийн хуанлиар эхний холболтын хугацааг шинэ эзэмшигчээс тоолно. */
async function recomputeFirstContactDue(leadId: string, officeId: string) {
  try {
    const admin = createAdminClient();
    const { data: lead } = await admin
      .from("crm_leads")
      .select("id, status, first_contact_at, source_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.status !== "new" || lead.first_contact_at) return;
    const [policy, fallback, { data: src }, { data: days }] = await Promise.all([
      getSettingValue<SlaPolicy>("sla_policy"),
      getSettingValue<number>("sla_first_contact_min"),
      lead.source_id
        ? admin.from("crm_lookups").select("code").eq("id", lead.source_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("crm_calendar_days")
        .select("day, is_workday")
        .eq("office_id", officeId)
        .gte("day", new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
    ]);
    const due = leadSlaDeadline(new Date(), (src as { code?: string } | null)?.code ?? null, {
      policy,
      fallbackMinutes: typeof fallback === "number" && fallback > 0 ? fallback : 15,
      exceptions: calendarExceptionsFromRows(days ?? []),
    });
    await admin.from("crm_leads").update({ first_contact_due_at: due.toISOString() }).eq("id", leadId);
  } catch (e) {
    console.error("recomputeFirstContactDue:", e instanceof Error ? e.message : e);
  }
}

async function reassignOne(ctx: CrmStaffContext, input: ReassignInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_reassign_lead", {
    p_lead: input.leadId,
    p_new_owner: input.newOwnerId,
    p_reason: input.reason,
    p_note: input.note,
  });
  if (error) return { ok: false, error: rpcError("reassignLeadWithEvidence", error.message) };
  await recomputeFirstContactDue(input.leadId, ctx.officeId);
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_assigned",
    recipients: [input.newOwnerId],
    title: "Танд сэжим шилжиж ирлээ",
    body: "Шилжүүлсэн шалтгаан, түүхтэй картаас танилцаж харилцагчтай холбогдоно уу.",
    link: `/agent/crm/leads/${input.leadId}`,
    entity: "crm_leads",
    entityId: input.leadId,
  });
  return { ok: true };
}

export async function reassignLeadWithEvidence(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const parsed = parseWith(reassignSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const res = await reassignOne(c.ctx, parsed.data);
  revalidateOwnership(parsed.data.leadId);
  return res;
}

// ── Эргэлт (§6.27) ────────────────────────────────────────

export async function recycleLeadWithReview(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const parsed = parseWith(recycleSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input: RecycleInput = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_recycle_lead", {
    p_lead: input.leadId,
    p_reason: input.reason,
    p_note: input.note,
    p_release: input.release,
  });
  if (error) return { ok: false, error: rpcError("recycleLeadWithReview", error.message) };
  revalidateOwnership(input.leadId);
  return { ok: true };
}

// ── Эргэлтийн сан (R3) ────────────────────────────────────

export async function requestPoolClaim(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(poolClaimSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_request_pool_claim", {
    p_lead: parsed.data.leadId,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: rpcError("requestPoolClaim", error.message) };
  await notifyCrm({
    officeId: ctx.officeId,
    event: "lead_claim_requested",
    recipients: [ctx.profileId],
    title: "Эргэлтийн сангаас сэжим авах хүсэлт",
    body: "Агент сангаас сэжим авах хүсэлт илгээлээ — зөвшөөрөх эсэхийг шийднэ үү.",
    link: "/agent/crm/pool?tab=claims",
    entity: "crm_pool_claims",
    entityId: data ?? undefined,
  });
  revalidateOwnership();
  return { ok: true };
}

export async function cancelPoolClaim(claimId: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_cancel_pool_claim", { p_claim: claimId });
  if (error) return { ok: false, error: rpcError("cancelPoolClaim", error.message) };
  revalidateOwnership();
  return { ok: true };
}

export async function decidePoolClaim(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(poolDecideSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("crm_pool_claims")
    .select("lead_id, requester_id")
    .eq("id", parsed.data.claimId)
    .maybeSingle();
  const { error } = await supabase.rpc("crm_decide_pool_claim", {
    p_claim: parsed.data.claimId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: rpcError("decidePoolClaim", error.message) };
  if (claim) {
    if (parsed.data.approve) await recomputeFirstContactDue(claim.lead_id, ctx.officeId);
    await notifyCrm({
      officeId: ctx.officeId,
      event: "lead_assigned",
      recipients: [claim.requester_id],
      title: parsed.data.approve ? "Сангаас авах хүсэлт зөвшөөрөгдлөө" : "Сангаас авах хүсэлт татгалзагдлаа",
      body: parsed.data.approve
        ? "Сэжим танд оноогдлоо — харилцагчтай холбогдож үйл ажиллагаагаа бүртгэнэ үү."
        : `Шалтгаан: ${parsed.data.note ?? ""}`.slice(0, 120),
      link: parsed.data.approve ? `/agent/crm/leads/${claim.lead_id}` : "/agent/crm/pool",
      entity: "crm_leads",
      entityId: claim.lead_id,
    });
  }
  revalidateOwnership(claim?.lead_id);
  return { ok: true };
}

// ── Хүлээн авах (R2) ──────────────────────────────────────

export async function acceptLead(leadId: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_accept_lead", { p_lead: leadId });
  if (error) return { ok: false, error: rpcError("acceptLead", error.message) };
  revalidateOwnership(leadId);
  return { ok: true };
}

// ── Нэгтгэл (ҮАМ) ─────────────────────────────────────────

/** Нэгтгэхийн өмнөх анхааруулга: хоёр талын нээлттэй сэжим, эзэмшигч. */
export async function mergePreflight(
  primaryId: string,
  mergedId: string
): Promise<{ warnings?: string[]; blocking?: string | null; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  if (!c.ctx.roles.includes("ops_qc")) return { error: "Бүртгэл нэгтгэх эрх зөвхөн Үйл ажиллагаа-ЧМТ-ийн зохицуулагчид бий." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_leads")
    .select("contact_id, status, owner_id, created_at, owner:profiles!crm_leads_owner_id_fkey(full_name)")
    .in("contact_id", [primaryId, mergedId])
    .in("status", ["new", "active"]);
  type Raw = { contact_id: string; owner_id: string | null; created_at: string; owner: { full_name: string | null } | null };
  const rows = (data ?? []) as unknown as Raw[];
  const p = rows.find((r) => r.contact_id === primaryId);
  const m = rows.find((r) => r.contact_id === mergedId);
  const warnings: string[] = [];
  let blocking: string | null = null;
  if (p && m) {
    if (p.owner_id && m.owner_id && p.owner_id !== m.owner_id) {
      blocking = `Хоёр бүртгэл өөр агентын нээлттэй сэжимтэй (${p.owner?.full_name ?? "—"}, ${m.owner?.full_name ?? "—"}) — эхлээд эзэмшлийн маргааныг шийдвэрлэнэ.`;
    } else {
      warnings.push("Хоёр талд ижил эзэмшигчийн нээлттэй сэжим байна — хожуу бүртгэгдсэнийг архивлаж нэгтгэнэ.");
    }
  }
  return { warnings, blocking };
}

export async function mergeContactsChecked(raw: MergeInput): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!c.ctx.roles.includes("ops_qc")) {
    return { ok: false, error: "Бүртгэл нэгтгэх эрх зөвхөн Үйл ажиллагаа-ЧМТ-ийн зохицуулагчид бий." };
  }
  const parsed = validateMergeInput(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_merge_contacts", {
    p_primary: input.primaryId,
    p_merged: input.mergedId,
    p_choices: input.choices as unknown as Json,
    p_aml_approval_note: input.amlApprovalNote,
  });
  if (error) return { ok: false, error: rpcError("mergeContactsChecked", error.message) };
  revalidatePath("/office/crm/contacts");
  revalidatePath("/agent/crm/contacts");
  revalidatePath(`/office/crm/contacts/${input.primaryId}`);
  revalidateOwnership();
  return { ok: true };
}

// ── Чөлөө, түр хүлээлцэх (§6.27) ─────────────────────────

const LEAVE_ROLES = ["sales_director", "sysadmin"] as const;

export async function setStaffLeave(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.some((r) => (LEAVE_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "Чөлөө бүртгэх эрх Борлуулалт хариуцсан захиралд бий." };
  }
  const parsed = parseWith(leaveSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("profile_id")
    .eq("id", input.staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Ажилтан олдсонгүй." };
  if (input.substituteId && input.substituteId === staff.profile_id) {
    return { ok: false, error: "Орлон ажиллагч нь өөр ажилтан байна." };
  }
  const { error, count } = await supabase
    .from("crm_staff")
    .update(
      {
        on_leave_from: input.from,
        on_leave_to: input.to,
        leave_substitute_id: input.from ? input.substituteId : null,
        leave_note: input.from ? input.note || null : null,
      },
      { count: "exact" }
    )
    .eq("id", input.staffId)
    .eq("office_id", ctx.officeId);
  if (error) return { ok: false, error: rpcError("setStaffLeave", error.message) };
  if (!count) return { ok: false, error: "Бүртгэл олдсонгүй эсвэл танд эрх алга." };
  revalidatePath("/office/crm/settings/staff");
  return { ok: true };
}

/** Чөлөөтэй ажилтны нээлттэй сэжмийг орлон ажиллагчид түр шилжүүлнэ. */
export async function handoverForLeave(staffId: string): Promise<{ ok: boolean; done?: number; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("sales_director")) {
    return { ok: false, error: "Түр хүлээлцэхийг Борлуулалт хариуцсан захирал хийнэ." };
  }
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("profile_id, on_leave_from, leave_substitute_id")
    .eq("id", staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff?.on_leave_from) return { ok: false, error: "Эхлээд чөлөөний хугацааг бүртгэнэ үү." };
  if (!staff.leave_substitute_id) return { ok: false, error: "Орлон ажиллагчийг сонгоно уу." };
  const { data: leads } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("owner_id", staff.profile_id)
    .in("status", ["new", "active"]);
  let done = 0;
  let lastError: string | undefined;
  for (const l of leads ?? []) {
    const res = await reassignOne(ctx, {
      leadId: l.id,
      newOwnerId: staff.leave_substitute_id,
      reason: "on_leave",
      note: "Чөлөөний хугацаанд түр хүлээлцэв",
    });
    if (res.ok) done += 1;
    else lastError = res.error;
  }
  revalidateOwnership();
  revalidatePath("/office/crm/settings/staff");
  if ((leads ?? []).length === 0) return { ok: true, done: 0 };
  if (done === 0) return { ok: false, error: lastError ?? SAVE_ERR };
  return { ok: true, done, error: lastError };
}

/** Чөлөөнөөс буцсан ажилтанд түр шилжүүлсэн сэжмийг буцаана. */
export async function returnFromLeave(staffId: string): Promise<{ ok: boolean; done?: number; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("sales_director")) {
    return { ok: false, error: "Буцаан хүлээлцэхийг Борлуулалт хариуцсан захирал хийнэ." };
  }
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("profile_id")
    .eq("id", staffId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Ажилтан олдсонгүй." };
  const { data: hist } = await supabase
    .from("crm_ownership_history")
    .select("entity_id, created_at")
    .eq("entity", "lead")
    .eq("reason_code", "on_leave")
    .eq("old_owner_id", staff.profile_id)
    .order("created_at", { ascending: false })
    .limit(500);
  const ids = [...new Set((hist ?? []).map((h) => h.entity_id))];
  let done = 0;
  let lastError: string | undefined;
  for (const id of ids) {
    const res = await reassignOne(ctx, {
      leadId: id,
      newOwnerId: staff.profile_id,
      reason: "leave_return",
      note: "Чөлөөнөөс буцсан тул буцаан хүлээлцэв",
    });
    if (res.ok) done += 1;
    else lastError = res.error;
  }
  await supabase
    .from("crm_staff")
    .update({ on_leave_from: null, on_leave_to: null, leave_substitute_id: null, leave_note: null })
    .eq("id", staffId)
    .eq("office_id", ctx.officeId);
  revalidateOwnership();
  revalidatePath("/office/crm/settings/staff");
  return { ok: true, done, error: done < ids.length ? lastError : undefined };
}

// ── Хувь хүний мэдээллийн хүсэлт (§6.32) ──────────────────

export async function createDataRequest(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const parsed = parseWith(dataRequestSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("crm_data_requests").insert({
    office_id: ctx.officeId,
    contact_id: parsed.data.contactId,
    kind: parsed.data.kind,
    channel: parsed.data.channel || null,
    note: parsed.data.note || null,
    created_by: ctx.profileId,
  });
  if (error) return { ok: false, error: rpcError("createDataRequest", error.message) };
  await notifyCrm({
    officeId: ctx.officeId,
    event: "export_requested",
    recipients: [],
    includeRoles: ["ops_qc"],
    title: "Хувь хүний мэдээллийн хүсэлт ирлээ",
    body: "Харилцагчийн мэдээлэлтэй танилцах/засах/устгах хүсэлтийг шийдвэрлэнэ үү.",
    link: "/office/crm/disputes?tab=privacy",
  });
  revalidatePath("/office/crm/disputes");
  return { ok: true };
}

export async function decideDataRequest(raw: unknown): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const parsed = parseWith(dataDecideSchema, raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_decide_data_request", {
    p_request: parsed.data.requestId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: rpcError("decideDataRequest", error.message) };
  revalidatePath("/office/crm/disputes");
  return { ok: true };
}

export async function completeDataRequest(requestId: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_complete_data_request", { p_request: requestId });
  if (error) return { ok: false, error: rpcError("completeDataRequest", error.message) };
  revalidatePath("/office/crm/disputes");
  return { ok: true };
}

export async function anonymizeContact(requestId: string): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const supabase = await createClient();
  const { data: req } = await supabase
    .from("crm_data_requests")
    .select("contact_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Хүсэлт олдсонгүй." };
  const { data: blockers } = await supabase.rpc("crm_anonymize_blockers", { p_contact: req.contact_id });
  if (blockers && blockers.length > 0) {
    return {
      ok: false,
      error: `Нэргүйжүүлэх боломжгүй: харилцагч ${blockers.map((b) => ANONYMIZE_BLOCKER_LABEL[b] ?? b).join(", ")}.`,
    };
  }
  const { error } = await supabase.rpc("crm_anonymize_contact", { p_request: requestId });
  if (error) return { ok: false, error: rpcError("anonymizeContact", error.message) };
  revalidatePath("/office/crm/disputes");
  revalidatePath("/office/crm/contacts");
  return { ok: true };
}

/** Харилцагчийн дугаараар (Client ID) хүсэлт бүртгэх — хяналтын хайрцагнаас. */
export async function createDataRequestByNumber(raw: {
  contactNumber: string;
  kind: string;
  channel?: string;
  note?: string;
}): Promise<Result> {
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const number = (raw.contactNumber ?? "").trim();
  if (!number) return { ok: false, error: "Харилцагчийн дугаарыг оруулна уу." };
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("office_id", c.ctx.officeId)
    .eq("number", number)
    .is("merged_into_id", null)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Ийм дугаартай харилцагч олдсонгүй эсвэл танд харах эрх алга." };
  return createDataRequest({ contactId: contact.id, kind: raw.kind, channel: raw.channel, note: raw.note });
}

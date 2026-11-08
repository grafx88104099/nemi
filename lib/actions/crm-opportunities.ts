"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, getSettingValue, type CrmStaffContext } from "@/lib/queries-crm-core";
import {
  getOpportunityTransitions,
  searchDealSources,
  searchPropertyOptions,
  getContactNeedProfiles,
  type DealSourceOption,
  type PropertyOption,
  type NeedProfileOption,
  type TransitionOption,
} from "@/lib/queries-crm-pipeline";
import { notifyCrm } from "@/lib/crm/notify";
import { normalizeDealFlow, priceAnalysisError, needsConcessionApproval } from "@/lib/crm/deal-flow";
import { CRM_ROLES, PL_CODES, type CrmRole } from "@/lib/constants-crm";
import {
  validateCreateOpportunity,
  validateUpdateOpportunity,
  validateOppNextStep,
  validateOppMeeting,
  validateOffer,
  validateOfferDecision,
  validatePriceAnalysis,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
  type OppNextStepInput,
  type OppMeetingInput,
  type RecordOfferInput,
  type OfferDecisionInput,
  type PriceAnalysisInput,
} from "@/lib/validation/crm-deals";
import type { Database, Json } from "@/types/database";
import { toIsoDate } from "@/lib/crm/calendar";

type OpportunityUpdate = Database["public"]["Tables"]["crm_opportunities"]["Update"];

// Төрлүүдийг @/lib/validation-аас шууд импортлоно: "use server" файл зөвхөн async функц экспортлох ёстой
// (төрлийн дахин экспорт server action ачаалагчид ReferenceError үүсгэдэг).

/**
 * Боломжийн бичилтүүд (§6.13, §6.14, §6.16). Гол дүрмүүд:
 *  • Шат солих ЗӨВХӨН crm_move_opportunity_stage RPC (invoker — RLS + DB stage
 *    guard дуудагчийн эрхээр; канбан = карт доторх товч = ижил шалгуур).
 *  • Шилжих шалгуур хаагдвал DB exception-ы CRM_GATE: жагсаалтыг UI-д буцаана.
 *  • Амжилтгүй хаагдсан — шалтгаан ангиллаар заавал, guard давхар сахина.
 *  • Амжилттай хаагдсан — зөвхөн хэлцэл хаагдахад DB trigger.
 *  • Үнийн санал — нөхцөлийн талбар бүр, хүчинтэй хугацаа, дараагийн алхам
 *    заавал; шийдвэр, буултын зөвшөөрөл definer RPC-ээр (аудиттай).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Боломж олдсонгүй эсвэл танд эрх алга.";

function revalidateOppPaths(id?: string) {
  revalidatePath("/office/crm/pipeline");
  revalidatePath("/agent/crm/pipeline");
  revalidatePath("/office/crm");
  revalidatePath("/agent/crm");
  if (id) {
    revalidatePath(`/office/crm/deals/${id}`);
    revalidatePath(`/agent/crm/pipeline/${id}`);
  }
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

async function dealFlow() {
  return normalizeDealFlow(await getSettingValue("deal_flow"));
}

/** Д-дүрмийн гүйцэтгэлийн лог. */
async function logRuleRun(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: "ok" | "error" | "skipped" | "dry_run",
  result?: Record<string, unknown>,
  error?: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("crm_rule_runs").insert({
      office_id: officeId,
      rule_code: ruleCode,
      entity,
      entity_id: entityId,
      status,
      result: (result ?? null) as Json,
      error: error ?? null,
    });
  } catch (e) {
    console.error("logRuleRun:", e instanceof Error ? e.message : e);
  }
}

/** Аудит — definer RPC; алдаа үндсэн үйлдлийг унагахгүй. */
async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  extra?: { field?: string; reason?: string; oldValue?: unknown; newValue?: unknown }
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: extra?.field ?? null,
      p_old: extra?.oldValue != null ? (JSON.parse(JSON.stringify(extra.oldValue)) as Json) : null,
      p_new: extra?.newValue != null ? (JSON.parse(JSON.stringify(extra.newValue)) as Json) : null,
      p_reason: extra?.reason ?? null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

/** DB guard-ын CRM_GATE: жагсаалтыг задална. */
function parseGateMissing(message: string): string[] | null {
  const idx = message.indexOf("CRM_GATE:");
  if (idx === -1) return null;
  return message
    .slice(idx + "CRM_GATE:".length)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** DB exception-ыг хэрэглэгчид ойлгомжтой болгоно. */
function friendlyDbError(message: string): string {
  const offerIdx = message.indexOf("CRM_OFFER:");
  if (offerIdx !== -1) return message.slice(offerIdx + "CRM_OFFER:".length).trim() || SAVE_ERR;
  if (message.includes("шилжилт зөвшөөрөгдөөгүй")) {
    return "Энэ шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой.";
  }
  if (message.includes("эрхгүй дүр")) return "Танд энэ шилжилтийг хийх эрх алга.";
  if (message.includes("шалтгаан заавал")) return "Энэ шилжилтэд шалтгаан заавал.";
  if (message.includes("МУТСТ түгжээтэй")) {
    return "МУТСТ түгжээтэй — Гэрээ, хаалтын шат руу шилжүүлэхийг хориглоно.";
  }
  if (message.includes("алдсан шалтгаан")) return "Амжилтгүй хаагдсан шалтгааныг ангиллаар заавал сонгоно.";
  if (message.includes("терминал шатанд")) return "Хаагдсан шатанд боломж шууд үүсгэхгүй.";
  if (message.includes("шат урсгалд тохирохгүй")) return "Сонгосон шат энэ урсгалд хамаарахгүй.";
  if (message.includes("урсгал солих зөвхөн")) {
    return "Урсгал солихдоо «Урсгал шилжүүлэх» үйлдлийг ашиглана.";
  }
  if (message.includes("эрх алга") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  if (message.includes("олдсонгүй")) return NOT_FOUND_ERR;
  return SAVE_ERR;
}

const MANAGER_ROLES = ["team_lead", "sales_director", "ops_qc", "sysadmin"];

// ── Үүсгэх модалын хайлт ──────────────────────────────────

export async function searchOpportunitySources(q: string): Promise<DealSourceOption[]> {
  const c = await ctxOrError();
  if ("error" in c) return [];
  return searchDealSources(q ?? "");
}

export async function searchOpportunityProperties(q: string): Promise<PropertyOption[]> {
  const c = await ctxOrError();
  if ("error" in c) return [];
  return searchPropertyOptions(q ?? "");
}

export async function listContactNeedProfiles(contactId: string): Promise<NeedProfileOption[]> {
  const c = await ctxOrError();
  if ("error" in c || !contactId) return [];
  return getContactNeedProfiles(contactId);
}

/** Канбанаас «Шат солих» — сонголт + дутуу шаардлага. */
export async function getMoveOptions(
  id: string
): Promise<{ transitions?: TransitionOption[]; error?: string }> {
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const res = await getOpportunityTransitions(id);
  if (!res) return { error: NOT_FOUND_ERR };
  return { transitions: res.transitions };
}

// ── Үүсгэх ────────────────────────────────────────────────

export type CreateOpportunityResult = {
  id?: string;
  error?: string;
  /** Шилжих шалгуур хаасан бол дутуу шаардлагууд (GateErrorDialog-т). */
  missing?: string[];
};

export async function createOpportunity(raw: CreateOpportunityInput): Promise<CreateOpportunityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const v = validateCreateOpportunity(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;
  const today = toIsoDate(new Date());
  if (input.nextStepDate < today) return { error: "Дараагийн үйлдлийн огноо өнгөрсөн байна." };

  // Сэжимээс үүсгэвэл харилцагч/эзэмшигчийг сэжимээс авна.
  let contactId = input.contactId ?? null;
  let ownerId = input.ownerId ?? null;
  if (input.leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, contact_id, owner_id, status")
      .eq("id", input.leadId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!lead) return { error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
    if (contactId && contactId !== lead.contact_id) return { error: "Сэжим болон харилцагч таарахгүй байна." };
    contactId = lead.contact_id;
    ownerId = ownerId ?? lead.owner_id ?? null;
  }
  if (!contactId) return { error: "Харилцагч сонгоно уу." };
  ownerId = ownerId ?? ctx.profileId;

  if (ownerId !== ctx.profileId && !ctx.roles.some((r) => MANAGER_ROLES.includes(r))) {
    return { error: "Өөр агентад оноох эрх танд алга — эзэмшигчээ өөрөө байлгана уу." };
  }

  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, code, stages:crm_stages(id, sort_order, is_terminal)")
    .eq("code", input.pipelineCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!pipeline) return { error: "Урсгал олдсонгүй эсвэл танд эрх алга." };
  type RawPl = { id: string; stages: { id: string; sort_order: number; is_terminal: boolean }[] };
  const pl = pipeline as unknown as RawPl;
  const firstStage = [...pl.stages].filter((s) => !s.is_terminal).sort((a, b) => a.sort_order - b.sort_order)[0];
  if (!firstStage) return { error: "Урсгалд идэвхтэй шат тохируулагдаагүй байна." };

  // Ижил харилцагч, урсгалд нээлттэй боломж давхардуулахгүй.
  const { data: dup } = await supabase
    .from("crm_opportunities")
    .select("id")
    .eq("contact_id", contactId)
    .eq("pipeline_id", pl.id)
    .eq("state", "open")
    .limit(1);
  if (dup?.length) {
    return { error: "Энэ харилцагчид энэ урсгалд нээлттэй боломж аль хэдийн бий. Тэр картаа үргэлжлүүлнэ үү." };
  }

  const { data: row, error } = await supabase
    .from("crm_opportunities")
    .insert({
      office_id: ctx.officeId,
      pipeline_id: pl.id,
      stage_id: firstStage.id,
      contact_id: contactId,
      property_id: input.propertyId ?? null,
      need_profile_id: input.needProfileId ?? null,
      lead_id: input.leadId ?? null,
      owner_id: ownerId,
      branch_id: ctx.branchId,
      amount: input.amount ?? null,
      expected_fee_mnt: input.expectedFeeMnt ?? null,
      currency: input.currency || "MNT",
      expected_close_on: input.expectedCloseOn ?? null,
      next_step: input.nextStep,
      next_step_date: input.nextStepDate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    const msg = error?.message ?? "";
    console.error("createOpportunity:", msg);
    const missing = parseGateMissing(msg);
    if (missing) return { error: "Эхний шатны шилжих шалгуур хангагдаагүй байна.", missing };
    return { error: friendlyDbError(msg) };
  }

  if (ownerId !== ctx.profileId) {
    await notifyCrm({
      officeId: ctx.officeId,
      event: "lead_assigned",
      recipients: [ownerId],
      title: "Шинэ боломж оноогдлоо",
      body: "Танд шинэ боломж үүсгэж оноолоо. Дараагийн үйлдлийг шалгана уу.",
      link: `/agent/crm/pipeline/${row.id}`,
      entity: "crm_opportunities",
      entityId: row.id,
    });
  }
  revalidateOppPaths(row.id);
  if (input.leadId) {
    revalidatePath(`/agent/crm/leads/${input.leadId}`);
    revalidatePath(`/office/crm/leads/${input.leadId}`);
  }
  return { id: row.id };
}

// ── Засах (дүн, огноо, үл хөдлөх, профайл, хөлс) ──────────

export async function updateOpportunity(raw: UpdateOpportunityInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const v = validateUpdateOpportunity(raw);
  if ("error" in v) return { ok: false, error: v.error };
  const input = v.data;

  const { data: before } = await supabase
    .from("crm_opportunities")
    .select("id, amount, property_id, need_profile_id, contact_id, state")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: NOT_FOUND_ERR };
  if (before.state !== "open") return { ok: false, error: "Хаагдсан боломжийг засахгүй." };

  // Хэрэгцээний профайл тухайн харилцагчийнх байх.
  if (input.needProfileId) {
    const { data: np } = await supabase
      .from("crm_need_profiles")
      .select("id, contact_id")
      .eq("id", input.needProfileId)
      .maybeSingle();
    if (!np || np.contact_id !== before.contact_id) {
      return { ok: false, error: "Сонгосон хэрэгцээний профайл энэ харилцагчийнх биш байна." };
    }
  }
  // Идэвхтэй хэлцэлтэй боломжийн үл хөдлөхийг солихгүй (хэлцэл үүнээс хамаарна).
  if (input.propertyId !== undefined && input.propertyId !== before.property_id) {
    const { data: txn } = await supabase
      .from("crm_transactions")
      .select("id")
      .eq("opportunity_id", input.id)
      .neq("status", "cancelled")
      .limit(1);
    if (txn?.length) return { ok: false, error: "Хэлцэл нээгдсэн тул үл хөдлөхийг солихгүй." };
  }

  const patch: OpportunityUpdate = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.expectedFeeMnt !== undefined) patch.expected_fee_mnt = input.expectedFeeMnt;
  if (input.currency !== undefined) patch.currency = input.currency || "MNT";
  if (input.expectedCloseOn !== undefined) patch.expected_close_on = input.expectedCloseOn ?? null;
  if (input.propertyId !== undefined) patch.property_id = input.propertyId;
  if (input.needProfileId !== undefined) patch.need_profile_id = input.needProfileId;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("crm_opportunities")
    .update(patch)
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateOpportunity:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (input.amount !== undefined && input.amount !== before.amount) {
    await writeAudit(ctx.officeId, "crm_opportunities", input.id, "update", {
      field: "amount",
      oldValue: before.amount,
      newValue: input.amount,
    });
  }
  if (input.propertyId !== undefined && input.propertyId !== before.property_id) {
    await writeAudit(ctx.officeId, "crm_opportunities", input.id, "update", {
      field: "property_id",
      oldValue: before.property_id,
      newValue: input.propertyId,
    });
  }
  revalidateOppPaths(input.id);
  return { ok: true };
}

/** Боломжийн дараагийн үйлдэл, огноо (алтан дүрэм). */
export async function setOpportunityNextStep(raw: OppNextStepInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const v = validateOppNextStep(raw);
  if ("error" in v) return { ok: false, error: v.error };
  if (v.data.nextStepDate < toIsoDate(new Date())) {
    return { ok: false, error: "Огноо өнгөрсөн байна." };
  }
  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({ next_step: v.data.nextStep, next_step_date: v.data.nextStepDate })
    .eq("id", v.data.id)
    .eq("office_id", c.ctx.officeId)
    .eq("state", "open")
    .select("id");
  if (error) {
    console.error("setOpportunityNextStep:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND_ERR };
  revalidateOppPaths(v.data.id);
  return { ok: true };
}

/** Өмчлөгчтэй уулзалт / газар дээр нь үзэх товлол (§6.14). */
export async function scheduleOwnerMeeting(raw: OppMeetingInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const v = validateOppMeeting(raw);
  if ("error" in v) return { ok: false, error: v.error };
  const at = new Date(v.data.meetingAt);
  const { data, error } = await supabase
    .from("crm_opportunities")
    .update({
      meeting_at: at.toISOString(),
      meeting_place: v.data.place,
      next_step: "Өмчлөгчтэй уулзах",
      next_step_date: toIsoDate(at),
    })
    .eq("id", v.data.id)
    .eq("office_id", c.ctx.officeId)
    .eq("state", "open")
    .select("id");
  if (error) {
    console.error("scheduleOwnerMeeting:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND_ERR };
  await writeAudit(c.ctx.officeId, "crm_opportunities", v.data.id, "meeting_scheduled", {
    field: "meeting_at",
    newValue: { at: at.toISOString(), place: v.data.place },
  });
  revalidateOppPaths(v.data.id);
  return { ok: true };
}

// ── Шат шилжүүлэх (DB guard эцсийн үнэн) ─────────────────

export type MoveStageResult = {
  ok: boolean;
  error?: string;
  /** Шилжих шалгуур хаасан бол дутуу шаардлагууд — GateErrorDialog-т жагсаана. */
  missing?: string[];
};

export async function moveStage(id: string, toStageId: string, reason?: string): Promise<MoveStageResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!id || !toStageId) return { ok: false, error: "Шат сонгоно уу." };

  const { data: before } = await supabase
    .from("crm_opportunities")
    .select("id, owner_id, stage_id, stage:crm_stages!crm_opportunities_stage_id_fkey(name)")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: NOT_FOUND_ERR };

  const { error } = await supabase.rpc("crm_move_opportunity_stage", {
    p_opp: id,
    p_to_stage: toStageId,
    p_reason: reason?.trim() || null,
  });
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) {
      return { ok: false, error: "Шилжих шалгуур хангагдаагүй — дутуу шаардлагууд байна.", missing };
    }
    console.error("moveStage:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  if (before.owner_id !== ctx.profileId) {
    const { data: st } = await supabase.from("crm_stages").select("name").eq("id", toStageId).maybeSingle();
    await notifyCrm({
      officeId: ctx.officeId,
      event: "stage_moved",
      recipients: [before.owner_id],
      title: "Боломжийн шат шилжлээ",
      body: `Таны боломжийг «${st?.name ?? "дараагийн"}» шат руу өөр ажилтан шилжүүллээ.`,
      link: `/agent/crm/pipeline/${id}`,
      entity: "crm_opportunities",
      entityId: id,
    });
  }
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Амжилтгүй хаагдсан (§6.18) ───────────────────────────

export async function closeLost(id: string, lostReasonId: string, note?: string): Promise<MoveStageResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!lostReasonId) return { ok: false, error: "Амжилтгүй хаагдсан шалтгааныг ангиллаар сонгоно уу." };

  const { data: reason } = await supabase
    .from("crm_lookups")
    .select("id, requires_note, label")
    .eq("id", lostReasonId)
    .maybeSingle();
  if (!reason) return { ok: false, error: "Шалтгаан олдсонгүй." };
  if (reason.requires_note && !note?.trim()) {
    return { ok: false, error: `«${reason.label}» шалтгаанд тайлбар заавал.` };
  }

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, pipeline_id, owner_id")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!opp) return { ok: false, error: NOT_FOUND_ERR };

  const { data: lostStage } = await supabase
    .from("crm_stages")
    .select("id")
    .eq("pipeline_id", opp.pipeline_id)
    .eq("terminal_state", "lost")
    .maybeSingle();
  if (!lostStage) return { ok: false, error: "Урсгалд «Амжилтгүй хаагдсан» шат тохируулагдаагүй байна." };

  const { error } = await supabase.rpc("crm_move_opportunity_stage", {
    p_opp: id,
    p_to_stage: lostStage.id,
    p_reason: `Амжилтгүй: ${reason.label}${note?.trim() ? ` — ${note.trim()}` : ""}`,
    p_lost_reason_id: lostReasonId,
    p_lost_note: note?.trim() || null,
  });
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) return { ok: false, error: "Шилжих шалгуур хангагдаагүй байна.", missing };
    console.error("closeLost:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  if (opp.owner_id !== ctx.profileId) {
    await notifyCrm({
      officeId: ctx.officeId,
      event: "stage_moved",
      recipients: [opp.owner_id],
      title: "Боломж амжилтгүй хаагдлаа",
      body: `Шалтгаан: ${reason.label}`,
      link: `/agent/crm/pipeline/${id}`,
      entity: "crm_opportunities",
      entityId: id,
    });
  }
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Урсгал хооронд шилжүүлэх ─────────────────────────────

export async function transferPipeline(
  id: string,
  toPipelineCode: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!reason?.trim()) return { ok: false, error: "Урсгал шилжүүлэхэд шалтгаан заавал." };
  if (!(PL_CODES as readonly string[]).includes(toPipelineCode)) {
    return { ok: false, error: "Зорилтот урсгал буруу байна." };
  }

  const { error } = await supabase.rpc("crm_transfer_opportunity_pipeline", {
    p_opp: id,
    p_to_pipeline_code: toPipelineCode,
    p_reason: reason.trim(),
  });
  if (error) {
    console.error("transferPipeline:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Эзэмшигч шилжүүлэх (RPC, түүхтэй) ────────────────────

const REASSIGN_REASONS = ["sla_breach", "inactivity", "client_request", "zoning", "offboarding"] as const;

export async function reassignOpportunity(
  id: string,
  newOwnerId: string,
  reasonCode: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!(REASSIGN_REASONS as readonly string[]).includes(reasonCode)) {
    return { ok: false, error: "Шилжүүлэлтийн шалтгаан буруу байна." };
  }

  const { error } = await supabase.rpc("crm_reassign_opportunity", {
    p_opp: id,
    p_new_owner: newOwnerId,
    p_reason: reasonCode,
    p_note: note?.trim() || null,
  });
  if (error) {
    console.error("reassignOpportunity:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  await notifyCrm({
    officeId: c.ctx.officeId,
    event: "lead_assigned",
    recipients: [newOwnerId],
    title: "Боломж танд шилжлээ",
    body: "Танд боломж шилжүүлэн оноогдлоо.",
    link: `/agent/crm/pipeline/${id}`,
    entity: "crm_opportunities",
    entityId: id,
  });
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Үнийн санал, сөрөг санал (§6.16, Д-06) ───────────────

export async function recordOffer(raw: RecordOfferInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const v = validateOffer(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;
  const today = toIsoDate(new Date());
  if (input.validUntil < today) return { error: "Хүчинтэй хугацаа өнгөрсөн байна." };
  if (input.nextStepDate < today) return { error: "Дараагийн алхмын огноо өнгөрсөн байна." };
  if (Date.parse(input.receivedAt) > Date.now() + 5 * 60000) {
    return { error: "Хүлээн авсан огноо ирээдүйд байж болохгүй." };
  }

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, owner_id, contact_id, state")
    .eq("id", input.opportunityId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!opp) return { error: NOT_FOUND_ERR };
  if (opp.state !== "open") return { error: "Хаагдсан боломжид санал бүртгэхгүй." };

  const { data: row, error } = await supabase
    .from("crm_offers")
    .insert({
      office_id: ctx.officeId,
      opportunity_id: input.opportunityId,
      direction: input.direction,
      side: input.side,
      parent_offer_id: input.parentOfferId ?? null,
      amount: input.amount,
      received_at: new Date(input.receivedAt).toISOString(),
      payment_terms: input.paymentTerms,
      financing: input.financing,
      handover_on: input.handoverOn ?? null,
      inclusions: input.inclusions ?? null,
      exclusions: input.exclusions ?? null,
      valid_until: input.validUntil,
      position: input.position,
      obstacle: input.obstacle ?? null,
      next_step: input.nextStep,
      next_step_date: input.nextStepDate,
      doc_id: input.docId ?? null,
      created_by: user.id,
    })
    .select("id, concession_pct")
    .single();
  if (error || !row) {
    console.error("recordOffer:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  // Боломжийн дараагийн үйлдэл = саналын дараагийн алхам.
  await supabase
    .from("crm_opportunities")
    .update({ next_step: input.nextStep, next_step_date: input.nextStepDate })
    .eq("id", input.opportunityId);

  await writeAudit(ctx.officeId, "crm_offers", row.id, "insert", {
    field: "amount",
    newValue: input.amount,
    reason: input.direction,
  });

  const cfg = await dealFlow();
  const label = input.direction === "offer" ? "Үнийн санал" : "Сөрөг санал";
  await notifyCrm({
    officeId: ctx.officeId,
    event: "offer_recorded",
    recipients: [opp.owner_id].filter((p) => p !== ctx.profileId),
    includeRoles: ["sales_director"],
    title: `${label} бүртгэгдлээ`,
    body: `${label}: ${input.amount.toLocaleString("mn-MN")}₮, ${input.validUntil} хүртэл хүчинтэй.${
      needsConcessionApproval(row.concession_pct, cfg) ? " Материаллаг буулттай." : ""
    }`,
    link: `/agent/crm/pipeline/${input.opportunityId}`,
    entity: "crm_offers",
    entityId: row.id,
  });

  // Д-06: санал бүртгэгдмэгц эргэн холбогдох даалгавар (дараагийн алхмын огноогоор).
  try {
    const admin = createAdminClient();
    const { data: rule } = await admin
      .from("crm_automation_rules")
      .select("is_active, dry_run")
      .eq("office_id", ctx.officeId)
      .eq("code", "D-06")
      .maybeSingle();
    if (rule && !rule.is_active) {
      await logRuleRun(ctx.officeId, "D-06", "crm_offers", row.id, "skipped", { reason: "inactive" });
    } else if (rule?.dry_run) {
      await logRuleRun(ctx.officeId, "D-06", "crm_offers", row.id, "dry_run", { would_create_task: true });
    } else {
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: user.id,
          responsible_id: opp.owner_id,
          title: `${label}ын хариугаар эргэн холбогдох`,
          description: `${input.nextStep}. Дүн: ${input.amount.toLocaleString("mn-MN")}₮.`,
          priority: "high",
          deadline: `${input.nextStepDate}T09:00:00+08:00`,
        })
        .select("id")
        .single();
      if (task?.id) {
        await admin.from("crm_task_links").insert({
          task_id: task.id,
          entity: "opportunity",
          entity_id: input.opportunityId,
          rule_code: "D-06",
        });
      }
      await logRuleRun(ctx.officeId, "D-06", "crm_offers", row.id, "ok", { task_id: task?.id ?? null });
    }
  } catch (e) {
    await logRuleRun(ctx.officeId, "D-06", "crm_offers", row.id, "error", undefined, e instanceof Error ? e.message : String(e));
  }

  revalidateOppPaths(input.opportunityId);
  return { id: row.id };
}

/** Саналыг хүлээн зөвшөөрөх / татгалзах / буцаах (харилцагчийн баталгаатай). */
export async function decideOffer(
  raw: OfferDecisionInput & { opportunityId: string }
): Promise<{ ok: boolean; error?: string; status?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { opportunityId, ...rest } = raw;
  const v = validateOfferDecision(rest);
  if ("error" in v) return { ok: false, error: v.error };
  const input = v.data;

  const { data, error } = await supabase.rpc("crm_decide_offer", {
    p_offer: input.offerId,
    p_action: input.action,
    p_channel: input.channel ?? null,
    p_note: input.note ?? null,
    p_doc: input.docId ?? null,
  });
  if (error) {
    console.error("decideOffer:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidateOppPaths(opportunityId);
  return { ok: true, status: (data as string | null) ?? undefined };
}

/** Материаллаг буултын зөвшөөрөл хүсэх. */
export async function requestOfferApproval(
  offerId: string,
  opportunityId: string,
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!note?.trim()) return { ok: false, error: "Буултын үндэслэлийг бичнэ үү." };
  const { error } = await supabase.rpc("crm_request_offer_approval", { p_offer: offerId, p_note: note.trim() });
  if (error) {
    console.error("requestOfferApproval:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  const cfg = await dealFlow();
  await notifyCrm({
    officeId: c.ctx.officeId,
    event: "offer_recorded",
    recipients: [],
    includeRoles: cfg.concessionApproverRoles.filter((r): r is CrmRole =>
      (CRM_ROLES as readonly string[]).includes(r)
    ),
    title: "Буултын зөвшөөрөл хүлээгдэж байна",
    body: `Үнийн саналд материаллаг буулт хийх зөвшөөрөл хүсэв: ${note.trim()}`.slice(0, 200),
    link: `/office/crm/deals/${opportunityId}`,
    entity: "crm_offers",
    entityId: offerId,
  });
  revalidateOppPaths(opportunityId);
  return { ok: true };
}

/** Буултыг батлах / татгалзах (эрхийн матриц — deal_flow.concession_approver_roles). */
export async function decideOfferApproval(
  offerId: string,
  opportunityId: string,
  approve: boolean,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { error } = await supabase.rpc("crm_decide_offer_approval", {
    p_offer: offerId,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) {
    console.error("decideOfferApproval:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }
  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("owner_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (opp?.owner_id) {
    await notifyCrm({
      officeId: c.ctx.officeId,
      event: "offer_recorded",
      recipients: [opp.owner_id],
      title: approve ? "Буулт батлагдлаа" : "Буултаас татгалзлаа",
      body: approve
        ? "Харилцагчийн зөвшөөрлийг бүртгэж саналыг хүлээн зөвшөөрнө үү."
        : `Шалтгаан: ${note?.trim() ?? "—"}`,
      link: `/agent/crm/pipeline/${opportunityId}`,
      entity: "crm_offers",
      entityId: offerId,
    });
  }
  revalidateOppPaths(opportunityId);
  return { ok: true };
}

// ── Үнийн дүн шинжилгээ (§6.14) ──────────────────────────

export async function recordPriceAnalysis(raw: PriceAnalysisInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const v = validatePriceAnalysis(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;

  const cfg = await dealFlow();
  const comps = input.comparables.map((x) => ({
    address: x.address,
    price: x.price,
    area_m2: x.area_m2 ?? null,
    note: x.note ?? null,
  }));
  const err = priceAnalysisError(comps, input.recommendedPrice, input.priceMin, input.priceMax, cfg);
  if (err) return { error: err };

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, property_id, state")
    .eq("id", input.opportunityId)
    .eq("office_id", c.ctx.officeId)
    .maybeSingle();
  if (!opp) return { error: NOT_FOUND_ERR };
  if (opp.state !== "open") return { error: "Хаагдсан боломжид бүртгэхгүй." };

  const { data: row, error } = await supabase
    .from("crm_price_analyses")
    .insert({
      office_id: c.ctx.officeId,
      opportunity_id: input.opportunityId,
      property_id: opp.property_id,
      comparables: comps as unknown as Json,
      price_min: input.priceMin ?? null,
      price_max: input.priceMax ?? null,
      recommended_price: input.recommendedPrice,
      note: input.note ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("recordPriceAnalysis:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }
  revalidateOppPaths(input.opportunityId);
  return { id: row.id };
}

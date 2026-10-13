"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { PL_CODES } from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

type OpportunityUpdate = Database["public"]["Tables"]["crm_opportunities"]["Update"];

/**
 * Боломжийн бичилтүүд (U4 — F-350–362, P-02–P-06). Гол дүрмүүд:
 *  • Шат солих ЗӨВХӨН crm_move_opportunity_stage RPC (invoker — RLS + DB stage
 *    guard дуудагчийн эрхээр; канбан drag = карт доторх товч = «ижил босго», F-352).
 *  • Гейт хаагдвал DB exception-ы CRM_GATE: жагсаалтыг задалж UI-д буцаана (F-354).
 *  • Closed Lost — шалтгаан ангиллаар заавал (F-356), guard давхар сахина.
 *  • Урсгал шилжүүлэлт (F-361) — түүхтэй definer RPC.
 *  • Санал бүртгэмэгц Д-06: эргэн холбогдох даалгавар + мэдэгдэл.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";

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

/** Мэдэгдэл — admin client, алдаа үндсэн үйлдлийг унагахгүй (crm-staff загвар). */
async function notify(recipientIds: string[], type: string, title: string, body: string, link?: string) {
  try {
    const targets = [...new Set(recipientIds)].filter(Boolean);
    if (!targets.length) return;
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, role").in("id", targets);
    const rows = (profiles ?? []).map((p) => ({
      user_id: p.id,
      type,
      title,
      body: body.slice(0, 120),
      link:
        link ??
        (p.role === "office_admin" || p.role === "admin" ? "/office/crm/pipeline" : "/agent/crm/pipeline"),
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

/** Д-дүрмийн гүйцэтгэлийн лог (F-602). */
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

/** DB guard-ын CRM_GATE: жагсаалтыг задална (F-354 — дутуу шаардлагууд). */
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
  if (message.includes("шилжилт зөвшөөрөгдөөгүй")) {
    return "Энэ шилжилт зөвшөөрөгдөөгүй — шат алгасах хориотой (F-355).";
  }
  if (message.includes("эрхгүй дүр")) return "Танд энэ шилжилтийг хийх эрх алга.";
  if (message.includes("шалтгаан заавал")) return "Энэ шилжилтэд шалтгаан заавал (F-355).";
  if (message.includes("МУТСТ түгжээтэй")) {
    return "МУТСТ түгжээтэй — Гэрээ/Хаалтын чиглэлийн шат руу шилжүүлэхийг хориглоно (Д-12).";
  }
  if (message.includes("алдсан шалтгаан")) return "Алдсан шалтгааныг ангиллаар заавал сонгоно (F-356).";
  if (message.includes("терминал шатанд")) return "Терминал шатанд боломж шууд үүсгэхгүй.";
  if (message.includes("шат урсгалд тохирохгүй")) return "Сонгосон шат энэ урсгалд хамаарахгүй.";
  if (message.includes("урсгал солих зөвхөн")) {
    return "Урсгал солихдоо «Урсгал шилжүүлэх» үйлдлийг ашиглана (F-361).";
  }
  if (message.includes("эрх алга") || message.includes("оффисын эрхгүй")) {
    return "Танд энэ үйлдлийг хийх эрх алга.";
  }
  if (message.includes("олдсонгүй")) return "Боломж олдсонгүй эсвэл танд эрх алга.";
  return SAVE_ERR;
}

// ── Үүсгэх ────────────────────────────────────────────────

const createOppSchema = z
  .object({
    pipelineCode: z.enum(PL_CODES, "Урсгал сонгоно уу"),
    contactId: z.uuid("Харилцагч сонгоно уу").optional(),
    leadId: z.uuid().optional(),
    propertyId: z.uuid().optional().nullable(),
    needProfileId: z.uuid().optional().nullable(),
    ownerId: z.uuid().optional(),
    amount: z.number("Дүн буруу байна").nonnegative("Дүн сөрөг байж болохгүй").optional().nullable(),
    currency: z.string().trim().max(8).optional(),
    expectedCloseOn: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Хаагдах төлөв огноо буруу байна")
      .optional()
      .nullable(),
  })
  .strict();

export type CreateOpportunityInput = z.infer<typeof createOppSchema>;

export type CreateOpportunityResult = {
  id?: string;
  error?: string;
  /** Гейт хаасан бол дутуу шаардлагууд (GateErrorDialog-т). */
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

  const parsed = createOppSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  }
  const input = parsed.data;

  // Сэжимээс үүсгэвэл харилцагч/эзэмшигчийг сэжимээс авна (P-01 → PL шилжилт).
  let contactId = input.contactId ?? null;
  let ownerId = input.ownerId ?? null;
  if (input.leadId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, contact_id, owner_id, branch_id")
      .eq("id", input.leadId)
      .eq("office_id", ctx.officeId)
      .maybeSingle();
    if (!lead) return { error: "Сэжим олдсонгүй эсвэл танд эрх алга." };
    contactId = contactId ?? lead.contact_id;
    ownerId = ownerId ?? lead.owner_id;
  }
  if (!contactId) return { error: "Харилцагч сонгоно уу." };
  ownerId = ownerId ?? ctx.profileId;

  // Өөр хүнд оноох — зөвхөн team_lead+ (зарчим 6).
  if (
    ownerId !== ctx.profileId &&
    !ctx.roles.some((r) => ["team_lead", "sales_director", "ops_qc", "sysadmin"].includes(r))
  ) {
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
      currency: input.currency || "MNT",
      expected_close_on: input.expectedCloseOn ? input.expectedCloseOn.slice(0, 10) : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    const msg = error?.message ?? "";
    console.error("createOpportunity:", msg);
    const missing = parseGateMissing(msg);
    if (missing) {
      return { error: "Эхний шатны гейт хангагдаагүй байна (F-354).", missing };
    }
    return { error: friendlyDbError(msg) };
  }

  if (ownerId !== ctx.profileId) {
    await notify([ownerId], "crm_opp_assigned", "Шинэ боломж оноогдлоо", "Танд шинэ боломж үүсгэж оноолоо.");
  }
  revalidateOppPaths(row.id);
  return { id: row.id };
}

// ── Засах (дүн, огноо, объект, профайл) ───────────────────

const updateOppSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().nonnegative("Дүн сөрөг байж болохгүй").optional().nullable(),
    currency: z.string().trim().max(8).optional(),
    expectedCloseOn: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Хаагдах төлөв огноо буруу байна")
      .optional()
      .nullable(),
    propertyId: z.uuid().optional().nullable(),
    needProfileId: z.uuid().optional().nullable(),
  })
  .strict();

export type UpdateOpportunityInput = z.infer<typeof updateOppSchema>;

export async function updateOpportunity(raw: UpdateOpportunityInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = updateOppSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: before } = await supabase
    .from("crm_opportunities")
    .select("id, amount")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Боломж олдсонгүй эсвэл танд эрх алга." };

  const patch: OpportunityUpdate = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency || "MNT";
  if (input.expectedCloseOn !== undefined) {
    patch.expected_close_on = input.expectedCloseOn ? input.expectedCloseOn.slice(0, 10) : null;
  }
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
  revalidateOppPaths(input.id);
  return { ok: true };
}

// ── Шат шилжүүлэх (F-352/354/355 — DB guard эцсийн үнэн) ──

export type MoveStageResult = {
  ok: boolean;
  error?: string;
  /** Гейт хаасан бол дутуу шаардлагууд — GateErrorDialog-т жагсаана. */
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
    .select("id, owner_id, stage_id")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Боломж олдсонгүй эсвэл танд эрх алга." };

  const { error } = await supabase.rpc("crm_move_opportunity_stage", {
    p_opp: id,
    p_to_stage: toStageId,
    p_reason: reason?.trim() || null,
  });
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) return { ok: false, error: "Гейт хангагдаагүй — дутуу шаардлагууд байна (F-354).", missing };
    console.error("moveStage:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  if (before.owner_id !== ctx.profileId) {
    await notify(
      [before.owner_id],
      "crm_stage_moved",
      "Боломжийн шат шилжлээ",
      "Таны боломжийн шатыг өөр ажилтан шилжүүллээ.",
      `/agent/crm/pipeline/${id}`
    );
  }
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Closed Lost (F-356) ───────────────────────────────────

export async function closeLost(
  id: string,
  lostReasonId: string,
  note?: string
): Promise<MoveStageResult> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!lostReasonId) return { ok: false, error: "Алдсан шалтгааныг ангиллаар сонгоно уу (F-356)." };

  // «Бусад» гэх мэт requires_note шалтгаанд тайлбар заавал.
  const { data: reason } = await supabase
    .from("crm_lookups")
    .select("id, requires_note, label")
    .eq("id", lostReasonId)
    .maybeSingle();
  if (!reason) return { ok: false, error: "Алдсан шалтгаан олдсонгүй." };
  if (reason.requires_note && !note?.trim()) {
    return { ok: false, error: `«${reason.label}» шалтгаанд тайлбар заавал.` };
  }

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, pipeline_id, owner_id")
    .eq("id", id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!opp) return { ok: false, error: "Боломж олдсонгүй эсвэл танд эрх алга." };

  const { data: lostStage } = await supabase
    .from("crm_stages")
    .select("id")
    .eq("pipeline_id", opp.pipeline_id)
    .eq("terminal_state", "lost")
    .maybeSingle();
  if (!lostStage) return { ok: false, error: "Урсгалд «Алдсан» терминал шат тохируулагдаагүй байна." };

  const { error } = await supabase.rpc("crm_move_opportunity_stage", {
    p_opp: id,
    p_to_stage: lostStage.id,
    p_reason: `lost: ${reason.label}${note?.trim() ? ` — ${note.trim()}` : ""}`,
    p_lost_reason_id: lostReasonId,
    p_lost_note: note?.trim() || null,
  });
  if (error) {
    const missing = parseGateMissing(error.message);
    if (missing) return { ok: false, error: "Гейт хангагдаагүй байна (F-354).", missing };
    console.error("closeLost:", error.message);
    return { ok: false, error: friendlyDbError(error.message) };
  }

  if (opp.owner_id !== ctx.profileId) {
    await notify([opp.owner_id], "crm_stage_moved", "Боломж алдсанаар хаагдлаа", `Шалтгаан: ${reason.label}`);
  }
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Урсгал хооронд шилжүүлэх (F-361) ─────────────────────

export async function transferPipeline(
  id: string,
  toPipelineCode: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!reason?.trim()) return { ok: false, error: "Урсгал шилжүүлэхэд шалтгаан заавал (F-361)." };
  if (!(PL_CODES as readonly string[]).includes(toPipelineCode)) {
    return { ok: false, error: "Зорилтот урсгалын код буруу байна." };
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

// ── Эзэмшигч шилжүүлэх (зарчим 6 — RPC, түүхтэй) ─────────

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
    return { ok: false, error: "Шилжүүлэлтийн шалтгааны код буруу байна." };
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

  await notify([newOwnerId], "crm_opp_assigned", "Боломж танд шилжлээ", "Танд боломж шилжүүлэн оноогдлоо.");
  revalidateOppPaths(id);
  return { ok: true };
}

// ── Санал/хэлэлцээр бүртгэх (P-02 §2.4, Д-06) ─────────────

const offerSchema = z
  .object({
    opportunityId: z.uuid(),
    direction: z.enum(["offer", "counter"], "Саналын чиглэл буруу байна"),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    terms: z.string().trim().max(2000, "Нөхцөл хэт урт байна").optional().nullable(),
    validUntil: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Хүчинтэй хугацааны огноо буруу байна")
      .optional()
      .nullable(),
    position: z.string().trim().max(1000).optional().nullable(),
    obstacle: z.string().trim().max(1000).optional().nullable(),
    nextStep: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type RecordOfferInput = z.infer<typeof offerSchema>;

export async function recordOffer(raw: RecordOfferInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = offerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: opp } = await supabase
    .from("crm_opportunities")
    .select("id, owner_id, contact_id, state")
    .eq("id", input.opportunityId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!opp) return { error: "Боломж олдсонгүй эсвэл танд эрх алга." };
  if (opp.state !== "open") return { error: "Хаагдсан боломжид санал бүртгэхгүй." };

  const { data: row, error } = await supabase
    .from("crm_offers")
    .insert({
      office_id: ctx.officeId,
      opportunity_id: input.opportunityId,
      direction: input.direction,
      amount: input.amount,
      terms: input.terms ? ({ text: input.terms } as unknown as Json) : null,
      valid_until: input.validUntil ? input.validUntil.slice(0, 10) : null,
      position: input.position ?? null,
      obstacle: input.obstacle ?? null,
      next_step: input.nextStep ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("recordOffer:", error?.message);
    return { error: friendlyDbError(error?.message ?? "") };
  }

  await writeAudit(ctx.officeId, "crm_offers", row.id, "insert", {
    field: "amount",
    newValue: input.amount,
    reason: input.direction,
  });

  // Д-06: санал бүртгэгдмэгц эргэн холбогдох сануулгын даалгавар + мэдэгдэл.
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
      const deadline = new Date(Date.now() + 24 * 3600000).toISOString();
      const { data: task } = await admin
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: user.id,
          responsible_id: opp.owner_id,
          title: "Саналын хариугаар эргэн холбогдох (Д-06)",
          description: `Санал/сөрөг санал бүртгэгдсэн — 24 цагт эргэн холбогдоно. Дүн: ${input.amount.toLocaleString()}₮.`,
          priority: "high",
          deadline,
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

      // Мэдэгдэл: эзэмшигч + борлуулалтын захирал (matrix: offer_recorded).
      const { data: sds } = await admin
        .from("crm_staff")
        .select("profile_id")
        .eq("office_id", ctx.officeId)
        .eq("is_active", true)
        .contains("roles", ["sales_director"]);
      const recipients = [opp.owner_id, ...(sds ?? []).map((s) => s.profile_id)].filter(
        (p) => p !== ctx.profileId
      );
      await notify(
        recipients,
        "crm_offer_recorded",
        "Санал бүртгэгдлээ",
        `${input.direction === "offer" ? "Санал" : "Сөрөг санал"}: ${input.amount.toLocaleString()}₮.`
      );
    }
  } catch (e) {
    await logRuleRun(
      ctx.officeId,
      "D-06",
      "crm_offers",
      row.id,
      "error",
      undefined,
      e instanceof Error ? e.message : String(e)
    );
  }

  revalidateOppPaths(input.opportunityId);
  return { id: row.id };
}

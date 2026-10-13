"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { CRM_ROLES, GATES, GATE_CHECKER_KINDS, type CrmRole } from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * CRM тохиргооны server action-ууд (D4 — тохиргоо = өгөгдөл, хувилбартай).
 * Бичих эрх: sysadmin + ops_qc (ToR ACC-17 «хоёр хүний зарчим» — RLS давхар шалгана).
 */

const SAVE_ERR = "Тохиргоо хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const RIGHTS_ERR = "Танд тохиргоо өөрчлөх эрх алга.";

type Ctx = { userId: string; officeId: string; roles: CrmRole[] };

async function settingsContext(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Ctx | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтэрнэ үү." };
  const { data: staff } = await supabase
    .from("crm_staff")
    .select("office_id, roles")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return { error: "Та CRM-д бүртгэгдээгүй байна." };
  const roles = (staff.roles ?? []) as CrmRole[];
  if (!roles.includes("sysadmin") && !roles.includes("ops_qc")) return { error: RIGHTS_ERR };
  return { userId: user.id, officeId: staff.office_id, roles };
}

function revalidateSettings() {
  revalidatePath("/office/crm/settings");
  revalidatePath("/office/crm/settings/pipelines");
  revalidatePath("/office/crm/settings/scoring");
  revalidatePath("/office/crm/settings/zones");
  revalidatePath("/office/crm/settings/rules");
  revalidatePath("/office/crm/settings/notifications");
  revalidatePath("/office/crm/settings/lookups");
  revalidatePath("/office/crm/settings/staff");
}

function firstIssue(err: z.ZodError, fallback: string): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : fallback;
}

// ── Хувилбартай параметр (crm_settings) ───────────────────

const settingSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Түлхүүр оруулна уу")
      .max(80, "Түлхүүр хэт урт")
      .regex(/^[a-z0-9_]+$/, "Түлхүүр зөвхөн жижиг үсэг, тоо, доогуур зураас"),
    /** JSON текст — parse хийгдэж чадах ёстой. */
    valueJson: z.string().trim().min(1, "Утга оруулна уу").max(20000, "Утга хэт урт"),
    note: z.string().trim().max(500, "Тайлбар хэт урт").optional(),
  })
  .strict();

/**
 * Шинэ хувилбар үүсгэнэ (update БИШ insert — F-453 зөвхөн урагш үйлчилнэ):
 * одоогийн нээлттэй хувилбарын valid_to-г хааж, шинэ мөр нэмнэ.
 */
export async function saveSetting(raw: {
  key: string;
  valueJson: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const parsed = settingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };

  let value: Json;
  try {
    value = JSON.parse(parsed.data.valueJson) as Json;
  } catch {
    return { ok: false, error: "Утга хүчинтэй JSON биш байна." };
  }

  const now = new Date().toISOString();

  // Нээлттэй хуучин хувилбарыг хаана (байхгүй байж болно).
  const { error: closeErr } = await supabase
    .from("crm_settings")
    .update({ valid_to: now })
    .eq("office_id", ctx.officeId)
    .eq("key", parsed.data.key)
    .is("valid_to", null);
  if (closeErr) {
    console.error("saveSetting close:", closeErr.message);
    return { ok: false, error: SAVE_ERR };
  }

  const { error } = await supabase.from("crm_settings").insert({
    office_id: ctx.officeId,
    key: parsed.data.key,
    value,
    valid_from: now,
    created_by: ctx.userId,
    note: parsed.data.note || null,
  });
  if (error) {
    console.error("saveSetting:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Салбар, баг, бүс ──────────────────────────────────────

const branchSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(1, "Код оруулна уу").max(40).regex(/^[a-z0-9_-]+$/, "Код зөвхөн латин жижиг үсэг/тоо"),
    name: z.string().trim().min(1, "Нэр оруулна уу").max(120),
    isActive: z.boolean(),
  })
  .strict();

export async function saveBranch(raw: {
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = branchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const { error } = input.id
    ? await supabase
        .from("crm_branches")
        .update({ code: input.code, name: input.name, is_active: input.isActive })
        .eq("id", input.id)
        .eq("office_id", ctx.officeId)
    : await supabase
        .from("crm_branches")
        .insert({ office_id: ctx.officeId, code: input.code, name: input.name, is_active: input.isActive });
  if (error) {
    console.error("saveBranch:", error.message);
    return { ok: false, error: error.code === "23505" ? "Ийм кодтой салбар аль хэдийн байна." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

const teamSchema = z
  .object({
    id: z.string().uuid().optional(),
    branchId: z.string().uuid("Салбар сонгоно уу"),
    name: z.string().trim().min(1, "Нэр оруулна уу").max(120),
    leadProfileId: z.string().uuid().nullable(),
  })
  .strict();

export async function saveTeam(raw: {
  id?: string;
  branchId: string;
  name: string;
  leadProfileId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = teamSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const { error } = input.id
    ? await supabase
        .from("crm_teams")
        .update({ branch_id: input.branchId, name: input.name, lead_profile_id: input.leadProfileId })
        .eq("id", input.id)
        .eq("office_id", ctx.officeId)
    : await supabase.from("crm_teams").insert({
        office_id: ctx.officeId,
        branch_id: input.branchId,
        name: input.name,
        lead_profile_id: input.leadProfileId,
      });
  if (error) {
    console.error("saveTeam:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

const zoneSchema = z
  .object({
    id: z.string().uuid().optional(),
    district: z.string().trim().min(1, "Дүүрэг оруулна уу").max(80),
    khoroo: z.string().trim().max(40).nullable(),
    complex: z.string().trim().max(120).nullable(),
    branchId: z.string().uuid("Салбар сонгоно уу"),
    rationale: z.string().trim().max(500).nullable(),
    isActive: z.boolean(),
  })
  .strict();

export async function saveZone(raw: {
  id?: string;
  district: string;
  khoroo: string | null;
  complex: string | null;
  branchId: string;
  rationale: string | null;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = zoneSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    district: input.district,
    khoroo: input.khoroo,
    complex: input.complex,
    branch_id: input.branchId,
    rationale: input.rationale,
    is_active: input.isActive,
    decided_by: ctx.userId,
    decided_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await supabase.from("crm_zone_directory").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_zone_directory").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveZone:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Урсгал, шат, шилжилт ──────────────────────────────────

const pipelineSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(1, "Код оруулна уу").max(20),
    name: z.string().trim().min(1, "Нэр оруулна уу").max(120),
    restricted: z.boolean(),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .strict();

export async function savePipeline(raw: {
  id?: string;
  code: string;
  name: string;
  restricted: boolean;
  sortOrder: number;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = pipelineSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    code: input.code,
    name: input.name,
    restricted: input.restricted,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
  const { error } = input.id
    ? await supabase.from("crm_pipelines").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_pipelines").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("savePipeline:", error.message);
    return { ok: false, error: error.code === "23505" ? "Ийм кодтой урсгал аль хэдийн байна." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

const stageSchema = z
  .object({
    id: z.string().uuid().optional(),
    pipelineId: z.string().uuid("Урсгал сонгоно уу"),
    code: z.string().trim().min(1, "Код оруулна уу").max(40),
    name: z.string().trim().min(1, "Нэр оруулна уу").max(120),
    sortOrder: z.number().int().min(0),
    probability: z.number().min(0, "Магадлал 0–100").max(100, "Магадлал 0–100"),
    gateCode: z.enum(GATES).nullable(),
    isTerminal: z.boolean(),
    terminalState: z.enum(["won", "lost"]).nullable(),
    isClosingDirection: z.boolean(),
  })
  .strict()
  .refine((s) => !s.isTerminal || s.terminalState !== null, {
    message: "Терминал шатанд won/lost төлөв заавал",
  });

export async function saveStage(raw: {
  id?: string;
  pipelineId: string;
  code: string;
  name: string;
  sortOrder: number;
  probability: number;
  gateCode: (typeof GATES)[number] | null;
  isTerminal: boolean;
  terminalState: "won" | "lost" | null;
  isClosingDirection: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = stageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    pipeline_id: input.pipelineId,
    code: input.code,
    name: input.name,
    sort_order: input.sortOrder,
    probability: input.probability,
    gate_code: input.gateCode,
    is_terminal: input.isTerminal,
    terminal_state: input.terminalState,
    is_closing_direction: input.isClosingDirection,
  };
  const { error } = input.id
    ? await supabase.from("crm_stages").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_stages").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveStage:", error.message);
    return { ok: false, error: error.code === "23505" ? "Ийм кодтой шат энэ урсгалд аль хэдийн байна." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

const transitionSchema = z
  .object({
    id: z.string().uuid().optional(),
    pipelineId: z.string().uuid(),
    fromStageId: z.string().uuid("Эхлэх шат сонгоно уу"),
    toStageId: z.string().uuid("Очих шат сонгоно уу"),
    kind: z.enum(["forward", "backward", "skip"]),
    allowedRoles: z.array(z.enum(CRM_ROLES)).min(1, "Дор хаяж нэг дүр сонгоно уу"),
    requiresReason: z.boolean(),
  })
  .strict()
  .refine((t) => t.fromStageId !== t.toStageId, { message: "Эхлэх ба очих шат ижил байж болохгүй" });

export async function saveTransition(raw: {
  id?: string;
  pipelineId: string;
  fromStageId: string;
  toStageId: string;
  kind: "forward" | "backward" | "skip";
  allowedRoles: CrmRole[];
  requiresReason: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = transitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    pipeline_id: input.pipelineId,
    from_stage_id: input.fromStageId,
    to_stage_id: input.toStageId,
    kind: input.kind,
    allowed_roles: input.allowedRoles,
    requires_reason: input.requiresReason,
  };
  const { error } = input.id
    ? await supabase.from("crm_stage_transitions").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_stage_transitions").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveTransition:", error.message);
    return { ok: false, error: error.code === "23505" ? "Энэ шилжилт аль хэдийн бүртгэгдсэн." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

const gateReqSchema = z
  .object({
    id: z.string().uuid().optional(),
    gateCode: z.enum(GATES),
    pipelineId: z.string().uuid().nullable(),
    checkerKind: z.enum(GATE_CHECKER_KINDS),
    paramsJson: z.string().trim().max(2000).optional(),
    isActive: z.boolean(),
  })
  .strict();

export async function saveGateRequirement(raw: {
  id?: string;
  gateCode: (typeof GATES)[number];
  pipelineId: string | null;
  checkerKind: (typeof GATE_CHECKER_KINDS)[number];
  paramsJson?: string;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = gateReqSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  let params: Json = {};
  if (input.paramsJson) {
    try {
      params = JSON.parse(input.paramsJson) as Json;
    } catch {
      return { ok: false, error: "Параметр хүчинтэй JSON биш байна." };
    }
  }
  const row = {
    gate_code: input.gateCode,
    pipeline_id: input.pipelineId,
    checker_kind: input.checkerKind,
    params,
    is_active: input.isActive,
  };
  const { error } = input.id
    ? await supabase.from("crm_gate_requirements").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_gate_requirements").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveGateRequirement:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Лавлах ────────────────────────────────────────────────

const lookupSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.string().trim().min(1, "Төрөл оруулна уу").max(60).regex(/^[a-z0-9_]+$/, "Төрөл зөвхөн латин жижиг үсэг"),
    code: z.string().trim().min(1, "Код оруулна уу").max(60).regex(/^[a-z0-9_-]+$/, "Код зөвхөн латин жижиг үсэг"),
    label: z.string().trim().min(1, "Нэр оруулна уу").max(160),
    requiresNote: z.boolean(),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .strict();

export async function saveLookup(raw: {
  id?: string;
  kind: string;
  code: string;
  label: string;
  requiresNote: boolean;
  sortOrder: number;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = lookupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    kind: input.kind,
    code: input.code,
    label: input.label,
    requires_note: input.requiresNote,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
  const { error } = input.id
    ? await supabase.from("crm_lookups").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_lookups").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveLookup:", error.message);
    return { ok: false, error: error.code === "23505" ? "Ийм кодтой утга энэ лавлахад аль хэдийн байна." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Автомат дүрэм (идэвх/dry-run — F-601) ────────────────

export async function saveRule(raw: {
  id: string;
  isActive: boolean;
  dryRun: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!z.string().uuid().safeParse(raw.id).success) return { ok: false, error: "Дүрэм буруу." };

  const { error } = await supabase
    .from("crm_automation_rules")
    .update({ is_active: !!raw.isActive, dry_run: !!raw.dryRun })
    .eq("id", raw.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("saveRule:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Мэдэгдлийн матриц ─────────────────────────────────────

const matrixSchema = z
  .object({
    id: z.string().uuid().optional(),
    eventCode: z.string().trim().min(1, "Event код оруулна уу").max(60).regex(/^[a-z0-9_]+$/, "Код зөвхөн латин жижиг үсэг"),
    recipientRoles: z.array(z.enum(CRM_ROLES)).min(1, "Дор хаяж нэг дүр сонгоно уу"),
    channels: z.array(z.enum(["app", "push", "email", "sms"])).min(1, "Дор хаяж нэг суваг сонгоно уу"),
    mandatory: z.boolean(),
    quietHoursExempt: z.boolean(),
  })
  .strict();

export async function saveNotificationMatrix(raw: {
  id?: string;
  eventCode: string;
  recipientRoles: CrmRole[];
  channels: ("app" | "push" | "email" | "sms")[];
  mandatory: boolean;
  quietHoursExempt: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = matrixSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const row = {
    event_code: input.eventCode,
    recipient_roles: input.recipientRoles,
    channels: input.channels,
    mandatory: input.mandatory,
    quiet_hours_exempt: input.quietHoursExempt,
  };
  const { error } = input.id
    ? await supabase.from("crm_notification_matrix").update(row).eq("id", input.id).eq("office_id", ctx.officeId)
    : await supabase.from("crm_notification_matrix").insert({ office_id: ctx.officeId, ...row });
  if (error) {
    console.error("saveNotificationMatrix:", error.message);
    return { ok: false, error: error.code === "23505" ? "Энэ event аль хэдийн бүртгэгдсэн." : SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

// ── Хуанли (F-604) ────────────────────────────────────────

const calendarSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Огноо буруу"),
    isWorkday: z.boolean(),
    note: z.string().trim().max(200).nullable(),
  })
  .strict();

export async function saveCalendarDay(raw: {
  day: string;
  isWorkday: boolean;
  note: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await settingsContext(supabase);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = calendarSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Оролт буруу байна.") };
  const input = parsed.data;

  const { error } = await supabase.from("crm_calendar_days").upsert(
    {
      office_id: ctx.officeId,
      day: input.day,
      is_workday: input.isWorkday,
      note: input.note,
    },
    { onConflict: "office_id,day" }
  );
  if (error) {
    console.error("saveCalendarDay:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  revalidateSettings();
  return { ok: true };
}

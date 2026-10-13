"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { AML_CASE_STATUSES, GATES, KYC_STATUSES } from "@/lib/constants-crm";
import type { Database, Json } from "@/types/database";

/**
 * МУТСТ бичилтүүд (U5 — §7.5/§7.6, Д-25/Д-26, F-421/611).
 *  • submitAmlAlert — бүх staff; insert-д .select() ОГТ ЗАЛГАХГҮЙ
 *    (crm_aml_alerts-д staff-ийн SELECT policy зориуд байхгүй — tipping-off;
 *    DESIGN §6.2 RETURNING+RLS конвенц (а)). UI-д зөвхөн «Дохио илгээгдлээ».
 *  • Кейс/hold — зөвхөн aml_officer (RLS + давхар шалгалт); ceo уншина.
 *  • Hold тавих/суллах бүр үндэслэлтэй, аудит DB trigger-ээс.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const OFFICER_ERR = "Энэ үйлдлийг зөвхөн МУТСТ-ийн хяналт тавих ажилтан хийнэ.";

function revalidateAmlPaths(id?: string) {
  revalidatePath("/office/crm/aml");
  if (id) revalidatePath(`/office/crm/aml/${id}`);
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function friendlyAmlError(message: string): string {
  const idx = message.indexOf("CRM_AML:");
  if (idx !== -1) return message.slice(idx + "CRM_AML:".length).trim() || SAVE_ERR;
  const idx2 = message.indexOf("CRM_TXN:");
  if (idx2 !== -1) return message.slice(idx2 + "CRM_TXN:".length).trim() || SAVE_ERR;
  if (message.includes("row-level security")) return "Танд энэ үйлдлийг хийх эрх алга.";
  if (message.includes("олдсонгүй")) return "Бичлэг олдсонгүй эсвэл танд эрх алга.";
  return SAVE_ERR;
}

// ── Дотоод дохиолол — Маягт 1 (§7.6, бүх дүрд) ────────────

const alertSchema = z
  .object({
    contactId: z.uuid().optional().nullable(),
    transactionId: z.uuid().optional().nullable(),
    category: z.string().trim().max(120).optional().nullable(),
    observed: z.string().trim().min(1, "Ажигласан нөхцөл байдлаа бичнэ үү").max(4000),
    amountMnt: z.number().nonnegative().optional().nullable(),
    paymentMethod: z.string().trim().max(60).optional().nullable(),
    parties: z.string().trim().max(2000).optional().nullable(),
    urgent: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.contactId || v.transactionId, {
    message: "Харилцагч эсвэл хэлцлийн аль нэгийг холбоно уу.",
  });

export type SubmitAmlAlertInput = z.infer<typeof alertSchema>;

export async function submitAmlAlert(raw: SubmitAmlAlertInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = alertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  // ⚠️ .select() ЗАЛГАХГҮЙ — үүсгэгчид мөр харагдахгүй (tipping-off UX).
  const { error } = await supabase.from("crm_aml_alerts").insert({
    office_id: ctx.officeId,
    contact_id: input.contactId ?? null,
    transaction_id: input.transactionId ?? null,
    alert_kind: "manual",
    reported_by: user.id,
    category: input.category ?? null,
    observed: input.observed,
    amount_mnt: input.amountMnt ?? null,
    payment_method: input.paymentMethod ?? null,
    parties: input.parties ? ({ text: input.parties } as Json) : null,
    urgent: input.urgent ?? false,
  });
  if (error) {
    console.error("submitAmlAlert:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  // Явц/үр дүн үүсгэгчид ХАРАГДАХГҮЙ — зөвхөн илгээгдсэн баталгаа.
  return { ok: true };
}

// ── Харилцагчийн МУТСТ бүртгэл (officer, journals 6.18) ───

const contactAmlSchema = z
  .object({
    contactId: z.uuid(),
    kycStatus: z.enum(KYC_STATUSES).optional(),
    risk: z.enum(["low", "medium", "high", "prohibited"]).optional().nullable(),
    riskScore: z.number().min(0).max(100).optional().nullable(),
    pepStatus: z.enum(["no", "possible", "confirmed"]).optional().nullable(),
    sanctionsResult: z.string().trim().max(500).optional().nullable(),
    uboVerified: z.enum(["yes", "no", "na"]).optional().nullable(),
    fundsSource: z.string().trim().max(1000).optional().nullable(),
    paymentMethod: z.string().trim().max(60).optional().nullable(),
    thirdPartyPayer: z.boolean().optional().nullable(),
    thirdPartyNote: z.string().trim().max(1000).optional().nullable(),
    redFlags: z.array(z.string().trim().max(120)).optional().nullable(),
    officerDecision: z.enum(["proceed", "edd", "suspend", "reject"]).optional().nullable(),
    nextReviewAt: z.string().optional().nullable(),
  })
  .strict();

export type UpsertContactAmlInput = z.infer<typeof contactAmlSchema>;

export async function upsertContactAml(raw: UpsertContactAmlInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };

  const parsed = contactAmlSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const patch: Record<string, unknown> = {
    contact_id: input.contactId,
    office_id: ctx.officeId,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (input.kycStatus !== undefined) patch.kyc_status = input.kycStatus;
  if (input.risk !== undefined) patch.risk = input.risk;
  if (input.riskScore !== undefined) patch.risk_score = input.riskScore;
  if (input.pepStatus !== undefined) patch.pep_status = input.pepStatus;
  if (input.sanctionsResult !== undefined) {
    patch.sanctions_result = input.sanctionsResult;
    patch.sanctions_checked_at = new Date().toISOString();
  }
  if (input.uboVerified !== undefined) patch.ubo_verified = input.uboVerified;
  if (input.fundsSource !== undefined) patch.funds_source = input.fundsSource;
  if (input.paymentMethod !== undefined) patch.payment_method = input.paymentMethod;
  if (input.thirdPartyPayer !== undefined) patch.third_party_payer = input.thirdPartyPayer;
  if (input.thirdPartyNote !== undefined) patch.third_party_note = input.thirdPartyNote;
  if (input.redFlags !== undefined) patch.red_flags = input.redFlags;
  if (input.officerDecision !== undefined) patch.officer_decision = input.officerDecision;
  if (input.nextReviewAt !== undefined) patch.next_review_at = input.nextReviewAt?.slice(0, 10) ?? null;

  const { error } = await supabase
    .from("crm_contact_aml")
    .upsert(patch as unknown as Database["public"]["Tables"]["crm_contact_aml"]["Insert"], {
      onConflict: "contact_id",
    });
  if (error) {
    console.error("upsertContactAml:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths();
  revalidatePath(`/office/crm/contacts/${input.contactId}`);
  return { ok: true };
}

// ── Кейсийн урсгал (F-421) ────────────────────────────────

export async function setCaseStatus(
  caseId: string,
  to: string,
  decision?: string,
  rationale?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };
  if (!(AML_CASE_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: "Кейсийн төлөв буруу байна." };
  }
  if (to === "closed" && (!decision?.trim() || !rationale?.trim())) {
    return { ok: false, error: "Кейс хаахад шийдвэр + үндэслэл заавал (§7.6-5)." };
  }

  const patch: Record<string, unknown> = {
    status: to,
    officer_id: ctx.profileId,
  };
  if (decision !== undefined) patch.decision = decision?.trim() || null;
  if (rationale !== undefined) patch.decision_rationale = rationale?.trim() || null;
  if (to === "str_sent") patch.decision = decision?.trim() || "str";

  const { error } = await supabase
    .from("crm_aml_cases")
    .update(patch as unknown as Database["public"]["Tables"]["crm_aml_cases"]["Update"])
    .eq("id", caseId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setCaseStatus:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths(caseId);
  return { ok: true };
}

/** Д-26: СГТ илгээх шийдвэр — 24ц хуулийн тоолуур (DB trigger str_due_at тавина). */
export async function decideStr(caseId: string, rationale: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };
  if (!rationale.trim()) return { ok: false, error: "СГТ-ийн шийдвэрт үндэслэл заавал." };

  const { error } = await supabase
    .from("crm_aml_cases")
    .update({ decision: "str", decision_rationale: rationale.trim(), officer_id: ctx.profileId })
    .eq("id", caseId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("decideStr:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths(caseId);
  return { ok: true };
}

// ── Гейтийн шалгалтын бүртгэл (§7.3 — 12+2 талбарын снапшот) ──

const gateCheckSchema = z
  .object({
    caseId: z.uuid(),
    gate: z.enum(GATES),
    snapshot: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export type RecordGateCheckInput = z.infer<typeof gateCheckSchema>;

export async function recordGateCheck(raw: RecordGateCheckInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };

  const parsed = gateCheckSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Оролт буруу байна." };
  const input = parsed.data;

  const { data: kase } = await supabase
    .from("crm_aml_cases")
    .select("id, gate_checks")
    .eq("id", input.caseId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!kase) return { ok: false, error: "Кейс олдсонгүй эсвэл танд эрх алга." };

  const checks = ((kase.gate_checks ?? {}) as Record<string, Json>) || {};
  checks[input.gate] = {
    ...input.snapshot,
    checked_at: new Date().toISOString(),
    checked_by: ctx.profileId,
  } as Json;

  const { error } = await supabase
    .from("crm_aml_cases")
    .update({ gate_checks: checks as Json, officer_id: ctx.profileId })
    .eq("id", input.caseId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("recordGateCheck:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths(input.caseId);
  return { ok: true };
}

// ── Hold — 5 үйлдлийн түгжээ (§7.5) ───────────────────────

export async function placeHold(txnId: string, rationale: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };
  if (!rationale.trim()) return { ok: false, error: "Hold тавихад үндэслэл заавал (§7.5)." };

  const { data: active } = await supabase
    .from("crm_aml_holds")
    .select("id")
    .eq("transaction_id", txnId)
    .is("released_at", null)
    .limit(1);
  if (active?.length) return { ok: false, error: "Энэ хэлцэлд идэвхтэй hold аль хэдийн бий." };

  const { error } = await supabase.from("crm_aml_holds").insert({
    office_id: ctx.officeId,
    transaction_id: txnId,
    placed_by: user.id,
    rationale: rationale.trim(),
  });
  if (error) {
    console.error("placeHold:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths();
  revalidatePath(`/office/crm/transactions/${txnId}`);
  revalidatePath("/office/crm/pipeline");
  return { ok: true };
}

export async function releaseHold(
  holdId: string,
  rationale: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };
  if (!rationale.trim()) return { ok: false, error: "Hold суллахад үндэслэл заавал (§7.5)." };

  const { error, count } = await supabase
    .from("crm_aml_holds")
    .update(
      {
        released_by: user.id,
        released_at: new Date().toISOString(),
        release_rationale: rationale.trim(),
      },
      { count: "exact" }
    )
    .eq("id", holdId)
    .eq("office_id", ctx.officeId)
    .is("released_at", null);
  if (error) {
    console.error("releaseHold:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  if (!count) return { ok: false, error: "Hold олдсонгүй эсвэл аль хэдийн суллагдсан." };
  revalidateAmlPaths();
  revalidatePath("/office/crm/transactions");
  revalidatePath("/office/crm/pipeline");
  return { ok: true };
}

// ── Кейст officer оноох ───────────────────────────────────

export async function assignCaseOfficer(caseId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!ctx.roles.includes("aml_officer")) return { ok: false, error: OFFICER_ERR };
  const { error } = await supabase
    .from("crm_aml_cases")
    .update({ officer_id: ctx.profileId })
    .eq("id", caseId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("assignCaseOfficer:", error.message);
    return { ok: false, error: friendlyAmlError(error.message) };
  }
  revalidateAmlPaths(caseId);
  return { ok: true };
}

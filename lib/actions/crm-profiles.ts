"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import {
  validateNeedProfile,
  validateOwnerProfile,
  validateProfileStatus,
  type NeedProfileInput,
  type OwnerProfileInput,
  type ProfileStatusInput,
} from "@/lib/validation/crm";
import { needProfileCompleteness } from "@/lib/crm/scoring";
import { refreshLeadScoresForContact } from "@/lib/actions/crm-leads";
import type { ProfileStatus } from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * Хэрэгцээний ба өмчлөгчийн профайл (U2 — F-150–162, ToR 4.2).
 *  • Нэг харилцагчид олон профайл ЗЭРЭГ (F-150).
 *  • Материаллаг талбарын өөрчлөлт бүр audit_log-т (F-157).
 *  • Төлөвийн шилжилт 4.2.3-ын хүснэгтээр; Хангагдсанд хэлцэл, Алдагдсанд
 *    шалтгаан заавал (F-155/156) — validation + энд давхар.
 *  • Бүрэн байдлын % (F-159) хадгалагдаж Qualified гейтэд ашиглагдана.
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const MISSING_TABLE_ERR =
  "Профайлын хүснэгт бэлэн биш байна (000400 миграци хэрэглэгдээгүй). Админд хандана уу.";

function revalidateProfilePaths(contactId: string) {
  revalidatePath(`/office/crm/contacts/${contactId}`);
  revalidatePath(`/agent/crm/contacts/${contactId}`);
  revalidatePath("/office/crm/contacts");
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function isMissingTable(message: string): boolean {
  return message.includes("does not exist") || message.includes("schema cache");
}

/** Аудит — definer RPC; алдаа үндсэн үйлдлийг унагахгүй. */
async function writeAudit(
  officeId: string,
  entity: string,
  entityId: string,
  action: string,
  field: string,
  oldValue: unknown,
  newValue: unknown
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("crm_write_audit", {
      p_office: officeId,
      p_entity: entity,
      p_entity_id: entityId,
      p_action: action,
      p_field: field,
      p_old: oldValue != null ? (JSON.parse(JSON.stringify(oldValue)) as Json) : null,
      p_new: newValue != null ? (JSON.parse(JSON.stringify(newValue)) as Json) : null,
      p_reason: null,
    });
  } catch (e) {
    console.error("writeAudit:", e instanceof Error ? e.message : e);
  }
}

// ── Хэрэгцээний профайл (F-151/152/154) ───────────────────

function needCompleteness(input: NeedProfileInput): number {
  return needProfileCompleteness({
    goalId: input.goalId,
    locations: input.locations,
    propertyTypes: input.propertyTypes,
    budgetMax: input.budgetMax,
    budgetTarget: input.budgetTarget,
    financing: input.financing,
    roomsMin: input.roomsMin,
    areaMin: input.areaMin,
    timeline: input.timeline,
    moveInDate: input.moveInDate,
    profileType: input.profileType,
    mustHaves: input.mustHaves,
    niceToHaves: input.niceToHaves,
    dealBreakers: input.dealBreakers,
    decisionMaker: input.decisionMaker,
    blocker: input.blocker,
  });
}

export async function createNeedProfile(raw: NeedProfileInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = validateNeedProfile(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;

  const { data, error } = await supabase
    .from("crm_need_profiles")
    .insert({
      office_id: ctx.officeId,
      contact_id: input.contactId,
      profile_type: input.profileType,
      goal_id: input.goalId,
      locations: input.locations as unknown as Json,
      property_types: input.propertyTypes,
      budget_min: input.budgetMin,
      budget_target: input.budgetTarget,
      budget_max: input.budgetMax,
      financing: input.financing,
      rooms_min: input.roomsMin,
      area_min: input.areaMin,
      conditions: input.conditions,
      timeline: input.timeline,
      move_in_date: input.moveInDate ? input.moveInDate.slice(0, 10) : null,
      must_haves: input.mustHaves as unknown as Json,
      nice_to_haves: input.niceToHaves as unknown as Json,
      deal_breakers: input.dealBreakers as unknown as Json,
      decision_maker: input.decisionMaker,
      blocker: input.blocker,
      completeness_pct: needCompleteness(input),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createNeedProfile:", error?.message);
    return { error: isMissingTable(error?.message ?? "") ? MISSING_TABLE_ERR : SAVE_ERR };
  }

  // Профайл нэмэгдэхэд сэжимийн оноо шинэчлэгдэнэ (F-112).
  await refreshLeadScoresForContact(input.contactId);
  revalidateProfilePaths(input.contactId);
  return { id: data.id };
}

/** F-157: материаллаг талбар (төсөв, байршил, заавал шаардлага, таслах нөхцөл, хугацаа) түүхтэй. */
const NEED_MATERIAL_FIELDS = [
  ["budget_min", "budgetMin"],
  ["budget_target", "budgetTarget"],
  ["budget_max", "budgetMax"],
  ["locations", "locations"],
  ["must_haves", "mustHaves"],
  ["deal_breakers", "dealBreakers"],
  ["timeline", "timeline"],
] as const;

export async function updateNeedProfile(raw: NeedProfileInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateNeedProfile(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  if (!input.id) return { ok: false, error: "Профайлын дугаар алга." };

  const { data: old, error: oldErr } = await supabase
    .from("crm_need_profiles")
    .select("*")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (oldErr) {
    console.error("updateNeedProfile read:", oldErr.message);
    return { ok: false, error: isMissingTable(oldErr.message) ? MISSING_TABLE_ERR : SAVE_ERR };
  }
  if (!old) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  const { error, count } = await supabase
    .from("crm_need_profiles")
    .update(
      {
        profile_type: input.profileType,
        goal_id: input.goalId,
        locations: input.locations as unknown as Json,
        property_types: input.propertyTypes,
        budget_min: input.budgetMin,
        budget_target: input.budgetTarget,
        budget_max: input.budgetMax,
        financing: input.financing,
        rooms_min: input.roomsMin,
        area_min: input.areaMin,
        conditions: input.conditions,
        timeline: input.timeline,
        move_in_date: input.moveInDate ? input.moveInDate.slice(0, 10) : null,
        must_haves: input.mustHaves as unknown as Json,
        nice_to_haves: input.niceToHaves as unknown as Json,
        deal_breakers: input.dealBreakers as unknown as Json,
        decision_maker: input.decisionMaker,
        blocker: input.blocker,
        completeness_pct: needCompleteness(input),
      },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateNeedProfile:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  // F-157: өөрчлөгдсөн материаллаг талбар бүр audit_log-т (хэн/хэзээ/хуучин/шинэ).
  const oldRec = old as unknown as Record<string, unknown>;
  const inputRec = input as unknown as Record<string, unknown>;
  for (const [dbField, inputField] of NEED_MATERIAL_FIELDS) {
    const before = oldRec[dbField];
    const after = inputRec[inputField];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
      await writeAudit(ctx.officeId, "crm_need_profiles", input.id, "update", dbField, before, after);
    }
  }

  await refreshLeadScoresForContact(input.contactId);
  revalidateProfilePaths(input.contactId);
  return { ok: true };
}

// ── Өмчлөгчийн профайл (F-153) ────────────────────────────

export async function createOwnerProfile(raw: OwnerProfileInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const parsed = validateOwnerProfile(raw);
  if ("error" in parsed) return { error: parsed.error };
  const input = parsed.data;

  const { data, error } = await supabase
    .from("crm_owner_profiles")
    .insert({
      office_id: ctx.officeId,
      contact_id: input.contactId,
      property_id: input.propertyId,
      goal: input.goal,
      asking_price: input.askingPrice,
      terms: input.terms,
      urgency: input.urgency,
      urgency_note: input.urgencyNote,
      decision_authority: input.decisionAuthority,
      listing_state: input.listingState,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createOwnerProfile:", error?.message);
    return { error: isMissingTable(error?.message ?? "") ? MISSING_TABLE_ERR : SAVE_ERR };
  }
  revalidateProfilePaths(input.contactId);
  return { id: data.id };
}

export async function updateOwnerProfile(raw: OwnerProfileInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateOwnerProfile(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;
  if (!input.id) return { ok: false, error: "Профайлын дугаар алга." };

  const { data: old } = await supabase
    .from("crm_owner_profiles")
    .select("asking_price, goal, listing_state")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!old) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  const { error, count } = await supabase
    .from("crm_owner_profiles")
    .update(
      {
        property_id: input.propertyId,
        goal: input.goal,
        asking_price: input.askingPrice,
        terms: input.terms,
        urgency: input.urgency,
        urgency_note: input.urgencyNote,
        decision_authority: input.decisionAuthority,
        listing_state: input.listingState,
      },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("updateOwnerProfile:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  // F-157: хүсэж буй үнийн өөрчлөлт материаллаг — түүхэлнэ.
  if (Number(old.asking_price) !== input.askingPrice) {
    await writeAudit(
      ctx.officeId,
      "crm_owner_profiles",
      input.id,
      "update",
      "asking_price",
      old.asking_price,
      input.askingPrice
    );
  }
  revalidateProfilePaths(input.contactId);
  return { ok: true };
}

// ── Төлөвийн шилжилт (F-155/156, 4.2.3) ───────────────────

const PROFILE_TRANSITIONS: Record<ProfileStatus, ProfileStatus[]> = {
  active: ["paused", "fulfilled", "lost"],
  paused: ["active", "lost"],
  fulfilled: [], // Хангагдсан → Идэвхтэй: ШИНЭ профайл үүсгэнэ (4.2.3)
  lost: [],
};

async function setProfileStatus(
  table: "crm_need_profiles" | "crm_owner_profiles",
  raw: ProfileStatusInput
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const parsed = validateProfileStatus(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const input = parsed.data;

  const { data: old, error: oldErr } = await supabase
    .from(table)
    .select("id, contact_id, status")
    .eq("id", input.id)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (oldErr) {
    console.error("setProfileStatus read:", oldErr.message);
    return { ok: false, error: isMissingTable(oldErr.message) ? MISSING_TABLE_ERR : SAVE_ERR };
  }
  if (!old) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  const from = old.status as ProfileStatus;
  if (from === input.status) return { ok: true };
  if (!PROFILE_TRANSITIONS[from].includes(input.status)) {
    if (from === "fulfilled" && input.status === "active") {
      return {
        ok: false,
        error: "Хангагдсан профайл дахин идэвхжихгүй — шинэ хэрэгцээнд ШИНЭ профайл үүсгэнэ үү (4.2.3).",
      };
    }
    return { ok: false, error: "Энэ төлөвийн шилжилт зөвшөөрөгдөөгүй (F-155)." };
  }

  const { error, count } = await supabase
    .from(table)
    .update(
      {
        status: input.status,
        paused_until: input.status === "paused" ? input.pausedUntil?.slice(0, 10) : null,
        lost_reason_id: input.status === "lost" ? input.lostReasonId : null,
        fulfilled_txn_id: input.status === "fulfilled" ? input.fulfilledTxnId : null,
      },
      { count: "exact" }
    )
    .eq("id", input.id)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("setProfileStatus:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };

  await writeAudit(ctx.officeId, table, input.id, "status", "status", from, input.status);
  if (table === "crm_need_profiles") {
    await refreshLeadScoresForContact(old.contact_id);
  }
  revalidateProfilePaths(old.contact_id);
  return { ok: true };
}

export async function setNeedProfileStatus(raw: ProfileStatusInput): Promise<{ ok: boolean; error?: string }> {
  return setProfileStatus("crm_need_profiles", raw);
}

export async function setOwnerProfileStatus(raw: ProfileStatusInput): Promise<{ ok: boolean; error?: string }> {
  return setProfileStatus("crm_owner_profiles", raw);
}

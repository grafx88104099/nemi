"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { recomputeMatchesCore } from "@/lib/queries-crm-matching";
import { MATCH_RESPONSES, type MatchResponse } from "@/lib/constants-crm";
import type { Json } from "@/types/database";

/**
 * Тохируулгын бичилтүүд (U3 — F-250–261, P-04). Гол дүрмүүд:
 *  • Дахин тооцоолол — recomputeMatchesCore (admin client, оффисын хатуу хүрээтэй);
 *    их хэмжээний тооцоолол cron crm-matching-ийн pending дараалалд (F-259).
 *  • Deal breaker/сул тохироог гараар санал болгоход үндэслэл ЗААВАЛ (F-252/258).
 *  • Давхар санал болголтод өмнөх түүхийн анхааруулга (F-257).
 *  • Хариу 4 утгаар түүхчлэгдэнэ (F-256); Сонирхсон → үзлэгийн даалгавар (F-261/303).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Тохируулга олдсонгүй эсвэл танд эрх алга.";

function revalidateMatchPaths() {
  revalidatePath("/office/crm/properties");
  revalidatePath("/agent/crm/properties");
  revalidatePath("/office/crm/contacts");
  revalidatePath("/agent/crm/contacts");
}

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

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
        link ?? (p.role === "office_admin" || p.role === "admin" ? "/office/crm/leads" : "/agent/crm/leads"),
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch {
    // мэдэгдэл амжилтгүй ч үндсэн үйлдэл хэвээр
  }
}

async function logRuleRun(
  officeId: string,
  ruleCode: string,
  entity: string,
  entityId: string | null,
  status: "ok" | "error" | "skipped" | "dry_run" | "pending",
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

// ── Дахин тооцоолол (F-253/255) ──────────────────────────

/** Профайлын тохируулгыг шинэчилнэ — профайл руу хандах эрх RLS-ээр шалгагдана. */
export async function recomputeMatchesForProfile(
  profileId: string
): Promise<{ ok: boolean; error?: string; written?: number }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: profile } = await supabase
    .from("crm_need_profiles")
    .select("id, status")
    .eq("id", profileId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Профайл олдсонгүй эсвэл танд эрх алга." };
  if (profile.status !== "active") return { ok: false, error: "Зөвхөн идэвхтэй профайлд тохируулга тооцно (F-155)." };

  try {
    const admin = createAdminClient();
    const summary = await recomputeMatchesCore(admin, ctx.officeId, { profileId });
    await logRuleRun(ctx.officeId, "F-255", "crm_need_profiles", profileId, "ok", {
      written: summary.written,
      strong: summary.strongMatches.length,
    });
    revalidateMatchPaths();
    return { ok: true, written: summary.written };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("recomputeMatchesForProfile:", msg);
    await logRuleRun(ctx.officeId, "F-255", "crm_need_profiles", profileId, "error", undefined, msg);
    return { ok: false, error: "Тохируулга тооцоход алдаа гарлаа. Дахин оролдоно уу." };
  }
}

/** Объектын урвуу тохируулгыг шинэчилнэ (F-254). */
export async function recomputeMatchesForProperty(
  propertyId: string
): Promise<{ ok: boolean; error?: string; written?: number }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: property } = await supabase
    .from("crm_properties")
    .select("id, status")
    .eq("id", propertyId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!property) return { ok: false, error: "Объект олдсонгүй эсвэл танд эрх алга." };
  if (property.status !== "active") {
    return { ok: false, error: "Зөвхөн Идэвхтэй объектод урвуу тохируулга тооцно (F-254)." };
  }

  try {
    const admin = createAdminClient();
    const summary = await recomputeMatchesCore(admin, ctx.officeId, { propertyId }, "property_to_profile");
    await logRuleRun(ctx.officeId, "D-07", "crm_properties", propertyId, "ok", {
      written: summary.written,
      strong: summary.strongMatches.length,
    });
    revalidateMatchPaths();
    return { ok: true, written: summary.written };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("recomputeMatchesForProperty:", msg);
    await logRuleRun(ctx.officeId, "D-07", "crm_properties", propertyId, "error", undefined, msg);
    return { ok: false, error: "Тохируулга тооцоход алдаа гарлаа. Дахин оролдоно уу." };
  }
}

// ── Санал болгох (F-252/257/258) ─────────────────────────

export async function suggestMatch(
  matchId: string,
  options: { overrideReason?: string; confirmDuplicate?: boolean } = {}
): Promise<{ ok: boolean; error?: string; duplicateWarning?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;

  const { data: match } = await supabase
    .from("crm_matches")
    .select("id, need_profile_id, property_id, strength, deal_breaker_hit, deal_breaker_reasons, suggested_at")
    .eq("id", matchId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  if (!match) return { ok: false, error: NOT_FOUND_ERR };
  if (match.suggested_at) return { ok: false, error: "Энэ тохируулга аль хэдийн санал болгогдсон." };

  const needsOverride = match.deal_breaker_hit || match.strength === "weak";
  if (needsOverride && !options.overrideReason?.trim()) {
    return {
      ok: false,
      error: match.deal_breaker_hit
        ? `Таслах нөхцөл зөрчсөн (${(match.deal_breaker_reasons ?? []).join(", ") || "—"}) — гараар санал болгоход агентын үндэслэл заавал (F-252).`
        : "Сул тохироог зөвхөн агентын бичгэн тайлбартай санал болгоно (F-250).",
    };
  }

  // F-257: ижил хос өмнө нь санал болгогдсон бол анхааруулна.
  if (!options.confirmDuplicate) {
    const { data: prior } = await supabase
      .from("crm_matches")
      .select("id, suggested_at, response")
      .eq("need_profile_id", match.need_profile_id)
      .eq("property_id", match.property_id)
      .not("suggested_at", "is", null)
      .order("suggested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      const when = prior.suggested_at ? new Date(prior.suggested_at).toLocaleDateString("mn-MN") : "";
      return {
        ok: false,
        duplicateWarning: `Энэ объект ${when} өмнө нь санал болгогдож байсан (хариу: ${prior.response ?? "бүртгэгдээгүй"}). Дахин санал болгох уу?`,
      };
    }
  }

  const { error, count } = await supabase
    .from("crm_matches")
    .update(
      {
        suggested_at: new Date().toISOString(),
        suggested_by: ctx.profileId,
        manual_override_reason: needsOverride ? options.overrideReason!.trim() : null,
      },
      { count: "exact" }
    )
    .eq("id", matchId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("suggestMatch:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };

  try {
    await supabase.rpc("crm_write_audit", {
      p_office: ctx.officeId,
      p_entity: "crm_matches",
      p_entity_id: matchId,
      p_action: "suggest",
      p_field: null,
      p_old: null,
      p_new: { strength: match.strength, deal_breaker_hit: match.deal_breaker_hit } as Json,
      p_reason: options.overrideReason?.trim() ?? null,
    });
  } catch (e) {
    console.error("suggestMatch audit:", e instanceof Error ? e.message : e);
  }

  revalidateMatchPaths();
  return { ok: true };
}

// ── Хариу бүртгэх (F-256/260/261) ────────────────────────

export async function recordMatchResponse(
  matchId: string,
  response: MatchResponse,
  reason?: string
): Promise<{ ok: boolean; error?: string; profileUpdateHint?: boolean }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!MATCH_RESPONSES.includes(response)) return { ok: false, error: "Хариуны утга буруу байна." };
  if (response === "not_fit" && !reason?.trim()) {
    return { ok: false, error: "«Тохироогүй» хариуд шалтгаан заавал (F-256)." };
  }

  const { data: matchRaw } = await supabase
    .from("crm_matches")
    .select(
      "id, need_profile_id, property_id, suggested_at, response, " +
        "profile:crm_need_profiles!crm_matches_need_profile_id_fkey(contact_id, " +
        "contact:crm_contacts!crm_need_profiles_contact_id_fkey(display_name)), " +
        "property:crm_properties!crm_matches_property_id_fkey(name, number)"
    )
    .eq("id", matchId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  type MatchLite = {
    id: string;
    need_profile_id: string;
    property_id: string;
    suggested_at: string | null;
    response: MatchResponse | null;
    profile: { contact_id: string; contact: { display_name: string } | null } | null;
    property: { name: string; number: string } | null;
  };
  const match = (matchRaw ?? null) as unknown as MatchLite | null;
  if (!match) return { ok: false, error: NOT_FOUND_ERR };
  if (!match.suggested_at) return { ok: false, error: "Эхлээд санал болгосны дараа хариу бүртгэнэ (F-256)." };

  const { error, count } = await supabase
    .from("crm_matches")
    .update(
      {
        response,
        response_reason: reason?.trim() || null,
        responded_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", matchId)
    .eq("office_id", ctx.officeId);
  if (error) {
    console.error("recordMatchResponse:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  if (!count) return { ok: false, error: NOT_FOUND_ERR };

  const contactName = match.profile?.contact?.display_name ?? "Харилцагч";
  const propertyName = match.property ? `${match.property.name} (${match.property.number})` : "объект";

  // F-261/303: Сонирхсон → үзлэгийн даалгавар автомат; урсгалын Matched шат U4-ийн
  // stage guard-аар (боломж үүссэн үед) хэрэгжинэ.
  if (response === "interested") {
    try {
      const { data: task } = await supabase
        .from("tasks")
        .insert({
          office_id: ctx.officeId,
          created_by: ctx.profileId,
          responsible_id: ctx.profileId,
          title: `Үзлэг зохион байгуулах: ${contactName} — ${propertyName}`,
          description:
            "Тохируулгад «Сонирхсон» хариу бүртгэгдсэн — үзлэгийн цаг товлож, болсны дараа 24 цагийн дотор санал бүртгэнэ (Д-05).",
          priority: "high",
        })
        .select("id")
        .single();
      await logRuleRun(ctx.officeId, "F-256", "crm_matches", matchId, "ok", {
        response,
        task_id: task?.id ?? null,
      });
    } catch (e) {
      await logRuleRun(ctx.officeId, "F-256", "crm_matches", matchId, "error", undefined, e instanceof Error ? e.message : String(e));
    }
    await notify(
      [ctx.profileId],
      "crm_match_interested",
      "Сонирхсон хариу",
      `${contactName} «${propertyName}» объектыг сонирхож байна — үзлэгийн даалгавар үүслээ.`
    );
  } else {
    await logRuleRun(ctx.officeId, "F-256", "crm_matches", matchId, "ok", { response });
  }

  try {
    await supabase.rpc("crm_write_audit", {
      p_office: ctx.officeId,
      p_entity: "crm_matches",
      p_entity_id: matchId,
      p_action: "response",
      p_field: "response",
      p_old: null,
      p_new: response as unknown as Json,
      p_reason: reason?.trim() ?? null,
    });
  } catch (e) {
    console.error("recordMatchResponse audit:", e instanceof Error ? e.message : e);
  }

  revalidateMatchPaths();
  // F-260: тохироогүй шалтгаанаас профайл шинэчлэх санал.
  return { ok: true, profileUpdateHint: response === "not_fit" };
}

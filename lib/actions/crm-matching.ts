"use server";

import { fmtDateNum } from "@/lib/format";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { recomputeMatchesCore } from "@/lib/queries-crm-matching";
import { MATCH_RESPONSES, MATCH_RESPONSE_LABEL, type MatchResponse } from "@/lib/constants-crm";
import { buildMatchMessage } from "@/lib/crm/matching";
import type { Json } from "@/types/database";

/**
 * Тохируулгын бичилтүүд (§6.9, §6.10). Гол дүрмүүд:
 *  • Дахин тооцоолол — recomputeMatchesCore (admin client, оффисын хатуу хүрээтэй).
 *  • Хэлцэл таслах нөхцөл зөрчсөн / сул тохироог гараар санал болгоход
 *    агентын үндэслэл ЗААВАЛ (§6.9 дүгнэлт).
 *  • Давхар санал болголтод өмнөх түүхийн анхааруулга.
 *  • Хувь хүнд чиглэсэн зурвас (§6.10.5): загвар → агент өөрөө илгээнэ →
 *    илгээлт үйл ажиллагааны бүртгэлд (recordMatchMessage).
 *  • Хариу 4 утгаар (§6.10.7); «Сонирхсон» → үзлэгийн даалгавар;
 *    «Тохироогүй» → шалтгаан заавал, профайл шинэчлэх санал (§6.10.8).
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
  if (profile.status !== "active") return { ok: false, error: "Зөвхөн идэвхтэй хэрэгцээний профайлд тохируулга тооцно." };

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
  if (!property) return { ok: false, error: "Үл хөдлөх олдсонгүй эсвэл танд эрх алга." };
  if (property.status !== "active") {
    return { ok: false, error: "Зөвхөн «Идэвхтэй» төлөвтэй үл хөдлөхөд тохирох харилцагч хайна." };
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
        ? `Хэлцэл таслах нөхцөл зөрчсөн (${(match.deal_breaker_reasons ?? []).join(", ") || "—"}) — гараар санал болгоход агентын үндэслэл заавал.`
        : "65-аас доош оноотой тохироог зөвхөн агентын тайлбартайгаар санал болгоно.",
    };
  }

  // Ижил хос өмнө нь санал болгогдсон бол анхааруулна.
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
      const when = prior.suggested_at ? fmtDateNum(prior.suggested_at) : "";
      return {
        ok: false,
        duplicateWarning: `Энэ үл хөдлөхийг ${when}-нд санал болгож байсан (хариу: ${
          prior.response ? MATCH_RESPONSE_LABEL[prior.response as MatchResponse]?.label ?? "бүртгэгдээгүй" : "бүртгэгдээгүй"
        }). Дахин санал болгох уу?`,
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
    return { ok: false, error: "«Тохироогүй» хариуд шалтгаан заавал." };
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
  if (!match.suggested_at) return { ok: false, error: "Эхлээд санал болгосны дараа хариу бүртгэнэ." };

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
  const propertyName = match.property ? `${match.property.name} (${match.property.number})` : "үл хөдлөх";

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
            "Тохируулгад «Сонирхсон» хариу бүртгэгдсэн — үзлэгийн цаг товлож, үзлэгийн дараа 24 цагийн дотор харилцагчийн саналыг бүртгэнэ.",
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
      `${contactName} «${propertyName}»-ийг сонирхож байна — үзлэгийн даалгавар үүслээ.`
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
  // §6.10.8: тохироогүй шалтгаанаас профайл шинэчлэх санал.
  return { ok: true, profileUpdateHint: response === "not_fit" };
}

// ── Хувь хүнд чиглэсэн зурвас (§6.10.5) ──────────────────

export type MatchMessageDraft = {
  matchId: string;
  contactId: string | null;
  contactName: string | null;
  propertyName: string;
  text: string;
  /** Нээлттэй, идэвхтэй сэжимтэй бол дараагийн үйлдэл заавал. */
  needsNextStep: boolean;
};

/** Зурвасын загвар бэлтгэнэ — агент засаад өөрөө илгээнэ. */
export async function getMatchMessageDraft(
  matchId: string
): Promise<{ draft?: MatchMessageDraft; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const { data: raw } = await supabase
    .from("crm_matches")
    .select(
      "id, need_profile_id, " +
        "profile:crm_need_profiles!crm_matches_need_profile_id_fkey(contact_id, " +
        "contact:crm_contacts!crm_need_profiles_contact_id_fkey(display_name)), " +
        "property:crm_properties!crm_matches_property_id_fkey(name, number, service_kind, property_type, price, rent_price, rooms, area_m2, address, listing_id)"
    )
    .eq("id", matchId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  type Raw = {
    id: string;
    profile: { contact_id: string; contact: { display_name: string } | null } | null;
    property: {
      name: string;
      number: string;
      service_kind: string;
      property_type: string;
      price: number | null;
      rent_price: number | null;
      rooms: number | null;
      area_m2: number | null;
      address: { district?: string } | null;
      listing_id: string | null;
    } | null;
  };
  const m = (raw ?? null) as unknown as Raw | null;
  if (!m || !m.property) return { error: NOT_FOUND_ERR };

  const contactId = m.profile?.contact_id ?? null;
  let needsNextStep = false;
  if (contactId) {
    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, status")
      .eq("contact_id", contactId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    needsNextStep = !!lead;
  }
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", ctx.profileId).maybeSingle();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nemi.mn").replace(/\/$/, "");
  const p = m.property;
  return {
    draft: {
      matchId,
      contactId,
      contactName: m.profile?.contact?.display_name ?? null,
      propertyName: `${p.name} (${p.number})`,
      needsNextStep,
      text: buildMatchMessage({
        contactName: m.profile?.contact?.display_name ?? null,
        propertyName: p.name,
        serviceKind: p.service_kind,
        propertyType: p.property_type,
        price: p.price == null ? null : Number(p.price),
        rentPrice: p.rent_price == null ? null : Number(p.rent_price),
        rooms: p.rooms,
        areaM2: p.area_m2 == null ? null : Number(p.area_m2),
        district: p.address?.district ?? null,
        url: p.listing_id ? `${site}/listings/${p.listing_id}` : null,
        agentName: me?.full_name ?? null,
      }),
    },
  };
}

const MESSAGE_CHANNELS = ["chat", "email", "call"] as const;
export type MatchMessageChannel = (typeof MESSAGE_CHANNELS)[number];

/**
 * Илгээсэн зурвасыг бүртгэнэ: санал болгоогүй бол санал болгосон болгож,
 * үйл ажиллагааны бүртгэлд (суваг, агуулга, дараагийн үйлдэл) хадгална.
 * Нэг талын зурвас тул утга бүхий холболтод тооцогдохгүй (reached = false).
 */
export async function recordMatchMessage(
  matchId: string,
  input: { channel: MatchMessageChannel; text: string; nextStep?: string; nextStepDate?: string }
): Promise<{ ok: boolean; error?: string; duplicateWarning?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  if (!MESSAGE_CHANNELS.includes(input.channel)) return { ok: false, error: "Суваг буруу байна." };
  const text = input.text.trim();
  if (text.length < 10) return { ok: false, error: "Зурвасын агуулгыг бичнэ үү." };
  if (input.nextStepDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.nextStepDate)) {
    return { ok: false, error: "Огноо буруу байна." };
  }

  const { data: raw } = await supabase
    .from("crm_matches")
    .select(
      "id, property_id, suggested_at, strength, deal_breaker_hit, " +
        "profile:crm_need_profiles!crm_matches_need_profile_id_fkey(contact_id), " +
        "property:crm_properties!crm_matches_property_id_fkey(name, number)"
    )
    .eq("id", matchId)
    .eq("office_id", ctx.officeId)
    .maybeSingle();
  type Raw = {
    id: string;
    property_id: string;
    suggested_at: string | null;
    strength: string;
    deal_breaker_hit: boolean;
    profile: { contact_id: string } | null;
    property: { name: string; number: string } | null;
  };
  const m = (raw ?? null) as unknown as Raw | null;
  if (!m || !m.profile) return { ok: false, error: NOT_FOUND_ERR };

  if (!m.suggested_at) {
    if (m.deal_breaker_hit || m.strength === "weak") {
      return { ok: false, error: "Энэ тохироог эхлээд үндэслэлтэйгээр «Санал болгох» товчоор санал болгоно уу." };
    }
    const res = await suggestMatch(matchId, { confirmDuplicate: true });
    if (!res.ok) return res;
  }

  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, status")
    .eq("contact_id", m.profile.contact_id)
    .in("status", ["new", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lead?.status === "active" && (!input.nextStep?.trim() || !input.nextStepDate)) {
    return { ok: false, error: "Идэвхтэй сэжимд дараагийн үйлдэл, огноо заавал." };
  }

  const propertyLabel = m.property ? `${m.property.name} (${m.property.number})` : "үл хөдлөх";
  const { error } = await supabase.from("crm_activities").insert({
    office_id: ctx.officeId,
    contact_id: m.profile.contact_id,
    property_id: m.property_id,
    lead_id: lead?.id ?? null,
    channel: input.channel,
    purpose: "follow_up",
    summary: `Тохирох үл хөдлөх санал болгосон: ${propertyLabel}. ${text}`.slice(0, 2000),
    outcome: "open",
    next_step: input.nextStep?.trim() || null,
    next_step_date: input.nextStepDate || null,
    occurred_at: new Date().toISOString(),
    owner_id: ctx.profileId,
    reached: false,
  });
  if (error) {
    console.error("recordMatchMessage:", error.message);
    return { ok: false, error: SAVE_ERR };
  }
  await logRuleRun(ctx.officeId, "match_message", "crm_matches", matchId, "ok", { channel: input.channel });
  revalidateMatchPaths();
  return { ok: true };
}

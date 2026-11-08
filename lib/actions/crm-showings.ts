"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext, type CrmStaffContext } from "@/lib/queries-crm-core";
import { notifyCrm } from "@/lib/crm/notify";
import { showingFeedbackError, showingNeedsReason, type MatchStrength } from "@/lib/crm/deal-flow";
import {
  validateShowingSchedule,
  validateShowingFeedback,
  type ShowingScheduleInput,
  type ShowingFeedbackInput,
} from "@/lib/validation/crm-deals";
import { toIsoDate } from "@/lib/crm/calendar";

/**
 * Үзлэгийн бичилтүүд (§6.15): товлох (шалгаруулалт, тохирол — сул бол
 * үндэслэл), хийгдсэн (үйл ажиллагааны бүртгэл DB trigger-ээр), эргэх
 * холбоо (ангилал, сонирхол, сонирхсон бол дараагийн үйлдэл + огноо),
 * цуцлах / ирээгүй (шалтгаантай).
 */

const SAVE_ERR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
const AUTH_ERR = "Нэвтэрнэ үү.";
const NO_CRM_ERR = "Та CRM-д бүртгэгдээгүй байна.";
const NOT_FOUND_ERR = "Үзлэг олдсонгүй эсвэл танд эрх алга.";

// Төрлүүдийг @/lib/validation-аас шууд импортлоно: "use server" файл зөвхөн async функц экспортлох ёстой
// (төрлийн дахин экспорт server action ачаалагчид ReferenceError үүсгэдэг).

async function ctxOrError(): Promise<{ ctx: CrmStaffContext } | { error: string }> {
  const ctx = await getCrmStaffContext();
  if (!ctx) return { error: NO_CRM_ERR };
  return { ctx };
}

function revalidateShowing(opportunityId?: string | null, propertyId?: string | null) {
  revalidatePath("/agent/crm");
  revalidatePath("/office/crm");
  if (opportunityId) {
    revalidatePath(`/agent/crm/pipeline/${opportunityId}`);
    revalidatePath(`/office/crm/deals/${opportunityId}`);
  }
  if (propertyId) {
    revalidatePath(`/agent/crm/properties/${propertyId}`);
    revalidatePath(`/office/crm/properties/${propertyId}`);
  }
}

function friendlyShowingError(message: string): string {
  const idx = message.indexOf("CRM_SHOWING:");
  if (idx !== -1) return message.slice(idx + "CRM_SHOWING:".length).trim() || SAVE_ERR;
  if (message.includes("crm_showings_weak")) return "Сул тохиролтой үзлэгт үндэслэл заавал.";
  if (message.includes("crm_showings_cancel")) return "Цуцалсан шалтгааныг бичнэ үү.";
  if (message.includes("crm_showings_interested_next")) return "Сонирхсон бол дараагийн үйлдэл, огноо заавал.";
  if (message.includes("дараагийн")) return "Идэвхтэй сэжимтэй харилцагчид дараагийн үйлдэл заавал.";
  if (message.includes("row-level security") || message.includes("эрх")) return "Танд энэ үйлдлийг хийх эрх алга.";
  return SAVE_ERR;
}

/** Үзлэг товлох. Тохирлыг (crm_matches) серверт дахин уншиж хадгална. */
export async function scheduleShowing(raw: ShowingScheduleInput): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_ERR };
  const c = await ctxOrError();
  if ("error" in c) return { error: c.error };
  const { ctx } = c;

  const v = validateShowingSchedule(raw);
  if ("error" in v) return { error: v.error };
  const input = v.data;

  // Тохирлын оноо: харилцагчийн идэвхтэй хэрэгцээний профайл × үл хөдлөх.
  let strength: MatchStrength = "none";
  let score: number | null = null;
  const { data: nps } = await supabase
    .from("crm_need_profiles")
    .select("id")
    .eq("contact_id", input.contactId)
    .eq("status", "active");
  const profileIds = (nps ?? []).map((n) => n.id);
  if (profileIds.length) {
    const { data: m } = await supabase
      .from("crm_matches")
      .select("strength, score")
      .in("need_profile_id", profileIds)
      .eq("property_id", input.propertyId)
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (m) {
      strength = m.strength as MatchStrength;
      score = Number(m.score);
    }
  }
  if (showingNeedsReason(strength) && !input.weakMatchReason?.trim()) {
    return {
      error:
        strength === "none"
          ? "Энэ үл хөдлөх харилцагчийн профайлтай тохирлын тооцоогүй байна — үзүүлэх үндэслэлээ бичнэ үү."
          : "Тохирол сул байна — үзүүлэх үндэслэлээ бичнэ үү.",
    };
  }

  const { data: row, error } = await supabase
    .from("crm_showings")
    .insert({
      office_id: ctx.officeId,
      opportunity_id: input.opportunityId ?? null,
      contact_id: input.contactId,
      property_id: input.propertyId,
      agent_id: user.id,
      scheduled_at: new Date(input.scheduledAt).toISOString(),
      duration_min: input.durationMin ?? null,
      meeting_point: input.meetingPoint ?? null,
      participants: input.participants,
      match_strength: strength,
      match_score: score,
      weak_match_reason: input.weakMatchReason?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("scheduleShowing:", error?.message);
    return { error: friendlyShowingError(error?.message ?? "") };
  }

  if (input.opportunityId) {
    const day = toIsoDate(new Date(input.scheduledAt));
    await supabase
      .from("crm_opportunities")
      .update({ next_step: "Үзлэг хийх", next_step_date: day })
      .eq("id", input.opportunityId)
      .eq("state", "open");
  }
  revalidateShowing(input.opportunityId, input.propertyId);
  return { id: row.id };
}

/** Үзлэг хийгдсэн — үйл ажиллагааны бүртгэл DB trigger-ээр автоматаар. */
export async function completeShowing(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { data: s } = await supabase
    .from("crm_showings")
    .select("id, status, scheduled_at, opportunity_id, property_id")
    .eq("id", id)
    .maybeSingle();
  if (!s) return { ok: false, error: NOT_FOUND_ERR };
  if (s.status !== "scheduled") return { ok: false, error: "Зөвхөн товлогдсон үзлэгийг хийгдсэн болгоно." };
  if (Date.parse(s.scheduled_at) > Date.now() + 30 * 60000) {
    return { ok: false, error: "Товлосон цаг болоогүй байна." };
  }
  const { data, error } = await supabase
    .from("crm_showings")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id");
  if (error) {
    console.error("completeShowing:", error.message);
    return { ok: false, error: friendlyShowingError(error.message) };
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND_ERR };
  if (s.opportunity_id) {
    await supabase
      .from("crm_opportunities")
      .update({ next_step: "Үзлэгийн эргэх холбоо авах", next_step_date: toIsoDate(new Date()) })
      .eq("id", s.opportunity_id)
      .eq("state", "open");
  }
  revalidateShowing(s.opportunity_id, s.property_id);
  return { ok: true };
}

/** Цуцлах эсвэл харилцагч ирээгүй. */
export async function cancelShowing(
  id: string,
  status: "cancelled" | "no_show",
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  if (!reason?.trim()) return { ok: false, error: "Шалтгааныг бичнэ үү." };
  if (status !== "cancelled" && status !== "no_show") return { ok: false, error: "Төлөв буруу байна." };
  const { data, error } = await supabase
    .from("crm_showings")
    .update({ status, cancel_reason: reason.trim() })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id, opportunity_id, property_id");
  if (error) {
    console.error("cancelShowing:", error.message);
    return { ok: false, error: friendlyShowingError(error.message) };
  }
  const row = data?.[0];
  if (!row) return { ok: false, error: "Зөвхөн товлогдсон үзлэгийг цуцална." };
  revalidateShowing(row.opportunity_id, row.property_id);
  return { ok: true };
}

/** Эргэх холбоо (§6.15) — ангилал, сэтгэгдэл, сонирхол, дараагийн үйлдэл. */
export async function recordShowingFeedback(raw: ShowingFeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const c = await ctxOrError();
  if ("error" in c) return { ok: false, error: c.error };
  const { ctx } = c;
  const v = validateShowingFeedback(raw);
  if ("error" in v) return { ok: false, error: v.error };
  const input = v.data;
  const today = toIsoDate(new Date());
  const err = showingFeedbackError(
    {
      feedbackCategory: input.feedbackCategory,
      interest: input.interest,
      nextAction: input.nextAction ?? null,
      nextStepDate: input.nextStepDate ?? null,
    },
    today
  );
  if (err) return { ok: false, error: err };

  const { data: s } = await supabase
    .from("crm_showings")
    .select("id, status, opportunity_id, property_id, agent_id, contact_id")
    .eq("id", input.showingId)
    .maybeSingle();
  if (!s) return { ok: false, error: NOT_FOUND_ERR };
  if (s.status !== "done") return { ok: false, error: "Эхлээд үзлэгийг хийгдсэн гэж тэмдэглэнэ үү." };

  const { error } = await supabase
    .from("crm_showings")
    .update({
      feedback_category: input.feedbackCategory,
      feedback_note: input.feedbackNote,
      interest: input.interest,
      next_action: input.nextAction ?? null,
      next_step_date: input.nextStepDate ?? null,
    })
    .eq("id", input.showingId);
  if (error) {
    console.error("recordShowingFeedback:", error.message);
    return { ok: false, error: friendlyShowingError(error.message) };
  }

  // Боломжийн дараагийн үйлдэл: сонирхсон бол сонгосон алхам, үгүй бол профайл шинэчлэх.
  if (s.opportunity_id) {
    const nextLabel =
      input.interest === "interested"
        ? input.nextAction === "offer"
          ? "Үнийн санал бэлтгэх"
          : input.nextAction === "documents"
            ? "Баримт бичиг бүрдүүлэх"
            : "Давтан үзлэг товлох"
        : input.interest === "maybe"
          ? "Шийдвэрийг тодруулах"
          : "Хэрэгцээний профайлыг шинэчилж дахин тохируулах";
    if (input.nextStepDate) {
      await supabase
        .from("crm_opportunities")
        .update({ next_step: nextLabel, next_step_date: input.nextStepDate })
        .eq("id", s.opportunity_id)
        .eq("state", "open");
    }
  }

  // Листингийн агентад (өөр хүн бол) эргэх холбоог мэдэгдэнэ.
  const { data: roles } = await supabase
    .from("crm_property_roles")
    .select("agent_profile_id")
    .eq("property_id", s.property_id);
  const listingAgents = (roles ?? []).map((r) => r.agent_profile_id).filter((p) => p && p !== ctx.profileId);
  if (listingAgents.length) {
    await notifyCrm({
      officeId: ctx.officeId,
      event: "showing_feedback_due",
      recipients: listingAgents,
      title: "Үзлэгийн эргэх холбоо бүртгэгдлээ",
      body:
        input.interest === "interested"
          ? "Худалдан авагч сонирхсон — өмчлөгчид мэдэгдэнэ үү."
          : "Үзлэгийн эргэх холбоог өмчлөгчид дамжуулна уу.",
      link: `/agent/crm/properties/${s.property_id}`,
      entity: "crm_showings",
      entityId: s.id,
    });
  }

  revalidateShowing(s.opportunity_id, s.property_id);
  return { ok: true };
}

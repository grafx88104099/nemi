"use server";

import { getCrm2Context } from "@/lib/crm2/context";
import { crm2Session, revalidateCrm2, type Crm2Supabase } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  activityUpdateSchema,
  activityVoidSchema,
  showingOutcomeSchema,
  showingRecordSchema,
  showingRescheduleSchema,
  showingScheduleSchema,
  type ShowingOutcomeInput,
  type ShowingRecordInput,
  type ShowingScheduleInput,
} from "@/lib/crm2/schemas";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Үзүүлэлт ба дуудлагын мөр (T08). Товлосон цаг өнгөрөхөд автоматаар «үзүүлсэн»
 * болохгүй — агент бодит цаг + санал хүсэлтээ оруулна. Хэлцлийн шатыг DB-ийн
 * trigger (deal.auto_advance) урагшлуулна. Засах цонх, эцсийн үр дүнг солих эрхийг DB шалгана.
 */

type ActivityPatch = {
  showing_status?: "scheduled" | "shown" | "cancelled" | "no_show";
  occurred_at?: string | null;
  scheduled_at?: string;
  feedback?: string | null;
  result?: string | null;
  note?: string | null;
  agent_id?: string;
  voided_at?: string | null;
  void_reason?: string | null;
};

const PERFORMER_ERROR = "Өөр агентыг гүйцэтгэгчээр сонгох нь багийн ахлагч эсвэл менежерийн эрх.";

/**
 * Өөр хүнийг гүйцэтгэгчээр сонгох нь менежер (бүгд) эсвэл тухайн агентын ахлагчийн
 * эрх — crm2_open_deal, crm2_log_call-тай ижил дүрэм. Гүйцэтгэгч нь харилцагч, хэлцэл,
 * үзүүлэх зааврыг харах эрх авдаг тул клиентээс ирсэн agent_id-д шууд итгэхгүй.
 * DB-ийн guard эцэслэн шалгах ёстой (crm2-needs-sql.md, FX1). null = болно.
 */
async function performerError(supabase: Crm2Supabase, me: string, agentId: string | null | undefined): Promise<string | null> {
  if (!agentId || agentId === me) return null;
  const ctx = await getCrm2Context();
  if (ctx?.isManager) return null;
  if (ctx?.isTeamLead) {
    const { data, error } = await supabase.rpc("crm2_is_lead_of", { p_profile: agentId });
    if (error) console.error("crm2 performer lead check:", error.message);
    if (data === true) return null;
  }
  return PERFORMER_ERROR;
}

async function patchActivity(where: string, activityId: string, patch: ActivityPatch): Promise<Crm2Result<null>> {
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const denied = await performerError(session.supabase, session.userId, patch.agent_id);
  if (denied) return fail(denied);
  const { data, error } = await session.supabase.from("crm2_activities").update(patch).eq("id", activityId).select("id");
  if (error) return dbFail(where, error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/**
 * Үзүүлэх цаг товлох (төлөв «товлосон»). agent_id — гүйцэтгэх агент (анхдагч өөрөө;
 * өөр хүнийг зөвхөн менежер эсвэл тухайн агентын ахлагч сонгоно).
 */
export async function scheduleShowing(input: ShowingScheduleInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = showingScheduleSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const denied = await performerError(session.supabase, session.userId, v.agent_id);
  if (denied) return fail(denied);
  // office, хөрөнгө, харилцагчийг trigger хэлцлээс бөглөнө (зөрөхийг хориглоно).
  const { data, error } = await session.supabase
    .from("crm2_activities")
    .insert({
      deal_id: v.deal_id,
      kind: "showing",
      showing_status: "scheduled",
      scheduled_at: v.scheduled_at,
      agent_id: v.agent_id ?? session.userId,
      note: v.note ?? null,
      source_activity_id: v.source_activity_id ?? null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbFail("scheduleShowing", error);
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Товлолгүйгээр шууд «үзүүлсэн» бүртгэх (бодит цаг, санал хүсэлттэй). */
export async function recordShowing(input: ShowingRecordInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = showingRecordSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const denied = await performerError(session.supabase, session.userId, v.agent_id);
  if (denied) return fail(denied);
  const { data, error } = await session.supabase
    .from("crm2_activities")
    .insert({
      deal_id: v.deal_id,
      kind: "showing",
      showing_status: "shown",
      scheduled_at: v.scheduled_at ?? v.occurred_at,
      occurred_at: v.occurred_at,
      feedback: v.feedback ?? null,
      result: v.result ?? null,
      note: v.note ?? null,
      agent_id: v.agent_id ?? session.userId,
      source_activity_id: v.source_activity_id ?? null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbFail("recordShowing", error);
  revalidateCrm2();
  return ok({ id: data.id });
}

/**
 * Товлосон үзүүлэлтийн үр дүн: «үзүүлсэн» (бодит цаг + санал хүсэлт),
 * «цуцалсан», «ирээгүй». Эцсийн үр дүнг дахин «товлосон» болгохгүй.
 */
export async function setShowingOutcome(input: ShowingOutcomeInput): Promise<Crm2Result<null>> {
  const parsed = showingOutcomeSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const v = parsed.data;
  const patch: ActivityPatch = definedOnly({
    showing_status: v.outcome,
    occurred_at: v.outcome === "shown" ? v.occurred_at : undefined,
    feedback: v.feedback,
    result: v.result,
    note: v.note,
  });
  return patchActivity("setShowingOutcome", v.activity_id, patch);
}

/** «Үзүүлсэн» гэж тэмдэглэх (setShowingOutcome-ийн товчлол). */
export async function markShowingShown(input: {
  activity_id: string;
  occurred_at: string;
  feedback?: string | null;
  result?: string | null;
  note?: string | null;
}): Promise<Crm2Result<null>> {
  return setShowingOutcome({ ...input, outcome: "shown" });
}

export async function markShowingCancelled(activityId: string, result?: string | null): Promise<Crm2Result<null>> {
  return setShowingOutcome({ activity_id: activityId, outcome: "cancelled", result });
}

export async function markShowingNoShow(activityId: string, note?: string | null): Promise<Crm2Result<null>> {
  return setShowingOutcome({ activity_id: activityId, outcome: "no_show", note });
}

/** Товлосон үзүүлэлтийн цагийг (ба гүйцэтгэгчийг) өөрчлөх. */
export async function rescheduleShowing(input: {
  activity_id: string;
  scheduled_at: string;
  agent_id?: string | null;
}): Promise<Crm2Result<null>> {
  const parsed = showingRescheduleSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const patch: ActivityPatch = { scheduled_at: parsed.data.scheduled_at };
  if (parsed.data.agent_id) patch.agent_id = parsed.data.agent_id;
  return patchActivity("rescheduleShowing", parsed.data.activity_id, patch);
}

/** Тэмдэглэл, үр дүн, санал хүсэлт, бодит цаг, гүйцэтгэгч засах (72ц цонхыг DB шалгана). */
export async function updateActivity(input: {
  activity_id: string;
  note?: string | null;
  result?: string | null;
  feedback?: string | null;
  occurred_at?: string | null;
  agent_id?: string | null;
}): Promise<Crm2Result<null>> {
  const parsed = activityUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { activity_id, agent_id, ...rest } = parsed.data;
  const patch: ActivityPatch = definedOnly({ ...rest, agent_id: agent_id ?? undefined });
  if (Object.keys(patch).length === 0) return ok(null);
  return patchActivity("updateActivity", activity_id, patch);
}

/** Буруу бүртгэлийг хүчингүй болгох (устгахгүй; шалтгаан заавал). */
export async function voidActivity(activityId: string, reason: string): Promise<Crm2Result<null>> {
  const parsed = activityVoidSchema.safeParse({ activity_id: activityId, reason });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  return patchActivity("voidActivity", parsed.data.activity_id, {
    voided_at: new Date().toISOString(),
    void_reason: parsed.data.reason,
  });
}

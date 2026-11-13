"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, crmMessage, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  cancelDealSchema,
  dealStageSchema,
  dealUpdateSchema,
  logCallSchema,
  openDealSchema,
  transferDealSchema,
  transferWithCallSchema,
  type CancelDealInput,
  type LogCallInput,
  type OpenDealInput,
  type TransferWithCallInput,
} from "@/lib/crm2/schemas";
import type {
  Crm2ApplyOutcome,
  Crm2DealStage,
  Crm2LogCallResult,
  Crm2OpenDealResult,
  Crm2Result,
  Crm2TransferWithCallResult,
} from "@/lib/crm2/types";

/**
 * Хэлцэл = хөрөнгө × харилцагч (T07–T08). Үүсгэх/олох, дуудлага бүртгэх, шат,
 * цуцлах, шилжүүлэх — бүгд RPC (шат, хариуцагчийг шууд update-ээр өөрчлөхгүй).
 * Нэг хосод нэг л нээлттэй хэлцэл — давтан дуудлага шинэ хэлцэл үүсгэхгүй.
 */

/**
 * Нээлттэй хэлцлийг олох эсвэл шинээр нээх. accessible=false бол өөр агентынх —
 * UI шилжүүлэх хүсэлт санал болгоно.
 */
export async function openDeal(input: OpenDealInput): Promise<Crm2Result<Crm2OpenDealResult>> {
  const parsed = openDealSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const { data, error } = await session.supabase.rpc("crm2_open_deal", {
    p_property: v.property_id,
    p_contact: v.contact_id,
    p_requirement: v.requirement_id ?? null,
    p_agent: v.agent_id ?? null,
    p_origin_deal: v.origin_deal_id ?? null,
  });
  if (error) return dbFail("openDeal", error);
  const res = data as unknown as Crm2OpenDealResult;
  if (res?.created) revalidateCrm2();
  return ok(res);
}

/**
 * Хөрөнгийн картаас дуудлага бүртгэх (хэлцэл олох/нээх + дуудлага + сонголтоор
 * дараагийн ажил). Дуудлага ≠ үзүүлэлт: UI дараа нь үзүүлэлтийн маягт нээнэ.
 */
export async function logCall(input: LogCallInput): Promise<Crm2Result<Crm2LogCallResult>> {
  const parsed = logCallSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const { data, error } = await session.supabase.rpc("crm2_log_call", {
    p_property: v.property_id,
    p_contact: v.contact_id,
    p_occurred_at: v.occurred_at ?? null,
    p_note: v.note ?? null,
    p_result: v.result ?? null,
    p_next_action: v.next_action ?? null,
    p_next_action_due: v.next_action_due ?? null,
    p_next_action_note: v.next_action_note ?? null,
    p_requirement: v.requirement_id ?? null,
    p_agent: v.agent_id ?? null,
    p_origin_deal: v.origin_deal_id ?? null,
  });
  if (error) return dbFail("logCall", error);
  revalidateCrm2();
  return ok(data as unknown as Crm2LogCallResult);
}

/**
 * Өөр агентын харилцагч / энэ хөрөнгө дээрх өөр агентын хэлцэлтэй дуудлага (S04):
 * дуудлагыг шилжүүлэх хүсэлтэд хадгална — батлагдахад хүсэгчийн нэрээр, анхны цагаар
 * бүртгэгдэнэ (crm2_request_transfer_with_call, дизайн §5а). Хүсэгч өөрөө батлагч бол шууд.
 * DB «шууд бүртгэж болно» гэвэл (hint crm2_log_call) crm2_log_call-оор бүртгэнэ.
 * Түгжээ хүлээх хооронд нөхцөл өөрчлөгдвөл (hint crm2_retry) нэг удаа дахин илгээнэ.
 */
export async function requestTransferWithCall(input: TransferWithCallInput): Promise<Crm2Result<Crm2TransferWithCallResult>> {
  const parsed = transferWithCallSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const v = parsed.data;
  const call = {
    p_property: v.property_id,
    p_contact: v.contact_id,
    p_occurred_at: v.occurred_at ?? null,
    p_note: v.note ?? null,
    p_result: v.result ?? null,
    p_next_action: v.next_action ?? null,
    p_next_action_due: v.next_action ? (v.next_action_due ?? null) : null,
    p_next_action_note: v.next_action ? (v.next_action_note ?? null) : null,
    p_requirement: v.requirement_id ?? null,
  };
  const args = { ...call, p_reason: v.reason ?? null };
  let res = await session.supabase.rpc("crm2_request_transfer_with_call", args);
  // crm2_retry: түгжээ хүлээх хооронд төлөв өөрчлөгдсөн. RPC бүр тусдаа транзакц тул нэг удаа
  // дахин илгээх аюулгүй — RPC шинээр ангилж, шууд бүртгэж болох бол crm2_log_call hint буцаана.
  if (res.error?.hint === "crm2_retry") res = await session.supabase.rpc("crm2_request_transfer_with_call", args);
  const { data, error } = res;
  if (error) {
    if (error.hint === "crm2_log_call") {
      const logged = await session.supabase.rpc("crm2_log_call", { ...call, p_agent: null, p_origin_deal: null });
      if (logged.error) return dbFail("requestTransferWithCall/logCall", logged.error);
      revalidateCrm2();
      return ok({ status: "logged", log: logged.data as unknown as Crm2LogCallResult });
    }
    if (error.hint === "crm2_retry") {
      return ok({ status: "retry", message: crmMessage(error.message) ?? "Нөхцөл өөрчлөгдлөө — дахин оролдоно уу." });
    }
    // crm2_pending_conflict: DB-ийн текст «... багийн ахлагчдаа хандана уу».
    return dbFail("requestTransferWithCall", error);
  }
  revalidateCrm2();
  const r = (data ?? {}) as Record<string, unknown>;
  const kind = r.kind === "deal_transfer" ? "deal_transfer" : "contact_transfer";
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  if (r.status === "applied") {
    return ok({
      status: "applied",
      kind,
      requestId: str(r.request_id),
      skipped: typeof r.skipped === "number" ? r.skipped : 0,
      dealId: str(r.deal_id),
      activityId: str(r.activity_id),
      taskId: str(r.task_id),
      dealCreated: r.deal_created === true,
    });
  }
  return ok({
    status: "pending",
    kind,
    requestId: str(r.request_id),
    calls: typeof r.calls === "number" ? r.calls : 1,
    appended: r.appended === true,
    duplicate: r.duplicate === true,
  });
}

/**
 * Хэлцлийн шатыг гараар өөрчлөх. shown/reshow — бодит «үзүүлсэн» бүртгэлтэй,
 * showing_scheduled — товлосон үзүүлэлттэй үед л; cancelled — cancelDeal;
 * documents/awaiting_payment/closed энэ шатанд боломжгүй (DB шалгана).
 */
export async function setDealStage(dealId: string, stage: Crm2DealStage, note?: string | null): Promise<Crm2Result<null>> {
  const parsed = dealStageSchema.safeParse({ deal_id: dealId, stage, note });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_set_deal_stage", {
    p_deal: parsed.data.deal_id,
    p_stage: parsed.data.stage,
    p_note: parsed.data.note ?? null,
  });
  if (error) return dbFail("setDealStage", error);
  revalidateCrm2();
  return ok(null);
}

/**
 * Хэлцэл цуцлах — зөвхөн энэ хэлцэл (хөрөнгийн төлөв, бусад хэлцэл хэвээр).
 * Товлосон үзүүлэлт → цуцалсан, нээлттэй ажил → цуцалсан. reason_code нь
 * тохиргооны deal.cancel_reasons-ийн түлхүүр; «other» бол тайлбар заавал.
 */
export async function cancelDeal(input: CancelDealInput): Promise<Crm2Result<null>> {
  const parsed = cancelDealSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_cancel_deal", {
    p_deal: parsed.data.deal_id,
    p_reason_code: parsed.data.reason_code,
    p_reason: parsed.data.reason ?? null,
    p_requirement: parsed.data.requirement_id ?? null,
  });
  if (error) return dbFail("cancelDeal", error);
  revalidateCrm2();
  return ok(null);
}

/** Хэлцлийг өөр агентад: батлагч/хоёр агентын ахлагч → 'applied', бусад → 'pending'. */
export async function transferDeal(input: {
  deal_id: string;
  to_agent_id: string;
  reason: string;
}): Promise<Crm2Result<Crm2ApplyOutcome>> {
  const parsed = transferDealSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_transfer_deal", {
    p_deal: parsed.data.deal_id,
    p_to_agent: parsed.data.to_agent_id,
    p_reason: parsed.data.reason,
  });
  if (error) return dbFail("transferDeal", error);
  revalidateCrm2();
  return ok((data === "pending" ? "pending" : "applied") as Crm2ApplyOutcome);
}

/** Хэлцлийн тэмдэглэл, холбох шаардлага (шууд REST-ээр засах боломжтой хэсэг). */
export async function updateDeal(input: {
  deal_id: string;
  note?: string | null;
  requirement_id?: string | null;
}): Promise<Crm2Result<null>> {
  const parsed = dealUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { deal_id, ...fields } = parsed.data;
  const patch = definedOnly(fields);
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_deals").update(patch).eq("id", deal_id).select("id");
  if (error) return dbFail("updateDeal", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

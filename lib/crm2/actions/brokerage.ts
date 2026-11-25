"use server";

import type { z } from "zod";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { expirePublicListings } from "@/lib/listings-cache";
import { brokerageEndDateError } from "@/lib/crm2/checklist";
import { ubToday } from "@/lib/crm2/datetime";
import { AUTH_ERROR, dbErrorField, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  brokerageCreateSchema,
  brokerageInvalidateSchema,
  brokerageRegisterSchema,
  contractOptReasonSchema,
  contractReasonSchema,
  idSchema,
  type BrokerageCreateInput,
  type BrokerageRegisterInput,
} from "@/lib/crm2/schemas";
import type {
  Crm2BrokerageInvalidateResult,
  Crm2BrokerageRegisterResult,
  Crm2PropertyStatus,
  Crm2Result,
} from "@/lib/crm2/types";

/**
 * Зуучлалын гэрээ (20261125000100 — батлах алхамгүй):
 *   1) ноорог (createBrokerageDraft) — зөвхөн хөрөнгө ба дуусах огноо; дугаарыг DB B###-аар олгоно;
 *   2) PMC-ийн тамга, гарын үсэгтэй НЭГ PDF-ийг ноорогт хавсаргана (lib/crm2/storage.ts);
 *   3) «Гэрээ бүртгэх» (registerBrokerage → crm2_brokerage_register): ноорог → active, эхлэх = өнөөдөр.
 *      Хөрөнгийн мэдээлэл бүрэн бол хөрөнгө шууд идэвхжинэ; дутууг нөхмөгц DB өөрөө идэвхжүүлнэ.
 *      Батлагч ба агентын багийн ахлагчид мэдэгдэл (FYI) очно;
 *   4) буруу бол батлагч/ахлагч «Гэрээ буруу» (invalidateBrokerage) — гэрээ цуцлагдаж, хүчинтэй гэрээ
 *      үлдээгүй бол хөрөнгө ноорог руу буцна, агентад мэдэгдэнэ; агент шинэ ноорог үүсгэж дахин бүртгэнэ.
 * Цуцлах, хаях, сунгах нь өмнөх шигээ RPC. Бүртгэгдсэн гэрээг засахгүй (DB guard).
 * DB-ийн алдааг dbErrorField-ээр маягтын талбартай (field) буцаана.
 */

type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null } | null | undefined;

/** DB алдаа → {error, field} (маягт тухайн талбарыг фокуслана). */
function dbFieldFail<T = never>(where: string, error: DbErrorLike): Crm2Result<T> {
  console.error(`crm2 ${where}:`, error?.message ?? error);
  const { field, text } = dbErrorField(error);
  return { ok: false, error: text, field };
}

/** Zod алдаа → {error, field} (эхний алдааны замын эхний түлхүүр). */
function zodFieldFail<T = never>(err: z.ZodError): Crm2Result<T> {
  const key = err.issues[0]?.path[0];
  return { ok: false, error: zodErrorText(err), field: typeof key === "string" ? key : null };
}

/** Шинэ ноорог гэрээ (дугаарыг DB B###-аар олгоно; хариуцагч = гэрээ байгуулсан агент → листлэгч → өөрөө). */
export async function createBrokerageDraft(input: BrokerageCreateInput): Promise<Crm2Result<{ id: string; number: string }>> {
  const parsed = brokerageCreateSchema.safeParse(input);
  if (!parsed.success) return zodFieldFail(parsed.error);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { property_id, end_date } = parsed.data;
  const { data, error } = await session.supabase
    .from("crm2_brokerage_contracts")
    // Дугаар, эхлэх огноо, шимтгэл, нөхцөл, гарын үсэг зурагч илгээхгүй — DB тавина/хуучин багана.
    .insert({ property_id, ...definedOnly({ end_date: end_date ?? undefined }) })
    .select("id, number")
    .single();
  if (error || !data) return dbFieldFail("createBrokerageDraft", error);
  revalidateCrm2();
  return ok({ id: data.id, number: data.number });
}

/**
 * Гэрээ бүртгэх (зөвхөн ноорог): дуусах огноо (өнөөдрөөс 5 жилийн дотор) ба «PMC-ийн тамга, гарын
 * үсэгтэй» заавал. DB нэг PDF, эзэн г.м.-ийг шалгаж, дутуу бол «гэрээнд дутуу: …» буцаана (field-тэй).
 * Давхар дарвал DB already: true буцаана. stamp_confirmed-ийг UI-ийн checkbox-оос шууд (boolean) дамжуулна —
 * true биш бол field 'stamp_confirmed'-тэй алдаа.
 */
export async function registerBrokerage(
  input: Omit<BrokerageRegisterInput, "stamp_confirmed"> & { stamp_confirmed: boolean }
): Promise<Crm2Result<Crm2BrokerageRegisterResult>> {
  const parsed = brokerageRegisterSchema.safeParse(input);
  if (!parsed.success) return zodFieldFail(parsed.error);
  const endError = brokerageEndDateError(parsed.data.end_date, ubToday());
  if (endError) return { ok: false, error: endError, field: "end_date" };
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_register", {
    p_contract: parsed.data.contract_id,
    p_end_date: parsed.data.end_date,
    p_stamp_confirmed: parsed.data.stamp_confirmed,
  });
  if (error || !data) return dbFieldFail("registerBrokerage", error);
  revalidateCrm2();
  expirePublicListings(); // хөрөнгө идэвхжвэл нийтэлсэн зар (DB триггерээр) дахин нээгдэнэ
  return ok(data as unknown as Crm2BrokerageRegisterResult);
}

/**
 * «Гэрээ буруу» (батлагч эсвэл агентын багийн ахлагч; approvals.office_admin үед оффисын админ):
 * гэрээ цуцлагдаж «буруу» гэж тэмдэглэгдэнэ, хүчинтэй гэрээ үлдээгүй идэвхтэй/түр зогссон/гэрээ дууссан
 * хөрөнгө ноорог руу буцна (зар нийтлэлээс буцна), агентад мэдэгдэнэ. Шалтгаан заавал.
 */
export async function invalidateBrokerage(
  contractId: string,
  reason: string
): Promise<Crm2Result<{ propertyStatus: Crm2PropertyStatus }>> {
  const parsed = brokerageInvalidateSchema.safeParse({ contract_id: contractId, reason });
  if (!parsed.success) return zodFieldFail(parsed.error);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_invalidate", {
    p_contract: parsed.data.contract_id,
    p_reason: parsed.data.reason,
  });
  if (error || !data) return dbFieldFail("invalidateBrokerage", error);
  revalidateCrm2();
  expirePublicListings(); // хөрөнгө ноорог болбол нийтэлсэн зар (DB триггерээр) буцна
  return ok({ propertyStatus: (data as unknown as Crm2BrokerageInvalidateResult).property_status });
}

/**
 * Хүчинтэй гэрээг хугацаанаас өмнө цуцлах (батлагч), шалтгаан заавал.
 * Хариу: хөрөнгийн одоогийн төлөв (хүчинтэй гэрээ үлдээгүй бол «Гэрээ дууссан»).
 */
export async function terminateBrokerage(
  contractId: string,
  reason: string
): Promise<Crm2Result<{ propertyStatus: Crm2PropertyStatus }>> {
  const parsed = contractReasonSchema.safeParse({ contract_id: contractId, reason });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_terminate", {
    p_contract: parsed.data.contract_id,
    p_reason: parsed.data.reason,
  });
  if (error) return dbFieldFail("terminateBrokerage", error);
  revalidateCrm2();
  expirePublicListings(); // гэрээний төлөв нийтэлсэн зарыг (DB триггерээр) нээж/буцааж болно
  return ok({ propertyStatus: data as Crm2PropertyStatus });
}

/** Ноорог гэрээг хаях (түүхэнд «цуцлагдсан» болж үлдэнэ). */
export async function discardBrokerage(contractId: string, reason?: string | null): Promise<Crm2Result<null>> {
  const parsed = contractOptReasonSchema.safeParse({ contract_id: contractId, reason });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_brokerage_discard", {
    p_contract: parsed.data.contract_id,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return dbFieldFail("discardBrokerage", error);
  revalidateCrm2();
  return ok(null);
}

/**
 * Сунгалт: өмнөх гэрээтэй холбоотой шинэ ноорог хувилбар. Дуусах огноо, PMC тамгатай PDF-ээ шинээр
 * оруулж «Гэрээ бүртгэх»-ээр бүртгэнэ.
 */
export async function renewBrokerage(contractId: string): Promise<Crm2Result<{ id: string }>> {
  const id = idSchema.safeParse(contractId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_renew", { p_contract: id.data });
  if (error || !data) return dbFieldFail("renewBrokerage", error);
  revalidateCrm2();
  expirePublicListings(); // гэрээний төлөв нийтэлсэн зарыг (DB триггерээр) нээж/буцааж болно
  return ok({ id: data as string });
}

/**
 * Өмчлөлийн баримт / иргэний үнэмлэх (restricted) харах, хавсаргах эрх: хариуцагч, ноорог үүсгэгч,
 * батлагч, менежер. UI эрхгүй хүнд «Өмчлөлийн баримт нэмэх»-ийг харуулахгүй.
 */
export async function canViewRestrictedBrokerage(contractId: string): Promise<Crm2Result<boolean>> {
  const id = idSchema.safeParse(contractId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_can_view_restricted_brokerage", { p_contract: id.data });
  if (error) return dbFieldFail("canViewRestrictedBrokerage", error);
  return ok(!!data);
}

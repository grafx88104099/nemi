"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  brokerageApproveSchema,
  brokerageCreateSchema,
  brokerageUpdateSchema,
  contractOptReasonSchema,
  contractReasonSchema,
  idSchema,
  type BrokerageCreateInput,
  type BrokerageUpdateInput,
} from "@/lib/crm2/schemas";
import type { Crm2BrokerageApproveResult, Crm2PropertyStatus, Crm2Result } from "@/lib/crm2/types";
import type { Database } from "@/types/database";

type BrokeragePatch = Database["public"]["Tables"]["crm2_brokerage_contracts"]["Update"];

/**
 * Зуучлалын гэрээ (T05): ноорог үүсгэх/засах шууд REST (зөвхөн ноорог); урсгал
 * (илгээх → батлах/татгалзах, буцааж авах, цуцлах, хаях, сунгах) зөвхөн RPC.
 * Батлагдахад хөрөнгө ноорог бол DB өөрөө идэвхжүүлнэ.
 */

/** Шинэ ноорог гэрээ. Дугаар хоосон бол B### олгоно; хариуцагч анхдагч = гэрээ хийсэн агент. */
export async function createBrokerageDraft(input: BrokerageCreateInput): Promise<Crm2Result<{ id: string; number: string }>> {
  const parsed = brokerageCreateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { property_id, responsible_agent_id, ...fields } = parsed.data;
  const { data, error } = await session.supabase
    .from("crm2_brokerage_contracts")
    .insert({
      ...definedOnly(fields),
      property_id,
      number: fields.number ?? "",
      // Өгөөгүй бол DB (trigger): гэрээ хийсэн агент → листлэгч → өөрөө.
      ...(responsible_agent_id ? { responsible_agent_id } : {}),
    })
    .select("id, number")
    .single();
  if (error || !data) return dbFail("createBrokerageDraft", error);
  revalidateCrm2();
  return ok({ id: data.id, number: data.number });
}

/** Ноорог гэрээ засах (илгээсэн/батлагдсаныг DB хориглоно). */
export async function updateBrokerageDraft(input: BrokerageUpdateInput): Promise<Crm2Result<null>> {
  const parsed = brokerageUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { contract_id, number, responsible_agent_id, ...fields } = parsed.data;
  // Дугаар, хариуцагчийг хоосолж болохгүй (DB not null) — хоосон бол өөрчлөхгүй.
  const patch: BrokeragePatch = {
    ...definedOnly(fields),
    ...(number ? { number } : {}),
    ...(responsible_agent_id ? { responsible_agent_id } : {}),
  };
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_brokerage_contracts")
    .update(patch)
    .eq("id", contract_id)
    .select("id");
  if (error) return dbFail("updateBrokerageDraft", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

/** Батлуулахаар илгээх (draft → pending). Дутуу бол DB жагсааж буцаана. */
export async function submitBrokerage(contractId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(contractId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_brokerage_submit", { p_contract: id.data });
  if (error) return dbFail("submitBrokerage", error);
  revalidateCrm2();
  return ok(null);
}

/** Илгээснээ буцааж авах (pending → draft). */
export async function withdrawBrokerage(contractId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(contractId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_brokerage_withdraw", { p_contract: id.data });
  if (error) return dbFail("withdrawBrokerage", error);
  revalidateCrm2();
  return ok(null);
}

/**
 * Батлах (зөвхөн pending). expected_updated_at — батлагчийн харсан хувилбар
 * (хооронд нь өөрчлөгдсөн бол DB татгалзана).
 */
export async function approveBrokerage(input: {
  contract_id: string;
  note?: string | null;
  expected_updated_at?: string | null;
}): Promise<Crm2Result<Crm2BrokerageApproveResult>> {
  const parsed = brokerageApproveSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_approve", {
    p_contract: parsed.data.contract_id,
    p_note: parsed.data.note ?? null,
    p_expected_updated_at: parsed.data.expected_updated_at ?? null,
  });
  if (error) return dbFail("approveBrokerage", error);
  revalidateCrm2();
  return ok(data as unknown as Crm2BrokerageApproveResult);
}

/** Татгалзах (pending → draft), шалтгаан заавал. */
export async function rejectBrokerage(contractId: string, reason: string): Promise<Crm2Result<null>> {
  const parsed = contractReasonSchema.safeParse({ contract_id: contractId, reason });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_brokerage_reject", {
    p_contract: parsed.data.contract_id,
    p_note: parsed.data.reason,
  });
  if (error) return dbFail("rejectBrokerage", error);
  revalidateCrm2();
  return ok(null);
}

/**
 * Батлагдсан гэрээг хугацаанаас өмнө цуцлах (батлагч), шалтгаан заавал.
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
  if (error) return dbFail("terminateBrokerage", error);
  revalidateCrm2();
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
  if (error) return dbFail("discardBrokerage", error);
  revalidateCrm2();
  return ok(null);
}

/** Сунгалт: өмнөх гэрээтэй холбоотой шинэ ноорог хувилбар (файлыг шинээр хавсаргана). */
export async function renewBrokerage(contractId: string): Promise<Crm2Result<{ id: string }>> {
  const id = idSchema.safeParse(contractId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_brokerage_renew", { p_contract: id.data });
  if (error || !data) return dbFail("renewBrokerage", error);
  revalidateCrm2();
  return ok({ id: data as string });
}

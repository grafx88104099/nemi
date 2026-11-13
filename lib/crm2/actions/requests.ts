"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { decideRequestSchema, idSchema } from "@/lib/crm2/schemas";
import { parseRequestCalls, requestCallCounts } from "@/lib/crm2/approvals-view";
import type { Crm2RequestStatus, Crm2Result } from "@/lib/crm2/types";

/**
 * Агентын хүсэлт (хөрөнгийн төлөв, хэлцэл/харилцагч шилжүүлэх) — шийдвэр.
 * Эрх (батлагч, ахлагч, өөрийгөө батлах дүрэм) DB-д.
 */

/**
 * Батлах эсвэл татгалзах (татгалзахад тайлбар заавал). Хариу: төлөв (approved | rejected) ба
 * батлахад хадгалсан дуудлагаас алгассаны тоо (payload.calls[].recorded.skipped).
 */
export async function decideRequest(input: {
  request_id: string;
  approve: boolean;
  note?: string | null;
}): Promise<Crm2Result<{ status: Crm2RequestStatus; skipped: number }>> {
  const parsed = decideRequestSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_decide_request", {
    p_request: parsed.data.request_id,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? null,
  });
  if (error) return dbFail("decideRequest", error);
  revalidateCrm2();
  const status = data as Crm2RequestStatus;
  let skipped = 0;
  if (status === "approved") {
    // decided_by = би — RLS-ээр уншигдана. Алдаа гарвал тоог 0 гэж үзнэ (шийдвэр аль хэдийн хэрэгжсэн).
    const { data: row } = await session.supabase.from("crm2_requests").select("payload").eq("id", parsed.data.request_id).maybeSingle();
    skipped = countSkippedCalls(row?.payload);
  }
  return ok({ status, skipped });
}

function countSkippedCalls(payload: unknown): number {
  return requestCallCounts(parseRequestCalls(payload, new Map(), {})).skipped;
}

/** Өөрийн хүлээгдэж буй хүсэлтийг цуцлах. */
export async function cancelRequest(requestId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(requestId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_cancel_request", { p_request: id.data });
  if (error) return dbFail("cancelRequest", error);
  revalidateCrm2();
  return ok(null);
}

"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { getCrm2Settings } from "@/lib/crm2/context";
import { AUTH_ERROR, dbErrorField, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { duplicateFlagSchema, idSchema, resolveDuplicateSchema, type DuplicateFlagInput } from "@/lib/crm2/schemas";
import { listOpenDuplicateFlags as listOpenFlagsQuery, propertyDuplicates, type DuplicateFlagListItem } from "@/lib/crm2/queries/duplicates";
import { setPropertyStatus } from "@/lib/crm2/actions/properties";
import type { Crm2ApplyOutcome, Crm2PropertyDuplicate, Crm2Result } from "@/lib/crm2/types";

/**
 * Давхардал (P11): хадгалсны дараа шалгах, «Хандах эрх хүсэх» / «Тусдаа хөрөнгө» тэмдэглэх,
 * ахлагч/менежер шийдвэрлэх, агент өөрийн давхардсан ноорогийг архивлах. Хадгалалтыг ХЭЗЭЭ Ч хаахгүй.
 * Харах эрхгүй илэрцийг зөвхөн далд токеноор заана (сервер тайлна).
 */

/** Архивлах шалтгаан (түүх, батлах хүсэлтэд). */
const DUPLICATE_ARCHIVE_REASON = "Давхардал";

/** Хөрөнгийн давхардлыг дахин шалгах. property.duplicate_check унтраастай бол []. */
export async function checkPropertyDuplicates(propertyId: string): Promise<Crm2Result<Crm2PropertyDuplicate[]>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const settings = await getCrm2Settings();
  if (!settings["property.duplicate_check"]) return ok([]);
  const res = await propertyDuplicates(session.supabase, id.data);
  if (res.error) {
    console.error("crm2 checkPropertyDuplicates:", res.error.message);
    {
      const mapped = dbErrorField(res.error);
      return { ok: false, error: mapped.text, field: mapped.field };
    }
  }
  return ok(res.rows);
}

/**
 * Илэрцийг тэмдэглэх: 'access' — хандах эрх хүсэх, 'distinct' — тусдаа хөрөнгө (шалтгаан заавал).
 * Ахлагч/батлагчид мэдэгдэнэ. Буцаах: тэмдэглэлийн id.
 */
export async function flagDuplicate(input: {
  propertyId: string;
  token: string;
  kind: "distinct" | "access";
  note?: string | null;
}): Promise<Crm2Result<{ flagId: string }>> {
  const parsed = duplicateFlagSchema.safeParse({
    property_id: input.propertyId,
    token: input.token,
    kind: input.kind,
    note: input.note ?? null,
  } satisfies DuplicateFlagInput);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_flag_duplicate", {
    p_property: parsed.data.property_id,
    p_token: parsed.data.token,
    p_kind: parsed.data.kind,
    p_note: parsed.data.note ?? null,
  });
  if (error || !data) {
    console.error("crm2 flagDuplicate:", error?.message);
    {
      const mapped = dbErrorField(error);
      return { ok: false, error: mapped.text, field: mapped.field };
    }
  }
  revalidateCrm2();
  return ok({ flagId: data as string });
}

/** Ахлагч/менежер шийдвэрлэнэ: distinct (тусдаа) | duplicate (давхардсан) | dismissed (хаах). */
export async function resolveDuplicate(input: {
  flagId: string;
  status: "distinct" | "duplicate" | "dismissed";
  note?: string | null;
}): Promise<Crm2Result<null>> {
  const parsed = resolveDuplicateSchema.safeParse({ flag_id: input.flagId, status: input.status, note: input.note ?? null });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_resolve_duplicate", {
    p_flag: parsed.data.flag_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("crm2 resolveDuplicate:", error.message);
    {
      const mapped = dbErrorField(error);
      return { ok: false, error: mapped.text, field: mapped.field };
    }
  }
  revalidateCrm2();
  return ok(null);
}

/** Нээлттэй тэмдэглэлүүд (ахлагч, менежерийн дараалал). */
export async function listOpenDuplicateFlags(): Promise<Crm2Result<DuplicateFlagListItem[]>> {
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  return ok(await listOpenFlagsQuery());
}

/**
 * «Давхардал — миний ноорогийг архивлах». Агент шууд архивлах эрхгүй бол (agent_direct_statuses=[])
 * батлах хүсэлт үүснэ → 'pending' («Архивлах хүсэлт илгээгдлээ»).
 */
export async function archiveMyDuplicate(propertyId: string): Promise<Crm2Result<Crm2ApplyOutcome>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  return setPropertyStatus({ property_id: id.data, status: "archived", reason: DUPLICATE_ARCHIVE_REASON });
}

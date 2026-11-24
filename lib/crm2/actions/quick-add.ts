"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, dbErrorField, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { confirmFieldsSchema, idSchema, ownerSetSchema, type OwnerSetInput } from "@/lib/crm2/schemas";
import { expirePublicListings } from "@/lib/listings-cache";
import { projectHints, type ProjectHints } from "@/lib/crm2/queries/project-hints";
import type { Crm2OwnerResolveResult, Crm2OwnerStatus, Crm2Result, Json } from "@/lib/crm2/types";

/**
 * Шуурхай бүртгэлийн дараах картын үйлдэл (P6, P8). Шуурхай ҮҮСГЭХ нь зөвхөн
 * app/api/crm2/quick-create route (server action биш — давтан илгээлтэд action-ID зөрөхгүй).
 */

const OWNER_STATUSES: readonly Crm2OwnerStatus[] = [
  "none",
  "linked",
  "matched",
  "created",
  "needs_choice",
  "foreign",
  "no_access",
  "invalid_phone",
  "pending_review",
];

function toOwnerResult(raw: unknown): Crm2OwnerResolveResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Crm2OwnerResolveResult>;
  const status = OWNER_STATUSES.includes(r.status as Crm2OwnerStatus) ? (r.status as Crm2OwnerStatus) : "none";
  return { ...r, status };
}

/**
 * Хөрөнгийн эзнийг нэг алхмаар оноох (картын «Эзэн» цонх, owner_pending шийдвэрлэх).
 *  {contact_id} — сонгосон харилцагчийг холбоно; {phone, …} — утсаар хайж, харах эрхтэй давхцал бол
 *  'needs_choice' (ЧИМЭЭГҮЙ холбохгүй), шинэ бол үүсгэнэ; {clear: true} — хүлээгдэж буй эзнийг цэвэрлэнэ.
 * Эцсийн төлөвт (linked/created) DB owner_pending-ийг цэвэрлэнэ; эцсийн бус төлөвт утсыг хадгална.
 */
export async function setPropertyOwner(
  propertyId: string,
  owner: OwnerSetInput
): Promise<Crm2Result<Crm2OwnerResolveResult>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const parsed = ownerSetSchema.safeParse(owner);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_set_property_owner", {
    p_property: id.data,
    p_owner: parsed.data as Json,
  });
  if (error) {
    console.error("crm2 setPropertyOwner:", error.message);
    {
      const mapped = dbErrorField(error);
      return { ok: false, error: mapped.text, field: mapped.field };
    }
  }
  revalidateCrm2();
  return ok(toOwnerResult(data));
}

/**
 * Автоматаар бөглөгдсөн утгыг «Зөв» гэж баталгаажуулна (unconfirmed-аас хасна). Түүхэнд
 * crm2_properties_track 'unconfirmed' мөрөөр, «Баталгаажуулсан» шалтгаантай бичигдэнэ.
 * Буцаах: үлдсэн баталгаажаагүй түлхүүрүүд.
 */
export async function confirmPropertyFields(propertyId: string, keys: string[]): Promise<Crm2Result<{ unconfirmed: string[] }>> {
  const parsed = confirmFieldsSchema.safeParse({ property_id: propertyId, keys: [...new Set(keys)] });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_confirm_property_fields", {
    p_property: parsed.data.property_id,
    p_keys: parsed.data.keys,
  });
  if (error) {
    console.error("crm2 confirmPropertyFields:", error.message);
    {
      const mapped = dbErrorField(error);
      return { ok: false, error: mapped.text, field: mapped.field };
    }
  }
  revalidateCrm2();
  expirePublicListings(); // баталгаажуулалт нийтлэх саадыг арилгаж болно
  return ok({ unconfirmed: Array.isArray(data) ? data : [] });
}

/**
 * Төсөл сонгоход хоосон талбарт санал болгох дүүрэг, барилгын давхар, он (шар «шалгана уу»).
 * Санал байхгүй бол null.
 */
export async function getProjectHints(projectId: string): Promise<Crm2Result<ProjectHints | null>> {
  const id = idSchema.safeParse(projectId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  return ok(await projectHints(id.data));
}

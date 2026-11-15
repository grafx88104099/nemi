"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { AUTH_ERROR, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  listingPhotosSchema,
  listingTextSchema,
  publishPropertySchema,
  unpublishPropertySchema,
} from "@/lib/crm2/schemas";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Staff хөрөнгийг нийтийн зар болгох (§1.2). Эрх (crm2_can_edit_property),
 * нийтлэх нөхцөл ба НУУЦЛАЛ бүгд DB-ийн definer RPC дээр шийдэгдэнэ — энд зөвхөн
 * оролтыг эрт шалгаж, RPC-ийн «CRM: ...» алдааг монголоор дамжуулна.
 *
 * Зар нь хөрөнгөтэйгөө холбоотой үлдэнэ: үнэ, үзүүлэлт, төлөв trigger-ээр дагана;
 * агентынх зөвхөн гарчиг, зарлалын текст ба тамгатай зураг.
 * Тамга дарах нь браузерын canvas-аар хийгддэг тул зургийг клиент
 * (lib/crm2/publish-photos.ts) нийтийн bucket руу хуулаад setListingPhotos-оор өгнө.
 */

/** Зар болгох (эсвэл буцаасныг дахин нийтлэх). Гарчиг/текст хоосон бол DB анхдагчийг авна. */
export async function publishProperty(input: {
  property_id: string;
  title?: string;
  description?: string;
}): Promise<Crm2Result<{ listing_id: string; needs_photos: boolean }>> {
  const parsed = publishPropertySchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_publish_property", {
    p_property: parsed.data.property_id,
    p_title: parsed.data.title ?? null,
    p_description: parsed.data.description ?? null,
  });
  if (error) return dbFail("publishProperty", error);
  const res = (data ?? null) as unknown as { listing_id?: string | null; needs_photos?: boolean | null } | null;
  if (!res?.listing_id) return fail("Зар үүсгэж чадсангүй. Дахин оролдоно уу.");
  revalidateCrm2();
  return ok({ listing_id: res.listing_id, needs_photos: !!res.needs_photos });
}

/** Зарнаас буцаах: нийтэд харагдахгүй болно (холбоо хадгалагдана — дахин нийтэлж болно). */
export async function unpublishProperty(input: { property_id: string; reason?: string }): Promise<Crm2Result<null>> {
  const parsed = unpublishPropertySchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_unpublish_property", {
    p_property: parsed.data.property_id,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return dbFail("unpublishProperty", error);
  revalidateCrm2();
  return ok(null);
}

/** Зарын гарчиг, зарлалын текст (зөвхөн эдгээр нь агентын эзэмшил). */
export async function updateListingText(input: {
  property_id: string;
  title: string;
  description: string;
}): Promise<Crm2Result<null>> {
  const parsed = listingTextSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_update_listing_text", {
    p_property: parsed.data.property_id,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
  });
  if (error) return dbFail("updateListingText", error);
  revalidateCrm2();
  return ok(null);
}

/**
 * Зарын зургийг солих. URL бүр нийтийн `listings` bucket-ийнх байх ёстой —
 * тамгагүй (CRM-ийн хаалттай bucket) зураг нийтэд гарахаас DB-д бас сэргийлнэ.
 */
export async function setListingPhotos(input: { property_id: string; urls: string[] }): Promise<Crm2Result<null>> {
  const parsed = listingPhotosSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { error } = await session.supabase.rpc("crm2_set_listing_photos", {
    p_property: parsed.data.property_id,
    p_urls: parsed.data.urls,
  });
  if (error) return dbFail("setListingPhotos", error);
  revalidateCrm2();
  return ok(null);
}

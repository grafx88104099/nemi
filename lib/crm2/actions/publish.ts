"use server";

import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { expirePublicListings } from "@/lib/listings-cache";
import { AUTH_ERROR, dbErrorField, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import {
  idSchema,
  listingPhotosSchema,
  listingTextSchema,
  publishPropertySchema,
  unpublishPropertySchema,
} from "@/lib/crm2/schemas";
import type { Crm2PublishPreview, Crm2PublishResult, Crm2Result } from "@/lib/crm2/types";

type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null } | null | undefined;

/** DB алдаа → {error, field} (утасны дугаартай гарчиг/тайлбар → 'description'). */
function dbFieldFail<T = never>(where: string, error: DbErrorLike): Crm2Result<T> {
  console.error(`crm2 ${where}:`, error?.message ?? error);
  const { field, text } = dbErrorField(error);
  return { ok: false, error: text, field };
}

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

/**
 * Зар болгох (эсвэл буцаасныг дахин нийтлэх). Гарчиг/текст хоосон бол DB анхдагчийг авна.
 * link_listing — «Миний зараас үүсгэсэн» хөрөнгийг эх зартай нь холбох (getPublishPreview().link_mode
 * 'link_only' | 'choice'); replace_photos — холбоход зарын зургийг CRM-ийн тамгатай зургаар солих.
 * linked=true бөгөөд replace_photos биш бол зарын (аль хэдийн тамгатай) зураг хэвээр — зураг хуулахгүй.
 */
export async function publishProperty(input: {
  property_id: string;
  title?: string;
  description?: string;
  link_listing?: string | null;
  replace_photos?: boolean;
}): Promise<Crm2Result<Crm2PublishResult & { linked: boolean }>> {
  const parsed = publishPropertySchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_publish_property", {
    p_property: parsed.data.property_id,
    p_title: parsed.data.title ?? null,
    p_description: parsed.data.description ?? null,
    // Зөвхөн өгсөн үед дамжуулна (шинэ аргументгүй дуудлага хуучин 3 аргументтай функцтэй ч таарна).
    ...(parsed.data.link_listing ? { p_link_listing: parsed.data.link_listing } : {}),
    ...(parsed.data.replace_photos !== undefined ? { p_replace_photos: parsed.data.replace_photos } : {}),
  });
  if (error) return dbFieldFail("publishProperty", error);
  const res = (data ?? null) as unknown as { listing_id?: string | null; needs_photos?: boolean | null; linked?: boolean | null } | null;
  if (!res?.listing_id) return fail("Зар үүсгэж чадсангүй. Дахин оролдоно уу.");
  revalidateCrm2();
  expirePublicListings();
  return ok({ listing_id: res.listing_id, needs_photos: !!res.needs_photos, linked: !!res.linked });
}

/**
 * Нийтлэхээс өмнөх харагдац (crm2_publish_preview): зард очих талбар, анхдагч гарчиг/тайлбар,
 * эх зартай холбох горим (link_only | choice | new_only), сануулга, эх зарын (утас нуусан) талбар.
 * Засах эрхгүй бол null. Эзний мэдээлэл огт орохгүй.
 */
export async function getPublishPreview(propertyId: string): Promise<Crm2Result<Crm2PublishPreview | null>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_publish_preview", { p_property: id.data });
  if (error) return dbFieldFail("getPublishPreview", error);
  if (!data || typeof data !== "object") return ok(null);
  const raw = data as Record<string, unknown>;
  const mode = raw.link_mode;
  return ok({
    payload: (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Crm2PublishPreview["payload"],
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : null,
    link_mode: mode === "link_only" || mode === "choice" ? mode : "new_only",
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string") : [],
    link_candidate: (raw.link_candidate && typeof raw.link_candidate === "object"
      ? raw.link_candidate
      : null) as Crm2PublishPreview["link_candidate"],
  });
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
  expirePublicListings();
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
  if (error) return dbFieldFail("updateListingText", error);
  revalidateCrm2();
  expirePublicListings();
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
  expirePublicListings();
  return ok(null);
}

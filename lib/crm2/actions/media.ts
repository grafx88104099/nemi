"use server";

import { CRM2_DOCS_BUCKET, CRM2_MEDIA_BUCKET, crm2Session, revalidateCrm2, type Crm2Supabase } from "@/lib/crm2/server";
import { AUTH_ERROR, NOT_FOUND_ERROR, dbErrorField, dbFail, definedOnly, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { isPdfHeader } from "@/lib/crm2/files";
import {
  CONTRACT_PDF_ONLY_ERROR,
  brokerageFileRowSchema,
  idSchema,
  mediaReorderSchema,
  mediaRowSchema,
  mediaUpdateSchema,
  videoLinkSchema,
  type BrokerageFileRowInput,
  type MediaRowInput,
  type VideoLinkInput,
} from "@/lib/crm2/schemas";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Медиа ба гэрээний файлын МӨР. Файлыг эхлээд клиент Storage руу хуулна
 * (lib/crm2/storage.ts), дараа нь энд мөрөө оруулна — trigger storage.objects-оос
 * хэмжээ/төрлийг уншиж хязгаарыг шалгана. Устгахад мөр, дараа нь файл.
 * Гэрээний PDF (kind='contract') зөвхөн НООРОГ гэрээнд, нэг гэрээнд нэг; байтыг «%PDF-» толгойгоор шалгана.
 */

/** Хуулсан зураг/бичлэгийн мөр. is_cover бол өмнөх нүүр зургийг солино. */
export async function addPropertyMediaRow(input: MediaRowInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = mediaRowSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { supabase } = session;
  const { is_cover, ...row } = parsed.data;

  const { data, error } = await supabase
    .from("crm2_property_media")
    .insert({
      property_id: row.property_id,
      storage_path: row.storage_path,
      caption: row.caption ?? null,
      sort_order: row.sort_order ?? 0,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbFail("addPropertyMediaRow", error);
  if (is_cover) {
    const res = await setCover(supabase, row.property_id, data.id);
    if (!res.ok) return res;
  }
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Урт бичлэгийн https холбоос (файл хуулахгүй). */
export async function addPropertyVideoLink(input: VideoLinkInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = videoLinkSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_property_media")
    .insert({
      property_id: parsed.data.property_id,
      external_url: parsed.data.external_url,
      kind: "video",
      caption: parsed.data.caption ?? null,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return dbFail("addPropertyVideoLink", error);
  revalidateCrm2();
  return ok({ id: data.id });
}

/** Тайлбар, дараалал засах (файлыг солихгүй — шинээр нэмнэ). */
export async function updatePropertyMedia(input: {
  media_id: string;
  caption?: string | null;
  sort_order?: number | null;
}): Promise<Crm2Result<null>> {
  const parsed = mediaUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const { media_id, ...rest } = parsed.data;
  const patch = definedOnly({ caption: rest.caption, sort_order: rest.sort_order ?? undefined });
  if (Object.keys(patch).length === 0) return ok(null);
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.from("crm2_property_media").update(patch).eq("id", media_id).select("id");
  if (error) return dbFail("updatePropertyMedia", error);
  if (!data?.length) return fail(NOT_FOUND_ERROR);
  revalidateCrm2();
  return ok(null);
}

type Session = NonNullable<Awaited<ReturnType<typeof crm2Session>>>;

async function setCover(supabase: Session["supabase"], propertyId: string, mediaId: string): Promise<Crm2Result<null>> {
  // Нэг хөрөнгөд нэг л нүүр зураг (partial unique) — эхлээд хуучныг буулгана.
  const off = await supabase
    .from("crm2_property_media")
    .update({ is_cover: false })
    .eq("property_id", propertyId)
    .eq("is_cover", true)
    .neq("id", mediaId);
  if (off.error) return dbFail("setCover off", off.error);
  const { data, error } = await supabase
    .from("crm2_property_media")
    .update({ is_cover: true })
    .eq("id", mediaId)
    .eq("property_id", propertyId)
    .eq("kind", "image")
    .select("id");
  if (error) return dbFail("setCover", error);
  if (!data?.length) return fail("Нүүр зураг болгох зураг олдсонгүй.");
  return ok(null);
}

/** Нүүр зураг сонгох. */
export async function setPropertyCover(propertyId: string, mediaId: string): Promise<Crm2Result<null>> {
  const p = idSchema.safeParse(propertyId);
  const m = idSchema.safeParse(mediaId);
  if (!p.success || !m.success) return fail("Буруу холбоос (id).");
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const res = await setCover(session.supabase, p.data, m.data);
  if (res.ok) revalidateCrm2();
  return res;
}

/** Дарааллыг өгсөн id-уудын дарааллаар (0, 1, 2 …) хадгална. */
export async function reorderPropertyMedia(propertyId: string, mediaIds: string[]): Promise<Crm2Result<null>> {
  const parsed = mediaReorderSchema.safeParse({ property_id: propertyId, media_ids: mediaIds });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const results = await Promise.all(
    parsed.data.media_ids.map((id, i) =>
      session.supabase
        .from("crm2_property_media")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("property_id", parsed.data.property_id)
    )
  );
  const bad = results.find((r) => r.error);
  if (bad?.error) return dbFail("reorderPropertyMedia", bad.error);
  revalidateCrm2();
  return ok(null);
}

/** Медиа устгах: мөрийг устгаад Storage-ийн файлыг устгана (холбоос бол зөвхөн мөр). */
export async function deletePropertyMedia(mediaId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(mediaId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_property_media")
    .delete()
    .eq("id", id.data)
    .select("id, storage_path");
  if (error) return dbFail("deletePropertyMedia", error);
  const row = data?.[0];
  if (!row) return fail(NOT_FOUND_ERROR);
  if (row.storage_path) {
    const rm = await session.supabase.storage.from(CRM2_MEDIA_BUCKET).remove([row.storage_path]);
    if (rm.error) console.error("crm2 deletePropertyMedia storage:", rm.error.message);
  }
  revalidateCrm2();
  return ok(null);
}

// ── Зуучлалын гэрээний файл ────────────────────────────────────────────────

/**
 * Хуулсан гэрээний файлын мөр. Гэрээний PDF — зөвхөн ноорогт (засварлагч), нэг гэрээнд нэг; өмчлөлийн/бусад
 * баримтыг хавсаргах эрх crm2_can_attach_brokerage-аар.
 */
export async function addBrokerageFileRow(input: BrokerageFileRowInput): Promise<Crm2Result<{ id: string }>> {
  const parsed = brokerageFileRowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodErrorText(parsed.error), field: "file" };
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  if (parsed.data.kind === "contract") {
    // DB зөвхөн зарласан төрөл (application/pdf) ба .pdf өргөтгөлийг шалгана — байтыг энд шалгана.
    const head = await storageHead(session.supabase, parsed.data.storage_path);
    if (head === null) return fail("Гэрээний PDF-ийг шалгаж чадсангүй. Дахин оролдоно уу.");
    if (!isPdfHeader(head)) {
      const rm = await session.supabase.storage.from(CRM2_DOCS_BUCKET).remove([parsed.data.storage_path]);
      if (rm.error) console.error("crm2 addBrokerageFileRow remove:", rm.error.message);
      return { ok: false, error: CONTRACT_PDF_ONLY_ERROR, field: "file" };
    }
  }
  // office_id, property_id-г trigger гэрээнээс бөглөнө.
  const { data, error } = await session.supabase
    .from("crm2_brokerage_files")
    .insert({
      contract_id: parsed.data.contract_id,
      storage_path: parsed.data.storage_path,
      file_name: parsed.data.file_name ?? null,
      kind: parsed.data.kind,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    // «зөвхөн PDF», «нэг PDF», «PDF-ийг солихгүй» (files_guard) → field 'file' (upload-queue дахин оролдохгүй).
    console.error("crm2 addBrokerageFileRow:", error?.message ?? error);
    const { field, text } = dbErrorField(error);
    return { ok: false, error: text, field };
  }
  revalidateCrm2();
  return ok({ id: data.id });
}

/**
 * crm2-docs объектын эхний 5 байт (хэрэглэгчийн client-ээр 60 с signed URL + Range). Уншиж чадаагүй бол
 * null. Range-ийг үл тоовол (200) эхний хэсгийг уншаад урсгалыг зогсооно.
 */
async function storageHead(supabase: Crm2Supabase, path: string, n = 5): Promise<Uint8Array | null> {
  const signed = await supabase.storage.from(CRM2_DOCS_BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("crm2 storageHead sign:", signed.error?.message ?? "no url");
    return null;
  }
  try {
    const res = await fetch(signed.data.signedUrl, { headers: { Range: `bytes=0-${n - 1}` }, cache: "no-store" });
    if (!res.ok || !res.body) {
      console.error("crm2 storageHead fetch:", res.status);
      return null;
    }
    const reader = res.body.getReader();
    const out = new Uint8Array(n);
    let got = 0;
    try {
      while (got < n) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        const take = Math.min(n - got, value.length);
        out.set(value.subarray(0, take), got);
        got += take;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return out.subarray(0, got);
  } catch (e) {
    console.error("crm2 storageHead:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Гэрээний файл устгах (зөвхөн ноорог гэрээнд). */
export async function deleteBrokerageFile(fileId: string): Promise<Crm2Result<null>> {
  const id = idSchema.safeParse(fileId);
  if (!id.success) return fail(zodErrorText(id.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase
    .from("crm2_brokerage_files")
    .delete()
    .eq("id", id.data)
    .select("id, storage_path");
  if (error) return dbFail("deleteBrokerageFile", error);
  const row = data?.[0];
  if (!row) return fail("Файл олдсонгүй эсвэл устгах эрхгүй (бүртгэгдсэн гэрээний файлыг устгахгүй).");
  const rm = await session.supabase.storage.from(CRM2_DOCS_BUCKET).remove([row.storage_path]);
  if (rm.error) console.error("crm2 deleteBrokerageFile storage:", rm.error.message);
  revalidateCrm2();
  return ok(null);
}

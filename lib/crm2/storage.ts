"use client";

import { createClient } from "@/lib/supabase/client";
import { addBrokerageFileRow, addPropertyMediaRow } from "@/lib/crm2/actions/media";
import {
  CRM2_DOCS_BUCKET,
  CRM2_MEDIA_BUCKET,
  docPath,
  fileExt,
  fileMime,
  mediaPath,
  validateDocFile,
  validateMediaFile,
} from "@/lib/crm2/files";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Клиент талын хуулалт (хөтчийн client — storage policy, RLS хэрэгжинэ):
 * 1) төрөл/хэмжээг тохиргооны хязгаараар шалгана (HEIC татгалзана);
 * 2) Storage руу ЭХЛЭЭД хуулна (зам: office/property/uuid.ext эсвэл
 *    office/brokerage/contract/uuid.ext);
 * 3) server action-оор мөрөө оруулна (trigger storage.objects-оос хэмжээ/төрлийг шалгана);
 * 4) мөр оруулж чадахгүй бол хуулсан файлаа устгана.
 * Signed URL-ийг мөн хэрэглэгчийн өөрийн client-ээр.
 */

const UPLOAD_ERROR = "Файл хуулахад алдаа гарлаа. Дахин оролдоно уу.";

function uploadErrorText(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403")) {
    return "Энэ файлыг хуулах эрхгүй байна.";
  }
  if (m.includes("mime")) return "Энэ төрлийн файлыг хүлээж авахгүй.";
  if (m.includes("exceeded") || m.includes("too large") || m.includes("413")) return "Файл хэт том байна.";
  if (m.includes("already exists") || m.includes("duplicate")) return "Ийм нэртэй файл аль хэдийн байна. Дахин оролдоно уу.";
  return UPLOAD_ERROR;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export type MediaUploadOptions = {
  file: File;
  officeId: string;
  propertyId: string;
  limits: Pick<Crm2FileLimits, "maxImageMb" | "maxVideoMb" | "maxImages" | "maxVideos">;
  /** Одоо байгаа тоо (клиент талын урьдчилсан шалгалт; эцсийн шалгалт DB). */
  existing?: { images?: number; videos?: number };
  caption?: string | null;
  sortOrder?: number;
  isCover?: boolean;
};

/** Хөрөнгийн зураг/бичлэг хуулах → { id, storagePath }. */
export async function uploadPropertyMedia(opts: MediaUploadOptions): Promise<Crm2Result<{ id: string; storagePath: string }>> {
  const invalid = validateMediaFile(opts.file, opts.limits, opts.existing);
  if (invalid) return { ok: false, error: invalid };
  const supabase = createClient();
  const path = mediaPath(opts.officeId, opts.propertyId, newId(), fileExt(opts.file));
  const up = await supabase.storage.from(CRM2_MEDIA_BUCKET).upload(path, opts.file, {
    contentType: fileMime(opts.file),
    cacheControl: "3600",
    upsert: false,
  });
  if (up.error) {
    console.error("crm2 uploadPropertyMedia:", up.error.message);
    return { ok: false, error: uploadErrorText(up.error.message) };
  }
  const res = await addPropertyMediaRow({
    property_id: opts.propertyId,
    storage_path: path,
    caption: opts.caption ?? null,
    sort_order: opts.sortOrder ?? 0,
    is_cover: opts.isCover ?? false,
  });
  if (!res.ok) {
    await supabase.storage.from(CRM2_MEDIA_BUCKET).remove([path]);
    return res;
  }
  return { ok: true, data: { id: res.data.id, storagePath: path } };
}

export type DocUploadOptions = {
  file: File;
  officeId: string;
  contractId: string;
  limits: Pick<Crm2FileLimits, "maxDocMb" | "maxDocsPerContract">;
  existing?: number;
};

/**
 * Зуучлалын гэрээний скан/PDF хуулах → { id, storagePath }. Ноорогт засварлагч,
 * илгээсэн/батлагдсанд зөвхөн батлагч (storage policy).
 */
export async function uploadBrokerageFile(opts: DocUploadOptions): Promise<Crm2Result<{ id: string; storagePath: string }>> {
  const invalid = validateDocFile(opts.file, opts.limits, opts.existing);
  if (invalid) return { ok: false, error: invalid };
  const supabase = createClient();
  const path = docPath(opts.officeId, opts.contractId, newId(), fileExt(opts.file));
  const up = await supabase.storage.from(CRM2_DOCS_BUCKET).upload(path, opts.file, {
    contentType: fileMime(opts.file),
    cacheControl: "3600",
    upsert: false,
  });
  if (up.error) {
    console.error("crm2 uploadBrokerageFile:", up.error.message);
    return { ok: false, error: uploadErrorText(up.error.message) };
  }
  const res = await addBrokerageFileRow({
    contract_id: opts.contractId,
    storage_path: path,
    file_name: opts.file.name.slice(0, 200),
  });
  if (!res.ok) {
    // Илгээсэн гэрээнд батлагч устгах эрхгүй тул файл үлдэж болно (мөргүй файл харагдахгүй).
    await supabase.storage.from(CRM2_DOCS_BUCKET).remove([path]);
    return res;
  }
  return { ok: true, data: { id: res.data.id, storagePath: path } };
}

/** Олон файлыг дараалан хуулах (нэг нь алдаатай бол бусад нь үргэлжилнэ). */
export async function uploadMany<T>(
  files: File[],
  upload: (file: File, index: number) => Promise<Crm2Result<T>>,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: T[]; errors: string[] }> {
  const okList: T[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const res = await upload(files[i], i);
    if (res.ok) okList.push(res.data);
    else errors.push(res.error);
    onProgress?.(i + 1, files.length);
  }
  return { ok: okList, errors };
}

/** Signed URL (хэрэглэгчийн client; эрхгүй бол null). */
export async function getSignedUrl(
  bucket: typeof CRM2_MEDIA_BUCKET | typeof CRM2_DOCS_BUCKET,
  path: string,
  opts: { expiresIn?: number; download?: string | boolean } = {}
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, opts.expiresIn ?? 3600, opts.download ? { download: opts.download } : undefined);
  if (error) {
    console.error("crm2 getSignedUrl:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function getMediaSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  return getSignedUrl(CRM2_MEDIA_BUCKET, path, { expiresIn });
}

/** Гэрээний файл (download өгвөл татах нэртэй). */
export function getDocSignedUrl(path: string, opts: { expiresIn?: number; download?: string | boolean } = {}) {
  return getSignedUrl(CRM2_DOCS_BUCKET, path, opts);
}

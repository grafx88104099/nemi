"use server";

import { randomUUID } from "node:crypto";

import { CRM2_MEDIA_BUCKET, crm2Session, revalidateCrm2, type Crm2Supabase } from "@/lib/crm2/server";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { mediaPath } from "@/lib/crm2/files";
import { AUTH_ERROR, NO_ACCESS_ERROR, dbErrorField, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { importListingSchema } from "@/lib/crm2/schemas";
import {
  IMPORT_PHOTO_TIMEOUT_MS,
  listImportableListings as listImportableQuery,
  listingObjectPath,
  listingPublicObjectUrl,
  sniffImage,
  type ImportableListing,
} from "@/lib/crm2/queries/import";
import type { Crm2ImportListingResult, Crm2ImportPhoto, Crm2PropertyDuplicate, Crm2Result, Json } from "@/lib/crm2/types";

/**
 * «Миний зараас үүсгэх» (P12, R25). Зарыг ХУУЛЖ шинэ ноорог үүсгэнэ (listing_id холбохгүй — холболт зөвхөн
 * нийтлэх үед). Зураг: RPC-ийн буцаасан url-ийг манай нийтийн listings bucket-ийн хаяг эсэхийг ЯГ шалгаад
 * объектын замаас нийтийн URL-ийг СЕРВЕР талд дахин угсарч (хост = NEXT_PUBLIC_SUPABASE_URL, redirect-гүй)
 * татна — RPC-ийн/хэрэглэгчийн URL-ыг шууд fetch ХИЙХГҮЙ. (Storage download() нь SELECT бодлого шаарддаг,
 * 20261125000200-аас хэрэглэгч зөвхөн өөрийн файлыг жагсаана.) Хэмжээ, magic bytes, 15 с хугацаа
 * шалгаад хэрэглэгчийн session-оор crm2-media руу хуулж crm2_attach_imported_media-аар бүртгэнэ.
 * Бүртгэж чадаагүй бол хуулсан файлуудаа устгана.
 */

const MB = 1024 * 1024;
/** Нэг импортын нийт зургийн хугацааны төсөв (мс) — server action-ыг хэт удаан барихгүй. */
const IMPORT_TOTAL_BUDGET_MS = 60_000;
const MAX_IMPORT_PHOTOS = 30;

export type ImportListingOutcome = {
  propertyId: string | null;
  code: string | null;
  /** Өмнө нь импортолсон (зураг дутуу бол үргэлжлүүлсэн) эсвэл өөр хөрөнгөтэй холбогдсон. */
  existing: boolean;
  /** Засах боломжгүй/холбогдсон хуучин хөрөнгө — зураг хуулаагүй. */
  readOnly: boolean;
  photosCopied: number;
  photosFailed: number;
  duplicates: Crm2PropertyDuplicate[];
};

type CopiedPhoto = { storagePath: string; sourcePath: string; sort: number };

async function copyPhoto(
  supabase: Crm2Supabase,
  photo: Crm2ImportPhoto,
  sourcePath: string,
  target: { officeId: string; propertyId: string; maxBytes: number; supabaseUrl: string | undefined },
  deadline: number
): Promise<CopiedPhoto | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const url = listingPublicObjectUrl(target.supabaseUrl, sourcePath);
  if (!url) return null;
  const signal = AbortSignal.timeout(Math.min(IMPORT_PHOTO_TIMEOUT_MS, remaining));
  try {
    // Нийтийн bucket-ийн URL (RLS-гүй) — storage.objects-ийн SELECT бодлого (зөвхөн өөрийн файл,
    // 20261125000200) бусад агентын / backfill-ийн зургийг download()-оор татахыг хориглодог.
    const res = await fetch(url, { signal, redirect: "error", cache: "no-store" });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > target.maxBytes) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength <= 0 || bytes.byteLength > target.maxBytes) return null;
    const kind = sniffImage(bytes);
    if (!kind) return null;
    const storagePath = mediaPath(target.officeId, target.propertyId, randomUUID(), kind.ext);
    const up = await supabase.storage.from(CRM2_MEDIA_BUCKET).upload(storagePath, bytes, {
      contentType: kind.mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) {
      console.error("crm2 importListing upload:", up.error.message);
      return null;
    }
    return { storagePath, sourcePath, sort: photo.sort };
  } catch {
    // хугацаа хэтэрсэн / сүлжээ — энэ зургийг алгасна
    return null;
  }
}

/** Импортлох боломжтой миний зарууд (менежер — оффисын). */
export async function listImportableListings(): Promise<Crm2Result<ImportableListing[]>> {
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  return ok(await listImportableQuery());
}

/**
 * Зараас ноорог үүсгэх (давтан дуудахад ижил хөрөнгө — дутуу зургийг үргэлжлүүлнэ). clientKey — төхөөрөмжийн
 * ноорогийн түлхүүр (сонголттой).
 */
export async function importListing(listingId: string, clientKey?: string | null): Promise<Crm2Result<ImportListingOutcome>> {
  const parsed = importListingSchema.safeParse({ listing_id: listingId, client_key: clientKey ?? undefined });
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !ctx.canWork || !ctx.officeId) return fail(NO_ACCESS_ERROR);
  const { supabase } = session;

  const { data, error } = await supabase.rpc("crm2_create_property_from_listing", {
    p_listing: parsed.data.listing_id,
    p_client_key: parsed.data.client_key ?? null,
  });
  if (error) {
    console.error("crm2 importListing:", error.message);
    const mapped = dbErrorField(error);
    return { ok: false, error: mapped.text, field: mapped.field };
  }
  const res = (data ?? {}) as unknown as Crm2ImportListingResult;
  const duplicates = Array.isArray(res.duplicates) ? res.duplicates : [];
  const base: ImportListingOutcome = {
    propertyId: res.property_id ?? null,
    code: res.code ?? null,
    existing: !!res.existing,
    readOnly: !res.photos,
    photosCopied: 0,
    photosFailed: 0,
    duplicates,
  };
  if (!res.property_id || !Array.isArray(res.photos)) {
    if (res.property_id) revalidateCrm2();
    return ok(base);
  }
  const propertyId = res.property_id;

  // Аль хэдийн хавсаргасныг алгасна; хязгаараас хэтрүүлэхгүй (нэг багц бүтэлгүйтвэл бүгд устах тул).
  const attached = new Set(Array.isArray(res.attached) ? res.attached : []);
  const settings = await getCrm2Settings();
  const existingImages = await supabase
    .from("crm2_property_media")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("kind", "image");
  const room = Math.max(0, settings["media.max_images"] - (existingImages.count ?? 0));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const todo: { photo: Crm2ImportPhoto; sourcePath: string }[] = [];
  let failed = 0;
  for (const photo of res.photos) {
    if (attached.has(photo.url)) continue;
    const sourcePath = listingObjectPath(photo.url, supabaseUrl, photo.path);
    if (!sourcePath) {
      failed++;
      continue;
    }
    todo.push({ photo, sourcePath });
  }
  const batch = todo.slice(0, Math.min(room, MAX_IMPORT_PHOTOS));
  failed += todo.length - batch.length;

  const deadline = Date.now() + IMPORT_TOTAL_BUDGET_MS;
  const maxBytes = settings["media.max_image_mb"] * MB;
  const copied: CopiedPhoto[] = [];
  for (const item of batch) {
    const c = await copyPhoto(
      supabase,
      item.photo,
      item.sourcePath,
      { officeId: ctx.officeId, propertyId, maxBytes, supabaseUrl },
      deadline
    );
    if (c) copied.push(c);
    else failed++;
  }

  let photosCopied = 0;
  if (copied.length) {
    const items = copied.map((c) => ({ storage_path: c.storagePath, source_path: c.sourcePath, sort_order: c.sort }));
    const att = await supabase.rpc("crm2_attach_imported_media", { p_property: propertyId, p_items: items as Json });
    const media = CRM2_MEDIA_BUCKET;
    if (att.error) {
      console.error("crm2 importListing attach:", att.error.message);
      const rm = await supabase.storage.from(media).remove(copied.map((c) => c.storagePath));
      if (rm.error) console.error("crm2 importListing cleanup:", rm.error.message);
      failed += copied.length;
    } else {
      photosCopied = Number(att.data ?? 0);
      if (photosCopied < copied.length) {
        // Зэрэг импорт г.м.-ээр алгассан зүйлийн файлыг устгана (бүртгэгдсэн замыг үлдээнэ).
        const paths = copied.map((c) => c.storagePath);
        const kept = await supabase.from("crm2_property_media").select("storage_path").eq("property_id", propertyId).in("storage_path", paths);
        const keep = new Set((kept.data ?? []).map((m) => m.storage_path));
        const orphan = kept.error ? [] : paths.filter((p) => !keep.has(p));
        if (orphan.length) {
          const rm = await supabase.storage.from(media).remove(orphan);
          if (rm.error) console.error("crm2 importListing orphan cleanup:", rm.error.message);
        }
      }
    }
  }

  revalidateCrm2();
  return ok({ ...base, readOnly: false, photosCopied, photosFailed: failed });
}

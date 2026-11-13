import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { CRM2_DOCS_BUCKET, CRM2_MEDIA_BUCKET } from "@/lib/crm2/files";
import { CRM2_BASES } from "@/lib/crm2/paths";

/**
 * CRM v2 серверийн дотоод хэрэгсэл (queries/*, actions/*). Үргэлж хэрэглэгчийн
 * өөрийн client — RLS ба definer RPC-ийн эрхийн шалгалт хэрэгжинэ. admin.ts-ийг
 * crm2 өгөгдөлд ХЭЗЭЭ Ч ашиглахгүй. Зөвхөн серверээс импортлоно.
 */

export type Crm2Supabase = Awaited<ReturnType<typeof createClient>>;

export async function crm2Client(): Promise<Crm2Supabase> {
  return createClient();
}

/** Нэвтэрсэн хэрэглэгч ба client; нэвтрээгүй бол null. */
export async function crm2Session(): Promise<{ supabase: Crm2Supabase; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/**
 * Хоёр панелийн CRM-ийн бүх хуудсыг шинэчилнэ (/agent/crm/**, /office/crm/**).
 * CRM-ийн хуудсууд динамик (cookie) тул энэ нь голчлон router-ийн кэшийг цэвэрлэнэ.
 */
export function revalidateCrm2(): void {
  for (const base of CRM2_BASES) revalidatePath(base, "layout");
}

export { CRM2_DOCS_BUCKET, CRM2_MEDIA_BUCKET };
/** Signed URL-ийн хугацаа (сек). */
export const SIGNED_URL_TTL = 60 * 60;

/**
 * Storage замуудын signed URL (хэрэглэгчийн client — storage policy шалгана;
 * эрхгүй файлд URL гарахгүй). path → url.
 */
export async function signedUrlMap(
  supabase: Crm2Supabase,
  bucket: typeof CRM2_MEDIA_BUCKET | typeof CRM2_DOCS_BUCKET,
  paths: (string | null | undefined)[],
  ttl = SIGNED_URL_TTL
): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (list.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(list, ttl);
  if (error) {
    console.error(`crm2 signed urls (${bucket}):`, error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
  }
  return out;
}

/** ilike-ийн тусгай тэмдэгтийг (\ % _) escape хийнэ. */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** PostgREST 416 (PGRST103): ?page= нь нийт мөрөөс хэтэрсэн (count=exact үед). */
export function isRangeError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST103";
}

/** Хуудаслалт: 1-ээс эхэлсэн хуудас, хэмжээ → [from, to]. */
export function pageRange(page: number | undefined, pageSize: number): { page: number; from: number; to: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const from = (p - 1) * pageSize;
  return { page: p, from, to: from + pageSize - 1 };
}

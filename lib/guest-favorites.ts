/**
 * Нэвтрээгүй хэрэглэгчийн хадгалсан зар — энэ хөтчийн localStorage.
 * Цэвэр, SSR-д аюулгүй модуль (React-гүй). window/localStorage-ийг try/catch-аар
 * хамгаална (Safari private mode, quota, SecurityError).
 *
 * sanitizeListingIds нь server action (mergeGuestFavorites/removeFavorites)-ийн
 * оролтыг ч шүүнэ — клиентээс ирсэн утгад итгэхгүй.
 */
import { UUID_RE } from "@/lib/seo/site";

export { UUID_RE };

export const GUEST_FAVS_KEY = "nemi:guest-favorites:v1";
export const GUEST_FAVS_MAX = 100;

/** Массив биш → []; зөвхөн UUID мөр, жижиг үсгээр, дарааллаа хадгалж давхардалгүй, max хүртэл. */
export function sanitizeListingIds(input: unknown, max = GUEST_FAVS_MAX): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (out.length >= max) break;
    if (typeof v !== "string" || !UUID_RE.test(v)) continue;
    const id = v.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** localStorage-ийн түүхий утга → id-ууд. Эвдэрсэн/өөр хэлбэр → []. */
export function parseGuestFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return sanitizeListingIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Байвал хасна, үгүй бол эхэнд нэмнэ (шинэ нь эхэндээ), дээд хязгаар хадгална. */
export function toggleGuestFavorite(ids: readonly string[], id: string): { ids: string[]; saved: boolean } {
  const key = id.toLowerCase();
  if (ids.includes(key)) return { ids: ids.filter((x) => x !== key), saved: false };
  return { ids: [key, ...ids].slice(0, GUEST_FAVS_MAX), saved: true };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestFavorites(): string[] {
  try {
    return parseGuestFavorites(storage()?.getItem(GUEST_FAVS_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeGuestFavorites(ids: readonly string[]): void {
  try {
    const s = storage();
    if (!s) return;
    const clean = sanitizeListingIds([...ids]);
    if (clean.length) s.setItem(GUEST_FAVS_KEY, JSON.stringify(clean));
    else s.removeItem(GUEST_FAVS_KEY);
  } catch {
    // quota / private mode — дуугүй алгасна (санах ойн төлөв хэвээр).
  }
}

export function clearGuestFavorites(): void {
  try {
    storage()?.removeItem(GUEST_FAVS_KEY);
  } catch {
    // ignore
  }
}

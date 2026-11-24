/**
 * «Миний дутуу хөрөнгө» (P10) ба ширээний гүйцэтгэлийн хүснэгтийн цэвэр дүрэм (тестлэнэ):
 * харагдацын сонголт, хувийн өнгө, мөрийн доорх холбоос, мөр доторх засварын задлалт,
 * чирж оруулсан файлын шүүлт. Эзний утас, нэр энд огт байхгүй.
 */

import { parsePriceInput } from "@/lib/crm2/field-validation";

export type IncompleteScope = "me" | "team" | "office";

export const SCOPE_LABEL: Record<IncompleteScope, string> = { me: "Би", team: "Баг", office: "Оффис" };

type ScopeCtx = { isTeamLead: boolean; isManager: boolean };

/** Хэрэглэгчид нээлттэй харагдацууд (агент — зөвхөн «Би»). */
export function scopeOptions(ctx: ScopeCtx): IncompleteScope[] {
  const out: IncompleteScope[] = ["me"];
  if (ctx.isTeamLead || ctx.isManager) out.push("team");
  if (ctx.isManager) out.push("office");
  return out;
}

/** ?scope=… → зөвшөөрөгдсөн харагдац (эрхгүй бол «Би»). */
export function parseScope(v: string | string[] | undefined | null, ctx: ScopeCtx): IncompleteScope {
  const s = Array.isArray(v) ? v[0] : v;
  const allowed = scopeOptions(ctx);
  return allowed.includes(s as IncompleteScope) ? (s as IncompleteScope) : "me";
}

export type PercentTone = "low" | "mid" | "high";

export function percentTone(percent: number): PercentTone {
  if (percent < 40) return "low";
  if (percent < 80) return "mid";
  return "high";
}

export const PERCENT_TONE_CLASS: Record<PercentTone, { bar: string; text: string }> = {
  low: { bar: "bg-rose-500", text: "text-rose-700" },
  mid: { bar: "bg-amber-500", text: "text-amber-700" },
  high: { bar: "bg-emerald-500", text: "text-emerald-700" },
};

/** 0–100 болгож тойруулна. */
export function clampPercent(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

// ── Мөр доторх засвар (ширээ) ────────────────────────────────────────────

export type CellParse<T> = { ok: true; value: T } | { ok: false; error: string };

function normNumber(text: string): string {
  return text.replace(/\s+/g, "").replace(",", ".");
}

/** Талбай (м²): хоосон → null (арилгах), эерэг тоо. */
export function parseAreaCell(text: string): CellParse<number | null> {
  const t = normNumber(text);
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n >= 10_000_000) return { ok: false, error: "Талбай эерэг тоо байна" };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Өрөөний тоо: 0–100 бүхэл. */
export function parseRoomsCell(text: string): CellParse<number | null> {
  const t = normNumber(text);
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: "Өрөө 0–100 бүхэл тоо" };
  return { ok: true, value: n };
}

/**
 * Үнэ (зөвхөн ₮): «сая»-аар бичнэ (350 → 350 000 000, «2,5» → 2 500 000). 100 000-аас их тоо бичвэл
 * бүтэн дүн гэж үзнэ (350000000). Хоосон → null.
 */
export function parsePriceCell(text: string): CellParse<number | null> {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  const raw = parsePriceInput(t, "none");
  if (raw == null || raw < 0) return { ok: false, error: "Үнийг тоогоор бичнэ үү" };
  const value = raw >= 100_000 ? raw : parsePriceInput(t, "сая");
  if (value == null || value >= 1e14) return { ok: false, error: "Үнэ хэт их байна" };
  return { ok: true, value: Math.round(value) };
}

/** Мөрөнд харуулах үнийн оролт («сая»-аар). */
export function priceCellText(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "";
  const m = price / 1e6;
  return String(Math.round(m * 1000) / 1000);
}

// ── Чирж оруулах ───────────────────────────────────────────────────────

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i;

/** Мөр дээр чирсэн файлуудаас зургийг (HEIC-ийг оруулаад) ялгана; бусдын тоо. */
export function splitDroppedFiles<T extends { name: string; type: string }>(files: readonly T[]): { images: T[]; rejected: number } {
  const images: T[] = [];
  let rejected = 0;
  for (const f of files) {
    if (f.type.startsWith("image/") || IMAGE_EXT_RE.test(f.name)) images.push(f);
    else rejected += 1;
  }
  return { images, rejected };
}

/** Чирэлт файлтай эсэх (DataTransfer.types). */
export function dragHasFiles(types: readonly string[] | null | undefined): boolean {
  return !!types && Array.from(types).includes("Files");
}

// ── Нэгтгэл ───────────────────────────────────────────────────────────

/** Багийн дундаж гүйцэтгэл (мөр бүрийн хувиас). */
export function averagePercent(items: readonly { percent: number }[]): number | null {
  if (!items.length) return null;
  return Math.round(items.reduce((s, i) => s + clampPercent(i.percent), 0) / items.length);
}

/** Минут/секундээр (хэмжүүр): 95 000 мс → «1 мин 35 с». */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} мин ${r} с` : `${m} мин`;
}

// ── Давхардлын дараалал ───────────────────────────────────────────────

export const DUP_REASON_LABEL: Record<string, string> = {
  project_floor_area: "Төсөл, давхар, талбай ойролцоо",
  owner_phone: "Эзний утас ижил",
  listing: "Ижил зар",
};

export const DUP_KIND_LABEL: Record<"distinct" | "access", string> = {
  distinct: "Агент «тусдаа хөрөнгө» гэж тэмдэглэсэн",
  access: "Хандах эрх хүссэн",
};

export function dupReasonsText(reasons: readonly string[]): string {
  return reasons.map((r) => DUP_REASON_LABEL[r] ?? "Ижил төстэй").join(", ") || "Ижил төстэй";
}

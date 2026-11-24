/**
 * «Миний зараас үүсгэх» (P12) — цэвэр туслах: сонголт (утсанд нэг, ширээнд олон), явцын бичвэр,
 * үр дүнгийн мөр, нэгтгэл. Эзний мэдээлэл энд огт байхгүй (зарт эзэн байдаггүй).
 */

/** Зараас авсан талбарын шошго (картын «автомат» шошготой ижил утга). */
export const IMPORTED_TAG = "зараас, шалгана уу";
/** Нэг удаад импортлох дээд тоо (дараалан, нэг нэгээр). */
export const MAX_IMPORT_BATCH = 20;

export type ImportOutcomeLike = {
  propertyId: string | null;
  code: string | null;
  existing: boolean;
  readOnly: boolean;
  photosCopied: number;
  photosFailed: number;
  duplicates: readonly unknown[];
};

export type ImportRunResult =
  | { listingId: string; title: string; ok: true; outcome: ImportOutcomeLike }
  | { listingId: string; title: string; ok: false; error: string };

/** Сонголт солих: multi=false үед нэг л мөр үлдэнэ (дахин дарвал болино). */
export function toggleSelection(selected: readonly string[], id: string, multi: boolean, max = MAX_IMPORT_BATCH): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (!multi) return [id];
  if (selected.length >= max) return [...selected];
  return [...selected, id];
}

/** Жагсаалтад байхгүй (хуулагдсан/устсан) сонголтыг хасна. */
export function pruneSelection(selected: readonly string[], available: readonly { id: string }[]): string[] {
  const ids = new Set(available.map((a) => a.id));
  return selected.filter((x) => ids.has(x));
}

export function progressText(done: number, total: number): string {
  if (total <= 0) return "";
  if (done >= total) return `Дууслаа: ${total}/${total}`;
  return `Хуулж байна ${done + 1}/${total}…`;
}

/** Нэг зарын үр дүнгийн богино мөр. */
export function resultLine(r: ImportRunResult): string {
  if (!r.ok) return r.error;
  const o = r.outcome;
  if (o.existing && !o.propertyId) return "Энэ зар өөр (харах эрхгүй) хөрөнгөтэй холбогдсон байна";
  if (o.existing && o.readOnly) return `${o.code ?? "Хөрөнгө"} аль хэдийн бүртгэлтэй`;
  const photos =
    o.photosCopied || o.photosFailed
      ? ` · ${o.photosCopied} зураг${o.photosFailed ? `, ${o.photosFailed} хуулагдсангүй` : ""}`
      : " · зураггүй";
  const head = o.existing ? "Үргэлжлүүлсэн" : "Ноорог үүслээ";
  return `${o.code ? `${head}: ${o.code}` : head}${photos}`;
}

export function summarizeImport(results: readonly ImportRunResult[]): {
  created: number;
  existing: number;
  failed: number;
  withDuplicates: number;
  photosFailed: number;
} {
  let created = 0;
  let existing = 0;
  let failed = 0;
  let withDuplicates = 0;
  let photosFailed = 0;
  for (const r of results) {
    if (!r.ok) {
      failed += 1;
      continue;
    }
    if (r.outcome.existing) existing += 1;
    else created += 1;
    if (r.outcome.duplicates.length > 0) withDuplicates += 1;
    photosFailed += r.outcome.photosFailed;
  }
  return { created, existing, failed, withDuplicates, photosFailed };
}

/** ?import=<listing uuid> | 1 → нээх эсэх, урьдчилан сонгох зар. */
export function parseImportParam(v: string | string[] | undefined | null): { open: boolean; listingId: string | null } {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return { open: false, listingId: null };
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : null;
  return { open: true, listingId: id };
}

import { crm2Client } from "@/lib/crm2/server";

/**
 * Төсөл сонгоход хоосон талбарт санал болгох утга (шар «шалгана уу», unconfirmed-д орно): тухайн төслийн
 * RLS-ээр харагдах хөрөнгүүдийн хамгийн түгээмэл дүүрэг, барилгын давхар, ашиглалтад орсон он.
 * Хэзээ ч бичсэн утгыг дарахгүй (дуудагч зөвхөн хоосон талбарт тавина). Хувийн талбар уншихгүй.
 */

export type ProjectHints = {
  district: string | null;
  building_floors: number | null;
  year_in_use: number | null;
  /** Санал гаргасан хөрөнгийн тоо. */
  sample: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_LIMIT = 200;

/** Хамгийн олон давтагдсан утга (тэнцвэл эхэлж тааралдсан). null/хоосныг үл тооно. Цэвэр. */
export function mostCommon<T extends string | number>(values: readonly (T | null | undefined)[]): T | null {
  // Map нь анх тааралдсан дарааллаа хадгална — тэнцвэл эхэнд нь (хамгийн шинэ хөрөнгийнх) ялна.
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v === null || v === undefined || (typeof v === "string" && !v.trim())) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** Мөрүүдээс санал (цэвэр). Мөргүй эсвэл ямар ч утгагүй бол null. */
export function hintsFromRows(
  rows: readonly { district: string | null; building_floors: number | null; year_in_use: number | null }[]
): ProjectHints | null {
  if (rows.length === 0) return null;
  const hints: ProjectHints = {
    district: mostCommon(rows.map((r) => r.district)),
    building_floors: mostCommon(rows.map((r) => r.building_floors)),
    year_in_use: mostCommon(rows.map((r) => r.year_in_use)),
    sample: rows.length,
  };
  return hints.district === null && hints.building_floors === null && hints.year_in_use === null ? null : hints;
}

export async function projectHints(projectId: string): Promise<ProjectHints | null> {
  if (!UUID_RE.test(projectId)) return null;
  const supabase = await crm2Client();
  const { data, error } = await supabase
    .from("crm2_properties")
    .select("district, building_floors, year_in_use")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error) {
    console.error("crm2 projectHints:", error.message);
    return null;
  }
  return hintsFromRows(data ?? []);
}

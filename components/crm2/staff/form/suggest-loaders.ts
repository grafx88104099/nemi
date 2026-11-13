import { suggestLocationsAction, suggestProjectsAction } from "@/lib/crm2/actions/lookups";

import type { Suggestion } from "./SuggestInput";

/**
 * SuggestInput-ийн ачаалагчид (server action → санал). Алдаа гарвал хоосон
 * жагсаалт — санал нь туслах хэрэгсэл тул маягтыг саатуулахгүй.
 */

function countHint(n: number | null | undefined): string | undefined {
  return n ? `${n} хөрөнгө` : undefined;
}

/** Өмнө бүртгэсэн төслийн нэрс (key = төслийн id). */
export async function loadProjectSuggestions(query: string): Promise<Suggestion[]> {
  const res = await suggestProjectsAction(query, 10);
  if (!res.ok) return [];
  return res.data.map((p) => ({ key: p.id, label: p.name, hint: countHint(p.property_count) }));
}

/** Staff-д байгаа байршлын бичвэр (key = байршил). */
export async function loadLocationSuggestions(query: string): Promise<Suggestion[]> {
  const res = await suggestLocationsAction(query, 12);
  if (!res.ok) return [];
  return res.data
    .filter((l) => !!l.location)
    .map((l) => ({ key: l.location, label: l.location, hint: countHint(l.property_count) }));
}

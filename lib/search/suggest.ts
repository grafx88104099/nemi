/**
 * Хайлтын мөрийн санал (typeahead) — СТАТИК жагсаалт, сүлжээний хүсэлтгүй.
 * ЦЭВЭР, клиентэд аюулгүй модуль.
 *
 * Сүүлийн нэг/хоёр үгийг (латинаар бичсэн ч) дүүрэг, төрөл, гүйлгээ, «N өрөө»,
 * «N сая хүртэл», «N м²-аас дээш»-тэй тааруулна. Санал бүр хайлтын мөрөнд
 * шууд оруулахад search_text-тэй таардаг (search-query.test.ts шалгана), мөн
 * parseSearchQuery үүнийг шүүлт болгоно.
 */
import type { Suggestion } from "@/components/ui/SuggestInput";
import { DISTRICTS, PROPERTY_TYPES } from "@/lib/constants";
import { foldSearchText } from "@/lib/search/fold";
import { tokenVariants } from "@/lib/search/query";

export type SuggestionKind = "district" | "type" | "deal" | "rooms" | "price" | "area";
export type SearchSuggestion = Suggestion & { kind: SuggestionKind; span: 1 | 2 };

const KIND_ORDER: readonly SuggestionKind[] = ["district", "type", "deal", "rooms", "price", "area"];

type StaticItem = { label: string; hint: string; kind: SuggestionKind; foldKey: string; compactKey: string };

const item = (label: string, hint: string, kind: SuggestionKind): StaticItem => {
  const foldKey = foldSearchText(label);
  return { label, hint, kind, foldKey, compactKey: foldKey.replace(/ /g, "") };
};

/** Статик саналын жагсаалт (тестэд ч ашиглана). */
export const STATIC_SUGGESTIONS: readonly StaticItem[] = [
  ...DISTRICTS.map((d) => item(d, "Дүүрэг", "district")),
  ...PROPERTY_TYPES.map((t) => item(t, "Төрөл", "type")),
  item("Түрээс", "Гүйлгээ", "deal"),
  item("Худалдана", "Гүйлгээ", "deal"),
];

/**
 * Үгийн эхлэлээр тааруулах хувилбарууд: латинаар бичиж буй үгийн сүүлийн үсэг
 * хос үсгийн эхлэл байж болно («bay» → «баян…», «zurk» → «зурх»).
 */
const DIGRAPH_STARTS: Readonly<Record<string, readonly string[]>> = {
  k: ["kh"],
  s: ["sh"],
  c: ["ch"],
  t: ["ts"],
  z: ["zh"],
  y: ["ya", "yo", "ye", "yu"],
};

function prefixVariants(frag: string): string[] {
  const out = tokenVariants(frag);
  const last = frag.slice(-1).toLowerCase();
  for (const d of DIGRAPH_STARTS[last] ?? []) out.push(...tokenVariants(frag.slice(0, -1) + d));
  return [...new Set(out)];
}

function matches(it: StaticItem, vars: string[]): { hit: boolean; starts: boolean } {
  let hit = false;
  for (const v of vars) {
    if (it.foldKey.startsWith(v)) return { hit: true, starts: true };
    if (it.foldKey.includes(" " + v) || it.compactKey.startsWith(v.replace(/ /g, ""))) hit = true;
  }
  return { hit, starts: false };
}

const tokensOf = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Оруулсан текстийн сүүлийн хэсэгт тохирох санал (дээд тал нь `limit`). */
export function suggestionsFor(input: string, limit = 8): SearchSuggestion[] {
  const tokens = tokensOf(input);
  if (!tokens.length) return [];
  const frag1 = tokens[tokens.length - 1];

  if (/^[0-9]+$/.test(frag1)) {
    const n = Number(frag1);
    const out: SearchSuggestion[] = [];
    if (n >= 1 && n <= 10) out.push({ key: `rooms-${n}`, label: `${n} өрөө`, hint: "Өрөө", kind: "rooms", span: 1 });
    if (n >= 1 && n <= 9999) out.push({ key: `price-${n}`, label: `${n} сая хүртэл`, hint: "Үнэ", kind: "price", span: 1 });
    if (n >= 10 && n <= 100000) out.push({ key: `area-${n}`, label: `${n} м²-аас дээш`, hint: "Талбай", kind: "area", span: 1 });
    return out.slice(0, limit);
  }

  type Cand = { it: StaticItem; span: 1 | 2; starts: boolean };
  const found = new Map<string, Cand>();
  const spans: (1 | 2)[] = tokens.length >= 2 ? [2, 1] : [1];
  for (const span of spans) {
    const frag = tokens.slice(-span).join(" ");
    const fragFold = foldSearchText(frag);
    if (!fragFold) continue;
    const before = " " + foldSearchText(tokens.slice(0, -span).join(" ")) + " ";
    const vars = prefixVariants(frag);
    for (const it of STATIC_SUGGESTIONS) {
      if (found.has(it.label)) continue;
      // Аль хэдийн бичсэн (эсвэл бүрэн бичигдсэн) утгыг дахин санал болгохгүй.
      if (before.includes(" " + it.foldKey + " ") || fragFold === it.foldKey) continue;
      const m = matches(it, vars);
      if (m.hit) found.set(it.label, { it, span, starts: m.starts });
    }
  }

  return [...found.values()]
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.it.kind) - KIND_ORDER.indexOf(b.it.kind) ||
        Number(b.starts) - Number(a.starts) ||
        a.it.label.length - b.it.label.length
    )
    .slice(0, limit)
    .map(({ it, span }) => ({ key: `${it.kind}-${it.label}`, label: it.label, hint: it.hint, kind: it.kind, span }));
}

/** Сүүлийн `span` үгийг саналын утгаар солино (ард нь зай — дараагийн үгэнд бэлэн). */
export function applySuggestion(input: string, s: Pick<SearchSuggestion, "label" | "span">): string {
  const trimmed = input.replace(/\s+$/, "");
  const re = /\S+/g;
  const starts: number[] = [];
  for (let m = re.exec(trimmed); m; m = re.exec(trimmed)) starts.push(m.index);
  const cut = starts.length >= s.span ? starts[starts.length - s.span] : 0;
  return trimmed.slice(0, cut) + s.label + " ";
}

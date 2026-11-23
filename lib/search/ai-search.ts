/**
 * Ухаалаг хайлтын AI нөөцийн урсгал (R08c, Stage 3). СЕРВЕРТ л (node:crypto,
 * next/cache). "use server" БИШ — action нь lib/actions/search.ts.
 *
 *   1. URL-ийн шүүлт → applySmartQuery (дүрмийн задлагч) → `fallback` href.
 *   2. shouldTryAi биш бол шууд fallback (rpc, AI дуудахгүй).
 *   3. Хэшлэсэн IP-гаар rate_limit_hit (20 / 10 мин) — data === true үед л үргэлжилнэ.
 *   4. cachedInterpret: sha256(нугалсан текст)-ээр 1 өдөр кэшилнэ; кэшгүй дуудлага
 *      бүр нийт өдрийн хязгаар (AI_SEARCH_DAILY_CAP, анхдагч 500)-ыг тоолно.
 *   5. AI зөвхөн дүрмээр олдоогүй түлхүүрийг бөглөнө; үр дүн үргэлж filtersHref-ээр
 *      бүтсэн харьцангуй зам (open redirect байхгүй).
 * Аливаа алдаа → дүрмийн fallback.
 */
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { interpretQueryWithAI, type AiIntent } from "@/lib/ai/search-intent";
import { FILTER_KEYS, filtersHref, parseListingFilters, type ListingFilters } from "@/lib/listing-filters";
import { foldSearchText } from "@/lib/search/fold";
import { applySmartQuery, shouldTryAi, type SmartFilters } from "@/lib/search/parse-query";

export type AiSearchBase = "/listings" | "/map";

export type RateLimitRpc = (
  fn: "rate_limit_hit",
  args: { p_key: string; p_window_seconds: number; p_max: number }
) => Promise<{ data: boolean | null; error: unknown }>;

export type AiSearchDeps = {
  ip: string;
  salt: string;
  rpc: RateLimitRpc;
  interpret: (q: string) => Promise<AiIntent>;
};

export const AI_IP_WINDOW_SECONDS = 600;
export const AI_IP_MAX = 20;
export const AI_DAILY_CAP_DEFAULT = 500;

const ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([...FILTER_KEYS, "sort"]);
const SMART_KEYS = ["deal", "district", "type", "rooms", "minPrice", "maxPrice", "minArea", "maxArea"] as const satisfies readonly (keyof SmartFilters)[];

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

const FormSchema = z
  .record(z.string().max(40), z.string().max(200))
  .refine((r) => Object.keys(r).length <= 20);

/**
 * Маягтын утгууд → { base, params }. $ACTION_ түлхүүр, файл, зөвшөөрөгдөөгүй
 * түлхүүрийг хаяна; хэт урт/олон утгатай бол params хоосон.
 */
export function parseAiSearchForm(entries: Iterable<[string, FormDataEntryValue]>): {
  base: AiSearchBase;
  params: Record<string, string>;
} {
  let base: AiSearchBase = "/listings";
  const picked: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of entries) {
    if (typeof v !== "string" || k.startsWith("$ACTION")) continue;
    if (k === "base") {
      if (v === "/map") base = "/map";
      continue;
    }
    if (++count > 40) break;
    if (ALLOWED_KEYS.has(k) && !(k in picked)) picked[k] = v;
  }
  const parsed = FormSchema.safeParse(picked);
  return { base, params: parsed.success ? parsed.data : {} };
}

/** URL параметр → дүрмээр задалсан шүүлт. */
function ruleFilters(params: Record<string, string>): ListingFilters {
  return applySmartQuery(parseListingFilters(params)).filters;
}

/** AI-гүй үр дүн (дүрмийн задлагч). */
export function ruleHref(base: AiSearchBase, params: Record<string, string>): string {
  return filtersHref(base, ruleFilters(params), { withSort: true });
}

export function ipRateKey(ip: string, salt: string): string {
  return `ai-search:ip:${sha256hex(`${salt}:${ip}`)}`;
}

export async function resolveAiSearch(
  base: AiSearchBase,
  params: Record<string, string>,
  deps: AiSearchDeps
): Promise<string> {
  const smart = ruleFilters(params);
  const fallback = filtersHref(base, smart, { withSort: true });
  if (!smart.q || !shouldTryAi(smart.q)) return fallback;

  const { data: allowed, error } = await deps.rpc("rate_limit_hit", {
    p_key: ipRateKey(deps.ip, deps.salt),
    p_window_seconds: AI_IP_WINDOW_SECONDS,
    p_max: AI_IP_MAX,
  });
  if (error || allowed !== true) return fallback;

  let ai: AiIntent;
  try {
    ai = await deps.interpret(smart.q);
  } catch {
    return fallback;
  }

  const merged: ListingFilters = { ...smart, page: undefined };
  let filled = false;
  for (const k of SMART_KEYS) {
    if (merged[k] === undefined && ai[k] !== undefined) {
      (merged as Record<string, unknown>)[k] = ai[k];
      filled = true;
    }
  }
  // AI юу ч танихгүй (шүүлтгүй, түлхүүр үггүй) бол хэрэглэгчийн текстийг хаяхгүй.
  if (!filled && !ai.keywords) return fallback;
  merged.q = ai.keywords || undefined;
  // Түлхүүр үгийг дүрмээр дахин задлана — хуудас дахин redirect хийхгүй.
  return filtersHref(base, applySmartQuery(merged).filters, { withSort: true });
}

function dailyCap(): number {
  const n = Number(process.env.AI_SEARCH_DAILY_CAP);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : AI_DAILY_CAP_DEFAULT;
}

/**
 * Кэштэй AI тайлбар. Түлхүүр нь ЗӨВХӨН нугалсан текстийн sha256 (keyParts) —
 * функц аргументгүй тул түүхий текст кэшийн түлхүүрт орохгүй, ижил нугалалттай
 * бичлэгүүд нэг entry хуваалцана. Throw хийвэл юу ч кэшлэгдэхгүй.
 * headers()/cookies()-ийг энд уншихгүй (unstable_cache-д хориотой).
 */
export function cachedInterpret(q: string, rpc: RateLimitRpc): Promise<AiIntent> {
  const h = sha256hex(foldSearchText(q));
  return unstable_cache(
    async (): Promise<AiIntent> => {
      const { data, error } = await rpc("rate_limit_hit", {
        p_key: "ai-search:global",
        p_window_seconds: 86_400,
        p_max: dailyCap(),
      });
      if (error || data !== true) throw new Error("cap");
      const r = await interpretQueryWithAI(q);
      if (!r.result) throw new Error(r.error ?? "ai");
      return r.result;
    },
    ["search-ai-v1", h],
    { revalidate: 86_400, tags: ["search-ai"] }
  )();
}

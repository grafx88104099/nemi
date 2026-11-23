import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Map as MapIcon } from "lucide-react";

import { getListings, hasAiScores } from "@/lib/queries";
import { filtersHref, filtersToParams, parseListingFilters } from "@/lib/listing-filters";
import { applySmartQuery, shouldTryAi } from "@/lib/search/parse-query";
import { aiSearchEnabled } from "@/lib/ai/search-intent";
import { AiSearchForm } from "@/components/search/AiSearchForm";
import { ListingCard } from "@/components/listings/ListingCard";
import { SaveSearchButton } from "@/components/listings/SaveSearchButton";
import { SearchFilterBar } from "@/components/listings/SearchFilterBar";
import { SavedSearchSeen } from "@/components/listings/SavedSearchSeen";
import { UUID_RE, withSavedSearchParam } from "@/lib/hub";

/**
 * Шүүлтүүргүй /listings л индекслэгдэнэ (canonical). Шүүсэн/хуудасласан хувилбар
 * noindex,follow — холбоосоор мөлхөгдөнө, давхардсан хуудас индекст орохгүй.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const hasParams = Object.values(sp).some((v) => v != null && v !== "");
  const base = {
    title: "Үл хөдлөхийн зарууд — Нэми",
    description: "Улаанбаатарын худалдах, түрээсийн орон сууц, хаус, оффисын баталгаатай зарууд.",
  };
  return hasParams
    ? { ...base, robots: { index: false, follow: true } }
    : { ...base, alternates: { canonical: "/listings" } };
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseListingFilters(sp);
  // «Миний Нэми»-ээс нээсэн хадгалсан хайлт (?ss=<id>) — FILTER_KEYS-д ороогүй тул
  // шүүлт, хуудаслалт, «Хайлт хадгалах»-д дамжихгүй. Клиент mount-ын дараа «үзсэн» болгоно.
  const ss = typeof sp.ss === "string" && UUID_RE.test(sp.ss) ? sp.ss : null;
  // Ухаалаг хайлт: «хан-уулд 2 өрөө 300 сая хүртэл» → каноник шүүлттэй URL (307,
  // replace) — задалсан утга бүр арилгаж болох чип болж харагдана.
  const smart = applySmartQuery(filters);
  // ss-г redirect дамжуулан хадгална — эс бөгөөс чөлөөт текстэй хадгалсан хайлт «үзсэн» болохгүй.
  if (smart.changed) redirect(withSavedSearchParam(filtersHref("/listings", smart.filters, { withSort: true }), ss));

  const [{ listings, total, page, pageSize }, aiSort] = await Promise.all([getListings(filters), hasAiScores().catch(() => false)]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(p: number) {
    const params = filtersToParams(filters, { withSort: true });
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/listings?${qs}` : "/listings";
  }

  const saved = Object.fromEntries(filtersToParams(filters, { withSort: true }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {ss ? <SavedSearchSeen id={ss} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">
          {filters.deal === "rent" ? "Түрээсийн зар" : filters.deal === "sale" ? "Худалдах зар" : "Зарын жагсаалт"}
        </h1>
        <div className="flex items-center gap-4">
          <SaveSearchButton
            filters={saved}
            label={[filters.q, filters.district, filters.type].filter(Boolean).join(" · ") || "Бүх зар"}
          />
          <Link href="/saved-searches" className="text-sm text-muted hover:underline">Хадгалсан хайлт</Link>
          <Link
            href={filtersHref("/map", filters)}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
          >
            <MapIcon className="size-4" aria-hidden /> Газрын зураг
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <SearchFilterBar base="/listings" f={filters} showSort aiSort={aiSort} />
      </div>

      <p className="mt-4 text-sm text-muted">{total} зар олдлоо</p>
      {/* R08c: дүрмээр таниагүй чөлөөт текст — сонголттой AI тайлбар (унтраастай бол харагдахгүй). */}
      {aiSearchEnabled() && shouldTryAi(filters.q) ? <AiSearchForm f={filters} /> : null}

      {listings.length === 0 ? (
        <p className="py-20 text-center text-muted">Тохирох зар олдсонгүй. Шүүлтээ багасгаад үзнэ үү.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Хуудас" className="mt-8 flex flex-wrap justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref(p)}
              aria-current={p === page ? "page" : undefined}
              className={`flex size-11 items-center justify-center rounded-lg text-sm font-semibold ${
                p === page ? "bg-brand-500 text-white" : "border border-line bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

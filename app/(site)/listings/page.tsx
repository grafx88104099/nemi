import Link from "next/link";
import { Map as MapIcon } from "lucide-react";

import { getListings, hasAiScores } from "@/lib/queries";
import { filtersHref, filtersToParams, parseListingFilters } from "@/lib/listing-filters";
import { ListingCard } from "@/components/listings/ListingCard";
import { SaveSearchButton } from "@/components/listings/SaveSearchButton";
import { SearchFilterBar } from "@/components/listings/SearchFilterBar";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListingFilters(await searchParams);

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

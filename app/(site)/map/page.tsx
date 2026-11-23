import Link from "next/link";
import { redirect } from "next/navigation";
import { List } from "lucide-react";

import { ListingsMap } from "@/components/map/ListingsMap";
import { SearchFilterBar } from "@/components/listings/SearchFilterBar";
import { filtersHref, parseListingFilters, type ListingFilters } from "@/lib/listing-filters";
import { applySmartQuery } from "@/lib/search/parse-query";

export const metadata = { title: "Газрын зураг — Нэми" };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListingFilters(await searchParams);
  // Жагсаалттай ижил каноник redirect (задалсан утга чип болно).
  const smart = applySmartQuery(filters);
  if (smart.changed) redirect(filtersHref("/map", smart.filters));
  // Клиент компонент руу зөвхөн шүүлтийн утгууд (хуудас, эрэмбэ газрын зурагт хамаагүй).
  const mapFilters: ListingFilters = { ...filters, page: undefined, sort: undefined, pageSize: undefined };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Газрын зураг дээрх зар</h1>
        <Link
          href={filtersHref("/listings", filters)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
        >
          <List className="size-4" aria-hidden /> Жагсаалтаар харах
        </Link>
      </div>
      <div className="mb-4">
        <SearchFilterBar base="/map" f={filters} />
      </div>
      <ListingsMap filters={mapFilters} />
    </div>
  );
}

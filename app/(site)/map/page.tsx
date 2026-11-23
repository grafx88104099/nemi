import Link from "next/link";
import { redirect } from "next/navigation";
import { List } from "lucide-react";

import { ListingsMap } from "@/components/map/ListingsMap";
import { SearchFilterBar } from "@/components/listings/SearchFilterBar";
import { filtersHref, parseListingFilters, type ListingFilters } from "@/lib/listing-filters";
import { applySmartQuery } from "@/lib/search/parse-query";
import { getListingFacets } from "@/lib/queries";

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
  // Тоо нь ХОТЫН хэмжээнд: p_has_location = байршилтай + түдгэлзээгүй оффис (listings_map_search-тэй
  // ижил дүрэм) тул анхдагч горимд пинийн тоотой тэнцүү (2000 пинийн хязгаар дотор).
  // «Энэ хавьд хайх (4км)» горимд чипийн тоо хотын хэмжээнд хэвээр; ListingsMap өөрөө
  // «Энэ хавьд {pins.length} зар» гэж пинийн тоог харуулна.
  const facets = await getListingFacets(mapFilters, { hasLocation: true });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Газрын зураг дээрх зар</h1>
        <Link
          href={filtersHref("/listings", filters)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <List className="size-4" aria-hidden /> Жагсаалтаар харах
        </Link>
      </div>
      <div className="mb-4">
        <SearchFilterBar base="/map" f={filters} facets={facets} />
      </div>
      <ListingsMap filters={mapFilters} />
    </div>
  );
}

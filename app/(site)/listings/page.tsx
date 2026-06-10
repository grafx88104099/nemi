import Link from "next/link";

import { getListings, type ListingFilters } from "@/lib/queries";
import { ListingCard } from "@/components/listings/ListingCard";
import { SaveSearchButton } from "@/components/listings/SaveSearchButton";
import { PROPERTY_TYPES, DISTRICTS } from "@/lib/constants";

const TYPES = PROPERTY_TYPES;
const SORTS: [string, string][] = [
  ["new", "Шинэлэг"],
  ["price_asc", "Үнэ: бага → их"],
  ["price_desc", "Үнэ: их → бага"],
  ["ai", "AI оноо"],
];
const POSTED: [string, string][] = [
  ["1", "Сүүлийн 24 цаг"],
  ["3", "Сүүлийн 3 хоног"],
  ["7", "Сүүлийн 7 хоног"],
  ["30", "Сүүлийн 30 хоног"],
];

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters: ListingFilters = {
    q: sp.q || undefined,
    district: sp.district || undefined,
    type: sp.type || undefined,
    rooms: sp.rooms ? Number(sp.rooms) : undefined,
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    deal: sp.deal === "rent" || sp.deal === "sale" ? sp.deal : undefined,
    posted: sp.posted ? Number(sp.posted) : undefined,
    sort: (sp.sort as ListingFilters["sort"]) || "new",
    page: sp.page ? Number(sp.page) : 1,
  };

  const { listings, total, page, pageSize } = await getListings(filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(p: number) {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][]
    );
    params.set("page", String(p));
    return `/listings?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">
          {filters.deal === "rent" ? "Түрээсийн зар" : filters.deal === "sale" ? "Худалдах зар" : "Зарын жагсаалт"}
        </h1>
        <div className="flex items-center gap-4">
          <SaveSearchButton
            filters={Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>}
            label={[sp.q, sp.district, sp.type].filter(Boolean).join(" · ") || "Бүх зар"}
          />
          <Link href="/saved-searches" className="text-sm text-muted hover:underline">Хадгалсан хайлт</Link>
          <Link href="/map" className="text-sm font-semibold text-brand-600 hover:underline">🗺 Газрын зураг</Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{total} зар олдлоо</p>

      {/* Filter bar */}
      <form
        action="/listings"
        className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-6"
      >
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Хайх..."
          className="col-span-2 h-10 rounded-lg border border-line px-3 text-sm focus:border-brand-500 focus:outline-none md:col-span-2"
        />
        <select name="district" defaultValue={sp.district ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">Бүх дүүрэг</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">Бүх төрөл</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="rooms" defaultValue={sp.rooms ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">Өрөө</option>
          {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}+ өрөө</option>)}
        </select>
        <input name="minPrice" type="number" defaultValue={sp.minPrice ?? ""} placeholder="Үнэ доод" className="h-10 rounded-lg border border-line px-2 text-sm focus:border-brand-500 focus:outline-none" />
        <input name="maxPrice" type="number" defaultValue={sp.maxPrice ?? ""} placeholder="Үнэ дээд" className="h-10 rounded-lg border border-line px-2 text-sm focus:border-brand-500 focus:outline-none" />
        <select name="posted" defaultValue={sp.posted ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">Бүх хугацаа</option>
          {POSTED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="sort" defaultValue={sp.sort ?? "new"} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit" className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
          Шүүх
        </button>
      </form>

      {/* Results */}
      {listings.length === 0 ? (
        <p className="py-20 text-center text-muted">Тохирох зар олдсонгүй.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref(p)}
              className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold ${
                p === page ? "bg-brand-500 text-white" : "border border-line bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getRecentlyViewed } from "@/lib/queries-user";
import { ListingRow } from "@/components/listings/ListingRow";

/** Нэвтэрсэн хэрэглэгчийн «Саяхан үзсэн» мөр (нүүр хуудас, Suspense дотор). */
export async function HomeRecentlyViewed() {
  let listings: Awaited<ReturnType<typeof getRecentlyViewed>> = [];
  try {
    listings = await getRecentlyViewed(10);
  } catch (e) {
    console.error("home recently viewed:", e instanceof Error ? e.message : e);
    return null;
  }
  if (listings.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14" aria-labelledby="recent-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recent-heading" className="text-2xl font-extrabold text-ink">Саяхан үзсэн</h2>
          <p className="text-sm text-muted">Таны сүүлд үзсэн зарууд</p>
        </div>
        <Link href="/recently-viewed" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          Бүгдийг үзэх <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ListingRow listings={listings} />
    </section>
  );
}

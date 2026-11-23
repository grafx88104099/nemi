import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ListingCard, type ListingCardData } from "@/components/listings/ListingCard";
import { SaveSearchButton } from "@/components/listings/SaveSearchButton";
import { closedHeadline, closedLabel, type ClosedListing } from "@/lib/seo/listing";
import { ogPhotoUrl } from "@/lib/seo/site";

/**
 * Хаагдсан (зарагдсан/түрээслэгдсэн) агентын зарын нийтийн хуудас.
 * Зөвхөн төрөл, талбай, дүүрэг, гүйлгээний төрөл ба нүүр зураг — гарчиг, үнэ,
 * тайлбар, агент, эзэн, утас, газрын зураг, огноо ХАРУУЛАХГҮЙ.
 */
export function ClosedListingView({ listing, similar }: { listing: ClosedListing; similar: ListingCardData[] }) {
  const headline = closedHeadline(listing);
  const rent = listing.deal_type === "rent";
  const f: Record<string, string> = Object.fromEntries(
    Object.entries({
      deal: listing.deal_type,
      district: listing.district ?? "",
      type: listing.type ?? "",
    }).filter(([, v]) => v)
  );
  const similarHref = `/listings?${new URLSearchParams(f).toString()}`;
  // next/image зөвхөн remotePatterns-д буй host-оор (Supabase, unsplash) — бусад host-д алдаа заахгүйн тулд зураггүй.
  const photo = listing.photo && ogPhotoUrl(listing.photo)?.startsWith("/_next/image") ? listing.photo : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/listings" className="inline-flex min-h-11 items-center text-sm text-muted hover:underline">
        ← Жагсаалт руу
      </Link>

      <div className="relative mt-2 aspect-[16/9] overflow-hidden rounded-2xl bg-surface-2">
        {photo ? (
          <Image
            src={photo}
            alt={headline}
            fill
            sizes="(max-width: 768px) 100vw, 1152px"
            className="object-cover grayscale-[30%]"
          />
        ) : null}
        <div className="absolute left-4 top-4">
          <Badge tone={rent ? "blue" : "rose"}>{closedLabel(listing.deal_type)}</Badge>
        </div>
      </div>

      <h1 className="mt-5 text-2xl font-extrabold text-ink sm:text-3xl">{headline}</h1>
      <p className="mt-1 text-muted">Энэ зар хаагдсан тул үнэ, холбоо барих мэдээлэл харагдахгүй.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={similarHref}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700"
        >
          Ижил төстэй зар үзэх →
        </Link>
        <SaveSearchButton
          filters={f}
          label={[listing.district, listing.type].filter(Boolean).join(" · ") || "Бүх зар"}
          next={`/listings/${listing.id}`}
          className="min-h-11"
        />
      </div>

      <section className="mt-12" aria-labelledby="similar-heading">
        <h2 id="similar-heading" className="mb-4 text-xl font-bold text-ink">Төстэй зарууд</h2>
        {similar.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((s) => <ListingCard key={s.id} l={s} />)}
          </div>
        ) : (
          <Link
            href="/listings"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline"
          >
            Бүх зарыг үзэх →
          </Link>
        )}
      </section>
    </div>
  );
}

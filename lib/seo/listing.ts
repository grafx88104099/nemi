/**
 * Зарын SEO/шэйрийн цэвэр builder-ууд (metadata, JSON-LD, гарчиг). "server-only"
 * импортгүй — vitest-ээс шууд тестлэнэ. Оролтын төрөлд эзэн/утас/агент/байршил
 * огт байхгүй тул гаралтад ч хэзээ ч орохгүй.
 */
import type { Metadata } from "next";

import { clip, ogBase, ogPhotoUrl, ROOT_OG_IMAGE, withBrand } from "./site";

export type ListingSeo = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  price_per_m2: number | null;
  deal_type: string | null;
  type: string | null;
  rooms: number | null;
  area: number | string | null;
  floor: string | null;
  district: string | null;
  photo: string | null;
  created_at: string | null;
  updated_at: string | null;
  photos?: { url: string; sort_order: number; is_primary: boolean }[];
};

/** listing_closed_public RPC-ийн мөр: гарчиг, үнэ, төлөв, огноогүй. */
export type ClosedListing = {
  id: string;
  deal_type: string;
  type: string | null;
  district: string | null;
  rooms: number | null;
  area: number | string | null;
  floor: string | null;
  photo: string | null;
};

const trim = (x: number, d: number) => String(Number(x.toFixed(d)));

/** Богино үнэ: 420000000 → «420 сая₮», 1650000000 → «1.65 тэрбум₮». */
export function priceShort(n: number): string {
  if (n >= 1e9) return `${trim(n / 1e9, 2)} тэрбум₮`;
  if (n >= 1e6) return `${trim(n / 1e6, n >= 1e8 ? 0 : 1)} сая₮`;
  if (n >= 1e3) return `${trim(n / 1e3, n < 1e5 ? 1 : 0)} мянга₮`;
  return `${n}₮`;
}

export function areaShort(a: number | string | null | undefined): string | null {
  const n = Number(a);
  return a != null && n > 0 ? `${Math.round(n)}м²` : null;
}

export function listingKind(l: { rooms: number | null; type: string | null }): string {
  const rooms = l.rooms ?? 0;
  if (rooms > 0 && (l.type === "Орон сууц" || !l.type)) return `${rooms} өрөө`;
  if (rooms > 0) return `${rooms} өрөө ${(l.type as string).toLowerCase()}`;
  return l.type ?? "Үл хөдлөх";
}

/** «3 өрөө, 78м², Хан-Уул — 420 сая₮» (түрээс бол «/сар»). */
export function listingHeadline(l: ListingSeo): string {
  const head = [listingKind(l), areaShort(l.area), l.district].filter(Boolean).join(", ");
  return `${head} — ${priceShort(l.price)}${l.deal_type === "rent" ? "/сар" : ""}`;
}

export function listingFacts(l: ListingSeo): string[] {
  const rent = l.deal_type === "rent";
  const area = Number(l.area);
  const ppm = rent ? null : (l.price_per_m2 ?? (area > 0 ? Math.round(l.price / area) : null));
  return [
    l.floor && l.floor !== "-" ? `${l.floor} давхар` : null,
    ppm ? `м² ${priceShort(ppm)}` : null,
    l.district ? `${l.district} дүүрэг` : null,
    rent ? "Түрээс" : "Худалдана",
  ].filter((x): x is string => Boolean(x));
}

/** ≤160 тэмдэгт: (нийтийн) гарчиг → баримтууд → тайлбар. */
export function listingDescription(l: ListingSeo): string {
  return clip(`${clip(l.title, 70)}. ${listingFacts(l).join(" · ")}. ${l.description ?? ""}`, 160);
}

/** Үндсэн зураг эхэнд, дараа нь sort_order (зарын хуудастай ижил); хоосон бол l.photo. */
export function sortedPhotos(l: Pick<ListingSeo, "photo" | "photos">): string[] {
  const photos = l.photos ?? [];
  const urls = photos.length
    ? [...photos]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
        .map((p) => p.url)
    : [l.photo];
  return urls.filter((u): u is string => Boolean(u));
}

/** deal_type-аар шийднэ (prod-д status 'sold' түрээсийн мөр бий). */
export function closedLabel(deal_type: string | null): string {
  return deal_type === "rent" ? "Түрээслэгдсэн" : "Зарагдсан";
}

/** «3 өрөө, 78м², Хан-Уул» — үнэгүй, гарчиггүй. */
export function closedHeadline(c: ClosedListing): string {
  return [listingKind(c), areaShort(c.area), c.district].filter(Boolean).join(", ");
}

export function schemaPlaceType(type: string | null): string {
  if (type === "Орон сууц") return "Apartment";
  if (type === "Хаус") return "House";
  return "Accommodation";
}

/** schema.org RealEstateListing + BreadcrumbList (зөвхөн идэвхтэй зарт). */
export function listingJsonLd(l: ListingSeo, pageUrl: string) {
  const rent = l.deal_type === "rent";
  const rooms = l.rooms ?? 0;
  const area = Number(l.area);
  const origin = new URL(pageUrl).origin;
  const headline = listingHeadline(l);

  const offers: Record<string, unknown> = {
    "@type": "Offer",
    price: l.price,
    priceCurrency: "MNT",
    availability: "https://schema.org/InStock",
    businessFunction: rent ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
  };
  if (rent) {
    offers.priceSpecification = {
      "@type": "UnitPriceSpecification",
      price: l.price,
      priceCurrency: "MNT",
      unitCode: "MON",
    };
  }

  const about: Record<string, unknown> = { "@type": schemaPlaceType(l.type) };
  if (rooms > 0) about.numberOfRooms = rooms;
  if (area > 0) about.floorSize = { "@type": "QuantitativeValue", value: area, unitCode: "MTK" };
  about.address = {
    "@type": "PostalAddress",
    ...(l.district ? { addressLocality: l.district } : {}),
    addressRegion: "Улаанбаатар",
    addressCountry: "MN",
  };

  const crumbs: { name: string; item: string }[] = [
    { name: "Нүүр", item: `${origin}/` },
    { name: "Зарууд", item: `${origin}/listings` },
    ...(l.district
      ? [{ name: l.district, item: `${origin}/listings?${new URLSearchParams({ district: l.district })}` }]
      : []),
    { name: headline, item: pageUrl },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateListing",
        "@id": `${pageUrl}#listing`,
        url: pageUrl,
        name: l.title,
        description: clip(l.description ?? l.title, 500),
        ...(l.created_at ? { datePosted: l.created_at } : {}),
        image: sortedPhotos(l).slice(0, 6),
        offers,
        about,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.name,
          item: c.item,
        })),
      },
    ],
  };
}

export type ListingMetaInput =
  | { kind: "invalid" }
  | { kind: "none" }
  | { kind: "active"; l: ListingSeo }
  | { kind: "closed"; c: ClosedListing };

export const CLOSED_DESCRIPTION = "Энэ зар хаагдсан. Нэми дээрх төстэй идэвхтэй зарыг үзээрэй.";

/** /listings/[id]-ийн metadata — цэвэр салаалалт. */
export function listingMetaFor(id: string, r: ListingMetaInput): Metadata {
  if (r.kind === "invalid" || r.kind === "none") {
    return { title: withBrand("Зар"), robots: { index: false, follow: false } };
  }

  if (r.kind === "active") {
    const { l } = r;
    const h = listingHeadline(l);
    const d = listingDescription(l);
    const url = `/listings/${id}`;
    const img = ogPhotoUrl(sortedPhotos(l)[0]);
    const images = img ? [{ url: img, alt: h }] : [ROOT_OG_IMAGE];
    return {
      title: withBrand(h),
      description: d,
      alternates: { canonical: url },
      openGraph: { ...ogBase(), url, title: h, description: d, images },
      twitter: {
        card: img ? "summary_large_image" : "summary",
        title: h,
        description: d,
        images: images.map((i) => i.url),
      },
    };
  }

  // Хаагдсан: canonical-гүй (noindex-тэй зөрчилдөх дохио), openGraph.url-гүй.
  const { c } = r;
  const t = `${closedLabel(c.deal_type)}: ${closedHeadline(c)}`;
  const img = ogPhotoUrl(c.photo);
  return {
    title: withBrand(t),
    description: CLOSED_DESCRIPTION,
    robots: { index: false, follow: true },
    openGraph: { ...ogBase(), title: t, images: img ? [{ url: img, alt: t }] : [ROOT_OG_IMAGE] },
    twitter: { card: img ? "summary_large_image" : "summary" },
  };
}

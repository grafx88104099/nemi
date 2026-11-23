import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

import { getFeaturedListings, getLatestListings } from "@/lib/queries";
import { getPlatformStats } from "@/lib/platform-stats";
import { ListingCard } from "@/components/listings/ListingCard";
import { HomeRecentlyViewed } from "@/components/home/HomeRecentlyViewed";
import { HeroSearch } from "@/components/home/HeroSearch";
import { ProofStrip } from "@/components/home/ProofStrip";
import { DistrictTiles } from "@/components/home/DistrictTiles";
import { SmartTools } from "@/components/home/SmartTools";
import { VerifiedExplainer } from "@/components/home/VerifiedExplainer";
import { OwnerCtaBand } from "@/components/home/OwnerCtaBand";
import { UBSkyline } from "@/components/brand/UBSkyline";
import { manrope } from "@/components/brand/fonts";
import { absUrl, jsonLdHtml, SITE_NAME } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

// OG нь root layout-оос title/description-ийг өвлөнө.
export const metadata: Metadata = {
  title: "Нэми — Улаанбаатарын үл хөдлөх хөрөнгө нэг дор",
  description:
    "Улаанбаатарын бүх дүүргийн худалдах, түрээсийн орон сууц, хаус, оффисын зар нэг дор. Баталгаажсан агентын зар тусгай тэмдэгтэй.",
  alternates: { canonical: "/" },
};

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absUrl("/#org"),
      name: SITE_NAME,
      url: absUrl("/"),
      logo: absUrl("/icons/icon-512.png"),
    },
    {
      "@type": "WebSite",
      "@id": absUrl("/#website"),
      name: SITE_NAME,
      url: absUrl("/"),
      inLanguage: "mn",
      publisher: { "@id": absUrl("/#org") },
    },
  ],
};

/**
 * Hero-ийн жишээ chip (сервер Link). loan8 нь facets-ийн URL гэрээ; 8%-ийн зээлийн
 * тохирол бол ТООЦООЛОЛ тул QuickFilterChips-тэй адил «· тооцоолол» гэж үргэлж тэмдэглэнэ.
 */
const EXAMPLE_CHIPS: { label: string; href: string; note?: string }[] = [
  { label: "Баянзүрх 3 өрөө", href: `/listings?district=${encodeURIComponent("Баянзүрх")}&rooms=3` },
  { label: "Яармагт түрээс", href: `/listings?deal=rent&q=${encodeURIComponent("Яармаг")}` },
  { label: "8%-ийн зээлд тохирох", href: "/listings?loan8=1", note: "тооцоолол" },
];

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink transition hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10";

export default async function Home() {
  // Кэш хоосон үед DB алдаа гарвал нүүр хуудас унахгүй — тухайн хэсэг л нуугдана.
  const none = (e: unknown) => {
    console.error("home listings:", e instanceof Error ? e.message : e);
    return [];
  };
  const [recent, featured, stats] = await Promise.all([
    getLatestListings(18).catch(none),
    getFeaturedListings(10).catch(none),
    // Алдаа → null: proof strip, хавтангийн тоо, м² медиан нуугдана.
    getPlatformStats().catch((e: unknown) => {
      console.error("home stats:", e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  // «Шинэ зарууд»-д онцлохыг давтахгүй — шинээр нэмэгдсэн зар энд гарч ирнэ.
  const featuredIds = new Set(featured.map((l) => l.id));
  const latest = recent.filter((l) => !featuredIds.has(l.id)).slice(0, 8);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(HOME_JSON_LD) }} />

      {/* Hero — LCP нь H1 (текст). Fold-оос дээш растер зураг БАЙХГҮЙ; skyline нь inline SVG. */}
      <section className={cn(manrope.variable, "relative overflow-hidden bg-bg")} aria-labelledby="hero-h1">
        <div className="mx-auto flex max-w-5xl flex-col items-start px-4 pt-4 pb-8 md:pt-12 md:pb-0">
          <span className="order-1 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-sm font-semibold text-ink">
            <MapPin className="size-4" aria-hidden /> Улаанбаатар · 9 дүүрэг
          </span>
          <h1
            id="hero-h1"
            className="order-2 mt-3 max-w-3xl font-display text-[length:clamp(1.75rem,6.5vw,3.25rem)] leading-[1.08] font-extrabold tracking-[-0.02em] text-ink md:mt-5"
          >
            Улаанбаатарын үл хөдлөх хөрөнгө —{" "}
            <span className="underline decoration-brand-500 decoration-4 underline-offset-[6px]">нэг дор</span>
          </h1>
          {/* Утсанд H1-ийн шууд доор (эхний ~360px) тусгай 56px тууз (variant="strip"). */}
          <UBSkyline variant="strip" className="order-3 -mx-4 mt-3 h-14 w-[calc(100%+2rem)] md:hidden" />
          {/* md+ доод талд дэлгэцийн бүтэн өргөнөөр (section overflow-hidden). Өндөр нь зургийн
              6:1 харьцаагаар (хажуу тайрагдахгүй); 260px-ээс өргөн дэлгэцэд зөвхөн тэнгэр тайрагдана
              (2560px-д ч нурууны орой бүтэн). */}
          <UBSkyline className="order-last hidden md:mx-[calc(50%-50vw)] md:mt-10 md:block md:aspect-[6/1] md:h-auto md:max-h-[260px] md:w-screen" />
          <p className="order-4 mt-4 max-w-2xl text-muted md:text-lg">
            Бүх дүүрэг, хороолол, хотхоны худалдаа, түрээсийн зар нэг дор. Баталгаажсан агентын зар тусгай тэмдэгтэй.
          </p>
          <div className="order-5 mt-5 w-full">
            <HeroSearch />
          </div>
          <ul className="order-6 mt-4 flex flex-wrap gap-2" aria-label="Жишээ хайлт">
            {EXAMPLE_CHIPS.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className={CHIP}>
                  {c.label}
                  {c.note ? <span className="ml-1 text-xs font-medium text-muted">· {c.note}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="order-7 mt-4">
            <ProofStrip stats={stats} />
          </div>
        </div>
      </section>

      <DistrictTiles stats={stats} />

      {/* Нэвтэрсэн хэрэглэгчийн сүүлд үзсэн зарууд — hero-г хориглохгүй (Suspense). */}
      <Suspense fallback={null}>
        <HomeRecentlyViewed />
      </Suspense>

      {/* Онцлох зарууд — PMC-ийн хамгийн сүүлийн 10 зар, эргэлддэг (lib/queries getFeaturedListings). Хоосон бол харуулахгүй. */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14" aria-labelledby="featured-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="featured-heading" className="text-2xl font-extrabold text-ink">Онцлох зарууд</h2>
              <p className="text-sm text-muted">Хамгийн сүүлд нэмэгдсэн, баталгаатай сонголтууд</p>
            </div>
            <Link href="/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-ink hover:underline">
              Бүгдийг үзэх <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {/* 10 карт: xl-д 5×2, lg-д 4 багана, утсанд нэг багана. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {featured.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>
        </section>
      )}

      {/* Бусад шинэ зарууд — онцлохоос гадуурх хамгийн сүүлийн боломжит зар (эзний зар орно, давхардуулахгүй) */}
      {latest.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14" aria-labelledby="latest-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="latest-heading" className="text-2xl font-extrabold text-ink">Бусад шинэ зарууд</h2>
              <p className="text-sm text-muted">Сүүлд нэмэгдсэн, одоо боломжтой бусад зарууд</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4">
              <Link href="/listings?deal=sale" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-ink hover:underline">
                Худалдах
              </Link>
              <Link href="/listings?deal=rent" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:text-ink hover:underline">
                Түрээс
              </Link>
              <Link href="/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-ink hover:underline">
                Бүгдийг үзэх <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>
        </section>
      )}

      <SmartTools stats={stats} />
      <VerifiedExplainer />
      <OwnerCtaBand />
    </>
  );
}

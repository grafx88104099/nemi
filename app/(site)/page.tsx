import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Search, ShieldCheck, Sparkles, TrendingUp, ArrowRight, Home as HomeIcon, Tag, KeyRound } from "lucide-react";

import { getFeaturedListings, getLatestListings } from "@/lib/queries";
import { ListingCard } from "@/components/listings/ListingCard";
import { HomeRecentlyViewed } from "@/components/home/HomeRecentlyViewed";
import { SmartSearchInput } from "@/components/search/SmartSearchInput";
import { PROPERTY_TYPES } from "@/lib/constants";
import { absUrl, jsonLdHtml, SITE_NAME } from "@/lib/seo/site";

// Гарчиг, тайлбар, OG-г root layout-оос өвлөнө.
export const metadata: Metadata = { alternates: { canonical: "/" } };

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

export default async function Home() {
  // Кэш хоосон үед DB алдаа гарвал нүүр хуудас унахгүй — тухайн хэсэг л нуугдана.
  const none = (e: unknown) => {
    console.error("home listings:", e instanceof Error ? e.message : e);
    return [];
  };
  const [recent, featured] = await Promise.all([getLatestListings(18).catch(none), getFeaturedListings(10).catch(none)]);
  // «Шинэ зарууд»-д онцлохыг давтахгүй — шинээр нэмэгдсэн зар энд гарч ирнэ.
  const featuredIds = new Set(featured.map((l) => l.id));
  const latest = recent.filter((l) => !featuredIds.has(l.id)).slice(0, 8);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(HOME_JSON_LD) }} />
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-bg">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-sm font-semibold text-brand-700 shadow-sm">
            <ShieldCheck className="size-4" /> Баталгаажсан зар, агентууд
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Монголын <span className="text-brand-500">үл хөдлөх</span>-ийн
            <br /> ухаалаг платформ
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            AI үнэлгээ, баталгаатай агентууд, ил тод үнэ. Гэрээ хайхаас гар
            өгөх хүртэл нэг дороос.
          </p>
          <form
            action="/listings"
            className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-2xl bg-surface p-2 shadow-lg"
          >
            <Search className="ml-2 size-5 text-subtle" />
            <SmartSearchInput
              placeholder="Дүүрэг, хороолол, «2 өрөө 300 сая хүртэл»…"
              ariaLabel="Зар хайх"
              className="min-w-0 flex-1 text-left"
              inputClassName="h-11 border-0 bg-transparent px-1 focus:ring-0"
            />
            <button
              type="submit"
              className="h-11 rounded-xl bg-brand-500 px-6 font-semibold text-white transition hover:bg-brand-600"
            >
              Хайх
            </button>
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {PROPERTY_TYPES.map((t) => (
              <Link
                key={t}
                href={`/listings?type=${encodeURIComponent(t)}`}
                className="rounded-full border border-line bg-surface px-3 py-1 text-muted transition hover:border-brand-300 hover:text-brand-700"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Авна / Зарна / Түрээслэнэ — Zillow маягийн гурван үндсэн үйлдэл */}
      <section className="mx-auto -mt-8 max-w-6xl px-4">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: HomeIcon,
              t: "Авна",
              d: "Баталгаатай зар, AI үнэлгээтэйгээр өөрт тохирох гэрээ ол.",
              cta: "Зар үзэх",
              href: "/listings?deal=sale",
            },
            {
              icon: Tag,
              t: "Зарна",
              d: "Мэргэжлийн оффист зуучлуул, эсвэл өөрөө зар оруул — үнээ ч тооцоолно.",
              cta: "Хөрөнгөө зарлах",
              href: "/sell",
            },
            {
              icon: KeyRound,
              t: "Түрээслэнэ",
              d: "Түрээсийн орон сууц хай, эсвэл өөрийнхөө орон сууцыг түрээслүүл.",
              cta: "Түрээс үзэх",
              href: "/listings?deal=rent",
            },
          ].map((c) => (
            <Link
              key={c.t}
              href={c.href}
              className="group flex flex-col items-center rounded-3xl border border-line bg-surface p-7 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg"
            >
              <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                <c.icon className="size-7" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold text-ink">{c.t}</h3>
              <p className="mt-2 text-sm text-muted">{c.d}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                {c.cta} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

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
            <Link href="/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
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
              <Link href="/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
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

      {/* Why Nemi */}
      <section className="bg-surface py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Баталгаатай мэдээлэл", d: "Зар, агент бүр баталгаажуулалт дамждаг. Хуурамч зар хамгийн бага." },
            { icon: Sparkles, t: "AI үнэлгээ", d: "Зар бүрт зах зээлийн үнэлгээ, чанарын оноо. Зөв шийдвэр гаргахад тус болно." },
            { icon: TrendingUp, t: "Ил тод үнэ", d: "м² үнэ, түүх, харьцуулалт. Дутуу мэдээлэлгүйгээр хэлэлцээ хий." },
          ].map((f) => (
            <div key={f.t} className="space-y-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <f.icon className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-ink">{f.t}</h3>
              <p className="text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

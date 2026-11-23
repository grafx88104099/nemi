import Link from "next/link";

import { CITY_DISTRICTS } from "@/lib/platform-stats-core";
import { buttonClasses } from "@/components/ui/button";

/** (site) доторх notFound() — skyline статик зураг (inline SVG-г давтахгүй). */
export default function SiteNotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 text-center" aria-labelledby="nf-h1">
      {/* eslint-disable-next-line @next/next/no-img-element -- жижиг статик чимэглэлийн SVG */}
      <img
        src="/brand/skyline-dawn.svg"
        alt=""
        width={1440}
        height={240}
        loading="lazy"
        decoding="async"
        className="mx-auto block h-20 w-full max-w-xl rounded-card object-cover object-bottom"
      />
      <p className="mt-6 text-sm font-semibold text-muted">404</p>
      <h1 id="nf-h1" className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">
        Энэ хаяг Улаанбаатарт олдсонгүй
      </h1>
      <p className="mt-3 text-muted">Зар хаагдсан эсвэл холбоос буруу байж магадгүй. Доороос хайгаад үзээрэй.</p>
      <Link href="/listings" className={buttonClasses("cta", "md", "mt-6")}>
        Бүх зар үзэх
      </Link>
      <nav aria-label="Дүүргээр" className="mt-8">
        <ul className="flex flex-wrap justify-center gap-2">
          {CITY_DISTRICTS.map((d) => (
            <li key={d}>
              <Link
                href={`/listings?district=${encodeURIComponent(d)}`}
                className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10"
              >
                {d}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

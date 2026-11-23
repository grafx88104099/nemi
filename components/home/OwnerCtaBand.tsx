import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

/** Эзэнд чиглэсэн CTA (ink тууз). Ink дээрх фокус: цагаан хүрээ, ink offset. */
export function OwnerCtaBand() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14" aria-labelledby="owner-cta-heading">
      <div className="flex flex-col gap-5 rounded-sheet bg-ink p-6 sm:p-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h2 id="owner-cta-heading" className="text-2xl font-bold text-white">
            Байраа зарах уу, түрээслүүлэх үү?
          </h2>
          <p className="max-w-xl text-white/70">
            Өөрөө үнэгүй зар оруулах эсвэл баталгаат агентад зуучлуулах. Үнэлгээ үнэгүй.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/sell"
            className={buttonClasses("cta", "lg", "focus-visible:ring-white focus-visible:ring-offset-ink")}
          >
            Зар өгөх
          </Link>
          <Link
            href="/my-home"
            className="inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-white underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Үнэлгээ авах
          </Link>
        </div>
      </div>
    </section>
  );
}

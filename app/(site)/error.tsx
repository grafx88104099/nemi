"use client"; // Алдааны хил Client Component байх ёстой.

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCw, TriangleAlert } from "lucide-react";

import { panelHomeFor } from "@/lib/panel-home";
import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Нийтийн сайтын хуудас ачаалахад гарсан гэнэтийн алдаа (DB/сүлжээ). Topbar, доод цэс
 * хэвээр ((site)/layout-ын доор). «Дахин оролдох» нь сегментийг серверээс дахин ачаална.
 * loading.tsx-тэй хуудсанд алдаа stream дунд гарвал статус 200 хэвээр үлддэг тул
 * noindex — алдааны бичвэр зарын хаягаар индекслэгдэхгүй.
 * Серверийн алдааны текстийг харуулахгүй (production-д нууцлагдсан) — digest-ийг л.
 */
export default function SiteError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  // app/error.tsx-ээр (панелийн layout унасан г.м.) /agent, /office дээр — панелийн нүүр рүү.
  const home = panelHomeFor(usePathname());
  useEffect(() => {
    console.error("site:", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <meta name="robots" content="noindex" />
      <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink">Ачаалахад алдаа гарлаа</h1>
        <p className="mt-1 text-sm text-muted">Мэдээллийг уншиж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.</p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-subtle">Код: {error.digest}</p> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => (unstable_retry ?? reset)?.()}>
            <RotateCw className="size-4" aria-hidden /> Дахин оролдох
          </Button>
          <Link href={home?.href ?? "/"} className={buttonClasses("outline", "md")}>
            {home?.label ?? "Нүүр хуудас"}
          </Link>
        </div>
      </div>
    </section>
  );
}

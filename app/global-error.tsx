"use client"; // Алдааны хил Client Component байх ёстой.

import { useEffect } from "react";

import "./globals.css";

/**
 * Root layout өөрөө унасан үеийн сүүлчийн хил — Next-ийн англи «Application error»-ын
 * оронд монгол бичвэр, «Дахин оролдох». Root layout-ыг бүхэлд нь орлодог тул өөрийн
 * <html>/<body>, globals.css-тэй; next/font-ын хувьсагч энд байхгүй тул system фонт.
 * Серверийн алдааны текстийг харуулахгүй (production-д нууцлагдсан) — digest-ийг л.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error("global-error:", error);
  }, [error]);

  return (
    <html lang="mn">
      <body style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <title>Алдаа гарлаа — Нэми</title>
        <meta name="robots" content="noindex" />
        <main data-surface="site" className="flex min-h-dvh items-center justify-center px-4 py-12">
          <div role="alert" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
            <h1 className="text-xl font-extrabold text-ink">Уучлаарай, алдаа гарлаа</h1>
            <p className="mt-2 text-sm text-muted">Хуудсыг ачаалж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.</p>
            {error.digest ? <p className="mt-2 font-mono text-xs text-subtle">Код: {error.digest}</p> : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => (unstable_retry ?? reset)?.()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-on-primary hover:bg-brand-hover"
              >
                Дахин оролдох
              </button>
              {/* Root layout унасан тул next/link биш — бүтэн ачаалалт. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root layout унасан үед бүтэн ачаалалт хэрэгтэй */}
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2"
              >
                Нүүр хуудас
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}

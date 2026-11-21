"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Зарын зураг. Өмнө нь эхний 5-ыг л харуулж, үлдсэнийг (дунджаар 9, хамгийн
 * ихдээ 20 зураг) үзэх арга байгаагүй. Одоо аль ч зургийг дарахад бүтэн
 * дэлгэцийн үзүүрт бүх зураг нээгдэнэ: сум, ←/→, Esc, утсанд шударна.
 * Утсанд сүлжээ биш эхний зураг + «N зураг» товч (5 том зураг доош гүйхгүй).
 */
export function PhotoGallery({ photos, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const total = photos.length;
  if (total === 0) {
    return <div className="mt-4 aspect-[4/3] rounded-2xl bg-surface-2 md:aspect-auto md:h-[460px]" aria-hidden />;
  }
  const shown = photos.slice(0, 5);

  return (
    <>
      <div className="relative mt-4 grid gap-2 overflow-hidden rounded-2xl md:h-[460px] md:grid-cols-4 md:grid-rows-2">
        {shown.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`${i + 1}-р зургийг томруулах`}
            className={cn(
              "relative aspect-[4/3] cursor-zoom-in overflow-hidden md:aspect-auto",
              i === 0 ? "md:col-span-2 md:row-span-2" : "hidden md:block"
            )}
          >
            <Image
              src={src}
              alt={i === 0 ? title : ""}
              fill
              sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "25vw"}
              priority={i === 0}
              className="object-cover transition duration-300 hover:scale-[1.02]"
            />
          </button>
        ))}
        {total > 1 ? (
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface/95 px-4 text-sm font-semibold text-ink shadow-md hover:bg-surface"
          >
            <Images className="size-4" aria-hidden /> Бүх {total} зураг
          </button>
        ) : null}
      </div>
      {open !== null ? <Lightbox photos={photos} title={title} start={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({
  photos,
  title,
  start,
  onClose,
}: {
  photos: string[];
  title: string;
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = React.useState(start);
  const n = photos.length;
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const touchX = React.useRef<number | null>(null);
  const go = React.useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  // Эцэг дахин зурагдахад шинэ функц ирсэн ч эффект дахин ажиллахгүй (фокус үсрэхгүй).
  const closeFn = React.useRef(onClose);
  React.useEffect(() => {
    closeFn.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFn.current();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, [go]);

  const btn =
    "flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — зураг`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = touchX.current;
        const x1 = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40) go(x1 < x0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm tabular-nums" aria-live="polite">
          {i + 1} / {n}
        </span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Хаах" className={btn}>
          <X className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <Image src={photos[i]} alt={`${title} — ${i + 1}-р зураг`} fill sizes="100vw" className="object-contain" priority />
        {n > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Өмнөх зураг" className={cn(btn, "absolute left-3 top-1/2 -translate-y-1/2")}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Дараагийн зураг" className={cn(btn, "absolute right-3 top-1/2 -translate-y-1/2")}>
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {photos.map((src, k) => (
            <button
              key={src + k}
              type="button"
              onClick={() => setI(k)}
              aria-label={`${k + 1}-р зураг`}
              aria-current={k === i ? "true" : undefined}
              className={cn(
                "relative h-14 w-20 shrink-0 overflow-hidden rounded-md opacity-60 transition hover:opacity-100",
                k === i && "opacity-100 ring-2 ring-white"
              )}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

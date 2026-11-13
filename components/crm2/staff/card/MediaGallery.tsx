"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, Star, Video, X } from "lucide-react";

import { trapTab } from "@/components/ui/dialog-focus";
import { mayNotPlay } from "@/lib/crm2/files";

export type GalleryItem = {
  id: string;
  kind: "image" | "video";
  url: string | null;
  external: boolean;
  caption: string | null;
  isCover: boolean;
  mime: string | null;
};

/**
 * Хөрөнгийн зураг, бичлэг (signed URL — хэрэглэгчийн эрхээр). Зургийг томруулж
 * харах (← → товч, Escape). .mov тоглохгүй байж болзошгүй тул татах холбоостой.
 */
export function MediaGallery({ items }: { items: GalleryItem[] }) {
  const images = items.filter((m) => m.kind === "image");
  const videos = items.filter((m) => m.kind === "video");
  const [index, setIndex] = React.useState<number | null>(null);

  return (
    <div className="space-y-4">
      {images.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((m, i) => (
            <li key={m.id} className="relative">
              <button
                type="button"
                onClick={() => m.url && setIndex(i)}
                disabled={!m.url}
                className="group block aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                aria-label={m.caption ? `Зураг: ${m.caption}` : `Зураг ${i + 1}`}
              >
                {m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- хугацаатай signed URL (зураг оновчлолд кэшлэхгүй)
                  <img src={m.url} alt={m.caption ?? ""} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" />
                ) : (
                  <span className="flex size-full items-center justify-center text-subtle">
                    <ImageOff className="size-5" aria-hidden />
                  </span>
                )}
              </button>
              {m.isCover ? (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <Star className="size-3" aria-hidden /> Нүүр
                </span>
              ) : null}
              {m.caption ? <p className="mt-1 truncate text-xs text-muted">{m.caption}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {videos.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id} className="space-y-1">
              {v.external ? (
                <a
                  href={v.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm font-medium text-brand-700 hover:bg-surface-2"
                >
                  <Video className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{v.caption || v.url}</span>
                  <ExternalLink className="ml-auto size-4 shrink-0" aria-hidden />
                </a>
              ) : v.url ? (
                <>
                  <video src={v.url} controls preload="metadata" playsInline className="aspect-video w-full rounded-xl border border-line bg-black" />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="min-w-0 truncate">{v.caption}</span>
                    {mayNotPlay(v.mime) ? (
                      <a href={v.url} download className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:underline">
                        <Download className="size-3.5" aria-hidden /> Тоглохгүй бол татах
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">Бичлэгийг нээх эрхгүй эсвэл файл олдсонгүй.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {index !== null && images[index]?.url ? (
        <Lightbox
          images={images}
          index={index}
          onIndex={setIndex}
          onClose={() => setIndex(null)}
        />
      ) : null}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: GalleryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const n = images.length;
  const prev = React.useCallback(() => onIndex((index - 1 + n) % n), [index, n, onIndex]);
  const next = React.useCallback(() => onIndex((index + 1) % n), [index, n, onIndex]);

  React.useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Tab") trapTab(e, rootRef.current);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  const img = images[index];
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Зураг"
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between p-3 text-sm text-white/80">
        <span className="tabular-nums">
          {index + 1} / {n}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Хаах"
          className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- хугацаатай signed URL */}
        <img src={img.url ?? ""} alt={img.caption ?? ""} className="max-h-full max-w-full object-contain" />
        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Өмнөх"
              className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Дараах"
              className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      {img.caption ? <p className="shrink-0 p-3 text-center text-sm text-white/80">{img.caption}</p> : <div className="h-3" />}
    </div>
  );
}

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Идэвхтэй элементийг мөрийн харагдах хэсэгт оруулах scrollLeft (босоо гүйлгэлтэд хүрэхгүй). */
export function scrollLeftToReveal(
  row: { left: number; right: number; scrollLeft: number },
  item: { left: number; right: number },
  pad = 16
): number {
  if (item.left < row.left) return Math.max(0, row.scrollLeft + item.left - row.left - pad);
  if (item.right > row.right) return row.scrollLeft + item.right - row.right + pad;
  return row.scrollLeft;
}

/**
 * Утсанд хэвтээ гүйлгэдэг таб/цэсний мөр. Дэлгэцэнд багтаагүй тал руу бүдгэрэлт (гүйлгэж болохыг
 * сануулна — scrollbar нуугдсан) ба идэвхтэй (aria-current="page") элементийг харагдах хэсэгт гүйлгэнэ.
 * `fadeFrom` — мөрийн фонтой ижил өнгө (жишээ: from-surface, from-bg).
 */
export function ScrollFadeRow({
  as = "div",
  className,
  fadeFrom = "from-surface",
  scrollKey,
  children,
}: {
  as?: "div" | "ul";
  className?: string;
  fadeFrom?: string;
  /** Өөрчлөгдөхөд идэвхтэй элемент рүү дахин гүйлгэнэ (зам, идэвхтэй таб). */
  scrollKey?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const r = el.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      el.scrollLeft = scrollLeftToReveal({ left: r.left, right: r.right, scrollLeft: el.scrollLeft }, a);
    }
    measure();
  }, [scrollKey, measure]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const Tag = as;
  return (
    <div className="relative min-w-0">
      <Tag
        ref={(node: HTMLElement | null) => {
          ref.current = node;
        }}
        onScroll={measure}
        className={cn("overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      >
        {children}
      </Tag>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r to-transparent transition-opacity",
          fadeFrom,
          edges.start ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent transition-opacity",
          fadeFrom,
          edges.end ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}

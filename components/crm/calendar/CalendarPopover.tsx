"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useMediaQuery, type AnchorRect } from "./use-pointer-gesture";

/**
 * Календарийн popover (Google Calendar маяг): ширээн дээр дарсан зүйлийн хажууд,
 * утсанд доороос гарах хуудас. role=dialog, Escape/гадна дарж хаана, фокусыг
 * дотор нь эргүүлж, хаахад өмнөх элемент рүү буцаана (Modal-ын хэв маяг).
 */
export function CalendarPopover({
  open,
  anchor,
  onClose,
  title,
  hideTitle = false,
  actions,
  width = 400,
  children,
}: {
  open: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  /** Диалогийн нэр (aria-labelledby). */
  title: string;
  /** Гарчгийг зөвхөн дэлгэц уншигчид (дэлгэрэнгүйн цонх өөрийн гарчигтай). */
  hideTitle?: boolean;
  /** Толгойн баруун талын товчнууд (засах, устгах). */
  actions?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const desktop = useMediaQuery("(min-width: 640px)");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Байрлал: зангууны баруун, багтахгүй бол зүүн, үгүй бол голд; босоо тэнхлэгт дэлгэцэнд багтаана.
  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const gap = 8;
      let left: number;
      let top: number;
      if (!anchor) {
        left = (vw - w) / 2;
        top = Math.max(gap, (vh - h) / 3);
      } else {
        if (anchor.right + gap + w <= vw - gap) left = anchor.right + gap;
        else if (anchor.left - gap - w >= gap) left = anchor.left - gap - w;
        else left = (vw - w) / 2;
        top = anchor.top;
      }
      top = Math.min(Math.max(gap, top), Math.max(gap, vh - h - gap));
      left = Math.min(Math.max(gap, left), Math.max(gap, vw - w - gap));
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open, desktop, anchor]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? ref.current;
    first?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const sheet = desktop === false;

  return (
    <div className="fixed inset-0 z-50" data-calendar-popover="">
      <div
        aria-hidden
        className={cn("absolute inset-0 touch-none", sheet ? "bg-black/30" : "bg-transparent")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={sheet ? undefined : { width, top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
        className={cn(
          "absolute flex flex-col bg-surface shadow-xl outline-none",
          sheet
            ? "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : "max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] rounded-2xl border border-line"
        )}
      >
        <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
          <h2 id={titleId} className={cn("min-w-0 flex-1 truncate pl-1 text-sm font-bold text-ink", hideTitle && "sr-only")}>
            {title}
          </h2>
          {hideTitle ? <span className="flex-1" /> : null}
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/drawer";
import { dialogOpener, focusDialogStart, trapTab } from "@/components/ui/dialog-focus";
import { KEYBOARD_OPEN_PX, useKeyboardInset } from "@/lib/crm2/device/viewport";

/**
 * Доороос гарч ирэх хуудас (bottom sheet) — CRM-ийн картын засварын хэсгүүд,
 * гэрээ, агент сонгох г.м.
 *
 * Гар утас (< md): доороос гулсаж гарна, өндөр ≤ 90dvh, дотор нь гүйлгэнэ,
 * бариулаас доош чирж хаана, 44px хаах товч, доод хэсэг (footer) гарны дээр
 * байрлана (useKeyboardInset). Ард талын хуудас гүйлгэгдэхгүй.
 * Том дэлгэц (≥ md): одоо байгаа Drawer-оор харуулна.
 *
 * Хүртээмж: role=dialog + aria-modal, Escape хаана, Tab дотроо эргэлдэнэ,
 * хаахад нээсэн элемент рүү фокус буцна (components/ui/dialog-focus).
 */

const MD_QUERY = "(min-width: 768px)";

/** Media query-г SSR-д найдвартай уншина (сервер дээр false — гар утас эхэлж). */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query]
  );
  return React.useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false
  );
}

/** Доош хэдэн px чирвэл хаах вэ. */
const DRAG_CLOSE_PX = 96;
/** Хурдан шидэлт (px/ms) — богино зайтай ч хаана. */
const DRAG_CLOSE_VELOCITY = 0.6;

export function BottomSheet({
  open,
  onClose,
  title,
  footer,
  children,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Нээхэд фокуслах элемент (эс бөгөөс [data-autofocus], эсвэл хуудас өөрөө). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const desktop = useMediaQuery(MD_QUERY);

  // Том дэлгэц: Drawer өөрөө фокус, Escape, буцаалтыг хийнэ; энд зөвхөн эхний фокус.
  React.useEffect(() => {
    if (!open || !desktop) return;
    initialFocusRef?.current?.focus();
  }, [open, desktop, initialFocusRef]);

  if (desktop) {
    return (
      <Drawer open={open} onClose={onClose} title={title} footer={footer}>
        {children}
      </Drawer>
    );
  }
  if (!open) return null;
  return (
    <MobileSheet onClose={onClose} title={title} footer={footer} initialFocusRef={initialFocusRef}>
      {children}
    </MobileSheet>
  );
}

function MobileSheet({
  onClose,
  title,
  footer,
  children,
  initialFocusRef,
}: {
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const prevFocus = React.useRef<HTMLElement | null>(null);
  const inset = useKeyboardInset();

  // Гулсаж гарах: эхний frame-д доор, дараагийнх нь байрандаа.
  const [entered, setEntered] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);
  const drag = React.useRef<{ id: number; y0: number; t0: number } | null>(null);

  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  React.useEffect(() => {
    const panel = panelRef.current;
    prevFocus.current = dialogOpener(panel);
    if (initialFocusRef?.current && panel?.contains(initialFocusRef.current)) {
      initialFocusRef.current.focus({ preventScroll: true });
    } else {
      focusDialogStart(panel);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") trapTab(e, panelRef.current);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus.current?.isConnected) prevFocus.current.focus({ preventScroll: true });
    };
    // Нээгдэх үед нэг удаа (initialFocusRef нь ref объект — тогтвортой).
  }, [initialFocusRef]);

  // Гар нээгдэж дэлгэц багасахад фокустай талбарыг харагдах хэсэгт авчирна.
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.activeElement;
        if (el instanceof HTMLElement && bodyRef.current?.contains(el)) el.scrollIntoView({ block: "nearest" });
      });
    };
    vv.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", onResize);
    };
  }, []);

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    // Хаах товч дээр дарахад чирэхгүй.
    if ((e.target as Element).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - d.y0));
  }
  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dy = Math.max(0, e.clientY - d.y0);
    const dt = Math.max(1, e.timeStamp - d.t0);
    if (e.type === "pointerup" && (dy > DRAG_CLOSE_PX || (dy > 24 && dy / dt > DRAG_CLOSE_VELOCITY))) {
      onCloseRef.current();
      return;
    }
    setDragY(0);
  }

  const dragging = dragY > 0;
  const keyboardOpen = inset >= KEYBOARD_OPEN_PX;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Хаах"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/30 motion-safe:transition-opacity motion-safe:duration-200",
          entered ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          bottom: inset,
          maxHeight: `calc(90dvh - ${inset}px)`,
          transform: entered ? `translateY(${dragY}px)` : "translateY(100%)",
        }}
        className={cn(
          "absolute inset-x-0 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-xl outline-none",
          !dragging && "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
        )}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex justify-center pt-2" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line pb-1 pl-4 pr-1">
            <h2 id={titleId} className="min-w-0 truncate text-base font-bold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Хаах"
              data-dialog-close
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-line bg-surface px-4 pt-3"
            style={{ paddingBottom: keyboardOpen ? 12 : "max(12px, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        ) : (
          <div aria-hidden style={{ height: keyboardOpen ? 0 : "env(safe-area-inset-bottom)" }} />
        )}
      </div>
    </div>
  );
}

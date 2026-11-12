"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Календарийн чирэлтийн нийтлэг хөдөлгүүр (pointer events, гадны сангүй).
 *
 *  • Хулгана: зүйл дээр 4px-ээс илүү хөдөлбөл чирэлт эхэлнэ (бага бол энгийн click);
 *    хоосон нүдэнд `immediate` — дармагц сонголт эхэлнэ.
 *  • Хуруу: удаан дарж (350мс) байж чирнэ — эс бөгөөс жагсаалт ердийнхөөрөө гүйлгэгдэнэ.
 *    Идэвхтэй үед touchmove-ийг preventDefault хийж гүйлгэхийг зогсооно. Тэр сонсогчийг
 *    mount үед (хуруу хүрэхээс өмнө) passive: false-оор бүртгэнэ — iOS Safari, Chrome
 *    touchstart-ын үед л хаах сонсогч байгаа эсэхийг шийддэг (dnd-kit TouchSensor-тэй ижил).
 *  • Чирсний дараах click-ийг consumeClick()-ээр залгина.
 */

const MOUSE_THRESHOLD_PX = 4;
const TOUCH_SLOP_PX = 8;
const LONG_PRESS_MS = 350;

export type GesturePoint = { x: number; y: number };

export type GestureHandlers = {
  /** Хулганаар дармагц идэвхжүүлэх (хоосон нүдэнд сонголт). */
  immediate?: boolean;
  onActivate?: (p: GesturePoint) => void;
  onMove?: (p: GesturePoint) => void;
  /** activated — чирэлт эхэлсэн эсэх; moved — босгоос илүү хөдөлсөн эсэх. */
  onEnd?: (p: GesturePoint, info: { activated: boolean; moved: boolean; touch: boolean }) => void;
  onCancel?: () => void;
};

type Active = { pointerId: number; cleanup: () => void };

export function usePointerGesture() {
  const active = useRef<Active | null>(null);
  const suppressClick = useRef(false);
  /** Хуруугаар чирэлт идэвхтэй — touchmove-ийн гүйлгэлтийг хаана. */
  const blockScroll = useRef(false);

  useEffect(() => {
    const onTouchMove = (ev: TouchEvent) => {
      if (blockScroll.current && ev.cancelable) ev.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      active.current?.cleanup();
      active.current = null;
    };
  }, []);

  const start = useCallback((e: React.PointerEvent, h: GestureHandlers) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    active.current?.cleanup();
    const touch = e.pointerType !== "mouse";
    const x0 = e.clientX;
    const y0 = e.clientY;
    let x = x0;
    let y = y0;
    let activated = false;
    let moved = false;
    let timer = 0;

    const activate = () => {
      if (activated) return;
      activated = true;
      if (touch) {
        blockScroll.current = true;
        navigator.vibrate?.(8);
      }
      h.onActivate?.({ x, y });
      h.onMove?.({ x, y });
    };

    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("contextmenu", onContextMenu, true);
      blockScroll.current = false;
      if (active.current?.pointerId === e.pointerId) active.current = null;
    };

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      const dist = Math.hypot(x - x0, y - y0);
      if (!activated) {
        if (touch) {
          // Удаан дарахаас өмнө хөдөлбөл гүйлгэлт — чирэлт биш.
          if (dist > TOUCH_SLOP_PX) {
            finish();
            h.onCancel?.();
          }
          return;
        }
        if (dist <= MOUSE_THRESHOLD_PX) return;
        moved = true;
        activate();
        return;
      }
      if (dist > MOUSE_THRESHOLD_PX) moved = true;
      h.onMove?.({ x, y });
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return;
      finish();
      if (activated && (moved || touch)) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      h.onEnd?.({ x, y }, { activated, moved, touch });
    }

    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== e.pointerId) return;
      finish();
      h.onCancel?.();
    }

    function onContextMenu(ev: Event) {
      // Android-д удаан дарахад гарах цэсийг хаана.
      if (touch) ev.preventDefault();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("contextmenu", onContextMenu, true);
    active.current = { pointerId: e.pointerId, cleanup: finish };

    if (touch) timer = window.setTimeout(activate, LONG_PRESS_MS);
    else if (h.immediate) activate();
  }, []);

  /** Чирэлтийн дараах click мөн бол true (тэгээд залгина). */
  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { start, consumeClick };
}

// ── Дэлгэцийн өргөн (SSR-д null) ──────────────────────────

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  };
}

/** matchMedia — серверт болон hydration-д null, дараа нь true/false. */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback((cb: () => void) => subscribeMedia(query)(cb), [query]);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null
  );
}

/** Элементийн DOMRect-ийн энгийн хуулбар (popover-ийн зангуу). */
export type AnchorRect = { top: number; left: number; right: number; bottom: number };

export function rectOf(el: Element | null | undefined): AnchorRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
}

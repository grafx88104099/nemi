/**
 * Гарын (keyboard) нөлөө 375px утсан дээр (mobile_rules).
 * Анхдагч «resizes-visual» горимыг хадгална (interactive-widget НЭМЭХГҮЙ):
 * layout viewport хэвээр, visualViewport багасна → доод inset-ийг өөрсдөө тооцно.
 */

import { useEffect, useSyncExternalStore, type RefObject } from "react";

/** Цэвэр: layout өндөр, visualViewport өндөр ба offsetTop-оос доод inset (px). */
export function keyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number): number {
  const v = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return v > 0 ? v : 0;
}

/** Гар нээлттэй гэж үзэх босго (хаягийн мөр жижгэрэх г.м.-ээс ялгах). */
export const KEYBOARD_OPEN_PX = 120;

function currentInset(): number {
  if (typeof window === "undefined" || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  return keyboardInset(window.innerHeight, vv.height, vv.offsetTop);
}

function subscribe(cb: () => void) {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => undefined;
  vv.addEventListener("resize", cb);
  vv.addEventListener("scroll", cb);
  window.addEventListener("resize", cb);
  return () => {
    vv.removeEventListener("resize", cb);
    vv.removeEventListener("scroll", cb);
    window.removeEventListener("resize", cb);
  };
}

/** Дэлгэцийн доод талаас гарын эзэлсэн өндөр (px); гар хаалттай бол 0. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, currentInset, () => 0);
}

/** Гар нээлттэй эсэх. */
export function useKeyboardOpen(): boolean {
  return useKeyboardInset() >= KEYBOARD_OPEN_PX;
}

function isEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "image", "hidden"].includes(type);
}

/**
 * visualViewport өөрчлөгдсөний дараа (гар нээгдэх) container доторх идэвхтэй талбарыг
 * голд гүйлгэнэ, container-т scroll-padding-bottom = barHeight + inset тавина.
 */
export function useScrollFocusedIntoView(container: RefObject<HTMLElement | null>, barHeight = 64): void {
  const inset = useKeyboardInset();

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    el.style.setProperty("scroll-padding-bottom", `${Math.max(0, barHeight) + inset}px`);
  }, [container, barHeight, inset]);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = container.current;
        const active = document.activeElement;
        if (!root || !isEditable(active) || !root.contains(active)) return;
        active.scrollIntoView({ block: "center" });
      });
    };
    vv.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", onResize);
    };
  }, [container]);
}

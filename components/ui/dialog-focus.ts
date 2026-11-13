/**
 * Modal/Drawer-ийн фокусын туслах (клиент).
 *
 * React нь autoFocus-ийг commit үед (эцэг компонентын эффектээс өмнө) хэрэгжүүлдэг тул
 * диалогийн эффект ажиллах үед document.activeElement аль хэдийн дотор талбар байж болно.
 * Тиймээс нээгчийг (хаахад фокус буцаах элемент) сүүлийн хоёр фокус/дарсан элементээс олно
 * (Safari товчийг дарахад фокуслодоггүй тул pointerdown-ийг мөн тэмдэглэнэ).
 */

const DIALOG_OPENER = "a[href], button, [role=button], [tabindex]";

let last: HTMLElement | null = null;
let prev: HTMLElement | null = null;

function note(el: HTMLElement | null) {
  if (!el || el === last) return;
  prev = last;
  last = el;
}

if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => note(e.target instanceof HTMLElement ? e.target : null), true);
  document.addEventListener(
    "pointerdown",
    (e) => note(e.target instanceof Element ? e.target.closest<HTMLElement>(DIALOG_OPENER) : null),
    true
  );
}

/** Диалогийг нээсэн элемент (диалогийн гадна, DOM-д байгаа) — олдохгүй бол null. */
export function dialogOpener(root: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const outside = (el: HTMLElement | null) => !!el && el.isConnected && el !== document.body && !root?.contains(el);
  if (outside(active)) return active;
  // autoFocus фокусыг дотогш оруулсан (сүүлийн фокус дотор): түүнээс өмнөх нь нээгч.
  if (last && root?.contains(last) && outside(prev)) return prev;
  // Safari: товч дарахад фокуслодоггүй (activeElement = body) — pointerdown-оор тэмдэглэсэн товч.
  if (outside(last)) return last;
  return null;
}

export const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Нээхэд эхний фокус: autoFocus аль хэдийн дотогш оруулсан бол хөндөхгүй; эс бөгөөс
 * [data-autofocus] талбар, байхгүй бол диалог өөрөө (хаах товч дээр биш — гарчгийг уншуулна).
 */
export function focusDialogStart(root: HTMLElement | null): void {
  if (!root || root.contains(document.activeElement)) return;
  (root.querySelector<HTMLElement>("[data-autofocus]") ?? root).focus();
}

/** Tab-ыг диалог дотор эргэлдүүлнэ (диалог өөрөө фокустай үед ч). */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE));
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const lastItem = items[items.length - 1];
  const active = document.activeElement;
  if (active === root || !root.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? lastItem : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    lastItem.focus();
  } else if (!e.shiftKey && active === lastItem) {
    e.preventDefault();
    first.focus();
  }
}

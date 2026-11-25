"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { dialogOpener, focusDialogStart, ownsKeyboard, trapTab } from "./dialog-focus";

/**
 * Баруун талын drawer — Modal-ын хүртээмжийн хэв маягаар (Escape, focus trap,
 * фокус буцаалт), Radix-гүй гар хийц.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const prevFocus = useRef<HTMLElement | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = dialogOpener(panelRef.current);
    focusDialogStart(panelRef.current);

    function onKey(e: KeyboardEvent) {
      // Дээр нь давхарласан диалог (жишээ нь баталгаажуулах цонх) фокустай бол тэр нь шийднэ.
      if (!ownsKeyboard(panelRef.current)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") trapTab(e, panelRef.current);
    }
    document.addEventListener("keydown", onKey);
    // Ард талын хуудас гар утсан дээр гүйлгэгдэхгүй (Modal-тай ижил).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus.current?.isConnected) prevFocus.current.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Хаах"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          // viewportFit "cover" (панель, нийтийн сайт): гарчиг/хаах товч статус мөр, notch-ийн доор орохгүй.
          "relative flex h-full w-full flex-col border-l border-line bg-surface pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] shadow-xl outline-none",
          widthClassName
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 id={titleId} className="text-base font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Хаах"
            data-dialog-close
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Утсанд drawer доторх гар хийцийн талбар ч 16px (iOS Safari фокуслахад томруулахгүй). */}
        <div className="flex-1 overflow-y-auto p-5 max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base">
          {children}
        </div>
        {footer ? <div className="shrink-0 border-t border-line p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

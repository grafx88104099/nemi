"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { KEYBOARD_OPEN_PX, useKeyboardInset } from "@/lib/crm2/device/viewport";
import { SAVE_DRAFT_LABEL } from "@/lib/crm2/labels";

/** Хадгалах мөрийн өндөр (гар хаалттай үед) — маягтын scroll-padding ба доод зайд. */
export const SAVE_BAR_HEIGHT = 96;

/**
 * Шуурхай бүртгэлийн доод хадгалах мөр (утсанд fixed, ≥md-д sticky).
 * - Гарын inset-ээр дээш өргөгдөнө (visualViewport), safe-area-ийн зайтай.
 * - Гар нээлттэй үед зөвхөн товч үлдэнэ (төлвийн мөр нуугдана) — идэвхгүй бол шалтгаан үргэлж харагдана.
 * - Товч бүтэн өргөнтэй, 48px.
 * CRM-ийн доод хурдан цэсийг (z-30) энэ дэлгэцэд халхална (z-40).
 */
export function StickySaveBar({
  onSave,
  disabled,
  busy,
  status,
  hint,
  label = SAVE_DRAFT_LABEL,
}: {
  onSave: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** «Утсан дээр хадгалагдсан 14:05» г.м. (aria-live). */
  status?: React.ReactNode;
  /** Идэвхгүй үеийн тайлбар («Ангиллаа сонгоно уу»). */
  hint?: React.ReactNode;
  label?: string;
}) {
  const inset = useKeyboardInset();
  const keyboardOpen = inset >= KEYBOARD_OPEN_PX;

  return (
    <div
      style={{ bottom: inset }}
      className={cn(
        "fixed inset-x-0 z-40 border-t border-line bg-surface/95 px-4 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur",
        keyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "md:sticky md:inset-x-auto md:mt-4 md:rounded-2xl md:border md:shadow-sm"
      )}
    >
      <div className="mx-auto w-full max-w-2xl space-y-1.5">
        {!keyboardOpen || (disabled && hint) ? (
          <div aria-live="polite" className="min-h-4 text-center text-xs text-muted">
            {disabled && hint ? hint : status}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || busy}
          aria-busy={busy || undefined}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-base font-semibold text-on-primary shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-soft disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Save className="size-5" aria-hidden />}
          {busy ? "Хадгалж байна…" : label}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Нийтлэг toast мэдэгдэл (UX-7): амжилт, алдаа, мэдээлэл + сонголттой үйлдэл
 * (жишээ нь «Буцаах»). Ашиглах:
 *
 *   import { toast } from "@/components/ui/toast";
 *   toast.success("Хадгаллаа");
 *   toast.error("Хадгалж чадсангүй. Дахин оролдоно уу.");
 *   toast("Ангилал өөрчлөгдлөө", { action: { label: "Буцаах", onClick: undo } });
 *
 * <Toaster /> layout-д суулгах шаардлагагүй: анхны дуудлагаар өөрөө
 * document.body-д суурилна. Layout-д <Toaster /> суулгавал түүнийг ашиглана.
 */

export type ToastKind = "success" | "error" | "info";

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  kind?: ToastKind;
  /** Нэмэлт тайлбар мөр. */
  description?: string;
  /** Нэг товчтой үйлдэл (Буцаах г.м.). */
  action?: ToastAction;
  /** Харагдах хугацаа (мс). Алдаа илүү удаан. 0 = гараар хаах хүртэл. */
  durationMs?: number;
};

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  description?: string;
  action?: ToastAction;
  durationMs: number;
};

const DEFAULT_DURATION: Record<ToastKind, number> = { success: 4000, info: 5000, error: 7000 };
const MAX_VISIBLE = 3;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

// Layout-д гараар суулгасан Toaster-ийн тоо — байвал автомат root юу ч зурахгүй.
let manualToasters = 0;
let autoRootCreated = false;
const manualListeners = new Set<() => void>();

function ensureMounted() {
  if (typeof document === "undefined" || autoRootCreated) return;
  autoRootCreated = true;
  const el = document.createElement("div");
  el.setAttribute("data-nemi-toaster", "");
  document.body.appendChild(el);
  createRoot(el).render(<Toaster auto />);
}

function push(message: string, opts: ToastOptions = {}): number {
  const kind = opts.kind ?? "info";
  const id = nextId++;
  items = [
    ...items,
    {
      id,
      kind,
      message,
      description: opts.description,
      action: opts.action,
      durationMs: opts.durationMs ?? DEFAULT_DURATION[kind],
    },
  ].slice(-MAX_VISIBLE);
  emit();
  ensureMounted();
  return id;
}

type ToastFn = ((message: string, opts?: ToastOptions) => number) & {
  success: (message: string, opts?: Omit<ToastOptions, "kind">) => number;
  error: (message: string, opts?: Omit<ToastOptions, "kind">) => number;
  info: (message: string, opts?: Omit<ToastOptions, "kind">) => number;
  dismiss: (id: number) => void;
};

export const toast: ToastFn = Object.assign((message: string, opts?: ToastOptions) => push(message, opts), {
  success: (message: string, opts?: Omit<ToastOptions, "kind">) => push(message, { ...opts, kind: "success" }),
  error: (message: string, opts?: Omit<ToastOptions, "kind">) => push(message, { ...opts, kind: "error" }),
  info: (message: string, opts?: Omit<ToastOptions, "kind">) => push(message, { ...opts, kind: "info" }),
  dismiss,
});

const ICON: Record<ToastKind, typeof Info> = { success: CheckCircle2, error: CircleAlert, info: Info };
const ICON_TONE: Record<ToastKind, string> = {
  success: "text-emerald-600",
  error: "text-danger",
  info: "text-brand-600",
};

function ToastCard({ t }: { t: ToastItem }) {
  useEffect(() => {
    if (t.durationMs <= 0) return;
    const timer = window.setTimeout(() => dismiss(t.id), t.durationMs);
    return () => window.clearTimeout(timer);
  }, [t.id, t.durationMs]);

  const Icon = ICON[t.kind];
  return (
    <div
      role={t.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg"
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", ICON_TONE[t.kind])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t.message}</p>
        {t.description ? <p className="mt-0.5 text-xs text-muted">{t.description}</p> : null}
      </div>
      {t.action ? (
        <button
          type="button"
          onClick={() => {
            t.action?.onClick();
            dismiss(t.id);
          }}
          className="min-h-9 shrink-0 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {t.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Хаах"
        className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Toast-уудын байршил. Утсан дээр доод төвд, ширээн дээр баруун доод буланд. */
export function Toaster({ auto = false }: { auto?: boolean }) {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY
  );
  const manualCount = useSyncExternalStore(
    (l) => {
      manualListeners.add(l);
      return () => {
        manualListeners.delete(l);
      };
    },
    () => manualToasters,
    () => 0
  );

  useEffect(() => {
    if (auto) return;
    manualToasters += 1;
    for (const l of manualListeners) l();
    return () => {
      manualToasters -= 1;
      for (const l of manualListeners) l();
    };
  }, [auto]);

  if (auto && manualCount > 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:items-end sm:px-0 sm:pb-0"
    >
      {list.map((t) => (
        <ToastCard key={t.id} t={t} />
      ))}
    </div>
  );
}

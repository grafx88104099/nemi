"use client";

import * as React from "react";
import { Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { KEYBOARD_OPEN_PX, useKeyboardInset } from "@/lib/crm2/device/viewport";

/**
 * «Буцаах» мэдэгдэл (snackbar) — жишээ нь ноорог устгасны дараа 8 секунд.
 *
 * - aria-live="polite" бүс үргэлж DOM-д байна (агуулга солигдоход уншигдана).
 * - Хугацаа дуусахад onExpire нэг удаа; «Буцаах» дарвал onUndo, onExpire дуудагдахгүй.
 * - Хулгана дээр нь байх эсвэл фокус дотор нь байх үед тоолуур зогсоно (хугацааг
 *   хэрэглэгч сунгах боломжтой).
 * - Гарны дээр, safe-area-аас дээш байрлана.
 *
 * Шинэ зүйлд дахин эхлүүлэхдээ эцэг нь `key` өөрчилнө (эсвэл open-ийг false → true).
 */

export const UNDO_SNACKBAR_MS = 8000;

/** Үлдсэн секунд (дээш тоймлосон, 0-ээс бага биш). */
export function undoSecondsLeft(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function UndoSnackbar({
  open,
  message,
  onUndo,
  onExpire,
  durationMs = UNDO_SNACKBAR_MS,
  undoLabel = "Буцаах",
}: {
  open: boolean;
  message: string;
  onUndo: () => void;
  /** Буцаалгүй хугацаа дуусахад (эцсийн устгал г.м.). */
  onExpire?: () => void;
  durationMs?: number;
  undoLabel?: string;
}) {
  const inset = useKeyboardInset();
  const [remaining, setRemaining] = React.useState(durationMs);
  const [paused, setPaused] = React.useState(false);

  const onExpireRef = React.useRef(onExpire);
  const onUndoRef = React.useRef(onUndo);
  React.useEffect(() => {
    onExpireRef.current = onExpire;
    onUndoRef.current = onUndo;
  }, [onExpire, onUndo]);

  // open солигдоход тоолуурыг шинээр эхлүүлнэ (render үеийн төлөв тохируулга).
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setRemaining(durationMs);
    setPaused(false);
  }

  const done = React.useRef(false);
  React.useEffect(() => {
    if (open) done.current = false;
  }, [open]);

  React.useEffect(() => {
    if (!open || paused || done.current) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setRemaining((r) => Math.max(0, r - dt));
    }, 250);
    return () => window.clearInterval(id);
  }, [open, paused]);

  React.useEffect(() => {
    if (!open || remaining > 0 || done.current) return;
    done.current = true;
    onExpireRef.current?.();
  }, [open, remaining]);

  function undo() {
    if (done.current) return;
    done.current = true;
    onUndoRef.current();
  }

  const visible = open && remaining > 0;
  const seconds = undoSecondsLeft(remaining);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{ bottom: inset >= KEYBOARD_OPEN_PX ? inset + 8 : "max(16px, calc(env(safe-area-inset-bottom) + 12px))" }}
    >
      {visible ? (
        <div
          className="pointer-events-auto relative flex w-full max-w-md items-center gap-2 overflow-hidden rounded-xl bg-ink py-1.5 pl-4 pr-1.5 text-sm text-white shadow-lg"
          onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
          }}
        >
          <p className="min-w-0 flex-1 py-2">{message}</p>
          <span className="shrink-0 tabular-nums text-white/70" aria-hidden>
            {seconds} с
          </span>
          <button
            type="button"
            onClick={undo}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold text-brand-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Undo2 className="size-4" aria-hidden />
            {undoLabel}
          </button>
          <span
            aria-hidden
            className={cn("absolute bottom-0 left-0 h-0.5 bg-brand-500", !paused && "motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-linear")}
            style={{ width: `${(remaining / durationMs) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

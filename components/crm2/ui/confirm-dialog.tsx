"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Баталгаажуулах цонх (window.confirm-ийн оронд), components/ui/modal дээр.
 * onConfirm нь Promise буцааж болно: алдааны текст (string) буцаавал цонх
 * хаагдахгүй, алдааг доор нь харуулна; эс бөгөөс хаагдана.
 *
 *   <ConfirmDialog
 *     open={open} onClose={() => setOpen(false)}
 *     title="Илгээх үү?" description="Илгээсний дараа агуулгыг засахгүй."
 *     confirmLabel="Илгээх"
 *     onConfirm={async () => { const r = await submitBrokerage(id); return r.ok ? null : r.error; }}
 *   />
 */
export type ConfirmResult = void | null | undefined | string;

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel = "Тийм",
  cancelLabel = "Болих",
  tone = "primary",
  onConfirm,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => ConfirmResult | Promise<ConfirmResult>;
  disabled?: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Дахин нээхэд өмнөх алдааг цэвэрлэнэ.
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError(null);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const res = await onConfirm();
      if (typeof res === "string" && res) setError(res);
      else onClose();
    } catch (e) {
      console.error("ConfirmDialog:", e);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      closeOnBackdrop={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} disabled={pending || disabled}>
            {pending ? "Түр хүлээнэ үү…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-4 text-sm text-ink">
        {description ? <div className="text-muted">{description}</div> : null}
        {children}
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

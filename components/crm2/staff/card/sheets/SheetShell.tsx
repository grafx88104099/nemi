"use client";

import * as React from "react";
import { History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import { fmtTime } from "@/lib/format";

import { sheetFieldId, sheetFieldKey } from "./sheet-model";

/** Цонх доторх талбарыг (checklist-ийн target.field, DB алдааны талбар) фокуслана. */
export function focusSheetField(field: string | null | undefined) {
  if (!field || typeof window === "undefined") return;
  const id = sheetFieldId(sheetFieldKey(field));
  // BottomSheet өөрийн эхний фокусыг тавьсны дараа.
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const target = el.matches("input, textarea, select, button, [tabindex]") ? el : el.querySelector<HTMLElement>("input, textarea, select, button");
    (target ?? el).focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
  }, 160);
}

/**
 * Картын засварын цонхны нийтлэг хүрээ: BottomSheet (утсанд ≤90dvh, footer гарны дээр; том дэлгэцэнд
 * Drawer), автомат хадгалалтын төлөв, сэргээсэн нооргийн мэдэгдэл, алдаа, «Хадгалах» (≥48px).
 */
export function SheetShell({
  title,
  onClose,
  onSave,
  saving = false,
  ready = true,
  dirty = false,
  error,
  savedAt,
  draftError,
  restoredAt,
  onDropRestored,
  saveLabel = "Хадгалах",
  closeLabel,
  focusField,
  footerExtra,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Байхгүй бол зөвхөн «Хаах» (харах/зураг цонх). */
  onSave?: () => void;
  saving?: boolean;
  /** Ноорог ачаалагдсан (тэр хүртэл оруулга идэвхгүй). */
  ready?: boolean;
  dirty?: boolean;
  error?: string | null;
  savedAt?: number | null;
  draftError?: boolean;
  /** Хадгалаагүй өөрчлөлт утсан дээрээс сэргээгдсэн цаг. */
  restoredAt?: number | null;
  /** Сэргээсэн өөрчлөлтийг хаях (серверийн утгаар эхлэх). */
  onDropRestored?: () => void;
  saveLabel?: string;
  closeLabel?: string;
  /** Нээхэд фокуслах талбар. */
  focusField?: string | null;
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!ready || focused.current || !focusField) return;
    focused.current = true;
    focusSheetField(focusField);
  }, [ready, focusField]);

  const status = savedAt && dirty ? `Утсан дээр хадгалагдсан ${fmtTime(savedAt)}` : null;

  const footer = (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {status || draftError ? (
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {draftError ? "Утсан дээр хадгалж чадсангүй — «Хадгалах» дарж шууд илгээнэ үү." : status}
        </p>
      ) : null}
      {footerExtra}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="lg" className="shrink-0 px-4" onClick={onClose} disabled={saving}>
          {closeLabel ?? (onSave ? "Болих" : "Хаах")}
        </Button>
        {onSave ? (
          <Button type="button" size="lg" className="min-w-0 flex-1" onClick={onSave} disabled={saving || !ready}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? "Хадгалж байна…" : saveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <BottomSheet open onClose={saving ? () => undefined : onClose} title={title} footer={footer}>
      <div
        aria-busy={!ready || saving}
        className="min-w-0 space-y-4 max-sm:[&_input]:text-base max-sm:[&_select]:text-base max-sm:[&_textarea]:text-base"
      >
        {restoredAt ? (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <History className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Хадгалаагүй өөрчлөлт сэргээгдлээ ({fmtTime(restoredAt)}).</span>
            {onDropRestored ? (
              <Button type="button" size="touch" variant="ghost" onClick={onDropRestored}>
                Хаях
              </Button>
            ) : null}
          </div>
        ) : null}
        {!ready ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Ноорог шалгаж байна…
          </p>
        ) : null}
        {children}
      </div>
    </BottomSheet>
  );
}

/** Сүлжээгүй үед хадгалж чадаагүй — ноорог утсан дээр үлдсэн. */
export const OFFLINE_SAVE_TEXT = "Сүлжээ алга — өөрчлөлт утсан дээр хадгалагдсан. Сүлжээ орвол дахин «Хадгалах» дарна уу.";


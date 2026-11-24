"use client";

import * as React from "react";
import { ChevronDown, FileClock, Images, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DraftIndexEntry } from "@/lib/crm2/device/draft-store";
import { fmtShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * «Дуусаагүй ноорог (N)» — энэ утсан дээрх бусад ноорог (зөвхөн цаг, төсөл/дүүрэг, зургийн тоо;
 * эзний мэдээлэл хэзээ ч үгүй). «Үргэлжлүүлэх» тэр ноорог руу шилжинэ, «Устгах» 8 секундийн буцаалттай.
 */
export function DraftList({
  drafts,
  disabled,
  onContinue,
  onDiscard,
}: {
  drafts: DraftIndexEntry[];
  disabled?: boolean;
  onContinue: (clientKey: string) => void;
  onDiscard: (clientKey: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  if (!drafts.length) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-sm font-semibold text-ink"
      >
        <span className="flex items-center gap-2">
          <FileClock className="size-4 text-brand-600" aria-hidden />
          Дуусаагүй ноорог ({drafts.length})
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="divide-y divide-line border-t border-line">
          {drafts.map((d) => (
            <li key={d.clientKey} className="flex items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{d.titleHint || "Нэргүй ноорог"}</p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span>{fmtShortDateTime(d.savedAt)}</span>
                  {d.photoCount ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Images className="size-3" aria-hidden />
                      {d.photoCount}
                    </span>
                  ) : null}
                  {d.status === "queued" ? <span className="font-semibold text-amber-800">илгээхийг хүлээж байна</span> : null}
                </p>
              </div>
              <Button type="button" size="touch" variant="secondary" disabled={disabled} onClick={() => onContinue(d.clientKey)}>
                Үргэлжлүүлэх
              </Button>
              {d.status !== "queued" ? (
                <button
                  type="button"
                  aria-label="Ноорог устгах"
                  title="Ноорог устгах"
                  disabled={disabled}
                  onClick={() => onDiscard(d.clientKey)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

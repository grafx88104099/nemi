"use client";

import * as React from "react";
import { Camera, FileText, FolderOpen, Loader2, Lock, RotateCcw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DOC_ACCEPT, fmtFileSize } from "@/lib/crm2/files";
import { BROKERAGE_FILE_KIND_LABEL, type Crm2BrokerageFileKindKey } from "@/lib/crm2/labels";
import type { BrokerageItem } from "@/lib/crm2/queries/properties";
import type { QueueItem } from "@/lib/crm2/device/upload-queue";

import { MissingList, SectionTitle } from "./parts";

export const FILE_AT_OFFICE_HINT = "Файл хавсаргатал батлуулахаар илгээх боломжгүй";

const QUEUE_STATUS_TEXT: Record<QueueItem["status"], string> = {
  queued: "хүлээгдэж байна",
  waiting_property: "хүлээгдэж байна",
  waiting_wifi: "Wi-Fi хүлээж байна",
  uploading: "хуулж байна",
  done: "хуулагдсан",
  failed: "хуулагдсангүй",
};

/** Алхам 2 «Батлуулахаар илгээх»: файл, өмчлөлийн баримт, «гэрээ оффист үлдсэн», дутуу жагсаалт. */
export function ContractFilesStep({
  contract,
  uploads,
  canRestricted,
  fileAtOffice,
  onFileAtOffice,
  missing,
  onOpenPages,
  onPickFiles,
  onRetry,
  onRemove,
  disabled,
}: {
  contract: BrokerageItem;
  uploads: { items: QueueItem[]; uploading: boolean; failed: QueueItem[] };
  /** null = шалгаж байна. */
  canRestricted: boolean | null;
  fileAtOffice: boolean;
  onFileAtOffice: (v: boolean) => void;
  missing: string[];
  onOpenPages: () => void;
  onPickFiles: (kind: Crm2BrokerageFileKindKey, files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const ownRef = React.useRef<HTMLInputElement>(null);
  const ids = React.useId();

  function pick(kind: Crm2BrokerageFileKindKey, ref: React.RefObject<HTMLInputElement | null>) {
    const list = Array.from(ref.current?.files ?? []);
    if (ref.current) ref.current.value = "";
    if (list.length) onPickFiles(kind, list);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Гэрээний файл">
        <SectionTitle>Гэрээний файл</SectionTitle>
        <input
          ref={fileRef}
          type="file"
          accept={DOC_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={() => pick("contract", fileRef)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={onOpenPages}>
            <Camera className="size-5" aria-hidden /> Гэрээний зураг авах
          </Button>
          <Button type="button" size="lg" variant="outline" className="w-full" disabled={disabled} onClick={() => fileRef.current?.click()}>
            <FolderOpen className="size-5" aria-hidden /> Файл/галерей
          </Button>
        </div>

        {contract.files.length ? (
          <ul className="space-y-1" aria-label="Хавсаргасан файл">
            {contract.files.map((f) => {
              const kind = (f.kind ?? "contract") as Crm2BrokerageFileKindKey;
              const restricted = kind === "ownership" || kind === "id";
              return (
                <li key={f.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                  {restricted ? <Lock className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-brand-700 hover:underline">
                      {f.file_name || BROKERAGE_FILE_KIND_LABEL[kind]}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-muted">{f.file_name || BROKERAGE_FILE_KIND_LABEL[kind]}</span>
                  )}
                  <span className="shrink-0 rounded-md bg-surface-2 px-1.5 text-xs text-muted">{BROKERAGE_FILE_KIND_LABEL[kind]}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{fmtFileSize(f.size_bytes)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Файл хавсаргаагүй.</p>
        )}

        {uploads.items.length ? (
          <div role="status" aria-live="polite" className="space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {uploads.uploading ? (
              <p className="flex items-center gap-2 font-semibold">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Гэрээ илгээгдэж байна
              </p>
            ) : null}
            <ul className="space-y-1">
              {uploads.items.map((i) => (
                <li key={i.id} className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {i.name} · {QUEUE_STATUS_TEXT[i.status]}
                  </span>
                  {i.status === "failed" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRetry(i.id)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-sky-900 hover:bg-sky-100"
                      >
                        <RotateCcw className="size-4" aria-hidden /> Дахин оролдох
                      </button>
                      <button
                        type="button"
                        aria-label={`${i.name} хасах`}
                        onClick={() => onRemove(i.id)}
                        className="flex size-11 items-center justify-center rounded-lg hover:bg-sky-100"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {canRestricted ? (
        <section className="space-y-2" aria-label="Өмчлөлийн баримт">
          <input
            ref={ownRef}
            type="file"
            accept={DOC_ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={() => pick("ownership", ownRef)}
          />
          <Button type="button" size="lg" variant="outline" className="w-full" disabled={disabled} onClick={() => ownRef.current?.click()}>
            <ShieldCheck className="size-5" aria-hidden /> Өмчлөлийн баримт нэмэх
          </Button>
          <p className="text-xs text-muted">Зөвхөн хариуцагч, батлагч, менежерт харагдана.</p>
        </section>
      ) : null}

      <section className="space-y-1" aria-label="Гэрээ оффист">
        <label htmlFor={`${ids}-office`} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
          <input
            id={`${ids}-office`}
            type="checkbox"
            className="size-5 accent-brand-500"
            checked={fileAtOffice}
            disabled={disabled}
            aria-describedby={`${ids}-office-hint`}
            onChange={(e) => onFileAtOffice(e.target.checked)}
          />
          Гэрээ оффист үлдсэн
        </label>
        <p id={`${ids}-office-hint`} className="text-xs text-muted">
          Зөвхөн сануулга. {FILE_AT_OFFICE_HINT}.
        </p>
      </section>

      <MissingList items={missing} title="Илгээхэд дутуу:" />
    </div>
  );
}

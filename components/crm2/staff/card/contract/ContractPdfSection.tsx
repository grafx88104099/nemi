"use client";

import * as React from "react";
import { Camera, FileText, FolderOpen, ImageOff, Loader2, Lock, Paperclip, RotateCcw, ShieldCheck, Trash2, WifiOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/crm2/device/network";
import { CONTRACT_PDF_ACCEPT, DOC_ACCEPT, fmtFileSize } from "@/lib/crm2/files";
import { BROKERAGE_FILE_KIND_LABEL, type Crm2BrokerageFileKindKey } from "@/lib/crm2/labels";
import type { BrokerageFileItem } from "@/lib/crm2/queries/properties";
import type { QueueItem } from "@/lib/crm2/device/upload-queue";

import { SectionTitle } from "./parts";

const QUEUE_STATUS_TEXT: Record<QueueItem["status"], string> = {
  queued: "хүлээгдэж байна",
  waiting_property: "хүлээгдэж байна",
  waiting_wifi: "Wi-Fi хүлээж байна",
  uploading: "хуулж байна",
  done: "хуулагдсан",
  failed: "хуулагдсангүй",
};

export const STAMP_LABEL = "PMC-ийн тамга, гарын үсэгтэй";
export const STAMP_HINT = "Тамга, гарын үсэг тод харагдаж байгааг шалгасан";

type Uploads = { items: QueueItem[]; uploading: boolean; failed: QueueItem[] };

function fileName(f: BrokerageFileItem): string {
  const kind = (f.kind ?? "contract") as Crm2BrokerageFileKindKey;
  return f.file_name || BROKERAGE_FILE_KIND_LABEL[kind] || "Файл";
}

/**
 * Гэрээний PDF хэсэг: скан (нэг PDF) эсвэл PDF файл, хавсаргасан PDF-ийн мөр (нээх, хэмжээ, «Солих»),
 * «PMC-ийн тамга, гарын үсэгтэй» тэмдэглэгээ, хуучин зураг гэрээний анхааруулга (устгах), нэмэлт баримт.
 */
export function ContractPdfSection({
  pdf,
  legacy,
  extras,
  uploads,
  editable,
  canRestricted,
  extrasOpen,
  stampConfirmed,
  stampErrorId,
  onStamp,
  onScan,
  onPickPdf,
  onReplace,
  onDeleteFile,
  onPickExtras,
  onRetry,
  onRemove,
  disabled,
}: {
  pdf: BrokerageFileItem | null;
  /** kind='contract' боловч PDF биш (хуучин зураг). */
  legacy: BrokerageFileItem[];
  /** Өмчлөл, иргэний үнэмлэх, бусад (RLS-ээр харагдсан). */
  extras: BrokerageFileItem[];
  uploads: Uploads;
  editable: boolean;
  /** Өмчлөлийн баримт хавсаргах эрх; null = шалгаж байна. */
  canRestricted: boolean | null;
  /** «Нэмэлт баримт»-ыг нээх (тохиргоогоор заавал, дутуу үед) — анх нэг удаа; дараа нь хаахгүй. */
  extrasOpen: boolean;
  stampConfirmed: boolean;
  /** Бүртгэх RPC тамганы тэмдэглэгээг татгалзсан бол алдааны мөрийн id (aria-invalid + describedby). */
  stampErrorId?: string;
  onStamp: (v: boolean) => void;
  onScan: () => void;
  onPickPdf: (file: File) => void;
  onReplace: () => void;
  onDeleteFile: (f: BrokerageFileItem) => void;
  onPickExtras: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const pdfRef = React.useRef<HTMLInputElement>(null);
  const extraRef = React.useRef<HTMLInputElement>(null);
  const ids = React.useId();
  const contractQueue = uploads.items.filter((i) => i.target.kind === "brokerage" && i.target.fileKind === "contract");
  const extraQueue = uploads.items.filter((i) => !contractQueue.includes(i));
  const pdfUploading = contractQueue.some((i) => i.status !== "failed");
  const showPickers = editable && !pdf && !pdfUploading;
  const showExtras = !!canRestricted || extras.length > 0;

  // «Нэмэлт баримт»: заавал болсон анхны удаад л нээнэ (дараа нь агент өөрөө) — баримт хуулагдаж
  // шаардлага биелэхэд хураагдаж, хуулсан файл «алга болсон» мэт харагдахгүй.
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (!extrasOpen || !showExtras || autoOpened.current || !detailsRef.current) return;
    detailsRef.current.open = true;
    autoOpened.current = true;
  }, [extrasOpen, showExtras]);

  function pickPdf() {
    const file = pdfRef.current?.files?.[0] ?? null;
    if (pdfRef.current) pdfRef.current.value = "";
    if (file) onPickPdf(file);
  }

  function pickExtras() {
    const list = Array.from(extraRef.current?.files ?? []);
    if (extraRef.current) extraRef.current.value = "";
    if (list.length) onPickExtras(list);
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label="Гэрээний PDF">
        <div className="space-y-0.5">
          <SectionTitle>Гэрээний PDF</SectionTitle>
          <p className="text-xs text-muted">PMC-ийн тамга, гарын үсэгтэй, бүх хуудас нь нэг PDF-д. Зураг гэрээ гэж тооцогдохгүй.</p>
        </div>

        {pdf ? (
          <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-sm">
            <FileText className="size-4 shrink-0 text-emerald-700" aria-hidden />
            {pdf.url ? (
              <a
                href={pdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="-my-1.5 flex min-h-11 min-w-0 flex-1 items-center font-medium text-brand-700 hover:underline"
              >
                <span className="min-w-0 truncate">{fileName(pdf)}</span>
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-ink">{fileName(pdf)}</span>
            )}
            <span className="shrink-0 text-xs text-muted">{fmtFileSize(pdf.size_bytes)}</span>
            {editable ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onReplace}
                className="-my-1 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                Солих
              </button>
            ) : null}
          </div>
        ) : null}

        <input
          ref={pdfRef}
          type="file"
          accept={CONTRACT_PDF_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={pickPdf}
        />
        {showPickers ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" size="md" className="w-full" disabled={disabled} onClick={onScan}>
              <Camera className="size-5" aria-hidden /> Гэрээ скан хийх
            </Button>
            <Button
              type="button"
              size="md"
              variant="outline"
              className="w-full"
              disabled={disabled}
              onClick={() => pdfRef.current?.click()}
            >
              <FolderOpen className="size-5" aria-hidden /> PDF файл сонгох
            </Button>
          </div>
        ) : null}
        {!pdf && !editable ? <p className="text-sm text-muted">PDF хавсаргаагүй.</p> : null}

        <QueueList items={contractQueue} title="Гэрээ хуулагдаж байна" onRetry={onRetry} onRemove={onRemove} />

        {legacy.length ? (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="flex items-start gap-2 font-semibold">
              <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0">Зураг — гэрээ гэж тооцогдохгүй. Гэрээг PDF-ээр оруулаад зургийг устгана уу.</span>
            </p>
            <ul className="space-y-1">
              {legacy.map((f) => (
                <li key={f.id} className="flex min-h-11 min-w-0 items-center gap-2">
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 min-w-0 flex-1 items-center underline"
                    >
                      <span className="min-w-0 truncate">{fileName(f)}</span>
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{fileName(f)}</span>
                  )}
                  <span className="shrink-0 text-xs">{fmtFileSize(f.size_bytes)}</span>
                  {editable ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onDeleteFile(f)}
                      aria-label={`${fileName(f)} устгах`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-0.5">
          <label
            htmlFor={`${ids}-stamp`}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold",
              stampConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-line text-ink",
              (!pdf || !editable) && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              id={`${ids}-stamp`}
              type="checkbox"
              className="size-5 shrink-0 accent-brand-500"
              checked={stampConfirmed}
              disabled={disabled || !pdf || !editable}
              aria-invalid={stampErrorId ? true : undefined}
              aria-describedby={stampErrorId ? `${ids}-stamp-hint ${stampErrorId}` : `${ids}-stamp-hint`}
              onChange={(e) => onStamp(e.target.checked)}
            />
            <span className="min-w-0">{STAMP_LABEL}</span>
          </label>
          <p id={`${ids}-stamp-hint`} className="px-1 text-xs text-muted">
            {pdf ? STAMP_HINT : "PDF хавсаргасны дараа тэмдэглэнэ."}
          </p>
        </div>
      </section>

      {showExtras ? (
        <details ref={detailsRef} className="group rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold text-ink">
            <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">Нэмэлт баримт (заавал биш){extras.length ? ` · ${extras.length}` : ""}</span>
          </summary>
          <div className="space-y-2 border-t border-line px-3 py-3">
            {extras.length ? (
              <ul className="space-y-1" aria-label="Нэмэлт баримт">
                {extras.map((f) => {
                  const kind = (f.kind ?? "other") as Crm2BrokerageFileKindKey;
                  const restricted = kind === "ownership" || kind === "id";
                  return (
                    <li key={f.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                      {restricted ? (
                        <Lock className="size-4 shrink-0 text-muted" aria-hidden />
                      ) : (
                        <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                      )}
                      {f.url ? (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-11 min-w-0 flex-1 items-center font-medium text-brand-700 hover:underline"
                        >
                          <span className="min-w-0 truncate">{fileName(f)}</span>
                        </a>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-muted">{fileName(f)}</span>
                      )}
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 text-xs text-muted">{BROKERAGE_FILE_KIND_LABEL[kind] ?? kind}</span>
                      {editable ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDeleteFile(f)}
                          aria-label={`${fileName(f)} устгах`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <QueueList items={extraQueue} title="Баримт хуулагдаж байна" onRetry={onRetry} onRemove={onRemove} />
            {canRestricted && editable ? (
              <>
                <input
                  ref={extraRef}
                  type="file"
                  accept={DOC_ACCEPT}
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={pickExtras}
                />
                <Button type="button" size="touch" variant="outline" className="w-full" disabled={disabled} onClick={() => extraRef.current?.click()}>
                  <ShieldCheck className="size-4" aria-hidden /> Өмчлөлийн баримт нэмэх
                </Button>
                <p className="text-xs text-muted">PDF эсвэл зураг. Зөвхөн хариуцагч, батлагч, менежерт харагдана.</p>
              </>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function QueueList({
  items,
  title,
  onRetry,
  onRemove,
}: {
  items: QueueItem[];
  title: string;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const online = useOnline();
  if (!items.length) return null;
  const busy = items.some((i) => i.status !== "failed");
  return (
    <div role="status" aria-live="polite" className="space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      {busy ? (
        <p className="flex items-center gap-2 font-semibold">
          {online ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> {title}…
            </>
          ) : (
            <>
              {/* Сүлжээгүй: утсан дээр хадгалагдсан, холбогдмогц дараалал өөрөө хуулна. */}
              <WifiOff className="size-4 shrink-0" aria-hidden /> Интернэт холбогдмогц хуулагдана
            </>
          )}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2">
              <span className="min-w-0 flex-1 truncate">
                {i.name} · {QUEUE_STATUS_TEXT[i.status]}
              </span>
              {i.status === "failed" ? (
                <span className="flex shrink-0 items-center">
                  {/* Дахин оролдоход засрахгүй алдаа (PDF биш, хэт том, нэг PDF) — зөвхөн «хасах». */}
                  {i.permanent ? null : (
                    <button
                      type="button"
                      onClick={() => onRetry(i.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-sky-900 hover:bg-sky-100"
                    >
                      <RotateCcw className="size-4" aria-hidden /> Дахин оролдох
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${i.name} хасах`}
                    onClick={() => onRemove(i.id)}
                    className="flex size-11 items-center justify-center rounded-lg hover:bg-sky-100"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              ) : null}
            </div>
            {i.status === "failed" && i.error ? <p className="break-words text-xs text-rose-700">{i.error}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

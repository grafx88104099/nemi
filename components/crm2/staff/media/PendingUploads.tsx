"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CloudUpload, FileText, Film, ImageIcon, Loader2, RotateCcw, Send, Trash2, WifiOff } from "lucide-react";

import { ConfirmDialog } from "@/components/crm2/ui";
import { buttonClasses } from "@/components/ui/button";
import { useOnline } from "@/lib/crm2/device/network";
import { UPLOAD_FAILED_TEXT, useNetKind, useUploadQueue, type NetKind, type QueueItem } from "@/lib/crm2/device/upload-queue";
import { fmtFileSize } from "@/lib/crm2/files";
import { cn } from "@/lib/utils";

// ── Цэвэр туслахууд (тестлэгдэнэ) ────────────────────────────────────────────

type ItemLike = Pick<QueueItem, "status" | "attempts" | "error" | "isVideo" | "type" | "target">;

/** net — одоогийн сүлжээ: iPhone-д тодорхойгүй тул «Wi-Fi хүлээж байна» гэж худал хэлэхгүй. */
export function queueStatusText(item: ItemLike, net: NetKind = "cellular"): string {
  switch (item.status) {
    case "queued":
      return item.attempts > 0 ? "Дахин оролдоно…" : "Дараалалд";
    case "waiting_property":
      return "Хөрөнгө хадгалагдахыг хүлээж байна";
    case "waiting_wifi":
      return net === "unknown" ? "Сүлжээг тодорхойлж чадсангүй — одоо илгээх үү?" : "Wi-Fi холбогдтол хүлээж байна";
    case "uploading":
      return "Хуулж байна…";
    case "failed":
      return item.error || UPLOAD_FAILED_TEXT;
    case "done":
      return "Хуулагдсан";
  }
}

/** Хүлээж буй бичлэгийн товч: «Одоо илгээх (25.3 МБ)» — мобайл дата зарцуулахыг хэмжээгээр нь харуулна. */
export function sendNowLabel(bytes: number | null | undefined): string {
  const size = bytes ? fmtFileSize(bytes) : "";
  return size ? `Одоо илгээх (${size})` : "Одоо илгээх";
}

/** Товчны хажуух тайлбар: iPhone Wi-Fi-г танихгүй тул хэрэглэгч өөрөө шийднэ. */
export function waitHint(net: NetKind): string {
  return net === "unknown" ? "Wi-Fi-д холбогдсон бол «Одоо илгээх» дарна уу" : "Эс бөгөөс Wi-Fi-д холбогдмогц өөрөө илгээнэ";
}

function isPhoto(i: ItemLike): boolean {
  return i.target.kind === "media" && !i.isVideo;
}

/**
 * Shell-ийн тэмдэгт: «3 зураг хүлээгдэж байна», «2 файл хүлээгдэж байна · 1 алдаатай»,
 * зөвхөн алдаатай бол «1 зураг хуулагдсангүй». Юу ч үгүй бол null.
 */
export function pendingBadgeText(items: readonly ItemLike[]): { text: string; failed: number; pending: number } | null {
  const pending = items.filter((i) => i.status !== "done" && i.status !== "failed");
  const failed = items.filter((i) => i.status === "failed");
  if (!pending.length && !failed.length) return null;
  const noun = (list: readonly ItemLike[]) => (list.length && list.every(isPhoto) ? "зураг" : "файл");
  if (!pending.length) return { text: `${failed.length} ${noun(failed)} хуулагдсангүй`, failed: failed.length, pending: 0 };
  const base = `${pending.length} ${noun(pending)} хүлээгдэж байна`;
  return {
    text: failed.length ? `${base} · ${failed.length} алдаатай` : base,
    failed: failed.length,
    pending: pending.length,
  };
}

/** Жагсаалтын дараалал: алдаатай → хуулж буй → бусад (хуучин нь эхэнд). */
export function sortForList<T extends Pick<QueueItem, "status" | "createdAt">>(items: readonly T[]): T[] {
  const rank = (s: QueueItem["status"]) => (s === "failed" ? 0 : s === "uploading" ? 1 : 2);
  return [...items].sort((a, b) => rank(a.status) - rank(b.status) || a.createdAt - b.createdAt);
}

// ── Компонент ────────────────────────────────────────────────────────────────

/**
 * Утсан дээр хүлээгдэж буй (илгээгдээгүй) файлууд: төлөв, «Дахин оролдох», устгах.
 * variant="compact" — shell-ийн тэмдэгт («3 зураг хүлээгдэж байна»).
 * Дараалал өөрөө хадгалагдана (IndexedDB) — апп солиход ч алдагдахгүй.
 */
export function PendingUploads({
  propertyId,
  variant = "list",
  href,
  title = "Илгээгдэж буй файл",
  className,
}: {
  /** Өгвөл зөвхөн тэр хөрөнгийн медиа. */
  propertyId?: string | null;
  variant?: "list" | "compact";
  /** compact: дарахад очих хуудас. */
  href?: string;
  title?: string;
  className?: string;
}) {
  const { items, retry, remove } = useUploadQueue(propertyId);
  const online = useOnline();
  const net = useNetKind();
  const [removeItem, setRemoveItem] = React.useState<QueueItem | null>(null);

  const badge = pendingBadgeText(items);

  if (variant === "compact") {
    if (!badge) return null;
    const cls = cn(
      "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
      badge.failed ? "bg-rose-50 text-danger ring-1 ring-rose-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      className
    );
    const icon = badge.failed ? (
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
    ) : (
      <CloudUpload className="size-4 shrink-0" aria-hidden />
    );
    return href ? (
      <Link href={href} className={cls} aria-live="polite">
        {icon}
        <span className="truncate">{badge.text}</span>
      </Link>
    ) : (
      <span role="status" aria-live="polite" className={cls}>
        {icon}
        <span className="truncate">{badge.text}</span>
      </span>
    );
  }

  const visible = sortForList(items.filter((i) => i.status !== "done"));
  const doneCount = items.length - visible.length;
  if (!visible.length) {
    return doneCount ? (
      <p role="status" className={cn("text-xs text-muted", className)}>
        {doneCount} файл хуулагдлаа.
      </p>
    ) : null;
  }

  return (
    <section className={cn("space-y-2 rounded-xl border border-line bg-surface p-3", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {title} ({visible.length})
        </h3>
        {!online ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
            <WifiOff className="size-3.5" aria-hidden />
            Сүлжээгүй — холбогдмогц илгээнэ
          </span>
        ) : null}
      </div>
      <ul className="divide-y divide-line" aria-live="polite">
        {visible.map((it) => (
          <li key={it.id} className="flex min-h-14 flex-wrap items-center gap-2 py-1.5">
            <span
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                it.status === "failed" ? "bg-rose-50 text-danger" : "bg-surface-2 text-muted"
              )}
              aria-hidden
            >
              {it.status === "uploading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : it.status === "failed" ? (
                <AlertTriangle className="size-4" />
              ) : it.target.kind === "brokerage" ? (
                <FileText className="size-4" />
              ) : it.isVideo ? (
                <Film className="size-4" />
              ) : (
                <ImageIcon className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{it.name}</p>
              <p className={cn("truncate text-xs", it.status === "failed" ? "text-danger" : "text-muted")}>
                {queueStatusText(it, net)}
                {it.bytes ? ` · ${fmtFileSize(it.bytes)}` : ""}
              </p>
            </div>
            {it.status === "failed" || (it.status === "queued" && it.attempts > 0) ? (
              <RowBtn onClick={() => void retry(it.id)} label="Дахин оролдох">
                <RotateCcw className="size-4" aria-hidden />
                <span className="hidden min-[400px]:inline">Дахин оролдох</span>
              </RowBtn>
            ) : null}
            {it.status !== "uploading" ? (
              <button
                type="button"
                aria-label={`«${it.name}» устгах`}
                title="Устгах"
                onClick={() => setRemoveItem(it)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-rose-50 hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
            {it.status === "waiting_wifi" ? (
              // Утсанд ч бичигтэй, бүтэн өргөнөөр: өмнө 400px-ээс доош зөвхөн Wi-Fi дүрс харагддаг байв.
              <div className="flex w-full flex-wrap items-center gap-2 pl-11 sm:w-auto sm:pl-0">
                <button type="button" onClick={() => void retry(it.id)} className={buttonClasses("primary", "md", "flex-1 sm:flex-none")}>
                  <Send className="size-4" aria-hidden />
                  {sendNowLabel(it.bytes)}
                </button>
                <span className="text-xs text-muted">{waitHint(net)}</span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!removeItem}
        onClose={() => setRemoveItem(null)}
        title="Файлыг утаснаас устгах уу?"
        description="Хуулагдаагүй файл тул устгавал сэргээхгүй."
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          if (removeItem) await remove(removeItem.id);
          return null;
        }}
      />
    </section>
  );
}

function RowBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 ring-1 ring-line-strong transition hover:bg-brand-50"
    >
      {children}
    </button>
  );
}

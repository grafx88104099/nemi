"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Film, Star, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Медиагийн нэг хавтан (зураг/бичлэг/холбоос): урьдчилан харах + нүүр зураг,
 * дараалал солих, устгах товч. Шинэ (дараалалд байгаа) ба хадгалсан медиад ижил.
 */
export function MediaTile({
  kind,
  src,
  href,
  title,
  isCover,
  caption,
  note,
  busy,
  disabled,
  onCover,
  onLeft,
  onRight,
  onRemove,
  removeLabel = "Устгах",
}: {
  kind: "image" | "video" | "link";
  /** Зураг/бичлэгийн URL (signed эсвэл blob:). */
  src?: string | null;
  /** Холбоосын URL (link) эсвэл татах холбоос. */
  href?: string | null;
  title?: string;
  isCover?: boolean;
  caption?: string | null;
  /** Жижиг тайлбар (хэмжээ, «тоглохгүй бол татаж үзнэ үү» г.м.). */
  note?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onCover?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface",
        isCover ? "border-brand-400 ring-2 ring-brand-500/20" : "border-line",
        busy && "opacity-60"
      )}
    >
      <div className="relative aspect-[4/3] bg-surface-2">
        {kind === "image" && src ? (
          // Signed/blob URL — next/image-ээр кэшлэхгүй.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption || title || ""} loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : kind === "video" && src ? (
          <video src={src} controls preload="metadata" playsInline className="absolute inset-0 size-full bg-black object-contain" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-muted">
            <Film className="size-6" aria-hidden />
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-brand-700 hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{title || href}</span>
              </a>
            ) : (
              <span className="text-xs">{title || "Бичлэг"}</span>
            )}
          </div>
        )}
        {isCover ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            Нүүр зураг
          </span>
        ) : null}
      </div>

      {caption || note ? (
        <div className="space-y-0.5 px-2 pt-1.5 text-xs">
          {caption ? <p className="truncate text-ink">{caption}</p> : null}
          {note ? <div className="text-muted">{note}</div> : null}
        </div>
      ) : null}

      {!disabled ? (
        <div className="mt-auto flex items-center justify-between gap-1 p-1.5">
          <div className="flex items-center gap-0.5">
            {onLeft ? (
              <IconBtn label="Өмнө нь" onClick={onLeft} disabled={busy}>
                <ChevronLeft className="size-4" />
              </IconBtn>
            ) : null}
            {onRight ? (
              <IconBtn label="Дараа нь" onClick={onRight} disabled={busy}>
                <ChevronRight className="size-4" />
              </IconBtn>
            ) : null}
            {onCover && !isCover ? (
              <IconBtn label="Нүүр зураг болгох" onClick={onCover} disabled={busy}>
                <Star className="size-4" />
              </IconBtn>
            ) : null}
          </div>
          {onRemove ? (
            <IconBtn label={removeLabel} onClick={onRemove} disabled={busy} danger>
              <Trash2 className="size-4" />
            </IconBtn>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted transition disabled:opacity-40",
        danger ? "hover:bg-rose-50 hover:text-danger" : "hover:bg-surface-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Файл сонгох товч (зураг/бичлэг/баримт). */
export function FilePickButton({
  accept,
  multiple = true,
  disabled,
  onFiles,
  children,
  className,
}: {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 text-sm font-semibold text-ink transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

"use client";

import * as React from "react";
import { Camera, Images, Loader2 } from "lucide-react";

import { splitPickedFiles } from "@/components/crm2/staff/form/MediaTile";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { IMAGE_READ_ERROR, prefetchHeic, prepareImage, progressLabel, type PreparedImage } from "@/lib/crm2/device/image-prep";
import { MEDIA_VIDEO_TYPES } from "@/lib/crm2/files";
import type { UiFlow } from "@/lib/crm2/feature-flags";
import { cn } from "@/lib/utils";

/**
 * Зураг сонгох хоёр товч (утсанд эхлээд):
 * - «Галерей» (үндсэн, олноор) — камераар олон зураг аваад нэг дор сонгох нь хамгийн хурдан.
 * - «Зураг авах» (камер, нэг удаад нэг).
 * Зургийг утсан дээрээ НЭГ НЭГЭЭР боловсруулна (≤2048px JPEG, HEIC хөрвүүлнэ) —
 * «боловсруулж байна 3/8». Бичлэгийг (onVideos өгвөл) боловсруулалгүй дамжуулна.
 */

export type PickedPhoto = PreparedImage & { source: File };
export type PickFailure = { source: File; error: string };

export const GALLERY_HINT = "Камераар олон зураг аваад галерейгаас нэг дор сонгоно уу";

const VIDEO_ACCEPT = [...MEDIA_VIDEO_TYPES, ".mp4", ".mov", ".webm"].join(",");

type NetInfo = { saveData?: boolean; type?: string; effectiveType?: string };

/** Сайн холболт: зөвхөн Network Information API байгаа (Android Chrome — HEIC-г өөрөө уншдаггүй) үед. */
function goodConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (!c || c.saveData) return false;
  if (c.type === "wifi" || c.type === "ethernet") return true;
  return c.effectiveType === "4g";
}

export function PhotoPickButtons({
  onPhotos,
  onPhoto,
  onFailed,
  onVideos,
  onErrors,
  onProcessingChange,
  maxPhotos,
  disabled,
  flow,
  propertyId,
  showHint = true,
  className,
}: {
  /** Боловсруулсан зургууд (сонгосон дарааллаар). */
  onPhotos?: (photos: PickedPhoto[]) => void;
  /**
   * Өгвөл зураг БҮРИЙГ боловсруулмагц шууд дамжуулна (дуудагч тэр даруй утсан дээр бичнэ) —
   * багц дуусахыг хүлээхгүй, бүрэлдэхүүн хаагдсан ч дуудагдана. Энэ үед onPhotos дуудагдахгүй.
   */
  onPhoto?: (photo: PickedPhoto) => Promise<void> | void;
  /** Уншиж чадаагүй зургууд — эх файлтай нь (дуудагч «Дахин оролдох» харуулна). */
  onFailed?: (failures: PickFailure[]) => void;
  /** Өгвөл «Галерей» бичлэг ч сонгоно (боловсруулахгүй). */
  onVideos?: (files: File[]) => void;
  /** Хязгаараас хэтэрсэн г.м. мэдэгдэл. */
  onErrors?: (messages: string[]) => void;
  onProcessingChange?: (processing: boolean) => void;
  /** Нэмж болох зургийн тоо (хэтэрсэн хэсгийг боловсруулахгүй). */
  maxPhotos?: number;
  disabled?: boolean;
  flow?: UiFlow;
  propertyId?: string | null;
  showHint?: boolean;
  className?: string;
}) {
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const alive = React.useRef(true);
  const hintId = React.useId();

  React.useEffect(() => {
    alive.current = true;
    if (goodConnection()) prefetchHeic();
    return () => {
      alive.current = false;
    };
  }, []);

  const busy = !!progress;
  const off = disabled || busy;

  async function handle(files: File[], camera: boolean) {
    const limit = maxPhotos ?? Infinity;
    const { images, videos, dropped } = splitPickedFiles(files, limit);
    const notices: string[] = [];
    if (dropped) {
      notices.push(
        limit <= 0 ? "Зургийн дээд хязгаарт хүрсэн байна." : `Дахиад ${limit} хүртэл зураг нэмнэ — ${dropped} зураг орсонгүй.`
      );
    }
    if (videos.length) {
      if (onVideos) onVideos(videos);
      else notices.push("Энд зөвхөн зураг нэмнэ.");
    }
    if (notices.length) onErrors?.(notices);
    if (!images.length) return;

    onProcessingChange?.(true);
    setProgress({ done: 0, total: images.length });
    const ok: PickedPhoto[] = [];
    const failed: PickFailure[] = [];
    try {
      for (const f of images) {
        let photo: PickedPhoto | null = null;
        try {
          photo = { ...(await prepareImage(f)), source: f };
        } catch {
          failed.push({ source: f, error: IMAGE_READ_ERROR });
        }
        if (photo) {
          ok.push(photo);
          // Шууд дамжуулна: апп солиход/хаагдахад өмнөх зургууд аль хэдийн хадгалагдсан байна.
          if (onPhoto) await Promise.resolve(onPhoto(photo)).catch(() => undefined);
        }
        if (alive.current) setProgress({ done: ok.length + failed.length, total: images.length });
      }
    } finally {
      if (alive.current) setProgress(null);
      onProcessingChange?.(false);
    }
    // Бүрэлдэхүүн хаагдсан ч боловсруулсан зургийг хаяхгүй — дуудагч өөрөө хадгална.
    if (ok.length && !onPhoto) onPhotos?.(ok);
    if (failed.length && alive.current) onFailed?.(failed);

    const heic = ok.filter((p) => p.heicConverted).length;
    logUiEvent({
      event: "photos_picked",
      flow: flow ?? null,
      property_id: propertyId ?? null,
      meta: { count: ok.length, failed: failed.length, camera, heic },
    });
    if (heic) logUiEvent({ event: "heic_converted", flow: flow ?? null, property_id: propertyId ?? null, meta: { count: heic } });
  }

  const label = progress ? progressLabel(progress.done, progress.total) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <PickLabel
          primary
          disabled={off}
          accept={onVideos ? `image/*,${VIDEO_ACCEPT}` : "image/*"}
          multiple
          describedBy={showHint ? hintId : undefined}
          onFiles={(f) => void handle(f, false)}
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Images className="size-5" aria-hidden />}
          {label ?? "Галерей"}
        </PickLabel>
        <PickLabel disabled={off} accept="image/*" capture="environment" onFiles={(f) => void handle(f, true)}>
          <Camera className="size-5" aria-hidden />
          Зураг авах
        </PickLabel>
      </div>
      {showHint ? (
        <p id={hintId} className="text-xs text-muted">
          {GALLERY_HINT}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {label ?? ""}
      </p>
    </div>
  );
}

function PickLabel({
  primary,
  disabled,
  accept,
  multiple,
  capture,
  describedBy,
  onFiles,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  accept: string;
  multiple?: boolean;
  capture?: "environment";
  describedBy?: string;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl px-4 font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
        primary
          ? "h-12 flex-1 bg-brand-500 text-base text-on-primary shadow-sm hover:bg-brand-hover sm:flex-none sm:px-6"
          : "h-11 border border-line-strong bg-surface text-sm text-ink hover:bg-surface-2 sm:h-12",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        disabled={disabled}
        aria-describedby={describedBy}
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

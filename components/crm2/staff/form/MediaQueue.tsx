"use client";

import * as React from "react";
import { CheckSquare, Link2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UndoSnackbar } from "@/components/crm2/ui/undo-snackbar";
import { PhotoPickButtons, type PickedPhoto, type PickFailure } from "@/components/crm2/staff/media/PhotoPickButtons";
import { IMAGE_READ_ERROR, prepareImage } from "@/lib/crm2/device/image-prep";
import { fileMime, fmtFileSize, mayNotPlay, validateMediaFile } from "@/lib/crm2/files";
import type { UiFlow } from "@/lib/crm2/feature-flags";
import type { Crm2FileLimits } from "@/lib/crm2/settings";

import { FormAlert } from "./fields";
import { newLocalId, videoLinkError } from "./form-model";
import {
  coverAfterRemove,
  MediaTile,
  moveItem,
  pruneSelected,
  restoreRemoved,
  toggleSelected,
  useDragReorder,
  WaitWifiToggle,
} from "./MediaTile";

/**
 * Шинэ хөрөнгийн медиа (хадгалахаас өмнө): файлыг хөтөч дотор дараалалд барьж,
 * хөрөнгө үүссэний дараа дарааллаар нь Storage руу хуулна. Зургийг утсан дээрээ
 * багасгана (HEIC хөрвүүлнэ). Нүүр зураг, чирж байр солих (←/→), олноор хасах
 * («Буцаах»-тай), бичлэгийн Wi-Fi хүлээлт, урт бичлэгийн https холбоос.
 */

export type QueuedFile = {
  id: string;
  file: File;
  kind: "image" | "video";
  preview: string;
  w?: number;
  h?: number;
  heicConverted?: boolean;
  /** Бичлэг: Wi-Fi холбогдтол хүлээх (undefined = тийм). */
  waitWifi?: boolean;
};
export type QueuedLink = { id: string; url: string };
export type MediaQueueValue = { files: QueuedFile[]; links: QueuedLink[]; coverId: string | null };

export const EMPTY_MEDIA_QUEUE: MediaQueueValue = { files: [], links: [], coverId: null };

/** Нүүр зураг: сонгосон эсвэл эхний зураг. */
export function queueCoverId(v: MediaQueueValue): string | null {
  const images = v.files.filter((f) => f.kind === "image");
  return images.some((f) => f.id === v.coverId) ? v.coverId : (images[0]?.id ?? null);
}

/** Бичлэг Wi-Fi хүлээх эсэх (анхдагч — тийм). */
export function queueWaitsWifi(f: Pick<QueuedFile, "kind" | "waitWifi">): boolean {
  return f.kind === "video" && f.waitWifi !== false;
}

type Failed = { id: string; source: File; error: string; retrying?: boolean };
type Undo = { seq: number; removed: { item: QueuedFile; index: number }[]; coverId: string | null };

export function MediaQueue({
  value,
  onChange,
  limits,
  disabled,
  flow = "full",
  onProcessingChange,
}: {
  value: MediaQueueValue;
  onChange: (next: MediaQueueValue) => void;
  limits: Crm2FileLimits;
  disabled?: boolean;
  /** Хэмжилтийн урсгал (photos_picked). */
  flow?: UiFlow;
  /** Зураг боловсруулж байх үед (хадгалах товчийг түр хаахад). */
  onProcessingChange?: (processing: boolean) => void;
}) {
  const [errors, setErrors] = React.useState<string[]>([]);
  const [failed, setFailed] = React.useState<Failed[]>([]);
  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedRaw, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [undo, setUndo] = React.useState<Undo | null>(null);

  // Хамгийн сүүлийн утга — async боловсруулалт дуусахад хуучин утгыг дарж бичихгүй.
  const latest = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  const undoRef = React.useRef<Undo | null>(null);
  React.useEffect(() => {
    latest.current = value;
    onChangeRef.current = onChange;
    undoRef.current = undo;
  }, [value, onChange, undo]);
  const emit = React.useCallback((next: MediaQueueValue) => {
    latest.current = next;
    onChangeRef.current(next);
  }, []);

  // Хуудаснаас гарахад blob URL-уудыг чөлөөлнө (буцаах хүлээж буй хасалт ч).
  React.useEffect(
    () => () => {
      for (const f of latest.current.files) URL.revokeObjectURL(f.preview);
      for (const r of undoRef.current?.removed ?? []) URL.revokeObjectURL(r.item.preview);
    },
    []
  );

  const images = value.files.filter((f) => f.kind === "image");
  const videos = value.files.filter((f) => f.kind === "video");
  const coverId = queueCoverId(value);
  const imageIds = images.map((f) => f.id);
  const allIds = value.files.map((f) => f.id);
  const selected = pruneSelected(selectedRaw, allIds);
  const remainingImages = Math.max(0, limits.maxImages - images.length);

  const imgDrag = useDragReorder({
    ids: imageIds,
    disabled,
    itemLabel: "Зураг",
    onMove: (from, to) => moveWithin("image", from, to),
  });
  const vidDrag = useDragReorder({
    ids: videos.map((f) => f.id),
    disabled,
    itemLabel: "Бичлэг",
    onMove: (from, to) => moveWithin("video", from, to),
  });

  function moveWithin(kind: "image" | "video", from: number, to: number) {
    const cur = latest.current;
    const group = cur.files.filter((f) => f.kind === kind);
    const moved = moveItem(group, from, to);
    if (moved === group) return;
    const other = cur.files.filter((f) => f.kind !== kind);
    emit({ ...cur, files: kind === "image" ? [...moved, ...other] : [...other, ...moved] });
  }

  function pushErrors(list: string[]) {
    setErrors((prev) => [...prev, ...list].slice(-6));
  }

  function addPhotos(photos: PickedPhoto[]) {
    const cur = latest.current;
    const next = [...cur.files];
    const problems: string[] = [];
    for (const p of photos) {
      const counts = {
        images: next.filter((f) => f.kind === "image").length,
        videos: next.filter((f) => f.kind === "video").length + cur.links.length,
      };
      const err = validateMediaFile(p.file, limits, counts);
      if (err) {
        problems.push(err);
        continue;
      }
      next.push({
        id: newLocalId(),
        file: p.file,
        kind: "image",
        preview: URL.createObjectURL(p.file),
        w: p.w,
        h: p.h,
        heicConverted: p.heicConverted,
      });
    }
    if (problems.length) pushErrors(problems);
    // Зураг ба бичлэгийн бүлэг тус тусдаа — зургийг бичлэгээс өмнө байлгана.
    emit({ ...cur, files: [...next.filter((f) => f.kind === "image"), ...next.filter((f) => f.kind === "video")] });
  }

  function addVideos(files: File[]) {
    const cur = latest.current;
    const next = [...cur.files];
    const problems: string[] = [];
    for (const file of files) {
      const counts = {
        images: next.filter((f) => f.kind === "image").length,
        videos: next.filter((f) => f.kind === "video").length + cur.links.length,
      };
      const err = validateMediaFile(file, limits, counts);
      if (err) {
        problems.push(err);
        continue;
      }
      next.push({ id: newLocalId(), file, kind: "video", preview: URL.createObjectURL(file) });
    }
    if (problems.length) pushErrors(problems);
    emit({ ...cur, files: next });
  }

  function addFailures(list: PickFailure[]) {
    setFailed((prev) => [...prev, ...list.map((f) => ({ id: newLocalId(), source: f.source, error: f.error }))]);
  }

  async function retryFailed(id: string) {
    const f = failed.find((x) => x.id === id);
    if (!f) return;
    setFailed((prev) => prev.map((x) => (x.id === id ? { ...x, retrying: true } : x)));
    onProcessingChange?.(true);
    try {
      const p = await prepareImage(f.source);
      setFailed((prev) => prev.filter((x) => x.id !== id));
      addPhotos([{ ...p, source: f.source }]);
    } catch {
      setFailed((prev) => prev.map((x) => (x.id === id ? { ...x, retrying: false, error: IMAGE_READ_ERROR } : x)));
    } finally {
      onProcessingChange?.(false);
    }
  }

  function finalizeUndo(u: Undo | null) {
    for (const r of u?.removed ?? []) URL.revokeObjectURL(r.item.preview);
  }

  function removeIds(ids: ReadonlySet<string>) {
    if (!ids.size) return;
    const cur = latest.current;
    const removed = cur.files.map((item, index) => ({ item, index })).filter((r) => ids.has(r.item.id));
    if (!removed.length) return;
    // Өмнөх хасалтын «Буцаах» хугацааг дуусгана.
    finalizeUndo(undo);
    const curImageIds = cur.files.filter((f) => f.kind === "image").map((f) => f.id);
    const prevCover = queueCoverId(cur);
    const nextCover = coverAfterRemove(curImageIds, cur.coverId && curImageIds.includes(cur.coverId) ? cur.coverId : null, ids);
    emit({ ...cur, files: cur.files.filter((f) => !ids.has(f.id)), coverId: nextCover });
    setUndo({ seq: (undo?.seq ?? 0) + 1, removed, coverId: prevCover });
    setSelected(new Set());
    setSelectMode(false);
  }

  function undoRemove() {
    const u = undo;
    if (!u) return;
    setUndo(null);
    const cur = latest.current;
    const files = restoreRemoved(cur.files, u.removed);
    const cover = u.coverId && files.some((f) => f.id === u.coverId) ? u.coverId : cur.coverId;
    emit({ ...cur, files, coverId: cover });
  }

  function addLink() {
    const err = videoLinkError(link, value.links.length + videos.length, limits.maxVideos);
    if (err) return setLinkError(err);
    emit({ ...latest.current, links: [...latest.current.links, { id: newLocalId(), url: link.trim() }] });
    setLink("");
    setLinkError(null);
  }

  function setWaitWifi(id: string, wait: boolean) {
    const cur = latest.current;
    emit({ ...cur, files: cur.files.map((f) => (f.id === id ? { ...f, waitWifi: wait } : f)) });
  }

  const hasFiles = value.files.length > 0;
  const removedCount = undo?.removed.length ?? 0;
  const removedImages = undo?.removed.filter((r) => r.item.kind === "image").length ?? 0;

  return (
    <div className="space-y-4">
      <PhotoPickButtons
        onPhotos={addPhotos}
        onFailed={addFailures}
        onVideos={addVideos}
        onErrors={pushErrors}
        onProcessingChange={onProcessingChange}
        maxPhotos={remainingImages}
        disabled={disabled}
        flow={flow}
      />
      <p className="text-xs text-muted">
        Зураг утсан дээрээ багасгагдана ({images.length}/{limits.maxImages}). Бичлэг MP4/MOV/WebM ≤{limits.maxVideoMb} МБ.
      </p>

      {errors.length ? (
        <FormAlert tone="warn">
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setErrors([])} className="mt-1 min-h-11 text-sm font-semibold underline underline-offset-2">
            Ойлголоо
          </button>
        </FormAlert>
      ) : null}

      {hasFiles && !disabled ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          {selectMode ? (
            <>
              <span className="text-sm font-medium text-ink" aria-live="polite">
                {selected.size} сонгосон
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="danger" size="touch" disabled={!selected.size} onClick={() => removeIds(selected)}>
                  <Trash2 className="size-4" aria-hidden />
                  Хасах
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  onClick={() => {
                    setSelectMode(false);
                    setSelected(new Set());
                  }}
                >
                  <X className="size-4" aria-hidden />
                  Болих
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-muted">Бариулаас чирж эсвэл ←/→ товчоор дарааллыг солино.</span>
              <Button type="button" variant="outline" size="touch" onClick={() => setSelectMode(true)}>
                <CheckSquare className="size-4" aria-hidden />
                Сонгох
              </Button>
            </>
          )}
        </div>
      ) : null}

      {images.length || failed.length ? (
        <div {...imgDrag.containerProps} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((f) => (
            <MediaTile
              key={f.id}
              kind="image"
              src={f.preview}
              title={f.file.name}
              isCover={f.id === coverId}
              note={fmtFileSize(f.file.size)}
              disabled={disabled}
              onCover={() => emit({ ...latest.current, coverId: f.id })}
              onRemove={() => removeIds(new Set([f.id]))}
              removeLabel="Хасах"
              dragHandle={imageIds.length > 1 ? imgDrag.handleProps(f.id) : undefined}
              drag={imgDrag.tileProps(f.id)}
              selectable={selectMode}
              selected={selected.has(f.id)}
              onToggleSelect={() => setSelected((s) => toggleSelected(s, f.id))}
            />
          ))}
          {failed.map((f) => (
            <MediaTile
              key={f.id}
              kind="image"
              title={f.source.name}
              note={f.source.name}
              disabled={disabled}
              busy={f.retrying}
              state={f.retrying ? { kind: "processing" } : { kind: "failed", text: f.error }}
              onRetry={() => void retryFailed(f.id)}
              onRemove={() => setFailed((prev) => prev.filter((x) => x.id !== f.id))}
              removeLabel="Хасах"
            />
          ))}
        </div>
      ) : null}

      {videos.length || value.links.length ? (
        <div {...vidDrag.containerProps} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((f) => (
            <MediaTile
              key={f.id}
              kind="video"
              src={f.preview}
              title={f.file.name}
              note={
                <>
                  {fmtFileSize(f.file.size)}
                  {mayNotPlay(fileMime(f.file)) ? " · хөтөч тоглуулахгүй байж магадгүй, MP4 зөвлөнө" : ""}
                </>
              }
              disabled={disabled}
              onRemove={() => removeIds(new Set([f.id]))}
              removeLabel="Хасах"
              dragHandle={videos.length > 1 ? vidDrag.handleProps(f.id) : undefined}
              drag={vidDrag.tileProps(f.id)}
              selectable={selectMode}
              selected={selected.has(f.id)}
              onToggleSelect={() => setSelected((s) => toggleSelected(s, f.id))}
              footer={
                <WaitWifiToggle checked={queueWaitsWifi(f)} disabled={disabled} onChange={(v) => setWaitWifi(f.id, v)} />
              }
            />
          ))}
          {value.links.map((l) => (
            <MediaTile
              key={l.id}
              kind="link"
              href={l.url}
              title={l.url}
              disabled={disabled || selectMode}
              onRemove={() => emit({ ...latest.current, links: latest.current.links.filter((x) => x.id !== l.id) })}
              removeLabel="Хасах"
            />
          ))}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {imgDrag.announce || vidDrag.announce}
      </p>

      <div className="space-y-1.5">
        <label htmlFor="staff-video-link" className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Link2 className="size-4 text-muted" aria-hidden />
          Урт бичлэгийн холбоос
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="staff-video-link"
            type="url"
            inputMode="url"
            enterKeyHint="done"
            value={link}
            disabled={disabled}
            placeholder="https://…"
            className="text-base sm:text-sm"
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={disabled || !link.trim()} onClick={addLink} className="shrink-0">
            <Plus className="size-4" aria-hidden />
            Холбоос нэмэх
          </Button>
        </div>
        {linkError ? <p className="text-xs text-danger">{linkError}</p> : null}
      </div>

      <UndoSnackbar
        key={undo?.seq ?? 0}
        open={!!undo}
        message={
          removedCount === removedImages ? `${removedCount} зураг хасагдлаа` : `${removedCount} файл хасагдлаа`
        }
        onUndo={undoRemove}
        onExpire={() => {
          finalizeUndo(undo);
          setUndo(null);
        }}
      />
    </div>
  );
}

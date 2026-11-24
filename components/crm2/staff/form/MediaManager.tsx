"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Images, Link2, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui";
import { PendingUploads } from "@/components/crm2/staff/media/PendingUploads";
import { PhotoPickButtons, type PickedPhoto } from "@/components/crm2/staff/media/PhotoPickButtons";
import {
  addPropertyVideoLink,
  deletePropertyMedia,
  reorderPropertyMedia,
  setPropertyCover,
} from "@/lib/crm2/actions/media";
import { enqueue, startQueue, useUploadQueue } from "@/lib/crm2/device/upload-queue";
import { fileMime, fmtFileSize, MEDIA_IMAGE_TYPES, mayNotPlay, validateMediaFile } from "@/lib/crm2/files";
import type { UiFlow } from "@/lib/crm2/feature-flags";
import type { PropertyMediaItem } from "@/lib/crm2/queries/properties";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import { uploadPropertyMedia } from "@/lib/crm2/storage";

import { FormAlert, FormSection } from "./fields";
import { newLocalId, videoLinkError } from "./form-model";
import { MediaTile, moveItem, pruneSelected, toggleSelected, useDragReorder } from "./MediaTile";

function byOrder(a: PropertyMediaItem, b: PropertyMediaItem) {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

const isImageFile = (f: File) => (MEDIA_IMAGE_TYPES as readonly string[]).includes(fileMime(f));

type FailedUpload = { id: string; file: File; sortOrder: number; isCover: boolean; error: string; retrying?: boolean };
type LocalOrder = { key: string; kind: "image" | "video"; ids: string[] };

/** Серверийн дарааллыг түр (хадгалагдтал) дарж харуулна. */
function applyOrder(list: PropertyMediaItem[], ids: string[] | null): PropertyMediaItem[] {
  if (!ids) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  const ordered = ids.map((id) => byId.get(id)).filter((m): m is PropertyMediaItem => !!m);
  return ordered.length === list.length ? ordered : list;
}

/**
 * Хадгалсан хөрөнгийн медиа (засах горим): зургийг утсан дээр багасгаад хуулах,
 * нүүр зураг, чирж байр солих (←/→), олноор устгах, бичлэгийн холбоос.
 * profileId өгвөл файлууд upload дараалалаар (IndexedDB — апп солиход алдагдахгүй,
 * бичлэг Wi-Fi хүлээнэ) явна; үгүй бол шууд хуулж, алдаатайг «Дахин оролдох»-оор.
 */
export function MediaManager({
  propertyId,
  officeId,
  items,
  limits,
  imagesRequired = false,
  profileId,
  flow = "card",
}: {
  propertyId: string;
  officeId: string;
  items: PropertyMediaItem[];
  limits: Crm2FileLimits;
  /** Идэвхжүүлэхэд зураг заавал (property.activation_required). */
  imagesRequired?: boolean;
  /** Нэвтэрсэн хэрэглэгч — өгвөл утсан дээрх upload дараалал ашиглана. */
  profileId?: string | null;
  flow?: UiFlow;
}) {
  const router = useRouter();
  const queueMode = !!profileId;
  const [busy, setBusy] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [failedUploads, setFailedUploads] = React.useState<FailedUpload[]>([]);
  const [removeItem, setRemoveItem] = React.useState<PropertyMediaItem | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedRaw, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [localOrder, setLocalOrder] = React.useState<LocalOrder | null>(null);
  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const queue = useUploadQueue(propertyId);
  const queued = queueMode ? queue.items.filter((i) => i.target.kind === "media" && i.status !== "done") : [];

  React.useEffect(() => {
    if (profileId) void startQueue(profileId);
  }, [profileId]);

  // Дараалалаас хуулагдсан файл гарвал серверээс сэргээнэ.
  const seenDone = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (!queueMode) return;
    const done = queue.items.filter((i) => i.status === "done").map((i) => i.id);
    if (!seenDone.current) {
      seenDone.current = new Set(done);
      return;
    }
    const fresh = done.filter((id) => !seenDone.current!.has(id));
    if (!fresh.length) return;
    for (const id of fresh) seenDone.current.add(id);
    router.refresh();
  }, [queue.items, queueMode, router]);

  const itemsKey = items.map((m) => `${m.id}:${m.sort_order}:${m.is_cover ? 1 : 0}`).join("|");
  const order = localOrder && localOrder.key === itemsKey ? localOrder : null;
  const images = applyOrder(items.filter((m) => m.kind === "image").sort(byOrder), order?.kind === "image" ? order.ids : null);
  const videos = applyOrder(items.filter((m) => m.kind === "video").sort(byOrder), order?.kind === "video" ? order.ids : null);
  const hasCover = images.some((m) => m.is_cover);
  const queuedImages = queued.filter((i) => !i.isVideo).length;
  const queuedVideos = queued.length - queuedImages;
  const selected = pruneSelected(selectedRaw, items.map((m) => m.id));
  const locked = busy || processing || !!progress;

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return res.error;
      }
      if (success) toast.success(success);
      router.refresh();
      return null;
    } catch (e) {
      console.error("MediaManager:", e);
      toast.error("Алдаа гарлаа. Дахин оролдоно уу.");
      return "Алдаа гарлаа. Дахин оролдоно уу.";
    } finally {
      setBusy(false);
    }
  }

  function pushErrors(list: string[]) {
    if (list.length) setErrors((prev) => [...prev, ...list].slice(-6));
  }

  async function uploadFiles(files: File[]) {
    const counts = {
      images: images.length + queuedImages + failedUploads.length,
      videos: videos.length + queuedVideos,
    };
    const valid: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const err = validateMediaFile(file, limits, counts);
      if (err) {
        problems.push(err);
        continue;
      }
      if (isImageFile(file)) counts.images++;
      else counts.videos++;
      valid.push(file);
    }
    pushErrors(problems);
    if (!valid.length) return;

    const base = Math.max(-1, ...items.map((m) => m.sort_order)) + 1 + queued.length;
    const coverTaken = hasCover || queued.some((i) => i.target.kind === "media" && i.target.isCover);
    const firstImage = coverTaken ? -1 : valid.findIndex(isImageFile);

    if (queueMode && profileId) {
      // Дараалал (IDB) — апп солих, сүлжээ тасрахад ч үргэлжилнэ.
      const notQueued: File[] = [];
      for (const [i, file] of valid.entries()) {
        try {
          await enqueue({
            profileId,
            target: {
              kind: "media",
              propertyId,
              clientKey: `property:${propertyId}`,
              officeId,
              limits,
              sortOrder: base + i,
              isCover: i === firstImage,
            },
            blob: file,
            name: file.name,
          });
        } catch {
          notQueued.push(file);
        }
      }
      if (notQueued.length) {
        // IDB ашиглах боломжгүй (хувийн цонх г.м.) — шууд хуулна.
        await uploadDirect(notQueued, base + valid.length, -1);
      }
      return;
    }
    await uploadDirect(valid, base, firstImage);
  }

  async function uploadDirect(files: File[], base: number, firstImage: number) {
    setProgress({ done: 0, total: files.length });
    const fails: FailedUpload[] = [];
    let ok = 0;
    try {
      for (const [i, file] of files.entries()) {
        const sortOrder = base + i;
        const isCover = i === firstImage;
        let error: string | null = null;
        try {
          const res = await uploadPropertyMedia({ file, officeId, propertyId, limits, sortOrder, isCover });
          if (!res.ok) error = res.error;
        } catch {
          error = "Файл хуулагдсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.";
        }
        if (error) fails.push({ id: newLocalId(), file, sortOrder, isCover, error });
        else ok++;
        setProgress({ done: i + 1, total: files.length });
      }
    } finally {
      setProgress(null);
      if (fails.length) setFailedUploads((prev) => [...prev, ...fails]);
      if (ok) toast.success(`${ok} файл хуулагдлаа`);
      router.refresh();
    }
  }

  async function retryUpload(id: string) {
    const f = failedUploads.find((x) => x.id === id);
    if (!f) return;
    setFailedUploads((prev) => prev.map((x) => (x.id === id ? { ...x, retrying: true } : x)));
    let error: string | null = null;
    try {
      const res = await uploadPropertyMedia({
        file: f.file,
        officeId,
        propertyId,
        limits,
        sortOrder: f.sortOrder,
        isCover: f.isCover && !hasCover,
      });
      if (!res.ok) error = res.error;
    } catch {
      error = "Файл хуулагдсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.";
    }
    if (error) {
      setFailedUploads((prev) => prev.map((x) => (x.id === id ? { ...x, retrying: false, error: error! } : x)));
      return;
    }
    setFailedUploads((prev) => prev.filter((x) => x.id !== id));
    toast.success("Хуулагдлаа");
    router.refresh();
  }

  function reorder(kind: "image" | "video", from: number, to: number) {
    const group = kind === "image" ? images : videos;
    const next = moveItem(group, from, to);
    if (next === group) return;
    const ids = next.map((m) => m.id);
    setLocalOrder({ key: itemsKey, kind, ids });
    void run(() => reorderPropertyMedia(propertyId, ids)).then((err) => {
      if (err) setLocalOrder(null);
    });
  }

  const imgDrag = useDragReorder({
    ids: images.map((m) => m.id),
    disabled: locked || selectMode,
    itemLabel: "Зураг",
    onMove: (from, to) => reorder("image", from, to),
  });
  const vidDrag = useDragReorder({
    ids: videos.map((m) => m.id),
    disabled: locked || selectMode,
    itemLabel: "Бичлэг",
    onMove: (from, to) => reorder("video", from, to),
  });

  async function addLink() {
    const err = videoLinkError(link, videos.length + queuedVideos, limits.maxVideos);
    if (err) return setLinkError(err);
    const res = await run(() => addPropertyVideoLink({ property_id: propertyId, external_url: link.trim() }), "Холбоос нэмэгдлээ");
    if (!res) {
      setLink("");
      setLinkError(null);
    } else setLinkError(res);
  }

  const total = images.length + videos.length;
  const remainingImages = Math.max(0, limits.maxImages - images.length - queuedImages - failedUploads.length);

  return (
    <FormSection
      id="staff-media"
      title="Зураг, бичлэг"
      icon={Images}
      description={`Хөрөнгийн карт, жагсаалтад нүүр зураг харагдана.${imagesRequired ? " Идэвхжүүлэхэд дор хаяж нэг зураг заавал." : ""}`}
    >
      <PhotoPickButtons
        onPhotos={(photos: PickedPhoto[]) => void uploadFiles(photos.map((p) => p.file))}
        onFailed={(list) => pushErrors(list.map((f) => `«${f.source.name}» — ${f.error}`))}
        onVideos={(files) => void uploadFiles(files)}
        onErrors={pushErrors}
        onProcessingChange={setProcessing}
        maxPhotos={remainingImages}
        disabled={locked}
        flow={flow}
        propertyId={propertyId}
      />
      <p className="text-xs text-muted" aria-live="polite">
        {progress ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Хуулж байна… {progress.done}/{progress.total}
          </span>
        ) : (
          <>
            Зураг ({images.length}/{limits.maxImages}) утсан дээр багасгагдана; бичлэг ≤{limits.maxVideoMb} МБ ({videos.length}/
            {limits.maxVideos}).
          </>
        )}
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

      {queueMode ? <PendingUploads propertyId={propertyId} /> : null}

      {total === 0 && !failedUploads.length ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Медиа хараахан нэмээгүй байна.</p>
      ) : null}

      {total ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          {selectMode ? (
            <>
              <span className="text-sm font-medium text-ink" aria-live="polite">
                {selected.size} сонгосон
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="danger" size="touch" disabled={!selected.size || busy} onClick={() => setBulkOpen(true)}>
                  <Trash2 className="size-4" aria-hidden />
                  Устгах
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
              <Button type="button" variant="outline" size="touch" disabled={locked} onClick={() => setSelectMode(true)}>
                <CheckSquare className="size-4" aria-hidden />
                Сонгох
              </Button>
            </>
          )}
        </div>
      ) : null}

      {images.length || failedUploads.length ? (
        <div {...imgDrag.containerProps} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((m) => (
            <MediaTile
              key={m.id}
              kind="image"
              src={m.url}
              caption={m.caption}
              isCover={m.is_cover}
              note={fmtFileSize(m.size_bytes)}
              busy={busy}
              onCover={() => void run(() => setPropertyCover(propertyId, m.id), "Нүүр зураг солигдлоо")}
              onRemove={() => setRemoveItem(m)}
              dragHandle={images.length > 1 ? imgDrag.handleProps(m.id) : undefined}
              drag={imgDrag.tileProps(m.id)}
              selectable={selectMode}
              selected={selected.has(m.id)}
              onToggleSelect={() => setSelected((s) => toggleSelected(s, m.id))}
            />
          ))}
          {failedUploads.map((f) => (
            <MediaTile
              key={f.id}
              kind={isImageFile(f.file) ? "image" : "video"}
              title={f.file.name}
              note={`${f.file.name} · ${fmtFileSize(f.file.size)}`}
              busy={f.retrying}
              state={f.retrying ? { kind: "uploading" } : { kind: "failed", text: f.error }}
              onRetry={() => void retryUpload(f.id)}
              onRemove={() => setFailedUploads((prev) => prev.filter((x) => x.id !== f.id))}
              removeLabel="Хасах"
            />
          ))}
        </div>
      ) : null}

      {videos.length ? (
        <div {...vidDrag.containerProps} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((m) => (
            <MediaTile
              key={m.id}
              kind={m.storage_path ? "video" : "link"}
              src={m.storage_path ? m.url : null}
              href={m.storage_path ? null : m.external_url}
              title={m.external_url ?? undefined}
              caption={m.caption}
              note={
                m.storage_path ? (
                  <>
                    {fmtFileSize(m.size_bytes)}
                    {mayNotPlay(m.mime_type) && m.url ? (
                      <>
                        {" · "}
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                          тоглохгүй бол татаж үзэх
                        </a>
                      </>
                    ) : null}
                  </>
                ) : null
              }
              busy={busy}
              onRemove={() => setRemoveItem(m)}
              dragHandle={videos.length > 1 ? vidDrag.handleProps(m.id) : undefined}
              drag={vidDrag.tileProps(m.id)}
              selectable={selectMode}
              selected={selected.has(m.id)}
              onToggleSelect={() => setSelected((s) => toggleSelected(s, m.id))}
            />
          ))}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {imgDrag.announce || vidDrag.announce}
      </p>

      <div className="space-y-1.5">
        <label htmlFor="staff-edit-video-link" className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Link2 className="size-4 text-muted" aria-hidden />
          Урт бичлэгийн холбоос
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="staff-edit-video-link"
            type="url"
            inputMode="url"
            enterKeyHint="done"
            value={link}
            disabled={busy}
            placeholder="https://…"
            className="text-base sm:text-sm"
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addLink();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={busy || !link.trim()} onClick={() => void addLink()} className="shrink-0">
            <Plus className="size-4" aria-hidden />
            Холбоос нэмэх
          </Button>
        </div>
        {linkError ? <p className="text-xs text-danger">{linkError}</p> : null}
      </div>

      <ConfirmDialog
        open={!!removeItem}
        onClose={() => setRemoveItem(null)}
        title={removeItem?.kind === "image" ? "Зургийг устгах уу?" : "Бичлэгийг устгах уу?"}
        description="Устгасан файлыг сэргээхгүй."
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          if (!removeItem) return null;
          const res = await deletePropertyMedia(removeItem.id);
          if (!res.ok) return res.error;
          toast.success("Устгагдлаа");
          router.refresh();
          return null;
        }}
      />

      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`${selected.size} файл устгах уу?`}
        description="Устгасан файлыг сэргээхгүй."
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          const ids = [...selected];
          const errs: string[] = [];
          let ok = 0;
          for (const id of ids) {
            try {
              const res = await deletePropertyMedia(id);
              if (res.ok) ok++;
              else errs.push(res.error);
            } catch {
              errs.push("Алдаа гарлаа. Дахин оролдоно уу.");
            }
          }
          if (ok) {
            toast.success(`${ok} файл устгагдлаа`);
            router.refresh();
          }
          if (errs.length) return `${errs.length} файл устгагдсангүй: ${errs[0]}`;
          setSelected(new Set());
          setSelectMode(false);
          return null;
        }}
      />
    </FormSection>
  );
}

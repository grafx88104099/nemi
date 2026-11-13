"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Images, Link2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui";
import {
  addPropertyVideoLink,
  deletePropertyMedia,
  reorderPropertyMedia,
  setPropertyCover,
} from "@/lib/crm2/actions/media";
import { fileMime, fmtFileSize, MEDIA_ACCEPT, MEDIA_IMAGE_TYPES, mayNotPlay, validateMediaFile } from "@/lib/crm2/files";
import type { PropertyMediaItem } from "@/lib/crm2/queries/properties";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import { uploadMany, uploadPropertyMedia } from "@/lib/crm2/storage";

import { FormAlert, FormSection } from "./fields";
import { swap, videoLinkError } from "./form-model";
import { FilePickButton, MediaTile } from "./MediaTile";

function byOrder(a: PropertyMediaItem, b: PropertyMediaItem) {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/**
 * Хадгалсан хөрөнгийн медиа (засах горим): шууд хуулах (Storage → мөр), нүүр
 * зураг, дараалал, устгах, бичлэгийн холбоос. Үйлдэл бүрийн дараа серверээс сэргээнэ.
 */
export function MediaManager({
  propertyId,
  officeId,
  items,
  limits,
  imagesRequired = false,
}: {
  propertyId: string;
  officeId: string;
  items: PropertyMediaItem[];
  limits: Crm2FileLimits;
  /** Идэвхжүүлэхэд зураг заавал (property.activation_required). */
  imagesRequired?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [removeItem, setRemoveItem] = React.useState<PropertyMediaItem | null>(null);
  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const images = items.filter((m) => m.kind === "image").sort(byOrder);
  const videos = items.filter((m) => m.kind === "video").sort(byOrder);
  const hasCover = images.some((m) => m.is_cover);

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

  async function upload(files: File[]) {
    const counts = { images: images.length, videos: videos.length };
    const valid: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const err = validateMediaFile(file, limits, counts);
      if (err) {
        problems.push(err);
        continue;
      }
      if ((MEDIA_IMAGE_TYPES as readonly string[]).includes(fileMime(file))) counts.images++;
      else counts.videos++;
      valid.push(file);
    }
    setErrors(problems);
    if (!valid.length) return;

    const base = Math.max(-1, ...items.map((m) => m.sort_order)) + 1;
    const firstImage = hasCover ? -1 : valid.findIndex((f) => (MEDIA_IMAGE_TYPES as readonly string[]).includes(fileMime(f)));
    setBusy(true);
    setProgress({ done: 0, total: valid.length });
    try {
      const res = await uploadMany(
        valid,
        (file, i) => uploadPropertyMedia({ file, officeId, propertyId, limits, sortOrder: base + i, isCover: i === firstImage }),
        (done, total) => setProgress({ done, total })
      );
      if (res.errors.length) setErrors((prev) => [...prev, ...res.errors]);
      if (res.ok.length) toast.success(`${res.ok.length} файл хуулагдлаа`);
    } finally {
      setBusy(false);
      setProgress(null);
      router.refresh();
    }
  }

  function move(group: PropertyMediaItem[], id: string, dir: -1 | 1) {
    const i = group.findIndex((m) => m.id === id);
    const next = swap(group, i, i + dir);
    if (next === group) return;
    void run(() => reorderPropertyMedia(propertyId, next.map((m) => m.id)));
  }

  async function addLink() {
    const err = videoLinkError(link, videos.length, limits.maxVideos);
    if (err) return setLinkError(err);
    const res = await run(() => addPropertyVideoLink({ property_id: propertyId, external_url: link.trim() }), "Холбоос нэмэгдлээ");
    if (!res) {
      setLink("");
      setLinkError(null);
    } else setLinkError(res);
  }

  return (
    <FormSection
      id="staff-media"
      title="Зураг, бичлэг"
      icon={Images}
      description={`Хөрөнгийн карт, жагсаалтад нүүр зураг харагдана.${imagesRequired ? " Идэвхжүүлэхэд дор хаяж нэг зураг заавал." : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilePickButton accept={MEDIA_ACCEPT} disabled={busy} onFiles={upload}>
          <ImagePlus className="size-4" aria-hidden />
          {progress ? `Хуулж байна… ${progress.done}/${progress.total}` : "Зураг, бичлэг нэмэх"}
        </FilePickButton>
        <p className="text-xs text-muted">
          Зураг ≤{limits.maxImageMb} МБ ({images.length}/{limits.maxImages}), бичлэг ≤{limits.maxVideoMb} МБ ({videos.length}/
          {limits.maxVideos}). HEIC хүлээж авахгүй.
        </p>
      </div>
      {errors.length ? (
        <FormAlert tone="warn">
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </FormAlert>
      ) : null}

      {images.length === 0 && videos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Медиа хараахан нэмээгүй байна.</p>
      ) : null}

      {images.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((m, i) => (
            <MediaTile
              key={m.id}
              kind="image"
              src={m.url}
              caption={m.caption}
              isCover={m.is_cover}
              note={fmtFileSize(m.size_bytes)}
              busy={busy}
              onCover={() => void run(() => setPropertyCover(propertyId, m.id), "Нүүр зураг солигдлоо")}
              onLeft={i > 0 ? () => move(images, m.id, -1) : undefined}
              onRight={i < images.length - 1 ? () => move(images, m.id, 1) : undefined}
              onRemove={() => setRemoveItem(m)}
            />
          ))}
        </div>
      ) : null}

      {videos.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((m, i) => (
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
              onLeft={i > 0 ? () => move(videos, m.id, -1) : undefined}
              onRight={i < videos.length - 1 ? () => move(videos, m.id, 1) : undefined}
              onRemove={() => setRemoveItem(m)}
            />
          ))}
        </div>
      ) : null}

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
            value={link}
            disabled={busy}
            placeholder="https://…"
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
    </FormSection>
  );
}

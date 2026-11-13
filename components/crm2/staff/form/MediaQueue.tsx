"use client";

import * as React from "react";
import { ImagePlus, Link2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileMime, fmtFileSize, MEDIA_ACCEPT, MEDIA_IMAGE_TYPES, mayNotPlay, validateMediaFile } from "@/lib/crm2/files";
import type { Crm2FileLimits } from "@/lib/crm2/settings";

import { FormAlert } from "./fields";
import { newLocalId, swap, videoLinkError } from "./form-model";
import { FilePickButton, MediaTile } from "./MediaTile";

/**
 * Шинэ хөрөнгийн медиа (хадгалахаас өмнө): файлыг хөтөч дотор дараалалд барьж,
 * хөрөнгө үүссэний дараа дарааллаар нь Storage руу хуулна. Нүүр зураг, дараалал,
 * хасах, урт бичлэгийн https холбоос.
 */

export type QueuedFile = { id: string; file: File; kind: "image" | "video"; preview: string };
export type QueuedLink = { id: string; url: string };
export type MediaQueueValue = { files: QueuedFile[]; links: QueuedLink[]; coverId: string | null };

export const EMPTY_MEDIA_QUEUE: MediaQueueValue = { files: [], links: [], coverId: null };

/** Нүүр зураг: сонгосон эсвэл эхний зураг. */
export function queueCoverId(v: MediaQueueValue): string | null {
  const images = v.files.filter((f) => f.kind === "image");
  return images.some((f) => f.id === v.coverId) ? v.coverId : (images[0]?.id ?? null);
}

export function MediaQueue({
  value,
  onChange,
  limits,
  disabled,
}: {
  value: MediaQueueValue;
  onChange: (next: MediaQueueValue) => void;
  limits: Crm2FileLimits;
  disabled?: boolean;
}) {
  const [errors, setErrors] = React.useState<string[]>([]);
  const [link, setLink] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  // Хуудаснаас гарахад blob URL-уудыг чөлөөлнө.
  const latest = React.useRef(value);
  React.useEffect(() => {
    latest.current = value;
  }, [value]);
  React.useEffect(
    () => () => {
      for (const f of latest.current.files) URL.revokeObjectURL(f.preview);
    },
    []
  );

  const images = value.files.filter((f) => f.kind === "image");
  const videos = value.files.filter((f) => f.kind === "video");
  const coverId = queueCoverId(value);

  function addFiles(files: File[]) {
    const next = [...value.files];
    const problems: string[] = [];
    for (const file of files) {
      const counts = {
        images: next.filter((f) => f.kind === "image").length,
        videos: next.filter((f) => f.kind === "video").length + value.links.length,
      };
      const err = validateMediaFile(file, limits, counts);
      if (err) {
        problems.push(err);
        continue;
      }
      const kind = (MEDIA_IMAGE_TYPES as readonly string[]).includes(fileMime(file)) ? "image" : "video";
      next.push({ id: newLocalId(), file, kind, preview: URL.createObjectURL(file) });
    }
    setErrors(problems);
    onChange({ ...value, files: next });
  }

  function remove(id: string) {
    const f = value.files.find((x) => x.id === id);
    if (f) URL.revokeObjectURL(f.preview);
    onChange({ ...value, files: value.files.filter((x) => x.id !== id), coverId: value.coverId === id ? null : value.coverId });
  }

  function move(kind: "image" | "video", id: string, dir: -1 | 1) {
    const group = value.files.filter((f) => f.kind === kind);
    const i = group.findIndex((f) => f.id === id);
    const moved = swap(group, i, i + dir);
    const other = value.files.filter((f) => f.kind !== kind);
    onChange({ ...value, files: kind === "image" ? [...moved, ...other] : [...other, ...moved] });
  }

  function addLink() {
    const err = videoLinkError(link, value.links.length + videos.length, limits.maxVideos);
    if (err) return setLinkError(err);
    onChange({ ...value, links: [...value.links, { id: newLocalId(), url: link.trim() }] });
    setLink("");
    setLinkError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilePickButton accept={MEDIA_ACCEPT} disabled={disabled} onFiles={addFiles}>
          <ImagePlus className="size-4" aria-hidden />
          Зураг, бичлэг сонгох
        </FilePickButton>
        <p className="text-xs text-muted">
          Зураг JPEG/PNG/WebP ≤{limits.maxImageMb} МБ ({images.length}/{limits.maxImages}), бичлэг MP4/MOV/WebM ≤{limits.maxVideoMb} МБ.
          HEIC хүлээж авахгүй.
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

      {images.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((f, i) => (
            <MediaTile
              key={f.id}
              kind="image"
              src={f.preview}
              title={f.file.name}
              isCover={f.id === coverId}
              note={fmtFileSize(f.file.size)}
              disabled={disabled}
              onCover={() => onChange({ ...value, coverId: f.id })}
              onLeft={i > 0 ? () => move("image", f.id, -1) : undefined}
              onRight={i < images.length - 1 ? () => move("image", f.id, 1) : undefined}
              onRemove={() => remove(f.id)}
              removeLabel="Хасах"
            />
          ))}
        </div>
      ) : null}

      {videos.length || value.links.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((f, i) => (
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
              onLeft={i > 0 ? () => move("video", f.id, -1) : undefined}
              onRight={i < videos.length - 1 ? () => move("video", f.id, 1) : undefined}
              onRemove={() => remove(f.id)}
              removeLabel="Хасах"
            />
          ))}
          {value.links.map((l) => (
            <MediaTile
              key={l.id}
              kind="link"
              href={l.url}
              title={l.url}
              disabled={disabled}
              onRemove={() => onChange({ ...value, links: value.links.filter((x) => x.id !== l.id) })}
              removeLabel="Хасах"
            />
          ))}
        </div>
      ) : null}

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
            value={link}
            disabled={disabled}
            placeholder="https://…"
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
    </div>
  );
}

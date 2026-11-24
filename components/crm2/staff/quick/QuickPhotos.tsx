"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Star, Trash2 } from "lucide-react";

import { PhotoPickButtons, type PickedPhoto } from "@/components/crm2/staff/media/PhotoPickButtons";
import { appendDraftMedia, getBlob, newId, putBlob, type DraftMedia, type DraftScope } from "@/lib/crm2/device/draft-store";
import type { UiFlow } from "@/lib/crm2/feature-flags";
import { cn } from "@/lib/utils";

export type QuickMediaValue = { media: DraftMedia[]; coverId: string | null };

/** Цэвэр: i-р зургийг dir алхмаар зөөнө. */
export function moveMedia(list: DraftMedia[], i: number, dir: -1 | 1): DraftMedia[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Зураг (камер/галерей эхэлсэн): «Галерей» үндсэн. Боловсруулсан файл бүр шууд утсан дээр (IndexedDB blob)
 * хадгалагдана — апп солиход, тасарсан ч алдагдахгүй. Нүүр зураг (од), байр солих, хасах.
 * Хадгалсны дараа blob-ууд upload дараалалд шилжинэ.
 */
export function QuickPhotos({
  profileId,
  draftScope,
  value,
  onChange,
  maxPhotos,
  flow,
  disabled,
  onPicked,
  onProcessingChange,
}: {
  profileId: string;
  /** Энэ маягтын ноорог — бүрэлдэхүүн хаагдсаны дараа боловсруулж дууссан зургийг шууд энд нэмнэ. */
  draftScope: DraftScope;
  value: QuickMediaValue;
  onChange: (next: QuickMediaValue) => void;
  maxPhotos: number;
  flow: UiFlow;
  disabled?: boolean;
  /** Сонгосон зургийн тоо (хэмжилт). */
  onPicked?: (count: number) => void;
  onProcessingChange?: (processing: boolean) => void;
}) {
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<string[]>([]);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  });
  const urlsRef = React.useRef(urls);
  React.useEffect(() => {
    urlsRef.current = urls;
  });

  // Сэргээсэн зургийн жижиг зураг (blob → object URL).
  React.useEffect(() => {
    let alive = true;
    const missing = value.media.filter((m) => !urlsRef.current[m.id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (m) => {
        const blob = await getBlob(m.blobKey).catch(() => null);
        return blob ? ([m.id, URL.createObjectURL(blob)] as const) : null;
      })
    ).then((rows) => {
      const add = Object.fromEntries(rows.filter((r): r is readonly [string, string] => !!r));
      if (!alive) {
        Object.values(add).forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      if (Object.keys(add).length) setUrls((u) => ({ ...u, ...add }));
    });
    return () => {
      alive = false;
    };
  }, [value.media]);

  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  /** Боловсруулсан зураг бүрийг тэр даруй blob болгож ноорогт нэмнэ (багц дуусахыг хүлээхгүй). */
  async function onPhoto(p: PickedPhoto) {
    onPicked?.(1);
    let item: DraftMedia;
    try {
      const blobKey = await putBlob(profileId, p.file, p.file.name);
      item = { id: newId(), blobKey, name: p.file.name, kind: "image", bytes: p.bytes, w: p.w, h: p.h };
    } catch {
      if (mounted.current) setErrors((e) => [...e, `${p.source.name || "Зураг"}: утсан дээр хадгалж чадсангүй`].slice(-4));
      return;
    }
    if (!mounted.current) {
      // Маягт хаагдсан (өөр ноорог, «Бүрэн форм» г.м.) — хадгалсан ноорогт шууд нэмнэ.
      await appendDraftMedia(profileId, draftScope, [item]).catch(() => false);
      return;
    }
    setUrls((u) => ({ ...u, [item.id]: URL.createObjectURL(p.file) }));
    const cur = valueRef.current;
    const next = { media: [...cur.media, item], coverId: cur.coverId ?? item.id };
    // Дараагийн зураг рендерийг хүлээлгүй энэ жагсаалт дээр нэмэгдэнэ.
    valueRef.current = next;
    onChange(next);
  }

  function remove(id: string) {
    const cur = valueRef.current;
    const media = cur.media.filter((m) => m.id !== id);
    onChange({ media, coverId: cur.coverId === id ? (media[0]?.id ?? null) : cur.coverId });
    const u = urls[id];
    if (u) {
      URL.revokeObjectURL(u);
      setUrls((x) => {
        const n = { ...x };
        delete n[id];
        return n;
      });
    }
  }

  const images = value.media.filter((m) => m.kind === "image");
  const left = Math.max(0, maxPhotos - images.length);

  return (
    <div className="space-y-3">
      <PhotoPickButtons
        onPhoto={onPhoto}
        onFailed={(f) => setErrors((e) => [...e, ...f.map((x) => x.error)].slice(-4))}
        onErrors={(m) => setErrors((e) => [...e, ...m].slice(-4))}
        onProcessingChange={onProcessingChange}
        maxPhotos={left}
        disabled={disabled || left === 0}
        flow={flow}
        showHint={images.length === 0}
      />
      {errors.length ? (
        <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
          <button type="button" className="min-h-11 font-semibold underline" onClick={() => setErrors([])}>
            Ойлголоо
          </button>
        </div>
      ) : null}
      {value.media.length ? (
        <ul className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3" aria-label="Сонгосон зургууд">
          {value.media.map((m, i) => {
            const cover = value.coverId === m.id;
            return (
              <li key={m.id} className={cn("overflow-hidden rounded-xl border bg-surface-2", cover ? "border-brand-500" : "border-line")}>
                <div className="relative aspect-[4/3]">
                  {urls[m.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- утсан дээрх blob URL
                    <img src={urls[m.id]} alt={`Зураг ${i + 1}`} className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-xs text-muted">Ачаалж байна…</div>
                  )}
                  {cover ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-on-primary">
                      <Star className="size-3" aria-hidden />
                      Нүүр
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-4">
                  <IconButton label="Нүүр зураг болгох" pressed={cover} disabled={disabled || cover} onClick={() => onChange({ ...value, coverId: m.id })}>
                    <Star className={cn("size-4", cover && "fill-current text-brand-600")} aria-hidden />
                  </IconButton>
                  <IconButton label="Зүүн тийш" disabled={disabled || i === 0} onClick={() => onChange({ ...value, media: moveMedia(value.media, i, -1) })}>
                    <ChevronLeft className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Баруун тийш"
                    disabled={disabled || i === value.media.length - 1}
                    onClick={() => onChange({ ...value, media: moveMedia(value.media, i, 1) })}
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton label="Хасах" disabled={disabled} onClick={() => remove(m.id)}>
                    <Trash2 className="size-4 text-danger" aria-hidden />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {value.media.length ? (
        <p className="text-xs text-muted">
          {images.length} зураг утсан дээр хадгалагдсан — хадгалсны дараа автоматаар хуулагдана.
        </p>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid min-h-11 place-items-center text-ink hover:bg-surface disabled:opacity-40"
    >
      {children}
    </button>
  );
}

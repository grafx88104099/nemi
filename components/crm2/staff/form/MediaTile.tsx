"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  GripVertical,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ── Цэвэр туслахууд (тестлэгдэнэ) ────────────────────────────────────────────

export type Rect = { left: number; top: number; width: number; height: number };

/** Элементийг from байрнаас to байранд зөөнө. Утгагүй бол ижил массивыг буцаана. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const n = list.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return list as T[];
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * Заагчийн доорх хавтангийн индекс. Аль нэгэнд нь ороогүй бол (завсар, захаас гадна)
 * төв нь хамгийн ойр хавтан. Хоосон бол -1.
 */
export function indexAtPoint(rects: readonly Rect[], x: number, y: number): number {
  if (!rects.length) return -1;
  const inside = rects.findIndex((r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height);
  if (inside >= 0) return inside;
  let best = 0;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const dx = r.left + r.width / 2 - x;
    const dy = r.top + r.height / 2 - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Гарын товчоор байр солих: ←/→ (мөн ↑/↓), Home/End. Хамаагүй товч эсвэл захад → null. */
export function keyMoveTarget(key: string, index: number, length: number): number | null {
  if (index < 0 || index >= length) return null;
  let to: number;
  if (key === "ArrowLeft" || key === "ArrowUp") to = index - 1;
  else if (key === "ArrowRight" || key === "ArrowDown") to = index + 1;
  else if (key === "Home") to = 0;
  else if (key === "End") to = length - 1;
  else return null;
  return to < 0 || to >= length || to === index ? null : to;
}

export function toggleSelected(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Байхгүй болсон id-г сонголтоос хасна (өөрчлөгдөөгүй бол ижил Set). */
export function pruneSelected(sel: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  const keep = new Set(ids);
  let changed = false;
  const next = new Set<string>();
  for (const id of sel) {
    if (keep.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : sel;
}

/** Хасалтын дараах нүүр зураг: хэвээр үлдвэл тэр, үгүй бол үлдсэн эхний зураг. */
export function coverAfterRemove(orderIds: readonly string[], coverId: string | null, removed: ReadonlySet<string>): string | null {
  const left = orderIds.filter((id) => !removed.has(id));
  if (coverId && left.includes(coverId)) return coverId;
  return left[0] ?? null;
}

/** Хассан мөрүүдийг анхны байранд нь буцааж оруулна («Буцаах»). */
export function restoreRemoved<T>(list: readonly T[], removed: readonly { item: T; index: number }[]): T[] {
  const next = [...list];
  for (const r of [...removed].sort((a, b) => a.index - b.index)) {
    next.splice(Math.min(Math.max(0, r.index), next.length), 0, r.item);
  }
  return next;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;

/** Зураг эсэх (HEIC, хоосон MIME-тэй галерейн файл орно). */
export function isImageLike(file: { name: string; type: string }): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  if (t.startsWith("video/")) return false;
  return IMAGE_EXT_RE.test(file.name.trim());
}

/**
 * Сонгосон файлыг зураг/бичлэг болгож хуваана; зургийг maxPhotos-оор таслана.
 * dropped — хязгаараас хэтэрсэн зургийн тоо.
 */
export function splitPickedFiles<F extends { name: string; type: string }>(
  files: readonly F[],
  maxPhotos: number = Infinity
): { images: F[]; videos: F[]; dropped: number } {
  const images: F[] = [];
  const videos: F[] = [];
  let dropped = 0;
  const cap = Math.max(0, maxPhotos);
  for (const f of files) {
    if (isImageLike(f)) {
      if (images.length < cap) images.push(f);
      else dropped++;
    } else videos.push(f);
  }
  return { images, videos, dropped };
}

// ── Чирж байр солих (pointer events + гарын нөөц) ─────────────────────────────

type DragState = { id: string; from: number; over: number; dx: number; dy: number };

type DragStart = {
  id: string;
  from: number;
  pointerId: number;
  x: number;
  y: number;
  scrollY: number;
  /** Хуудасны координатаар (scroll-оос үл хамаарна). */
  rects: Rect[];
};

/** Бариул дээр тавих шинж (үйл явдлыг сүлжээний container барина). */
export type DragHandleProps = {
  "data-media-handle": string;
  style: React.CSSProperties;
};

export type DragTileProps = {
  mediaId: string;
  dragState: "dragging" | "over" | null;
  dragStyle?: React.CSSProperties;
};

export type DragContainerProps = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
};

/** Чирэхэд дэлгэцийн захад ойртвол хуудсыг гүйлгэнэ. */
const EDGE_PX = 64;
const EDGE_STEP = 14;

function handleIdOf(target: EventTarget | null): { id: string; el: HTMLElement } | null {
  const el = target instanceof Element ? target.closest<HTMLElement>("[data-media-handle]") : null;
  const id = el?.dataset.mediaHandle;
  return el && id ? { id, el } : null;
}

/**
 * Хавтангуудыг чирж (бариулаас — touch-action:none тул гүйлгэлттэй зөрчилдөхгүй)
 * эсвэл бариул дээр ←/→ дарж дараалал солино. onMove(from, to) зөвхөн өөрчлөлт гарвал.
 * Үйл явдлыг сүлжээний container-т (containerProps) нэг дор барина.
 */
export function useDragReorder({
  ids,
  onMove,
  disabled,
  itemLabel = "Зураг",
}: {
  ids: readonly string[];
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  itemLabel?: string;
}) {
  const start = React.useRef<DragStart | null>(null);
  const overRef = React.useRef(-1);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const idsRef = React.useRef(ids);
  const onMoveRef = React.useRef(onMove);
  const disabledRef = React.useRef(disabled);
  React.useEffect(() => {
    idsRef.current = ids;
    onMoveRef.current = onMove;
    disabledRef.current = disabled;
  }, [ids, onMove, disabled]);

  function commit(id: string, from: number, to: number) {
    if (from === to || to < 0) return;
    onMoveRef.current(from, to);
    setAnnounce(`${itemLabel} ${to + 1}-р байрт шилжлээ (${idsRef.current.length}-аас)`);
    const root = rootRef.current;
    requestAnimationFrame(() => {
      root?.querySelector<HTMLElement>(`[data-media-handle="${CSS.escape(id)}"]`)?.focus();
    });
  }

  function measure(root: HTMLElement): Rect[] {
    const sy = window.scrollY;
    const sx = window.scrollX;
    return idsRef.current.map((id) => {
      const el = root.querySelector<HTMLElement>(`[data-media-id="${CSS.escape(id)}"]`);
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left + sx, top: r.top + sy, width: r.width, height: r.height } : { left: 0, top: 0, width: 0, height: 0 };
    });
  }

  function finish(apply: boolean) {
    const s = start.current;
    start.current = null;
    const over = overRef.current;
    overRef.current = -1;
    setDrag(null);
    if (apply && s && over >= 0) commit(s.id, s.from, over);
  }

  const containerProps: DragContainerProps = {
    onPointerDown(e) {
      if (disabledRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      const h = handleIdOf(e.target);
      if (!h) return;
      const from = idsRef.current.indexOf(h.id);
      if (from < 0) return;
      e.preventDefault();
      rootRef.current = e.currentTarget;
      try {
        h.el.setPointerCapture(e.pointerId);
      } catch {
        // capture дэмжихгүй хөтөч — move нь бариул дээр л ажиллана
      }
      start.current = {
        id: h.id,
        from,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        scrollY: window.scrollY,
        rects: measure(e.currentTarget),
      };
      overRef.current = from;
      setDrag({ id: h.id, from, over: from, dx: 0, dy: 0 });
    },
    onPointerMove(e) {
      const s = start.current;
      if (!s || s.pointerId !== e.pointerId) return;
      if (e.clientY < EDGE_PX) window.scrollBy(0, -EDGE_STEP);
      else if (e.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, EDGE_STEP);
      const over = indexAtPoint(s.rects, e.clientX + window.scrollX, e.clientY + window.scrollY);
      overRef.current = over < 0 ? s.from : over;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y + (window.scrollY - s.scrollY);
      setDrag({ id: s.id, from: s.from, over: overRef.current, dx, dy });
    },
    onPointerUp(e) {
      if (start.current?.pointerId === e.pointerId) finish(true);
    },
    onPointerCancel(e) {
      if (start.current?.pointerId === e.pointerId) finish(false);
    },
    onLostPointerCapture(e) {
      // pointerup-ийн дараа ч ирдэг — тэр үед start аль хэдийн null.
      if (start.current?.pointerId === e.pointerId) finish(true);
    },
    onKeyDown(e) {
      if (disabledRef.current) return;
      const h = handleIdOf(e.target);
      if (!h) return;
      if (e.key === "Escape" && start.current) {
        finish(false);
        return;
      }
      const from = idsRef.current.indexOf(h.id);
      const to = keyMoveTarget(e.key, from, idsRef.current.length);
      if (to === null) return;
      e.preventDefault();
      rootRef.current = e.currentTarget;
      commit(h.id, from, to);
    },
  };

  function handleProps(id: string): DragHandleProps {
    return { "data-media-handle": id, style: { touchAction: "none" } };
  }

  function tileProps(id: string): DragTileProps {
    if (!drag) return { mediaId: id, dragState: null };
    if (drag.id === id) {
      return {
        mediaId: id,
        dragState: "dragging",
        dragStyle: { transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0)`, zIndex: 20 },
      };
    }
    const over = ids[drag.over] === id && drag.over !== drag.from;
    return { mediaId: id, dragState: over ? "over" : null };
  }

  return { containerProps, handleProps, tileProps, dragging: !!drag, announce };
}

// ── Хавтан ───────────────────────────────────────────────────────────────────

export type MediaTileState =
  | { kind: "processing"; text?: string }
  | { kind: "uploading"; text?: string }
  | { kind: "queued"; text?: string }
  | { kind: "waiting_wifi"; text?: string }
  | { kind: "failed"; text?: string };

/**
 * Медиагийн нэг хавтан (зураг/бичлэг/холбоос): урьдчилан харах + нүүр зураг,
 * чирэх бариул (←/→), олноор сонгох, алдаа/хүлээлтийн төлөв, устгах.
 * Шинэ (дараалалд байгаа) ба хадгалсан медиад ижил.
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
  dragHandle,
  drag,
  selectable,
  selected,
  onToggleSelect,
  state,
  onRetry,
  footer,
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
  /** Бариулгүй үед л харагдана (бариултай бол ←/→ товч бариул дээр ажиллана). */
  onLeft?: () => void;
  onRight?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  /** useDragReorder().handleProps(id) */
  dragHandle?: DragHandleProps;
  /** useDragReorder().tileProps(id) */
  drag?: DragTileProps;
  /** Олноор сонгох горим. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  state?: MediaTileState | null;
  onRetry?: () => void;
  /** Доод хэсгийн нэмэлт мөр (бичлэгийн Wi-Fi сонголт г.м.). */
  footer?: React.ReactNode;
}) {
  const label = caption || title || (kind === "image" ? "Зураг" : kind === "video" ? "Бичлэг" : "Холбоос");
  const failed = state?.kind === "failed";
  const working = state?.kind === "processing" || state?.kind === "uploading";

  return (
    <div
      data-media-id={drag?.mediaId}
      style={drag?.dragStyle}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface",
        isCover ? "border-brand-400 ring-2 ring-brand-500/20" : "border-line",
        failed && "border-rose-300",
        selected && "border-brand-500 ring-2 ring-brand-500/40",
        drag?.dragState === "dragging" && "opacity-90 shadow-xl ring-2 ring-brand-500/40",
        drag?.dragState === "over" && "outline-2 outline-offset-2 outline-dashed outline-brand-500",
        busy && "opacity-60"
      )}
    >
      <div className="relative aspect-[4/3] bg-surface-2">
        {kind === "image" && src ? (
          // Signed/blob URL — next/image-ээр кэшлэхгүй.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption || title || ""} loading="lazy" draggable={false} className="absolute inset-0 size-full object-cover" />
        ) : kind === "video" && src ? (
          <video
            src={src}
            controls={!selectable}
            preload="metadata"
            playsInline
            className="absolute inset-0 size-full bg-black object-contain"
          />
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
              <span className="line-clamp-2 break-all text-xs">{title || "Бичлэг"}</span>
            )}
          </div>
        )}
        {isCover ? (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-white shadow">
            <Star className="size-3 fill-current" aria-hidden />
            Нүүр зураг
          </span>
        ) : null}

        {state && state.kind !== "failed" ? (
          <span
            className={cn(
              "absolute bottom-1.5 left-1.5 inline-flex max-w-[calc(100%-12px)] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow",
              state.kind === "waiting_wifi" ? "bg-amber-100 text-amber-900" : "bg-ink/80 text-white"
            )}
          >
            {working ? (
              <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
            ) : state.kind === "waiting_wifi" ? (
              <Wifi className="size-3 shrink-0" aria-hidden />
            ) : null}
            <span className="truncate">
              {state.text ??
                (state.kind === "processing"
                  ? "Боловсруулж байна"
                  : state.kind === "uploading"
                    ? "Хуулж байна"
                    : state.kind === "waiting_wifi"
                      ? "Wi-Fi хүлээж байна"
                      : "Дараалалд")}
            </span>
          </span>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-rose-50/95 p-2 text-center">
            <AlertTriangle className="size-5 text-danger" aria-hidden />
            <p className="line-clamp-3 text-xs font-medium text-danger">{state?.text || "Алдаа гарлаа"}</p>
            {onRetry && !disabled ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-semibold text-ink shadow-sm ring-1 ring-line-strong transition hover:bg-surface-2 disabled:opacity-50"
              >
                <RotateCcw className="size-4" aria-hidden />
                Дахин оролдох
              </button>
            ) : null}
          </div>
        ) : null}

        {selectable ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label={`${label} — сонгох`}
            onClick={onToggleSelect}
            disabled={disabled || busy}
            className={cn(
              "absolute inset-0 flex items-start justify-end p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
              selected ? "bg-brand-500/15" : "bg-black/0 hover:bg-black/5"
            )}
          >
            <span
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full border-2 shadow",
                selected ? "border-brand-500 bg-brand-500 text-white" : "border-white bg-black/30 text-transparent"
              )}
              aria-hidden
            >
              <Check className="size-4" />
            </span>
          </button>
        ) : null}
      </div>

      {caption || note ? (
        <div className="space-y-0.5 px-2 pt-1.5 text-xs">
          {caption ? <p className="truncate text-ink">{caption}</p> : null}
          {note ? <div className="text-muted">{note}</div> : null}
        </div>
      ) : null}

      {footer && !selectable ? <div className="px-1.5 pt-1.5">{footer}</div> : null}

      {!disabled && !selectable ? (
        <div className="mt-auto flex items-center justify-between gap-1 p-1.5">
          <div className="flex items-center gap-0.5">
            {dragHandle ? (
              <button
                type="button"
                {...dragHandle}
                aria-label={`${label} — байр солих: чирэх эсвэл ←/→ товч`}
                title="Чирж эсвэл ←/→ товчоор байр солино"
                disabled={busy}
                className="inline-flex size-11 cursor-grab items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:cursor-grabbing disabled:opacity-40 sm:size-9"
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
            ) : (
              <>
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
              </>
            )}
            {onCover && !isCover && !failed ? (
              <IconBtn label="Нүүр зураг болгох" onClick={onCover} disabled={busy}>
                <Star className="size-4" />
              </IconBtn>
            ) : null}
          </div>
          {onRemove ? (
            <IconBtn label={removeLabel} onClick={onRemove} disabled={busy && !failed} danger>
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
        "inline-flex size-11 items-center justify-center rounded-lg text-muted transition disabled:opacity-40 sm:size-9",
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
  capture,
}: {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
  className?: string;
  /** Камер шууд нээх (утсанд). */
  capture?: "environment" | "user";
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
        capture={capture}
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

/** Бичлэгийн «Wi-Fi холбогдтол хүлээх» сонголт (44px). */
export function WaitWifiToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-xs font-medium text-ink hover:bg-surface-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40">
      <input
        type="checkbox"
        className="size-4 accent-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Wifi className="size-3.5 shrink-0 text-muted" aria-hidden />
      Wi-Fi холбогдтол хүлээх
    </label>
  );
}

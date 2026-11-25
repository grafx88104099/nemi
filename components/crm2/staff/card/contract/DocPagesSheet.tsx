"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, Contrast, Crop, ImagePlus, Loader2, RotateCw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { IMAGE_READ_ERROR, prepareDocPage, progressLabel, reencodeJpeg } from "@/lib/crm2/device/image-prep";
import { buildSinglePdf, type JpegPage } from "@/lib/crm2/device/jpeg-pdf";
import { NOT_PDF_ERROR, enqueue, listQueue, startQueue, useUploadQueue } from "@/lib/crm2/device/upload-queue";
import { contractPdfTooLargeText } from "@/lib/crm2/files";
import type { Crm2FileLimits } from "@/lib/crm2/settings";

import {
  DOC_PAGES_MAX,
  clearPages,
  deletePageBlobs,
  loadPages,
  movePage,
  needsRender,
  readPage,
  rotateNext,
  savePages,
  storePage,
  uploadsFinished,
  type DocPageMeta,
  type DocPagesRecord,
} from "./doc-pages-store";

type Limits = Pick<Crm2FileLimits, "maxDocMb" | "maxDocsPerContract">;

const CROP_STEPS = [0, 0.04, 0.08, 0.12] as const;

function cropFor(step: number): DocPageMeta["crop"] {
  const m = CROP_STEPS[step] ?? 0;
  return m ? { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m } : null;
}

function cropStep(c: DocPageMeta["crop"]): number {
  if (!c) return 0;
  const i = CROP_STEPS.findIndex((m) => Math.abs(m - c.x) < 0.001);
  return i < 0 ? 0 : i;
}

/**
 * Энэ гэрээний дараалалд байгаа файлууд; хуудсаас үүсгэсэн PDF хуулагдмагц утсан дээрх хуудсыг
 * устгаж, картыг шинэчилнэ. onDone — шинэ файл хуулагдах бүрд (гэрээний цонх өгөгдлөө дахин ачаална).
 */
export function useContractUploads(profileId: string, propertyId: string, contractId: string | null, onDone?: () => void) {
  const router = useRouter();
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const { items: all, retry, remove } = useUploadQueue(null);
  const items = React.useMemo(
    () => all.filter((i) => i.target.kind === "brokerage" && i.target.contractId === contractId),
    [all, contractId]
  );
  const doneKey = items
    .filter((i) => i.status === "done")
    .map((i) => i.id)
    .join(",");
  const seenDone = React.useRef<string>("");

  React.useEffect(() => {
    if (!contractId) return;
    if (doneKey && doneKey !== seenDone.current) {
      seenDone.current = doneKey;
      router.refresh();
      onDoneRef.current?.();
    }
    let cancelled = false;
    void (async () => {
      try {
        const rec = await loadPages(profileId, propertyId, contractId);
        if (cancelled || !rec.queuedIds.length) return;
        const queue = await listQueue(profileId);
        if (uploadsFinished(rec.queuedIds, queue) === "done") await clearPages(profileId, propertyId, rec);
      } catch {
        /* IndexedDB боломжгүй — 24 цагийн дараа өөрөө цэвэрлэгдэнэ */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doneKey, contractId, profileId, propertyId, router]);

  const active = items.filter((i) => i.status !== "done");
  return {
    items: active,
    uploading: active.some((i) => i.status !== "failed"),
    failed: active.filter((i) => i.status === "failed"),
    retry,
    remove,
  };
}

function usePageUrls(profileId: string, pages: DocPageMeta[]) {
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const made = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const p of pages) {
        if (made.current[p.id]) continue;
        const bytes = await readPage(profileId, p.blobKey);
        if (cancelled || !bytes) continue;
        made.current[p.id] = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      }
      if (!cancelled) setUrls({ ...made.current });
    })();
    return () => {
      cancelled = true;
    };
  }, [pages, profileId]);
  React.useEffect(() => {
    const m = made.current;
    return () => {
      for (const u of Object.values(m)) URL.revokeObjectURL(u);
    };
  }, []);
  return urls;
}

/**
 * «Гэрээ скан хийх» — гэрээний олон хуудас камераар (R12). Хуудас бүр prepareDocPage (2480px / 0.85) →
 * шууд vault-д битүүмжилнэ (24 цаг) → буцаж ороход сэргэнэ. Эргүүлэх, сонголтоор тайрах, контраст.
 * «Нэг PDF болгох» → ЯГ НЭГ PDF (buildSinglePdf: хэт том бол чанарыг бууруулна, хэзээ ч хуваахгүй;
 * тэгээд ч том бол хуудсын тоог багасгахыг хүснэ) → дахин оролддог дараалал (kind 'contract').
 */
export function DocPagesSheet({
  open,
  onClose,
  profileId,
  propertyId,
  officeId,
  contractId,
  limits,
  onQueued,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  propertyId: string;
  officeId: string;
  contractId: string;
  limits: Limits;
  onQueued?: () => void;
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  const [rec, setRec] = React.useState<DocPagesRecord>({ v: 1, contractId, pages: [], queuedIds: [] });
  const [loaded, setLoaded] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cropOpen, setCropOpen] = React.useState<string | null>(null);
  const urls = usePageUrls(profileId, rec.pages);
  const queuedAlready = rec.queuedIds.length > 0;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadPages(profileId, propertyId, contractId)
      .then((r) => {
        if (cancelled) return;
        setRec(r);
        setRestored(r.pages.length > 0 && r.queuedIds.length === 0);
      })
      .catch(() => {
        if (!cancelled) setError("Утсан дээрх хадгалах сан боломжгүй — PDF хуулагдтал энэ цонхыг бүү хаа.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profileId, propertyId, contractId]);

  async function persist(next: DocPagesRecord) {
    setRec(next);
    try {
      await savePages(profileId, propertyId, next);
    } catch {
      setError("Хуудсыг утсан дээр хадгалж чадсангүй.");
    }
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    if (!files.length) return;
    setError(null);
    let next = rec.queuedIds.length ? { ...rec, pages: [], queuedIds: [] } : rec;
    const room = DOC_PAGES_MAX - next.pages.length;
    const take = files.slice(0, Math.max(0, room));
    if (take.length < files.length) setError(`Нэг гэрээнд ${DOC_PAGES_MAX} хүртэл хуудас.`);
    for (let i = 0; i < take.length; i++) {
      setBusy(progressLabel(i, take.length));
      try {
        const prepared = await prepareDocPage(take[i]);
        const meta = await storePage(profileId, prepared.file, { w: prepared.w, h: prepared.h });
        next = { ...next, pages: [...next.pages, meta] };
        // Хуудас бүрийг авсны дараа шууд хадгална (апп солиход алдагдахгүй).
        await persist(next);
      } catch {
        setError(IMAGE_READ_ERROR);
      }
    }
    setRestored(false);
    setBusy(null);
  }

  function update(id: string, patch: Partial<DocPageMeta>) {
    void persist({ ...rec, pages: rec.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  async function removePage(p: DocPageMeta) {
    await persist({ ...rec, pages: rec.pages.filter((x) => x.id !== p.id) });
    await deletePageBlobs([p.blobKey]).catch(() => {});
  }

  async function buildAndQueue() {
    if (!rec.pages.length || busy) return;
    setError(null);
    try {
      const pages: JpegPage[] = [];
      for (let i = 0; i < rec.pages.length; i++) {
        setBusy(`PDF бэлдэж байна ${i + 1}/${rec.pages.length}`);
        const p = rec.pages[i];
        const bytes = await readPage(profileId, p.blobKey);
        if (!bytes) throw new Error("page_lost");
        if (needsRender(p)) {
          const out = await prepareDocPage(new File([bytes], "page.jpg", { type: "image/jpeg" }), {
            rotate: p.rotate,
            enhance: p.enhance,
            crop: p.crop,
          });
          pages.push({ bytes: new Uint8Array(await out.file.arrayBuffer()), w: out.w, h: out.h });
        } else {
          pages.push({ bytes, w: p.w, h: p.h });
        }
      }
      const maxBytes = Math.max(1, limits.maxDocMb) * 1024 * 1024;
      setBusy("PDF бэлдэж байна…");
      const built = await buildSinglePdf(pages, maxBytes, async (page, q) => {
        const r = await reencodeJpeg(new Uint8Array(page.bytes), q);
        return { bytes: r.bytes, w: r.w, h: r.h };
      });
      if (!built.ok) {
        setError(contractPdfTooLargeText(built.bytes));
        return;
      }
      setBusy("Дараалалд оруулж байна…");
      const date = new Date().toISOString().slice(0, 10);
      const item = await enqueue({
        profileId,
        target: { kind: "brokerage", contractId, fileKind: "contract", officeId, limits },
        blob: new Blob([new Uint8Array(built.pdf)], { type: "application/pdf" }),
        name: `Гэрээ ${date}.pdf`,
      });
      await persist({ ...rec, queuedIds: [item.id] });
      void startQueue(profileId);
      logUiEvent({
        event: "contract_pages_captured",
        flow: "card",
        property_id: propertyId,
        meta: { pages: rec.pages.length, pdfs: 1, reencoded: built.quality !== null },
      });
      onQueued?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg === "page_lost"
          ? "Хуудасны зураг утсан дээрээс олдсонгүй — тухайн хуудсыг устгаад дахин авна уу."
          : msg === NOT_PDF_ERROR
            ? "PDF үүсгэж чадсангүй (гэрээ зөвхөн PDF). Дахин оролдоно уу."
            : "PDF үүсгэж чадсангүй. Дахин оролдоно уу."
      );
    } finally {
      setBusy(null);
    }
  }

  async function discardAll() {
    await clearPages(profileId, propertyId, rec).catch(() => {});
    setRec({ v: 1, contractId, pages: [], queuedIds: [] });
    setRestored(false);
  }

  const footer = (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!rec.pages.length || !!busy || queuedAlready}
        onClick={() => void buildAndQueue()}
      >
        {busy && busy.startsWith("PDF") ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {queuedAlready ? "Гэрээ хуулагдаж байна" : rec.pages.length ? `Нэг PDF болгох (${rec.pages.length} хуудас)` : "Нэг PDF болгох"}
      </Button>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={() => !busy && onClose()} title="Гэрээ скан хийх" footer={footer}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Гэрээний хуудас бүрийг тус тусад нь авна — PMC-ийн тамга, гарын үсэг тод уншигдахаар. Бүх хуудас нэг PDF болно.
          Зураг утсан дээр шифрлэгдэж хадгалагдах тул апп солиход алдагдахгүй; хуулагдсаны дараа устгагдана.
        </p>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" size="lg" className="w-full" disabled={!!busy || !loaded} onClick={() => cameraRef.current?.click()}>
            <Camera className="size-5" aria-hidden />
            {rec.pages.length && !queuedAlready ? "Дараагийн хуудас" : "Хуудас авах"}
          </Button>
          <Button type="button" size="lg" variant="outline" className="w-full" disabled={!!busy || !loaded} onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="size-5" aria-hidden />
            Галерейгаас
          </Button>
        </div>

        <p role="status" aria-live="polite" className="min-h-5 text-sm">
          {busy ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {busy}
            </span>
          ) : restored ? (
            <span className="text-emerald-700">Өмнө авсан {rec.pages.length} хуудас сэргээгдлээ.</span>
          ) : queuedAlready ? (
            <span className="text-sky-700">Гэрээ PDF болж хуулагдаж байна — дуусмагц хуудсууд утаснаас устгагдана.</span>
          ) : null}
        </p>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {rec.pages.length ? (
          <ol className="grid grid-cols-2 gap-3" aria-label="Хуудсууд">
            {rec.pages.map((p, i) => {
              const url = urls[p.id];
              const inset = p.crop ? `${(p.crop.y * 100).toFixed(1)}% ${(p.crop.x * 100).toFixed(1)}%` : "0";
              const step = cropStep(p.crop);
              return (
                <li key={p.id} className="min-w-0 rounded-xl border border-line bg-surface p-2">
                  <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- утсан дээрх шифрлэгдсэн blob (object URL)
                      <img
                        src={url}
                        alt={`${i + 1}-р хуудас`}
                        className="max-h-full max-w-full object-contain transition-transform"
                        style={{
                          transform: `rotate(${p.rotate}deg)`,
                          filter: p.enhance ? "grayscale(1) contrast(1.5)" : undefined,
                          clipPath: p.crop ? `inset(${inset})` : undefined,
                        }}
                      />
                    ) : (
                      <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/70 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <IconBtn label={`${i + 1}-р хуудсыг эргүүлэх`} disabled={!!busy || queuedAlready} onClick={() => update(p.id, { rotate: rotateNext(p.rotate) })}>
                      <RotateCw className="size-4" aria-hidden />
                    </IconBtn>
                    <IconBtn
                      label={`${i + 1}-р хуудасны контраст`}
                      pressed={p.enhance}
                      disabled={!!busy || queuedAlready}
                      onClick={() => update(p.id, { enhance: !p.enhance })}
                    >
                      <Contrast className="size-4" aria-hidden />
                    </IconBtn>
                    <IconBtn
                      label={`${i + 1}-р хуудсыг тайрах`}
                      pressed={!!p.crop || cropOpen === p.id}
                      disabled={!!busy || queuedAlready}
                      onClick={() => setCropOpen(cropOpen === p.id ? null : p.id)}
                    >
                      <Crop className="size-4" aria-hidden />
                    </IconBtn>
                    <IconBtn label={`${i + 1}-р хуудсыг өмнө нь`} disabled={i === 0 || !!busy || queuedAlready} onClick={() => void persist({ ...rec, pages: movePage(rec.pages, i, i - 1) })}>
                      <ArrowLeft className="size-4" aria-hidden />
                    </IconBtn>
                    <IconBtn
                      label={`${i + 1}-р хуудсыг дараа нь`}
                      disabled={i === rec.pages.length - 1 || !!busy || queuedAlready}
                      onClick={() => void persist({ ...rec, pages: movePage(rec.pages, i, i + 1) })}
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </IconBtn>
                    <IconBtn label={`${i + 1}-р хуудсыг устгах`} tone="danger" disabled={!!busy || queuedAlready} onClick={() => void removePage(p)}>
                      <Trash2 className="size-4" aria-hidden />
                    </IconBtn>
                  </div>
                  {cropOpen === p.id ? (
                    <div className="mt-2 space-y-1">
                      <label htmlFor={`crop-${p.id}`} className="block text-xs font-medium text-muted">
                        Ирмэг тайрах
                      </label>
                      <input
                        id={`crop-${p.id}`}
                        type="range"
                        min={0}
                        max={CROP_STEPS.length - 1}
                        step={1}
                        value={step}
                        onChange={(e) => update(p.id, { crop: cropFor(Number(e.target.value)) })}
                        className="h-11 w-full"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : loaded ? (
          <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-muted">
            Хуудас аваагүй байна.
          </p>
        ) : null}

        {rec.pages.length && !queuedAlready ? (
          <Button type="button" variant="ghost" size="touch" className="text-muted" disabled={!!busy} onClick={() => void discardAll()}>
            <Trash2 className="size-4" aria-hidden /> Бүх хуудсыг устгах
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  pressed,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-2 disabled:opacity-40",
        pressed && "border-brand-500 bg-brand-50 text-brand-700",
        tone === "danger" && "text-rose-700 hover:bg-rose-50"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Утсан дээрх зургийн боловсруулалт (R12/R13).
 *
 * - prepareImage: хөрөнгийн зураг → урт тал ≤ 2048px JPEG 0.8. Зургийг НЭГ НЭГЭЭР
 *   (дотоод дараалал) боловсруулна — утасны санах ой дүүрэхээс сэргийлнэ.
 *   Боломжтой бол decode хийх үедээ багасгана (createImageBitmap resize).
 *   HEIC: эхлээд createImageBitmap (Safari), бүтэхгүй бол heic2any (зөвхөн dynamic import).
 *   Дахин кодлох тул EXIF (байршил г.м.) хасагдана.
 * - prepareDocPage: гэрээний хуудас → урт тал ≤ 2480px JPEG 0.85, эргүүлэх, сонголтоор
 *   тайрах ба саарал контраст сунгалт.
 * Цэвэр тооцоолол (probe, fitWithin, autoContrast, decodePlan, дараалал) DOM-гүй тул тестлэгдэнэ.
 */

import { canvasToJpeg, decodeImageBlob, fitWithin, newCanvas, type DecodedImage } from "@/lib/watermark";
import { isHeic, type FileLike } from "@/lib/crm2/files";
import { readJpegInfo } from "@/lib/crm2/device/jpeg-pdf";

export const PHOTO_MAX_DIM = 2048;
export const PHOTO_QUALITY = 0.8;
export const DOC_MAX_DIM = 2480;
export const DOC_QUALITY = 0.85;
/** Толгойг (хэмжээ, EXIF) уншихад хангалттай эхний хэсэг. */
const PROBE_BYTES = 256 * 1024;

export const IMAGE_READ_ERROR = "Зургийг уншиж чадсангүй — өөр зураг сонгоно уу";

export class ImagePrepError extends Error {
  constructor(public readonly fileName: string) {
    super(IMAGE_READ_ERROR);
    this.name = "ImagePrepError";
  }
}

export function progressLabel(done: number, total: number): string {
  return `боловсруулж байна ${done}/${total}`;
}

// ── Толгой унших (цэвэр) ─────────────────────────────────────

/** JPEG-ийн EXIF Orientation (1–8); олдохгүй бол 1. */
export function readExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return 1;
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && i + 10 < bytes.length) {
      const s = i + 4;
      const isExif =
        bytes[s] === 0x45 && bytes[s + 1] === 0x78 && bytes[s + 2] === 0x69 && bytes[s + 3] === 0x66 && bytes[s + 4] === 0 && bytes[s + 5] === 0;
      if (isExif) {
        const t = s + 6;
        const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49;
        const u16 = (o: number) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
        const u32 = (o: number) =>
          le
            ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
            : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
        if (t + 8 > bytes.length) return 1;
        const ifd = t + u32(t + 4);
        if (ifd + 2 > bytes.length) return 1;
        const count = u16(ifd);
        for (let k = 0; k < count; k++) {
          const e = ifd + 2 + k * 12;
          if (e + 10 > bytes.length) break;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
    }
    if (len < 2) return 1;
    i += 2 + len;
  }
  return 1;
}

export type ProbedImage = { w: number; h: number; orientation: number; format: "jpeg" | "png" | "webp" };

/** JPEG/PNG/WebP-ийн хадгалсан хэмжээ (эргүүлэхээс өмнөх) ба EXIF чиглэл. */
export function probeImageSize(bytes: Uint8Array): ProbedImage | null {
  const jpeg = readJpegInfo(bytes);
  if (jpeg) return { w: jpeg.w, h: jpeg.h, orientation: readExifOrientation(bytes), format: "jpeg" };
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = dv.getUint32(16);
    const h = dv.getUint32(20);
    return w && h ? { w, h, orientation: 1, format: "png" } : null;
  }
  // WebP: RIFF....WEBP
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length >= 30 && tag(0) === "RIFF" && tag(8) === "WEBP") {
    const chunk = tag(12);
    if (chunk === "VP8 ") {
      const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return w && h ? { w, h, orientation: 1, format: "webp" } : null;
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const b = bytes.subarray(21, 25);
      const w = 1 + (((b[1] & 0x3f) << 8) | b[0]);
      const h = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
      return { w, h, orientation: 1, format: "webp" };
    }
    if (chunk === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { w, h, orientation: 1, format: "webp" };
    }
  }
  return null;
}

/** EXIF 5–8 нь өргөн/өндрийг солино. */
export function orientedSize(w: number, h: number, orientation: number): { w: number; h: number } {
  return orientation >= 5 && orientation <= 8 ? { w: h, h: w } : { w, h };
}

export type DecodeStep = "bitmap-resize" | "bitmap" | "element" | "heic2any";

/** Decode хийх оролдлогын дараалал. */
export function decodePlan(file: FileLike, probed: boolean): DecodeStep[] {
  if (isHeic(file)) return ["bitmap", "heic2any"];
  return probed ? ["bitmap-resize", "bitmap", "element"] : ["bitmap", "element"];
}

/** Нэг нэгээр гүйцэтгэх дараалал (алдаа нь дараагийнхыг зогсоохгүй). */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Саарал болгож контрастыг сунгана (lowPct/highPct хувийн хувь хэмжээгээр). data-г шууд өөрчилнө.
 * Бараг нэг өнгөтэй зурагт (зөрүү < 16) зөвхөн саарал болгоно.
 */
export function autoContrast(data: Uint8ClampedArray, lowPct = 0.01, highPct = 0.99): { lo: number; hi: number } {
  const n = Math.floor(data.length / 4);
  if (!n) return { lo: 0, hi: 255 };
  const hist = new Uint32Array(256);
  const gray = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = y;
    hist[y]++;
  }
  const loCount = n * lowPct;
  const hiCount = n * highPct;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  let loSet = false;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!loSet && acc > loCount) {
      lo = v;
      loSet = true;
    }
    if (acc >= hiCount) {
      hi = v;
      break;
    }
  }
  const span = hi - lo;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const g = span < 16 ? gray[p] : Math.max(0, Math.min(255, Math.round(((gray[p] - lo) * 255) / span)));
    data[i] = g;
    data[i + 1] = g;
    data[i + 2] = g;
  }
  return { lo, hi };
}

// ── heic2any ─────────────────────────────────────────────────

type Heic2Any = (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
let heicPromise: Promise<Heic2Any> | null = null;

function loadHeic(): Promise<Heic2Any> {
  if (!heicPromise) {
    heicPromise = import("heic2any").then((m) => m.default as Heic2Any);
    heicPromise.catch(() => {
      heicPromise = null;
    });
  }
  return heicPromise;
}

/** Сайн холболттой үед heic2any-г сул зуураа урьдчилан ачаална (дуудагч сүлжээг шалгана). */
export function prefetchHeic(): void {
  if (typeof window === "undefined") return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const go = () => {
    void loadHeic().catch(() => undefined);
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(go, { timeout: 5000 });
  else setTimeout(go, 1500);
}

// ── Decode + canvas ──────────────────────────────────────────

function fromBitmap(bmp: ImageBitmap): DecodedImage {
  return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
}

async function decodeWithPlan(
  file: File,
  maxDim: number
): Promise<{ dec: DecodedImage; heicConverted: boolean }> {
  const head = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
  const probe = isHeic(file) ? null : probeImageSize(head);
  const hasBitmap = typeof createImageBitmap === "function";
  for (const step of decodePlan(file, !!probe)) {
    try {
      if (step === "bitmap-resize") {
        if (!probe || !hasBitmap) continue;
        const o = orientedSize(probe.w, probe.h, probe.orientation);
        const t = fitWithin(o.w, o.h, maxDim);
        if (t.w >= o.w && t.h >= o.h) continue; // багасгах шаардлагагүй → энгийн bitmap
        const bmp = await createImageBitmap(file, {
          imageOrientation: "from-image",
          resizeWidth: t.w,
          resizeHeight: t.h,
          resizeQuality: "high",
        });
        // Зарим хөтөч эргүүлэхээс өмнө багасгаж харьцааг эвддэг — тэгвэл бүтэн decode.
        if (Math.abs(bmp.width - t.w) > 1 || Math.abs(bmp.height - t.h) > 1) {
          bmp.close();
          continue;
        }
        return { dec: fromBitmap(bmp), heicConverted: false };
      }
      if (step === "bitmap") {
        if (!hasBitmap) continue;
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { dec: fromBitmap(bmp), heicConverted: false };
      }
      if (step === "element") {
        return { dec: await decodeImageBlob(file), heicConverted: false };
      }
      if (step === "heic2any") {
        const heic2any = await loadHeic();
        const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
        const jpeg = Array.isArray(out) ? out[0] : out;
        if (!jpeg) continue;
        return { dec: await decodeImageBlob(jpeg), heicConverted: true };
      }
    } catch {
      // дараагийн арга
    }
  }
  throw new ImagePrepError(file.name);
}

export type CropRect = { x: number; y: number; w: number; h: number };

type RenderOpts = { maxDim: number; quality: number; rotate?: 0 | 90 | 180 | 270; crop?: CropRect | null; enhance?: boolean };

function clampCrop(c: CropRect | null | undefined): CropRect | null {
  if (!c) return null;
  const x = Math.max(0, Math.min(1, c.x));
  const y = Math.max(0, Math.min(1, c.y));
  const w = Math.max(0, Math.min(1 - x, c.w));
  const h = Math.max(0, Math.min(1 - y, c.h));
  if (w < 0.05 || h < 0.05) return null;
  if (x === 0 && y === 0 && w === 1 && h === 1) return null;
  return { x, y, w, h };
}

async function render(dec: DecodedImage, o: RenderOpts): Promise<{ blob: Blob; w: number; h: number }> {
  const crop = clampCrop(o.crop);
  const sx = crop ? Math.round(crop.x * dec.width) : 0;
  const sy = crop ? Math.round(crop.y * dec.height) : 0;
  const sw = crop ? Math.max(1, Math.round(crop.w * dec.width)) : dec.width;
  const sh = crop ? Math.max(1, Math.round(crop.h * dec.height)) : dec.height;
  const rot = o.rotate ?? 0;
  const swap = rot === 90 || rot === 270;
  const fit = fitWithin(swap ? sh : sw, swap ? sw : sh, o.maxDim);
  if (!fit.w || !fit.h) throw new Error("empty_image");
  const canvas = newCanvas(fit.w, fit.h);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: !!o.enhance });
    if (!ctx) throw new Error("no_canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fit.w, fit.h);
    ctx.imageSmoothingQuality = "high";
    const dw = swap ? fit.h : fit.w;
    const dh = swap ? fit.w : fit.h;
    ctx.save();
    ctx.translate(fit.w / 2, fit.h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(dec.source, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (o.enhance) {
      const px = ctx.getImageData(0, 0, fit.w, fit.h);
      autoContrast(px.data);
      ctx.putImageData(px, 0, 0);
    }
    const blob = await canvasToJpeg(canvas, o.quality);
    return { blob, w: fit.w, h: fit.h };
  } finally {
    // iOS Safari-д canvas-ын санах ойг шууд чөлөөлнө.
    canvas.width = 0;
    canvas.height = 0;
  }
}

function jpegName(name: string, fallback: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[\\/]+/g, "_").slice(0, 120) || fallback;
  return `${base}.jpg`;
}

export type PreparedImage = { file: File; w: number; h: number; bytes: number; heicConverted: boolean };

const serial = createSerialQueue();

async function prepare(file: File, o: RenderOpts, fallbackName: string): Promise<PreparedImage> {
  let dec: DecodedImage | null = null;
  try {
    const d = await decodeWithPlan(file, o.maxDim);
    dec = d.dec;
    const out = await render(dec, o);
    const f = new File([out.blob], jpegName(file.name, fallbackName), { type: "image/jpeg", lastModified: Date.now() });
    return { file: f, w: out.w, h: out.h, bytes: f.size, heicConverted: d.heicConverted };
  } catch (e) {
    if (e instanceof ImagePrepError) throw e;
    throw new ImagePrepError(file.name);
  } finally {
    dec?.close?.();
  }
}

/** Хөрөнгийн зураг: ≤ 2048px, JPEG 0.8. Алдаа → ImagePrepError (IMAGE_READ_ERROR). */
export function prepareImage(file: File): Promise<PreparedImage> {
  return serial(() => prepare(file, { maxDim: PHOTO_MAX_DIM, quality: PHOTO_QUALITY }, "photo"));
}

export type PrepareResult =
  | ({ ok: true; source: File } & PreparedImage)
  | { ok: false; source: File; error: string };

/**
 * Олон зургийг дараалан боловсруулна; onProgress(done, total) → progressLabel-аар
 * «боловсруулж байна 3/8». Нэг нь алдаатай бол бусад нь үргэлжилнэ.
 */
export async function prepareImages(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<PrepareResult[]> {
  const out: PrepareResult[] = [];
  onProgress?.(0, files.length);
  for (const f of files) {
    try {
      out.push({ ok: true, source: f, ...(await prepareImage(f)) });
    } catch {
      out.push({ ok: false, source: f, error: IMAGE_READ_ERROR });
    }
    onProgress?.(out.length, files.length);
  }
  return out;
}

export type DocPageOptions = { enhance?: boolean; rotate?: 0 | 90 | 180 | 270; crop?: CropRect | null };

/** Гэрээний хуудас: ≤ 2480px, JPEG 0.85; эргүүлэх, сонголтоор тайрах/контраст. */
export function prepareDocPage(file: File, opts: DocPageOptions = {}): Promise<PreparedImage> {
  return serial(() =>
    prepare(
      file,
      { maxDim: DOC_MAX_DIM, quality: DOC_QUALITY, rotate: opts.rotate ?? 0, crop: opts.crop ?? null, enhance: !!opts.enhance },
      "page"
    )
  );
}

/** splitBySize-д: JPEG хуудсыг өгсөн чанараар дахин кодлоно (браузерт). */
export async function reencodeJpeg(bytes: Uint8Array<ArrayBuffer>, quality: number): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const dec = await decodeImageBlob(new Blob([bytes], { type: "image/jpeg" }));
  try {
    const out = await render(dec, { maxDim: Math.max(dec.width, dec.height), quality });
    return { bytes: new Uint8Array(await out.blob.arrayBuffer()), w: out.w, h: out.h };
  } finally {
    dec.close?.();
  }
}

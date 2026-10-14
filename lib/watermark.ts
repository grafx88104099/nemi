/**
 * Зарын зурагт оффисын лого тамга (watermark) дарах.
 *
 * Зургийг агентын браузерт canvas-аар боловсруулж, тамгатай JPEG болгоод
 * дараа нь upload хийнэ — тамгагүй эх файл storage руу огт очихгүй.
 * Цэвэр тооцоолол (fitWithin, stampRect, keyOutBackground) DOM-гүй тул
 * сервер талд import хийж, unit тестлэж болно; canvas ашигладаг функцууд
 * зөвхөн браузерт дуудагдана.
 */

export type WatermarkConfig = {
  /** Оффисын лого (offices.logo_url). Байхгүй/ачаалагдахгүй бол label-ээр текст тамга дарна. */
  logoUrl: string | null;
  /** Оффисын нэр — текст тамга болон UI тайлбарт. */
  label: string;
};

/** Тамганы тунгалаг байдал — зургийг дарж халхлахгүй, бүдэг харагдана. */
export const WATERMARK_OPACITY = 0.35;
/** Upload хийх зургийн урт талын дээд хэмжээ (px). */
export const WATERMARK_MAX_DIM = 2560;
/** Тамганы өргөн — зургийн өргөний хувь. */
export const STAMP_WIDTH_RATIO = 0.38;
/** Тамганы өндөр — зургийн өндрийн хувиас хэтрэхгүй (босоо зурагт хэт том болохоос сэргийлнэ). */
export const STAMP_HEIGHT_RATIO = 0.3;

const JPEG_QUALITY = 0.88;
/** Логог боловсруулах ажлын хэмжээ — 2766px логог бүтнээр нь пиксел бүрчлэн гүйхгүй. */
const LOGO_WORK_MAX = 800;
const ALPHA_VISIBLE = 16;

export type Rect = { x: number; y: number; w: number; h: number };

/** Оффисын мөрөөс тамганы тохиргоо гаргана; унтраалттай бол null. */
export function watermarkFromOffice(
  office: { name?: string | null; logo_url?: string | null; watermark_enabled?: boolean | null } | null | undefined
): WatermarkConfig | null {
  if (!office?.watermark_enabled) return null;
  return { logoUrl: office.logo_url ?? null, label: office.name ?? "" };
}

/** Харьцааг хадгалж урт талыг max-аас хэтрүүлэхгүйгээр багасгана (томруулахгүй). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Тамгыг зургийн төвд байрлуулна: өргөн нь widthRatio, өндөр нь heightRatio-оос хэтрэхгүй. */
export function stampRect(
  imgW: number,
  imgH: number,
  markW: number,
  markH: number,
  widthRatio = STAMP_WIDTH_RATIO,
  heightRatio = STAMP_HEIGHT_RATIO
): Rect {
  if (markW <= 0 || markH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min((imgW * widthRatio) / markW, (imgH * heightRatio) / markH);
  const w = Math.round(markW * scale);
  const h = Math.round(markH * scale);
  return { x: Math.round((imgW - w) / 2), y: Math.round((imgH - h) / 2), w, h };
}

/**
 * Логоны дэвсгэрийг арилгаж, үлдсэн тэмдгийн хүрээг буцаана. data-г шууд өөрчилнө.
 * - Тунгалаг дэвсгэртэй PNG: зөвхөн харагдах пикселийн хүрээг тооцно.
 * - Битүү дэвсгэртэй (жишээ нь PMC-ийн саарал квадрат): зүүн дээд булангийн өнгийг
 *   дэвсгэр гэж үзээд ойролцоо пикселийг тунгалаг болгоно; ирмэгийг зөөлөн шилжүүлнэ.
 * Тэмдэг олдохгүй бол null.
 */
export function keyOutBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance = 40
): Rect | null {
  if (w <= 0 || h <= 0 || data.length < w * h * 4) return null;
  const [br, bg, bb, ba] = [data[0], data[1], data[2], data[3]];
  const opaqueBg = ba >= ALPHA_VISIBLE;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (opaqueBg) {
        const dist = Math.max(
          Math.abs(data[i] - br),
          Math.abs(data[i + 1] - bg),
          Math.abs(data[i + 2] - bb)
        );
        if (dist <= tolerance) {
          data[i + 3] = 0;
        } else if (dist < tolerance * 2) {
          // Антиалиас ирмэг — дэвсгэрт ойрхон тусам илүү тунгалаг.
          data[i + 3] = Math.round(data[i + 3] * ((dist - tolerance) / tolerance));
        }
      }
      if (data[i + 3] >= ALPHA_VISIBLE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ── Браузер талын хэсэг ───────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  // <img> нь EXIF чиглэлийг (утасны босоо зураг) автоматаар засдаг тул canvas-д зөв эргэлттэй орно.
  await img.decode();
  return img;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Логог татаж, дэвсгэрийг арилгаад тэмдгийн хэсгээр тайрсан canvas. Алдаа гарвал null. */
async function buildLogoMark(logoUrl: string): Promise<HTMLCanvasElement | null> {
  try {
    // fetch → blob → objectURL: canvas "tainted" болохоос сэргийлнэ (cross-origin зургийг шууд зурахгүй).
    const res = await fetch(logoUrl, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    try {
      const img = await loadImage(url);
      const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, LOGO_WORK_MAX);
      const work = newCanvas(w, h);
      const ctx = work.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h);
      const box = keyOutBackground(pixels.data, w, h);
      if (!box) return null;
      ctx.putImageData(pixels, 0, 0);
      const mark = newCanvas(box.w, box.h);
      mark.getContext("2d")?.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      return mark;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

const markCache = new Map<string, Promise<HTMLCanvasElement | null>>();

function logoMark(logoUrl: string): Promise<HTMLCanvasElement | null> {
  let p = markCache.get(logoUrl);
  if (!p) {
    p = buildLogoMark(logoUrl);
    markCache.set(logoUrl, p);
    // Алдаа гарсан бол дараагийн удаа дахин оролдоно.
    p.then((m) => { if (!m) markCache.delete(logoUrl); });
  }
  return p;
}

function drawTextStamp(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  const text = label.trim() || "Нэми";
  const size = Math.max(14, Math.round(Math.min(w, h) * 0.09));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillText(text, w / 2, h / 2);
  ctx.restore();
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Зурагт тамга дарж, шинэ JPEG файл буцаана. Зургийг уншиж чадахгүй бол
 * (HEIC г.м. дэмжигдээгүй формат) алдаа шиднэ — тамгагүй зураг upload хийгдэхээс сэргийлнэ.
 */
export async function applyWatermark(file: File, config: WatermarkConfig): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, WATERMARK_MAX_DIM);
    if (!w || !h) throw new Error("empty_image");
    const canvas = newCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    // PNG-ийн тунгалаг хэсэг JPEG-д хар болохоос сэргийлж цагаан дэвсгэр.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const mark = config.logoUrl ? await logoMark(config.logoUrl) : null;
    if (mark) {
      const r = stampRect(w, h, mark.width, mark.height);
      ctx.globalAlpha = WATERMARK_OPACITY;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(mark, r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    } else {
      drawTextStamp(ctx, w, h, config.label);
    }

    const blob = await canvasToJpeg(canvas);
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

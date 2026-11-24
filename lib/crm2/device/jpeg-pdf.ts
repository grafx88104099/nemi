/**
 * JPEG хуудаснуудаас нэг PDF (P7, R12) — гадны сангүй.
 *
 * PDF 1.4: хуудас бүрт нэг DCTDecode зураг (JPEG байтыг шууд оруулна, дахин
 * кодлохгүй), A4 дээр харьцааг хадгалж голлуулна; хэвтээ зурагт хэвтээ A4.
 * xref-ийн offset-ууд байтаар яг таарна. Цэвэр модуль (браузер, сервер, тест).
 */

export const A4_PORTRAIT = { w: 595.28, h: 841.89 } as const;
/** Хуудасны ирмэгийн зай (pt). */
export const PAGE_MARGIN = 18;

export type JpegPage = {
  bytes: Uint8Array;
  /** Өгөхгүй бол JPEG-ийн SOF толгойноос уншина. */
  w?: number;
  h?: number;
};

export type JpegInfo = { w: number; h: number; components: number };

/** JPEG-ийн SOF толгойноос хэмжээ ба өнгөний сувгийн тоо. JPEG биш бол null. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 >= bytes.length) return null;
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      const components = bytes[i + 9];
      if (!w || !h) return null;
      return { w, h, components };
    }
    i += 2 + len;
  }
  return null;
}

export type PlacedImage = { pageW: number; pageH: number; x: number; y: number; w: number; h: number };

/** Зургийг A4 (хэвтээ зурагт хэвтээ) дээр харьцааг хадгалж голлуулна. */
export function fitOnA4(imgW: number, imgH: number, margin = PAGE_MARGIN): PlacedImage {
  const landscape = imgW > imgH;
  const pageW = landscape ? A4_PORTRAIT.h : A4_PORTRAIT.w;
  const pageH = landscape ? A4_PORTRAIT.w : A4_PORTRAIT.h;
  const boxW = pageW - margin * 2;
  const boxH = pageH - margin * 2;
  const scale = Math.min(boxW / Math.max(1, imgW), boxH / Math.max(1, imgH));
  const w = imgW * scale;
  const h = imgH * scale;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

const num = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

function colorSpace(components: number): string {
  if (components === 1) return "/DeviceGray";
  if (components === 4) return "/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]";
  return "/DeviceRGB";
}

/** JPEG хуудаснуудаас PDF 1.4 байт. Хоосон жагсаалт эсвэл JPEG биш байт → алдаа. */
export function buildPdfFromJpegs(pages: JpegPage[]): Uint8Array {
  if (!pages.length) throw new Error("no_pages");
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const push = (c: Uint8Array | string) => {
    const b = typeof c === "string" ? enc.encode(c) : c;
    chunks.push(b);
    length += b.length;
  };
  const startObj = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  // Header + binary comment (PDF уншигчид хоёртын файл гэж таних).
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const n = pages.length;
  // 1: Catalog, 2: Pages, хуудас бүрт 3 объект: Page, Image, Contents.
  const pageObj = (i: number) => 3 + i * 3;
  const imgObj = (i: number) => 4 + i * 3;
  const contentObj = (i: number) => 5 + i * 3;

  startObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObj(2);
  push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${n} >>\nendobj\n`);

  pages.forEach((p, i) => {
    const info = readJpegInfo(p.bytes);
    if (!info) throw new Error("not_jpeg");
    const w = p.w ?? info.w;
    const h = p.h ?? info.h;
    const place = fitOnA4(w, h);
    startObj(pageObj(i));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(place.pageW)} ${num(place.pageH)}] ` +
        `/Resources << /XObject << /Im${i} ${imgObj(i)} 0 R >> /ProcSet [/PDF /ImageB /ImageC] >> ` +
        `/Contents ${contentObj(i)} 0 R >>\nendobj\n`
    );
    startObj(imgObj(i));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace ${colorSpace(info.components)} ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`
    );
    push(p.bytes);
    push("\nendstream\nendobj\n");
    const content = `q ${num(place.w)} 0 0 ${num(place.h)} ${num(place.x)} ${num(place.y)} cm /Im${i} Do Q\n`;
    startObj(contentObj(i));
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const size = 3 + n * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let k = 1; k < size; k++) xref += `${String(offsets[k]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Хуудсыг өгсөн чанараар дахин кодлох (браузерт canvas; тестэд хуурамч). */
export type Reencode = (page: JpegPage, quality: number) => Promise<JpegPage>;

/** Эхний оролдлого хуудасны анхны (0.85) чанараар, дараа нь эдгээрээр. */
export const SPLIT_QUALITY_STEPS = [0.8, 0.75] as const;

export type SplitResult = { pdfs: Uint8Array[]; quality: number | null; pageGroups: number[][] };

/**
 * PDF maxBytes-аас хэтэрвэл эхлээд чанарыг 0.75 хүртэл бууруулна; тэгээд ч том бол
 * хуудсуудыг дараалал хадгалж хэд хэдэн PDF болгон (ихэвчлэн 2) хуваана.
 * Ганц хуудас өөрөө хэтэрсэн ч тусдаа PDF болж үлдэнэ (хязгаарыг DB/storage шалгана).
 */
export async function splitBySize(pages: JpegPage[], maxBytes: number, reencode?: Reencode): Promise<SplitResult> {
  let current = pages;
  let quality: number | null = null;
  let pdf = buildPdfFromJpegs(current);
  if (pdf.length <= maxBytes) return { pdfs: [pdf], quality, pageGroups: [pages.map((_, i) => i)] };
  if (reencode) {
    for (const q of SPLIT_QUALITY_STEPS) {
      current = await Promise.all(pages.map((p) => reencode(p, q)));
      quality = q;
      pdf = buildPdfFromJpegs(current);
      if (pdf.length <= maxBytes) return { pdfs: [pdf], quality, pageGroups: [pages.map((_, i) => i)] };
    }
  }
  // Хуваах: дарааллыг хадгалж, бүлэг бүрийн PDF ≤ maxBytes байхаар шуналтай бүлэглэнэ.
  const groups: number[][] = [];
  let group: number[] = [];
  for (let i = 0; i < current.length; i++) {
    const trial = [...group, i];
    const size = buildPdfFromJpegs(trial.map((k) => current[k])).length;
    if (group.length && size > maxBytes) {
      groups.push(group);
      group = [i];
    } else {
      group = trial;
    }
  }
  if (group.length) groups.push(group);
  return { pdfs: groups.map((g) => buildPdfFromJpegs(g.map((k) => current[k]))), quality, pageGroups: groups };
}

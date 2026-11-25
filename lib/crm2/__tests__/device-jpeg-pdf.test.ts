import { describe, expect, it } from "vitest";
import {
  SINGLE_PDF_QUALITY_STEPS,
  buildPdfFromJpegs,
  buildSinglePdf,
  fitOnA4,
  readJpegInfo,
  splitBySize,
  type JpegPage,
} from "@/lib/crm2/device/jpeg-pdf";
import { isPdfHeader } from "@/lib/crm2/files";

/** Хамгийн жижиг «JPEG»: SOI + SOF0 (w×h, 3 суваг) + дүүргэлт + EOI. */
function fakeJpeg(w: number, h: number, pad = 100, components = 3): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 8 + components * 3, 8, h >> 8, h & 255, w >> 8, w & 255, components];
  for (let c = 0; c < components; c++) sof.push(c + 1, 0x11, 0);
  const body = new Uint8Array(pad).fill(0x42);
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, ...sof, ...body, 0xff, 0xd9]);
}

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("readJpegInfo", () => {
  it("reads SOF size and components", () => {
    expect(readJpegInfo(fakeJpeg(2480, 3508))).toEqual({ w: 2480, h: 3508, components: 3 });
    expect(readJpegInfo(fakeJpeg(10, 20, 5, 1))).toEqual({ w: 10, h: 20, components: 1 });
    expect(readJpegInfo(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("fitOnA4", () => {
  it("portrait image on portrait A4, landscape on landscape", () => {
    const p = fitOnA4(2480, 3508);
    expect(p.pageW).toBeCloseTo(595.28);
    expect(p.w / p.h).toBeCloseTo(2480 / 3508, 3);
    expect(p.x).toBeGreaterThanOrEqual(0);
    const l = fitOnA4(3000, 1000);
    expect(l.pageW).toBeCloseTo(841.89);
    expect(l.w).toBeLessThanOrEqual(l.pageW);
  });
});

describe("buildPdfFromJpegs", () => {
  const pages: JpegPage[] = [{ bytes: fakeJpeg(2480, 3508) }, { bytes: fakeJpeg(3508, 2480, 300) }, { bytes: fakeJpeg(100, 100, 7, 1) }];
  const pdf = buildPdfFromJpegs(pages);
  const s = latin1(pdf);

  it("has a PDF 1.4 header and EOF", () => {
    expect(s.startsWith("%PDF-1.4\n")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("xref offsets point exactly at each object", () => {
    const sx = /startxref\n(\d+)\n%%EOF/.exec(s);
    expect(sx).not.toBeNull();
    const xrefAt = Number(sx![1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const head = /xref\n0 (\d+)\n/.exec(s.slice(xrefAt))!;
    const size = Number(head[1]);
    expect(size).toBe(3 + pages.length * 3);
    const entriesStart = xrefAt + head[0].length;
    for (let k = 0; k < size; k++) {
      const line = s.slice(entriesStart + k * 20, entriesStart + (k + 1) * 20);
      expect(line).toHaveLength(20);
      if (k === 0) {
        expect(line).toBe("0000000000 65535 f \n");
        continue;
      }
      const off = Number(line.slice(0, 10));
      expect(s.slice(off, off + `${k} 0 obj`.length)).toBe(`${k} 0 obj`);
    }
    expect(s).toContain(`trailer\n<< /Size ${size} /Root 1 0 R >>`);
  });

  it("page count and one DCTDecode image per page", () => {
    expect(s).toContain(`/Count ${pages.length}`);
    expect(s.match(/\/Type \/Page /g)).toHaveLength(pages.length);
    expect(s.match(/\/Filter \/DCTDecode/g)).toHaveLength(pages.length);
    expect(s).toContain("/ColorSpace /DeviceGray");
    // Зургийн stream-ийн урт ба байт ижил.
    expect(s).toContain(`/Length ${pages[1].bytes.length} >>\nstream\n`);
  });

  it("rejects empty and non-JPEG input", () => {
    expect(() => buildPdfFromJpegs([])).toThrow();
    expect(() => buildPdfFromJpegs([{ bytes: new Uint8Array([0, 1, 2]) }])).toThrow();
  });
});

describe("splitBySize", () => {
  const big = (pad: number) => ({ bytes: fakeJpeg(1000, 1400, pad) });
  /** Хуурамч дахин кодлол: чанар буурах тусам байт багасна. */
  const reencode = async (p: JpegPage, q: number): Promise<JpegPage> => {
    const pad = Math.round((p.bytes.length - 40) * (q / 0.85) * (q === 0.75 ? 0.6 : 0.9));
    return { bytes: fakeJpeg(1000, 1400, Math.max(1, pad)) };
  };

  it("one PDF when it fits", async () => {
    const r = await splitBySize([big(100), big(100)], 1_000_000, reencode);
    expect(r.pdfs).toHaveLength(1);
    expect(r.quality).toBeNull();
  });

  it("steps quality down before splitting", async () => {
    const pages = [big(5000), big(5000)];
    const full = buildPdfFromJpegs(pages).length;
    const r = await splitBySize(pages, Math.round(full * 0.75), reencode);
    expect(r.pdfs).toHaveLength(1);
    expect(r.quality).toBe(0.75);
  });

  it("splits into two PDFs at 0.75 when still too big", async () => {
    const pages = [big(5000), big(5000)];
    const r = await splitBySize(pages, 5000, reencode);
    expect(r.quality).toBe(0.75);
    expect(r.pdfs).toHaveLength(2);
    expect(r.pageGroups).toEqual([[0], [1]]);
    for (const p of r.pdfs) expect(latin1(p)).toContain("/Count 1");
  });
});

describe("buildSinglePdf (гэрээ = НЭГ PDF, хэзээ ч хуваахгүй)", () => {
  const big = (pad: number) => ({ bytes: fakeJpeg(1000, 1400, pad) });
  /** Хуурамч дахин кодлол: чанартай пропорциональ байт (анхны хуудаснаас). */
  const reencode = async (p: JpegPage, q: number): Promise<JpegPage> => {
    const pad = Math.round((p.bytes.length - 40) * (q / 0.85));
    return { bytes: fakeJpeg(1000, 1400, Math.max(1, pad)) };
  };

  it("багтвал анхны чанараар нэг PDF («%PDF-» толгойтой)", async () => {
    const r = await buildSinglePdf([big(100), big(100), big(100)], 1_000_000, reencode);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quality).toBeNull();
    expect(isPdfHeader(r.pdf)).toBe(true);
    expect(latin1(r.pdf)).toContain("/Count 3");
  });

  it("том бол чанарыг алхамаар бууруулна — бүх хуудас нэг PDF-д", async () => {
    const pages = [big(5000), big(5000)];
    const full = buildPdfFromJpegs(pages).length;
    const r = await buildSinglePdf(pages, Math.round(full * 0.8), reencode);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(SINGLE_PDF_QUALITY_STEPS as readonly number[]).toContain(r.quality);
    expect(r.pdf.length).toBeLessThanOrEqual(Math.round(full * 0.8));
    expect(latin1(r.pdf)).toContain("/Count 2");
  });

  it("хамгийн бага чанараар ч том бол хуваахгүй — too_large (хэмжээтэй)", async () => {
    const pages = [big(5000), big(5000)];
    const r = await buildSinglePdf(pages, 5000, reencode);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("too_large");
    expect(r.bytes).toBeGreaterThan(5000);
    // Хамгийн сүүлийн (бага) чанарын хэмжээ.
    const last = SINGLE_PDF_QUALITY_STEPS[SINGLE_PDF_QUALITY_STEPS.length - 1];
    const smallest = buildPdfFromJpegs(await Promise.all(pages.map((p) => reencode(p, last)))).length;
    expect(r.bytes).toBe(smallest);
  });

  it("дахин кодлогчгүй бол шууд too_large; хоосон жагсаалт → алдаа", async () => {
    const pages = [big(5000)];
    const r = await buildSinglePdf(pages, 100);
    expect(r).toEqual({ ok: false, error: "too_large", bytes: buildPdfFromJpegs(pages).length });
    await expect(buildSinglePdf([], 1000)).rejects.toThrow();
  });
});

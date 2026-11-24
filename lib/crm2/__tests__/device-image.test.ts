import { describe, expect, it } from "vitest";
import { fitWithin } from "@/lib/watermark";
import {
  PHOTO_MAX_DIM,
  autoContrast,
  createSerialQueue,
  decodePlan,
  orientedSize,
  probeImageSize,
  progressLabel,
  readExifOrientation,
} from "@/lib/crm2/device/image-prep";

/** SOI + APP1 Exif (Orientation) + SOF0 + EOI. */
function jpegWithOrientation(w: number, h: number, orientation: number, littleEndian = false): Uint8Array {
  const u16 = (v: number) => (littleEndian ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (littleEndian ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  const sof = [0xff, 0xc0, 0x00, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, ...sof, 0xff, 0xd9]);
}

function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe("fitWithin (2048)", () => {
  it("scales the long side down, never up", () => {
    expect(fitWithin(4032, 3024, PHOTO_MAX_DIM)).toEqual({ w: 2048, h: 1536 });
    expect(fitWithin(3024, 4032, PHOTO_MAX_DIM)).toEqual({ w: 1536, h: 2048 });
    expect(fitWithin(800, 600, PHOTO_MAX_DIM)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(0, 10, PHOTO_MAX_DIM)).toEqual({ w: 0, h: 0 });
  });
});

describe("probe", () => {
  it("reads JPEG size and EXIF orientation (both byte orders)", () => {
    expect(probeImageSize(jpegWithOrientation(4032, 3024, 6))).toEqual({ w: 4032, h: 3024, orientation: 6, format: "jpeg" });
    expect(readExifOrientation(jpegWithOrientation(10, 10, 3, true))).toBe(3);
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(1);
  });

  it("reads PNG size", () => {
    expect(probeImageSize(pngHeader(1200, 900))).toEqual({ w: 1200, h: 900, orientation: 1, format: "png" });
  });

  it("orientedSize swaps for 5–8", () => {
    expect(orientedSize(4032, 3024, 6)).toEqual({ w: 3024, h: 4032 });
    expect(orientedSize(4032, 3024, 1)).toEqual({ w: 4032, h: 3024 });
    expect(orientedSize(4032, 3024, 3)).toEqual({ w: 4032, h: 3024 });
  });
});

describe("decodePlan (HEIC path selection)", () => {
  it("HEIC tries createImageBitmap first, then heic2any", () => {
    expect(decodePlan({ name: "IMG_1.HEIC", type: "", size: 1 }, false)).toEqual(["bitmap", "heic2any"]);
    expect(decodePlan({ name: "a.jpg", type: "image/heif", size: 1 }, true)).toEqual(["bitmap", "heic2any"]);
  });
  it("probed JPEG resizes on decode, then falls back to full decode", () => {
    expect(decodePlan({ name: "a.jpg", type: "image/jpeg", size: 1 }, true)).toEqual(["bitmap-resize", "bitmap", "element"]);
    expect(decodePlan({ name: "a.gif", type: "image/gif", size: 1 }, false)).toEqual(["bitmap", "element"]);
  });
});

describe("serial queue", () => {
  it("runs tasks one at a time in order, failures do not stop the queue", async () => {
    const q = createSerialQueue();
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (name: string, ms: number, fail = false) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      active--;
      if (fail) throw new Error(name);
      return name;
    };
    const results = await Promise.allSettled([q(task("a", 20)), q(task("b", 1, true)), q(task("c", 5))]);
    expect(maxActive).toBe(1);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("progress label", () => {
    expect(progressLabel(3, 8)).toBe("боловсруулж байна 3/8");
  });
});

describe("autoContrast", () => {
  it("stretches a low-contrast gray range to 0–255 and outputs gray", () => {
    const n = 100;
    const d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const v = 100 + Math.round((i / (n - 1)) * 50);
      d.set([v, v, v, 255], i * 4);
    }
    const r = autoContrast(d, 0, 1);
    expect(r).toEqual({ lo: 100, hi: 150 });
    expect(d[0]).toBe(0);
    expect(d[(n - 1) * 4]).toBe(255);
    expect(d[3]).toBe(255);
    expect(d[4]).toBe(d[5]);
  });

  it("flat image only becomes gray", () => {
    const d = new Uint8ClampedArray([200, 0, 0, 255, 200, 0, 0, 255]);
    autoContrast(d);
    expect(d[0]).toBe(d[1]);
    expect(d[0]).toBe(Math.round(0.299 * 200));
  });
});

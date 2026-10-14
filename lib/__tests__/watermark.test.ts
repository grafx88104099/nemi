import { describe, expect, it } from "vitest";

import {
  fitWithin,
  keyOutBackground,
  stampRect,
  watermarkFromOffice,
  STAMP_HEIGHT_RATIO,
  STAMP_WIDTH_RATIO,
} from "@/lib/watermark";

/** w×h зураг: бүх пиксел bg, заасан нүднүүд fg. */
function image(w: number, h: number, bg: number[], fg: number[], fgCells: Array<[number, number]>) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4);
  for (const [x, y] of fgCells) data.set(fg, (y * w + x) * 4);
  return data;
}

const GRAY = [230, 231, 233, 255];
const NAVY = [0, 35, 76, 255];
const CLEAR = [0, 0, 0, 0];

describe("watermarkFromOffice", () => {
  it("унтраалттай эсвэл оффисгүй бол null", () => {
    expect(watermarkFromOffice(null)).toBeNull();
    expect(watermarkFromOffice({ name: "PMC", logo_url: "x", watermark_enabled: false })).toBeNull();
  });

  it("асаалттай бол лого, нэрийг буцаана", () => {
    expect(watermarkFromOffice({ name: "PMC", logo_url: "https://l.png", watermark_enabled: true })).toEqual({
      logoUrl: "https://l.png",
      label: "PMC",
    });
    expect(watermarkFromOffice({ name: "PMC", watermark_enabled: true })).toEqual({ logoUrl: null, label: "PMC" });
  });
});

describe("fitWithin", () => {
  it("том зургийг харьцааг хадгалж багасгана", () => {
    expect(fitWithin(5120, 2880, 2560)).toEqual({ w: 2560, h: 1440 });
    expect(fitWithin(3000, 4000, 2560)).toEqual({ w: 1920, h: 2560 });
  });

  it("жижиг зургийг томруулахгүй", () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ w: 800, h: 600 });
  });

  it("хоосон хэмжээнд 0 буцаана", () => {
    expect(fitWithin(0, 100, 2560)).toEqual({ w: 0, h: 0 });
  });
});

describe("stampRect", () => {
  it("хэвтээ зурагт өргөний хувиар хэмжиж төвд байрлуулна", () => {
    const r = stampRect(2000, 1000, 300, 100);
    expect(r.w).toBe(Math.round(2000 * STAMP_WIDTH_RATIO));
    expect(r.h).toBeLessThanOrEqual(Math.round(1000 * STAMP_HEIGHT_RATIO));
    expect(r.x).toBe(Math.round((2000 - r.w) / 2));
    expect(r.y).toBe(Math.round((1000 - r.h) / 2));
  });

  it("өндрийн хязгаар давамгайлбал өндрөөр нь хэмжинэ", () => {
    const r = stampRect(1000, 300, 100, 100);
    expect(r.h).toBe(Math.round(300 * STAMP_HEIGHT_RATIO));
    expect(r.w).toBe(r.h);
  });

  it("хоосон тэмдэгт 0 хэмжээ", () => {
    expect(stampRect(100, 100, 0, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("keyOutBackground", () => {
  it("битүү дэвсгэрийг тунгалаг болгож тэмдгийн хүрээг олно", () => {
    const data = image(6, 5, GRAY, NAVY, [[2, 1], [3, 1], [2, 2], [3, 3]]);
    const box = keyOutBackground(data, 6, 5);
    expect(box).toEqual({ x: 2, y: 1, w: 2, h: 3 });
    expect(data[3]).toBe(0); // (0,0) дэвсгэр арилсан
    expect(data[(1 * 6 + 2) * 4 + 3]).toBe(255); // тэмдэг хэвээр
  });

  it("тунгалаг дэвсгэртэй PNG-д зөвхөн хүрээг тооцно", () => {
    const data = image(4, 4, CLEAR, NAVY, [[1, 2]]);
    expect(keyOutBackground(data, 4, 4)).toEqual({ x: 1, y: 2, w: 1, h: 1 });
    expect(data[(2 * 4 + 1) * 4 + 3]).toBe(255);
  });

  it("дэвсгэрт ойрхон ирмэгийн пикселийг хагас тунгалаг болгоно", () => {
    const edge = [GRAY[0] - 60, GRAY[1] - 60, GRAY[2] - 60, 255]; // зай 60: 40 < 60 < 80
    const data = image(3, 3, GRAY, edge, [[1, 1]]);
    keyOutBackground(data, 3, 3, 40);
    const a = data[(1 * 3 + 1) * 4 + 3];
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });

  it("зөвхөн дэвсгэртэй зурагт null", () => {
    expect(keyOutBackground(image(3, 3, GRAY, NAVY, []), 3, 3)).toBeNull();
  });
});

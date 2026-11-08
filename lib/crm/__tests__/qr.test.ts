import { describe, expect, it } from "vitest";

import {
  addEccAndInterleave,
  dataCodewords,
  encodeQr,
  formatBits,
  functionModules,
  maskBit,
  qrSvgPath,
  rsDivisor,
  rsRemainder,
  versionBits,
} from "@/lib/crm/qr";

/** Тест доторх бие даасан уншигч: формат → маск арилгах → кодын үг → RS синдром → байт сегмент. */
function decode(m: boolean[][]): { text: string; syndromesOk: boolean; mask: number } {
  const size = m.length;
  const ver = (size - 17) / 4;
  // Форматын эхний хуулбар
  let fmt = 0;
  const read: [number, number][] = [];
  for (let i = 0; i <= 5; i++) read.push([8, i]);
  read.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) read.push([14 - i, 8]);
  read.forEach(([x, y], i) => {
    if (m[y][x]) fmt |= 1 << i;
  });
  let mask = -1;
  for (let k = 0; k < 8; k++) if (formatBits(k) === fmt) mask = k;
  if (mask < 0) throw new Error("format");
  const fn = functionModules(ver);
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x]) bits.push((m[y][x] !== maskBit(mask, x, y)) ? 1 : 0);
      }
    }
  }
  const raw: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) raw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // Блок салгах (M түвшин)
  const eccPer = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26][ver];
  const nb = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5][ver];
  const total = raw.length;
  const short = nb - (total % nb);
  const shortLen = Math.floor(total / nb);
  const blocks: number[][] = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < nb; j++) {
      if (i === shortLen - eccPer && j < short) continue; // богино блокийн дүүргэлтийн байрлал
      blocks[j].push(raw[k++]);
    }
  }
  // Богино блокийн data хэсэг нэгээр богино — interleave дараалал: data баганууд, дараа нь ECC.
  const div = rsDivisor(eccPer);
  let ok = true;
  const data: number[] = [];
  for (let j = 0; j < nb; j++) {
    const len = j < short ? shortLen : shortLen + 1;
    const b = blocks[j].slice(0, len);
    const dat = b.slice(0, len - eccPer);
    const ecc = b.slice(len - eccPer);
    if (rsRemainder(dat, div).join(",") !== ecc.join(",")) ok = false;
    data.push(...dat);
  }
  const dbits = data.flatMap((v) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (v >> s) & 1));
  const take = (from: number, n: number) => parseInt(dbits.slice(from, from + n).join(""), 2);
  expect(take(0, 4)).toBe(0b0100);
  const ccBits = ver <= 9 ? 8 : 16;
  const len = take(4, ccBits);
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) bytes.push(take(4 + ccBits + i * 8, 8));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), syndromesOk: ok, mask };
}

describe("QR кодлогч", () => {
  it("Reed–Solomon: стандартын жишээ (1-M)", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("формат ба хувилбарын бит стандартын хүснэгттэй таарна", () => {
    expect(formatBits(0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });

  it("өгөгдлийн багтаамж (M): 1→16, 5→86, 10→216", () => {
    expect(dataCodewords(1)).toBe(16);
    expect(dataCodewords(5)).toBe(86);
    expect(dataCodewords(10)).toBe(216);
  });

  it("interleave нь бүх кодын үгийг хадгална", () => {
    const data = Array.from({ length: dataCodewords(6) }, (_, i) => i % 256);
    expect(addEccAndInterleave(data, 6)).toHaveLength(172);
  });

  for (const text of [
    "https://www.nemi.mn/q/ABCDEFGHJKLMNP",
    "https://www.nemi.mn/q/" + "X".repeat(60),
    "Нээлттэй үзлэг — Зайсан",
    "https://www.nemi.mn/c/" + "a".repeat(150),
  ]) {
    it(`буцааж уншигдана: ${text.slice(0, 32)}…`, () => {
      const q = encodeQr(text);
      const size = q.size;
      // Хайгч хэв: булан бүрт 7×7 харанхуй хүрээ
      for (const [ox, oy] of [
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
      ]) {
        expect(q.modules[oy][ox]).toBe(true);
        expect(q.modules[oy + 1][ox + 1]).toBe(false);
        expect(q.modules[oy + 3][ox + 3]).toBe(true);
      }
      // Цагийн хэв
      for (let i = 8; i < size - 8; i++) expect(q.modules[6][i]).toBe(i % 2 === 0);
      expect(q.modules[size - 8][8]).toBe(true);
      const d = decode(q.modules);
      expect(d.syndromesOk).toBe(true);
      expect(d.text).toBe(text);
    });
  }

  it("хэт урт текстэд алдаа өгнө", () => {
    expect(() => encodeQr("x".repeat(400))).toThrow();
  });

  it("SVG зам харанхуй модулийн тоотой", () => {
    const q = encodeQr("nemi");
    const dark = q.modules.flat().filter(Boolean).length;
    expect(qrSvgPath(q).split("M").length - 1).toBe(dark);
  });
});

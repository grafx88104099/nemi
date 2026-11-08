/**
 * QR код үүсгэгч (ISO/IEC 18004) — зөвхөн байт горим, алдаа засварын M
 * түвшин, 1–10 хувилбар (≈ 213 байт хүртэлх холбоос). Нээлттэй үзлэгийн
 * болон үл хөдлөхийн QR-д (R9). Гадны сангүй; алгоритм нь нийтэд
 * танигдсан стандарт аргачлалыг дагана.
 */

export type QrMatrix = { size: number; modules: boolean[][] };

// M түвшин: блок бүрийн алдаа засварын кодын үг, блокийн тоо (хувилбар 1–10).
const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;
const ECC_FORMAT_BITS_M = 0;

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

export function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];
}

// ── Reed–Solomon (GF(2^8), 0x11D) ─────────────────────────

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return result;
}

// ── Формат, хувилбарын бит ───────────────────────────────

export function formatBits(mask: number): number {
  const data = (ECC_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

export function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ── Өгөгдөл ──────────────────────────────────────────────

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

/** Байт горимын бит урсгал → кодын үгс (дүүргэлттэй). */
export function encodeData(bytes: number[], ver: number): number[] {
  const capacityBits = dataCodewords(ver) * 8;
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  if (bits.length > capacityBits) throw new Error("QR: өгөгдөл хэт урт");
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}

export function addEccAndInterleave(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS_M[ver];
  const blockEccLen = ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// ── Матриц ───────────────────────────────────────────────

class Builder {
  size: number;
  modules: boolean[][];
  isFunction: boolean[][];
  constructor(public ver: number) {
    this.size = ver * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  setFn(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }
  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(this.size - 4, 3);
    this.finder(3, this.size - 4);
    const pos = alignmentPositions(this.ver, this.size);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alignment(pos[i], pos[j]);
      }
    }
    this.drawFormat(0);
    this.drawVersion();
  }
  finder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }
  alignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(mask: number) {
    const bits = formatBits(mask);
    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(bits, i));
    this.setFn(8, 7, bit(bits, 6));
    this.setFn(8, 8, bit(bits, 7));
    this.setFn(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.setFn(this.size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.setFn(8, this.size - 15 + i, bit(bits, i));
    this.setFn(8, this.size - 8, true);
  }
  drawVersion() {
    if (this.ver < 7) return;
    const bits = versionBits(this.ver);
    for (let i = 0; i < 18; i++) {
      const b = bit(bits, i);
      const a = this.size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      this.setFn(a, c, b);
      this.setFn(c, a, b);
    }
  }
  drawCodewords(data: number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        if (maskBit(mask, x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
}

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Масканы торгууль (стандартын 4 дүрэм). */
export function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const lines: string[] = [];
  for (let y = 0; y < size; y++) lines.push(m[y].map((v) => (v ? "1" : "0")).join(""));
  for (let x = 0; x < size; x++) lines.push(m.map((row) => (row[x] ? "1" : "0")).join(""));
  for (const line of lines) {
    for (const run of line.match(/0{5,}|1{5,}/g) ?? []) score += 3 + (run.length - 5);
    const padded = `0000${line}0000`;
    for (const pat of ["10111010000", "00001011101"]) {
      let idx = padded.indexOf(pat);
      while (idx !== -1) {
        score += 40;
        idx = padded.indexOf(pat, idx + 1);
      }
    }
  }
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

/** Функциональ модулиудын (хайгч, цаг, формат…) газрын зураг — шалгалтад. */
export function functionModules(ver: number): boolean[][] {
  const b = new Builder(ver);
  b.drawFunctionPatterns();
  return b.isFunction;
}

/** Текстээс QR матриц. Хамгийн бага тохирох хувилбар, хамгийн бага торгуультай маск. */
export function encodeQr(text: string): QrMatrix {
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error("QR: өгөгдөл хэт урт");
  const codewords = addEccAndInterleave(encodeData(bytes, ver), ver);
  let best: { mask: number; score: number; modules: boolean[][] } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const b = new Builder(ver);
    b.drawFunctionPatterns();
    b.drawCodewords(codewords);
    b.applyMask(mask);
    b.drawFormat(mask);
    const score = penalty(b.modules);
    if (!best || score < best.score) best = { mask, score, modules: b.modules };
  }
  return { size: ver * 4 + 17, modules: best!.modules };
}

/** SVG path ('M x y h1 v1 h-1 z' бүр нэг харанхуй модуль), border = чимэг зай. */
export function qrSvgPath(q: QrMatrix, border = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++) if (q.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`);
  return parts.join("");
}

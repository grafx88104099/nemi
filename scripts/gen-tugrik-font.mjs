// ₮ (U+20AE)-ийн ганц глифтэй Inter variable subset (WOFF 1.0) үүсгэнэ.
// Зорилго: үнэ бүрийн «₮» нь Google Inter-ийн 85 KB latin-ext файлыг татуулахгүй
// (app/layout.tsx → next/font/local, unicode-range U+20AE).
//
// Ашиглах: node scripts/gen-tugrik-font.mjs <Inter latin-ext .woff2>
//   Эх файл: `next build`-ийн .next/static/media/*.woff2 дундаас U+20AE агуулсан
//   Inter latin-ext файл (эсвэл Google Fonts-ын Inter latin-ext variable woff2).
// Гаралт: app/fonts/inter-tugrik.woff
//
// Inter — SIL Open Font License 1.1 (docs/brand/LICENSES.md). Subset хийх зөвшөөрөлтэй;
// name хүснэгт (зохиогчийн эрх, лиценз) хэвээр хуулагдана.
// wght тэнхлэг (100–900) хадгалагдана: glyf + gvar + fvar + avar.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const fontkit = require("next/dist/compiled/@next/font/dist/fontkit/index.js").default;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/gen-tugrik-font.mjs <Inter-latin-ext.woff2>");
  process.exit(1);
}
const OUT = new URL("../app/fonts/inter-tugrik.woff", import.meta.url);
const CP = 0x20ae;

const font = fontkit(readFileSync(src));
const glyph = font.glyphForCodePoint(CP);
if (!glyph || glyph.id === 0) throw new Error("U+20AE олдсонгүй");
void glyph.path; // WOFF2 glyf transform-ийг ажиллуулна
const decoded = glyph._decode();
if (!decoded || decoded.numberOfContours <= 0) throw new Error("₮ энгийн (simple) глиф биш");
const metric = font.hmtx.metrics.get ? font.hmtx.metrics.get(glyph.id) : font.hmtx.metrics[glyph.id];

function raw(tag) {
  const entry = font.directory.tables[tag];
  if (!entry) throw new Error(`${tag} хүснэгт алга`);
  const s = font._getTableStream(tag);
  return Buffer.from(s.buffer.subarray(s.pos, s.pos + entry.length));
}

// ── glyf / loca ────────────────────────────────────────────────────────
const pts = decoded.points;
const ends = [];
pts.forEach((p, i) => {
  if (p.endContour) ends.push(i);
});
if (ends[ends.length - 1] !== pts.length - 1) ends.push(pts.length - 1);
const xs = pts.map((p) => p.x);
const ys = pts.map((p) => p.y);
const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
const g = [];
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff);
  return b;
};
const i16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
g.push(i16(ends.length), ...bbox.map(i16), ...ends.map(u16), u16(0));
g.push(Buffer.from(pts.map((p) => (p.onCurve ? 1 : 0))));
let px = 0;
let py = 0;
for (const p of pts) {
  g.push(i16(p.x - px));
  px = p.x;
}
for (const p of pts) {
  g.push(i16(p.y - py));
  py = p.y;
}
let glyf = Buffer.concat(g);
glyf = Buffer.concat([glyf, Buffer.alloc((4 - (glyf.length % 4)) % 4)]);
const loca = Buffer.concat([u32(0), u32(0), u32(glyf.length)]);

// ── gvar: ганц глифийн variation data + shared tuples ──────────────────
const gv = raw("gvar");
const axisCount = gv.readUInt16BE(4);
const sharedTupleCount = gv.readUInt16BE(6);
const sharedOff = gv.readUInt32BE(8);
const glyphCount = gv.readUInt16BE(12);
const gvFlags = gv.readUInt16BE(14);
const dataArr = gv.readUInt32BE(16);
const off = (i) => (gvFlags & 1 ? gv.readUInt32BE(20 + i * 4) : gv.readUInt16BE(20 + i * 2) * 2);
if (glyph.id >= glyphCount) throw new Error("gvar glyphCount");
const blob = gv.subarray(dataArr + off(glyph.id), dataArr + off(glyph.id + 1));
const shared = gv.subarray(sharedOff, sharedOff + sharedTupleCount * axisCount * 2);
const gvHead = 20 + 3 * 4;
const gvData = gvHead + shared.length + ((4 - ((gvHead + shared.length) % 4)) % 4);
const gvar = Buffer.concat([
  u16(1),
  u16(0),
  u16(axisCount),
  u16(sharedTupleCount),
  u32(gvHead),
  u16(2),
  u16(1), // long offsets
  u32(gvData),
  u32(0),
  u32(0),
  u32(blob.length),
  shared,
  Buffer.alloc(gvData - gvHead - shared.length),
  blob,
]);

// ── metrics, cmap, head, hhea, maxp, OS/2, post ───────────────────────
const hmtx = Buffer.concat([u16(metric.advance), i16(0), u16(metric.advance), i16(metric.bearing)]);
const cmap = Buffer.concat([
  u16(0), u16(1), u16(3), u16(1), u32(12),
  // format 4, 2 сегмент
  u16(4), u16(32), u16(0), u16(4), u16(4), u16(1), u16(0),
  u16(CP), u16(0xffff), u16(0),
  u16(CP), u16(0xffff),
  u16((1 - CP) & 0xffff), u16(1),
  u16(0), u16(0),
]);
const head = raw("head");
head.writeUInt32BE(0, 8);
bbox.forEach((v, i) => head.writeInt16BE(v, 36 + i * 2));
head.writeInt16BE(1, 50); // indexToLocFormat = long
const hhea = raw("hhea");
hhea.writeUInt16BE(2, 34);
const maxp = raw("maxp");
maxp.writeUInt16BE(2, 4);
const os2 = raw("OS/2");
os2.writeUInt16BE(CP, 64);
os2.writeUInt16BE(CP, 66);
const post = Buffer.from(raw("post").subarray(0, 32));
post.writeUInt32BE(0x00030000, 0);

const tables = {
  "OS/2": os2,
  avar: raw("avar"),
  cmap,
  fvar: raw("fvar"),
  glyf,
  gvar,
  head,
  hhea,
  hmtx,
  loca,
  maxp,
  name: raw("name"),
  post,
};

function checksum(buf) {
  const b = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s = (s + b.readUInt32BE(i)) >>> 0;
  return s;
}
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const tags = Object.keys(tables).sort();

// sfnt (checkSumAdjustment тооцоход)
const n = tags.length;
const es = Math.floor(Math.log2(n));
let sfntOff = 12 + 16 * n;
const dir = [];
const body = [];
const sums = {}; // head: checkSumAdjustment = 0 үеийн checksum (sfnt + WOFF дүрэм)
for (const t of tags) {
  sums[t] = checksum(tables[t]);
  dir.push(Buffer.from(t.padEnd(4, " "), "latin1"), u32(sums[t]), u32(sfntOff), u32(tables[t].length));
  body.push(pad4(tables[t]));
  sfntOff += pad4(tables[t]).length;
}
const sfnt = Buffer.concat([u32(0x00010000), u16(n), u16(16 * 2 ** es), u16(es), u16(n * 16 - 16 * 2 ** es), ...dir, ...body]);
head.writeUInt32BE((0xb1b0afba - checksum(sfnt)) >>> 0, 8);

// WOFF 1.0
const entries = [];
const datas = [];
let woffOff = 44 + 20 * n;
for (const t of tags) {
  const orig = tables[t];
  const z = deflateSync(orig, { level: 9 });
  const data = z.length < orig.length ? z : orig;
  entries.push(Buffer.from(t.padEnd(4, " "), "latin1"), u32(woffOff), u32(data.length), u32(orig.length), u32(sums[t]));
  datas.push(pad4(data));
  woffOff += pad4(data).length;
}
const woff = Buffer.concat([
  Buffer.from("wOFF", "latin1"),
  u32(0x00010000),
  u32(woffOff),
  u16(n),
  u16(0),
  u32(sfnt.length),
  u16(1),
  u16(0),
  u32(0), u32(0), u32(0), u32(0), u32(0),
  ...entries,
  ...datas,
]);
writeFileSync(OUT, woff);
console.log(`app/fonts/inter-tugrik.woff: ${woff.length} B (sfnt ${sfnt.length} B, ${pts.length} цэг, gvar ${blob.length} B)`);

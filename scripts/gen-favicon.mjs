// Нэг удаагийн генератор: app/icon.svg → app/favicon.ico (32×32 + 48×48 PNG-тэй ICO)
// ба app/apple-icon.png (180×180, iOS нүүр дэлгэц).
// Ажиллуулах: node scripts/gen-favicon.mjs   (sharp нь next-ийн хамаарлаар суусан).
// /favicon.ico-г proxy.ts matcher алгасдаг тул файлыг УСТГАХГҮЙ, зөвхөн солино.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const svg = readFileSync(`${root}app/icon.svg`);
const SIZES = [32, 48];

const pngs = await Promise.all(
  SIZES.map((s) => sharp(svg, { density: Math.ceil((72 * s) / 64) * 4 }).resize(s, s).png().toBuffer())
);

// ICO: ICONDIR (6 байт) + ICONDIRENTRY (16 байт × n) + PNG өгөгдөл (Vista+ PNG-тэй ICO).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(pngs.length, 4);

let offset = 6 + 16 * pngs.length;
const entries = pngs.map((png, i) => {
  const s = SIZES[i];
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); // width
  e.writeUInt8(s >= 256 ? 0 : s, 1); // height
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});

const ico = Buffer.concat([header, ...entries, ...pngs]);
writeFileSync(`${root}app/favicon.ico`, ico);
console.log(`app/favicon.ico: ${ico.length} байт (${SIZES.join(", ")} px)`);

// apple-icon: iOS булангаа өөрөө дугуйлж, тунгалаг хэсгийг ХАРААР дүүргэдэг тул
// дугуйрсан булангүй (rx-гүй) бүтэн ink дэвсгэр, alpha-гүй PNG.
const appleSvg = Buffer.from(svg.toString("utf8").replace(/\s+rx="[^"]*"/, ""));
const apple = await sharp(appleSvg, { density: Math.ceil((72 * 180) / 64) * 2 })
  .resize(180, 180)
  .flatten({ background: "#0f1b2d" })
  .removeAlpha()
  .png()
  .toBuffer();
writeFileSync(`${root}app/apple-icon.png`, apple);
console.log(`app/apple-icon.png: ${apple.length} байт (180 px, alpha-гүй)`);

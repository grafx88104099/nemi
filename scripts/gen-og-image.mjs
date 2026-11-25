// Нэг удаагийн генератор: нийтийн сайтын анхдагч OG зураг (1200×630 PNG) →
// public/brand/og-default.png (lib/seo/site.ts ROOT_OG_IMAGE).
// Facebook/Viber/Twitter-ийн том preview-д 1.91:1 харьцаа хэрэгтэй — 512px дөрвөлжин
// апп icon жижиг, тайрагдаж харагддаг байсан.
// Ажиллуулах: node scripts/gen-og-image.mjs   (sharp нь next-ийн хамаарлаар суусан).
// Бичвэрийг SVG <text>-ээр (system фонт: Segoe UI / Arial — кирилл) зурна; өөр машинд
// фонт өөр байж болох тул үр дүнг нүдээр шалгаад commit хийнэ.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const W = 1200;
const H = 630;

// Лого — components/brand/Logo.tsx-ийн SVG (JSX → энгийн SVG атрибут).
const logoTsx = readFileSync(`${root}components/brand/Logo.tsx`, "utf8");
const logoInner = logoTsx
  .slice(logoTsx.indexOf("<g "), logoTsx.lastIndexOf("</svg>"))
  .replace(/fill=\{color\}/g, 'fill="#1f2937"');

// Тэнгэрийн шугам — public/brand/skyline-dawn.svg (1440×240), доод хэсэгт.
const skyline = readFileSync(`${root}public/brand/skyline-dawn.svg`);
const skyH = Math.round((W / 1440) * 240);
const skyPng = await sharp(skyline, { density: 144 }).resize(W, skyH, { fit: "fill" }).png().toBuffer();

const logoW = 560;
const logoH = Math.round((logoW / 1067) * 324);
const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fbf7f1"/>
  <svg x="${(W - logoW) / 2}" y="110" width="${logoW}" height="${logoH}" viewBox="0 0 1067 324">${logoInner}</svg>
  <text x="${W / 2}" y="${110 + logoH + 70}" text-anchor="middle"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="40" font-weight="600" fill="#334155">Улаанбаатарын үл хөдлөх хөрөнгө нэг дор</text>
</svg>`;

const png = await sharp(Buffer.from(base))
  .composite([{ input: skyPng, top: H - skyH, left: 0 }])
  .flatten({ background: "#fbf7f1" })
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();

writeFileSync(`${root}public/brand/og-default.png`, png);
const meta = await sharp(png).metadata();
console.log(`public/brand/og-default.png: ${png.length} байт (${meta.width}×${meta.height})`);

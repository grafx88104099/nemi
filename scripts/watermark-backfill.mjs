// ============================================================
// Оффисын одоо байгаа зарын зурагт лого тамга нөхөж дарах (backfill).
//
// Эх зургийг storage-д ХЭВЭЭР үлдээж, тамгатай хувийг `listings/wm/` дор шинэ
// файлаар хадгална; дараа нь listing_photos.url, listings.photo холбоосыг сольж,
// буцаах manifest бичнэ. Аль хэдийн тамгатай зургийг (upload үед дарагдсан)
// зургийн агуулгаас илрүүлж алгасна — давхар тамга дарахгүй.
// Тамганы алгоритм нь вэбийн upload-тай ижил lib/watermark.ts-ийг ашиглана.
//
//   node scripts/watermark-backfill.mjs --office <office_id>              # шинжилгээ (юу ч өөрчлөхгүй)
//   node scripts/watermark-backfill.mjs --office <id> --sample 3 --out <dir>  # жишээ зураг локалд
//   node scripts/watermark-backfill.mjs --office <id> --apply --manifest <file.json>
//   node scripts/watermark-backfill.mjs --rollback <file.json>
//
// Тамганы лого солигдсон бол: өмнөх тамгатай зургийг эх зургаас нь шинэ логоор
// дахин үүсгэхийн тулд өмнөх manifest-уудыг --originals <a.json,b.json> гэж өгнө.
// Лого бүрийн тамга wm/<логоны хэш>/ дор тусдаа хадгалагдана (CDN кэш хуучрахгүй).
//
// .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
// ============================================================
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

import {
  WATERMARK_MAX_DIM,
  WATERMARK_OPACITY,
  fitWithin,
  keyOutBackground,
  stampRect,
} from "../lib/watermark.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "listings";
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;
const WM_DIR = "wm/";
const LOGO_WORK_MAX = 800;
const JPEG_QUALITY = 88;
const CONCURRENCY = 4;

// ── Аргумент, орчин ──
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

function dbClient() {
  const u = new URL(process.env.SUPABASE_DB_URL);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
  });
}
const storage = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage.from(BUCKET);

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Лого тэмдэг (вэбийн buildLogoMark-тай ижил) ──
async function buildMark(logoUrl) {
  const { data, info } = await sharp(await fetchBuf(logoUrl))
    .resize(LOGO_WORK_MAX, LOGO_WORK_MAX, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const box = keyOutBackground(px, info.width, info.height);
  if (!box) throw new Error("Логоноос тэмдэг олдсонгүй");
  const png = await sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .png()
    .toBuffer();
  const mark = { png, w: box.w, h: box.h };
  mark.luma = await markLuma(mark);
  return mark;
}

/** Тэмдгийг өгсөн хэмжээнд RGBA болгож, alpha-г тамганы тунгалагаар үржүүлнэ. */
async function markLayer(mark, w, h, opacity) {
  const { data } = await sharp(mark.png).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** Тэмдгийн битүү пикселүүдийн дундаж гэрэлтэлт (0–255). */
async function markLuma(mark) {
  const { data } = await sharp(mark.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 245) continue;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Тамга байгаа эсэхийг илрүүлнэ. Тамга дарахад тэмдэг доорх пиксел яг
 * `дотор = (1−α)·эх + α·тэмдэг` болдог. Тэмдгийн ирмэгийн хоёр талын хос
 * пикселийг (k px зайтай, дотор нь бүрэн тэмдэг, гадна нь бүрэн тэмдэггүй)
 * харьцуулахад эх зураг ирмэг даяар бараг ижил (эх ≈ гадна) тул тунгалагийг
 * шууд тооцож болно: α = (гадна − дотор) / (гадна − тэмдэг). Тамгатай зурагт
 * α ≈ 0.35, тамгагүйд ≈ 0 — тэмдэг бараан ч, цагаан ч ижил ажиллана.
 * Байшингийн шугам зэрэг ирмэгтэй санамсаргүй давхцсан хосыг медиан шүүнэ.
 */
async function stampScore(buf, mark) {
  const { data, info } = await sharp(buf).rotate().greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const r = stampRect(W, H, mark.w, mark.h);
  if (r.w < 16 || r.h < 16) return { alpha: 0, pairs: 0 };
  const m = await sharp(mark.png).resize(r.w, r.h, { fit: "fill" }).ensureAlpha().extractChannel(3).raw().toBuffer();
  const k = Math.max(3, Math.round(r.w / 120));
  const maskAt = (x, y) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : m[y * r.w + x]);
  const alphas = [];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (m[y * r.w + x] < 245) continue;
      for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
        if (maskAt(x + dx, y + dy) > 5) continue;
        const gx = r.x + x + dx, gy = r.y + y + dy;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        const outV = data[gy * W + gx];
        const span = outV - mark.luma;
        if (Math.abs(span) < 40) continue; // эх нь тэмдгийн өнгөтэй ойр — α тодорхойгүй
        alphas.push((outV - data[(r.y + y) * W + r.x + x]) / span);
      }
    }
  }
  if (!alphas.length) return { alpha: 0, pairs: 0 };
  alphas.sort((a, b) => a - b);
  return { alpha: alphas[Math.floor(alphas.length / 2)], pairs: alphas.length };
}

/** Хангалттай хос байх үед медиан α нь 0 (тамгагүй) ба 0.35-ын (тамгатай) дунджаас дээш бол тамгатай. */
const MIN_PAIRS = 300;
const STAMP_ALPHA_THRESHOLD = WATERMARK_OPACITY / 2;
const isStamped = ({ alpha, pairs }) => pairs >= MIN_PAIRS && alpha > STAMP_ALPHA_THRESHOLD;
const isUncertain = ({ pairs }) => pairs < MIN_PAIRS;
const fmtScore = ({ alpha, pairs }) => `α=${alpha.toFixed(3)} pairs=${pairs}`;

async function stampBuffer(buf, mark) {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(WATERMARK_MAX_DIM, WATERMARK_MAX_DIM, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  const { w, h } = fitWithin(info.width, info.height, WATERMARK_MAX_DIM);
  const r = stampRect(w, h, mark.w, mark.h);
  const layer = await markLayer(mark, r.w, r.h, WATERMARK_OPACITY);
  return sharp(data)
    .composite([{ input: layer, left: r.x, top: r.y }])
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

const objectName = (url) => decodeURIComponent(new URL(url).pathname.split(PUBLIC_PREFIX)[1] ?? "");
/** Логоны хувилбарын богино хэш — лого солигдвол тамгатай файл шинэ замд очно. */
const logoVersion = (logoUrl) => crypto.createHash("sha1").update(logoUrl).digest("hex").slice(0, 8);
/** Эх зургийн нэрээс тамгатай файлын зам (эх нэр нь wm/-гүй байх ёстой). */
const wmName = (ver, originalName) => `${WM_DIR}${ver}/${originalName.replace(/\.[^.]+$/, "")}.jpg`;

/** Өмнөх manifest-уудаас «тамгатай URL → эх URL» зураглал. */
function loadOriginals(files) {
  const map = new Map();
  for (const f of files) {
    for (const r of JSON.parse(fs.readFileSync(f, "utf8")).replaced ?? []) map.set(r.to, r.original ?? r.from);
  }
  // Гинжин зураглалыг (v1 → v2 → ...) эх рүү нь хүртэл задална.
  for (const [k, v] of map) {
    let cur = v;
    for (let i = 0; i < 10 && map.has(cur); i++) cur = map.get(cur);
    map.set(k, cur);
  }
  return map;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ── Буцаах ──
async function rollback(file) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const db = dbClient();
  await db.connect();
  try {
    await db.query("begin");
    let photos = 0, covers = 0;
    for (const { from, to } of manifest.replaced) {
      photos += (await db.query("update listing_photos set url = $1 where url = $2", [from, to])).rowCount;
      covers += (await db.query("update listings set photo = $1 where photo = $2", [from, to])).rowCount;
    }
    await db.query("commit");
    console.log(`Буцаалаа: listing_photos ${photos} мөр, listings.photo ${covers} мөр. (wm/ файлууд storage-д үлдсэн)`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

async function main() {
  if (has("--rollback")) return rollback(arg("--rollback"));

  const officeId = arg("--office");
  if (!officeId) throw new Error("--office <office_id> заавал");
  const apply = has("--apply");
  const sampleN = Number(arg("--sample") ?? 0);

  const db = dbClient();
  await db.connect();
  const office = (await db.query("select name, logo_url, watermark_logo_url from offices where id = $1", [officeId])).rows[0];
  const logoUrl = office?.watermark_logo_url || office?.logo_url;
  if (!logoUrl) throw new Error("Оффис эсвэл лого олдсонгүй");
  const ver = logoVersion(logoUrl);
  const originals = loadOriginals((arg("--originals") ?? "").split(",").filter(Boolean));

  // Оффисын агентуудын зарын бүх зураг + ковер (давхардалгүй).
  const rows = (await db.query(
    `select lp.url from listing_photos lp
       join listings l on l.id = lp.listing_id join agents a on a.id = l.agent_id
      where a.office_id = $1
     union
     select l.photo from listings l join agents a on a.id = l.agent_id
      where a.office_id = $1 and l.photo is not null`,
    [officeId]
  )).rows.map((r) => r.url);
  const own = rows.filter((u) => u.includes(PUBLIC_PREFIX));
  const current = own.filter((u) => objectName(u).startsWith(`${WM_DIR}${ver}/`));
  // Өмнөх логоор тамгатай: эх зураг нь manifest-д байвал эхээс нь дахин үүсгэнэ.
  const oldStamped = own.filter((u) => objectName(u).startsWith(WM_DIR) && !current.includes(u));
  const restamp = oldStamped.filter((u) => originals.has(u)).map((u) => ({ url: u, source: originals.get(u) }));
  const orphan = oldStamped.filter((u) => !originals.has(u));
  const todo = own.filter((u) => !objectName(u).startsWith(WM_DIR));
  console.log(
    `${office.name}: ${rows.length} зураг — одоогийн логоор тамгатай ${current.length}, ` +
      `өмнөх логоор тамгатай ${oldStamped.length} (эх нь олдсон ${restamp.length}), тамгагүй ${todo.length}`
  );
  if (orphan.length) {
    console.log(`  АНХААР: ${orphan.length} зургийн эх олдсонгүй (--originals өгнө үү) — алгасна:`);
    for (const u of orphan.slice(0, 10)) console.log(`    ${u}`);
  }

  const mark = await buildMark(logoUrl);
  console.log(`Тэмдэг: ${mark.w}x${mark.h} (хувилбар ${ver})`);

  if (sampleN > 0) {
    const outDir = arg("--out") ?? path.join(ROOT, "watermark-sample");
    fs.mkdirSync(outDir, { recursive: true });
    const sources = [...restamp.map((r) => r.source), ...todo];
    for (const [i, url] of sources.slice(0, sampleN).entries()) {
      const buf = await fetchBuf(url);
      const score = await stampScore(buf, mark);
      const stamped = await stampBuffer(buf, mark);
      const again = await stampScore(stamped, mark);
      fs.writeFileSync(path.join(outDir, `sample-${i}.jpg`), stamped);
      console.log(`sample-${i}: эх ${fmtScore(score)} → ${isStamped(score) ? "ТАМГАТАЙ" : "тамгагүй"} | дарсны дараа ${fmtScore(again)} → ${isStamped(again) ? "ТАМГАТАЙ" : "тамгагүй"}`);
    }
    await db.end();
    return;
  }

  // Шинжилгээ: зураг бүрийн тамганы оноо.
  let done = 0;
  const analysed = await pool(todo, CONCURRENCY, async (url) => {
    try {
      const buf = await fetchBuf(url);
      const score = await stampScore(buf, mark);
      if (++done % 50 === 0) console.log(`  шинжилсэн ${done}/${todo.length}`);
      return { url, score, stamped: isStamped(score) };
    } catch (e) {
      return { url, error: e.message };
    }
  });
  const errors = analysed.filter((a) => a.error);
  const already = analysed.filter((a) => a.stamped);
  const uncertain = analysed.filter((a) => !a.error && !a.stamped && isUncertain(a.score));
  const need = analysed.filter((a) => !a.error && !a.stamped && !isUncertain(a.score));
  console.log(
    `Дүн: тамга дарах ${need.length}, шинэ логоор дахин үүсгэх ${restamp.length}, ` +
      `аль хэдийн тамгатай ${already.length}, эргэлзээтэй ${uncertain.length}, татаж чадаагүй ${errors.length}`
  );
  for (const a of already) console.log(`  тамгатай: ${fmtScore(a.score)} ${a.url}`);
  for (const a of uncertain) console.log(`  эргэлзээтэй (алгасна): ${fmtScore(a.score)} ${a.url}`);
  // Босгын ойролцоох тамгагүй зургууд — нүдээр шалгахад.
  const near = need.filter((a) => a.score.alpha > 0.08).sort((x, y) => y.score.alpha - x.score.alpha);
  for (const a of near.slice(0, 15)) console.log(`  босгод ойр (тамгагүй гэж үзсэн): ${fmtScore(a.score)} ${a.url}`);
  const hist = {};
  for (const a of analysed.filter((x) => !x.error && x.score.pairs >= MIN_PAIRS)) {
    const b = (Math.floor(a.score.alpha * 20) / 20).toFixed(2);
    hist[b] = (hist[b] ?? 0) + 1;
  }
  console.log("α-ийн тархалт:", Object.entries(hist).sort().map(([k, v]) => `${k}:${v}`).join("  "));
  for (const a of errors) console.log(`  алдаа: ${a.error} ${a.url}`);

  if (!apply) {
    console.log("\nШинжилгээ л хийлээ — өөрчлөхийн тулд --apply --manifest <файл> нэмнэ.");
    await db.end();
    return;
  }

  const manifestFile = arg("--manifest");
  if (!manifestFile) throw new Error("--apply-д --manifest <файл.json> заавал");
  const bucket = storage();
  const replaced = [];
  // Тамгагүй зураг өөрөө эх; өмнөх логоор тамгатайг эх зургаас нь дахин үүсгэнэ.
  const jobs = [...need.map((a) => ({ url: a.url, source: a.url })), ...restamp];
  done = 0;
  await pool(jobs, CONCURRENCY, async (j) => {
    try {
      const name = wmName(ver, objectName(j.source));
      const out = await stampBuffer(await fetchBuf(j.source), mark);
      const { error } = await bucket.upload(name, out, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      replaced.push({ from: j.url, to: bucket.getPublicUrl(name).data.publicUrl, original: j.source });
    } catch (e) {
      errors.push({ url: j.url, error: e.message });
    }
    if (++done % 50 === 0) console.log(`  тамга дарсан ${done}/${jobs.length}`);
  });

  // Manifest-ийг DB өөрчлөхөөс ӨМНӨ бичнэ — буцаахад заавал хэрэгтэй.
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify({ officeId, office: office.name, replaced, errors }, null, 2));

  await db.query("begin");
  let photos = 0, covers = 0;
  try {
    for (const { from, to } of replaced) {
      photos += (await db.query("update listing_photos set url = $2 where url = $1", [from, to])).rowCount;
      covers += (await db.query("update listings set photo = $2 where photo = $1", [from, to])).rowCount;
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  }
  await db.end();
  console.log(`Дууслаа: ${replaced.length} зураг тамгатай болов (listing_photos ${photos}, ковер ${covers} мөр), алдаа ${errors.length}.`);
  console.log(`Manifest: ${manifestFile}  (буцаах: --rollback ${manifestFile})`);
}

main().catch((e) => {
  console.error("АЛДАА:", e.message);
  process.exit(1);
});

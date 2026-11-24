/**
 * «Зар» табын цэвэр логик (P12, P3) — сервер, клиент, тест гурвуулаа хэрэглэнэ.
 *
 *  - нийтлэх горим: getPublishPreview().link_mode → «одоогийн зарыг шинэчлэх» / «шинэ зар»;
 *  - эх зар ба нийтлэх утгын ялгаа (гарчиг, тайлбар ОРНО);
 *  - баталгаажаагүй нийтийн утга («Зөв» товчтой мөр);
 *  - нийтлэх бичвэрийн эрсдэл (findPublicTextRisks): утас — DB хориглоно, тоот / хаалганы код — сануулга.
 *
 * Эцсийн шалгалт DB дээр (crm2_publish_property, crm2_publish_blockers) — энд зөвхөн урьдчилан харуулна.
 */
import { PUBLISH_CONFIRM_KEYS } from "@/lib/crm2/checklist";
import {
  CURRENCY_SYMBOL,
  PRICE_BASIS_LABEL,
  PRICE_PERIOD_LABEL,
  VIEW_NOTE_LABEL,
} from "@/lib/crm2/labels";
import { findPublicTextRisks, type PublicTextRisk } from "@/lib/crm2/text-privacy";
import type { Crm2PublishLinkCandidate, Crm2PublishLinkMode, Crm2PublishPreview, Json } from "@/lib/crm2/types";
import { FEATURE_KEYS, FEATURE_LABEL, type FeatureKey } from "@/lib/listing-features";

import { listingStatusLabel } from "./listing-status";

// ── Нийтлэх горим ──────────────────────────────────────────────────────────

/** Агентын сонголт: эх зарыг шинэчлэх ('link') эсвэл шинэ зар ('new'). */
export type PublishChoice = "link" | "new";

export const LINK_OPTION_LABEL = "Миний одоогийн зарыг шинэчлэх (зураг хэвээр)";
export const NEW_OPTION_LABEL = "Шинэ зар болгох";

/**
 * Горим бүрт зөвшөөрөгдөх сонголт (R21):
 *  link_only — эх зар идэвхтэй, холбогдоогүй: зөвхөн шинэчлэх (шинэ давхар зар DB-д хориотой);
 *  choice    — эх зар идэвхгүй (ноорог/түр зогссон/буцаасан): шинэчлэх эсвэл шинэ зар;
 *  new_only  — эх заргүй эсвэл холбох боломжгүй: шинэ зар.
 */
export function publishChoices(mode: Crm2PublishLinkMode | null | undefined): PublishChoice[] {
  if (mode === "link_only") return ["link"];
  if (mode === "choice") return ["link", "new"];
  return ["new"];
}

/** Анхдагч сонголт — эх зар байвал түүнийг шинэчлэх (давхар зар үүсгэхгүй). */
export function defaultChoice(mode: Crm2PublishLinkMode | null | undefined): PublishChoice {
  return publishChoices(mode)[0];
}

/** Сонголт тухайн горимд хүчинтэй эсэх (горим өөрчлөгдвөл анхдагч руу буцна). */
export function normalizeChoice(mode: Crm2PublishLinkMode | null | undefined, choice: PublishChoice): PublishChoice {
  return publishChoices(mode).includes(choice) ? choice : defaultChoice(mode);
}

/** Нийтлэх үед дамжуулах холбох аргументууд. «Зургийг солих» нь зөвхөн холбох үед утгатай. */
export function linkArgs(
  choice: PublishChoice,
  candidate: Pick<Crm2PublishLinkCandidate, "listing_id"> | null | undefined,
  replacePhotos: boolean
): { link_listing?: string; replace_photos?: boolean } {
  if (choice !== "link" || !candidate?.listing_id) return {};
  return { link_listing: candidate.listing_id, replace_photos: !!replacePhotos };
}

/** Тамга хэрэгтэй эсэх: зар шинэчлээд зургаа хэвээр үлдээвэл зураг хуулахгүй (тамга шаардлагагүй). */
export function needsWatermark(choice: PublishChoice, linking: boolean, replacePhotos: boolean): boolean {
  return !(choice === "link" && linking && !replacePhotos);
}

// ── Гарчиг, тайлбар ────────────────────────────────────────────────────────

/** Оролтын анхдагч текст: шинэчлэх үед эх зарынх (утсыг нь нуусан), шинэ зар үед CRM-ийн анхдагч. */
export function initialTexts(
  choice: PublishChoice,
  preview: Pick<Crm2PublishPreview, "title" | "description" | "link_candidate"> | null | undefined,
  fallback: { title: string; description: string }
): { title: string; description: string } {
  const c = preview?.link_candidate ?? null;
  if (choice === "link" && c) {
    return { title: c.title ?? fallback.title, description: c.description ?? "" };
  }
  return { title: fallback.title, description: fallback.description };
}

/**
 * Дамжуулах гарчиг/тайлбар. Эх зарыг шинэчлэхэд өөрчлөөгүй текстийг ДАМЖУУЛАХГҮЙ — DB эх зарын
 * текстийг хэвээр үлдээж, доторх утасны дугаарыг нэг удаа нууна (түүхэнд бичнэ).
 * Хоосон утга = DB анхдагч (шинэ зар) эсвэл хэвээр (холбох).
 */
export function textsToSend(
  choice: PublishChoice,
  input: { title: string; description: string },
  candidate: Pick<Crm2PublishLinkCandidate, "title" | "description"> | null | undefined
): { title?: string; description?: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  if (choice === "link" && candidate) {
    const out: { title?: string; description?: string } = {};
    if (title && title !== (candidate.title ?? "").trim()) out.title = title;
    if (description && description !== (candidate.description ?? "").trim()) out.description = description;
    return out;
  }
  return { title, description };
}

/** Нийтэд үнэхээр гарах текст (хоосон бол эх зарын эсвэл анхдагч) — эрсдэлийг үүн дээр шалгана. */
export function effectiveTexts(
  choice: PublishChoice,
  input: { title: string; description: string },
  sources: {
    candidate: Pick<Crm2PublishLinkCandidate, "title" | "description"> | null | undefined;
    defaultTitle: string;
    defaultDescription: string;
  }
): { title: string; description: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  if (choice === "link" && sources.candidate) {
    return {
      title: title || (sources.candidate.title ?? ""),
      description: description || (sources.candidate.description ?? ""),
    };
  }
  return { title: title || sources.defaultTitle, description: description || sources.defaultDescription };
}

// ── Бичвэрийн эрсдэл ───────────────────────────────────────────────────────

export const PUBLIC_RISK_LABEL: Record<PublicTextRisk, string> = {
  phone: "утасны дугаар",
  unit_no: "тоот (хаалганы дугаар)",
  door_code: "орц, хаалганы код",
};

export type TextRiskReport = {
  title: PublicTextRisk[];
  description: PublicTextRisk[];
  /** Утасны дугаар — DB нийтлэхийг хориглоно (алдаа 'description' талбарт). */
  blocking: boolean;
};

export function checkPublishTexts(texts: { title: string; description: string }): TextRiskReport {
  const title = findPublicTextRisks(texts.title);
  const description = findPublicTextRisks(texts.description);
  return { title, description, blocking: title.includes("phone") || description.includes("phone") };
}

/** Тухайн талбарын эрсдэлийн текст (утас → алдаа, бусад → сануулга), эрсдэлгүй бол null. */
export function riskMessage(risks: readonly PublicTextRisk[]): { tone: "error" | "warning"; text: string } | null {
  if (risks.length === 0) return null;
  if (risks.includes("phone")) {
    return { tone: "error", text: "Утасны дугаар бичсэн байна — нийтэд гаргахгүй. Дугаарыг хасна уу (үнийг «сая ₮»-тэй бичнэ)." };
  }
  const what = risks.map((r) => PUBLIC_RISK_LABEL[r]).join(", ");
  return { tone: "warning", text: `${cap(what)} нийтэд харагдана — шаардлагагүй бол хасна уу.` };
}

/**
 * Карт дээрх нийтийн бичвэрийн талбарууд (crm2_publish_phone_fields-ийн жагсаалт, дараалал).
 * Эдгээр нь анхдагч гарчиг/тайлбарт ордог тул утас, тоот, кодыг шалгана.
 */
export const PUBLIC_TEXT_FIELDS = [
  { key: "location_text", label: "Байршил" },
  { key: "advantages", label: "Давуу тал" },
  { key: "condition", label: "Нөхцөл" },
  { key: "view_note", label: VIEW_NOTE_LABEL },
  { key: "availability_note", label: "Боломжийн тайлбар" },
] as const;

export type PublicTextFieldKey = (typeof PUBLIC_TEXT_FIELDS)[number]["key"];

export type PublicTextFinding = { key: PublicTextFieldKey; label: string; risks: PublicTextRisk[] };

export function publicTextFindings(p: Partial<Record<PublicTextFieldKey, string | null>>): PublicTextFinding[] {
  const out: PublicTextFinding[] = [];
  for (const f of PUBLIC_TEXT_FIELDS) {
    const text = p[f.key];
    if (typeof text !== "string" || !text.trim()) continue;
    const risks = findPublicTextRisks(text);
    if (risks.length) out.push({ key: f.key, label: f.label, risks });
  }
  return out;
}

// ── Баталгаажаагүй нийтийн утга ────────────────────────────────────────────

/** crm2_publish_confirm_label-тэй ижил нэр (эхний үсэг томоор). */
export const CONFIRM_KEY_LABEL: Record<(typeof PUBLISH_CONFIRM_KEYS)[number], string> = {
  category: "Ангилал",
  property_type: "Төрөл",
  project: "Төсөл",
  district: "Дүүрэг",
  location_text: "Байршил",
  lat: "Газрын зураг дээрх цэг",
  area_m2: "Талбай",
  rooms: "Өрөө",
  floor: "Давхар",
  building_floors: "Барилгын давхар",
  price: "Үнэ",
  currency: "Валют",
  price_period: "Үнийн хугацаа",
  price_basis: "Үнийн суурь",
  year_in_use: "Ашиглалтад орсон он",
  features: "Онцлог",
  parking_spaces: "Зогсоол",
  rent_advance_months: "Урьдчилгаа",
  rent_deposit_months: "Барьцаа",
  advantages: "Давуу тал",
  available_from: "Орох боломжтой огноо",
};

/** Нэг мөрөнд нэгтгэх үнийн түлхүүрүүд («Үнэ: 350 сая ₮ · нийт · сар [Зөв]»). */
const PRICE_KEYS = ["price", "currency", "price_period", "price_basis"] as const;

export type ConfirmRow = {
  /** React key ба «Зөв» товчны тодорхойлогч. */
  id: string;
  /** crm2_confirm_property_fields-д дамжуулах түлхүүрүүд. */
  keys: string[];
  label: string;
  value: string;
};

export type ConfirmValueSource = {
  unconfirmed: readonly string[] | null;
  category: string | null;
  property_type: string | null;
  district: string | null;
  location_text: string | null;
  lat: number | null;
  area_m2: number | null;
  rooms: number | null;
  floor: number | null;
  building_floors: number | null;
  price: number | null;
  currency: string | null;
  price_period: string | null;
  price_basis: string | null;
  year_in_use: number | null;
  features: readonly string[] | null;
  parking_spaces: number | null;
  rent_advance_months: number | null;
  rent_deposit_months: number | null;
  advantages: string | null;
  available_from: string | null;
};

export type ConfirmLabelers = {
  category?: (key: string) => string;
  propertyType?: (key: string) => string;
  feature?: (key: string) => string;
  projectName?: string | null;
};

const EMPTY = "—";

function short(text: string | null | undefined, max = 80): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return EMPTY;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function num(n: number | null | undefined, unit = ""): string {
  if (n == null || !Number.isFinite(Number(n))) return EMPTY;
  return `${groupDigits(Number(n))}${unit}`;
}

/** 350000000 → «350 000 000» (Intl-ээс хамааралгүй, тест тогтвортой). */
export function groupDigits(n: number): string {
  if (!Number.isFinite(n)) return EMPTY;
  const neg = n < 0;
  const [int, frac] = String(Math.abs(n)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

function priceText(p: ConfirmValueSource): string {
  if (p.price == null) return EMPTY;
  const sym = p.currency === "USD" ? CURRENCY_SYMBOL.USD : CURRENCY_SYMBOL.MNT;
  const parts = [`${groupDigits(Number(p.price))} ${sym}`];
  if (p.price_basis && p.price_basis in PRICE_BASIS_LABEL) {
    parts.push(PRICE_BASIS_LABEL[p.price_basis as keyof typeof PRICE_BASIS_LABEL].toLowerCase());
  }
  if (p.price_period && p.price_period in PRICE_PERIOD_LABEL) {
    parts.push(PRICE_PERIOD_LABEL[p.price_period as keyof typeof PRICE_PERIOD_LABEL].toLowerCase());
  }
  return parts.join(" · ");
}

function valueOf(key: string, p: ConfirmValueSource, l: ConfirmLabelers): string {
  switch (key) {
    case "category":
      return p.category ? (l.category?.(p.category) ?? p.category) : EMPTY;
    case "property_type":
      return p.property_type ? (l.propertyType?.(p.property_type) ?? p.property_type) : EMPTY;
    case "project":
      return short(l.projectName);
    case "district":
      return short(p.district);
    case "location_text":
      return short(p.location_text);
    case "advantages":
      return short(p.advantages);
    case "lat":
      return p.lat != null ? "Цэг тавьсан" : EMPTY;
    case "area_m2":
      return num(p.area_m2, " м²");
    case "rooms":
      return num(p.rooms);
    case "floor":
      return num(p.floor);
    case "building_floors":
      return num(p.building_floors);
    case "year_in_use":
      return p.year_in_use != null ? String(p.year_in_use) : EMPTY;
    case "parking_spaces":
      return num(p.parking_spaces);
    case "rent_advance_months":
      return num(p.rent_advance_months, " сар");
    case "rent_deposit_months":
      return num(p.rent_deposit_months, " сар");
    case "features": {
      const list = (p.features ?? []).map((f) => l.feature?.(f) ?? f);
      return list.length ? short(list.join(", "), 120) : EMPTY;
    }
    case "available_from":
      return p.available_from ? p.available_from.slice(0, 10).replace(/-/g, ".") : EMPTY;
    default:
      return EMPTY;
  }
}

/**
 * Нийтлэхийг хааж буй баталгаажаагүй утгууд (PUBLISH_CONFIRM_KEYS ∩ unconfirmed, тэр дарааллаар).
 * Үнийн 4 түлхүүр нэг мөрөнд («Зөв» нэг дор баталгаажуулна).
 */
export function unconfirmedRows(p: ConfirmValueSource, labelers: ConfirmLabelers = {}): ConfirmRow[] {
  const u = new Set(p.unconfirmed ?? []);
  const rows: ConfirmRow[] = [];
  let priceAdded = false;
  for (const key of PUBLISH_CONFIRM_KEYS) {
    if (!u.has(key)) continue;
    if ((PRICE_KEYS as readonly string[]).includes(key)) {
      if (priceAdded) continue;
      priceAdded = true;
      rows.push({
        id: "price",
        keys: PRICE_KEYS.filter((k) => u.has(k)),
        label: "Үнэ",
        value: priceText(p),
      });
      continue;
    }
    rows.push({ id: key, keys: [key], label: CONFIRM_KEY_LABEL[key], value: valueOf(key, p, labelers) });
  }
  return rows;
}

// ── Ялгаа (эх зар ↔ нийтлэх утга) ──────────────────────────────────────────

export type DiffRow = {
  key: string;
  label: string;
  /** Эх зарын одоогийн утга (шинэ зар бол null). */
  current: string | null;
  /** Нийтэлсний дараах утга. */
  next: string;
  changed: boolean;
};

function str(v: Json | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function numOrNull(v: Json | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Онцлогийг FEATURE_KEYS дарааллаар нэрлэнэ (дараалал ялгаанд нөлөөлөхгүй). */
function featuresText(list: readonly unknown[] | null | undefined): string {
  const set = new Set((list ?? []).filter((x): x is string => typeof x === "string"));
  const known = FEATURE_KEYS.filter((k) => set.has(k)).map((k: FeatureKey) => FEATURE_LABEL[k]);
  return known.length ? known.join(", ") : EMPTY;
}

function textOrDash(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t ? t : EMPTY;
}

function areaText(n: number | null): string {
  return n == null || n <= 0 ? EMPTY : `${groupDigits(n)} м²`;
}

function countText(n: number | null): string {
  return n == null ? EMPTY : groupDigits(n);
}

function monthsText(n: number | null): string {
  return n == null ? EMPTY : `${n} сар`;
}

function moneyText(n: number | null): string {
  return n == null || n <= 0 ? EMPTY : `${groupDigits(n)} ₮`;
}

function floorText(s: string | null): string {
  return !s || s === "-" ? EMPTY : s;
}

/**
 * Нийтийн талбарын ялгаа. candidate байхгүй (шинэ зар) бол current = null.
 * Гарчиг, тайлбар ОРНО: эх зарыг шинэчлэхэд хоосон оролт = эх зарын текст хэвээр.
 */
export function publishDiffRows(
  preview: Pick<Crm2PublishPreview, "payload" | "link_candidate">,
  opts: {
    choice: PublishChoice;
    title: string;
    description: string;
    defaultTitle: string;
    defaultDescription: string;
    replacePhotos: boolean;
    /** CRM-д байгаа зургийн тоо (зард хамгийн ихдээ 30). */
    imageCount: number;
  }
): DiffRow[] {
  const pl = preview.payload ?? {};
  const c = opts.choice === "link" ? preview.link_candidate : null;
  const texts = effectiveTexts(opts.choice, opts, {
    candidate: c,
    defaultTitle: opts.defaultTitle,
    defaultDescription: opts.defaultDescription,
  });
  const isRent = str(pl.deal_type) === "rent";
  const hasPin = numOrNull(pl.lat) != null && numOrNull(pl.lng) != null;
  const photosNext = c && !opts.replacePhotos ? c.photo_count : Math.min(Math.max(opts.imageCount, 0), 30);
  const payloadFeatures = Array.isArray(pl.features) ? pl.features : [];

  const rows: { key: string; label: string; current: string | null; next: string; show?: boolean }[] = [
    { key: "title", label: "Гарчиг", current: c ? textOrDash(c.title) : null, next: textOrDash(texts.title) },
    { key: "description", label: "Танилцуулга", current: c ? textOrDash(c.description) : null, next: textOrDash(texts.description) },
    { key: "type", label: "Төрөл", current: c ? textOrDash(c.type) : null, next: textOrDash(str(pl.type)) },
    { key: "district", label: "Дүүрэг", current: c ? textOrDash(c.district) : null, next: textOrDash(str(pl.district) === "-" ? null : str(pl.district)) },
    { key: "price", label: isRent ? "Үнэ (сард)" : "Үнэ", current: c ? moneyText(c.price) : null, next: moneyText(numOrNull(pl.price)) },
    { key: "area", label: "Талбай", current: c ? areaText(c.area) : null, next: areaText(numOrNull(pl.area)) },
    { key: "rooms", label: "Өрөө", current: c ? countText(c.rooms || null) : null, next: countText(numOrNull(pl.rooms) || null) },
    { key: "floor", label: "Давхар", current: c ? floorText(c.floor) : null, next: floorText(str(pl.floor)) },
    { key: "year", label: "Ашиглалтад орсон он", current: c ? countText(c.year) : null, next: countText(numOrNull(pl.year)) },
    { key: "parking", label: "Зогсоол", current: c ? countText(c.parking) : null, next: countText(numOrNull(pl.parking)) },
    { key: "features", label: "Онцлог", current: c ? featuresText(c.features) : null, next: featuresText(payloadFeatures) },
    {
      key: "rent_advance_months",
      label: "Урьдчилгаа",
      current: c ? monthsText(c.rent_advance_months) : null,
      next: monthsText(numOrNull(pl.rent_advance_months)),
      show: isRent || c?.rent_advance_months != null,
    },
    {
      key: "rent_deposit_months",
      label: "Барьцаа",
      current: c ? monthsText(c.rent_deposit_months) : null,
      next: monthsText(numOrNull(pl.rent_deposit_months)),
      show: isRent || c?.rent_deposit_months != null,
    },
    {
      key: "location",
      label: "Газрын зураг дээрх цэг",
      current: c ? (c.has_location ? "Байгаа" : "Байхгүй") : null,
      next: hasPin ? "Байгаа" : "Байхгүй",
    },
    {
      key: "status",
      label: "Зарын төлөв",
      current: c ? listingStatusLabel(c.status) : null,
      next: listingStatusLabel(str(pl.status) ?? "active"),
    },
    { key: "photos", label: "Зураг", current: c ? String(c.photo_count) : null, next: String(photosNext) },
  ];

  return rows
    .filter((r) => r.show !== false)
    .map(({ key, label, current, next }) => ({ key, label, current, next, changed: current === null || current !== next }));
}

/** Өөрчлөгдөх мөрийг эхэнд, өөрчлөгдөхгүйг тусад нь (утсан дээр эвхэгдэнэ). */
export function splitDiff(rows: readonly DiffRow[]): { changed: DiffRow[]; same: DiffRow[] } {
  return { changed: rows.filter((r) => r.changed), same: rows.filter((r) => !r.changed) };
}

/** Эх зарын текстэд утас нуусан тэмдэг байгаа эсэх (холбоход нэг удаа нуугдана). */
export function hasMaskedPhone(text: string | null | undefined): boolean {
  return typeof text === "string" && text.includes("•••• ••••");
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

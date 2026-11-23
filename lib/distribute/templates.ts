/**
 * R10 — Facebook / Viber / unegui.mn-д хуулж тавих бэлэн текст. ЦЭВЭР модуль.
 * Зөвхөн нийтийн талбар (гарчиг, үнэ, дүүрэг, өрөө, талбай, давхар, төрөл,
 * тохижилт, тайлбарын хэсэг, агентын нийтийн нэр/утас). Эзний утас, нарийн хаяг,
 * CRM талбар ОРОХГҮЙ. Тайлбараас монгол утасны дугаарыг арилгана. Эможи хэрэглэхгүй.
 */
import { fmtMNT } from "@/lib/format";
import { rentTermLabel } from "@/lib/constants";
import { clip } from "@/lib/seo/site";

import type { ShareChannel, ShareTexts } from "./types";

export type ShareTextInput = {
  title: string;
  price: number | null;
  dealType: string | null;
  type: string | null;
  district: string | null;
  rooms: number | null;
  area: number | null;
  floor: string | null;
  amenities: string[] | null;
  description: string | null;
  rentAdvanceMonths: number | null;
  rentDepositMonths: number | null;
  agentName: string | null;
  agentPhone: string | null;
  officeName: string | null;
};

/**
 * Монгол 8 оронтой (6–9-өөр эхэлсэн) утас, +976 угтвартай/угтваргүй, «9911 2233»,
 * «9911-2233». Үнэ (₮, төг, сая, тэрбум, mnt, $ дагасан), олон оронтой тоо, «тоот 12-345»-ийг
 * хөндөхгүй.
 */
export const PHONE_RE =
  /(?<![\d.,])(?:\+?976[\s-]?)?[6-9]\d{3}[\s-]?\d{4}(?!\d|\s*(?:₮|төг|сая|тэрбум|mnt|\$))/giu;

export function scrubPhones(s: string): string {
  return s.replace(PHONE_RE, "").replace(/\s{2,}/g, " ").trim();
}

export const EXCERPT_MAX = 300;
export const VIBER_MAX = 700;
export const UNEGUI_TITLE_MAX = 70;
const AMENITIES_MAX = 5;

const isText = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "";

function clean(s: string | null | undefined): string | null {
  if (!isText(s)) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t && t !== "undefined" && t !== "null" ? t : null;
}

export function excerpt(description: string | null | undefined, max = EXCERPT_MAX): string {
  const d = clean(description);
  return d ? clip(scrubPhones(d), max) : "";
}

function isRent(i: ShareTextInput) {
  return i.dealType === "rent";
}

function priceText(i: ShareTextInput): string | null {
  if (i.price == null || !Number.isFinite(Number(i.price)) || Number(i.price) <= 0) return null;
  return fmtMNT(Number(i.price)) + (isRent(i) ? "/сар" : "");
}

function factsLine(i: ShareTextInput): string {
  const floor = clean(i.floor);
  return [
    i.rooms != null && Number(i.rooms) > 0 ? `${i.rooms} өрөө` : null,
    i.area != null && Number(i.area) > 0 ? `${i.area} м²` : null,
    floor && floor !== "-" ? `${floor} давхар` : null,
    clean(i.type),
  ]
    .filter(Boolean)
    .join(" · ");
}

function rentTerms(i: ShareTextInput): string | null {
  if (!isRent(i) || i.rentAdvanceMonths == null || i.rentDepositMonths == null) return null;
  return `Түрээсийн нөхцөл: ${rentTermLabel(i.rentAdvanceMonths, i.rentDepositMonths)}`;
}

function amenitiesLine(i: ShareTextInput): string | null {
  const list = (i.amenities ?? []).map(clean).filter((a): a is string => !!a).slice(0, AMENITIES_MAX);
  return list.length ? `Тохижилт: ${list.join(", ")}` : null;
}

function contactLine(i: ShareTextInput): string | null {
  const name = clean(i.agentName);
  const office = clean(i.officeName);
  const phone = clean(i.agentPhone);
  const who = [name, office ? `(${office})` : null].filter(Boolean).join(" ");
  const parts = [who || null, phone].filter(Boolean).join(", ");
  return parts ? `Холбогдох: ${parts}` : null;
}

function headline(i: ShareTextInput): string {
  const verb = isRent(i) ? "Түрээслүүлнэ" : "Зарна";
  const title = clean(i.title) ?? "Үл хөдлөх хөрөнгө";
  return `${verb}: ${title}`;
}

function hashtag(s: string | null | undefined): string | null {
  const t = clean(s)?.replace(/[^\p{L}\p{N}]+/gu, "");
  return t ? `#${t}` : null;
}

const lines = (xs: (string | null | undefined | false)[]) =>
  xs.filter((x): x is string => typeof x === "string" && x !== "").join("\n");

function facebookText(i: ShareTextInput, link: string): string {
  const price = priceText(i);
  const district = clean(i.district);
  const facts = factsLine(i);
  const ex = excerpt(i.description);
  const tags = [
    "#Нэми",
    "#ҮлХөдлөх",
    isRent(i) ? "#Түрээс" : "#Зарна",
    hashtag(district),
    hashtag(i.type),
  ].filter(Boolean);

  const head = lines([
    headline(i),
    price ? `Үнэ: ${price}` : null,
    district ? `Байршил: ${district}` : null,
    facts || null,
    rentTerms(i),
    amenitiesLine(i),
  ]);
  return [head, ex, lines([`Дэлгэрэнгүй, зураг: ${link}`, contactLine(i)]), [...new Set(tags)].join(" ")]
    .filter((b) => b !== "")
    .join("\n\n");
}

function viberText(i: ShareTextInput, link: string): string {
  const price = priceText(i);
  const district = clean(i.district);
  const facts = factsLine(i);
  const top = lines([
    headline(i),
    [price, district].filter(Boolean).join(" · ") || null,
    facts || null,
    rentTerms(i),
  ]);
  const tail = lines([link, contactLine(i)]);
  const base = `${top}\n\n${tail}`;
  // Тайлбарын хэсгийг багтах хэмжээгээр л оруулна; холбоос үргэлж үлдэнэ.
  const room = VIBER_MAX - base.length - 2;
  const ex = room > 40 ? excerpt(i.description, Math.min(200, room)) : "";
  const full = ex ? `${top}\n\n${ex}\n\n${tail}` : base;
  return full.length <= VIBER_MAX ? full : `${clip(top, Math.max(20, VIBER_MAX - tail.length - 2))}\n\n${tail}`;
}

function uneguiTexts(i: ShareTextInput, link: string): ShareTexts["unegui"] {
  const district = clean(i.district);
  const facts = factsLine(i);
  const titleParts = [clean(i.title) ?? headline(i)];
  const title = clip(titleParts.join(" "), UNEGUI_TITLE_MAX);
  const price = i.price != null && Number(i.price) > 0 ? String(Math.round(Number(i.price))) : "";
  const ex = excerpt(i.description);
  const body = [
    lines([
      district ? `Байршил: ${district}` : null,
      facts || null,
      rentTerms(i),
      amenitiesLine(i),
    ]),
    ex,
    lines([`Дэлгэрэнгүй, зураг: ${link}`, contactLine(i)]),
  ]
    .filter((b) => b !== "")
    .join("\n\n");
  return { title, price, body };
}

export function buildShareTexts(i: ShareTextInput, links: Record<ShareChannel, string>): ShareTexts {
  return {
    facebook: facebookText(i, links.facebook),
    viber: viberText(i, links.viber),
    unegui: uneguiTexts(i, links.unegui),
  };
}

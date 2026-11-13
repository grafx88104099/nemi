import { isoToUbInput, isIsoDate, daysUntil } from "@/lib/crm2/datetime";
import {
  DEAL_STAGE_LABEL,
  MANUAL_DEAL_STAGES,
  PROPERTY_STATUS_ACTION_LABEL,
  PROPERTY_TRANSITIONS,
  categoryLabel,
  statusChangeNeedsReason,
  type Crm2Tone,
} from "@/lib/crm2/labels";
import { formatMoney } from "@/lib/crm2/money";
import type { HistoryLookup } from "@/lib/crm2/history";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type {
  Crm2BrokerageStatus,
  Crm2DealStage,
  Crm2PhoneMatch,
  Crm2PricePeriod,
  Crm2PropertyCategory,
  Crm2PropertyStatus,
} from "@/lib/crm2/types";

/**
 * Хөрөнгийн карт (S03), дуудлагын цонх (S04), үзүүлэлт (S05), хэлцлийн хуудасны
 * цэвэр логик — UI-гүй, тестлэгдэнэ. Эрхийн эцсийн шалгалт DB дээр; энд зөвхөн
 * ямар товч/сонголт харуулахыг шийднэ.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** searchParams-ийн нэг утга (массив бол эхнийх). */
export function firstParam(v: string | string[] | undefined | null): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ── ?offer_for=<contact>&origin=<deal> ─────────────────────────────────────

export type OfferParams = { contactId: string | null; originDealId: string | null };

/**
 * Цуцлагдсан хэлцлийн дараа «Өөр Staff санал болгох» холбоосын параметр.
 * Буруу (uuid биш) утгыг үл тооно.
 */
export function parseOfferParams(sp: Record<string, string | string[] | undefined>): OfferParams {
  const contact = firstParam(sp.offer_for);
  const origin = firstParam(sp.origin);
  return {
    contactId: isUuid(contact) ? contact : null,
    originDealId: isUuid(origin) ? origin : null,
  };
}

// ── S04: дугаараар олдсон харилцагчийг юу хийх ─────────────────────────────

export type PhoneMatchAction =
  /** Энэ хөрөнгө дээр нээлттэй хэлцэл байна — дуудлага тэр хэлцэлд нэмэгдэнэ. */
  | { kind: "use_deal"; dealId: string; dealCode: string; stage: Crm2DealStage | null }
  /** Энэ хөрөнгө дээрх хэлцлийг өөр агент хариуцдаг — бүртгэхгүй, хэлцэл шилжүүлэх хүсэлт. */
  | { kind: "deal_transfer"; dealId: string; dealCode: string; agentName: string | null }
  /** Харах эрхтэй харилцагч — дуудлага хадгалахад шинэ хэлцэл нээгдэнэ. */
  | { kind: "use_contact" }
  /** Өөр агентын харилцагч, тохиргоо зөвшөөрдөг — хэлцэл таны нэр дээр нээгдэнэ. */
  | { kind: "use_foreign" }
  /** Өөр агентын харилцагч — бүртгэхгүй, харилцагч шилжүүлэх хүсэлт. */
  | { kind: "contact_transfer" };

export function classifyPhoneMatch(
  m: Pick<
    Crm2PhoneMatch,
    "can_open" | "property_deal_id" | "property_deal_code" | "property_deal_stage" | "property_deal_agent_name" | "property_deal_can_log"
  >,
  opts: { foreignDeal: "deny" | "allow" }
): PhoneMatchAction {
  if (m.property_deal_id) {
    if (m.property_deal_can_log) {
      return { kind: "use_deal", dealId: m.property_deal_id, dealCode: m.property_deal_code ?? "", stage: m.property_deal_stage };
    }
    return {
      kind: "deal_transfer",
      dealId: m.property_deal_id,
      dealCode: m.property_deal_code ?? "",
      agentName: m.property_deal_agent_name,
    };
  }
  if (m.can_open) return { kind: "use_contact" };
  if (opts.foreignDeal === "allow") return { kind: "use_foreign" };
  return { kind: "contact_transfer" };
}

/** Энэ үйлдлээр дуудлага шууд бүртгэж болох эсэх. */
export function canLogWith(action: PhoneMatchAction): boolean {
  return action.kind === "use_deal" || action.kind === "use_contact" || action.kind === "use_foreign";
}

// ── Хөрөнгийн төлөв ────────────────────────────────────────────────────────

export type StatusOption = { value: Crm2PropertyStatus; label: string; needsReason: boolean };

/** Одоогийн төлөвөөс шилжиж болох төлвүүд (DB-ийн transition_ok-той ижил). */
export function propertyStatusOptions(current: Crm2PropertyStatus): StatusOption[] {
  return (PROPERTY_TRANSITIONS[current] ?? []).map((to) => ({
    value: to,
    label: PROPERTY_STATUS_ACTION_LABEL[to] ?? to,
    needsReason: statusChangeNeedsReason(current, to),
  }));
}

// ── Хэлцлийн шат ───────────────────────────────────────────────────────────

/** 2-р шатанд (хэлцлийн гэрээ, төлбөр) нээгдэх шат — одоо идэвхгүй харуулна. */
export const STAGE_TWO_STAGES: Crm2DealStage[] = ["documents", "awaiting_payment"];

export type StageOption = { value: Crm2DealStage; label: string; disabled: boolean; hint: string | null };

/**
 * Гараар сонгох шатууд. «Үзүүлсэн / Дахин үзэх» — бодит үзүүлэлттэй үед,
 * «Үзүүлэхээр товлосон» — товлосон үзүүлэлттэй үед; баримт/төлбөрийн шат 2-р шатанд.
 */
export function dealStageOptions(
  current: Crm2DealStage,
  facts: { hasScheduledShowing: boolean; hasShownShowing: boolean }
): StageOption[] {
  const manual: StageOption[] = MANUAL_DEAL_STAGES.map((s) => {
    let hint: string | null = null;
    if ((s === "shown" || s === "reshow") && !facts.hasShownShowing) hint = "Бодитоор үзүүлсэн бүртгэл хэрэгтэй";
    if (s === "showing_scheduled" && !facts.hasScheduledShowing) hint = "Товлосон үзүүлэлт хэрэгтэй";
    return { value: s, label: DEAL_STAGE_LABEL[s], disabled: s === current || hint !== null, hint };
  });
  const later: StageOption[] = STAGE_TWO_STAGES.map((s) => ({
    value: s,
    label: DEAL_STAGE_LABEL[s],
    disabled: true,
    hint: "Хэлцлийн гэрээ, төлбөрийн хэсэг нээгдэхэд",
  }));
  return [...manual, ...later];
}

// ── Зуучлалын гэрээ ────────────────────────────────────────────────────────

export type BrokerageFlags = {
  status: Crm2BrokerageStatus;
  canEditDraft: boolean;
  canAttach: boolean;
  canDecide: boolean;
  canTerminate: boolean;
  canRenew: boolean;
};

export type BrokerageActionSet = {
  edit: boolean;
  submit: boolean;
  discard: boolean;
  upload: boolean;
  deleteFile: boolean;
  withdraw: boolean;
  approve: boolean;
  reject: boolean;
  terminate: boolean;
  renew: boolean;
};

/** Гэрээний төлөв ба эрхээр харуулах үйлдэл. */
export function brokerageActions(b: BrokerageFlags, opts: { fileCount?: number; maxFiles?: number } = {}): BrokerageActionSet {
  const draft = b.status === "draft";
  const pending = b.status === "pending";
  const active = b.status === "active";
  const roomForFiles = opts.maxFiles === undefined || (opts.fileCount ?? 0) < opts.maxFiles;
  return {
    edit: draft && b.canEditDraft,
    submit: draft && b.canEditDraft,
    discard: draft && b.canEditDraft,
    upload: (draft || pending || active) && b.canAttach && roomForFiles,
    deleteFile: draft && b.canEditDraft,
    withdraw: pending && b.canEditDraft,
    approve: pending && b.canDecide,
    reject: pending && b.canDecide,
    terminate: active && b.canTerminate,
    renew: (active || b.status === "expired") && b.canRenew,
  };
}

const LIVE_BROKERAGE: Crm2BrokerageStatus[] = ["draft", "pending", "active"];

type ChainItem = {
  id?: string;
  status: Crm2BrokerageStatus;
  previous_id?: string | null;
  version?: number;
  created_at?: string;
};

/**
 * Сунгах ёстой дууссан гэрээ: «дууссан» бөгөөд цуцлагдаагүй сунгалтын хувилбаргүй
 * (хамгийн шинэ нь). Байвал шинэ гэрээг «Сунгах»-аар үүсгэнэ — хуучин хувилбартай холбогдоно.
 */
export function renewableExpired<T extends ChainItem>(contracts: T[]): T | null {
  const succeeded = new Set(contracts.filter((c) => c.previous_id && c.status !== "terminated").map((c) => c.previous_id));
  const list = contracts.filter((c) => c.status === "expired" && !(c.id && succeeded.has(c.id)));
  list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return list[0] ?? null;
}

/**
 * Холбоогүй шинэ гэрээ нэмэх: засах эрхтэй, ноорог/илгээсэн/батлагдсан гэрээ байхгүй,
 * сунгах ёстой дууссан гэрээ ч байхгүй үед (байвал засах эсвэл «Сунгах» — хувилбарын гинж тасрахгүй).
 */
export function canCreateBrokerage(contracts: ChainItem[], canEditProperty: boolean): boolean {
  return canEditProperty && !contracts.some((c) => LIVE_BROKERAGE.includes(c.status)) && !renewableExpired(contracts);
}

/** Хувилбарын гинж: хуучнаас шинэ рүү (version, үүсгэсэн огноогоор). */
export function brokerageChain<T extends { id: string; version: number; created_at: string }>(contracts: T[]): T[] {
  return [...contracts].sort((a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at));
}

/** Гэрээ дуусах хүртэлх хоног ба өнгө (≤7 улаан, ≤30 шар). */
export function brokerageEndInfo(
  endDate: string | null | undefined,
  now: number = Date.now()
): { days: number; tone: Crm2Tone; text: string } | null {
  if (!endDate || !isIsoDate(endDate)) return null;
  const days = daysUntil(endDate, now);
  if (days === null) return null;
  if (days < 0) return { days, tone: "rose", text: `${Math.abs(days)} хоногийн өмнө дууссан` };
  if (days === 0) return { days, tone: "rose", text: "Өнөөдөр дуусна" };
  return { days, tone: days <= 7 ? "rose" : days <= 30 ? "amber" : "green", text: `${days} хоног үлдсэн` };
}

/** Эзэнтэй сүүлд тулгаснаас хойшхи хоног (≥90 шар — шинэчлэх хэрэгтэй). */
export function verifiedAge(lastVerifiedAt: string | null | undefined, now: number = Date.now()): { days: number; stale: boolean } | null {
  if (!lastVerifiedAt) return null;
  const t = Date.parse(lastVerifiedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  return { days, stale: days >= 90 };
}

// ── Огноо, цаг (маягт) ─────────────────────────────────────────────────────

/** «2026-11-13» + «14:30» → «2026-11-13T14:30» (УБ); дутуу/буруу бол null. */
export function combineUbDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
  const d = (date ?? "").trim();
  const t = (time ?? "").trim();
  if (!isIsoDate(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
  return `${d}T${t}`;
}

/**
 * «Үзүүлсэн» гэж бүртгэх цагийн анхны утга: товлосон цаг өнгөрсөн бол түүнийг,
 * эс бөгөөс одоог санал болгоно. Агент засаж бодит цагаа оруулна — автоматаар
 * товлосон цагийг бодит гэж тооцохгүй.
 */
export function defaultShownAt(scheduledAt: string | null | undefined, now: number = Date.now()): string {
  const t = scheduledAt ? Date.parse(scheduledAt) : NaN;
  return isoToUbInput(!Number.isNaN(t) && t <= now ? t : now);
}

// ── Дуудлага/үзүүлэлтийн мөрийн засах эрх (карт дээр) ──────────────────────

/** Мөрийн гүйцэтгэгч өөрөө эсвэл хэлцлийг засах эрхтэй (DB эцэслэн шалгана). */
export function activityEditable(
  row: { agent_id: string; deal_id: string; voided_at: string | null },
  me: string | null,
  editableDeals: Record<string, boolean>
): boolean {
  if (row.voided_at) return false;
  return (!!me && row.agent_id === me) || !!editableDeals[row.deal_id];
}

// ── Шаардлагын товч текст ──────────────────────────────────────────────────

const PERIOD_SUFFIX: Record<Crm2PricePeriod, string> = { total: "", month: "/сар", day: "/өдөр" };

export type RequirementLike = {
  purpose?: string | null;
  category?: Crm2PropertyCategory | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  price_period?: Crm2PricePeriod | null;
  districts?: string[] | null;
  locations?: string[] | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  area_min?: number | null;
  area_max?: number | null;
};

function range(min: number | null | undefined, max: number | null | undefined, fmt: (n: number) => string): string | null {
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `${fmt(min)}-аас дээш`;
  if (max != null) return `${fmt(max)} хүртэл`;
  return null;
}

/** «Түрээслэх · 1,500,000–2,000,000₮/сар · Хан-Уул · 2–3 өрөө». */
export function requirementSummary(
  r: RequirementLike,
  categoryLabels?: Partial<Record<string, string>> | null
): string {
  const parts: string[] = [];
  if (r.purpose?.trim()) parts.push(r.purpose.trim());
  if (r.category) parts.push(categoryLabel(r.category, categoryLabels));
  const cur = r.currency ?? "MNT";
  const budget = range(r.budget_min, r.budget_max, (n) => formatMoney(n, cur));
  if (budget) parts.push(`${budget}${r.price_period ? PERIOD_SUFFIX[r.price_period] : ""}`);
  const places = [...(r.districts ?? []), ...(r.locations ?? [])].filter((x) => x?.trim());
  if (places.length) parts.push(places.slice(0, 3).join(", ") + (places.length > 3 ? "…" : ""));
  const rooms = range(r.rooms_min, r.rooms_max, String);
  if (rooms) parts.push(`${rooms} өрөө`);
  const area = range(r.area_min, r.area_max, String);
  if (area) parts.push(`${area} м²`);
  return parts.join(" · ") || "Шаардлага";
}

// ── Түүхийн lookup ─────────────────────────────────────────────────────────

/** HistoryList-д: агентын нэр, тохиргооны жагсаалт, холбоосын нэр. */
export function buildHistoryLookup(
  settings: Pick<Crm2Settings, "property.types" | "property.features" | "deal.cancel_reasons" | "property.category_labels">,
  names: Record<string, string>,
  refs: Record<string, string> = {}
): HistoryLookup {
  return {
    names,
    types: settings["property.types"],
    features: settings["property.features"],
    cancelReasons: settings["deal.cancel_reasons"],
    categoryLabels: settings["property.category_labels"],
    refs,
  };
}

// ── Google Maps холбоос ────────────────────────────────────────────────────

export function mapsHref(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

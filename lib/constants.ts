/**
 * Төвлөрсөн enum/тэмдэглэгээ — зарын төлөв ба лидийн шат.
 * Өмнө нь эдгээр нь хэд хэдэн файлд давхардаж, зөрж байсныг нэгтгэв.
 */

// ── Зарын төлөв ───────────────────────────────────────────
export const LISTING_STATUSES = ["active", "draft", "review", "sold"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type StatusTone = "green" | "neutral" | "amber" | "rose";

export const LISTING_STATUS: Record<ListingStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  draft: { label: "Ноорог", tone: "neutral" },
  review: { label: "Хянуулж буй", tone: "amber" },
  sold: { label: "Зарагдсан", tone: "rose" },
};

/** Агент гараар сонгож болох төлвүүд (review нь системийн урсгал тул орохгүй ч засвар хийхэд харагдана). */
export const LISTING_STATUS_OPTIONS: ListingStatus[] = ["active", "draft", "review", "sold"];

// ── Лидийн шат ────────────────────────────────────────────
export const LEAD_STAGES = ["new", "contacted", "viewing", "offer", "closed", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "Шинэ",
  contacted: "Холбогдсон",
  viewing: "Үзлэг",
  offer: "Санал",
  closed: "Хаасан",
  lost: "Алдсан",
};

/**
 * Юүлүүр (pipeline) дэх идэвхтэй шатууд — терминал «lost»-ийг
 * багана болгон харуулахгүй (зөвхөн select-ээр тохируулна).
 */
export const LEAD_PIPELINE: LeadStage[] = ["new", "contacted", "viewing", "offer", "closed"];

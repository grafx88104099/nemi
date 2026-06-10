/**
 * Төвлөрсөн enum/тэмдэглэгээ — зарын төлөв ба лидийн шат.
 * Өмнө нь эдгээр нь хэд хэдэн файлд давхардаж, зөрж байсныг нэгтгэв.
 */

// ── Зарын төлөв ───────────────────────────────────────────
export const LISTING_STATUSES = ["active", "draft", "review", "sold"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type StatusTone = "green" | "neutral" | "amber" | "rose" | "blue" | "brand";

export const LISTING_STATUS: Record<ListingStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  draft: { label: "Ноорог", tone: "neutral" },
  review: { label: "Хянуулж буй", tone: "amber" },
  sold: { label: "Зарагдсан", tone: "rose" },
};

/** Агент гараар сонгож болох төлвүүд (review нь системийн урсгал тул орохгүй ч засвар хийхэд харагдана). */
export const LISTING_STATUS_OPTIONS: ListingStatus[] = ["active", "draft", "review", "sold"];

// ── Үл хөдлөхийн төрөл ба дүүрэг (форм + шүүлт + нүүр хуудас нэг эх сурвалж) ──
export const PROPERTY_TYPES = ["Орон сууц", "Хаус", "Газар", "Оффис", "Худалдааны талбай"] as const;
export const DISTRICTS = ["Сүхбаатар", "Чингэлтэй", "Хан-Уул", "Баянгол", "Сонгинохайрхан", "Баянзүрх", "Налайх"] as const;

// ── Гүйлгээний төрөл (худалдах / түрээс) ──────────────────
export const DEAL_TYPES = ["sale", "rent"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  sale: "Худалдах",
  rent: "Түрээс",
};

// ── Түрээсийн төлбөрийн нөхцөл (X+Y) ──────────────────────
// X = урьдчилж төлөх түрээсийн сар, Y = барьцааны сар.
export const RENT_TERM_PRESETS: { advance: number; deposit: number }[] = [
  { advance: 1, deposit: 1 },
  { advance: 2, deposit: 1 },
  { advance: 3, deposit: 1 },
  { advance: 6, deposit: 1 },
  { advance: 1, deposit: 2 },
];

/** "1+1" хэлбэрийн товч тэмдэглэгээ. */
export const rentTermCode = (advance: number, deposit: number) => `${advance}+${deposit}`;

/** "1 сар түрээс + 1 сар барьцаа" хэлбэрийн дэлгэрэнгүй тайлбар. */
export const rentTermLabel = (advance: number, deposit: number) =>
  `${advance} сар түрээс + ${deposit} сар барьцаа`;

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

// ── Лидийн эх сурвалж ─────────────────────────────────────
export const LEAD_SOURCES = ["website", "facebook", "instagram", "google", "referral", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Вэбсайт",
  facebook: "Фэйсбүүк",
  instagram: "Инстаграм",
  google: "Гүүгл",
  referral: "Санал болголт",
  other: "Бусад",
};

// ── Үйл явдлын төрөл (дуудлага/ярианы лог) ────────────────
export const ACTIVITY_KINDS = ["call", "meeting", "message", "note", "viewing", "email"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  call: "Дуудлага",
  meeting: "Уулзалт",
  message: "Мессеж",
  note: "Тэмдэглэл",
  viewing: "Үзлэг",
  email: "Имэйл",
};

// ── Төсөл (үйлчлүүлэгчийн гэрээ) ───────────────────────────
export const PROJECT_TYPES = ["buy", "sell", "rent_out", "rent_in"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  buy: "Худалдан авах",
  sell: "Зарах",
  rent_out: "Түрээслүүлэх",
  rent_in: "Түрээслэх",
};

export const PROJECT_STATUSES = ["active", "on_hold", "won", "lost"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  on_hold: { label: "Хүлээгдэж буй", tone: "amber" },
  won: { label: "Амжилттай", tone: "blue" },
  lost: { label: "Алдсан", tone: "rose" },
};

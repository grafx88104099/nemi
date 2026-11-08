/**
 * Хэлцлийн урсгалын цэвэр логик (§6.13–§6.17) — DB-гүй, тестлэгдэнэ.
 * Босго бүр crm_settings 'deal_flow'-оос (normalizeDealFlow); DB талын
 * RPC/trigger эцсийн үнэн, энд UI-д урьдчилан харуулах, маягт шалгах.
 */

export type DealFlowConfig = {
  /** Асуусан үнээс энэ хувиас их буулт материаллаг — зөвшөөрөл шаардана (§6.16). */
  materialConcessionPct: number;
  concessionApproverRoles: string[];
  contractReviewerRoles: string[];
  /** Хүлээн зөвшөөрөлд файл эсвэл дэлгэрэнгүй тэмдэглэл заавал. */
  acceptanceEvidenceRequired: boolean;
  /** Саналын хүчинтэй хугацааны санал болгох хоног. */
  offerValidDaysDefault: number;
  priceAnalysisMinComparables: number;
  /** Шатанд удсан дохионы хоног: { default, <stage_code>: n } (R28). */
  stageStaleDays: Record<string, number>;
  feeInvoiceRequired: boolean;
  handoverOffsetDaysDefault: number;
  exportRoles: string[];
};

/** Анхдагч утга — 20261107000800 migration-ы 'deal_flow'-тэй ижил. */
export const DEFAULT_DEAL_FLOW: DealFlowConfig = {
  materialConcessionPct: 5,
  concessionApproverRoles: ["sales_director", "ceo"],
  contractReviewerRoles: ["ops_qc", "sales_director"],
  acceptanceEvidenceRequired: true,
  offerValidDaysDefault: 3,
  priceAnalysisMinComparables: 3,
  stageStaleDays: { default: 14, new: 3, contacted: 5, offer: 7, negotiation: 10 },
  feeInvoiceRequired: true,
  handoverOffsetDaysDefault: 7,
  exportRoles: ["sales_director", "ops_qc", "finance", "ceo"],
};

/** Хүлээн зөвшөөрлийн тэмдэглэлийн доод урт (DB-ийн crm_decide_offer-тэй ижил). */
export const ACCEPTANCE_NOTE_MIN = 10;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function strArr(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : fallback;
}

/** Тохиргооны JSON → бүрэн тохиргоо (дутуу/буруу утга анхдагчаар). */
export function normalizeDealFlow(raw: unknown): DealFlowConfig {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_DEAL_FLOW;
  const staleRaw =
    r.stage_stale_days && typeof r.stage_stale_days === "object" && !Array.isArray(r.stage_stale_days)
      ? (r.stage_stale_days as Record<string, unknown>)
      : {};
  const stale: Record<string, number> = { ...d.stageStaleDays };
  for (const [k, v] of Object.entries(staleRaw)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) stale[k] = v;
  }
  return {
    materialConcessionPct: num(r.material_concession_pct, d.materialConcessionPct),
    concessionApproverRoles: strArr(r.concession_approver_roles, d.concessionApproverRoles),
    contractReviewerRoles: strArr(r.contract_reviewer_roles, d.contractReviewerRoles),
    acceptanceEvidenceRequired:
      typeof r.acceptance_evidence_required === "boolean" ? r.acceptance_evidence_required : d.acceptanceEvidenceRequired,
    offerValidDaysDefault: num(r.offer_valid_days_default, d.offerValidDaysDefault),
    priceAnalysisMinComparables: num(r.price_analysis_min_comparables, d.priceAnalysisMinComparables),
    stageStaleDays: stale,
    feeInvoiceRequired: typeof r.fee_invoice_required === "boolean" ? r.fee_invoice_required : d.feeInvoiceRequired,
    handoverOffsetDaysDefault: num(r.handover_offset_days_default, d.handoverOffsetDaysDefault),
    exportRoles: strArr(r.export_roles, d.exportRoles),
  };
}

// ── Огноо (YYYY-MM-DD, цагийн бүсгүй) ─────────────────────

function parseIso(d: string): number {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, day ?? 1);
}

export function isoAddDays(iso: string, days: number): string {
  return new Date(parseIso(iso) + days * 86400000).toISOString().slice(0, 10);
}

export function isoDiffDays(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 86400000);
}

// ── Үнийн санал (§6.16) ───────────────────────────────────

/** Асуусан үнээс хэдэн хувийн буулт (сөрөг бол 0). */
export function concessionPct(asking: number | null | undefined, amount: number): number | null {
  if (!asking || asking <= 0 || !Number.isFinite(amount)) return null;
  const pct = ((asking - amount) * 100) / asking;
  return Math.max(0, Math.round(pct * 100) / 100);
}

export function needsConcessionApproval(pct: number | null | undefined, cfg: DealFlowConfig): boolean {
  return (pct ?? 0) > cfg.materialConcessionPct;
}

export type OfferStatus = "open" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export type OfferLite = {
  status: OfferStatus;
  valid_until: string | null;
  concession_pct: number | null;
  approval_status: ApprovalStatus;
};

/** Дэлгэцэд харуулах төлөв: хугацаа өнгөрсөн нээлттэй санал → «Хугацаа дууссан». */
export function effectiveOfferStatus(o: Pick<OfferLite, "status" | "valid_until">, todayIso: string): OfferStatus {
  if ((o.status === "open" || o.status === "countered") && o.valid_until && o.valid_until < todayIso) {
    return "expired";
  }
  return o.status;
}

export type AcceptCheck =
  | { ok: true }
  | { ok: false; reason: "not_open" | "expired" | "approval_required" | "approval_pending" | "approval_rejected" };

/** Хүлээн зөвшөөрөх боломжтой эсэх (DB-ийн crm_decide_offer-ийн урьдчилсан шалгалт). */
export function canAcceptOffer(o: OfferLite, cfg: DealFlowConfig, todayIso: string): AcceptCheck {
  if (o.status !== "open") return { ok: false, reason: "not_open" };
  if (o.valid_until && o.valid_until < todayIso) return { ok: false, reason: "expired" };
  if (needsConcessionApproval(o.concession_pct, cfg)) {
    if (o.approval_status === "pending") return { ok: false, reason: "approval_pending" };
    if (o.approval_status === "rejected") return { ok: false, reason: "approval_rejected" };
    if (o.approval_status !== "approved") return { ok: false, reason: "approval_required" };
  }
  return { ok: true };
}

/** Хүлээн зөвшөөрлийн нотолгоо хангалттай эсэх. */
export function acceptanceEvidenceOk(cfg: DealFlowConfig, hasDoc: boolean, note: string | null | undefined): boolean {
  if (!cfg.acceptanceEvidenceRequired) return true;
  return hasDoc || (note ?? "").trim().length >= ACCEPTANCE_NOTE_MIN;
}

export function defaultOfferValidUntil(todayIso: string, cfg: DealFlowConfig): string {
  return isoAddDays(todayIso, cfg.offerValidDaysDefault);
}

/** Саналыг хүлээн авснаас бүртгэсэн хүртэлх саатал (цаг). */
export function relayDelayHours(receivedAt: string | null, relayedAt: string | null): number | null {
  if (!receivedAt || !relayedAt) return null;
  const ms = Date.parse(relayedAt) - Date.parse(receivedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 360000) / 10);
}

// ── Үзлэг (§6.15) ─────────────────────────────────────────

export type MatchStrength = "strong" | "possible" | "weak" | "none";
export type ShowingInterest = "interested" | "maybe" | "not_interested";
export type ShowingNextAction = "repeat_showing" | "offer" | "documents";

/** Сул эсвэл тохирлын тооцоогүй үзлэгт үндэслэл заавал. */
export function showingNeedsReason(strength: MatchStrength | null | undefined): boolean {
  return !strength || strength === "weak" || strength === "none";
}

export type ShowingFeedbackInput = {
  feedbackCategory: string | null | undefined;
  interest: ShowingInterest | null | undefined;
  nextAction: ShowingNextAction | null | undefined;
  nextStepDate: string | null | undefined;
};

/** Эргэх холбооны маягтын алдаа (хоосон бол зөв). */
export function showingFeedbackError(input: ShowingFeedbackInput, todayIso: string): string | null {
  if (!input.feedbackCategory) return "Эргэх холбооны ангиллыг сонгоно уу.";
  if (!input.interest) return "Харилцагчийн сонирхлыг сонгоно уу.";
  if (input.interest === "interested") {
    if (!input.nextAction) return "Сонирхсон бол дараагийн үйлдлийг сонгоно уу.";
    if (!input.nextStepDate) return "Дараагийн үйлдлийн огноог сонгоно уу.";
  }
  if (input.nextStepDate && input.nextStepDate < todayIso) return "Дараагийн үйлдлийн огноо өнгөрсөн байна.";
  return null;
}

/** Хийгдсэнээс хойш эргэх холбоо хүлээгдэж буй эсэх (цаг). */
export function showingFeedbackOverdue(
  doneAt: string | null,
  feedbackAt: string | null,
  now: Date,
  hours: number
): boolean {
  if (!doneAt || feedbackAt) return false;
  return now.getTime() - Date.parse(doneAt) > hours * 3600000;
}

// ── Карт дээрх заагч (R28) ────────────────────────────────

export type StageHealth = {
  daysInStage: number;
  staleLimit: number;
  stale: boolean;
  nextStepMissing: boolean;
  nextStepOverdueDays: number;
};

export function staleLimitFor(stageCode: string, cfg: DealFlowConfig): number {
  return cfg.stageStaleDays[stageCode] ?? cfg.stageStaleDays.default ?? DEFAULT_DEAL_FLOW.stageStaleDays.default;
}

/** Хоёр тусдаа дохио: дараагийн үйлдэл хэтэрсэн, шатанд удсан. */
export function stageHealth(
  input: { stageCode: string; stageEnteredAt: string; nextStepDate: string | null; open: boolean },
  todayIso: string,
  cfg: DealFlowConfig
): StageHealth {
  const daysInStage = Math.max(0, isoDiffDays(input.stageEnteredAt.slice(0, 10), todayIso));
  const staleLimit = staleLimitFor(input.stageCode, cfg);
  const overdue = input.nextStepDate && input.nextStepDate < todayIso ? isoDiffDays(input.nextStepDate, todayIso) : 0;
  return {
    daysInStage,
    staleLimit,
    stale: input.open && daysInStage > staleLimit,
    nextStepMissing: input.open && !input.nextStepDate,
    nextStepOverdueDays: input.open ? overdue : 0,
  };
}

// ── Үнийн дүн шинжилгээ (§6.14) ───────────────────────────

export type Comparable = { address: string; price: number; area_m2?: number | null; note?: string | null };

export function priceAnalysisError(
  comparables: Comparable[],
  recommended: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  cfg: DealFlowConfig
): string | null {
  const valid = comparables.filter((c) => c.address.trim() && c.price > 0);
  if (valid.length < cfg.priceAnalysisMinComparables) {
    return `Дор хаяж ${cfg.priceAnalysisMinComparables} жишиг объект оруулна уу.`;
  }
  if (!recommended || recommended <= 0) return "Санал болгох үнийг оруулна уу.";
  if (min != null && max != null && min > max) return "Үнийн муж буруу байна.";
  if (min != null && recommended < min) return "Санал болгох үнэ мужаас доогуур байна.";
  if (max != null && recommended > max) return "Санал болгох үнэ мужаас дээгүүр байна.";
  return null;
}

/** м² тутмын дундаж үнэ (жишигүүдээс). */
export function avgPricePerM2(comparables: Comparable[]): number | null {
  const rows = comparables.filter((c) => c.price > 0 && (c.area_m2 ?? 0) > 0);
  if (!rows.length) return null;
  const sum = rows.reduce((s, c) => s + c.price / (c.area_m2 as number), 0);
  return Math.round(sum / rows.length);
}

// ── Хаалтын босго (§6.17) ─────────────────────────────────

export type ClosingCheck = { code: string; label: string; ok: boolean; hint: string };

/** Босго бүрийг хэлцлийн хавтасны аль хэсэгт засах вэ. */
export const CLOSING_CHECK_TAB: Record<string, string> = {
  client_acceptance: "opportunity",
  contract: "contracts",
  payment: "payments",
  documents: "docs",
  fee: "payments",
  handover: "handover",
  crm: "parties",
  finance: "payments",
  post_sale: "overview",
  aml: "overview",
};

export function parseClosingChecks(raw: unknown): ClosingCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      code: String(x.code ?? ""),
      label: String(x.label ?? ""),
      ok: x.ok === true,
      hint: String(x.hint ?? ""),
    }))
    .filter((x) => x.code && x.label);
}

export function closingProgress(checks: ClosingCheck[]): { done: number; total: number; ready: boolean } {
  const done = checks.filter((c) => c.ok).length;
  return { done, total: checks.length, ready: checks.length > 0 && done === checks.length };
}

// ── Эрх ───────────────────────────────────────────────────

export function hasAnyRole(roles: readonly string[], allowed: readonly string[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

export function canExportDeals(roles: readonly string[], cfg: DealFlowConfig): boolean {
  return hasAnyRole(roles, cfg.exportRoles);
}

// ── Хэлцлийн төлбөрийн хуваарь ────────────────────────────

/** Хуваарийн мөрийн үлдэгдэл (төлбөр бүртгэхэд санал болгох дүн). */
export function scheduleRemaining(line: { amount: number; paid_amount: number }): number {
  return Math.max(0, Math.round((line.amount - line.paid_amount) * 100) / 100);
}

/** Сонгосон урсгал худалдан авагч тал уу, листинг уу. */
export function pipelineSide(code: string): "buyer" | "listing" {
  return code === "PL-2" ? "listing" : "buyer";
}

// ── Дэлгэцийн шошго (хэлцлийн урсгал) ─────────────────────

type Tone = "neutral" | "green" | "rose" | "amber" | "blue" | "brand";

export const OFFER_STATUS_LABEL: Record<OfferStatus, { label: string; tone: Tone }> = {
  open: { label: "Хариу хүлээгдэж буй", tone: "blue" },
  countered: { label: "Сөрөг санал ирсэн", tone: "amber" },
  accepted: { label: "Хүлээн зөвшөөрсөн", tone: "green" },
  rejected: { label: "Татгалзсан", tone: "rose" },
  withdrawn: { label: "Буцаасан", tone: "neutral" },
  expired: { label: "Хугацаа дууссан", tone: "neutral" },
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  not_required: { label: "Зөвшөөрөл шаардлагагүй", tone: "neutral" },
  pending: { label: "Буултын зөвшөөрөл хүлээгдэж буй", tone: "amber" },
  approved: { label: "Буулт батлагдсан", tone: "green" },
  rejected: { label: "Буултаас татгалзсан", tone: "rose" },
};

export const OFFER_SIDE_LABEL: Record<"buyer" | "seller", string> = {
  buyer: "Худалдан авагч / түрээслэгч тал",
  seller: "Өмчлөгч тал",
};

export const ACCEPTANCE_CHANNELS = ["in_person", "email", "message", "phone", "other"] as const;
export type AcceptanceChannel = (typeof ACCEPTANCE_CHANNELS)[number];
export const ACCEPTANCE_CHANNEL_LABEL: Record<AcceptanceChannel, string> = {
  in_person: "Биечлэн, гарын үсгээр",
  email: "Цахим шуудангаар",
  message: "Мессежээр",
  phone: "Утсаар",
  other: "Бусад",
};

export const SHOWING_STATUS_LABEL: Record<"scheduled" | "done" | "cancelled" | "no_show", { label: string; tone: Tone }> = {
  scheduled: { label: "Товлосон", tone: "blue" },
  done: { label: "Хийгдсэн", tone: "green" },
  cancelled: { label: "Цуцалсан", tone: "neutral" },
  no_show: { label: "Ирээгүй", tone: "rose" },
};

export const SHOWING_INTEREST_LABEL: Record<ShowingInterest, { label: string; tone: Tone }> = {
  interested: { label: "Сонирхсон", tone: "green" },
  maybe: { label: "Эргэлзэж байна", tone: "amber" },
  not_interested: { label: "Сонирхоогүй", tone: "rose" },
};

export const SHOWING_NEXT_ACTION_LABEL: Record<ShowingNextAction, string> = {
  repeat_showing: "Давтан үзлэг",
  offer: "Үнийн санал",
  documents: "Баримт бичгийн бүрдүүлэлт",
};

export const FEEDBACK_CATEGORIES = ["price", "location", "layout", "condition", "financing", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  price: "Үнэ",
  location: "Байршил",
  layout: "Зохион байгуулалт",
  condition: "Нөхцөл байдал",
  financing: "Санхүүжилт",
  other: "Бусад",
};

export const MATCH_STRENGTH_TEXT: Record<MatchStrength, string> = {
  strong: "Хүчтэй тохирол",
  possible: "Боломжит тохирол",
  weak: "Сул тохирол",
  none: "Тохирлын тооцоогүй",
};

export const PAYMENT_METHOD_LABEL: Record<"bank" | "cash" | "foreign" | "virtual" | "other", string> = {
  bank: "Банкны шилжүүлэг",
  cash: "Бэлэн мөнгө",
  foreign: "Гадаад валют",
  virtual: "Виртуал хөрөнгө",
  other: "Бусад",
};

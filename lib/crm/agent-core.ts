/**
 * Агентын өдөр тутмын CRM-ийн цэвэр логик (PRO-001 v2.1 §6.4, §6.7, §6.11,
 * §6.15, §6.26): үйл ажиллагааны бүртгэлийн дүрэм, түргэн бүртгэлийн
 * загвар, бүртгэгчийн эзэмшил, хэрэгцээний профайлын дутуу талбар, SLA
 * төлөв, чатаас наасан текстийг таних. DB / сервергүй — vitest-ээр шалгана.
 * Босго, хугацааг дуудагч тохиргооноос дамжуулна (энд зөвхөн fallback).
 */

import { recontactDays, DEFAULT_RECONTACT_RANGES, type RecontactRanges } from "@/lib/crm/scoring";
import { toIsoDate, ubHour } from "@/lib/crm/calendar";
import { normalizePhone, normalizeEmail } from "@/lib/crm/normalize";
import type { LeadGrade, CrmActivityChannel } from "@/lib/constants-crm";

// ── Хаалттай жагсаалтууд (DB CHECK-тэй ЯГ таарна) ─────────

/** §6.11 «Дараагийн үйлдэл» (+ §6.15 давтан үзлэг). */
export const NEXT_STEP_CODES = [
  "call",
  "send_options",
  "showing",
  "offer",
  "documents",
  "meeting",
  "repeat_showing",
  "other",
] as const;
export type NextStepCode = (typeof NEXT_STEP_CODES)[number];
export const NEXT_STEP_LABEL: Record<NextStepCode, string> = {
  call: "Залгах",
  send_options: "Сонголт илгээх",
  showing: "Үзлэг",
  offer: "Үнийн санал",
  documents: "Баримт бичиг",
  meeting: "Уулзалт",
  repeat_showing: "Давтан үзлэг",
  other: "Бусад",
};

/** §6.15: сонирхсон бол дараагийн үйлдэл эдгээрийн нэг. */
export const INTERESTED_NEXT_STEPS: readonly NextStepCode[] = ["repeat_showing", "offer", "documents"];

/** §6.11 сувгийн сонголт (даалгавар — системийн бүртгэл, сонголтод гарахгүй). */
export const UI_ACTIVITY_CHANNELS: readonly CrmActivityChannel[] = ["call", "chat", "email", "meeting", "showing"];

/** §6.11 зорилго (DB-д 'other' хуучин бүртгэлд үлдсэн, сонголтод гарахгүй). */
export const UI_ACTIVITY_PURPOSES = ["screening", "follow_up", "offer", "negotiation", "service"] as const;

export const SHOWING_INTERESTS = ["interested", "maybe", "not_fit"] as const;
export type ShowingInterest = (typeof SHOWING_INTERESTS)[number];
export const SHOWING_INTEREST_LABEL: Record<ShowingInterest, string> = {
  interested: "Сонирхсон",
  maybe: "Магадгүй",
  not_fit: "Тохироогүй",
};

export const MEETING_PARTIES = ["buyer", "seller", "tenant", "landlord", "other"] as const;
export type MeetingParty = (typeof MEETING_PARTIES)[number];
export const MEETING_PARTY_LABEL: Record<MeetingParty, string> = {
  buyer: "Худалдан авагч",
  seller: "Өмчлөгч (худалдагч)",
  tenant: "Түрээслэгч",
  landlord: "Түрээслүүлэгч",
  other: "Бусад",
};

export const PRIVACY_LEVELS = ["standard", "restricted"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];
export const PRIVACY_LEVEL_LABEL: Record<PrivacyLevel, string> = {
  standard: "Энгийн",
  restricted: "Хязгаарлагдмал (зөвхөн эрх бүхий зорилгоор)",
};

export const OCCUPANT_KINDS = ["household", "business"] as const;
export type OccupantKind = (typeof OCCUPANT_KINDS)[number];
export const OCCUPANT_KIND_LABEL: Record<OccupantKind, string> = {
  household: "Өрх",
  business: "Бизнес",
};

/** Өмчлөгчийн яаралтай эсэх (§6.2) — хаалттай сонголт. */
export const OWNER_URGENCIES = ["urgent", "within_3m", "flexible"] as const;
export type OwnerUrgency = (typeof OWNER_URGENCIES)[number];
export const OWNER_URGENCY_LABEL: Record<OwnerUrgency, string> = {
  urgent: "Яаралтай (1 сар дотор)",
  within_3m: "3 сарын дотор",
  flexible: "Яаралгүй",
};

// ── Огноо ─────────────────────────────────────────────────

/** Улаанбаатарын өнөөдрийн огноо (YYYY-MM-DD). */
export function ubToday(now: Date = new Date()): string {
  return toIsoDate(now);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Үйл ажиллагааны бүртгэлийн дүрэм (§6.1, §6.11, §6.15) ─

export type ActivityRuleInput = {
  channel: CrmActivityChannel;
  reached: boolean;
  summary: string;
  attitude: string | null;
  outcome: "open" | "advanced" | "lost" | "won";
  nextStepCode: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  occurredAt: string | null;
  showingInterest?: string | null;
  quickLog?: boolean;
};

export type ActivityRuleOptions = {
  now?: Date;
  /** Ирээдүйн бүртгэлийн хүлцэл (минут) — серверийн цагийн зөрүүнд. */
  futureToleranceMin?: number;
  /** Хураангуйн доод тэмдэгт (түргэн бүртгэлд хамаарахгүй). */
  summaryMinChars?: number;
};

/**
 * Бүртгэлийн дүрмийг шалгаж эхний зөрчлийн монгол мессежийг буцаана
 * (зөрчилгүй бол null). DB trigger давхар хамгаална.
 */
export function activityRuleError(input: ActivityRuleInput, opts: ActivityRuleOptions = {}): string | null {
  const now = opts.now ?? new Date();
  const tolerance = (opts.futureToleranceMin ?? 5) * 60000;
  const minChars = opts.summaryMinChars ?? 20;

  if (input.occurredAt) {
    const t = Date.parse(input.occurredAt);
    if (Number.isNaN(t)) return "Болсон огноо буруу байна.";
    if (t > now.getTime() + tolerance) return "Болсон огноо ирээдүйд байж болохгүй.";
  }
  const summary = input.summary.trim();
  if (!input.quickLog && summary.length < minChars) {
    return "Хураангуйг 2–5 өгүүлбэрээр бодитоор бичнэ үү.";
  }
  if (input.reached && input.channel !== "task" && !input.attitude) {
    return "Харилцагчийн хандлагыг сонгоно уу.";
  }
  const closing = input.outcome === "won" || input.outcome === "lost";
  if (!closing) {
    if (!input.nextStepCode || !input.nextStepDate) return "Дараагийн үйлдэл ба огноо заавал.";
    if (!input.nextStep?.trim()) return "Дараагийн үйлдлийг тодорхой бичнэ үү.";
  }
  if (input.nextStepDate) {
    if (Number.isNaN(Date.parse(input.nextStepDate))) return "Дараагийн үйлдлийн огноо буруу байна.";
    if (input.nextStepDate.slice(0, 10) < ubToday(now)) return "Дараагийн үйлдлийн огноо өнгөрсөн байж болохгүй.";
  }
  if (input.channel === "showing" && input.showingInterest === "interested") {
    if (!input.nextStepCode || !INTERESTED_NEXT_STEPS.includes(input.nextStepCode as NextStepCode)) {
      return "Харилцагч сонирхсон бол дараагийн үйлдэл нь давтан үзлэг, үнийн санал эсвэл баримт бичиг байна.";
    }
  }
  return null;
}

/** Дараагийн үйлдлийн кодыг текст болгох (чөлөөт тайлбар нэмэлтээр). */
export function nextStepText(code: NextStepCode, detail?: string | null): string {
  const d = detail?.trim();
  return d ? `${NEXT_STEP_LABEL[code]}: ${d}` : NEXT_STEP_LABEL[code];
}

// ── Түргэн бүртгэл (R5, UX-13) ────────────────────────────

export const QUICK_OUTCOMES = ["no_answer", "callback", "send_options", "showing_set", "not_ready"] as const;
export type QuickOutcome = (typeof QUICK_OUTCOMES)[number];
export const QUICK_OUTCOME_LABEL: Record<QuickOutcome, string> = {
  no_answer: "Холбогдож чадаагүй",
  callback: "Холбогдсон — дахин залгана",
  send_options: "Холбогдсон — сонголт илгээнэ",
  showing_set: "Үзлэг товлосон",
  not_ready: "Бэлэн биш — дараа холбогдоно",
};

export type QuickLogContext = {
  now?: Date;
  grade?: LeadGrade | null;
  /** Сэжим «Шинэ» бол зорилго = шалгаруулалт. */
  leadIsNew?: boolean;
  /** Хоёр дахь оролдлогын цонх (Д-03 тохиргоо, цаг). */
  retryHours?: number;
  ranges?: RecontactRanges;
};

export type QuickLogPayload = {
  channel: CrmActivityChannel;
  purpose: (typeof UI_ACTIVITY_PURPOSES)[number];
  reached: boolean;
  attitude: "positive" | "neutral" | "not_ready" | null;
  summary: string;
  nextStepCode: NextStepCode;
  nextStep: string;
  nextStepDate: string;
};

/**
 * Түргэн бүртгэлийн загвар: нэг товшилтоор үр дүн + бэлэн дараагийн
 * үйлдэл. «Холбогдож чадаагүй» нь SLA-г зогсоохгүй (reached=false) бөгөөд
 * хоёр дахь оролдлогыг retryHours цонхонд товлоно.
 */
export function quickLogPayload(outcome: QuickOutcome, ctx: QuickLogContext = {}): QuickLogPayload {
  const now = ctx.now ?? new Date();
  const today = ubToday(now);
  const purpose = ctx.leadIsNew ? "screening" : "follow_up";
  const grade = ctx.grade ?? null;
  const ranges = ctx.ranges ?? DEFAULT_RECONTACT_RANGES;
  const recontact = (g: LeadGrade) => addDaysIso(today, recontactDays(g, null, ranges));

  switch (outcome) {
    case "no_answer": {
      const retryHours = ctx.retryHours && ctx.retryHours > 0 ? ctx.retryHours : 24;
      // Ажлын өдрийн оройноос хойш бол маргааш, эс бөгөөс өнөөдөр (цонх дотор).
      const retryAt = new Date(now.getTime() + Math.min(retryHours, 24) * 3600000);
      const date = ubHour(now) >= 17 ? toIsoDate(retryAt) : today;
      return {
        channel: "call",
        purpose,
        reached: false,
        attitude: null,
        summary: "Залгасан боловч холбогдож чадаагүй. Өөр цагт дахин оролдоно.",
        nextStepCode: "call",
        nextStep: "Залгах: хоёр дахь оролдлого",
        nextStepDate: date,
      };
    }
    case "callback":
      return {
        channel: "call",
        purpose,
        reached: true,
        attitude: "neutral",
        summary: "Харилцагчтай холбогдож ярилцсан. Тохирсон хугацаанд дахин залгахаар болсон.",
        nextStepCode: "call",
        nextStep: "Залгах",
        nextStepDate: grade ? recontact(grade) : addDaysIso(today, 1),
      };
    case "send_options":
      return {
        channel: "call",
        purpose,
        reached: true,
        attitude: "positive",
        summary: "Харилцагчтай холбогдож хэрэгцээг тодруулсан. Тохирох сонголтуудыг илгээхээр тохирсон.",
        nextStepCode: "send_options",
        nextStep: "Сонголт илгээх",
        nextStepDate: addDaysIso(today, 1),
      };
    case "showing_set":
      return {
        channel: "call",
        purpose: "follow_up",
        reached: true,
        attitude: "positive",
        summary: "Харилцагчтай холбогдож үзлэгийн цаг тохирсон.",
        nextStepCode: "showing",
        nextStep: "Үзлэг",
        nextStepDate: addDaysIso(today, 1),
      };
    case "not_ready":
      return {
        channel: "call",
        purpose,
        reached: true,
        attitude: "not_ready",
        summary: "Харилцагчтай холбогдсон, одоогоор шийдвэр гаргахад бэлэн биш байна. Дараа эргэн холбогдоно.",
        nextStepCode: "call",
        nextStep: "Залгах: эргэн холбогдох",
        nextStepDate: recontact(grade === "a" || grade === "b" ? "c" : (grade ?? "c")),
      };
  }
}

// ── Бүртгэгчийн эзэмшил (§6.26) ───────────────────────────

/** Бүртгэгч өөрөө эзэмшигч болох эх сурвалжууд (тохиргоогоор дарж болно). */
export const DEFAULT_REGISTRAR_SOURCES = ["referral", "personal_network", "prospecting", "listing_inquiry"] as const;

export function registrarOwnsLead(
  sourceCode: string | null | undefined,
  configured?: unknown,
  registrarIsAgent = true
): boolean {
  if (!sourceCode || !registrarIsAgent) return false;
  const list =
    Array.isArray(configured) && configured.every((x) => typeof x === "string")
      ? (configured as string[])
      : (DEFAULT_REGISTRAR_SOURCES as readonly string[]);
  return list.includes(sourceCode);
}

// ── Хэрэгцээний профайлын дутуу талбар (§6.7) ─────────────

export type ProfileFieldsInput = {
  profileType?: string | null;
  goalId?: string | null;
  locations?: unknown[] | null;
  propertyTypes?: string[] | null;
  budgetMin?: number | null;
  budgetTarget?: number | null;
  budgetMax?: number | null;
  financing?: string | null;
  roomsMin?: number | null;
  areaMin?: number | null;
  conditions?: string[] | null;
  timeline?: string | null;
  moveInDate?: string | null;
  mustHaves?: unknown[] | null;
  dealBreakers?: unknown[] | null;
  decisionMakerId?: string | null;
  decisionMaker?: string | null;
  blockerId?: string | null;
  blocker?: string | null;
  occupantKind?: string | null;
};

const has = (v: unknown) =>
  v != null && (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : true);

/** Дутуу заавал талбаруудын шошго — картанд «юуг нөхөх» жагсаалт. */
export function profileMissingFields(p: ProfileFieldsInput, mustHavesMin = 3): string[] {
  const out: string[] = [];
  const tenant = p.profileType === "tenant";
  if (!has(p.goalId)) out.push("Зорилго");
  if (!has(p.locations)) out.push("Сонирхсон байршил");
  if (!has(p.propertyTypes)) out.push("Үл хөдлөхийн төрөл");
  if (tenant) {
    if (!has(p.budgetMax)) out.push("Сарын төсөв");
  } else {
    if (!has(p.budgetMin)) out.push("Доод төсөв");
    if (!has(p.budgetTarget)) out.push("Зорилтот төсөв");
    if (!has(p.budgetMax)) out.push("Дээд төсөв");
  }
  if (!has(p.financing)) out.push("Санхүүжилт");
  if (!has(p.roomsMin) && !has(p.areaMin)) out.push("Өрөө эсвэл талбай");
  if (!has(p.timeline)) out.push("Хугацаа");
  if (tenant && !has(p.moveInDate)) out.push("Орох огноо");
  if (tenant && !has(p.occupantKind)) out.push("Өрх буюу бизнесийн хэрэгцээ");
  const must = Array.isArray(p.mustHaves) ? p.mustHaves.length : 0;
  if (must < mustHavesMin) out.push(`Заавал байх шаардлага (${must}/${mustHavesMin})`);
  if (!has(p.decisionMakerId) && !has(p.decisionMaker)) out.push("Шийдвэр гаргагч");
  if (!has(p.blockerId) && !has(p.blocker)) out.push("Одоогийн саад");
  return out;
}

/** §6.5: ангиллын жишиг хугацаа ба профайлын хугацаа зөрвөл анхааруулга. */
const GRADE_TIMELINES: Record<LeadGrade, string[]> = {
  a: ["0_30"],
  b: ["1_3m"],
  c: ["3_12m"],
  d: ["12m_plus"],
};

export function gradeTimelineMismatch(grade: LeadGrade | null, timeline: string | null | undefined): boolean {
  if (!grade || !timeline) return false;
  return !GRADE_TIMELINES[grade].includes(timeline);
}

// ── SLA төлөв (§6.4) — жагсаалт, картын тэмдэг ────────────

export type LeadSlaState =
  | { kind: "met" }
  | { kind: "waiting"; minutesLeft: number }
  | { kind: "breached"; minutesOver: number }
  | { kind: "no_contact"; hours: number }
  | { kind: "none" };

export function leadSlaState(
  lead: {
    status: string;
    first_contact_at: string | null;
    first_contact_due_at: string | null;
    received_at?: string | null;
    created_at: string;
  },
  now: Date = new Date(),
  noContactHours = 48
): LeadSlaState {
  if (lead.first_contact_at) return { kind: "met" };
  if (lead.status !== "new" && lead.status !== "active") return { kind: "none" };
  const start = Date.parse(lead.received_at ?? lead.created_at);
  if (!Number.isNaN(start) && now.getTime() - start >= noContactHours * 3600000) {
    return { kind: "no_contact", hours: noContactHours };
  }
  if (!lead.first_contact_due_at) return { kind: "none" };
  const due = Date.parse(lead.first_contact_due_at);
  const diffMin = Math.round((due - now.getTime()) / 60000);
  return diffMin >= 0 ? { kind: "waiting", minutesLeft: diffMin } : { kind: "breached", minutesOver: -diffMin };
}

export function slaStateLabel(s: LeadSlaState): { label: string; tone: "green" | "amber" | "rose" | "neutral" } | null {
  switch (s.kind) {
    case "met":
      return { label: "Холбогдсон", tone: "green" };
    case "waiting":
      return {
        label: s.minutesLeft >= 120 ? `Эхний холболт: ${Math.round(s.minutesLeft / 60)} цаг үлдсэн` : `Эхний холболт: ${s.minutesLeft} мин үлдсэн`,
        tone: "amber",
      };
    case "breached":
      return { label: "Эхний холболтын хугацаа хэтэрсэн", tone: "rose" };
    case "no_contact":
      return { label: `${s.hours} цагт холбогдоогүй`, tone: "rose" };
    default:
      return null;
  }
}

// ── Чатаас наах (R18) ─────────────────────────────────────

export type PastedLead = {
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Facebook/Messenger-ээс ирсэн шинж тэмдэг байвал. */
  channelHint: string | null;
  note: string;
};

const PHONE_RE = /(?:\+?976[\s-]?)?(?<!\d)([89765]\d{3})[\s-]?(\d{4})(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NAME_PREFIX_RE = /^(нэр|name)\s*[:：-]\s*/i;

/**
 * Messenger, чатаас хуулсан текстээс утас, и-мэйл, нэрийг таньж богино
 * маягтыг урьдчилан бөглөнө. Танигдаагүй бол null — агент гараар нөхнө.
 */
export function parsePastedLead(text: string): PastedLead {
  const raw = (text ?? "").replace(/\r/g, "").trim();
  const phoneMatch = PHONE_RE.exec(raw);
  const phone = phoneMatch ? normalizePhone(`${phoneMatch[1]}${phoneMatch[2]}`) || null : null;
  const emailMatch = EMAIL_RE.exec(raw);
  const email = emailMatch ? normalizeEmail(emailMatch[0]) || null : null;

  let firstName: string | null = null;
  let lastName: string | null = null;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const nameLine = lines.find((l) => NAME_PREFIX_RE.test(l)) ?? lines.find((l) => !/\d|@|http/i.test(l) && l.length <= 60);
  if (nameLine) {
    const words = nameLine.replace(NAME_PREFIX_RE, "").split(/\s+/).filter((w) => /^[\p{L}.-]+$/u.test(w));
    if (words.length === 1) firstName = words[0];
    else if (words.length >= 2) {
      lastName = words[0];
      firstName = words.slice(1, 3).join(" ");
    }
  }
  const channelHint = /facebook|messenger|fb\.com|m\.me\//i.test(raw)
    ? "Facebook / Messenger"
    : /instagram/i.test(raw)
      ? "Instagram"
      : null;
  return { phone, email, firstName, lastName, channelHint, note: raw.slice(0, 500) };
}

// ── Хуучин leads-ийн шилжүүлэлт ───────────────────────────

/** Хуучин lead.stage → CRM сэжимийн төлөв (scripts/migrate-legacy-leads.mjs-тэй ижил). */
export function legacyStageToLifecycle(stage: string | null | undefined): "new" | "active" | "inactive" {
  switch (stage) {
    case "contacted":
    case "viewing":
    case "offer":
      return "active";
    case "closed":
    case "lost":
      return "inactive";
    default:
      return "new";
  }
}
